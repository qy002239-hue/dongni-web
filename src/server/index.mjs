import express from 'express';
import cors from 'cors';

const app = express();

// CORS 配置：允許指定的來源，或在開發時允許 localhost
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.post('/api/chat', async (req, res) => {
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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterApiKey}`,
        "HTTP-Referer": process.env.HTTP_REFERER || "http://localhost:5173",
        "X-Title": "DongNi",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "anthropic/claude-3-opus",
        "messages": formattedMessages,
        "stream": true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter 拒絕連線: ${errText}`);
    }

    const reader = response.body;
    reader.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const text = parsed.choices?.[0]?.delta?.content || "";
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          } catch (e) {
          }
        }
      }
    });

    reader.on('end', () => res.end());

  } catch (error) {
    console.error(error);
    res.write(`data: ${JSON.stringify({ error: 'Claude連線失敗', details: error.message })}\n\n`);
    res.end();
  }
});

// 健康檢查端點
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`懂妳服務器已啟動，監聽連接埠 ${PORT}`);
});
