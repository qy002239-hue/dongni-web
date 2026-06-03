import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

const plans = {
  'dongni-plus-single': {
    amountTotal: 20000,
    credits: 1
  },
  'dongni-plus-six-pack': {
    amountTotal: 100000,
    credits: 6
  }
};

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function getPayPalBaseUrl() {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal is not configured.');
  }

  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('paypal token error:', data);
    throw new Error('Unable to connect to PayPal.');
  }

  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req);
    const orderId = body.orderId;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing PayPal order id.' });
    }

    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const order = await response.json();
    if (!response.ok) {
      console.error('paypal capture error:', order);
      throw new Error('PayPal payment was not completed.');
    }

    if (order.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'PayPal payment is not completed.' });
    }

    const purchaseUnit = order.purchase_units?.[0];
    const planId = purchaseUnit?.reference_id;
    const selectedPlan = plans[planId];

    if (!selectedPlan || purchaseUnit?.custom_id !== user.id) {
      console.error('paypal order validation failed:', orderId, purchaseUnit);
      return res.status(400).json({ error: 'PayPal order did not match this user.' });
    }

    const capture = purchaseUnit.payments?.captures?.[0];
    const captureId = capture?.id || order.id;

    const { data: grantResult, error: grantError } = await supabase.rpc('grant_dongni_purchase', {
      p_user_id: user.id,
      p_email: user.email || order.payer?.email_address || null,
      p_stripe_session_id: order.id,
      p_stripe_payment_intent_id: captureId,
      p_plan: planId,
      p_credits: selectedPlan.credits,
      p_amount_total: selectedPlan.amountTotal,
      p_currency: capture?.amount?.currency_code?.toLowerCase() || 'twd',
      p_status: capture?.status || order.status
    });

    if (grantError) throw grantError;

    return res.status(200).json({
      granted: grantResult,
      credits: selectedPlan.credits
    });
  } catch (error) {
    console.error('paypal-capture-order error:', error);
    const status = error.message?.includes('login') ? 401 : 500;
    return res.status(status).json({ error: error.message || 'Unable to capture PayPal payment.' });
  }
}
