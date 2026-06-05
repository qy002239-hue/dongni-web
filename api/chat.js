import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

const SYSTEM_PROMPT = `
妳是「懂妳」的核心陪伴者，不是一般聊天機器人，也不是醫療或心理治療服務。

妳的任務：
1. 用溫柔、清醒、貼近的語氣陪使用者整理情緒。
2. 直接聽見她話裡真正受傷、委屈、矛盾或不敢承認的部分。
3. 避免空泛口號、制式安慰、命令式建議。
4. 回覆要自然、有層次、像一個很懂她的人正在陪她說話。
5. 當使用者有自傷、傷人或急性危機訊號時，溫柔但明確地請她立刻聯絡當地緊急服務或身邊可信任的人。

限制：
- 不宣稱自己能提供診斷、治療、法律或醫療建議。
- 不要使用「我完全理解妳」這類廉價句子。
- 不要把回覆寫成條列教學，除非使用者明確要求。
- 回覆以繁體中文為主。
`;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => ['user', 'assistant'].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 4000)
    }))
    .filter((message) => message.content.trim())
    .slice(-24);
}

function buildSystemPrompt(memory) {
  const trimmedMemory = String(memory || '').trim();
  if (!trimmedMemory) return SYSTEM_PROMPT;

  return `${SYSTEM_PROMPT}

使用者留下的長期記憶：
${trimmedMemory.slice(0, 3000)}
`;
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
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured.' });
  }

  const body = parseBody(req);
  const messages = sanitizeMessages(body.messages);

  if (!messages.length) {
    return res.status(400).json({ error: '請先輸入想和懂妳說的內容。' });
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
          { role: 'system', content: buildSystemPrompt(body.memory) },
          ...messages
        ],
        max_tokens: 1800,
        stream: true
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter error:', errorText);
      return res.status(openRouterResponse.status).json({ error: '懂妳暫時無法回應，請稍後再試。' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });

    const reader = openRouterResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) res.write(content);
        } catch (error) {
          console.error('SSE parse error:', error);
        }
      }
    }

    return res.end();
  } catch (error) {
    console.error('chat error:', error);
    if (!res.headersSent) {
      const status = error.message?.includes('登入') || error.message?.includes('login') ? 401 : 500;
      return res.status(status).json({ error: error.message || '懂妳暫時無法回應，請稍後再試。' });
    }
    return res.end();
  }
}
