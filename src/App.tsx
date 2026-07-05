import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import { FullscreenLoading } from './lib/loading';
import { useToast } from './lib/use-toast';
import { toErrorMessage } from './lib/errors';
import { ROUTES } from './lib/routes';
import {
  clearLocalTestSession,
  createLocalTestSession,
  isAuthCallbackPath,
  isLocalE2E,
  isLocalHost,
  readLocalTestSession,
  saveLocalTestSession,
  withE2E,
  localE2EToken
} from './lib/auth';
import {
  createConversationForUser,
  deleteConversationForUser,
  getTitleGenerationPayload,
  markConversationTitleFailure,
  readConversationState,
  saveConversationMessages,
  setConversationGeneratedTitle,
  setActiveConversation
} from './lib/chat-history';
import type { AuthSession, ChatMessage } from './types/chat';
import type { ConversationSummary } from './lib/chat-history';
import { generateConversationTitle, sendMessageToServer } from './services/chat';
import { isSupabaseConfigured, supabase } from './supabase';

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    role: 'assistant',
    content: '我在。妳可以慢慢說，不用整理好。'
  }
];

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, showToast, clearToast } = useToast();

  const [user, setUser] = useState<AuthSession['user'] | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>(DEFAULT_MESSAGES);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([]);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const activeStreamRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef('');
  const titleGenerationInFlightRef = useRef(new Set<string>());
  const titleRetryTimersRef = useRef(new Map<string, number>());
  const lastSubmittedRef = useRef<{ content: string; at: number }>({ content: '', at: 0 });
  const [composerHeight, setComposerHeight] = useState(176);
  const userId = user?.id || '';

  const googleLoginEnabled = isSupabaseConfigured && Boolean(supabase);
  const isMockSession = accessToken === localE2EToken && isLocalHost();
  const messageListStyle: CSSProperties & { '--composer-height': string } = {
    '--composer-height': `${composerHeight}px`,
    paddingBottom: 'calc(var(--composer-height) + 28px)'
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messageListRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const activateLocalTestLogin = useCallback(() => {
    const session = createLocalTestSession();
    saveLocalTestSession(session);
    setUser(session.user);
    setAccessToken(session.accessToken);
    setAuthLoading(false);
    showToast('本機測試登入已啟用。');
    navigate(withE2E(ROUTES.chat), { replace: true });
  }, [navigate, showToast]);

  const logout = useCallback(async () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    activeStreamRef.current = false;
    setIsSubmitting(false);
    setInput('');
    clearToast();

    if (isMockSession) {
      clearLocalTestSession();
      setUser(null);
      setAccessToken('');
      setMessages(DEFAULT_MESSAGES);
      setActiveConversationId('');
      setConversationList([]);
      navigate(withE2E(ROUTES.chat), { replace: true });
      return;
    }

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setAccessToken('');
    setMessages(DEFAULT_MESSAGES);
    setActiveConversationId('');
    setConversationList([]);
    navigate(withE2E(ROUTES.chat), { replace: true });
  }, [clearToast, isMockSession, navigate]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const timerMap = titleRetryTimersRef.current;
    const inflightSet = titleGenerationInFlightRef.current;
    return () => {
      for (const timerId of timerMap.values()) {
        window.clearTimeout(timerId);
      }
      timerMap.clear();
      inflightSet.clear();
    };
  }, []);

  useEffect(() => {
    const abortStreaming = () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };

    window.addEventListener('beforeunload', abortStreaming);
    return () => {
      window.removeEventListener('beforeunload', abortStreaming);
      abortStreaming();
    };
  }, []);

  useEffect(() => {
    const onOffline = () => {
      showToast('目前無法連線，請稍後再試');
    };

    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('offline', onOffline);
    };
  }, [showToast]);

  useEffect(() => {
    if (location.pathname === ROUTES.authCallback || location.pathname === ROUTES.testLogin) {
      return;
    }

    if (location.pathname !== ROUTES.chat) {
      navigate(withE2E(ROUTES.chat), { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (isLocalHost() && location.pathname === ROUTES.testLogin) {
      queueMicrotask(() => {
        activateLocalTestLogin();
      });
      return;
    }

    if (isLocalE2E()) {
      setUser({ id: 'local-e2e-user', email: 'local-e2e@dongni.test' });
      setAccessToken(localE2EToken);
      setAuthLoading(false);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      const localSession = isLocalHost() ? readLocalTestSession() : null;
      if (localSession) {
        setUser(localSession.user);
        setAccessToken(localSession.accessToken);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(false);
      showToast('尚未設定 Supabase OAuth 環境變數，Google 登入暫時無法使用。');
      return;
    }

    setAuthLoading(true);
    void supabase.auth.getSession()
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
  }, [activateLocalTestLogin, location.pathname, showToast]);

  useEffect(() => {
    if (!isAuthCallbackPath(location.pathname) || authLoading) return;

    if (user) {
      showToast('Google 登入成功。');
      navigate(withE2E(ROUTES.chat), { replace: true });
      return;
    }

    showToast('Google 登入暫時無法完成，請再試一次。');
    navigate(withE2E(ROUTES.chat), { replace: true });
  }, [authLoading, location.pathname, navigate, user, showToast]);

  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => {
        setMessages(DEFAULT_MESSAGES);
        setActiveConversationId('');
        setConversationList([]);
      });
      for (const timerId of titleRetryTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      titleRetryTimersRef.current.clear();
      titleGenerationInFlightRef.current.clear();
      return;
    }

    const state = readConversationState(userId, DEFAULT_MESSAGES);
    setActiveConversationId(state.activeConversationId);
    setConversationList(state.summaries);
    setMessages(state.messages.length ? state.messages : DEFAULT_MESSAGES);
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeConversationId) return;
    const state = saveConversationMessages(userId, activeConversationId, messages, DEFAULT_MESSAGES);
    setConversationList(state.summaries);
  }, [messages, userId, activeConversationId]);

  const switchConversation = useCallback((conversationId: string) => {
    if (!userId) return;

    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    activeStreamRef.current = false;
    setIsSubmitting(false);
    setInput('');

    const state = setActiveConversation(userId, conversationId, DEFAULT_MESSAGES);
    setActiveConversationId(state.activeConversationId);
    setConversationList(state.summaries);
    setMessages(state.messages.length ? state.messages : DEFAULT_MESSAGES);
  }, [userId]);

  const createNewConversation = useCallback(() => {
    if (!userId) return;

    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    activeStreamRef.current = false;
    setIsSubmitting(false);
    setInput('');

    const state = createConversationForUser(userId, DEFAULT_MESSAGES);
    setActiveConversationId(state.activeConversationId);
    setConversationList(state.summaries);
    setMessages(state.messages.length ? state.messages : DEFAULT_MESSAGES);
  }, [userId]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (!userId) return;

    if (conversationId === activeConversationIdRef.current) {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      activeStreamRef.current = false;
      setIsSubmitting(false);
      setInput('');
    }

    const state = deleteConversationForUser(userId, conversationId, DEFAULT_MESSAGES);
    setActiveConversationId(state.activeConversationId);
    setConversationList(state.summaries);
    setMessages(state.messages.length ? state.messages : DEFAULT_MESSAGES);
  }, [userId]);

  const requestConversationTitle = useCallback(async (conversationId: string) => {
    if (!userId) return;
    if (titleGenerationInFlightRef.current.has(conversationId)) return;

    const payload = getTitleGenerationPayload(userId, conversationId, DEFAULT_MESSAGES);
    if (!payload) return;

    titleGenerationInFlightRef.current.add(conversationId);

    try {
      const title = await generateConversationTitle(payload.messages, { accessToken });
      const nextState = title
        ? setConversationGeneratedTitle(userId, conversationId, title, DEFAULT_MESSAGES)
        : markConversationTitleFailure(userId, conversationId, DEFAULT_MESSAGES);

      setConversationList(nextState.summaries);
    } catch {
      const nextState = markConversationTitleFailure(userId, conversationId, DEFAULT_MESSAGES);
      setConversationList(nextState.summaries);
    } finally {
      titleGenerationInFlightRef.current.delete(conversationId);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    if (!userId || !activeConversationId || isSubmitting) return;

    const active = conversationList.find((conversation) => conversation.id === activeConversationId);
    if (!active) return;
    if (active.titleStatus !== 'pending') return;
    if (!active.canGenerateTitle) return;

    void requestConversationTitle(activeConversationId);
  }, [activeConversationId, conversationList, isSubmitting, requestConversationTitle, userId]);

  useEffect(() => {
    if (!userId || isSubmitting) return;

    const timerMap = titleRetryTimersRef.current;

    const active = conversationList.find((conversation) => conversation.id === activeConversationId);
    if (!active) return;
    if (active.titleStatus !== 'fallback') return;
    if (active.titleAttempts !== 1) return;
    if (!active.canGenerateTitle) return;
    if (titleGenerationInFlightRef.current.has(activeConversationId)) return;
    if (timerMap.has(activeConversationId)) return;

    const timerId = window.setTimeout(() => {
      timerMap.delete(activeConversationId);
      void requestConversationTitle(activeConversationId);
    }, 1600);

    timerMap.set(activeConversationId, timerId);

    return () => {
      const pending = timerMap.get(activeConversationId);
      if (pending) {
        window.clearTimeout(pending);
        timerMap.delete(activeConversationId);
      }
    };
  }, [activeConversationId, conversationList, isSubmitting, requestConversationTitle, userId]);

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
    const composer = composerRef.current;
    if (!composer) return undefined;

    const updateComposerHeight = () => {
      setComposerHeight(Math.max(120, Math.ceil(composer.getBoundingClientRect().height)));
    };

    updateComposerHeight();

    const observer = new ResizeObserver(updateComposerHeight);
    observer.observe(composer);
    window.addEventListener('resize', updateComposerHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateComposerHeight);
    };
  }, []);

  useEffect(() => {
    if (!messages.length) return;

    let rafA = 0;
    let rafB = 0;

    rafA = window.requestAnimationFrame(() => {
      rafB = window.requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });

    return () => {
      window.cancelAnimationFrame(rafA);
      window.cancelAnimationFrame(rafB);
    };
  }, [messages, composerHeight, isSubmitting, scrollToBottom]);

  useEffect(() => {
    if (!toast.visible) return;

    let rafA = 0;
    let rafB = 0;

    rafA = window.requestAnimationFrame(() => {
      rafB = window.requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });

    return () => {
      window.cancelAnimationFrame(rafA);
      window.cancelAnimationFrame(rafB);
    };
  }, [toast.visible, toast.message, scrollToBottom]);

  const loginWithGoogle = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showToast('Google 登入尚未啟用：請先設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。');
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${ROUTES.authCallback}`,
        skipBrowserRedirect: true
      }
    });

    if (error) {
      showToast(toErrorMessage(error, 'Google 登入暫時無法開啟，請稍後再試。'));
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    showToast('Google 登入暫時無法開啟，請稍後再試。');
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();

    const rawInput = input;
    const trimmedInput = rawInput.trim();
    const normalizedInput = trimmedInput.replace(/\s+/g, ' ');

    if (!trimmedInput || isSubmitting || activeStreamRef.current) return;

    if (!navigator.onLine) {
      showToast('目前無法連線，請稍後再試');
      return;
    }

    const now = Date.now();
    const justSubmittedSame =
      normalizedInput === lastSubmittedRef.current.content
      && now - lastSubmittedRef.current.at < 10_000;

    if (justSubmittedSame) {
      showToast('請勿重複送出相同訊息。');
      return;
    }

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    activeStreamRef.current = true;
    setIsSubmitting(true);

    const userMessage: ChatMessage = { role: 'user', content: trimmedInput };
    const nextMessages = [...messages, userMessage];
    const aiIndex = nextMessages.length;
    const streamConversationId = activeConversationId;
    const previousInput = rawInput;

    lastSubmittedRef.current = { content: normalizedInput, at: now };

    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');

    try {
      await sendMessageToServer(nextMessages, (chunk) => {
        setMessages((prev) => prev.map((message, index) => (
          activeConversationIdRef.current === streamConversationId && index === aiIndex
            ? { ...message, content: `${message.content || ''}${chunk}` }
            : message
        )));
      }, {
        accessToken,
        signal: abortController.signal,
        timeoutMs: 30_000
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      lastSubmittedRef.current = { content: '', at: 0 };

      let friendly = toErrorMessage(error, '回覆失敗，請稍後再試。');
      if (!navigator.onLine) {
        friendly = '目前無法連線，請稍後再試';
      } else if (friendly.includes('30 秒內沒有收到回覆')) {
        friendly = '30 秒內沒有收到回覆，請重新送出。';
      } else if (friendly.includes('Failed to fetch') || friendly.includes('NetworkError')) {
        friendly = '目前無法連線，請稍後再試';
      } else {
        friendly = '目前伺服器暫時忙碌，請稍後再試。';
      }

      showToast(friendly);
      setInput(previousInput);
      setMessages((prev) => prev.map((entry, index) => (
        index === aiIndex
          ? { ...entry, content: friendly }
          : entry
      )));
    } finally {
      if (streamAbortRef.current === abortController) {
        streamAbortRef.current = null;
      }

      activeStreamRef.current = false;
      setIsSubmitting(false);
      scrollToBottom('smooth');
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isSubmitting || activeStreamRef.current) return;
      void submit();
    }
  };

  if (location.pathname === ROUTES.authCallback && authLoading) {
    return <FullscreenLoading text="Google 登入處理中..." />;
  }

  if (authLoading) {
    return <FullscreenLoading text="Loading..." />;
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <h1>進入懂妳</h1>
          <p>使用 Google 登入後，就能開始一段安靜、私密的對話。</p>
          {toast.visible ? <p role="alert">{toast.message}</p> : null}
          <button
            onClick={loginWithGoogle}
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
      <div className="dongni-chat-frame">
        <aside className="dongni-conversation-sidebar">
          <button type="button" className="dongni-new-conversation" onClick={createNewConversation}>
            開始新對話
          </button>

          <div className="dongni-conversation-list" role="list" aria-label="Conversation list">
            {conversationList.map((conversation) => (
              <div
                key={conversation.id}
                role="listitem"
                className={`dongni-conversation-item ${conversation.isActive ? 'dongni-conversation-item-active' : ''}`}
              >
                <button
                  type="button"
                  className="dongni-conversation-select"
                  onClick={() => switchConversation(conversation.id)}
                >
                  {conversation.title}
                </button>
                <button
                  type="button"
                  className="dongni-conversation-delete"
                  onClick={() => deleteConversation(conversation.id)}
                  aria-label="刪除對話"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="dongni-chat-main">
        <div className="dongni-chat-nav">
          <div className="dongni-nav-button" aria-hidden="true">已登入</div>
          <div className="dongni-chat-title">【懂 妳】</div>
          <div className="dongni-nav-actions">
            <button onClick={() => void logout()} className="dongni-nav-button" type="button">登出</button>
          </div>
        </div>

        {toast.visible ? (
          <button className="dongni-notice" type="button" onClick={clearToast}>
            {toast.message}
          </button>
        ) : null}

        <div
          ref={messageListRef}
          className={`dongni-message-list scrollbar-none ${
            messages.length === 1 ? 'dongni-message-list-centered' : 'dongni-message-list-spaced'
          }`}
          style={messageListStyle}
        >
          {messages.map((msg, index) => (
            <div
              key={`${msg.role}-${index}`}
              className={`dongni-message-row ${msg.role === 'user' ? 'dongni-message-row-user' : 'dongni-message-row-assistant'}`}
            >
              {msg.role === 'user' ? (
                <div className="dongni-user-bubble animate-fade-in">{msg.content}</div>
              ) : (
                <div className="dongni-ai-message animate-fade-in">
                  {msg.content || (isSubmitting && index === messages.length - 1 ? (
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

        <form ref={composerRef} onSubmit={(event) => void submit(event)} className="dongni-chat-form">
          <textarea
            className="dongni-chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onInputKeyDown}
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
          <button type="submit" disabled={!input.trim() || isSubmitting} className="dongni-chat-submit">
            {isSubmitting ? '傳送中...' : '送出'}
          </button>
        </form>
        </main>
      </div>
    </div>
  );
}

export default App;
