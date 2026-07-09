import { useEffect, useMemo, useState } from 'react';
import './PayPalLiveTestPage.css';

type LiveConfig = {
  mode: 'live' | 'sandbox';
  clientId: string;
  maskedClientId: string;
  hasClientId: boolean;
  hasClientSecret: boolean;
  amount: string;
  currency: string;
  packageName: string;
};

type PaymentResult = {
  status: 'idle' | 'success' | 'cancel' | 'error';
  message: string;
  orderId?: string | null;
  transactionId?: string | null;
  payerId?: string | null;
  payerEmail?: string | null;
  payerName?: string | null;
  paymentStatus?: string | null;
  raw?: unknown;
};

type PayPalButtonsProps = {
  style?: {
    layout?: 'vertical' | 'horizontal';
    shape?: 'rect' | 'pill';
    color?: 'gold' | 'blue' | 'silver' | 'white' | 'black';
    label?: 'paypal' | 'checkout' | 'buynow' | 'pay' | 'installment';
    tagline?: boolean;
  };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID?: string }) => Promise<void>;
  onCancel: (data: { orderID?: string }) => void;
  onError: (error: unknown) => void;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (props: PayPalButtonsProps) => {
        render: (container: string | HTMLElement) => Promise<void>;
      };
    };
  }
}

function parseApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string' && errorValue.trim()) {
      return errorValue.trim();
    }
  }
  return fallback;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const rawText = await response.text();
  if (!rawText.trim()) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { error: rawText.slice(0, 400) };
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? input as Record<string, unknown> : {};
}

function getStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export default function PayPalLiveTestPage() {
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isRenderingButton, setIsRenderingButton] = useState(false);
  const [buttonRendered, setButtonRendered] = useState(false);
  const [blockingError, setBlockingError] = useState('');
  const [paymentResult, setPaymentResult] = useState<PaymentResult>({ status: 'idle', message: '尚未開始付款。' });

  const warningText = '警告：這是 LIVE PayPal real payment test，會對真實付款方式扣款。';

  const resultClassName = useMemo(() => {
    if (paymentResult.status === 'success') return 'paypal-live-result paypal-live-result-success';
    if (paymentResult.status === 'cancel') return 'paypal-live-result paypal-live-result-cancel';
    if (paymentResult.status === 'error') return 'paypal-live-result paypal-live-result-error';
    return 'paypal-live-result';
  }, [paymentResult.status]);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setIsLoadingConfig(true);
      setBlockingError('');
      setButtonRendered(false);

      try {
        const response = await fetch('/api/paypal-live-test-config');
        const data = asRecord(await readJsonResponse(response));

        if (!response.ok) {
          const errorMessage = parseApiError(data, 'Failed to load LIVE PayPal test configuration.');
          throw new Error(errorMessage);
        }

        const mode = getStringField(data, 'mode');
        const clientId = getStringField(data, 'clientId');
        const amount = getStringField(data, 'amount');
        const currency = getStringField(data, 'currency');
        const packageName = getStringField(data, 'packageName');

        if (!mode || !clientId || !amount || !currency || !packageName) {
          throw new Error('LIVE PayPal test config API returned an invalid payload. If testing locally, deploy to Vercel Preview/Production to use /api functions.');
        }

        if (!cancelled) {
          setConfig(data as LiveConfig);
          console.log('[PayPal LIVE Test] config loaded', {
            mode: getStringField(data, 'mode'),
            maskedClientId: getStringField(data, 'maskedClientId'),
            hasClientId: Boolean(data.hasClientId),
            hasClientSecret: Boolean(data.hasClientSecret),
            amount: getStringField(data, 'amount'),
            currency: getStringField(data, 'currency'),
            packageName: getStringField(data, 'packageName')
          });
        }
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : 'Failed to load LIVE PayPal test configuration.';
        console.error('[PayPal LIVE Test] config error', error);
        if (!cancelled) {
          setBlockingError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingConfig(false);
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config || blockingError || isLoadingConfig) return;
    if (config.mode !== 'live') {
      setBlockingError('LIVE PayPal test is blocked: PAYPAL_ENV is not live.');
      return;
    }
    if (!config.clientId) {
      setBlockingError('LIVE PayPal test is blocked: PAYPAL_CLIENT_ID is missing.');
      return;
    }

    let cancelled = false;

    const loadSdkAndRender = async () => {
      setIsRenderingButton(true);
      setButtonRendered(false);

      const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=${encodeURIComponent(config.currency)}&intent=capture`;
      console.log('[PayPal LIVE Test] loading SDK', { sdkUrlMasked: sdkUrl.replace(config.clientId, config.maskedClientId) });

      try {
        await new Promise<void>((resolve, reject) => {
          const existingScript = document.querySelector<HTMLScriptElement>('script[data-paypal-live-test="1"]');
          if (existingScript && window.paypal) {
            resolve();
            return;
          }

          const script = existingScript || document.createElement('script');
          script.src = sdkUrl;
          script.async = true;
          script.dataset.paypalLiveTest = '1';

          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load PayPal LIVE SDK.'));

          if (!existingScript) {
            document.head.appendChild(script);
          }
        });

        if (cancelled) return;

        if (!window.paypal || typeof window.paypal.Buttons !== 'function') {
          throw new Error('PayPal LIVE SDK loaded but Buttons API is unavailable.');
        }

        const container = document.getElementById('paypal-live-button-container');
        if (!container) {
          throw new Error('PayPal button container not found.');
        }

        container.innerHTML = '';

        await window.paypal.Buttons({
          style: {
            layout: 'vertical',
            shape: 'rect',
            color: 'gold',
            label: 'pay',
            tagline: false
          },
          createOrder: async () => {
            console.log('[PayPal LIVE Test] createOrder requested');
            const response = await fetch('/api/paypal-live-test-create-order', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                amount: config.amount,
                currency: config.currency,
                packageName: config.packageName
              })
            });

            const payload = asRecord(await readJsonResponse(response));
            if (!response.ok) {
              const message = parseApiError(payload, 'Failed to create LIVE PayPal order.');
              console.error('[PayPal LIVE Test] createOrder error', payload);
              throw new Error(message);
            }

            console.log('[PayPal LIVE Test] createOrder success', payload);
            return String(payload.orderId || '');
          },
          onApprove: async (data) => {
            console.log('[PayPal LIVE Test] onApprove', data);
            try {
              const response = await fetch('/api/paypal-live-test-capture-order', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ orderId: data.orderID })
              });

              const payload = asRecord(await readJsonResponse(response));
              if (!response.ok) {
                const message = parseApiError(payload, 'Failed to capture LIVE PayPal order.');
                console.error('[PayPal LIVE Test] capture error', payload);
                setPaymentResult({
                  status: 'error',
                  message,
                  orderId: data.orderID || null,
                  raw: payload
                });
                return;
              }

              console.log('[PayPal LIVE Test] capture success', payload);
              setPaymentResult({
                status: 'success',
                message: '付款成功，已完成 LIVE PayPal 測試交易。',
                orderId: getStringField(payload, 'orderId') || data.orderID || null,
                transactionId: getStringField(payload, 'transactionId'),
                payerId: getStringField(payload, 'payerId'),
                payerEmail: getStringField(payload, 'payerEmail'),
                payerName: getStringField(payload, 'payerName'),
                paymentStatus: getStringField(payload, 'captureStatus') || getStringField(payload, 'orderStatus'),
                raw: payload
              });
            } catch (error) {
              const message = error instanceof Error && error.message
                ? error.message
                : 'Failed to capture LIVE PayPal order.';
              console.error('[PayPal LIVE Test] capture exception', error);
              setPaymentResult({
                status: 'error',
                message,
                orderId: data.orderID || null
              });
            }
          },
          onCancel: (data) => {
            console.warn('[PayPal LIVE Test] payment canceled', data);
            setPaymentResult({
              status: 'cancel',
              message: '使用者已取消付款。',
              orderId: data.orderID || null
            });
          },
          onError: (error) => {
            const message = error instanceof Error && error.message
              ? error.message
              : 'PayPal LIVE button returned an unknown error.';
            console.error('[PayPal LIVE Test] button error', error);
            setPaymentResult({
              status: 'error',
              message
            });
          }
        }).render('#paypal-live-button-container');

        if (!cancelled) {
          setButtonRendered(true);
          console.log('[PayPal LIVE Test] button rendered');
        }
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : 'Unable to render PayPal LIVE payment button.';
        console.error('[PayPal LIVE Test] render error', error);
        if (!cancelled) {
          setBlockingError(message);
        }
      } finally {
        if (!cancelled) {
          setIsRenderingButton(false);
        }
      }
    };

    void loadSdkAndRender();

    return () => {
      cancelled = true;
    };
  }, [blockingError, config, isLoadingConfig]);

  return (
    <main className="paypal-live-page">
      <section className="paypal-live-panel">
        <h1>LIVE PayPal real payment test</h1>
        <p className="paypal-live-warning">{warningText}</p>

        <div className="paypal-live-meta-grid">
          <div className="paypal-live-meta-item">
            <span className="paypal-live-label">PayPal mode</span>
            <strong>{config?.mode?.toUpperCase() || 'Unknown'}</strong>
          </div>
          <div className="paypal-live-meta-item">
            <span className="paypal-live-label">Charged amount</span>
            <strong>{config?.amount && config?.currency ? `${config.amount} ${config.currency}` : '-'}</strong>
          </div>
          <div className="paypal-live-meta-item">
            <span className="paypal-live-label">Currency</span>
            <strong>{config?.currency || '-'}</strong>
          </div>
          <div className="paypal-live-meta-item">
            <span className="paypal-live-label">Product/package</span>
            <strong>{config?.packageName || '-'}</strong>
          </div>
          <div className="paypal-live-meta-item">
            <span className="paypal-live-label">Client ID</span>
            <strong>{config?.maskedClientId || '-'}</strong>
          </div>
          <div className="paypal-live-meta-item">
            <span className="paypal-live-label">Env readiness</span>
            <strong>
              {config?.hasClientId && config?.hasClientSecret && config?.mode === 'live'
                ? 'Ready'
                : 'Blocked'}
            </strong>
          </div>
        </div>

        {isLoadingConfig ? <p>Loading LIVE PayPal configuration...</p> : null}
        {isRenderingButton ? <p>Rendering PayPal LIVE button...</p> : null}

        {blockingError ? (
          <div className="paypal-live-blocking-error" role="alert">
            {blockingError}
          </div>
        ) : null}

        <div id="paypal-live-button-container" className="paypal-live-button-container" />

        {!blockingError && !isLoadingConfig && !isRenderingButton && !buttonRendered ? (
          <div className="paypal-live-blocking-error" role="alert">
            PayPal LIVE button did not render.
          </div>
        ) : null}

        <section className={resultClassName}>
          <h2>Payment Result</h2>
          <p>{paymentResult.message}</p>
          <dl>
            <dt>Order ID</dt>
            <dd>{paymentResult.orderId || '-'}</dd>
            <dt>Transaction ID</dt>
            <dd>{paymentResult.transactionId || '-'}</dd>
            <dt>Payer Name</dt>
            <dd>{paymentResult.payerName || '-'}</dd>
            <dt>Payer Email</dt>
            <dd>{paymentResult.payerEmail || '-'}</dd>
            <dt>Payer ID</dt>
            <dd>{paymentResult.payerId || '-'}</dd>
            <dt>Payment Status</dt>
            <dd>{paymentResult.paymentStatus || '-'}</dd>
          </dl>
        </section>
      </section>
    </main>
  );
}
