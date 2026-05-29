import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }));
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message, messages } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let formattedMessages = messages ? messages.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })) : [{ role: 'user', content: message }];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "HTTP-Referer": "http://localhost:5173",
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

app.listen(3001, () => {
  console.log("守護者核心：純Fetch暴力對接通電！3001點火！");
});
