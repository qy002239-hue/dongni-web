import { jsonError, methodNotAllowed } from './_http.js';
import { normalizePayPalEnv } from './_paypal.js';

export const config = { runtime: 'nodejs' };

function maskClientId(clientId) {
  const value = String(clientId || '').trim();
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET');
  }

  const paypalEnv = normalizePayPalEnv(process.env.PAYPAL_ENV);
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const hasClientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim().length > 0;

  const issues = [];
  if (paypalEnv !== 'live') issues.push('PAYPAL_ENV must be live for real payment testing.');
  if (!clientId) issues.push('PAYPAL_CLIENT_ID is missing.');
  if (!hasClientSecret) issues.push('PAYPAL_CLIENT_SECRET is missing.');

  if (issues.length) {
    return jsonError(res, 503, `LIVE PayPal test is blocked: ${issues.join(' ')}`);
  }

  return res.status(200).json({
    ok: true,
    mode: 'live',
    clientId,
    maskedClientId: maskClientId(clientId),
    hasClientId: true,
    hasClientSecret: true,
    amount: '1.00',
    currency: 'TWD',
    packageName: 'LIVE PayPal real payment test'
  });
}
