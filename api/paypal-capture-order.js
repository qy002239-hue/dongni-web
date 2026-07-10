import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import {
  getPayPalPlan,
  parseCustomId,
  paypalApiRequest,
  requestPayPalAccessToken
} from './_paypal.js';
import { grantCreditsForApprovedPayment } from './_payment-grant.js';

export const config = { runtime: 'nodejs' };

function resolveAllowedOrigin(req) {
  const requestOrigin = String(req.headers.origin || '').trim();
  const configured = [process.env.PUBLIC_SITE_URL, process.env.APP_URL]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (!requestOrigin) return configured[0] || '';
  if (!configured.length) return requestOrigin;
  return configured.includes(requestOrigin) ? requestOrigin : configured[0];
}

function applyCorsHeaders(req, res) {
  const origin = resolveAllowedOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getFirstCapture(orderData) {
  return orderData?.purchase_units?.[0]?.payments?.captures?.[0] || null;
}

function mapCaptureErrorStatus(error) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  if (message.includes('does not belong')) return 403;
  if (message.includes('orderid is required')) return 400;
  if (message.includes('unknown plan')) return 400;
  if (message.includes('cannot be captured')) return 409;
  if (message.includes('登入') || message.includes('login') || message.includes('token')) return 401;
  return 500;
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  try {
    const body = parseJsonBody(req);
    const orderId = String(body.orderId || '').trim();
    if (!orderId) {
      return jsonError(res, 400, 'orderId is required.');
    }

    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const accessToken = await requestPayPalAccessToken();

    const orderResult = await paypalApiRequest(`/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      accessToken
    });

    if (!orderResult.ok || !orderResult.data) {
      const detail = orderResult.data?.message || orderResult.rawText || 'Unable to read PayPal order.';
      return jsonError(res, 502, detail);
    }

    const unit = orderResult.data?.purchase_units?.[0] || {};
    const customInfo = parseCustomId(unit.custom_id);
    const planId = String(unit.reference_id || customInfo?.plan || '').trim();
    const plan = getPayPalPlan(planId);

    if (!plan) {
      return jsonError(res, 400, 'PayPal order has unknown plan.');
    }

    if (customInfo?.userId && customInfo.userId !== user.id) {
      return jsonError(res, 403, 'This order does not belong to the current user.');
    }

    const canCapture = ['APPROVED', 'COMPLETED'].includes(String(orderResult.data.status || '').toUpperCase());
    if (!canCapture) {
      return jsonError(res, 409, `Order status ${orderResult.data.status || 'UNKNOWN'} cannot be captured.`);
    }

    let captureOrderData = orderResult.data;

    if (String(orderResult.data.status || '').toUpperCase() !== 'COMPLETED') {
      const captureResult = await paypalApiRequest(`/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        accessToken,
        headers: {
          'PayPal-Request-Id': `capture-${orderId}`
        },
        body: {}
      });

      if (!captureResult.ok || !captureResult.data) {
        const detail = captureResult.data?.details?.[0]?.description
          || captureResult.data?.message
          || captureResult.rawText
          || 'Unable to capture PayPal order.';
        return jsonError(res, 502, detail);
      }

      captureOrderData = captureResult.data;
    }

    const capture = getFirstCapture(captureOrderData);
    const captureId = String(capture?.id || '').trim();
    if (!captureId) {
      return jsonError(res, 502, 'PayPal capture id is missing.');
    }

    const grant = await grantCreditsForApprovedPayment(supabase, {
      userId: user.id,
      plan: plan.id,
      orderId,
      captureId,
      amount: String(capture?.amount?.value || plan.amount),
      currency: String(capture?.amount?.currency_code || plan.currency)
    });

    if (!grant.ok) {
      return jsonError(res, grant.status || 500, grant.error || 'Failed to grant credits.');
    }

    return res.status(200).json({
      granted: !grant.duplicate,
      duplicate: grant.duplicate,
      credits: grant.duplicate ? 0 : plan.credits,
      orderId,
      captureId,
      plan: plan.id,
      status: captureOrderData.status || 'COMPLETED'
    });
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Unable to confirm PayPal payment.';
    return jsonError(res, mapCaptureErrorStatus(error), message);
  }
}
