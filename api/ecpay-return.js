import { getEcpayConfig, parseEcpayBody, verifyCheckMacValue } from './_ecpay.js';
import { persistEcpayPaymentResult } from './_ecpay-payment-store.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function redirectHtml(targetUrl) {
  const safeUrl = String(targetUrl || '/test/ecpay').replace(/"/g, '&quot;');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0;url=${safeUrl}" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>ECPay Return</title></head><body><script>window.location.replace(${JSON.stringify(targetUrl)});</script><p>Redirecting back to merchant...</p></body></html>`;
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

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
