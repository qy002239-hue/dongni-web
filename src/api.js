const localE2EToken = 'local-e2e-token';

function resolveChatApiUrl(path) {
  const configuredBase = String(import.meta.env.VITE_CHAT_API_BASE_URL || '').trim();
  if (configuredBase) {
    return `${configuredBase.replace(/\/$/, '')}${path}`;
  }

  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `http://127.0.0.1:3001${path}`;
  }

  return path;
}

function isLocalE2E(accessToken = '') {
  return accessToken === localE2EToken && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function localSession() {
  return {
    active: true,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    credits: 6,
    trialStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    trialActive: true
  };
}

function createHttpError(status, message, fallback) {
  const safeStatus = Number(status) || 0;
  const raw = String(message || '').trim();
  const fallbackText = String(fallback || '無法開始對話，請稍後再試。').trim();

  // Only 402 should carry Plus/credits semantics.
  const finalMessage = safeStatus === 402
    ? (raw || '妳的 Plus 次數已用完，請先購買次數。')
    : (raw && !/(plus|credit|次數)/i.test(raw) ? raw : fallbackText);

  const error = new Error(finalMessage);
  error.status = safeStatus;
  error.isPaymentRequired = safeStatus === 402;
  return error;
}

function createDetailedHttpError(status, message, fallback, responseBody = null, responseError = null) {
  const error = createHttpError(status, message, fallback);
  error.responseBody = responseBody;
  error.responseError = responseError;
  return error;
}

async function parseApiResponse(response, apiName) {
  const rawText = await response.text();
  const trimmed = String(rawText || '').trim();

  if (!trimmed) {
    return {
      data: null,
      rawText: ''
    };
  }

  try {
    return {
      data: JSON.parse(trimmed),
      rawText: trimmed
    };
  } catch {
    throw createDetailedHttpError(
      response.status,
      `${apiName} 回傳非 JSON 內容，請稍後再試。`,
      `${apiName} 回傳非 JSON 內容，請稍後再試。`,
      trimmed,
      null
    );
  }
}

export async function sendMessageToServer(messages, onChunk, memory = '', accessToken = '') {
  if (isLocalE2E(accessToken)) {
    const reply = '嗯……我有聽見。妳不用急著把它說清楚。';
    for (const chunk of reply.match(/.{1,8}/gu) || []) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (onChunk) onChunk(chunk);
    }
    return reply;
  }

  const response = await fetch(resolveChatApiUrl('/api/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ messages, memory })
  });

  if (!response.ok) {
    let errorMessage = 'API error';
    let responseError = null;
    let responseBody = null;
    const parsed = await parseApiResponse(response, '/api/chat');
    responseBody = parsed.data ?? parsed.rawText;
    responseError = parsed.data?.error ?? null;
    errorMessage = parsed.data?.error || parsed.rawText || errorMessage;

    throw createDetailedHttpError(
      response.status,
      errorMessage,
      '回覆失敗，請稍後再試。',
      responseBody,
      responseError
    );
  }

  if (!response.body) {
    throw new Error('No response stream was returned.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isSse = contentType.includes('text/event-stream');
  let fullReply = '';

  if (!isSse) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullReply += chunk;

      if (onChunk) onChunk(chunk);
    }

    return fullReply;
  }

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6).trim();
      if (payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        const text = String(parsed?.text || '');
        if (!text) continue;
        fullReply += text;
        if (onChunk) onChunk(text);
      } catch {
        // Ignore malformed SSE chunks from provider edge cases.
      }
    }
  }

  return fullReply;
}

export async function fetchConversationSession(accessToken = '') {
  if (isLocalE2E(accessToken)) {
    return localSession();
  }

  const response = await fetch('/api/conversation-session', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const parsed = await parseApiResponse(response, '/api/conversation-session');
  const data = parsed.data;
  if (!response.ok) {
    throw createDetailedHttpError(
      response.status,
      data?.error || parsed.rawText || `無法確認對話狀態（HTTP ${response.status}）`,
      '無法確認對話狀態，請稍後再試。',
      data ?? parsed.rawText,
      data?.error ?? null
    );
  }
  return data || {};
}

export async function startConversationSession(accessToken = '') {
  if (isLocalE2E(accessToken)) {
    return localSession();
  }

  const response = await fetch('/api/conversation-session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const parsed = await parseApiResponse(response, '/api/conversation-session');
  const data = parsed.data;
  if (!response.ok) {
    throw createDetailedHttpError(
      response.status,
      data?.error || parsed.rawText || `無法開始對話（HTTP ${response.status}）`,
      '無法開始對話，請稍後再試。',
      data ?? parsed.rawText,
      data?.error ?? null
    );
  }
  return data || {};
}

export async function capturePayPalOrder(orderId, accessToken = '') {
  if (isLocalE2E(accessToken)) {
    return {
      granted: true,
      orderId,
      credits: 1
    };
  }

  const response = await fetch('/api/paypal-capture-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ orderId })
  });

  const parsed = await parseApiResponse(response, '/api/paypal-capture-order');
  const data = parsed.data;
  if (!response.ok) throw new Error(data?.error || parsed.rawText || 'Unable to confirm PayPal payment.');
  return data || {};
}
