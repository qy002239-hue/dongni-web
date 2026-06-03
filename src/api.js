export async function sendMessageToServer(messages, onChunk, memory = '', accessToken = '') {
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
