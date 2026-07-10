import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import {
  extractApproveUrl,
  getPayPalPlan,
  paypalApiRequest,
  requestPayPalAccessToken,
  resolvePublicSiteUrl
} from './_paypal.js';

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

function createRequestId(userId, planId) {
  return `dongni-${String(userId || '').slice(0, 18)}-${String(planId || '').slice(0, 24)}-${Date.now()}`;
}

function isAuthError(error) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('登入') || message.includes('login') || message.includes('token');
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
    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const body = parseJsonBody(req);
    const plan = getPayPalPlan(body.plan);

    if (!plan) {
      return jsonError(res, 400, 'Invalid payment plan.');
    }

    const siteUrl = resolvePublicSiteUrl(req);
    if (!siteUrl) {
      return jsonError(res, 503, 'Missing PUBLIC_SITE_URL or APP_URL.');
    }

    const accessToken = await requestPayPalAccessToken();

    const returnUrl = `${siteUrl}/chat?payment=paypal-success`;
    const cancelUrl = `${siteUrl}/chat?payment=paypal-cancel`;

    const createResult = await paypalApiRequest('/v2/checkout/orders', {
      method: 'POST',
      accessToken,
      headers: {
        'PayPal-Request-Id': createRequestId(user.id, plan.id)
      },
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: plan.id,
            custom_id: JSON.stringify({ userId: user.id, plan: plan.id }),
            amount: {
              currency_code: plan.currency,
              value: plan.amount
            },
            description: plan.description
          }
        ],
        application_context: {
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      }
    });

    if (!createResult.ok) {
      const detail = createResult.data?.details?.[0]?.description
        || createResult.data?.message
        || createResult.rawText
        || 'Unable to create PayPal checkout.';
      return jsonError(res, 502, detail);
    }

    const approveUrl = extractApproveUrl(createResult.data);
    if (!approveUrl) {
      return jsonError(res, 502, 'PayPal checkout URL was not returned.');
    }

    return res.status(200).json({
      orderId: createResult.data?.id || null,
      url: approveUrl,
      plan: plan.id,
      amount: plan.amount,
      currency: plan.currency
    });
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Unable to create PayPal checkout.';
    if (isAuthError(error)) {
      return jsonError(res, 401, message);
    }
    return jsonError(res, 500, message);
  }
}
