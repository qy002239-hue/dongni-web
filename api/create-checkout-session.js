import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

const plans = {
  'dongni-plus-single': {
    amount: '200',
    name: 'Dongni Plus',
    description: 'One Dongni Plus conversation credit.',
    credits: '1'
  },
  'dongni-plus-six-pack': {
    amount: '1000',
    name: 'Dongni Plus Six Pack',
    description: 'Six Dongni Plus conversation credits.',
    credits: '6'
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
    const selectedPlan = plans[body.plan];

    if (!selectedPlan) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const { error: profileError } = await supabase.rpc('ensure_dongni_user', {
      p_user_id: user.id,
      p_email: user.email || null
    });

    if (profileError) throw profileError;

    const origin =
      process.env.PUBLIC_SITE_URL ||
      req.headers.origin ||
      `https://${req.headers.host}`;

    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: body.plan,
            custom_id: user.id,
            description: selectedPlan.description,
            amount: {
              currency_code: 'TWD',
              value: selectedPlan.amount
            }
          }
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Dongni',
              locale: 'zh-TW',
              landing_page: 'LOGIN',
              user_action: 'PAY_NOW',
              return_url: `${origin}/?payment=paypal-success`,
              cancel_url: `${origin}/?payment=cancel`
            }
          }
        }
      })
    });

    const order = await response.json();
    if (!response.ok) {
      console.error('paypal create order error:', order);
      throw new Error('Unable to create PayPal checkout.');
    }

    const approveUrl = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
    if (!approveUrl) {
      console.error('paypal order missing approve link:', order);
      throw new Error('PayPal checkout link was not returned.');
    }

    return res.status(200).json({ url: approveUrl });
  } catch (error) {
    console.error('create-checkout-session error:', error);
    const status = error.message?.includes('login') ? 401 : 500;
    return res.status(status).json({ error: error.message || 'Unable to create checkout.' });
  }
}
