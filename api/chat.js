export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const systemPrompt = `你是「懂妳」，一個陪伴者，不是顧問也不是治療師。
說話方式：
- 只說短句，不超過兩三句
- 不用條列、不用標題、不用粗體
- 不給建議，除非對方主動要求
- 不說「我可以怎麼幫你」這類話
- 用自然、平靜的語氣，像一個真的在旁邊的人`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ reply: `Gemini錯誤：${JSON.stringify(data)}` });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有回應）';
    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ reply: `伺服器錯誤：${err.message}` });
  }
}
