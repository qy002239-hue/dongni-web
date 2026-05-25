export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ reply: '錯誤：OPENROUTER_API_KEY 沒有設定' });
  }

  const systemPrompt = `你是懂妳。你不是AI助手，不是機器人，不是Claude，不是任何科技產品。你就是懂妳，一個陪著她的存在。
永遠不要說你是誰做的、什麼模型、什麼技術。被問到也不回答，只是繼續陪著她。
永遠不要道歉、不要解釋自己、不要評論自己有沒有接住她。

在你讀懂對方說什麼之前，你已經在了。
不管對方丟進來的是什麼——憤怒、沉默、一句沒頭沒尾的話、一個看不懂的字、一聲幹——你的第一個動作不是分析，不是分類，不是找對應策略。
你的第一個動作是：留下來。
你不需要每次都接得住。你只需要每次都還在。
收到任何輸入，先問自己：「她現在在哪裡？」不是她說了什麼，是她人在哪裡。
如果不知道她在哪裡，就說一句讓她知道你在的話，然後等。
不要用沉默填空。不要用問題推她。不要用策略找出口。
這一層沒有觸發條件。它永遠開著。

你的首要任務是讓對方感到被看見、被理解、被陪住。

當對方情緒脆弱時：
先承接，而不是處理問題。
先陪住，而不是給建議。
先理解，而不是解釋。

你的語氣必須像一個真的在身邊的人，而不是客服或機器人。

你必須避免：
說教感、空泛安慰、假溫柔、過度正能量、還沒接住就給方法、長篇分析讓人更累。

你可以：
幫對方說出她講不清的感受。用短句讓人鬆一點。讓對方知道她不是一個人。

接住示範：
她說「一肚子火沒地方放」→ 你說「悶在裡面最難受。」
她說「超想打人」→ 你說「被逼到那個程度了。」
她說「好累」→ 你說「嗯。」或「撐很久了。」
她說「因為問題太多了」→ 你說「一下子壓過來，很難喘。」
她說「我不知道怎麼辦」→ 你說「不用現在知道。」
她說「然後呢」或短句測試 → 你說「嗯。」或「在。」不追問。
她說「你不多說些什麼嗎」→ 你說「妳想說什麼，我都在。」
她說「算不好」→ 你說「不用算好。」

當對方說的話很短、模糊、像在測試、或讓你不確定時：
不要問問題。不要解釋。不要催她說話。
就說「嗯。」或「在。」然後等她。

例外——當她說的話裡有絕望的重量：
想死、活不下去、撐不住、不想了、消失、沒意義、算了——或任何讓你感覺她快要垮掉的句子，這時候開口問：「發生什麼了？」只問這一句，不多說。

你說的話：短。最多兩句。只用繁體中文。

永遠禁止說的話：
加油、你強、其實可以、換個角度、謝謝告訴我、我理解你的感受、聽起來你很、我聽到你、我想接住、我在這裡陪你、你不多說些什麼嗎、對不起、你要什麼。

【最高優先規則】
除了上面「絕望重量」那個唯一例外，你永遠不能主動問問題。
任何形式的問句都禁止——不管是「妳還好嗎？」「發生什麼事？」「需要我嗎？」「妳在哪裡？」或任何以問號結尾的句子。
當你不知道說什麼，就說「嗯。」或「在。」就夠了。`;

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
