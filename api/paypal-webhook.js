import { getSupabaseAdmin } from './_supabase.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import {
  getPayPalPlan,
  parseCustomId,
  paypalApiRequest,
  readPayPalHeaders,
  requestPayPalAccessToken
} from './_paypal.js';
import { grantCreditsForApprovedPayment } from './_payment-grant.js';
import { finalizeWebhookEvent, registerWebhookEvent } from './_webhook-events.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getOrderIdFromEvent(eventBody) {
  const resource = eventBody?.resource || {};
  const directOrderId = String(resource?.id || '').trim();
  const relatedOrderId = String(resource?.supplementary_data?.related_ids?.order_id || '').trim();

  if (String(eventBody?.event_type || '').toUpperCase() === 'CHECKOUT.ORDER.COMPLETED') {
    return directOrderId;
  }

  return relatedOrderId || directOrderId;
}

function eventNeedsCreditGrant(eventType) {
  const normalized = String(eventType || '').toUpperCase();
  return normalized === 'CHECKOUT.ORDER.COMPLETED' || normalized === 'PAYMENT.CAPTURE.COMPLETED';
}

function buildPayPalWebhookEventKey(eventBody, orderId = '') {
  const eventId = String(eventBody?.id || '').trim();
  if (eventId) return `paypal:${eventId}`;
  const eventType = String(eventBody?.event_type || '').trim();
  const resourceId = String(eventBody?.resource?.id || '').trim();
  return `paypal:fallback:${eventType}:${orderId}:${resourceId}`;
}

async function verifyWebhookSignature(accessToken, webhookEvent, req) {
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
  if (!webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID is required for paypal-webhook endpoint.');
  }

  const headers = readPayPalHeaders(req);
  const missingHeader = Object.values(headers).some((value) => !value);
  if (missingHeader) {
    return { ok: false, message: 'Missing PayPal webhook signature headers.' };
  }

  const verifyResult = await paypalApiRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    accessToken,
    body: {
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent
    }
  });

  if (!verifyResult.ok) {
    return {
      ok: false,
      message: verifyResult.data?.message || verifyResult.rawText || 'PayPal webhook verification failed.'
    };
  }

  const status = String(verifyResult.data?.verification_status || '').toUpperCase();
  if (status !== 'SUCCESS') {
    return { ok: false, message: `Invalid webhook signature (${status || 'UNKNOWN'}).` };
  }

  return { ok: true, message: '' };
}

function getFirstCapture(orderData) {
  return orderData?.purchase_units?.[0]?.payments?.captures?.[0] || null;
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  try {
    const eventBody = parseJsonBody(req);
    if (!eventBody || typeof eventBody !== 'object') {
      return jsonError(res, 400, 'Invalid webhook body.');
    }

    const accessToken = await requestPayPalAccessToken();
    const verify = await verifyWebhookSignature(accessToken, eventBody, req);
    if (!verify.ok) {
      return jsonError(res, 400, verify.message || 'Webhook signature verification failed.');
    }

    const eventType = String(eventBody.event_type || '').trim();
    const preOrderId = getOrderIdFromEvent(eventBody);
    const eventKey = buildPayPalWebhookEventKey(eventBody, preOrderId);
    const supabase = getSupabaseAdmin();
    const webhookEvent = await registerWebhookEvent(supabase, {
      provider: 'paypal',
      eventKey,
      eventType,
      source: 'paypal-webhook',
      orderId: preOrderId,
      captureId: String(eventBody?.resource?.id || '').trim(),
      payload: eventBody
    });

    if (!webhookEvent.ok) {
      return jsonError(res, 500, webhookEvent.error || 'Unable to record webhook event.');
    }

    if (webhookEvent.duplicate) {
      return res.status(200).json({ ok: true, duplicateEvent: true, eventType });
    }

    if (!eventNeedsCreditGrant(eventType)) {
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'ignored',
        orderId: preOrderId,
        captureId: String(eventBody?.resource?.id || '').trim()
      });
      return res.status(200).json({ ok: true, ignored: true, eventType });
    }

    const orderId = getOrderIdFromEvent(eventBody);
    if (!orderId) {
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'failed',
        errorMessage: 'Webhook event does not include order id.'
      });
      return jsonError(res, 400, 'Webhook event does not include order id.');
    }

    const orderResult = await paypalApiRequest(`/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      accessToken
    });

    if (!orderResult.ok || !orderResult.data) {
      const detail = orderResult.data?.message || orderResult.rawText || 'Unable to read PayPal order.';
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'failed',
        errorMessage: detail,
        orderId
      });
      return jsonError(res, 502, detail);
    }

    const unit = orderResult.data?.purchase_units?.[0] || {};
    const customInfo = parseCustomId(unit.custom_id);
    const planId = String(unit.reference_id || customInfo?.plan || '').trim();
    const plan = getPayPalPlan(planId);

    if (!plan) {
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'failed',
        errorMessage: 'PayPal order has unknown plan.',
        orderId
      });
      return jsonError(res, 400, 'PayPal order has unknown plan.');
    }

    const userId = String(customInfo?.userId || '').trim();
    if (!userId) {
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'failed',
        errorMessage: 'PayPal order custom_id is missing user id.',
        orderId
      });
      return jsonError(res, 400, 'PayPal order custom_id is missing user id.');
    }

    const capture = getFirstCapture(orderResult.data);
    const captureId = String(capture?.id || '').trim() || String(eventBody?.resource?.id || '').trim();
    if (!captureId) {
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'failed',
        errorMessage: 'PayPal capture id is missing.',
        orderId
      });
      return jsonError(res, 400, 'PayPal capture id is missing.');
    }

    const grant = await grantCreditsForApprovedPayment(supabase, {
      userId,
      plan: plan.id,
      orderId,
      captureId,
      amount: String(capture?.amount?.value || plan.amount),
      currency: String(capture?.amount?.currency_code || plan.currency)
    });

    if (!grant.ok) {
      await finalizeWebhookEvent(supabase, eventKey, {
        status: 'failed',
        errorMessage: grant.error || 'Failed to grant credits.',
        orderId,
        captureId
      });
      return jsonError(res, grant.status || 500, grant.error || 'Failed to grant credits.');
    }

    await finalizeWebhookEvent(supabase, eventKey, {
      status: grant.duplicate ? 'duplicate' : 'processed',
      orderId,
      captureId
    });

    return res.status(200).json({
      ok: true,
      duplicate: grant.duplicate,
      granted: !grant.duplicate,
      plan: plan.id,
      orderId,
      captureId,
      eventType
    });
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Unable to process PayPal webhook.';
    return jsonError(res, 500, message);
  }
}
