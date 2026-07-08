import { getPayPalPlan } from './_paypal.js';

function isMissingColumnError(error) {
  const code = String(error?.code || '').trim();
  return code === '42703';
}

async function findPaymentByColumn(supabase, columnName, orderId) {
  const { data, error } = await supabase
    .from('dongni_payments')
    .select('id')
    .eq(columnName, orderId)
    .limit(1);

  if (error) {
    if (isMissingColumnError(error)) {
      return { data: null, error: null };
    }
    return { data: null, error };
  }

  return { data: Array.isArray(data) ? data[0] || null : null, error: null };
}

export async function hasExistingPaymentRecord(supabase, orderId) {
  const paypalOrderResult = await findPaymentByColumn(supabase, 'paypal_order_id', orderId);
  if (paypalOrderResult.error) {
    return { duplicate: false, error: paypalOrderResult.error };
  }
  if (paypalOrderResult.data) {
    return { duplicate: true, error: null };
  }

  const genericOrderResult = await findPaymentByColumn(supabase, 'order_id', orderId);
  if (genericOrderResult.error) {
    return { duplicate: false, error: genericOrderResult.error };
  }

  return { duplicate: Boolean(genericOrderResult.data), error: null };
}

async function runGrantPurchaseRpc(supabase, payload) {
  const attempts = [
    {
      p_user_id: payload.userId,
      p_plan_id: payload.plan,
      p_paypal_order_id: payload.orderId,
      p_paypal_capture_id: payload.captureId,
      p_amount: payload.amount,
      p_currency: payload.currency
    },
    {
      user_id: payload.userId,
      plan_id: payload.plan,
      paypal_order_id: payload.orderId,
      paypal_capture_id: payload.captureId,
      amount: payload.amount,
      currency: payload.currency
    },
    {
      user_id: payload.userId,
      plan: payload.plan,
      order_id: payload.orderId,
      capture_id: payload.captureId,
      amount: payload.amount,
      currency: payload.currency
    }
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase.rpc('grant_dongni_purchase', attempt);
    if (!error) {
      return { data, error: null };
    }

    lastError = error;
    const message = String(error.message || '').toLowerCase();
    const code = String(error.code || '').trim();
    const retryable = code === 'PGRST202' || message.includes('function') || message.includes('parameter');
    if (!retryable) {
      return { data: null, error };
    }
  }

  return { data: null, error: lastError };
}

export async function grantCreditsForApprovedPayment(supabase, {
  userId,
  plan,
  orderId,
  captureId,
  amount,
  currency
}) {
  const planConfig = getPayPalPlan(plan);
  if (!planConfig) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid payment plan.',
      duplicate: false,
      creditsGranted: 0
    };
  }

  const duplicateCheck = await hasExistingPaymentRecord(supabase, orderId);
  if (duplicateCheck.error) {
    return {
      ok: false,
      status: 500,
      error: duplicateCheck.error.message || 'Unable to verify payment idempotency.',
      duplicate: false,
      creditsGranted: 0
    };
  }

  if (duplicateCheck.duplicate) {
    return {
      ok: true,
      status: 200,
      error: null,
      duplicate: true,
      creditsGranted: 0
    };
  }

  const grantResult = await runGrantPurchaseRpc(supabase, {
    userId,
    plan,
    orderId,
    captureId,
    amount,
    currency
  });

  if (grantResult.error) {
    return {
      ok: false,
      status: 500,
      error: grantResult.error.message || 'Failed to grant purchased credits.',
      duplicate: false,
      creditsGranted: 0
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
    duplicate: false,
    creditsGranted: planConfig.credits,
    result: grantResult.data
  };
}
