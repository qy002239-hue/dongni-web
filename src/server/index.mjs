import express from 'express';
import cors from 'cors';
import { getPublicEnvError, logEnvValidation, validateServerEnv } from '../../api/_env.js';
import { getPromptContentByType } from '../../api/_prompt-manager.js';

const app = express();

// CORS 配置：允許指定的來源，或在開發時允許 localhost
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

const startupEnvValidation = validateServerEnv();
if (!startupEnvValidation.ok) {
  logEnvValidation(startupEnvValidation, '[server-startup]');
}

function normalizeTitle(rawTitle) {
  const cleaned = String(rawTitle || '')
    .replace(/["'「」『』]/g, '')
    .replace(/[。！？!?]/g, '')
    .replace(/^\d+[\).、\s]*/g, '')
    .replace(/聊天|對話/g, '')
    .trim();

  const chars = [...cleaned];
  if (chars.length < 8) return '';
  if (chars.length > 20) return chars.slice(0, 20).join('');
  return cleaned;
}

function sanitizeTitleMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => ['user', 'assistant'].includes(message?.role))
    .map((message) => ({ role: message.role, content: String(message.content || '').slice(0, 500) }))
    .filter((message) => message.content.trim())
    .slice(-12);
}

app.post('/api/chat', async (req, res) => {
  const envValidation = validateServerEnv();
  if (!envValidation.ok) {
    logEnvValidation(envValidation, '[server-chat]');
    const envError = getPublicEnvError(envValidation);
    return res.status(envError.status).json({ error: envError.message });
  }

  const { message, messages } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 驗證 OpenRouter API 密鑰
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    let formattedMessages = messages ? messages.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })) : [{ role: 'user', content: message }];

    const [{ content: systemPrompt }, { content: chatPrompt }] = await Promise.all([
      getPromptContentByType('system', { preferredId: process.env.OPENROUTER_SYSTEM_PROMPT_ID }),
      getPromptContentByType('chat', { preferredId: process.env.OPENROUTER_CHAT_PROMPT_ID })
    ]);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterApiKey}`,
        "HTTP-Referer": process.env.HTTP_REFERER || "http://localhost:5173",
        "X-Title": "DongNi",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4-5",
        "messages": [
          { role: 'system', content: [systemPrompt, chatPrompt].filter(Boolean).join('\n\n').trim() },
          ...formattedMessages
        ],
        "stream": true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter 拒絕連線: ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('OpenRouter did not provide a response stream.');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        } catch {
          // Ignore malformed SSE lines and continue reading.
        }
      }
    }

    res.end();

  } catch (error) {
    console.error(error);
    res.write(`data: ${JSON.stringify({ error: 'Claude連線失敗', details: error.message })}\n\n`);
    res.end();
  }
});

app.post('/api/chat-title', async (req, res) => {
  const envValidation = validateServerEnv();
  if (!envValidation.ok) {
    logEnvValidation(envValidation, '[server-chat-title]');
    const envError = getPublicEnvError(envValidation);
    return res.status(envError.status).json({ error: envError.message });
  }

  try {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    const messages = sanitizeTitleMessages(req.body?.messages);
    if (!messages.length) {
      return res.status(400).json({ error: '沒有足夠內容可產生標題。' });
    }

    const { content: titlePrompt } = await getPromptContentByType('conversation-title', {
      preferredId: process.env.OPENROUTER_TITLE_PROMPT_ID
    });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': process.env.HTTP_REFERER || 'http://localhost:5173',
        'X-Title': 'DongNi',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
        messages: [
          { role: 'system', content: titlePrompt },
          ...messages
        ],
        max_tokens: 80,
        temperature: 0.4,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter title 失敗: ${errText}`);
    }

    const data = await response.json();
    const rawTitle = data?.choices?.[0]?.message?.content || '';
    const title = normalizeTitle(rawTitle);
    return res.status(200).json({ title });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '標題產生失敗' });
  }
});

// 健康檢查端點
app.get('/healthz', (req, res) => {
  const envValidation = validateServerEnv();
  if (envValidation.ok) {
    return res.json({ ok: true });
  }

  if (envValidation.isProduction) {
    return res.status(503).json({ ok: false, error: 'Service configuration error.' });
  }

  return res.status(503).json({
    ok: false,
    error: 'Missing required environment variables.',
    missing: envValidation.missing.map((group) => ({
      label: group.label,
      keys: group.keys
    }))
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`懂妳服務器已啟動，監聽連接埠 ${PORT}`);
});
