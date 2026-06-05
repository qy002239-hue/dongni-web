const localE2EToken = 'local-e2e-token';

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
    const reply = '我在。妳不用把自己整理好才可以說，現在這個有點累的妳，也可以被好好接住。';
    for (const chunk of reply.match(/.{1,8}/gu) || []) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (onChunk) onChunk(chunk);
    }
    return reply;
  }

  const response = await fetch('/api/chat', {
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
    } catch {}
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('No response stream was returned.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullReply = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    fullReply += chunk;

    if (onChunk) onChunk(chunk);
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
