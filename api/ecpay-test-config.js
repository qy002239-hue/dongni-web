import { jsonError, methodNotAllowed } from './_http.js';
import { getEcpayConfig, maskSecret, validateEcpayConfig } from './_ecpay.js';

export const config = { runtime: 'nodejs' };

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

  const validation = validateEcpayConfig();
  if (!validation.ok) {
    return jsonError(res, 503, `ECPay test is blocked: ${validation.issues.join(' ')}`);
  }

  const ecpayConfig = getEcpayConfig();
  return res.status(200).json({
    ok: true,
    env: ecpayConfig.env,
    merchantIdMasked: maskSecret(ecpayConfig.merchantId, 4, 2),
    hasMerchantId: Boolean(ecpayConfig.merchantId),
    hasHashKey: Boolean(ecpayConfig.hashKey),
    hasHashIv: Boolean(ecpayConfig.hashIv),
    productName: '懂妳 ECPay 測試付款',
    amount: 1,
    paymentMethod: 'Credit',
    actionUrl: ecpayConfig.actionUrl
  });
}
