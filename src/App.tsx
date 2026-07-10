import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import EcpayTestPage from './EcpayTestPage';
import PaymentResultPage from './PaymentResultPage';
import PayPalLiveTestPage from './PayPalLiveTestPage';
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

const welcomeConsentKey = 'dongni_welcome_disclaimer_ack';
type Provider = 'ecpay' | 'paypal';
type PlanId = 'dongni-plus-single' | 'dongni-plus-six-pack';

type ProviderStatus = {
  available: boolean;
  reason: string;
};

const DEFAULT_PROVIDER_STATUS: Record<Provider, ProviderStatus> = {
  ecpay: { available: true, reason: '' },
  paypal: { available: true, reason: '' }
};

function toFriendlyProviderReason(provider: Provider, reason: string) {
  const text = String(reason || '').trim();
  if (!text) return provider === 'ecpay' ? 'ECPay 目前暫時無法使用。' : 'PayPal 目前暫時無法使用。';

  const lower = text.toLowerCase();
  if (lower.includes('sandbox') || lower.includes('test merchant') || lower.includes('invalid_client')) {
    return provider === 'ecpay'
      ? 'ECPay 付款服務尚在切換正式設定，請稍後再試。'
      : 'PayPal 付款服務尚在切換正式設定，請稍後再試。';
  }
  if (lower.includes('missing') || lower.includes('required')) {
    return provider === 'ecpay'
      ? 'ECPay 付款設定尚未完成。'
      : 'PayPal 付款設定尚未完成。';
  }

  return provider === 'ecpay' ? 'ECPay 目前暫時無法使用。' : 'PayPal 目前暫時無法使用。';
}

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
  const [welcomeConfirmed, setWelcomeConfirmed] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [paymentCountry, setPaymentCountry] = useState('');
  const [providerStatus, setProviderStatus] = useState<Record<Provider, ProviderStatus>>(DEFAULT_PROVIDER_STATUS);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('ecpay');
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('dongni-plus-single');
  const [paymentOptionsLoading, setPaymentOptionsLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const activeStreamRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef('');
  const titleGenerationInFlightRef = useRef(new Set<string>());
  const titleRetryTimersRef = useRef(new Map<string, number>());
  const lastSubmittedRef = useRef<{ content: string; at: number }>({ content: '', at: 0 });
  const firstEnterDebugLoggedRef = useRef(false);
  const enterTriggeredRef = useRef(false);
  const paypalProcessingOrdersRef = useRef(new Set<string>());
  const [composerHeight, setComposerHeight] = useState(176);
  const userId = user?.id || '';
  const isProductionClient = import.meta.env.PROD;
  const shouldLogChatDebug = !isProductionClient;

  const googleLoginEnabled = isSupabaseConfigured && Boolean(supabase);
  const isMockSession = accessToken === localE2EToken && isLocalHost();
  const messageListStyle: CSSProperties & { '--composer-height': string } = {
    '--composer-height': `${composerHeight}px`,
    paddingBottom: 'calc(var(--composer-height) + 28px)'
  };

  const logReturnReason = useCallback((ifName: string, context: Record<string, unknown> = {}) => {
    if (!shouldLogChatDebug) return;
    console.error('[CHAT DEBUG RETURN]', ifName, context);
  }, [shouldLogChatDebug]);

  const printChatDebug = useCallback((payload: Record<string, unknown>) => {
    if (!shouldLogChatDebug) return;
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
  }, [shouldLogChatDebug]);

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
    try {
      setWelcomeConfirmed(window.localStorage.getItem(welcomeConsentKey) === '1');
    } catch {
      setWelcomeConfirmed(false);
    }
  }, []);

  useEffect(() => {
    if (isProductionClient && [ROUTES.testLogin, ROUTES.paypalLiveTest, ROUTES.ecpayTest].includes(location.pathname as typeof ROUTES[keyof typeof ROUTES])) {
      navigate(withE2E(ROUTES.chat), { replace: true });
      return;
    }

    if (
      location.pathname === ROUTES.authCallback
      || location.pathname === ROUTES.testLogin
      || location.pathname === ROUTES.paypalLiveTest
      || location.pathname === ROUTES.ecpayTest
      || location.pathname === ROUTES.paymentResult
    ) {
      return;
    }

    if (location.pathname !== ROUTES.chat) {
      navigate(withE2E(ROUTES.chat), { replace: true });
    }
  }, [isProductionClient, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== ROUTES.chat) return;

    const params = new URLSearchParams(location.search);
    const paymentStatus = String(params.get('payment') || '').trim().toLowerCase();
    if (!paymentStatus) return;

    const clearPaymentQuery = () => {
      navigate(withE2E(ROUTES.chat), { replace: true });
    };

    if (paymentStatus === 'paypal-cancel') {
      showToast('已取消 PayPal 付款。');
      clearPaymentQuery();
      return;
    }

    if (paymentStatus === 'paypal-failed') {
      showToast('PayPal 付款未完成，請再試一次。');
      clearPaymentQuery();
      return;
    }

    if (paymentStatus !== 'paypal-success') {
      clearPaymentQuery();
      return;
    }

    if (!accessToken) return;

    const orderId = String(params.get('token') || params.get('orderId') || '').trim();
    if (!orderId) {
      showToast('付款返回缺少 PayPal 訂單資訊，請重新付款。');
      clearPaymentQuery();
      return;
    }

    if (paypalProcessingOrdersRef.current.has(orderId)) {
      return;
    }

    paypalProcessingOrdersRef.current.add(orderId);

    const processPayment = async () => {
      try {
        const response = await fetch('/api/paypal-capture-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ orderId })
        });

        const raw = await response.text();
        let data: Record<string, unknown> = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { error: raw || 'Unable to confirm PayPal payment.' };
        }

        if (!response.ok) {
          showToast(String(data.error || '無法確認 PayPal 付款，請稍後再試。'));
          return;
        }

        if (data.duplicate) {
          showToast('此筆 PayPal 付款已處理完成。');
          return;
        }

        const credits = Number(data.credits || 0);
        if (credits > 0) {
          showToast(`付款成功，已新增 ${credits} 次 Plus。`);
          return;
        }

        showToast('付款成功。');
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : '無法確認 PayPal 付款，請稍後再試。';
        showToast(message);
      } finally {
        paypalProcessingOrdersRef.current.delete(orderId);
        clearPaymentQuery();
      }
    };

    void processPayment();
  }, [accessToken, location.pathname, location.search, navigate, showToast]);

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

  const onToggleWelcomeConfirmed = () => {
    const nextValue = !welcomeConfirmed;
    setWelcomeConfirmed(nextValue);
    try {
      if (nextValue) {
        window.localStorage.setItem(welcomeConsentKey, '1');
      } else {
        window.localStorage.removeItem(welcomeConsentKey);
      }
    } catch {
      // Ignore storage write errors in restricted browsers.
    }
  };

  const openPurchaseModal = () => {
    setPurchaseError('');
    setPurchaseOpen(true);
  };

  const closePurchaseModal = () => {
    if (isCreatingCheckout) return;
    setPurchaseError('');
    setPurchaseOpen(false);
  };

  useEffect(() => {
    if (!purchaseOpen) return;

    let canceled = false;

    const loadPaymentOptions = async () => {
      setPaymentOptionsLoading(true);

      try {
        const response = await fetch('/api/payment-options');
        const raw = await response.text();
        let data: Record<string, unknown> = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }

        const providers = Array.isArray(data.availableProviders)
          ? data.availableProviders.filter((item): item is Provider => item === 'ecpay' || item === 'paypal')
          : [];

        const nextStatus: Record<Provider, ProviderStatus> = {
          ecpay: {
            available: providers.includes('ecpay'),
            reason: toFriendlyProviderReason('ecpay', String((data.providers as Record<string, unknown> | undefined)?.ecpay && typeof (data.providers as Record<string, unknown>).ecpay === 'object'
              ? ((data.providers as Record<string, Record<string, unknown>>).ecpay?.reason || '')
              : ''))
          },
          paypal: {
            available: providers.includes('paypal'),
            reason: toFriendlyProviderReason('paypal', String((data.providers as Record<string, unknown> | undefined)?.paypal && typeof (data.providers as Record<string, unknown>).paypal === 'object'
              ? ((data.providers as Record<string, Record<string, unknown>>).paypal?.reason || '')
              : ''))
          }
        };

        const recommended = data.recommendedProvider === 'paypal' ? 'paypal' : 'ecpay';
        const nextProvider = providers.includes(recommended)
          ? recommended
          : (providers[0] || recommended);

        if (!canceled) {
          setProviderStatus(nextStatus);
          setSelectedProvider(nextProvider);
          setPaymentCountry(String(data.country || '').trim().toUpperCase());
          setPurchaseError('');
        }
      } catch {
        if (!canceled) {
          setProviderStatus(DEFAULT_PROVIDER_STATUS);
          setSelectedProvider('ecpay');
          setPaymentCountry('');
          setPurchaseError('付款方式載入失敗，請稍後再試。');
        }
      } finally {
        if (!canceled) {
          setPaymentOptionsLoading(false);
        }
      }
    };

    void loadPaymentOptions();

    return () => {
      canceled = true;
    };
  }, [purchaseOpen]);

  const submitEcpayOrderForm = useCallback((payload: Record<string, unknown>) => {
    const actionUrl = String(payload.actionUrl || '').trim();
    const method = String(payload.method || 'POST').trim().toUpperCase();
    const fields = payload.fields && typeof payload.fields === 'object'
      ? payload.fields as Record<string, unknown>
      : null;

    if (!actionUrl || !fields) {
      throw new Error('ECPay checkout response is incomplete.');
    }

    const form = document.createElement('form');
    form.method = method === 'GET' ? 'GET' : 'POST';
    form.action = actionUrl;
    form.style.display = 'none';

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value ?? '');
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
  }, []);

  const startCheckout = async () => {
    if (isCreatingCheckout) return;

    if (!accessToken) {
      const message = '登入狀態已失效，請重新登入後再付款。';
      setPurchaseError(message);
      showToast(message);
      return;
    }

    const status = providerStatus[selectedProvider];
    if (!status.available) {
      const message = status.reason || '此付款方式目前不可用，請切換其他付款方式。';
      setPurchaseError(message);
      showToast(message);
      return;
    }

    setIsCreatingCheckout(true);
    setPurchaseError('');

    try {
      if (accessToken === 'local-e2e-token' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        const marker = selectedProvider === 'paypal' ? 'paypal-success' : 'ecpay-success';
        window.location.assign(`/?e2e=1&payment=${marker}&token=local-${selectedPlan}`);
        return;
      }

      const endpoint = selectedProvider === 'ecpay' ? '/api/ecpay' : '/api/create-checkout-session';
      const body = selectedProvider === 'ecpay'
        ? { action: 'create-order', plan: selectedPlan }
        : { plan: selectedPlan };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
      });

      const raw = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || '付款建立失敗，請稍後再試。' };
      }

      if (selectedProvider === 'ecpay') {
        if (!response.ok) {
          const message = String(data.error || 'ECPay 付款建立失敗，請稍後再試。');
          setPurchaseError(message);
          showToast(message);
          setIsCreatingCheckout(false);
          return;
        }
        submitEcpayOrderForm(data);
        return;
      }

      if (!response.ok || !data.url) {
        const message = String(data.error || '付款建立失敗，請稍後再試。');
        setPurchaseError(message);
        showToast(message);
        setIsCreatingCheckout(false);
        return;
      }

      window.location.assign(String(data.url));
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '付款建立失敗，請稍後再試。';
      setPurchaseError(message);
      showToast(message);
      setIsCreatingCheckout(false);
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();

    const rawInput = input;
    const trimmedInput = rawInput.trim();
    const normalizedInput = trimmedInput.replace(/\s+/g, ' ');
    const isFirstEnter = enterTriggeredRef.current && !firstEnterDebugLoggedRef.current;
    enterTriggeredRef.current = false;

    const debugPayload: Record<string, unknown> = {
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
      navigatePlusCallsite: 'not called in src/App.tsx submit path'
    };

    if (!trimmedInput || isSubmitting || activeStreamRef.current) {
      logReturnReason('if (!trimmedInput || isSubmitting || activeStreamRef.current)', {
        trimmedInput,
        isSubmitting,
        activeStream: activeStreamRef.current
      });
      if (isFirstEnter) {
        debugPayload.errorMessage = 'submit blocked by early return condition';
        firstEnterDebugLoggedRef.current = true;
        printChatDebug(debugPayload);
      }
      return;
    }

    if (!navigator.onLine) {
      logReturnReason('if (!navigator.onLine)', {});
      showToast('目前無法連線，請稍後再試');
      if (isFirstEnter) {
        debugPayload.errorMessage = 'offline';
        firstEnterDebugLoggedRef.current = true;
        printChatDebug(debugPayload);
      }
      return;
    }

    const now = Date.now();
    const justSubmittedSame =
      normalizedInput === lastSubmittedRef.current.content
      && now - lastSubmittedRef.current.at < 10_000;

    if (justSubmittedSame) {
      logReturnReason('if (justSubmittedSame)', {
        normalizedInput,
        lastContent: lastSubmittedRef.current.content,
        lastAt: lastSubmittedRef.current.at,
        now
      });
      showToast('請勿重複送出相同訊息。');
      if (isFirstEnter) {
        debugPayload.errorMessage = 'duplicate submit blocked';
        firstEnterDebugLoggedRef.current = true;
        printChatDebug(debugPayload);
      }
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
      if (isFirstEnter) {
        const sessionResponse = await fetch('/api/conversation-session', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        let responseBody: unknown = null;
        let responseError: string | null = null;
        try {
          responseBody = await sessionResponse.json();
          responseError = (responseBody as { error?: string })?.error ?? null;
        } catch {
          responseBody = null;
          responseError = null;
        }

        const sessionLike = (responseBody && typeof responseBody === 'object')
          ? responseBody as Record<string, unknown>
          : {};

        debugPayload.httpStatus = sessionResponse.status;
        debugPayload.responseBody = responseBody;
        debugPayload.responseError = responseError;
        debugPayload.conversationSession = responseBody;
        debugPayload.sessionId = sessionLike.id ?? sessionLike.sessionId ?? null;
        debugPayload.credits = sessionLike.credits ?? null;
        debugPayload.trialDaysRemaining = sessionLike.trialDaysRemaining ?? null;
        debugPayload.subscription = sessionLike.subscription ?? null;
        debugPayload.canChat = sessionLike.canChat ?? null;

        if (sessionResponse.status === 402) {
          debugPayload.willRedirectToPlus = true;
          debugPayload.redirectReason = 'conversation-session status===402';
          debugPayload.navigatePlusCallsite = 'src/App.tsx:submit -> conversation-session status===402 branch';
          console.error("[CHAT DEBUG] navigate('/plus') 呼叫位置", {
            location: 'src/App.tsx:submit',
            reason: 'conversation-session status===402'
          });
        }
      }

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
        logReturnReason('if (error instanceof DOMException && error.name === AbortError)', {});
        if (isFirstEnter) {
          debugPayload.errorMessage = 'AbortError';
        }
        return;
      }

      lastSubmittedRef.current = { content: '', at: 0 };

      let friendly = toErrorMessage(error, '回覆失敗，請稍後再試。');
      const richError = error as Error & {
        status?: number;
        responseBody?: unknown;
        responseError?: string | null;
      };

      debugPayload.httpStatus = richError.status ?? debugPayload.httpStatus;
      debugPayload.responseBody = richError.responseBody ?? debugPayload.responseBody;
      debugPayload.responseError = richError.responseError ?? debugPayload.responseError;
      debugPayload.errorMessage = richError.message || friendly;

      const plusByStatus = Number(richError.status) === 402;
      const plusByMessage = /(plus|credit|次數)/i.test(String(richError.message || richError.responseError || ''));
      debugPayload.willRedirectToPlus = plusByStatus || plusByMessage;
      debugPayload.redirectReason = plusByStatus
        ? 'status===402'
        : (plusByMessage ? 'error.message/response.error contains plus|credit|次數' : 'none');

      if (debugPayload.willRedirectToPlus) {
        debugPayload.navigatePlusCallsite = 'src/App.tsx:submit/catch plus branch';
        if (shouldLogChatDebug) {
          console.error('[CHAT DEBUG] ge() called', {
            location: 'src/App.tsx:submit/catch',
            reason: debugPayload.redirectReason
          });
          console.error("[CHAT DEBUG] navigate('/plus') 呼叫位置", {
            location: 'src/App.tsx:submit/catch',
            reason: debugPayload.redirectReason
          });
          console.error("[CHAT DEBUG] router.push('/plus') 呼叫位置", {
            location: 'src/App.tsx:submit/catch',
            reason: debugPayload.redirectReason,
            note: 'react-router-dom does not use router.push in this file'
          });
        }
      }

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
      if (isFirstEnter) {
        firstEnterDebugLoggedRef.current = true;
        printChatDebug(debugPayload);
      }
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      enterTriggeredRef.current = true;
      if (isSubmitting || activeStreamRef.current) {
        logReturnReason('if (isSubmitting || activeStreamRef.current) in onInputKeyDown', {
          isSubmitting,
          activeStream: activeStreamRef.current
        });
        return;
      }
      void submit();
      return;
    }

    logReturnReason('if (event.key !== Enter || event.shiftKey) in onInputKeyDown', {
      key: event.key,
      shiftKey: event.shiftKey
    });
  };

  if (location.pathname === ROUTES.authCallback && authLoading) {
    return <FullscreenLoading text="Google 登入處理中..." />;
  }

  if (!isProductionClient && location.pathname === ROUTES.paypalLiveTest) {
    return <PayPalLiveTestPage />;
  }

  if (!isProductionClient && location.pathname === ROUTES.ecpayTest) {
    return <EcpayTestPage />;
  }
  
  if (location.pathname === ROUTES.paymentResult) {
    return <PaymentResultPage />;
  }

  if (authLoading) {
    return <FullscreenLoading text="Loading..." />;
  }

  if (!user) {
    return (
      <main className="welcome-screen">
        <section className="welcome-panel">
          <p className="welcome-kicker">懂妳・情緒陪伴空間</p>
          <h1>先讓心，慢慢落地。</h1>
          <p className="welcome-subtitle">
            這裡不是諮商，也不會替妳做人生決定。
            <br />
            這裡只是陪妳，把混亂說成一句句可以呼吸的話。
          </p>

          <div className="welcome-highlights" role="list" aria-label="Welcome highlights">
            <article className="welcome-card" role="listitem">
              <h2>安靜回覆</h2>
              <p>不用整理好才來，想到哪裡就說到哪裡。</p>
            </article>
            <article className="welcome-card" role="listitem">
              <h2>私密對話</h2>
              <p>登入後進入妳專屬的對話記錄與節奏。</p>
            </article>
            <article className="welcome-card" role="listitem">
              <h2>有限陪伴</h2>
              <p>30 分鐘無輸入會結束，避免長時間失焦。</p>
            </article>
          </div>

          <div className="welcome-disclaimer">
            <p className="welcome-disclaimer-title">使用前提醒</p>
            <p>
              懂妳提供情緒陪伴，不取代專業醫療或心理治療。
              若妳正處於緊急危險或有自傷風險，請立即聯絡當地緊急服務。
            </p>
            <label className="welcome-consent" htmlFor="welcome-consent-checkbox">
              <input
                id="welcome-consent-checkbox"
                type="checkbox"
                checked={welcomeConfirmed}
                onChange={onToggleWelcomeConfirmed}
              />
              <span>我已了解並同意以上提醒。</span>
            </label>
          </div>

          {toast.visible ? <p role="alert" className="welcome-alert">{toast.message}</p> : null}

          <button
            onClick={loginWithGoogle}
            className="auth-primary"
            type="button"
            disabled={!googleLoginEnabled || !welcomeConfirmed}
          >
            {googleLoginEnabled ? '同意後，使用 Google 登入' : 'Google 登入尚未啟用'}
          </button>
          {!welcomeConfirmed ? (
            <p className="welcome-hint">請先勾選同意提醒，才能開始登入。</p>
          ) : null}

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
            <button onClick={openPurchaseModal} className="dongni-nav-button" type="button">購買次數</button>
            <button onClick={() => void logout()} className="dongni-nav-button" type="button">登出</button>
          </div>
        </div>

        {purchaseOpen ? (
          <div className="dongni-purchase-modal-backdrop" onClick={closePurchaseModal}>
            <section className="dongni-purchase-modal" onClick={(event) => event.stopPropagation()}>
              <h2 className="dongni-purchase-title">購買次數</h2>
              <p className="dongni-purchase-subtitle">
                {paymentCountry === 'TW'
                  ? '偵測到台灣地區，預設使用 ECPay。'
                  : (paymentCountry ? `偵測地區：${paymentCountry}，預設使用 PayPal。` : '無法判定地區，預設使用 ECPay。')}
              </p>

              <div className="dongni-purchase-plan-grid" role="tablist" aria-label="付款方案">
                <button
                  type="button"
                  className={`dongni-purchase-plan ${selectedPlan === 'dongni-plus-single' ? 'dongni-purchase-plan-active' : ''}`}
                  onClick={() => setSelectedPlan('dongni-plus-single')}
                  disabled={isCreatingCheckout}
                >
                  NT$200 / 1 次
                </button>
                <button
                  type="button"
                  className={`dongni-purchase-plan ${selectedPlan === 'dongni-plus-six-pack' ? 'dongni-purchase-plan-active' : ''}`}
                  onClick={() => setSelectedPlan('dongni-plus-six-pack')}
                  disabled={isCreatingCheckout}
                >
                  NT$1000 / 6 次
                </button>
              </div>

              <div className="dongni-purchase-provider-grid" role="tablist" aria-label="付款方式">
                <button
                  type="button"
                  className={`dongni-purchase-provider ${selectedProvider === 'ecpay' ? 'dongni-purchase-provider-active' : ''}`}
                  onClick={() => {
                    setSelectedProvider('ecpay');
                    setPurchaseError('');
                  }}
                  disabled={isCreatingCheckout || paymentOptionsLoading || !providerStatus.ecpay.available}
                >
                  ECPay（台灣）
                </button>
                <button
                  type="button"
                  className={`dongni-purchase-provider ${selectedProvider === 'paypal' ? 'dongni-purchase-provider-active' : ''}`}
                  onClick={() => {
                    setSelectedProvider('paypal');
                    setPurchaseError('');
                  }}
                  disabled={isCreatingCheckout || paymentOptionsLoading || !providerStatus.paypal.available}
                >
                  PayPal（海外）
                </button>
              </div>

              {!providerStatus.ecpay.available && providerStatus.ecpay.reason ? (
                <p className="dongni-purchase-provider-note">ECPay 目前不可用：{providerStatus.ecpay.reason}</p>
              ) : null}
              {!providerStatus.paypal.available && providerStatus.paypal.reason ? (
                <p className="dongni-purchase-provider-note">PayPal 目前不可用：{providerStatus.paypal.reason}</p>
              ) : null}
              {purchaseError ? <p className="dongni-purchase-error">{purchaseError}</p> : null}

              <button
                type="button"
                className="dongni-purchase-pay-button"
                disabled={isCreatingCheckout || paymentOptionsLoading || !providerStatus[selectedProvider].available}
                onClick={() => void startCheckout()}
              >
                {isCreatingCheckout
                  ? '處理中...'
                  : (selectedProvider === 'ecpay' ? '前往 ECPay 付款' : '前往 PayPal 付款')}
              </button>
              <button
                type="button"
                className="dongni-purchase-close-button"
                disabled={isCreatingCheckout}
                onClick={closePurchaseModal}
              >
                關閉
              </button>
            </section>
          </div>
        ) : null}

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
