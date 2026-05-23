const API_BASE = "";
export async function sendToClaude(messages) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.reply || `Server error: ${response.status}`);
  }
  return data.reply;
}
