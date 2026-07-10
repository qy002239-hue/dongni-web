import crypto from 'node:crypto';

const ECPAY_ENDPOINTS = {
  test: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  production: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
};

function normalizeText(value, max = 0) {
  const text = String(value || '').trim();
  return max > 0 ? text.slice(0, max) : text;
}

export function normalizeEcpayEnv(rawEnv = process.env.ECPAY_ENV) {
  const value = String(rawEnv || 'test').trim().toLowerCase();
  return value === 'production' ? 'production' : 'test';
}

export function getEcpayActionUrl(env = normalizeEcpayEnv()) {
  return ECPAY_ENDPOINTS[env] || ECPAY_ENDPOINTS.test;
}

export function maskSecret(value, prefix = 4, suffix = 2) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= prefix + suffix) return `${text.slice(0, 1)}***${text.slice(-1)}`;
  return `${text.slice(0, prefix)}***${text.slice(-suffix)}`;
}

export function createMerchantTradeNo(prefix = 'DN') {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${stamp}${random}`.replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

export function formatEcpayTradeDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function sanitizeEcpayText(value, maxLength) {
  const text = normalizeText(value)
    .replace(/[<>"'`]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
  return maxLength ? text.slice(0, maxLength) : text;
}

function dotNetUrlEncode(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2a')
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

export function generateCheckMacValue(payload, hashKey, hashIv) {
  const entries = Object.entries(payload || {})
    .filter(([key]) => key !== 'CheckMacValue')
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '');

  entries.sort(([left], [right]) => left.localeCompare(right));
  const query = entries.map(([key, value]) => `${key}=${String(value)}`).join('&');
  const raw = `HashKey=${hashKey}&${query}&HashIV=${hashIv}`;
  const encoded = dotNetUrlEncode(raw).toLowerCase();
  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

export function verifyCheckMacValue(payload, hashKey, hashIv) {
  const expected = generateCheckMacValue(payload, hashKey, hashIv);
  const actual = normalizeText(payload?.CheckMacValue).toUpperCase();
  return {
    ok: Boolean(actual) && actual === expected,
    expected,
    actual
  };
}

export function parseEcpayBody(req) {
  const body = req?.body;
  if (!body) return {};

  if (typeof body === 'string') {
    return Object.fromEntries(new URLSearchParams(body));
  }

  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }

  if (typeof body === 'object') {
    const entries = Object.entries(body).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]);
    return Object.fromEntries(entries);
  }

  return {};
}

export function getEcpayConfig() {
  const env = normalizeEcpayEnv(process.env.ECPAY_ENV);
  const merchantId = normalizeText(process.env.ECPAY_MERCHANT_ID, 10);
  const hashKey = normalizeText(process.env.ECPAY_HASH_KEY);
  const hashIv = normalizeText(process.env.ECPAY_HASH_IV);
  const publicSiteUrl = normalizeText(process.env.PUBLIC_SITE_URL).replace(/\/$/, '');
  const returnUrl = normalizeText(process.env.ECPAY_RETURN_URL);
  const notifyUrl = normalizeText(process.env.ECPAY_NOTIFY_URL);

  return {
    env,
    merchantId,
    hashKey,
    hashIv,
    publicSiteUrl,
    returnUrl,
    notifyUrl,
    actionUrl: getEcpayActionUrl(env)
  };
}

export function validateEcpayConfig(config = getEcpayConfig()) {
  const issues = [];
  if (!config.merchantId) issues.push('ECPAY_MERCHANT_ID is missing.');
  if (!config.hashKey) issues.push('ECPAY_HASH_KEY is missing.');
  if (!config.hashIv) issues.push('ECPAY_HASH_IV is missing.');
  if (!config.returnUrl) issues.push('ECPAY_RETURN_URL is missing.');
  if (!config.notifyUrl) issues.push('ECPAY_NOTIFY_URL is missing.');
  if (!config.publicSiteUrl) issues.push('PUBLIC_SITE_URL is missing.');

  const isProduction = String(process.env.VERCEL_ENV || process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (isProduction && config.env !== 'production') {
    issues.push('ECPAY_ENV must be production in production deployment.');
  }

  if (isProduction) {
    const expectedOrigin = String(config.publicSiteUrl || '').trim().replace(/\/$/, '');
    const returnOrigin = String(config.returnUrl || '').trim();
    const notifyOrigin = String(config.notifyUrl || '').trim();

    if (expectedOrigin && !returnOrigin.startsWith(expectedOrigin)) {
      issues.push('ECPAY_RETURN_URL must use PUBLIC_SITE_URL origin in production.');
    }
    if (expectedOrigin && !notifyOrigin.startsWith(expectedOrigin)) {
      issues.push('ECPAY_NOTIFY_URL must use PUBLIC_SITE_URL origin in production.');
    }
  }

  return { ok: issues.length === 0, issues, config };
}

export function buildEcpayOrderPayload({
  merchantTradeNo,
  amount,
  itemName,
  tradeDesc,
  returnUrl,
  orderResultUrl,
  clientBackUrl,
  choosePayment = 'Credit',
  customField1 = '',
  customField2 = '',
  customField3 = '',
  customField4 = ''
}, config = getEcpayConfig()) {
  const totalAmount = Number(amount);
  const payload = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatEcpayTradeDate(),
    PaymentType: 'aio',
    TotalAmount: Number.isFinite(totalAmount) ? String(Math.max(1, Math.round(totalAmount))) : '1',
    TradeDesc: sanitizeEcpayText(tradeDesc || 'Dongni ECPay payment test', 200),
    ItemName: sanitizeEcpayText(itemName || 'Dongni ECPay payment test', 400),
    ReturnURL: returnUrl,
    ChoosePayment: choosePayment,
    EncryptType: '1',
    ClientBackURL: clientBackUrl,
    OrderResultURL: orderResultUrl,
    NeedExtraPaidInfo: 'Y',
    CustomField1: sanitizeEcpayText(customField1, 50),
    CustomField2: sanitizeEcpayText(customField2, 50),
    CustomField3: sanitizeEcpayText(customField3, 50),
    CustomField4: sanitizeEcpayText(customField4, 50)
  };

  payload.CheckMacValue = generateCheckMacValue(payload, config.hashKey, config.hashIv);
  return payload;
}

export function buildAutoRedirectHtml(actionUrl, fields) {
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const inputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting to ECPay</title>
</head>
<body>
  <form id="ecpay-form" method="post" action="${escapeHtml(actionUrl)}">${inputs}</form>
  <script>document.getElementById('ecpay-form').submit();</script>
</body>
</html>`;
}
