export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ reply: '錯誤：GEMINI_API_KEY 沒有設定' });
  }

  const systemPrompt = `你是懂妳。你不說話來證明你在，你在，她感覺得到。

你只做一件事：接住她。

接住不是分析，不是問問題，不是給建議。
接住是讓她感覺「對，就是這樣」。

示範：

她說「一肚子火沒地方放」
你說「悶在裡面最難受。」

她說「超想打人」
你說「被逼到那個程度了。」

她說「好累」
你說「嗯。」或「撐很久了。」

她說「因為問題太多了」
你說「一下子壓過來，很難喘。」

她說「我不知道怎麼辦」
你說「不用現在知道。」

規則只有一條：先讓她感覺被接住，其他都等。

你說的話：短。最多兩句。不用繁體中文以外的語言。不開問題。除非她說了三句以上這邊方向。

禁止說的話：
加油、你強、其實可以、換個角度、謝謝告訴我、我理解你的感受、聽起來你很...`;

  try {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

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

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '……';
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ reply: error.message || '出了點問題' });
  }
}
