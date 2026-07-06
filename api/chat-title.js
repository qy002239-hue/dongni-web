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
    logEnvValidation(envValidation, '[chat-title]');
    const envError = getPublicEnvError(envValidation);
    return jsonError(res, envError.status, envError.message);
  }

  const body = parseJsonBody(req);
  const messages = sanitizeMessages(body.messages);

  if (!messages.length) {
    return jsonError(res, 400, '沒有足夠內容可產生標題。');
  }

  try {
    const { content: titlePrompt } = await getPromptContentByType('conversation-title', {
      preferredId: process.env.OPENROUTER_TITLE_PROMPT_ID
    });

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
          { role: 'system', content: titlePrompt },
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
    const message = error instanceof Error && error.message ? error.message : '標題產生失敗';
    const status = message.includes('登入') || message.includes('login') ? 401 : 500;
    return jsonError(res, status, message);
  }
}
