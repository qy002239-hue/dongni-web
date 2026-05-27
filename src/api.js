// 取得使用者唯一的 ID（保留原專案設計）
export function getUserId() {
  let userId = localStorage.getItem("dongni_user_id");
  if (!userId) {
    userId = "user_" + Math.random().toString(36).substring(2, 11);
    localStorage.setItem("dongni_user_id", userId);
  }
  return userId;
}

/**
 * 發送訊息給 OpenRouter 雲端 AI (支援 Claude 4.5 Sonnet 串流)
 * @param {Array} messages - 歷史對話陣列
 * @param {Function} onChunk - 逐字接收文字的回調函式 (用於更新畫面)
 */
export const sendMessageToServer = async (messages, onChunk) => {
  try {
    // ⚠️ 請在這裡填入你在 OpenRouter 申請的真實金鑰 (通常是 sk-or-v1- 開頭)
    const OPENROUTER_API_KEY = "你的_OPENROUTER_API_KEY"; 

    // 呼叫 OpenRouter 官方端點
    const response = await fetch("https://openrouter.ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        // OpenRouter 規範：建議帶上這兩個標頭，以便在後台識別你的網站（可隨意填寫）
        "HTTP-Referer": window.location.origin, 
        "X-Title": "Dongni Web App"
      },
      body: JSON.stringify({
        // 指定為 OpenRouter 上的 Claude 4.5 Sonnet 模型代號
        model: "anthropic/claude-4.5-sonnet", 
        messages: messages, // OpenRouter 支援標準 OpenAI 格式，不用刻意過濾 system
        stream: true // 啟動串流模式
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter 雲端服務回應異常: ${response.status}`);
    }

    // 解析 OpenRouter (OpenAI 格式) 的串流數據
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      // 保留最後一個可能不完整的行
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.replace(/^data:\s*/, "");
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          // 擷取 OpenAI/OpenRouter 標準格式中的文字片段
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch (e) {
          // 忽略解析不完整的殘缺資料
        }
      }
    }
  } catch (error) {
    console.error("呼叫 OpenRouter 失敗:", error);
    throw error;
  }
};
