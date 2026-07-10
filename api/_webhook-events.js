function isMissingRelation(error) {
  return String(error?.code || '').trim() === '42P01';
}

function isMissingColumn(error) {
  return String(error?.code || '').trim() === '42703';
}

function isDuplicateKey(error) {
  return String(error?.code || '').trim() === '23505';
}

function createUnsupportedResult(reason) {
  return {
    ok: true,
    supported: false,
    duplicate: false,
    reason
  };
}

export async function registerWebhookEvent(supabase, {
  provider,
  eventKey,
  eventType,
  source,
  orderId = '',
  captureId = '',
  payload = {}
}) {
  const safeEventKey = String(eventKey || '').trim();
  if (!safeEventKey) {
    return { ok: false, supported: true, duplicate: false, error: 'eventKey is required.' };
  }

  const query = await supabase
    .from('dongni_webhook_events')
    .select('id, status')
    .eq('event_key', safeEventKey)
    .limit(1);

  if (query.error) {
    if (isMissingRelation(query.error)) return createUnsupportedResult('table_missing');
    if (isMissingColumn(query.error)) return createUnsupportedResult('schema_incompatible');
    return { ok: false, supported: true, duplicate: false, error: query.error.message || String(query.error) };
  }

  if (Array.isArray(query.data) && query.data[0]?.id) {
    return { ok: true, supported: true, duplicate: true, id: query.data[0].id, status: query.data[0].status || 'received' };
  }

  const row = {
    provider: String(provider || '').trim() || 'unknown',
    event_key: safeEventKey,
    event_type: String(eventType || '').trim(),
    source: String(source || '').trim() || 'unknown',
    order_id: String(orderId || '').trim(),
    capture_id: String(captureId || '').trim(),
    status: 'received',
    payload,
    created_at: new Date().toISOString()
  };

  const insert = await supabase
    .from('dongni_webhook_events')
    .insert(row)
    .select('id, status')
    .limit(1);

  if (insert.error) {
    if (isDuplicateKey(insert.error)) {
      return { ok: true, supported: true, duplicate: true };
    }
    if (isMissingRelation(insert.error)) return createUnsupportedResult('table_missing');
    if (isMissingColumn(insert.error)) return createUnsupportedResult('schema_incompatible');
    return { ok: false, supported: true, duplicate: false, error: insert.error.message || String(insert.error) };
  }

  return {
    ok: true,
    supported: true,
    duplicate: false,
    id: Array.isArray(insert.data) ? insert.data[0]?.id : null,
    status: Array.isArray(insert.data) ? insert.data[0]?.status || 'received' : 'received'
  };
}

export async function finalizeWebhookEvent(supabase, eventKey, {
  status,
  errorMessage = '',
  orderId = '',
  captureId = ''
} = {}) {
  const safeEventKey = String(eventKey || '').trim();
  if (!safeEventKey) {
    return { ok: false, supported: true, error: 'eventKey is required.' };
  }

  const nextStatus = String(status || '').trim() || 'processed';
  const update = await supabase
    .from('dongni_webhook_events')
    .update({
      status: nextStatus,
      error_message: String(errorMessage || '').trim() || null,
      order_id: String(orderId || '').trim() || null,
      capture_id: String(captureId || '').trim() || null,
      processed_at: new Date().toISOString()
    })
    .eq('event_key', safeEventKey);

  if (update.error) {
    if (isMissingRelation(update.error)) return createUnsupportedResult('table_missing');
    if (isMissingColumn(update.error)) return createUnsupportedResult('schema_incompatible');
    return { ok: false, supported: true, error: update.error.message || String(update.error) };
  }

  return { ok: true, supported: true };
}
