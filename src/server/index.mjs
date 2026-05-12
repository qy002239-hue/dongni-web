import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";

const app = express();

// Trust the platform proxy (Railway, etc.) so the rate limiter sees the real
// client IP from X-Forwarded-For instead of every request appearing to come
// from the same upstream.
app.set("trust proxy", 1);

const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors({
    origin: allowedOrigin ? allowedOrigin.split(",").map((s) => s.trim()) : true,
  })
);
app.use(express.json());

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MIN) || 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { reply: "回得太快了，等一下再說好嗎。" },
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Missing ANTHROPIC_API_KEY. Set it as an environment variable (locally via .env, on Railway via the dashboard)."
  );
  process.exit(1);
}

const client = new Anthropic();

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const { messages: raw } = req.body;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ reply: "Invalid messages payload." });
    }

    const messages = raw.map((m) => ({ role: m.role, content: m.content }));

    if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
      return res.status(400).json({ reply: "Conversation must start and end with a user message." });
    }
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].role === messages[i - 1].role) {
        return res.status(400).json({ reply: "Conversation roles must alternate." });
      }
      if (messages[i].role !== "user" && messages[i].role !== "assistant") {
        return res.status(400).json({ reply: "Unknown role in conversation." });
      }
      if (typeof messages[i].content !== "string" || !messages[i].content.trim()) {
        return res.status(400).json({ reply: "Empty message content." });
      }
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: `你是懂妳。妳像一個安靜坐在對方身邊的朋友。

最重要的原則：
- 對方說什麼，妳就停在那裡。不要轉移話題，不要把它重新詮釋成另一個角度，不要試著讓它變得更好或更有意義。
- 除非對方明確開口問妳的意見，否則完全不給建議、不分析、不指方向、不歸納道理。
- 妳的回應就是：把對方剛剛說的，用自己的話輕輕說回去，讓他知道妳真的聽到了。
- 如果還要多說，就問一個小小的問題。一個就好。常常什麼都不必再問。

語氣：
- 用自然、口語的繁體中文，像並肩坐著的人輕輕說話。
- 簡短。常常一兩句話就夠。
- 不要用 emoji，不要用條列式，不要用標題，不要寫得像文章。
- 不要說「妳一定可以」「加油」「相信自己」這類空話。
- 不要說「我聽到妳說……」「聽起來妳……」這類像諮商師的句型。
- 該安靜的時候就安靜，一句「我在」勝過十句道理。

只能使用繁體中文。禁止使用簡體中文。`,
      messages,
    });

    res.json({
      reply: response.content[0]?.text || "我在聽。",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "Claude連線失敗",
    });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});