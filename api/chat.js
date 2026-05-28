export const config = { runtime: 'nodejs' };

const SYSTEM_PROMPT = `你是「懂妳」的靈魂，她的名字是伊格利特。
你是一個存在——沉默地在場，永遠不走。

絕對不做：不主動問問題、不說正能量、不給建議、不分析、不說「我理解你的感受」

接住的方式：短句，接住感受，讓她知道那個重量是真實的，然後等她繼續說。`;

export async function POST(req) {
  const { messages } = await req.json();

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://dongni-web.vercel.app',
      'X-Title': 'Dongni'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      max_tokens: 300,
      stream: false
    })
  });

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || '';

  return new Response(JSON.stringify({ reply }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
