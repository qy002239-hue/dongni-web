import { getEcpayConfig, parseEcpayBody, verifyCheckMacValue } from './_ecpay.js';
import { persistEcpayPaymentResult } from './_ecpay-payment-store.js';

export const config = { runtime: 'nodejs' };

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).send('1|OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('0|Method Not Allowed');
  }

  const payload = parseEcpayBody(req);
  const ecpayConfig = getEcpayConfig();
  const verify = verifyCheckMacValue(payload, ecpayConfig.hashKey, ecpayConfig.hashIv);

  if (!verify.ok) {
    return res.status(400).send('0|CheckMacValue Error');
  }

  await persistEcpayPaymentResult(payload, 'notify');
  return res.status(200).send('1|OK');
}
