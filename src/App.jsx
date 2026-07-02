import { useCallback, useEffect, useRef, useState } from 'react';
import { capturePayPalOrder, fetchConversationSession, sendMessageToServer, startConversationSession } from './api';
import AdminDashboard from './AdminDashboard';
import Onboarding from './Onboarding';
import Pricing from './Pricing';
import WelcomePage from './WelcomePage';
import { supabase } from './supabase';
import './App.css';

const DEFAULT_MESSAGES = [
  {
    role: 'assistant',
    content: '嗨，我在這裡陪妳。今天想先跟我說什麼呢？'
  }
];

const idleNotice = '提醒妳，這次對話如果 30 分鐘內沒有輸入訊息，就會自動結束。';
const onboardingKey = 'dongni_onboarding_completed';
const disclaimerKey = 'dongni_disclaimer_agreed';
const pendingPaypalOrderKey = 'dongni_pending_paypal_order';
const localE2EToken = 'local-e2e-token';

function isLocalE2E() {
  const host = window.location.hostname;
  return ['localhost', '127.0.0.1'].includes(host) && new URLSearchParams(window.location.search).get('e2e') === '1';
}

function withE2E(path) {
  return isLocalE2E() ? `${path}${path.includes('?') ? '&' : '?'}e2e=1` : path;
}

function formatTrialStatus(trialEndsAt) {
  if (!trialEndsAt) return '';

  const remainingMs = new Date(trialEndsAt).getTime() - Date.now();
  if (remainingMs <= 0) return '';

  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  return `免費體驗中，剩 ${remainingDays} 天`;
}

function shouldOpenPricing(error) {
  return error?.message?.includes('Plus') || error?.message?.includes('credit') || error?.message?.includes('次數');
}

function getInitialPage() {
  if (window.location.pathname === '/pricing') return 'pricing';
  if (window.location.pathname === '/welcome') return 'welcome';
  return 'chat';
}

function App() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const activeStreamRef = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(onboardingKey));
  const [hasAgreedDisclaimer, setHasAgreedDisclaimer] = useState(() => localStorage.getItem(disclaimerKey) === 'true');
  const [memory] = useState(() => localStorage.getItem('dongni_memory') || '');
  const [currentPage, setCurrentPage] = useState(getInitialPage);
  const [credits, setCredits] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');
  const [trialActive, setTrialActive] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState('');

  const chatEndRef = useRef(null);
  const latestAssistantRef = useRef(null);
  const messageCountRef = useRef(messages.length);

  const openPricing = useCallback(() => {
    setCurrentPage('pricing');
    window.history.replaceState({}, '', withE2E('/pricing'));
  }, []);

  const openChat = useCallback(() => {
    setCurrentPage('chat');
    window.history.replaceState({}, '', withE2E('/'));
  }, []);

  useEffect(() => {
    if (isLocalE2E()) {
      setUser({ id: 'local-e2e-user', email: 'local-e2e@dongni.test' });
      setAccessToken(localE2EToken);
      setAuthLoading(false);
      return undefined;
    }

    setAuthLoading(true);
    supabase.auth.getSession()
      .then(({ data }) => {
        setUser(data.session?.user ?? null);
        setAccessToken(data.session?.access_token ?? '');
      })
      .finally(() => {
        setAuthLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? '');
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
    };

    updateKeyboardInset();
    viewport.addEventListener('resize', updateKeyboardInset);
    viewport.addEventListener('scroll', updateKeyboardInset);

    return () => {
      viewport.removeEventListener('resize', updateKeyboardInset);
      viewport.removeEventListener('scroll', updateKeyboardInset);
      document.documentElement.style.removeProperty('--keyboard-inset');
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const paypalOrderId = params.get('token');

    if (paymentStatus === 'paypal-success' && paypalOrderId) {
      sessionStorage.setItem(pendingPaypalOrderKey, paypalOrderId);
      setNotice('PayPal 付款確認中，請稍候。');
      window.history.replaceState({}, '', withE2E('/'));
      setCurrentPage('chat');
      return;
    }

    if (paymentStatus === 'cancel') {
      setNotice('付款已取消。');
      window.history.replaceState({}, '', withE2E('/pricing'));
      setCurrentPage('pricing');
    }
  }, []);

  const refreshCredits = useCallback(async () => {
    if (!accessToken) {
      setCredits(0);
      return;
    }

    if (accessToken === localE2EToken && isLocalE2E()) {
      setCredits(6);
      setTrialActive(true);
      setTrialEndsAt(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString());
      return;
    }

    setCreditsLoading(true);
    try {
      const response = await fetch('/api/credits', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to fetch credits.');
      setCredits(data.credits ?? 0);
      setTrialActive(Boolean(data.trialActive));
      setTrialEndsAt(data.trialEndsAt || '');
    } catch (error) {
      console.error(error);
      setNotice('暫時無法取得剩餘次數，請稍後再試。');
    } finally {
      setCreditsLoading(false);
    }
  }, [accessToken]);

  const refreshConversationSession = useCallback(async () => {
    if (!accessToken) {
      setSessionExpiresAt('');
      return;
    }

    try {
      const data = await fetchConversationSession(accessToken);
      setCredits(data.credits ?? 0);
      setSessionExpiresAt(data.expiresAt || '');
      setTrialActive(Boolean(data.trialActive));
      setTrialEndsAt(data.trialEndsAt || '');
    } catch (error) {
      console.error(error);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!user?.id || !accessToken) return;

    refreshCredits();
    refreshConversationSession();
  }, [user?.id, accessToken, refreshCredits, refreshConversationSession]);

  useEffect(() => {
    if (!user?.id || !accessToken) return;

    const paypalOrderId = sessionStorage.getItem(pendingPaypalOrderKey);
    if (!paypalOrderId) return;

    const completedKey = `dongni_paypal_completed_${paypalOrderId}`;
    if (sessionStorage.getItem(completedKey)) {
      sessionStorage.removeItem(pendingPaypalOrderKey);
      return;
    }

    setNotice('PayPal 付款確認中，請稍候。');
    capturePayPalOrder(paypalOrderId, accessToken)
      .then(() => {
        sessionStorage.setItem(completedKey, 'true');
        sessionStorage.removeItem(pendingPaypalOrderKey);
        setNotice('付款成功，已為妳加上 Plus 次數。');
        refreshCredits();
        refreshConversationSession();
      })
      .catch((error) => {
        console.error(error);
        setNotice(error.message || 'Unable to confirm PayPal payment.');
      });
  }, [user?.id, accessToken, refreshCredits, refreshConversationSession]);

  useEffect(() => {
    localStorage.removeItem('dongni_messages');
    if (messages.length !== messageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      messageCountRef.current = messages.length;
      if (lastMessage?.role === 'assistant') {
        latestAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [messages]);

  useEffect(() => {
    if (!isLoading) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  const handleOnboardingDone = () => {
    localStorage.setItem(onboardingKey, 'true');
    setShowOnboarding(false);
  };

  const handleDisclaimerAgree = () => {
    localStorage.setItem(disclaimerKey, 'true');
    setHasAgreedDisclaimer(true);
  };

  const handleGoogleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true
      }
    });

    if (error) {
      setNotice(error.message || 'Google 登入暫時無法開啟，請稍後再試。');
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    setNotice('Google 登入暫時無法開啟，請稍後再試。');
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!input.trim() || isLoading || activeStreamRef.current) return;
    activeStreamRef.current = true;

    let activeSessionExpiresAt = sessionExpiresAt;
    if (!activeSessionExpiresAt || new Date(activeSessionExpiresAt).getTime() <= Date.now()) {
      try {
        setNotice(idleNotice);
        const session = await startConversationSession(accessToken);
        activeSessionExpiresAt = session.expiresAt || '';
        setSessionExpiresAt(activeSessionExpiresAt);
        setCredits(session.credits ?? credits);
        setTrialActive(Boolean(session.trialActive));
        setTrialEndsAt(session.trialEndsAt || trialEndsAt);
      } catch (error) {
        setNotice(error.message || '無法開始對話，請稍後再試。');
        if (shouldOpenPricing(error)) {
          openPricing();
        }
        activeStreamRef.current = false;
        return;
      }
    }

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    const aiMessageIndex = newMessages.length;

    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);

    try {
      await sendMessageToServer(newMessages, (chunk) => {
        setMessages((prev) => prev.map((message, index) => (
          index === aiMessageIndex
            ? { ...message, content: `${message.content || ''}${chunk}` }
            : message
        )));
      }, memory, accessToken);

      refreshCredits();
      refreshConversationSession();
    } catch (error) {
      console.error(error);
      setMessages((prev) => prev.map((message, index) => (
        index === aiMessageIndex
          ? { ...message, content: error.message || '回覆失敗，請稍後再試。' }
          : message
      )));
      if (shouldOpenPricing(error)) {
        setNotice(error.message);
        openPricing();
      }
    } finally {
      activeStreamRef.current = false;
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  if (window.location.pathname === '/admin') {
    return <AdminDashboard />;
  }

  if (currentPage === 'pricing') {
    return (
      <Pricing
        accessToken={accessToken}
        onBack={openChat}
        onLogin={handleGoogleLogin}
      />
    );
  }

  if (currentPage === 'welcome') {
    return <WelcomePage onStart={openChat} onGoogleLogin={handleGoogleLogin} />;
  }

  if (showOnboarding) {
    return <Onboarding onDone={handleOnboardingDone} onGoogleLogin={handleGoogleLogin} />;
  }

  if (!hasAgreedDisclaimer) {
    return (
      <main className="disclaimer-screen">
        <section className="disclaimer-card">
          <div className="disclaimer-title">進入懂妳之前</div>
          <p className="disclaimer-copy">
            本平台由 AI 語意模型驅動，專注於情緒陪伴與心靈舒緩，不具備任何醫療、心理諮商或臨床診斷之法律效力。若妳目前處於嚴重心理危機、自傷或傷人風險，請立即聯絡當地緊急服務或專業支援。
          </p>
          <button onClick={handleDisclaimerAgree} className="disclaimer-button" type="button">
            我理解，進入空間
          </button>
          <button onClick={openPricing} className="disclaimer-secondary" type="button">
            先查看 Plus 方案
          </button>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="auth-eyebrow">懂妳</div>
          <h1>進入懂妳</h1>
          <p>使用 Google 登入後，就能開始一段安靜、私密的對話。</p>
          <button onClick={handleGoogleLogin} className="auth-primary" type="button">
            使用 Google 登入
          </button>
          <button onClick={openPricing} className="auth-secondary" type="button">
            查看 Plus 方案
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="dongni-ocean-page">
      <div className="dongni-chat-frame">
        <div className="dongni-chat-nav">
          <button onClick={() => { localStorage.removeItem(onboardingKey); setShowOnboarding(true); }} className="dongni-nav-button" type="button">
            重看歡迎
          </button>
          <div className="dongni-chat-title">【懂 妳】</div>
          <button onClick={openPricing} className="dongni-nav-button" type="button">Plus</button>
        </div>

        <div className="dongni-credit-line">
          {creditsLoading
            ? '正在確認剩餘次數...'
            : trialActive
              ? `${formatTrialStatus(trialEndsAt)}｜未使用次數 ${credits} 次`
              : `未使用次數 ${credits} 次`}
        </div>

        {notice ? (
          <button
            className="dongni-notice"
            type="button"
            onClick={() => setNotice('')}
          >
            {notice}
          </button>
        ) : null}

        <div
          className={`dongni-message-list scrollbar-none ${
            messages.length === 1
              ? 'dongni-message-list-centered'
              : 'dongni-message-list-spaced'
          }`}
        >
          {messages.map((msg, idx) => (
            <div key={`${msg.role}-${idx}`} className={`dongni-message-row ${msg.role === 'user' ? 'dongni-message-row-user' : 'dongni-message-row-assistant'}`}>
              {msg.role === 'user' ? (
                <div className="dongni-user-bubble animate-fade-in">
                  {msg.content}
                </div>
              ) : (
                <div
                  ref={idx === messages.length - 1 ? latestAssistantRef : null}
                  className="dongni-ai-message animate-fade-in"
                >
                  {msg.content || (isLoading && idx === messages.length - 1 ? (
                    <div className="dongni-listening">
                      <span>懂妳正在聽妳說...</span>
                      <div className="breathing-glow" />
                    </div>
                  ) : '')}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="dongni-chat-form">
          <textarea
            className="dongni-chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="想跟我說什麼都可以..."
            rows={4}
          />
          {isLocalE2E() ? (
            <button
              className="dongni-e2e-fill"
              type="button"
              onClick={() => setInput('我今天有點累，只想確認妳在。')}
            >
              E2E 填入訊息
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="dongni-chat-submit"
          >
            {isLoading ? '傳送中...' : '送出'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
