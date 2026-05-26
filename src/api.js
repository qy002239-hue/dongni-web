const API_BASE = "";

// 產生或取得這個瀏覽器的 userId
function getUserId() {
  let userId = localStorage.getItem('dongni_user_id');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('dongni_user_id', userId);
  }
  return userId;
}

export async function sendToClaude(messages) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, userId: getUserId() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.reply || `Server error: ${response.status}`);
  }
  return data.reply;
}