import React, { useState, useRef, useEffect } from 'react';
import { sendMessageToServer } from './api';
import Onboarding from "./Onboarding";
import './App.css';

const DEFAULT_MESSAGES = [{ role: "assistant", content: "妳好，我是〔懂妳〕。\n今天，怎麼了？" }];

// 從對話中提煉記憶
async function extractMemory(messages, apiKey) {
  const conversationText = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  if (!conversationText.trim()) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Dongni Memory"
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        messages: [
          {
            role: "system",
            content: "你是一個記憶提煉助手。從以下對話中，提煉出關於這位女性的重要事實，用繁體中文簡短列出。只記錄她說的重要事件、感受、關係。"
          },
          {
            role: "user",
            content: conversationText
          }
        ],
        max_tokens: 300
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
}

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem("dongni_messages");
      if (saved) return JSON.parse(saved).length > 0 ? JSON.parse(saved) : DEFAULT_MESSAGES;
    } catch (e) {}
    return DEFAULT_MESSAGES;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem("dongni_onboarding_completed"));
  const [hasAgreedDisclaimer, setHasAgreedDisclaimer] = useState(() => localStorage.getItem("dongni_disclaimer_agreed"));
  const [memory, setMemory] = useState(() => localStorage.getItem("dongni_memory") || "");

  const chatEndRef = useRef(null);
  const OPENROUTER_API_KEY = "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";

  useEffect(() => {
    localStorage.setItem("dongni_messages", JSON.stringify(messages));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // 每累積10則用戶訊息，自動提煉一次記憶
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0 && userMessages.length % 10 === 0) {
      extractMemory(messages, OPENROUTER_API_KEY).then(newMemory => {
        if (newMemory) {
          const existingMemory = localStorage.getItem("dongni_memory") || "";
          const combined = existingMemory
            ? existingMemory + "\n" + newMemory
            : newMemory;
          localStorage.setItem("dongni_memory", combined);
          setMemory(combined);
        }
      });
    }
  }, [messages]);

  const handleDisclaimerAgree = () => {
    localStorage.setItem("dongni_disclaimer_agreed", "true");
    setHasAgreedDisclaimer(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];

    // 把記憶注入system message
    const messagesWithMemory = memory
      ? [{ role: 'system', content: `以下是妳對這位使用者的記憶，請在對話中自然地運用：\n${memory}` }, ...newMessages]
      : newMessages;

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // 立即添加空的 AI 訊息（會被 streaming 內容填充）
    const aiMessageIndex = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      let firstChunkReceived = false;
      
      await sendMessageToServer(messagesWithMemory, (chunk) => {
        // 第一個 chunk 到達時，標記已收到
        if (!firstChunkReceived) {
          firstChunkReceived = true;
        }

        setMessages(prev => {
          const updated = [...prev];
          if (updated[aiMessageIndex]) {
            updated[aiMessageIndex].content += chunk;
          }
          return updated;
        });
      });
    } catch (error) {
      console.error(error);
      setMessages(prev => {
        const updated = [...prev];
        if (updated[aiMessageIndex]) {
          updated[aiMessageIndex].content = '出錯了，請重試...';
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasAgreedDisclaimer) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-900 text-stone-300 p-6 text-center font-light">
        <div className="max-w-md bg-stone-800 p-8 rounded-3xl space-y-6 border border-stone-700 shadow-xl">
          <div className="text-xl tracking-widest text-stone-200">〔 歡迎來到 懂妳 〕</div>
          <p className="text-xs leading-relaxed text-stone-400 text-left bg-stone-900 p-4 rounded-xl border border-stone-800">
            本平台由 AI 語意模型驅動，專注於情緒陪伴與心靈舒緩，不具備任何醫療、心理諮商或臨床診斷之法律效力。若您目前正處於嚴重的心理危機，請立即聯絡專業心理衛生單位。
          </p>
          <button onClick={handleDisclaimerAgree} className="w-full py-3 rounded-full bg-stone-700 hover:bg-stone-600 text-sm tracking-widest text-stone-100 transition-colors shadow-md">
            我理解，進入空間
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) return <Onboarding onDone={() => { localStorage.setItem("dongni_onboarding_completed", "true"); setShowOnboarding(false); }} />;

return (
  <div
    style={{
      position: "fixed",
      inset: 0,
      margin: 0,
      overflow: "hidden",
      background: "red",
    }}
  >
    <div className="w-full max-w-xl flex flex-col h-[85vh] justify-between relative">

      <div className="flex justify-between items-center py-2 px-4 text-xs text-stone-500 tracking-widest">
        <button onClick={() => { localStorage.removeItem("dongni_onboarding_completed"); setShowOnboarding(true); }} className="hover:text-stone-300">重置檢測</button>
        <div className="text-base text-stone-400 font-normal tracking-[0.25em]">【懂 妳】</div>
        <button onClick={() => { if(window.confirm("確定清除對話記錄？")){ setMessages(DEFAULT_MESSAGES); localStorage.removeItem("dongni_messages"); } }} className="hover:text-stone-300">清除對話</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 scrollbar-none">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-center text-center'}`}>
            {msg.role === 'user' ? (
              <div className="bg-stone-800 text-stone-200 border border-stone-700 px-5 py-3 rounded-2xl max-w-[80%] text-sm tracking-wide animate-fade-in">{msg.content}</div>
            ) : (
              <div className="whitespace-pre-line text-lg leading-loose tracking-wide text-stone-100 max-w-[90%] animate-fade-in">
                {msg.content || (isLoading && idx === messages.length - 1 ? (
                  <div className="flex items-center gap-3">
                    <span className="text-stone-400">懂妳正在傾聽中...</span>
                    <div className="breathing-glow" />
                  </div>
                ) : "")}
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="py-4">
        <input className="w-full p-4 rounded-full bg-stone-800 border border-stone-700 text-stone-200 placeholder-stone-500 text-center text-sm tracking-wider" value={input} onChange={(e) => setInput(e.target.value)} placeholder="在這裡分享妳的想法..." disabled={isLoading} />
      </form>

    </div>
  </div>
); 
}
