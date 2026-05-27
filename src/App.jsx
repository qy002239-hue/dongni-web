import React, { useState, useRef, useEffect } from 'react';
import { sendToClaude } from './api';
import Onboarding from "./Onboarding";
import './App.css';

const DEFAULT_MESSAGES = [{ role: "assistant", content: "妳好，我是〔懂妳〕。\n今天，怎麼了？" }];

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
  
  // 🚨 法律合規：免責聲明彈窗狀態
  const [hasAgreedDisclaimer, setHasAgreedDisclaimer] = useState(() => localStorage.getItem("dongni_disclaimer_agreed"));

  const chatEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("dongni_messages", JSON.stringify(messages));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDisclaimerAgree = () => {
    localStorage.setItem("dongni_disclaimer_agreed", "true");
    setHasAgreedDisclaimer("true");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages.filter(m => m.content.disabled !== true), userMessage];
    
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const aiMessageIndex = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      await sendToClaude(newMessages, (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          if (updated[aiMessageIndex]) updated[aiMessageIndex].content += chunk;
          return updated;
        });
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 🚨 優先渲染：免責聲明防線
  if (!hasAgreedDisclaimer) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-900 text-stone-300 p-6 text-center font-light">
        <div className="max-w-md bg-stone-800 p-8 rounded-3xl space-y-6 border border-stone-700 shadow-xl">
          <div className="text-xl tracking-widest text-stone-200">〔 歡迎來到 懂妳 〕</div>
          <p className="text-xs leading-relaxed text-stone-400 text-left bg-stone-900 p-4 rounded-xl border border-stone-800">
            本平台由 AI 語意模型驅動，專注於情緒陪伴與心靈舒緩，不具備任何醫療、心理諮商或臨床診斷之法律效力。若您目前正處於嚴重的心理困擾或情緒危機，請務必尋求專業醫療機構或撥打安心專線（1925）協助。
          </p>
          <button onClick={handleDisclaimerAgree} className="w-full py-3 rounded-full bg-stone-700 hover:bg-stone-600 text-sm tracking-widest text-stone-100 transition-colors shadow-md">
            我理解，進入空間
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) return <Onboarding onComplete={() => { localStorage.setItem("dongni_onboarding_completed", "true"); setShowOnboarding(false); }} />;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 text-stone-200 p-4 font-light">
      <div className="w-full max-w-xl flex flex-col h-[85vh] justify-between relative">
        
        <div className="flex justify-between items-center py-2 px-4 text-xs text-stone-500 tracking-widest">
          <button onClick={() => { localStorage.removeItem("dongni_onboarding_completed"); setShowOnboarding(true); }} className="hover:text-stone-300">重置檢測</button>
          <div className="text-base text-stone-400 font-normal tracking-[0.25em]">〔 懂 妳 〕</div>
          <button onClick={() => { if(window.confirm("確定清除？")){ setMessages(DEFAULT_MESSAGES); localStorage.removeItem("dongni_messages"); } }} className="hover:text-stone-300">清除紀錄</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 scrollbar-none">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-center text-center'}`}>
              {msg.role === 'user' ? (
                <div className="bg-stone-800 text-stone-200 border border-stone-700 px-5 py-3 rounded-2xl max-w-[80%] text-sm tracking-wide animate-fade-in">{msg.content}</div>
              ) : (
                <div className="whitespace-pre-line text-lg leading-loose tracking-wide text-stone-100 max-w-[90%] animate-fade-in">
                  {msg.content || (isLoading && idx === messages.length - 1 ? "" : "")}
                </div>
              )}
            </div>
          ))}
          {/* 🌟 療癒呼吸燈：只在 AI 正在思考/打字時在下方溫柔閃爍 */}
          {isLoading && <div className="breathing-glow" />}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="py-4">
          <input className="w-full p-4 rounded-full bg-stone-800 border border-stone-700 text-stone-200 placeholder-stone-500 text-center text-sm tracking-wider" value={input} placeholder="跟〔懂妳〕聊聊心裡的矛盾..." onChange={(e) => setInput(e.target.value)} disabled={isLoading} />
        </form>
        
      </div>
    </div>
  );
}

export default App;
