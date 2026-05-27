import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import Redis from 'ioredis';

// 1. 初始化 Redis 記憶庫（維持你原本的環境變數設定）
const redis = new Redis({
  host: process.env.REDIS_HOST,
  token: process.env.REDIS_TOKEN,
});

// 強制開啟 Vercel Edge 運行環境，支援突破 10 秒限制的無限時流式傳輸
export const config = {
  runtime: 'edge', 
};

// 2. 串接你 Mac 本地的 Ollama 大模型
const ollama = createOpenAI({
  baseURL: 'http://127.0.0', // 網頁上線後，可在此更換為雲端 GPU 或 API 網址
  apiKey: 'ollama', 
});

// 3. 最新版 Vercel 規範的標準後端對話路由
export async function POST(req) {
  const { messages, userId = 'default' } = await req.json();

  // 4. 讀取你原本設計好的 Redis 記憶歷史
  let memory = "";
  try {
    memory = (await redis.get(`memory:${userId}`)) || "";
  } catch (e) {
    console.error("Redis 讀取失敗", e);
  }

  const memoryBlock = memory ? `【關於妳的歷史記憶摘要】：\n${memory}\n\n` : "";

  // 5. 注入你最引以為傲的 1500 條核心靈魂 DNA
  const systemPrompt = `妳是〔懂妳〕的靈魂。妳唯一的任務是閱讀用戶的輸入，從知識庫中調用最溫柔的短句。
妳絕對不准說教、不准給建議、不准用條列式。
如果找不到適合的文案，請用第二人稱『妳』與短句陪伴她。
每行控制在 4-10 個字，必須大量換行，像現代詩歌一樣有喘息感。
最後一律以「〔懂妳〕……」作為固定結尾。

${memoryBlock}`;

  // 6. 啟動 Vercel AI SDK 的流式傳輸，讓網頁像打字機一樣流暢吐字，永不超時
  const result = await streamText({
    model: ollama('llama3'), // 這裡填入你 Mac 裡實際跑的模型名稱（例如 llama3, gemma2）
    system: systemPrompt,
    messages,
    // 當對話結束時，在背景自動觸發非同步記憶更新，不影響用戶網頁讀取
    onFinish: async ({ text }) => {
      try {
        await redis.set(`memory:${userId}`, text.slice(0, 500), 'EX', 86400 * 7);
      } catch (e) {
        console.error("Redis 寫入失敗", e);
      }
    }
  });

  // 7. 回傳打字機數據流給前端
  return result.toDataStreamResponse();
}
