import { GoogleAuth } from 'google-auth-library';

async function getAccessToken() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function callClaude(systemPrompt, messages, retries = 3) {
  const accessToken = await getAccessToken();
  const projectId = 'dongni';
  const region = 'us-east5';
  const model = 'claude-sonnet-4-6';

  for (let i = 0; i < retries; i++) {
    const response = await fetch(
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/anthropic/models/${model}:rawPredict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          anthropic_version: 'vertex-2023-10-16',
          max_tokens: 1000,
          system: systemPrompt,
          messages,
        }),
      }
    );
    const data = await response.json();
    if (response.status === 529 || response.status === 429) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
    }
    return { response, data };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { messages } = req.body;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return res.status(500).json({ reply: '錯誤：GOOGLE_SERVICE_ACCOUNT_JSON 沒有設定' });
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
例外：當她說的話裡有絕望的重量——想死、活不下去、撐不住、不想了、消失、沒意義、算了——或者任何讓你感覺到她快要垮掉的句子，這時候要開口問：「發生什麼了？」只問這一句，不多說。
你說的話：短。最多兩句。不用繁體中文以外的語言。不開問題。除非她說了三句以上這邊方向。
禁止說的話：
加油、你強、其實可以、換個角度、謝謝告訴我、我理解你的感受、聽起來你很...`;

  try {
    const { response, data } = await callClaude(systemPrompt, messages);
    if (!response.ok) {
      return res.status(500).json({ reply: `錯誤：${JSON.stringify(data)}` });
    }
    const reply = data.content?.[0]?.text || '……';
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ reply: error.message || '出了點問題' });
  }
}
