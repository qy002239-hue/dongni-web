import { buildEcpayOrderPayload, createMerchantTradeNo, getEcpayConfig, parseEcpayBody, verifyCheckMacValue, validateEcpayConfig, maskSecret } from './_ecpay.js';
import { persistEcpayPaymentResult } from './_ecpay-payment-store.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function redirectHtml(targetUrl) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0;url=${String(targetUrl).replace(/"/g, '&quot;')}" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>ECPay Return</title></head><body><script>window.location.replace(${JSON.stringify(targetUrl)});</script><p>Redirecting back to merchant...</p></body></html>`;
}

async function handleConfig(res) {
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

async function handleCreateOrder(req, res) {
  const validation = validateEcpayConfig();
  if (!validation.ok) {
    return jsonError(res, 503, `ECPay test is blocked: ${validation.issues.join(' ')}`);
  }

  const body = parseJsonBody(req);
  const ecpayConfig = getEcpayConfig();
  const merchantTradeNo = createMerchantTradeNo('DNE');
  const fields = buildEcpayOrderPayload({
    merchantTradeNo,
    amount: body.amount || 1,
    itemName: body.productName || '懂妳 ECPay 測試付款',
    tradeDesc: body.tradeDesc || 'Dongni ECPay payment test',
    returnUrl: ecpayConfig.notifyUrl,
    orderResultUrl: ecpayConfig.returnUrl,
    clientBackUrl: `${ecpayConfig.publicSiteUrl}/test/ecpay?status=back&merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`,
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

async function handleNotify(req, res) {
  const payload = parseEcpayBody(req);
  const ecpayConfig = getEcpayConfig();
  const verify = verifyCheckMacValue(payload, ecpayConfig.hashKey, ecpayConfig.hashIv);

  if (!verify.ok) {
    return res.status(400).send('0|CheckMacValue Error');
  }

  await persistEcpayPaymentResult(payload, 'notify');
  return res.status(200).send('1|OK');
}

async function handleReturn(req, res) {
  const payload = parseEcpayBody(req);
  const ecpayConfig = getEcpayConfig();
  const verify = verifyCheckMacValue(payload, ecpayConfig.hashKey, ecpayConfig.hashIv);
  const success = String(payload?.RtnCode || '') === '1';

  await persistEcpayPaymentResult(payload, 'return');

  const params = new URLSearchParams({
    status: verify.ok ? (success ? 'success' : 'failed') : 'checksum-error',
    merchantTradeNo: String(payload?.MerchantTradeNo || ''),
    tradeNo: String(payload?.TradeNo || ''),
    rtnCode: String(payload?.RtnCode || ''),
    rtnMsg: String(payload?.RtnMsg || ''),
    paymentType: String(payload?.PaymentType || ''),
    amount: String(payload?.TradeAmt || payload?.TotalAmount || ''),
    checksum: verify.ok ? 'ok' : 'failed'
  });

  const targetUrl = `${ecpayConfig.publicSiteUrl}/test/ecpay?${params.toString()}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(redirectHtml(targetUrl));
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  const action = getAction(req);

  if (req.method === 'GET') {
    if (action === 'config') return handleConfig(res);
    return methodNotAllowed(res, 'GET, POST');
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'GET, POST');
  }

  if (action === 'create-order') return handleCreateOrder(req, res);
  if (action === 'notify') return handleNotify(req, res);
  if (action === 'return') return handleReturn(req, res);

  return jsonError(res, 400, 'Unknown ECPay action.');
}
