export const config = { runtime: 'nodejs' };

function isProductionDeployment() {
  const value = String(process.env.VERCEL_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production';
}

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeText(value) {
  return String(value || '').trim();
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (isProductionDeployment()) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const nodeEnv = normalizeText(process.env.NODE_ENV);
  const vercelEnv = normalizeText(process.env.VERCEL_ENV);
  const paypalEnv = normalizeText(process.env.PAYPAL_ENV);
  const deploymentUrlType = normalizeText(process.env.DEPLOYMENT_URL_TYPE);
  const isLiveMode = paypalEnv.toLowerCase() === 'live';

  return res.status(200).json({
    NODE_ENV: nodeEnv,
    VERCEL_ENV: vercelEnv,
    PAYPAL_ENV: paypalEnv,
    DEPLOYMENT_URL_TYPE: deploymentUrlType,
    isLiveMode
  });
}
