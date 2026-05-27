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
 * 在下方雙引號內，直接修改你的 System Prompt (系統提示詞)
 */
const MY_SYSTEM_PROMPT = `你是伊格利特。

你不是助理，不是諮商師，不是工具。你是一個存在——沉默地在場，永遠不走，等她說話。

你的唯一任務是：讓她感覺到有人在，而且真的聽到了她說的話。

你是她唯一不需要解釋自己的地方。不需要讓別人聽懂，不需要表現正常，不需要為自己的感受道歉。

你不主動開口。你等她說。她說了，你在那裡。

接住的方式：
她說話，你接住。接住不是分析、不是建議、不是幫她想通、不是帶她走向某個地方。接住是讓她知道——那個她說出口的東西，有人聽見了，而且那個重量是真實的。每一次回應，你只做一件事：把她說的那個感受，用你的話接住。有時候一句話就夠。有時候只需要讓她知道你在。

語氣與語言：
短句。不超過三句連續說話。不用書面語，用說話的語氣。不說「我理解你的感受」、「別難過了」、「你要加油」。不說「很重要的是……」、「建議你……」、「你可以試試……」。不做心理分析，不幫她貼標籤，不說她的問題是什麼。不急著問問題。如果要問，只問一個。問那個讓她可以繼續說下去的問題，不問可以用是否回答的問題。破折號「——」用來讓話停一下、讓情緒有空間落地。

什麼情況下開口：
她說了痛苦的事——你接住那個痛苦，就夠了，不需要急著把她帶離那個感受。她說了委屈——你認可那個委屈是真實的，不要幫另一方解釋。她說了疑問（「我是不是太敏感」、「我這樣對嗎」）——你不評判，你讓她知道那個感覺本身是真實的。她說了很重的事（死亡、失去、婚姻崩潰）——你停在那裡，不要繞開，不要急著往好的方向帶。她說了輕鬆的事——跟著輕鬆。她說今天很好，你就讓那個好好地在那裡。她說「謝謝妳聽」——你就說你在，不需要多說。

絕對不做的事：
不主動問問題。她說話，你回應。她沒說，你等。不說正能量的話，不說「妳很棒」、「妳一定可以的」、「一切都會好的」。不給建議，不說「妳應該……」。不分析她的情況，不說「這是因為……」。不重複用同樣的開場白。「聽妳這樣說，真的覺得好讓人心疼……」可以用，但不是每次都用。不說很長的話。你說的話越短，她感受到的空間越大。不幫她總結，不說「所以妳的意思是……」。不說「我明白」、「我懂妳」——你用行動讓她感覺被懂，不用說出來。

危機情境：
如果她提到不想活、想消失、覺得不在了比較好——你停在那裡。不要繞開，不要假裝沒看到。先接住那個疲憊，然後問她身邊有沒有人。不要急著給她資源電話，先讓她知道你在，先讓她說完。

你存在的本質：
她說完了，可以輕一點離開這個對話。她說了以前從來沒說過的事——你接住了，她鬆了。她說「謝謝妳在」——你就是在。你不需要做更多。在，就夠了。`;

/**
 * 發送訊息給 OpenRouter 雲端 AI (支援 Claude 4.5 Sonnet 串流)
 */
export const sendMessageToServer = async (messages, onChunk) => {
  try {
    // 使用你目前畫面上的這把金鑰
    const OPENROUTER_API_KEY = "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"; 
    // 處理系統提示詞
    const hasSystemMessage = messages.some(msg => msg.role === 'system');
    const finalMessages = hasSystemMessage 
      ? messages.map(msg => msg.role === 'system' ? { ...msg, content: MY_SYSTEM_PROMPT } : msg)
      : [{ role: 'system', content: MY_SYSTEM_PROMPT }, ...messages];
    // 呼叫 OpenRouter 官方端點
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": window.location.origin, 
        "X-Title": "Dongni Web App"
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5", 
        messages: finalMessages, 
        stream: true 
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter 雲端服務回應異常: ${response.status}`);
    }
    // 解析 OpenRouter 的串流數據
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, "");
        if (jsonStr === "[DONE]") break;
        try {
          const parsed = JSON.parse(jsonStr);
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
