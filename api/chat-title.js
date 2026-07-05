import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';

export const config = { runtime: 'nodejs' };

const TITLE_SYSTEM_PROMPT = `
請根據以下對話內容，產生一個繁體中文標題。

規則：
- 長度 8 到 20 個中文字
- 不要加引號
- 不要加句號
- 不要加編號
- 不要出現「聊天」或「對話」
- 必須可概括主題
- 只輸出標題文字，不要任何額外說明
`;

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => ['user', 'assistant'].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 500)
    }))
    .filter((message) => message.content.trim())
    .slice(-12);
}

function normalizeTitle(rawTitle) {
  const cleaned = String(rawTitle || '')
    .replace(/["'「」『』]/g, '')
    .replace(/[。！？!?]/g, '')
    .replace(/^\d+[).、\s]*/g, '')
    .replace(/聊天|對話/g, '')
    .trim();

  const chars = [...cleaned];
  if (chars.length < 8) return '';
  if (chars.length > 20) return chars.slice(0, 20).join('');
  return cleaned;
}

async function getActiveSession(supabase, userId) {
  const { data, error } = await supabase
    .from('dongni_conversation_sessions')
    .select('expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return jsonError(res, 500, 'OPENROUTER_API_KEY is not configured.');
  }

  const body = parseJsonBody(req);
  const messages = sanitizeMessages(body.messages);

  if (!messages.length) {
    return jsonError(res, 400, '沒有足夠內容可產生標題。');
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const activeSession = await getActiveSession(supabase, user.id);

    if (!activeSession?.expires_at) {
      return res.status(402).json({ error: '妳的 Plus 次數已用完，請先購買次數。' });
    }

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.PUBLIC_SITE_URL || req.headers.origin || 'https://dongni-web.vercel.app',
        'X-Title': 'Dongni'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
        messages: [
          { role: 'system', content: TITLE_SYSTEM_PROMPT },
          ...messages
        ],
        max_tokens: 80,
        stream: false,
        temperature: 0.4
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter title error:', errorText);
      return jsonError(res, openRouterResponse.status, '標題產生失敗');
    }

    const data = await openRouterResponse.json();
    const rawTitle = data?.choices?.[0]?.message?.content || '';
    const title = normalizeTitle(rawTitle);

    return res.status(200).json({ title });
  } catch (error) {
    console.error('chat-title error:', error);
    const status = error.message?.includes('登入') || error.message?.includes('login') ? 401 : 500;
    return jsonError(res, status, error.message || '標題產生失敗');
  }
}
