import React, { useCallback, useEffect, useRef, useState } from 'react';
import { capturePayPalOrder, fetchConversationSession, sendMessageToServer, startConversationSession } from './api';
import AdminDashboard from './AdminDashboard';
import Onboarding from './Onboarding';
import Pricing from './Pricing';
import { supabase } from './supabase';
import './App.css';

const DEFAULT_MESSAGES = [
  {
    role: 'assistant',
    content: '\u55e8\uff0c\u6211\u5728\u9019\u88e1\u966a\u59b3\u3002\u4eca\u5929\u60f3\u5148\u8ddf\u6211\u8aaa\u4ec0\u9ebc\u5462\uff1f'
  }
];

const idleNotice = '\u63d0\u9192\u59b3\uff0c\u9019\u6b21\u5c0d\u8a71\u5982\u679c 30 \u5206\u9418\u5167\u6c92\u6709\u8f38\u5165\u8a0a\u606f\uff0c\u5c31\u6703\u81ea\u52d5\u7d50\u675f\u3002';

function formatTrialStatus(trialEndsAt) {
  if (!trialEndsAt) return '';

  const remainingMs = new Date(trialEndsAt).getTime() - Date.now();
  if (remainingMs <= 0) return '';

  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  return `\u514d\u8cbb\u9ad4\u9a57\u4e2d\uff0c\u5269 ${remainingDays} \u5929`;
}

function shouldOpenPricing(error) {
  return error?.message?.includes('Plus') || error?.message?.includes('credit') || error?.message?.includes('\u6b21\u6578');
}

function formatAssistantText(content) {
  return String(content || '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function App() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('dongni_onboarding_completed'));
  const [hasAgreedDisclaimer, setHasAgreedDisclaimer] = useState(() => localStorage.getItem('dongni_disclaimer_agreed'));
  const [memory] = useState(() => localStorage.getItem('dongni_memory') || '');
  const [currentPage, setCurrentPage] = useState('chat');
  const [credits, setCredits] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');
  const [trialActive, setTrialActive] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState('');

  const chatEndRef = useRef(null);
  const latestAssistantRef = useRef(null);
  const messageCountRef = useRef(messages.length);

  useEffect(() => {
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

  const refreshCredits = useCallback(async () => {
    if (!accessToken) {
      setCredits(0);
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
      setNotice('\u66ab\u6642\u7121\u6cd5\u53d6\u5f97\u5269\u9918\u6b21\u6578\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
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

    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const paypalOrderId = params.get('token');

    if (paymentStatus === 'paypal-success' && paypalOrderId) {
      const captureKey = `dongni_paypal_capture_${paypalOrderId}`;
      if (sessionStorage.getItem(captureKey)) return;
      sessionStorage.setItem(captureKey, 'processing');

      setNotice('PayPal \u4ed8\u6b3e\u78ba\u8a8d\u4e2d\uff0c\u8acb\u7a0d\u5019\u3002');
      capturePayPalOrder(paypalOrderId, accessToken)
        .then(() => {
          setNotice('\u4ed8\u6b3e\u6210\u529f\uff0c\u5df2\u70ba\u59b3\u52a0\u4e0a Plus \u6b21\u6578\u3002');
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
          refreshCredits();
          refreshConversationSession();
        })
        .catch((error) => {
          console.error(error);
          sessionStorage.removeItem(captureKey);
          setNotice(error.message || 'Unable to confirm PayPal payment.');
        });
    } else if (paymentStatus === 'cancel') {
      setNotice('\u4ed8\u6b3e\u5df2\u53d6\u6d88\u3002');
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, [user?.id, accessToken, refreshCredits, refreshConversationSession]);

  useEffect(() => {
    localStorage.removeItem('dongni_messages');
    if (messages.length !== messageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      messageCountRef.current = messages.length;
      if (lastMessage?.role === 'assistant') {
        latestAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [messages]);

  const handleDisclaimerAgree = () => {
    localStorage.setItem('dongni_disclaimer_agreed', 'true');
    setHasAgreedDisclaimer(true);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!input.trim() || isLoading) return;

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
        setNotice(error.message || '\u7121\u6cd5\u958b\u59cb\u5c0d\u8a71\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
        if (shouldOpenPricing(error)) {
          setCurrentPage('pricing');
        }
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
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[aiMessageIndex]) {
            updated[aiMessageIndex].content += chunk;
          }
          return updated;
        });
      }, memory, accessToken);

      refreshCredits();
      refreshConversationSession();
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[aiMessageIndex]) {
          updated[aiMessageIndex].content = error.message || '\u56de\u8986\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002';
        }
        return updated;
      });
      if (shouldOpenPricing(error)) {
        setNotice(error.message);
        setCurrentPage('pricing');
      }
    } finally {
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

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '20px',
          background: 'transparent',
          color: 'white'
        }}
      >
        <h1>{'\u9032\u5165\u61c2\u59b3'}</h1>
        <button
          onClick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: 'google'
            });
          }}
          style={{
            padding: '12px 24px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {'\u4f7f\u7528 Google \u767b\u5165'}
        </button>
      </div>
    );
  }

  if (!hasAgreedDisclaimer) {
    return (
      <div className="disclaimer-screen">
        <div className="disclaimer-card">
          <div className="disclaimer-title">{'\u9032\u5165\u61c2\u59b3\u4e4b\u524d'}</div>
          <p className="disclaimer-copy">
            {'\u672c\u5e73\u53f0\u7531 AI \u8a9e\u610f\u6a21\u578b\u9a45\u52d5\uff0c\u5c08\u6ce8\u65bc\u60c5\u7dd2\u966a\u4f34\u8207\u5fc3\u9748\u8212\u7de9\uff0c\u4e0d\u5177\u5099\u4efb\u4f55\u91ab\u7642\u3001\u5fc3\u7406\u8aee\u5546\u6216\u81e8\u5e8a\u8a3a\u65b7\u4e4b\u6cd5\u5f8b\u6548\u529b\u3002\u82e5\u59b3\u76ee\u524d\u8655\u65bc\u56b4\u91cd\u5fc3\u7406\u5371\u6a5f\u3001\u81ea\u50b7\u6216\u50b7\u4eba\u98a8\u96aa\uff0c\u8acb\u7acb\u5373\u806f\u7d61\u7576\u5730\u7dca\u6025\u670d\u52d9\u6216\u5c08\u696d\u652f\u63f4\u3002'}
          </p>
          <button onClick={handleDisclaimerAgree} className="disclaimer-button">
            {'\u6211\u7406\u89e3\uff0c\u9032\u5165\u7a7a\u9593'}
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onDone={() => { localStorage.setItem('dongni_onboarding_completed', 'true'); setShowOnboarding(false); }} />;
  }

  if (currentPage === 'pricing') {
    return <Pricing onBack={() => { setCurrentPage('chat'); refreshCredits(); refreshConversationSession(); }} accessToken={accessToken} />;
  }

  return (
    <div className="dongni-ocean-page">
      <div className="dongni-chat-frame">
        <div className="dongni-chat-nav">
          <button onClick={() => { localStorage.removeItem('dongni_onboarding_completed'); setShowOnboarding(true); }} className="dongni-nav-button">
            {'\u91cd\u7f6e\u6aa2\u6e2c'}
          </button>
          <div className="dongni-chat-title">{'\u3010\u61c2 \u59b3\u3011'}</div>
          <button onClick={() => { setCurrentPage('pricing'); }} className="dongni-nav-button">Plus</button>
        </div>

        <div className="dongni-credit-line">
          {creditsLoading
            ? '\u6b63\u5728\u78ba\u8a8d\u5269\u9918\u6b21\u6578...'
            : trialActive
              ? `${formatTrialStatus(trialEndsAt)}\uff5c\u672a\u4f7f\u7528\u6b21\u6578 ${credits} \u6b21`
              : `\u672a\u4f7f\u7528\u6b21\u6578 ${credits} \u6b21`}
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
            <div key={idx} className={`dongni-message-row ${msg.role === 'user' ? 'dongni-message-row-user' : 'dongni-message-row-assistant'}`}>
              {msg.role === 'user' ? (
                <div className="dongni-user-bubble animate-fade-in">
                  {msg.content}
                </div>
              ) : (
                <div
                  ref={idx === messages.length - 1 ? latestAssistantRef : null}
                  className="dongni-ai-message animate-fade-in"
                >
                  {msg.content ? formatAssistantText(msg.content) : (isLoading && idx === messages.length - 1 ? (
                    <div className="dongni-listening">
                      <span>{'\u61c2\u59b3\u6b63\u5728\u807d\u59b3\u8aaa...'}</span>
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
            placeholder={'\u60f3\u8ddf\u6211\u8aaa\u4ec0\u9ebc\u90fd\u53ef\u4ee5...'}
            rows={14}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="dongni-chat-submit"
          >
            {isLoading ? '\u50b3\u9001\u4e2d...' : '\u9001\u51fa'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
