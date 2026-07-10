const PAYPAL_PLAN_MAP = {
  'dongni-plus-single': {
    id: 'dongni-plus-single',
    amount: '200',
    currency: 'TWD',
    credits: 1,
    description: 'Dongni Plus single session'
  },
  'dongni-plus-six-pack': {
    id: 'dongni-plus-six-pack',
    amount: '1000',
    currency: 'TWD',
    credits: 6,
    description: 'Dongni Plus six-session pack'
  }
};

export function normalizePayPalEnv(rawEnv = process.env.PAYPAL_ENV) {
  const value = String(rawEnv || 'sandbox').trim().toLowerCase();
  return value === 'live' ? 'live' : 'sandbox';
}

export function getPayPalBaseUrl(paypalEnv = normalizePayPalEnv()) {
  return paypalEnv === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function fetchPayPalToken(baseUrl, clientId, clientSecret, fetchImpl = fetch) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const text = await response.text();
  const payload = (() => {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error_description: text || 'PayPal token response is not JSON.' };
    }
  })();

  return { response, payload };
}

export function getPayPalPlan(planId) {
  return PAYPAL_PLAN_MAP[String(planId || '').trim()] || null;
}

export function getAllPayPalPlans() {
  return { ...PAYPAL_PLAN_MAP };
}

export function resolvePublicSiteUrl(req) {
  const configured = [process.env.PUBLIC_SITE_URL, process.env.APP_URL]
    .map((item) => String(item || '').trim())
    .find(Boolean);

  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const host = String(req?.headers?.host || '').trim();
  if (!host) return '';
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').trim() || 'https';
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function parseCustomId(rawCustomId = '') {
  const text = String(rawCustomId || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const userId = String(parsed?.userId || '').trim();
    const plan = String(parsed?.plan || '').trim();
    if (!userId || !plan) return null;
    return { userId, plan };
  } catch {
    const [userId, plan] = text.split(':').map((part) => String(part || '').trim());
    if (!userId || !plan) return null;
    return { userId, plan };
  }
}

export function extractApproveUrl(orderData) {
  const links = Array.isArray(orderData?.links) ? orderData.links : [];
  const approve = links.find((link) => String(link?.rel || '').toLowerCase() === 'approve');
  return String(approve?.href || '').trim();
}

export function readPayPalHeaders(req) {
  const headers = req?.headers || {};
  return {
    transmissionId: String(headers['paypal-transmission-id'] || '').trim(),
    transmissionTime: String(headers['paypal-transmission-time'] || '').trim(),
    certUrl: String(headers['paypal-cert-url'] || '').trim(),
    authAlgo: String(headers['paypal-auth-algo'] || '').trim(),
    transmissionSig: String(headers['paypal-transmission-sig'] || '').trim()
  };
}

export async function requestPayPalAccessToken({ fetchImpl = fetch } = {}) {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required.');
  }

  const paypalEnv = normalizePayPalEnv();
  const baseUrl = getPayPalBaseUrl(paypalEnv);
  const { response, payload } = await fetchPayPalToken(baseUrl, clientId, clientSecret, fetchImpl);

  if (!response.ok || !payload?.access_token) {
    let detail = payload?.error_description || payload?.error || 'Unable to get PayPal access token.';
    const isInvalidClient = String(payload?.error || '').toLowerCase() === 'invalid_client';

    if (isInvalidClient) {
      const oppositeEnv = paypalEnv === 'live' ? 'sandbox' : 'live';
      const oppositeBase = getPayPalBaseUrl(oppositeEnv);
      try {
        const opposite = await fetchPayPalToken(oppositeBase, clientId, clientSecret, fetchImpl);
        if (opposite.response.ok && opposite.payload?.access_token) {
          detail = `Client Authentication failed in ${paypalEnv}. Credentials appear valid in ${oppositeEnv}, likely ${oppositeEnv} credentials are being used.`;
        }
      } catch {
        // Keep original detail if opposite endpoint check fails.
      }
    }

    throw new Error(`PayPal auth failed: ${detail}`);
  }

  return String(payload.access_token);
}

export async function paypalApiRequest(path, {
  method = 'GET',
  accessToken,
  body,
  headers = {},
  fetchImpl = fetch
} = {}) {
  const token = String(accessToken || '').trim();
  if (!token) {
    throw new Error('PayPal access token is required.');
  }

  const baseUrl = getPayPalBaseUrl();
  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    ...headers
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { rawText };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawText
  };
}
