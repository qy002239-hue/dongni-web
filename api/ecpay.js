import { buildEcpayOrderPayload, createMerchantTradeNo, getEcpayConfig, parseEcpayBody, verifyCheckMacValue, validateEcpayConfig, maskSecret } from './_ecpay.js';
import { persistEcpayPaymentResult } from './_ecpay-payment-store.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';
import { getPayPalPlan } from './_paypal.js';
import { grantCreditsForApprovedPayment } from './_payment-grant.js';
import { finalizeWebhookEvent, registerWebhookEvent } from './_webhook-events.js';

export const config = { runtime: 'nodejs' };

const MERCHANT_TRADE_NO_PATTERN = /^[A-Z0-9]{8,20}$/;
const CALLBACK_DEDUPE_TTL_MS = 10 * 60 * 1000;
const callbackSeenMap = new Map();

function isProductionDeployment() {
  const value = String(process.env.VERCEL_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production';
}

function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

function normalizePayloadValue(payload, key) {
  return String(payload?.[key] || '').trim();
}

function verifyMerchantTradeNo(payload) {
  const merchantTradeNo = normalizePayloadValue(payload, 'MerchantTradeNo');
  if (!merchantTradeNo || !MERCHANT_TRADE_NO_PATTERN.test(merchantTradeNo)) {
    return { ok: false, merchantTradeNo, reason: 'invalid_format' };
  }

  const customField4 = normalizePayloadValue(payload, 'CustomField4');
  if (customField4 && customField4 !== merchantTradeNo) {
    return { ok: false, merchantTradeNo, reason: 'custom_field_mismatch', customField4 };
  }

  return { ok: true, merchantTradeNo, reason: 'ok' };
}

function createSafeCallbackLog(payload, source, verify, merchantTradeCheck, persistResult) {
  return {
    source,
    merchantTradeNo: normalizePayloadValue(payload, 'MerchantTradeNo').slice(0, 20),
    tradeNoMasked: maskSecret(normalizePayloadValue(payload, 'TradeNo'), 4, 4),
    rtnCode: normalizePayloadValue(payload, 'RtnCode'),
    rtnMsg: normalizePayloadValue(payload, 'RtnMsg').slice(0, 100),
    paymentType: normalizePayloadValue(payload, 'PaymentType').slice(0, 40),
    amount: normalizePayloadValue(payload, 'TradeAmt') || normalizePayloadValue(payload, 'TotalAmount'),
    tradeDate: normalizePayloadValue(payload, 'TradeDate') || normalizePayloadValue(payload, 'PaymentDate'),
    checksumOk: verify.ok,
    merchantTradeNoOk: merchantTradeCheck.ok,
    duplicate: Boolean(persistResult?.duplicate),
    persistMode: String(persistResult?.mode || ''),
    persistOk: Boolean(persistResult?.ok)
  };
}

function createSafeGrantLog(payload) {
  return {
    source: 'ecpay',
    merchantTradeNo: normalizePayloadValue(payload, 'MerchantTradeNo').slice(0, 20),
    tradeNoMasked: maskSecret(normalizePayloadValue(payload, 'TradeNo'), 4, 4),
    plan: normalizePayloadValue(payload, 'CustomField2').slice(0, 30),
    userIdMasked: maskSecret(normalizePayloadValue(payload, 'CustomField1'), 4, 4),
    rtnCode: normalizePayloadValue(payload, 'RtnCode')
  };
}

async function grantCreditsForEcpayPayment(payload) {
  const isPaid = String(payload?.RtnCode || '').trim() === '1';
  if (!isPaid) {
    return { ok: true, skipped: true, duplicate: false, creditsGranted: 0 };
  }

  const userId = normalizePayloadValue(payload, 'CustomField1');
  const planId = normalizePayloadValue(payload, 'CustomField2');
  const plan = getPayPalPlan(planId);

  if (!userId || !plan) {
    return {
      ok: false,
      skipped: false,
      status: 400,
      error: 'ECPay callback is missing user id or payment plan.'
    };
  }

  const orderId = normalizePayloadValue(payload, 'MerchantTradeNo');
  const captureId = normalizePayloadValue(payload, 'TradeNo') || orderId;
  const amount = normalizePayloadValue(payload, 'TradeAmt') || normalizePayloadValue(payload, 'TotalAmount') || plan.amount;

  const supabase = getSupabaseAdmin();
  return grantCreditsForApprovedPayment(supabase, {
    userId,
    plan: plan.id,
    orderId,
    captureId,
    amount,
    currency: 'TWD'
  });
}

function buildCallbackFingerprint(payload, source) {
  return [
    source,
    normalizePayloadValue(payload, 'MerchantTradeNo'),
    normalizePayloadValue(payload, 'TradeNo'),
    normalizePayloadValue(payload, 'RtnCode'),
    normalizePayloadValue(payload, 'CheckMacValue')
  ].join('|');
}

function checkAndMarkDuplicateCallback(payload, source) {
  const now = Date.now();

  for (const [key, timestamp] of callbackSeenMap.entries()) {
    if (now - timestamp > CALLBACK_DEDUPE_TTL_MS) {
      callbackSeenMap.delete(key);
    }
  }

  const fingerprint = buildCallbackFingerprint(payload, source);
  const seen = callbackSeenMap.has(fingerprint);
  callbackSeenMap.set(fingerprint, now);

  return {
    duplicate: seen,
    fingerprint
  };
}

async function handleConfig(res) {
  const validation = validateEcpayConfig();
  if (!validation.ok) {
    console.error('[ECPAY_CONFIG_BLOCKED]', {
      issues: validation.issues,
      env: validation.config?.env || '',
      merchantIdMasked: maskSecret(validation.config?.merchantId || '', 4, 2)
    });
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
    amount: 2,
    paymentMethod: 'Credit',
    actionUrl: ecpayConfig.actionUrl
  });
}

async function handleCreateOrder(req, res) {
  const validation = validateEcpayConfig();
  if (!validation.ok) {
    console.error('[ECPAY_CREATE_ORDER_BLOCKED]', {
      issues: validation.issues,
      env: validation.config?.env || '',
      merchantIdMasked: maskSecret(validation.config?.merchantId || '', 4, 2)
    });
    return jsonError(res, 503, `ECPay test is blocked: ${validation.issues.join(' ')}`);
  }

  const body = parseJsonBody(req);
  const ecpayConfig = getEcpayConfig();
  const merchantTradeNo = createMerchantTradeNo('DNE');
  const requestedPlanId = String(body.plan || '').trim();
  const requestedPlan = requestedPlanId ? getPayPalPlan(requestedPlanId) : null;

  if (isProductionDeployment() && !requestedPlanId) {
    return jsonError(res, 400, 'Production checkout requires a server-defined plan.');
  }

  let userId = '';
  if (requestedPlanId) {
    if (!requestedPlan) {
      return jsonError(res, 400, 'Invalid payment plan.');
    }

    try {
      const supabase = getSupabaseAdmin();
      const user = await getAuthenticatedUser(req, supabase);
      userId = String(user.id || '').trim();
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '請先登入。';
      return jsonError(res, 401, message);
    }
  }

  const amount = requestedPlan ? Number(requestedPlan.amount) : (body.amount || 2);
  const itemName = requestedPlan
    ? (requestedPlan.id === 'dongni-plus-six-pack' ? '懂妳 Plus 六次包' : '懂妳 Plus 單次')
    : (body.productName || '懂妳 ECPay 測試付款');

  const fields = buildEcpayOrderPayload({
    merchantTradeNo,
    amount,
    itemName,
    tradeDesc: body.tradeDesc || 'Dongni ECPay payment test',
    returnUrl: ecpayConfig.notifyUrl,
    orderResultUrl: ecpayConfig.returnUrl,
    clientBackUrl: `${ecpayConfig.publicSiteUrl}/test/ecpay?status=back&merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`,
    choosePayment: 'Credit',
    customField1: userId || 'dongni',
    customField2: requestedPlan?.id || 'ecpay-test',
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
  const supabase = getSupabaseAdmin();
  const eventType = String(payload?.RtnCode || '') === '1' ? 'payment_success' : 'payment_failed';
  const eventKey = buildCallbackFingerprint(payload, 'notify');
  const ecpayConfig = getEcpayConfig();
  const verify = verifyCheckMacValue(payload, ecpayConfig.hashKey, ecpayConfig.hashIv);
  const merchantTradeCheck = verifyMerchantTradeNo(payload);
  const dedupe = checkAndMarkDuplicateCallback(payload, 'notify');

  if (!merchantTradeCheck.ok) {
    console.error('[ECPAY_CALLBACK]', {
      source: 'notify',
      reason: 'merchant_trade_no_invalid',
      merchantTradeNo: merchantTradeCheck.merchantTradeNo,
      detail: merchantTradeCheck.reason
    });
    await finalizeWebhookEvent(supabase, eventKey, {
      status: 'failed',
      errorMessage: 'MerchantTradeNo validation failed.',
      orderId: merchantTradeCheck.merchantTradeNo
    });
    return res.status(400).send('0|MerchantTradeNo Error');
  }

  if (!verify.ok) {
    console.error('[ECPAY_CALLBACK]', {
      source: 'notify',
      reason: 'check_mac_failed',
      merchantTradeNo: merchantTradeCheck.merchantTradeNo
    });
    await finalizeWebhookEvent(supabase, eventKey, {
      status: 'failed',
      errorMessage: 'CheckMacValue verification failed.',
      orderId: merchantTradeCheck.merchantTradeNo,
      captureId: normalizePayloadValue(payload, 'TradeNo')
    });
    return res.status(400).send('0|CheckMacValue Error');
  }

  const eventStore = await registerWebhookEvent(supabase, {
    provider: 'ecpay',
    eventKey,
    eventType,
    source: 'ecpay-notify',
    orderId: normalizePayloadValue(payload, 'MerchantTradeNo'),
    captureId: normalizePayloadValue(payload, 'TradeNo'),
    payload
  });

  if (!eventStore.ok) {
    return res.status(500).send('0|Event Store Error');
  }

  if (eventStore.duplicate) {
    res.setHeader('X-Dongni-Webhook-Duplicate', 'true');
    return res.status(200).send('1|OK');
  }

  const persistResult = await persistEcpayPaymentResult(payload, 'notify');
  const grantResult = await grantCreditsForEcpayPayment(payload);
  const duplicate = Boolean(dedupe.duplicate || persistResult?.duplicate);
  const safeLog = createSafeCallbackLog(payload, 'notify', verify, merchantTradeCheck, persistResult);
  safeLog.duplicate = duplicate;
  console.log('[ECPAY_CALLBACK]', safeLog);

  if (!grantResult.ok) {
    console.error('[ECPAY_GRANT_ERROR]', {
      ...createSafeGrantLog(payload),
      error: String(grantResult.error || 'Failed to grant credits for ECPay callback.')
    });
    await finalizeWebhookEvent(supabase, eventKey, {
      status: 'failed',
      errorMessage: String(grantResult.error || 'Failed to grant credits for ECPay callback.'),
      orderId: normalizePayloadValue(payload, 'MerchantTradeNo'),
      captureId: normalizePayloadValue(payload, 'TradeNo')
    });
    return res.status(500).send('0|Grant Error');
  }

  await finalizeWebhookEvent(supabase, eventKey, {
    status: grantResult.duplicate ? 'duplicate' : 'processed',
    orderId: normalizePayloadValue(payload, 'MerchantTradeNo'),
    captureId: normalizePayloadValue(payload, 'TradeNo')
  });

  if (persistResult?.mode) {
    res.setHeader('X-Dongni-Persist-Mode', String(persistResult.mode));
  }
  res.setHeader('X-Dongni-Callback-Duplicate', duplicate ? 'true' : 'false');
  res.setHeader('X-Dongni-Payment-Status', String(payload?.RtnCode || '') === '1' ? 'paid' : 'failed');
  return res.status(200).send('1|OK');
}

async function handleReturn(req, res) {
  const payload = parseEcpayBody(req);
  const supabase = getSupabaseAdmin();
  const eventType = String(payload?.RtnCode || '') === '1' ? 'payment_success' : 'payment_failed';
  const eventKey = buildCallbackFingerprint(payload, 'return');
  const ecpayConfig = getEcpayConfig();
  const verify = verifyCheckMacValue(payload, ecpayConfig.hashKey, ecpayConfig.hashIv);
  const merchantTradeCheck = verifyMerchantTradeNo(payload);
  const dedupe = checkAndMarkDuplicateCallback(payload, 'return');
  const success = String(payload?.RtnCode || '') === '1';

  let eventStore = { ok: true, duplicate: false };
  if (merchantTradeCheck.ok && verify.ok) {
    eventStore = await registerWebhookEvent(supabase, {
      provider: 'ecpay',
      eventKey,
      eventType,
      source: 'ecpay-return',
      orderId: normalizePayloadValue(payload, 'MerchantTradeNo'),
      captureId: normalizePayloadValue(payload, 'TradeNo'),
      payload
    });

    if (!eventStore.ok) {
      return res.status(500).send('Event Store Error');
    }
  }

  const persistResult = await persistEcpayPaymentResult(payload, 'return');
  const grantResult = await grantCreditsForEcpayPayment(payload);
  const duplicate = Boolean(dedupe.duplicate || persistResult?.duplicate);
  const safeLog = createSafeCallbackLog(payload, 'return', verify, merchantTradeCheck, persistResult);
  safeLog.duplicate = duplicate;
  console.log('[ECPAY_CALLBACK]', safeLog);

  if (!grantResult.ok) {
    console.error('[ECPAY_GRANT_ERROR]', {
      ...createSafeGrantLog(payload),
      error: String(grantResult.error || 'Failed to grant credits for ECPay return callback.')
    });
    await finalizeWebhookEvent(supabase, eventKey, {
      status: 'failed',
      errorMessage: String(grantResult.error || 'Failed to grant credits for ECPay return callback.'),
      orderId: normalizePayloadValue(payload, 'MerchantTradeNo'),
      captureId: normalizePayloadValue(payload, 'TradeNo')
    });
  } else {
    await finalizeWebhookEvent(supabase, eventKey, {
      status: grantResult.duplicate || eventStore.duplicate ? 'duplicate' : 'processed',
      orderId: normalizePayloadValue(payload, 'MerchantTradeNo'),
      captureId: normalizePayloadValue(payload, 'TradeNo')
    });
  }

  const status = !merchantTradeCheck.ok
    ? 'merchant-trade-no-error'
    : (verify.ok ? (success ? 'success' : 'failed') : 'checksum-error');

  const params = new URLSearchParams({
    status,
    merchantTradeNo: String(payload?.MerchantTradeNo || ''),
    tradeNo: String(payload?.TradeNo || ''),
    rtnCode: String(payload?.RtnCode || ''),
    rtnMsg: String(payload?.RtnMsg || ''),
    paymentType: String(payload?.PaymentType || ''),
    amount: String(payload?.TradeAmt || payload?.TotalAmount || ''),
    tradeDate: String(payload?.TradeDate || payload?.PaymentDate || ''),
    checksum: verify.ok ? 'ok' : 'failed',
    merchantTradeNoCheck: merchantTradeCheck.ok ? 'ok' : 'failed',
    callbackSource: 'return',
    duplicate: duplicate ? 'true' : 'false',
    granted: grantResult.ok && !grantResult.duplicate ? 'true' : 'false',
    grantDuplicate: grantResult.ok && grantResult.duplicate ? 'true' : 'false'
  });

  const targetUrl = `${ecpayConfig.publicSiteUrl}/payment/result?${params.toString()}`;
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
