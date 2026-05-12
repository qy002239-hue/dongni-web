import { useState, useEffect, useRef } from "react";
import { sendToClaude } from "./api";
import Onboarding from "./Onboarding";

const STORAGE_KEY = "dongni.messages";
const ONBOARDED_KEY = "dongni.onboarded";

const DEFAULT_MESSAGES = [
  {
    role: "assistant",
    content: "妳今天還好嗎……",
  },
];

function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MESSAGES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MESSAGES;
    return parsed;
  } catch {
    return DEFAULT_MESSAGES;
  }
}

const HISTORY_LIMIT = 20;

function buildHistory(messages) {
  // Walk messages, dropping each error bubble AND the user message that
  // triggered it — otherwise we send "...user, user..." to Claude.
  const cleaned = [];
  for (const m of messages) {
    if (m.error) {
      if (cleaned.length && cleaned[cleaned.length - 1].role === "user") {
        cleaned.pop();
      }
      continue;
    }
    cleaned.push({ role: m.role, content: m.content });
  }

  // Claude requires the first message to be from the user — strip the seed
  // greeting (and any stray leading assistant turns).
  while (cleaned.length && cleaned[0].role !== "user") {
    cleaned.shift();
  }

  // Cap AFTER trimming so we don't waste budget on the stripped seed.
  const recent = cleaned.slice(-HISTORY_LIMIT);

  // Defensive: if any consecutive same-role turns slipped through, merge them
  // so Claude sees clean alternation.
  const alternating = [];
  for (const m of recent) {
    const last = alternating[alternating.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      alternating.push({ ...m });
    }
  }

  return alternating;
}

export default function App() {
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARDED_KEY) === "true"
  );
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, "true");
    setOnboarded(true);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  if (!onboarded) {
    return <Onboarding onDone={finishOnboarding} />;
  }

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);

    try {
      const history = buildHistory(nextMessages);
      const reply = await sendToClaude(history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.serverReply || "（傳訊失敗，請稍後再試）",
          error: true,
        },
      ]);
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
    setMessages(DEFAULT_MESSAGES);
  };

  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDED_KEY);
    location.reload();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        color: "#e2e8f0",
        backgroundColor: "#03101e",
        backgroundImage: `
          linear-gradient(180deg, rgba(2, 12, 24, 0.62) 0%, rgba(4, 18, 32, 0.78) 55%, rgba(2, 12, 24, 0.7) 100%),
          url('/ocean.jpg')
        `,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        style={{
          padding:
            "calc(16px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left))",
          borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          background: "rgba(2, 12, 24, 0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#f8fafc",
            fontSize: "clamp(20px, 5.5vw, 26px)",
            fontWeight: 500,
            letterSpacing: "0.14em",
            textShadow: "0 0 24px rgba(56, 189, 248, 0.25)",
          }}
        >
          懂妳
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          {import.meta.env.DEV && (
            <button
              onClick={resetOnboarding}
              title="DEV — 重新顯示 onboarding"
              style={{
                background: "transparent",
                color: "#7d96ad",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "999px",
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: "13px",
                letterSpacing: "0.08em",
              }}
            >
              重看引導
            </button>
          )}
          <button
            onClick={clearChat}
            style={{
              background: "transparent",
              color: "#7d96ad",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "999px",
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: "13px",
              letterSpacing: "0.08em",
            }}
          >
            清除對話
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding:
            "20px max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left))",
        }}
      >
        {messages.map((msg, index) => {
          const isUser = msg.role === "user";
          const isError = !!msg.error;
          return (
            <div
              key={index}
              style={{
                marginBottom: "14px",
                display: "flex",
                justifyContent: isUser ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  background: isError
                    ? "rgba(127, 29, 29, 0.7)"
                    : isUser
                    ? "rgba(34, 122, 158, 0.55)"
                    : "rgba(30, 50, 78, 0.88)",
                  border: isError
                    ? "1px solid rgba(220, 38, 38, 0.45)"
                    : isUser
                    ? "1px solid rgba(56, 189, 248, 0.42)"
                    : "1px solid rgba(148, 163, 184, 0.3)",
                  color: isError
                    ? "#fecaca"
                    : isUser
                    ? "#e0f2fe"
                    : "#f1f5f9",
                  boxShadow:
                    "0 2px 12px rgba(0, 0, 0, 0.35)",
                  padding: "12px 16px",
                  borderRadius: "18px",
                  maxWidth: "min(80%, 560px)",
                  lineHeight: "1.7",
                  whiteSpace: "pre-wrap",
                  fontSize: "15px",
                  letterSpacing: "0.02em",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div
            style={{
              marginBottom: "14px",
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <div
              style={{
                background: "rgba(30, 50, 78, 0.88)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                padding: "12px 18px",
                borderRadius: "18px",
                display: "flex",
                gap: "5px",
                alignItems: "center",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: "0 2px 12px rgba(0, 0, 0, 0.35)",
              }}
            >
              <Dot delay="0s" />
              <Dot delay="0.2s" />
              <Dot delay="0.4s" />
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding:
            "12px max(16px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          borderTop: "1px solid rgba(148, 163, 184, 0.10)",
          display: "flex",
          gap: "8px",
          background: "rgba(2, 12, 24, 0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          flexShrink: 0,
        }}
      >
        <input
          className="dongni-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
          disabled={isTyping}
          placeholder="想說什麼……"
          autoComplete="off"
          autoCorrect="off"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "14px 18px",
            borderRadius: "999px",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "rgba(8, 24, 42, 0.6)",
            color: "#e2e8f0",
            outline: "none",
            fontSize: "16px",
            letterSpacing: "0.02em",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        />

        <button
          onClick={sendMessage}
          disabled={isTyping || !input.trim()}
          style={{
            background:
              isTyping || !input.trim()
                ? "rgba(71, 85, 105, 0.25)"
                : "rgba(56, 189, 248, 0.18)",
            color:
              isTyping || !input.trim()
                ? "rgba(203, 213, 225, 0.4)"
                : "#e0f2fe",
            border:
              isTyping || !input.trim()
                ? "1px solid rgba(71, 85, 105, 0.3)"
                : "1px solid rgba(56, 189, 248, 0.35)",
            borderRadius: "999px",
            padding: "14px 22px",
            cursor: isTyping || !input.trim() ? "not-allowed" : "pointer",
            fontSize: "15px",
            letterSpacing: "0.12em",
            transition: "all 0.2s ease",
            flexShrink: 0,
            minWidth: "72px",
          }}
        >
          傳送
        </button>
      </div>

      <style>{`
        @keyframes dongni-blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }
        .dongni-input::placeholder {
          color: #64748b;
          letter-spacing: 0.02em;
        }
        .dongni-input:focus {
          border-color: rgba(56, 189, 248, 0.4);
        }
      `}</style>
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span
      style={{
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        background: "#7d96ad",
        display: "inline-block",
        animation: "dongni-blink 1.4s infinite",
        animationDelay: delay,
      }}
    />
  );
}
