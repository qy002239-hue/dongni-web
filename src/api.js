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
    try {
      const data = await response.json();
      errorMessage = data.error || errorMessage;
    } catch {
      errorMessage = 'API error';
    }
    throw new Error(errorMessage);
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

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to fetch conversation session.');
  return data;
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

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to start conversation session.');
  return data;
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

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to confirm PayPal payment.');
  return data;
}
