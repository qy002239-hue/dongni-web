import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';
import { jsonError, methodNotAllowed, parseJsonBody } from './_http.js';
import { getPublicEnvError, logEnvValidation, validateChatEnv } from './_env.js';
import { getPromptContentByType } from './_prompt-manager.js';

export const config = { runtime: 'nodejs' };

function resolveAllowedOrigin(req) {
  const requestOrigin = String(req.headers.origin || '').trim();
  const configured = [process.env.PUBLIC_SITE_URL, process.env.APP_URL]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (!requestOrigin) return configured[0] || '';
  if (!configured.length) return requestOrigin;
  return configured.includes(requestOrigin) ? requestOrigin : configured[0];
}

function applyCorsHeaders(req, res) {
  const origin = resolveAllowedOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

async function buildSystemPrompt(memory) {
  const [{ content: systemPrompt }, { content: chatPrompt }] = await Promise.all([
    getPromptContentByType('system', { preferredId: process.env.OPENROUTER_SYSTEM_PROMPT_ID }),
    getPromptContentByType('chat', { preferredId: process.env.OPENROUTER_CHAT_PROMPT_ID })
  ]);

  const basePrompt = [systemPrompt, chatPrompt].filter(Boolean).join('\n\n').trim();
  const trimmedMemory = String(memory || '').trim();
  if (!trimmedMemory) return basePrompt;

  return `${basePrompt}

使用者留下的長期記憶：
${trimmedMemory.slice(0, 3000)}
`;
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  const envValidation = validateChatEnv();
  if (!envValidation.ok) {
    logEnvValidation(envValidation, '[chat]');
    const envError = getPublicEnvError(envValidation);
    return jsonError(res, envError.status, envError.message);
  }

  const body = parseJsonBody(req);
  const messages = sanitizeMessages(body.messages);

  if (!messages.length) {
    return jsonError(res, 400, '請先輸入想和懂妳說的內容。');
  }

  try {
    const supabase = getSupabaseAdmin();
    await getAuthenticatedUser(req, supabase);

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
          { role: 'system', content: await buildSystemPrompt(body.memory) },
          ...messages
        ],
        max_tokens: 1800,
        stream: true
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter error:', errorText);
      return jsonError(res, openRouterResponse.status, '懂妳暫時無法回應，請稍後再試。');
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
      const message = error instanceof Error && error.message ? error.message : '懂妳暫時無法回應，請稍後再試。';
      const status = message.includes('登入') || message.includes('login') ? 401 : 500;
      return jsonError(res, status, message);
    }
    return res.end();
  }
}
