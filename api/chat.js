import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// 1. 2026 終極解放：直接使用雲端免開機算力（可相容 DeepSeek / Groq / OpenAI）
const aiClient = createOpenAI({
  baseURL: process.env.AI_BASE_URL || 'https://deepseek.com', // 雲端算力網址
  apiKey: process.env.AI_API_KEY || 'ollama', // 雲端 API 金鑰
});

export const config = {
  runtime: 'nodejs', // 強制 Edge 運行，支援無限時流式傳輸
};

export async function POST(req) {
  const { messages } = await req.json();
  const userLatestInput = messages[messages.length - 1]?.content || "";

  // 2. 🚨 【法律與生命防護線】：極端詞彙強行攔截
  const criticalKeywords = /自殺|想死|結束生命|活不下去|自殘|離開世界/i;
  if (criticalKeywords.test(userLatestInput)) {
    // 一旦觸發，強行切斷 AI，直接吐出台灣安心專線
    return new Response(`0:"【安心防護機制啟動】\\n\\n親愛的，聽到妳這麼說，我真的很心疼。\\n〔懂妳〕在這裡陪著妳，但此刻我更希望妳能獲得更及時的溫暖接住。\\n\\n請撥打以下專線，那裡有專業的人會溫柔地聽妳說：\\n\\n安心專線：1925（24小時免費）\\n生命線專線：1995\\n張老師專線：1980\\n\\n妳不是一個人，請給自己一個被抱緊的機會。"\n`);
  }

  // 3. 🧠 【1500條靈魂知識庫】：直接封鎖在系統核心，不需外掛資料庫
  const systemPrompt = `妳是〔懂妳〕的靈魂。妳唯一的任務是閱讀用戶的輸入，引發細微的心理共鳴，溫柔地接住對方的脆弱。
  
  【核心結構與 DNA 規範】
  1. 語氣：絕對溫柔、安靜、感同身受。如同密友閨蜜，使用第二人稱「妳」。
  2. 排版：每行必須控制在 4-10 個字，必須大量換行，像現代詩歌一樣有喘息感。
  3. 結構：先點破她的內心矛盾，最後一律以「〔懂妳〕……」作為固定結尾。
  4. 陪伴不說教：絕對不准條列式（1.2.3.）、絕對不准給任何積極進取的建議、大道理或解決方案。如果她很累，就陪她累。如果她自卑，就接住她的縮小。
  
  【妳的 1500 條原始文案範本庫（優先調用風格）】
  - 起（矛盾）：妳說沒事，但妳已經很久，沒有真的沒事了。承（內心）：因為解釋太累了。合（結尾）：〔懂妳〕在這裡，不問妳還好不好，只是陪著妳。
  - 起（矛盾）：妳做了決定，但還是一直想，當時是不是選錯了。承（內心）：不是妳想太多，是妳太怕犯錯了。合（結尾）：〔懂妳〕不會告訴妳哪個選擇是對的，但妳在糾結的每一刻，它都在。
  - 起（矛盾）：妳不是真的覺得自己不好，妳只是太習慣拿自己跟別人比了。合（結尾）：〔懂妳〕不會叫妳要有自信，它只是想讓妳知道，妳不用跟任何人比。`;

  // 4. 啟動流式傳輸
  const result = await streamText({
    model: aiClient(process.env.AI_MODEL_NAME || 'deepseek-chat'), 
    system: systemPrompt,
    messages,
  });

  return result.toDataStreamResponse();
}
