import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import { normalizePayPalEnv, paypalApiRequest, requestPayPalAccessToken } from './_paypal.js';
import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isProductionDeployment() {
  const value = String(process.env.VERCEL_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production';
}

async function ensureAuthenticatedUser(req) {
  const supabase = getSupabaseAdmin();
  await getAuthenticatedUser(req, supabase);
}

function maskClientId(clientId) {
  const value = String(clientId || '').trim();
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

function getAction(req) {
  const queryAction = String(req?.query?.action || '').trim().toLowerCase();
  if (queryAction) return queryAction;
  const body = req?.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return String(body.action || '').trim().toLowerCase();
  }
  return '';
}

function validateLiveEnv() {
  const paypalEnv = normalizePayPalEnv(process.env.PAYPAL_ENV);
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();

  const issues = [];
  if (paypalEnv !== 'live') issues.push('PAYPAL_ENV must be live for real payment testing.');
  if (!clientId) issues.push('PAYPAL_CLIENT_ID is missing.');
  if (!clientSecret) issues.push('PAYPAL_CLIENT_SECRET is missing.');

  return { ok: issues.length === 0, issues, paypalEnv, clientId, clientSecret };
}

function createRequestId() {
  return `dongni-live-test-${Date.now()}`;
}

function resolveCapture(orderData) {
  return orderData?.purchase_units?.[0]?.payments?.captures?.[0] || null;
}

async function handleConfig(res) {
  const validation = validateLiveEnv();
  if (!validation.ok) {
    return jsonError(res, 503, `LIVE PayPal test is blocked: ${validation.issues.join(' ')}`);
  }

  return res.status(200).json({
    ok: true,
    mode: 'live',
    clientId: validation.clientId,
    maskedClientId: maskClientId(validation.clientId),
    hasClientId: true,
    hasClientSecret: true,
    amount: '1.00',
    currency: 'TWD',
    packageName: 'LIVE PayPal real payment test'
  });
}

async function handleCreateOrder(req, res) {
  const validation = validateLiveEnv();
  if (!validation.ok) {
    return jsonError(res, 503, `LIVE PayPal test is blocked: ${validation.issues.join(' ')}`);
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
      headers: { 'PayPal-Request-Id': createRequestId() },
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'live-paypal-test',
          custom_id: JSON.stringify({ source: 'paypal-live-test-page' }),
          amount: { currency_code: currency, value: amount },
          description: packageName
        }],
        application_context: { user_action: 'PAY_NOW' }
      }
    });

    if (!createResult.ok) {
      const detail = createResult.data?.details?.[0]?.description || createResult.data?.message || createResult.rawText || 'Unable to create LIVE PayPal test order.';
      return jsonError(res, 502, detail);
    }

    return res.status(200).json({ ok: true, orderId: createResult.data?.id || null, status: createResult.data?.status || null, amount, currency, packageName });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Unable to create LIVE PayPal test order.';
    return jsonError(res, 500, message);
  }
}

async function handleCapture(req, res) {
  const validation = validateLiveEnv();
  if (!validation.ok) {
    return jsonError(res, 503, `LIVE PayPal test is blocked: ${validation.issues.join(' ')}`);
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
      const detail = captureResult.data?.details?.[0]?.description || captureResult.data?.message || captureResult.rawText || 'Unable to capture LIVE PayPal test order.';
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
      payerName: [captureResult.data?.payer?.name?.given_name, captureResult.data?.payer?.name?.surname].filter(Boolean).join(' ') || null,
      amount: capture?.amount || null,
      raw: captureResult.data || null
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Unable to capture LIVE PayPal test order.';
    return jsonError(res, 500, message);
  }
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  const action = getAction(req);

  // Never expose standalone live test payment controls in production.
  if (isProductionDeployment()) {
    return jsonError(res, 403, 'LIVE PayPal test endpoint is disabled in production.');
  }

  if (req.method === 'GET') {
    if (action === 'config') return handleConfig(res);
    return methodNotAllowed(res, 'GET, POST');
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'GET, POST');
  }

  try {
    await ensureAuthenticatedUser(req);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '請先登入。';
    return jsonError(res, 401, message);
  }

  if (action === 'create-order') return handleCreateOrder(req, res);
  if (action === 'capture-order') return handleCapture(req, res);
  return jsonError(res, 400, 'Unknown PayPal live test action.');
}
