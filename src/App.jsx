import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sendMessageToServer, startConversationSession } from './api';
import { validateClientEnv } from './lib/env';
import { isSupabaseConfigured, supabase } from './supabase';
import './App.css';

const DEFAULT_MESSAGES = [
  {
    role: 'assistant',
    content: '我在。妳可以慢慢說，不用整理好。'
  }
];

const localTestSessionKey = 'dongni_local_test_session';
const localE2EToken = 'local-e2e-token';
const chatHistoryPrefix = 'dongni_chat_history_';

function isLocalHost() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function isLocalE2E() {
  const host = window.location.hostname;
  return ['localhost', '127.0.0.1'].includes(host) && new URLSearchParams(window.location.search).get('e2e') === '1';
}

function isLocalTestSession(accessToken = '') {
  return accessToken === localE2EToken && isLocalHost();
}

function createLocalTestSession() {
  return {
    user: {
      id: 'local-test-user',
      email: 'test@dongni.local',
      user_metadata: {
        name: '測試使用者',
        full_name: '測試使用者'
      }
    },
    accessToken: localE2EToken
  };
}

function readLocalTestSession() {
  try {
    const raw = sessionStorage.getItem(localTestSessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLocalTestSession(session) {
  sessionStorage.setItem(localTestSessionKey, JSON.stringify(session));
}

function clearLocalTestSession() {
  sessionStorage.removeItem(localTestSessionKey);
}

function chatHistoryKey(userId) {
  return `${chatHistoryPrefix}${userId}`;
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return DEFAULT_MESSAGES;

  const cleaned = input
    .filter((item) => ['user', 'assistant'].includes(item?.role))
    .map((item) => ({
      role: item.role,
      content: String(item.content || '')
    }))
    .filter((item) => item.content.trim());

  return cleaned.length ? cleaned : DEFAULT_MESSAGES;
}

function readHistory(userId) {
  if (!userId) return DEFAULT_MESSAGES;

  try {
    const raw = localStorage.getItem(chatHistoryKey(userId));
    if (!raw) return DEFAULT_MESSAGES;
    const parsed = JSON.parse(raw);
    return sanitizeMessages(parsed);
  } catch {
    return DEFAULT_MESSAGES;
  }
}

function withE2E(path) {
  return isLocalE2E() ? `${path}${path.includes('?') ? '&' : '?'}e2e=1` : path;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const clientEnvValidation = validateClientEnv();
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const activeStreamRef = useRef(false);
  const [notice, setNotice] = useState('');
  const googleLoginEnabled = isSupabaseConfigured && Boolean(supabase) && clientEnvValidation.ok;

  const messageListRef = useRef(null);
  const chatEndRef = useRef(null);
  const messageCountRef = useRef(messages.length);
  const firstEnterDebugLoggedRef = useRef(false);
  const enterTriggerRef = useRef(false);
  const isMockSession = isLocalTestSession(accessToken);

  const logReturnReason = useCallback((ifName, context = {}) => {
    console.error('[CHAT DEBUG RETURN]', ifName, context);
  }, []);

  const logPlusNavigate = useCallback((context = {}) => {
    console.error("[CHAT DEBUG] navigate('/plus') 呼叫位置", {
      location: 'src/App.jsx:handleSubmit/catch',
      ...context
    });
  }, []);

  const ge = useCallback((reason, context = {}) => {
    console.error('[CHAT DEBUG] ge() called', {
      location: 'src/App.jsx:ge',
      reason,
      ...context
    });
    logPlusNavigate({ reason, ...context });
    navigate(withE2E('/plus'));
  }, [logPlusNavigate, navigate]);

  const printChatDebug = useCallback((payload) => {
    console.error('========== CHAT DEBUG ==========');
    console.error('user.id', payload.userId ?? null);
    console.error('session.id', payload.sessionId ?? null);
    console.error('conversationSession', payload.conversationSession ?? null);
    console.error('credits', payload.credits ?? null);
    console.error('trialDaysRemaining', payload.trialDaysRemaining ?? null);
    console.error('subscription', payload.subscription ?? null);
    console.error('canChat', payload.canChat ?? null);
    console.error('HTTP Status', payload.httpStatus ?? null);
    console.error('Response Body', payload.responseBody ?? null);
    console.error('response.error', payload.responseError ?? null);
    console.error('error.message', payload.errorMessage ?? null);
    console.error('willRedirectToPlus', payload.willRedirectToPlus ?? false);
    console.error('redirectReason', payload.redirectReason ?? '');
    console.error("navigate('/plus') 呼叫位置", payload.navigatePlusCallsite ?? '');
    console.error('========== END ==========');
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
  }, []);

  const activateLocalTestLogin = useCallback(() => {
    const session = createLocalTestSession();
    saveLocalTestSession(session);
    setUser(session.user);
    setAccessToken(session.accessToken);
    setAuthLoading(false);
    setNotice('本機測試登入已啟用。');
    navigate(withE2E('/chat'), { replace: true });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    setIsLoading(false);
    activeStreamRef.current = false;
    setInput('');
    setNotice('');
    setMessages(DEFAULT_MESSAGES);

    if (isMockSession) {
      clearLocalTestSession();
      setUser(null);
      setAccessToken('');
      navigate(withE2E('/chat'), { replace: true });
      return;
    }

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setAccessToken('');
    navigate(withE2E('/chat'), { replace: true });
  }, [isMockSession, navigate]);

  useEffect(() => {
    if (location.pathname === '/auth/callback' || location.pathname === '/test-login') {
      return;
    }

    if (location.pathname !== '/chat') {
      navigate(withE2E('/chat'), { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (isLocalHost() && location.pathname === '/test-login') {
      activateLocalTestLogin();
      return;
    }

    if (isLocalE2E()) {
      setUser({ id: 'local-e2e-user', email: 'local-e2e@dongni.test' });
      setAccessToken(localE2EToken);
      setAuthLoading(false);
      return undefined;
    }

    if (!isSupabaseConfigured || !supabase) {
      const localSession = isLocalHost() ? readLocalTestSession() : null;
      if (localSession) {
        setUser(localSession.user);
        setAccessToken(localSession.accessToken);
        setAuthLoading(false);
        return undefined;
      }

      setAuthLoading(false);
      setNotice(clientEnvValidation.message || '尚未設定 Supabase OAuth 環境變數，Google 登入暫時無法使用。');
      return undefined;
    }

    setAuthLoading(true);
    supabase.auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setUser(data.session.user ?? null);
          setAccessToken(data.session.access_token ?? '');
          return;
        }

        const localSession = isLocalHost() ? readLocalTestSession() : null;
        if (localSession) {
          setUser(localSession.user);
          setAccessToken(localSession.accessToken);
          return;
        }

        setUser(null);
        setAccessToken('');
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
  }, [activateLocalTestLogin, clientEnvValidation.message, location.pathname]);

  useEffect(() => {
    if (location.pathname !== '/auth/callback' || authLoading) return;

    if (user) {
      setNotice('Google 登入成功。');
      navigate(withE2E('/chat'), { replace: true });
      return;
    }

    setNotice('Google 登入暫時無法完成，請再試一次。');
    navigate(withE2E('/chat'), { replace: true });
  }, [location.pathname, authLoading, user, navigate]);

  useEffect(() => {
    if (!user?.id) {
      setMessages(DEFAULT_MESSAGES);
      messageCountRef.current = DEFAULT_MESSAGES.length;
      return;
    }

    const nextMessages = readHistory(user.id);
    setMessages(nextMessages);
    messageCountRef.current = nextMessages.length;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(chatHistoryKey(user.id), JSON.stringify(messages));
  }, [user?.id, messages]);

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
    if (messages.length !== messageCountRef.current) {
      messageCountRef.current = messages.length;
      scrollToBottom('smooth');
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isLoading) return;
    scrollToBottom('smooth');
  }, [messages, isLoading, scrollToBottom]);

  const handleGoogleLogin = async () => {
    if (!googleLoginEnabled) {
      setNotice(clientEnvValidation.message || 'Google 登入尚未啟用：請先設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。');
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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

    const isFirstEnter = enterTriggerRef.current && !firstEnterDebugLoggedRef.current;
    enterTriggerRef.current = false;
    const trimmedInput = input.trim();
    const debugPayload = {
      userId: user?.id || null,
      sessionId: null,
      conversationSession: null,
      credits: null,
      trialDaysRemaining: null,
      subscription: null,
      canChat: null,
      httpStatus: null,
      responseBody: null,
      responseError: null,
      errorMessage: null,
      willRedirectToPlus: false,
      redirectReason: '',
      navigatePlusCallsite: 'src/App.jsx:handleSubmit/catch -> ge() -> navigate(withE2E(\'/plus\'))'
    };

    if (!trimmedInput || isLoading || activeStreamRef.current) {
      logReturnReason('if (!trimmedInput || isLoading || activeStreamRef.current)', {
        trimmedInput,
        isLoading,
        activeStream: activeStreamRef.current
      });
      if (isFirstEnter) {
        debugPayload.errorMessage = 'submit blocked by early return condition';
        firstEnterDebugLoggedRef.current = true;
        printChatDebug(debugPayload);
      }
      return;
    }

    activeStreamRef.current = true;

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    const aiMessageIndex = newMessages.length;

    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationSession = await startConversationSession(accessToken);
      debugPayload.conversationSession = conversationSession;
      debugPayload.sessionId = conversationSession?.id || conversationSession?.sessionId || null;
      debugPayload.credits = conversationSession?.credits ?? null;
      debugPayload.trialDaysRemaining = conversationSession?.trialDaysRemaining ?? null;
      debugPayload.subscription = conversationSession?.subscription ?? null;
      debugPayload.canChat = conversationSession?.canChat ?? null;
      debugPayload.httpStatus = 200;
      debugPayload.responseBody = conversationSession;

      await sendMessageToServer(newMessages, (chunk) => {
        setMessages((prev) => prev.map((message, index) => (
          index === aiMessageIndex
            ? { ...message, content: `${message.content || ''}${chunk}` }
            : message
        )));
      }, '', accessToken);
    } catch (error) {
      console.error(error);
      debugPayload.httpStatus = error?.status ?? debugPayload.httpStatus;
      debugPayload.responseBody = error?.responseBody ?? debugPayload.responseBody;
      debugPayload.responseError = error?.responseError ?? null;
      debugPayload.errorMessage = error?.message || '回覆失敗，請稍後再試。';

      const plusByStatus = Number(error?.status) === 402;
      const plusByMessage = /(plus|credit|次數)/i.test(String(error?.message || error?.responseError || ''));
      const willRedirectToPlus = plusByStatus || plusByMessage;

      debugPayload.willRedirectToPlus = willRedirectToPlus;
      debugPayload.redirectReason = plusByStatus
        ? 'status===402'
        : (plusByMessage ? 'error.message/response.error contains plus|credit|次數' : 'none');

      if (willRedirectToPlus) {
        ge(debugPayload.redirectReason, {
          status: error?.status ?? null,
          responseError: error?.responseError ?? null,
          errorMessage: error?.message ?? ''
        });
      }

      setMessages((prev) => prev.map((message, index) => (
        index === aiMessageIndex
          ? { ...message, content: error.message || '回覆失敗，請稍後再試。' }
          : message
      )));
      setNotice(error.message || '回覆失敗，請稍後再試。');
    } finally {
      activeStreamRef.current = false;
      setIsLoading(false);
      if (isFirstEnter) {
        firstEnterDebugLoggedRef.current = true;
        printChatDebug(debugPayload);
      }
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      enterTriggerRef.current = true;
      handleSubmit();
      return;
    }

    logReturnReason('if (event.key !== Enter || event.shiftKey)', {
      key: event.key,
      shiftKey: event.shiftKey
    });
  };

  if (location.pathname === '/auth/callback' && authLoading) {
    return <div className="app-loading">Google 登入處理中...</div>;
  }

  if (authLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <h1>進入懂妳</h1>
          <p>使用 Google 登入後，就能開始一段安靜、私密的對話。</p>
          {notice ? <p role="alert">{notice}</p> : null}
          <button
            onClick={handleGoogleLogin}
            className="auth-primary"
            type="button"
            disabled={!googleLoginEnabled}
          >
            {googleLoginEnabled ? '使用 Google 登入' : 'Google 登入尚未啟用'}
          </button>
          {isLocalHost() ? (
            <button onClick={activateLocalTestLogin} className="auth-secondary" type="button">
              本機測試登入
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <div className="dongni-ocean-page">
      <div className="dongni-chat-frame dongni-chat-frame-simple">
        <div className="dongni-chat-nav">
          <div className="dongni-nav-button" aria-hidden="true">已登入</div>
          <div className="dongni-chat-title">【懂 妳】</div>
          <div className="dongni-nav-actions">
            <button onClick={handleLogout} className="dongni-nav-button" type="button">登出</button>
          </div>
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
          ref={messageListRef}
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
