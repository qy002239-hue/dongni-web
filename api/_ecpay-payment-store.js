import { getSupabaseAdmin } from './_supabase.js';

function isMissingRelation(error) {
  return String(error?.code || '').trim() === '42P01';
}

function isMissingColumn(error) {
  return String(error?.code || '').trim() === '42703';
}

export async function persistEcpayPaymentResult(payload, source = 'notify') {
  try {
    const supabase = getSupabaseAdmin();
    const orderId = String(payload?.MerchantTradeNo || '').trim();
    const status = String(payload?.RtnCode || '') === '1' ? 'paid' : 'failed';
    const amount = Number(payload?.TradeAmt || payload?.TotalAmount || 0) || 0;

    const check = await supabase
      .from('dongni_payments')
      .select('id, status, amount_total')
      .eq('order_id', orderId)
      .limit(1);

    if (check.error) {
      if (isMissingRelation(check.error)) {
        return { ok: false, persisted: false, reason: 'table_missing' };
      }
      if (isMissingColumn(check.error)) {
        return { ok: false, persisted: false, reason: 'schema_incompatible', error: check.error.message || String(check.error) };
      }
      return { ok: false, persisted: false, reason: 'db_error', error: check.error.message || String(check.error) };
    }

    const row = {
      order_id: orderId,
      status,
      amount_total: amount,
      currency: 'TWD',
      provider: 'ecpay',
      gateway_result: source,
      provider_reference: String(payload?.TradeNo || '').trim(),
      metadata: {
        source,
        rtnCode: String(payload?.RtnCode || '').trim(),
        rtnMsg: String(payload?.RtnMsg || '').trim(),
        paymentType: String(payload?.PaymentType || '').trim(),
        tradeDate: String(payload?.TradeDate || payload?.PaymentDate || '').trim(),
        checksum: String(payload?.CheckMacValue || '').trim()
      }
    };

    if (Array.isArray(check.data) && check.data[0]?.id) {
      const current = check.data[0];
      const currentStatus = String(current.status || '').trim();
      const currentAmount = Number(current.amount_total || 0) || 0;

      if (currentStatus === status && currentAmount === amount) {
        return { ok: true, persisted: true, mode: 'duplicate_ignored', duplicate: true };
      }

      const update = await supabase
        .from('dongni_payments')
        .update(row)
        .eq('id', check.data[0].id);

      if (update.error) {
        if (isMissingColumn(update.error)) {
          return { ok: false, persisted: false, reason: 'schema_incompatible', error: update.error.message || String(update.error) };
        }
        return { ok: false, persisted: false, reason: 'db_error', error: update.error.message || String(update.error) };
      }

      return { ok: true, persisted: true, mode: 'updated', duplicate: false };
    }

    const insert = await supabase
      .from('dongni_payments')
      .insert(row);

    if (insert.error) {
      if (isMissingColumn(insert.error)) {
        return { ok: false, persisted: false, reason: 'schema_incompatible', error: insert.error.message || String(insert.error) };
      }
      return { ok: false, persisted: false, reason: 'db_error', error: insert.error.message || String(insert.error) };
    }

    return { ok: true, persisted: true, mode: 'inserted', duplicate: false };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error);
    return { ok: false, persisted: false, reason: 'env_unavailable', error: message, source };
  }
}
