export async function sendMessageToServer(messages, onChunk) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });

  if (!response.ok) throw new Error('API error');

  const data = await response.json();
  if (onChunk) onChunk(data.reply);
  return data.reply;
}