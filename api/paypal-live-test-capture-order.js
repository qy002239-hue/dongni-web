import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import { normalizePayPalEnv, paypalApiRequest, requestPayPalAccessToken } from './_paypal.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function validateLiveEnv() {
  const paypalEnv = normalizePayPalEnv(process.env.PAYPAL_ENV);
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();

  const issues = [];
  if (paypalEnv !== 'live') issues.push('PAYPAL_ENV must be live.');
  if (!clientId) issues.push('PAYPAL_CLIENT_ID is missing.');
  if (!clientSecret) issues.push('PAYPAL_CLIENT_SECRET is missing.');

  return { ok: issues.length === 0, issues };
}

function resolveCapture(orderData) {
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

  const envValidation = validateLiveEnv();
  if (!envValidation.ok) {
    return jsonError(res, 503, `LIVE PayPal test is blocked: ${envValidation.issues.join(' ')}`);
  }

  const body = parseJsonBody(req);
  const orderId = String(body?.orderId || '').trim();
  if (!orderId) {
    return jsonError(res, 400, 'orderId is required.');
  }

  try {
    const accessToken = await requestPayPalAccessToken();

    const captureResult = await paypalApiRequest(`/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      accessToken,
      body: {}
    });

    if (!captureResult.ok) {
      const detail = captureResult.data?.details?.[0]?.description
        || captureResult.data?.message
        || captureResult.rawText
        || 'Unable to capture LIVE PayPal test order.';
      return jsonError(res, 502, detail);
    }

    const capture = resolveCapture(captureResult.data);

    return res.status(200).json({
      ok: true,
      orderId: captureResult.data?.id || orderId,
      orderStatus: captureResult.data?.status || null,
      transactionId: String(capture?.id || '').trim() || null,
      captureStatus: String(capture?.status || '').trim() || null,
      payerId: String(captureResult.data?.payer?.payer_id || '').trim() || null,
      payerEmail: String(captureResult.data?.payer?.email_address || '').trim() || null,
      payerName: [
        captureResult.data?.payer?.name?.given_name,
        captureResult.data?.payer?.name?.surname
      ].filter(Boolean).join(' ') || null,
      amount: capture?.amount || null,
      raw: captureResult.data || null
    });
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Unable to capture LIVE PayPal test order.';
    return jsonError(res, 500, message);
  }
}
