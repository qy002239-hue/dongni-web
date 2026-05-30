export async function sendMessageToServer(messages, onChunk) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });

  if (!response.ok) throw new Error('API error');

  // 启用 streaming 读取
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullReply = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullReply += chunk;
      
      // 实时回调每个 chunk
      if (onChunk) onChunk(chunk);
    }
  } finally {
    reader.cancel();
  }

  return fullReply;
}