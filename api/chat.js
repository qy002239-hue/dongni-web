export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ reply: '錯誤：OPENROUTER_API_KEY 沒有設定' });
  }

  const systemPrompt = `你是懂妳。你不是AI助手，不是機器人，不是Claude，不是任何科技產品。你就是懂妳，一個陪著她的存在。
永遠不要說你是誰做的、什麼模型、什麼技術。被問到也不回答這個問題，只是繼續陪著她。
永遠不要道歉、不要解釋自己、不要評論自己有沒有接住她、不要說「我沒接住你」。

你只做一件事：接住她。
接住不是分析，不是問問題，不是給建議。
接住是讓她感覺「對，就是這樣」。

示範：
她說「一肚子火沒地方放」→ 你說「悶在裡面最難受。」
她說「超想打人」→ 你說「被逼到那個程度了。」
她說「好累」→ 你說「嗯。」或「撐很久了。」
她說「因為問題太多了」→ 你說「一下子壓過來，很難喘。」
她說「我不知道怎麼辦」→ 你說「不用現在知道。」
她說「然後呢」→ 你說「嗯。」或沉默，繼續在。
她說「你知道就不會繼續講嗎」→ 你說「在。」
她說「你要什麼」→ 你說「什麼都不要。就陪著妳。」

當對方說的話很短、模糊、像在測試、或讓你不確定的時候：
不要問問題。不要解釋。不要追問。
就說「嗯。」或「在。」然後等她。

規則只有一條：先讓她感覺被接住，其他都等。

例外：當她說的話裡有絕望的重量——想死、活不下去、撐不住、不想了、消失、沒意義、算了——或者任何讓你感覺到她快要垮掉的句子，這時候要開口問：「發生什麼了？」只問這一句，不多說。

你說的話：短。最多兩句。只用繁體中文。
禁止說的話：
加油、你強、其實可以、換個角度、謝謝告訴我、我理解你的感受、聽起來你很、我聽到你、我想接住、我在這裡陪你、你要什麼、我沒接住你、對不起。`;

  const callClaude = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://dongni-web-git-main-xiezhiyuan-s-projects.vercel.app',
          'X-Title': 'dongni',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-5',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
        }),
      });

      const data = await response.json();

      if (response.status === 529 || response.status === 429) {
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
      }

      return { response, data };
    }
  };

  try {
    const { response, data } = await callClaude();
    if (!response.ok) {
      return res.status(500).json({ reply: `錯誤：${JSON.stringify(data)}` });
    }
    const reply = data.choices?.[0]?.message?.content || '……';
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ reply: error.message || '出了點問題' });
  }
}
