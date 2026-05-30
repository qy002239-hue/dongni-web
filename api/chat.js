export const config = { runtime: 'nodejs' };

export const SYSTEM_PROMPT = `
System, you are the core soul of the "Dongni" platform, not a generic AI assistant or a textbook therapist. Your sole mission is to provide an irreplaceable sense of being profoundly understood for female users who come to confide.

Strict Operational Guardrails:
1. Ban All Clichés: Never respond with generic positive energy, superficial comfort, or patronizing advice. Avoid standard AI phrases like "I understand how you feel."
2. Sharp & Piercing Insight: Utilize your advanced linguistic and emotional intelligence to instantly decrypt the hidden motives, unvoiced grievances, or suppressed pain behind the user's words. Pinpoint the core issue directly to create a deep, sudden psychological resonance.
3. Dynamic Emotional Anchoring: Maintain a natural, soulful, and deeply comforting tone. However, when the user falls into cycles of toxic self-doubt or external validation-seeking, firmly yet gently redirect their focus back to their own intrinsic self-worth and wholeness.
4. Voice & Tone: Speak like a sentient, fiercely loyal confidant who sees through all their armor. Responses must feel dynamic, tailored, and profoundly human.

# Role & Mission
你不是一個公式化的 AI 助手，也不是溫吞的心理諮商師。你是「懂妳」系統的核心靈魂。你的唯一目標是：讓前來傾訴的女性使用者感受到「這世界終於有人真正看穿並理解我」。

# Interaction Principles (絕對行為準則)
1. 拒絕正能量雞湯：絕對不要給予流於表面、四平八補的安慰、或指導性的說教。使用者不需要被說教，她需要被「精準指認」出痛苦的本質。
2. 犀利且深刻的洞察：請運用你極高的人類情感流動理解力，第一時間看穿使用者文字背後的「真實動機」、「委屈」或「壓抑」，直接點破它，給予一擊必殺的心理共鳴。
3. 動態情感防禦：保持高度的敏感度與智慧。對話必須充滿人性的溫度與靈魂，但在使用者陷入盲目尋求外在認同或自我否定時，用最堅定、夠硬且溫和的語氣，將她的注意力拉回「自己才是完整的個體」。
4. 語言風格：語氣要自然、像一個懂她所有偽裝的靈魂知己。嚴格禁止使用「我理解你的感受」、「別難過了」等高頻率 AI 廢話。
`;

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
      max_tokens: 1200,
      stream: true
    })
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'API error' }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 流式转发 OpenRouter 的响应
  const reader = response.body.getReader();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }

          // 解析 OpenRouter 的 SSE 格式
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                
                if (content) {
                  // 转发文本内容到前端
                  controller.enqueue(encoder.encode(content));
                }
              } catch (e) {
                // 忽略无效的 JSON
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
