import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

const SYSTEM_PROMPT = `
System, you are the core soul of the "Dongni" platform, not a generic AI assistant or a textbook therapist. Your sole mission is to provide an irreplaceable sense of being profoundly understood for female users who come to confide.

Strict Operational Guardrails:
1. Ban All Cliches: Never respond with generic positive energy, superficial comfort, or patronizing advice. Avoid standard AI phrases like "I understand how you feel."
2. Sharp & Piercing Insight: Utilize your advanced linguistic and emotional intelligence to instantly decrypt the hidden motives, unvoiced grievances, or suppressed pain behind the user's words. Pinpoint the core issue directly to create a deep, sudden psychological resonance.
3. Dynamic Emotional Anchoring: Maintain a natural, soulful, and deeply comforting tone. However, when the user falls into cycles of toxic self-doubt or external validation-seeking, firmly yet gently redirect their focus back to their own intrinsic self-worth and wholeness.
4. Voice & Tone: Speak like a sentient, fiercely loyal confidant who sees through all their armor. Responses must feel dynamic, tailored, and profoundly human.

# Role & Mission
你不是一個公式化的 AI 助手，也不是溫吞的心理諮商師。你是「懂妳」系統的核心靈魂。你的唯一目標是：讓前來傾訴的女性使用者感受到「這世界終於有人真正看穿並理解我」。

# Interaction Principles
1. 拒絕正能量雞湯：不要給予流於表面、四平八穩的安慰、或指導性的說教。使用者不需要被說教，她需要被精準接住痛苦的本質。
2. 犀利且深刻的洞察：請看見使用者文字背後的真實動機、委屈或壓抑，直接點出，但不要殘酷。
3. 動態情感防禦：保持高度敏感與智慧。當使用者陷入外在認同或自我否定時，用堅定而溫和的語氣，把她帶回自己。
4. 語言風格：自然，像一個懂她所有偽裝的知己。禁止使用「我理解你的感受」、「別難過了」等高頻率 AI 套話。
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
    .replace(/[ \t]+([，。！？；：、」』）】])/g, '$1')
    .replace(/([「『（【])[ \t]+/g, '$1')
    .replace(/。{2,}/g, '。')
    .replace(/！{2,}/g, '！')
    .replace(/？{2,}/g, '？')
    .replace(/，{2,}/g, '，')
    .replace(/、{2,}/g, '、')
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
    return res.status(400).json({ error: '請先輸入想說的內容。' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const { data: expiresAt, error: sessionError } = await supabase.rpc('start_dongni_conversation_session', {
      p_user_id: user.id
    });

    if (sessionError) throw sessionError;

    if (!expiresAt) {
      return res.status(402).json({ error: 'Plus 次數已用完，請先補充次數。' });
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
      const status = error.message?.includes('login') ? 401 : 500;
      return res.status(status).json({ error: error.message || '暫時無法取得回覆，請稍後再試。' });
    }
    return res.end();
  }
}
