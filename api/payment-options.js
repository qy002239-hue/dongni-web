import { methodNotAllowed } from './_http.js';
import { normalizePayPalEnv, requestPayPalAccessToken } from './_paypal.js';
import { normalizeEcpayEnv, validateEcpayConfig } from './_ecpay.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeCountry(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function detectCountry(req) {
  const headers = req?.headers || {};
  return normalizeCountry(
    headers['x-vercel-ip-country']
      || headers['cf-ipcountry']
      || headers['cloudfront-viewer-country']
      || headers['x-country-code']
  );
}

async function resolvePaypalAvailability() {
  const env = normalizePayPalEnv(process.env.PAYPAL_ENV);
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    return { available: false, reason: 'PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing.', env };
  }

  try {
    await requestPayPalAccessToken();
    return { available: true, reason: '', env };
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'PayPal credentials are invalid.';
    return { available: false, reason: message, env };
  }
}

function resolveEcpayAvailability() {
  const validation = validateEcpayConfig();
  return {
    available: validation.ok,
    reason: validation.ok ? '' : validation.issues.join(' '),
    env: normalizeEcpayEnv(process.env.ECPAY_ENV)
  };
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET');
  }

  const country = detectCountry(req);
  const ecpay = resolveEcpayAvailability();
  const paypal = await resolvePaypalAvailability();

  const availableProviders = [];
  if (ecpay.available) availableProviders.push('ecpay');
  if (paypal.available) availableProviders.push('paypal');

  const preferredProvider = country === 'TW' ? 'ecpay' : 'paypal';
  const recommendedProvider = availableProviders.includes(preferredProvider)
    ? preferredProvider
    : (availableProviders[0] || null);

  return res.status(200).json({
    ok: true,
    country,
    recommendedProvider,
    availableProviders,
    canSwitch: availableProviders.length > 1,
    providers: {
      ecpay,
      paypal
    }
  });
}
