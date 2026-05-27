import React, { useState, useRef, useEffect } from 'react';
import { sendToClaude } from './api';
import Onboarding from "./Onboarding";
import './App.css';

// 預設的引導歡迎詞（維持你原本的設定）
const DEFAULT_MESSAGES = [
  {
    role: "assistant",
    content: "妳好，我是〔懂妳〕。\n今天，怎麼了？"
  }
];

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem("dongni_messages");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.length > 0 ? parsed : DEFAULT_MESSAGES;
      }
    } catch (e) {
      console.error("讀取歷史紀錄失敗", e);
    }
    return DEFAULT_MESSAGES;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem("dongni_onboarding_completed");
  });
  
  const chatEndRef = useRef(null);

  // 當對話更新時，同步存入本機快取並捲動到最下方
  useEffect(() => {
    localStorage.setItem("dongni_messages", JSON.stringify(messages));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 新手引導完成時的觸發（維持你原本的邏輯）
  const handleOnboardingComplete = (answers) => {
    localStorage.setItem("dongni_onboarding_completed", "true");
    setShowOnboarding(false);
  };

  // 清除對話紀錄
  const handleClearChat = () => {
    if (window.confirm("確定要清除所有傾聽紀錄嗎？")) {
      setMessages(DEFAULT_MESSAGES);
      localStorage.removeItem("dongni_messages");
    }
  };

  // 重置新手引導
  const handleResetOnboarding = () => {
    localStorage.removeItem("dongni_onboarding_completed");
    setShowOnboarding(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    // 過濾掉空的回應，確保對話紀錄乾淨
    const currentMessages = messages.filter(m => m.content.disabled !== true);
    const newMessages = [...currentMessages, userMessage];
    
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // 在畫面上先建立一個空的 AI 回應框，準備接收流出的文字
    const aiMessageIndex = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      // 呼叫流式傳輸轉接頭，一字一字倒水進去
      await sendToClaude(newMessages, (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          if (updated[aiMessageIndex]) {
            updated[aiMessageIndex].content += chunk;
          }
          return updated;
        });
      });
    } catch (error) {
      console.error("對話出錯:", error);
      setMessages(prev => {
        const updated = [...prev];
        if (updated[aiMessageIndex]) {
          updated[aiMessageIndex].content = "（抱歉，我剛剛稍微分神了，可以再對我說一次嗎...）";
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 如果新手引導還沒完成，顯示 Onboarding 畫面
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 text-stone-200 p-4 font-light">
      <div className="w-full max-w-xl flex flex-col h-[85vh] justify-between relative">
        
        {/* 控制按鈕列 */}
        <div className="flex justify-between items-center py-2 px-4 text-xs text-stone-500 tracking-widest">
          <button onClick={handleResetOnboarding} className="hover:text-stone-300 transition-colors">重置檢測</button>
          <div className="text-base text-stone-400 font-normal tracking-[0.25em]">〔 懂 妳 〕</div>
          <button onClick={handleClearChat} className="hover:text-stone-300 transition-colors">清除紀錄</button>
        </div>

        {/* 對話留白渲染區域 */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 scrollbar-none">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-center text-center'}`}
            >
              {msg.role === 'user' ? (
                <div className="bg-stone-800 text-stone-200 border border-stone-700 px-5 py-3 rounded-2xl max-w-[80%] text-sm tracking-wide shadow-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="whitespace-pre-line text-lg leading-loose tracking-wide text-stone-100 max-w-[90%] transition-all duration-300 animate-fade-in">
                  {msg.content || (isLoading && idx === messages.length - 1 ? "正在聽妳說..." : "")}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 底部輸入框 */}
        <form onSubmit={handleSubmit} className="py-4">
          <input
            className="w-full p-4 rounded-full bg-stone-800 border border-stone-700 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-stone-500 text-center text-sm tracking-wider shadow-inner transition-colors"
            value={input}
            placeholder="跟〔懂妳〕聊聊心裡的矛盾..."
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
        </form>
        
      </div>
    </div>
  );
}

export default App;
