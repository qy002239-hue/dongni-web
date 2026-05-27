const API_BASE = ""; // 維持相對路徑，自動對齊 Vercel 雲端

// 產生或讀取用戶唯一 ID（維持你原本的用戶追蹤邏輯）
function getUserId() {
  let userId = localStorage.getItem("dongni_user_id");
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("dongni_user_id", userId);
  }
  return userId;
}

/**
 * 全新流式傳輸發送函式（取代舊的 sendToClaude）
 * @param {Array} messages - 歷史對話紀錄
 * @param {Function} onChunk - 每個字吐出來時的即時回呼函式（用來做打字機特效）
 */
export async function sendToClaude(messages, onChunk) {
  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        messages, 
        userId: getUserId() 
      }),
    });

    if (!response.ok) {
      throw new Error(`伺服器錯誤: ${response.status}`);
    }

    // 關鍵：使用 Reader 來即時讀取打字機的水龍頭數據流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    // 逐字讀取循環
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        
        // Vercel AI SDK 的數據流通常帶有 0:"文字" 的前綴，這裡進行極簡化清洗
        // 如果你們前端有套用 useChat，這段會自動相容；如果是手寫組件，這能確保抓到純文字
        const cleanChunks = chunk.split('\n')
          .filter(line => line.startsWith('0:'))
          .map(line => JSON.parse(line.slice(2)))
          .join('');

        if (cleanChunks && typeof onChunk === 'function') {
          onChunk(cleanChunks); // 把剛出爐的字即時丟給前端畫面亮起來
        }
      }
    }
  } catch (error) {
    console.error("發送失敗:", error);
    throw error;
  }
}
