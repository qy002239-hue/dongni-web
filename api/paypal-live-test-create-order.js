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

function createRequestId() {
  return `dongni-live-test-${Date.now()}`;
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
  const amount = String(body?.amount || '1.00').trim();
  const currency = String(body?.currency || 'TWD').trim().toUpperCase();
  const packageName = String(body?.packageName || 'LIVE PayPal real payment test').trim();

  try {
    const accessToken = await requestPayPalAccessToken();

    const createResult = await paypalApiRequest('/v2/checkout/orders', {
      method: 'POST',
      accessToken,
      headers: {
        'PayPal-Request-Id': createRequestId()
      },
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'live-paypal-test',
            custom_id: JSON.stringify({ source: 'paypal-live-test-page' }),
            amount: {
              currency_code: currency,
              value: amount
            },
            description: packageName
          }
        ],
        application_context: {
          user_action: 'PAY_NOW'
        }
      }
    });

    if (!createResult.ok) {
      const detail = createResult.data?.details?.[0]?.description
        || createResult.data?.message
        || createResult.rawText
        || 'Unable to create LIVE PayPal test order.';
      return jsonError(res, 502, detail);
    }

    return res.status(200).json({
      ok: true,
      orderId: createResult.data?.id || null,
      status: createResult.data?.status || null,
      amount,
      currency,
      packageName
    });
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Unable to create LIVE PayPal test order.';
    return jsonError(res, 500, message);
  }
}
