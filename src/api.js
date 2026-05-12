const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function sendToClaude(messages) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    let serverReply;
    try {
      const data = await response.json();
      serverReply = data?.reply;
    } catch {
      // body wasn't JSON; fall through
    }
    const err = new Error(serverReply || `Server error: ${response.status}`);
    err.serverReply = serverReply;
    throw err;
  }

  const data = await response.json();
  return data.reply;
}
