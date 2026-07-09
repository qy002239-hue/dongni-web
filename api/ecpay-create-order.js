import { buildEcpayOrderPayload, createMerchantTradeNo, getEcpayConfig, validateEcpayConfig } from './_ecpay.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  const validation = validateEcpayConfig();
  if (!validation.ok) {
    return jsonError(res, 503, `ECPay test is blocked: ${validation.issues.join(' ')}`);
  }

  const body = parseJsonBody(req);
  const ecpayConfig = getEcpayConfig();
  const merchantTradeNo = createMerchantTradeNo('DNE');
  const publicSiteUrl = ecpayConfig.publicSiteUrl;
  const fields = buildEcpayOrderPayload({
    merchantTradeNo,
    amount: body.amount || 1,
    itemName: body.productName || '懂妳 ECPay 測試付款',
    tradeDesc: body.tradeDesc || 'Dongni ECPay payment test',
    returnUrl: ecpayConfig.notifyUrl,
    orderResultUrl: ecpayConfig.returnUrl,
    clientBackUrl: `${publicSiteUrl}/test/ecpay?status=back&merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`,
    choosePayment: 'Credit',
    customField1: 'dongni',
    customField2: 'ecpay-test',
    customField3: ecpayConfig.env,
    customField4: merchantTradeNo
  }, ecpayConfig);

  return res.status(200).json({
    ok: true,
    env: ecpayConfig.env,
    actionUrl: ecpayConfig.actionUrl,
    method: 'POST',
    merchantTradeNo,
    fields
  });
}
