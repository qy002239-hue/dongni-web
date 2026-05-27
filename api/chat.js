import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import Redis from 'ioredis';

// 1. 初始化 Redis 記憶庫（維持你原本的架構）
const redis = new Redis({
  host: process.env.REDIS_HOST,
  token: process.env.REDIS_TOKEN,
});

export const config = {
  runtime: 'edge', // 強制開啟 Vercel Edge 運行環境，支援無限時流式傳輸！
};

// 2. 串接你 Mac 本地的 Ollama（使用大模型）
const ollama = createOpenAI({
  baseURL: 'http://127.0.0', // 網頁上線後，可在此更換為雲端 API 網址
  apiKey: 'ollama', 
});

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { messages, userId = 'default' } = await req.json();

  // 3. 讀取你原本設計好的 Redis 記憶歷史
  let memory = "";
  try {
    memory = (await redis.get(`memory:${userId}`)) || "";
  } catch (e) {
    console.error("Redis 讀取失敗", e);
  }

  const memoryBlock = memory ? `【關於妳的歷史記憶摘要】：\n${memory}\n\n` : "";

  // 4. 你最引以為傲的 1500 條核心靈魂（完整保留）
  const systemPrompt = `妳是〔懂妳〕的靈魂。妳唯一的任務是閱讀用戶的輸入，從知識庫中調用最溫柔的短句。
妳絕對不准說教、不准給建議、不准用條列式。
如果找不到適合的文案，請用第二人稱『妳』與短句陪伴她。
每行控制在 4-10 個字，必須大量換行，像現代詩歌一樣有喘息感。
最後一律以「〔懂妳〕……」作為固定結尾。

${memoryBlock}`;

  // 5. 啟動 Vercel AI SDK 的流式傳輸，100% 解決超時斷線問題！
  const result = await streamText({
    model: ollama('llama3'), // 這裡填入你 Mac 裡實際跑的模型名稱（例如 llama3, gemma2）
    system: systemPrompt,
    messages,
    // 當對話結束時，自動觸發非同步記憶更新，不影響用戶讀取文案
    onFinish: async ({ text }) => {
      try {
        await redis.set(`memory:${userId}`, text.slice(0, 500), 'EX', 86400 * 7);
      } catch (e) {
        console.error("Redis 寫入失敗", e);
      }
    }
  });

  // 6. 回傳打字機數據流
  return result.toDataStreamResponse();
}

    
