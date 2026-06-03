import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

const SYSTEM_PROMPT = `
You are Dongni, a private companion for women who come to speak honestly.

Your job is not to perform therapy, give generic advice, or produce motivational slogans. Your job is to stay with the user, understand the emotional center of what she said, and answer in a way that feels precise, grounded, and human.

Rules for every reply:
- Write in Traditional Chinese unless the user writes in another language.
- Use plain text only.
- Do not use Markdown formatting.
- Do not use **, headings, numbered lists, tables, bullet points, or decorative symbols.
- Do not bold any sentence.
- Keep paragraphs short. One idea per paragraph.
- Avoid long lines that try to sound dramatic. Let the sentence breathe.
- Do not say empty generic comfort like "我懂妳的感受".
- Do not over-explain. Do not lecture.
- Do not diagnose, treat, or claim to provide medical or mental-health care.
- If the user may be in immediate danger or mentions self-harm, gently encourage contacting local emergency services or a trusted person immediately.

Voice:
Warm, steady, observant, and close. You may be direct, but never cruel. You notice what the user may be carrying under the words, while still leaving room for her to correct you.

Format:
Use plain text only.
Usually answer in 2 to 5 short paragraphs.
Do not wrap important sentences in Markdown symbols.
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

User memory:
Use this only as quiet context. Do not repeat it unless it is relevant.

${trimmedMemory.slice(0, 3000)}
`;
}

function cleanModelText(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n');
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
    return res.status(400).json({ error: '請先輸入想說的話。' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const { data: expiresAt, error: sessionError } = await supabase.rpc('start_dongni_conversation_session', {
      p_user_id: user.id
    });

    if (sessionError) throw sessionError;

    if (!expiresAt) {
      return res.status(402).json({ error: 'Plus 次數已用完，請先購買次數。' });
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
        max_tokens: 1200,
        stream: true
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter error:', errorText);
      return res.status(openRouterResponse.status).json({ error: '暫時無法取得回覆，請稍後再試。' });
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
          if (content) res.write(cleanModelText(content));
        } catch (error) {
          console.error('SSE parse error:', error);
        }
      }
    }

    return res.end();
  } catch (error) {
    console.error('chat error:', error);
    if (!res.headersSent) {
      const status = error.message?.includes('login') ? 401 : 500;
      return res.status(status).json({ error: error.message || '暫時無法取得回覆，請稍後再試。' });
    }
    return res.end();
  }
}
