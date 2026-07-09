import { useEffect, useMemo, useState } from 'react';
import './EcpayTestPage.css';

type EcpayConfig = {
  env: 'test' | 'production';
  merchantIdMasked: string;
  hasMerchantId: boolean;
  hasHashKey: boolean;
  hasHashIv: boolean;
  productName: string;
  amount: number;
  paymentMethod: string;
  actionUrl: string;
};

type CreateOrderResponse = {
  ok: boolean;
  actionUrl: string;
  method: 'POST';
  merchantTradeNo: string;
  fields: Record<string, string>;
};

function parseApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim()) return value.trim();
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

function getStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function getResultSummary(search: string) {
  const params = new URLSearchParams(search);
  const status = String(params.get('status') || '').trim();
  if (!status) {
    return { status: 'idle', title: '尚未開始 ECPay 測試付款。' };
  }

  if (status === 'success') {
    return { status: 'success', title: 'ECPay 付款成功。' };
  }

  if (status === 'failed') {
    return { status: 'failed', title: 'ECPay 回傳付款失敗。' };
  }

  if (status === 'checksum-error') {
    return { status: 'failed', title: 'ECPay 回傳檢查碼驗證失敗。' };
  }

  if (status === 'pending' || status === 'back') {
    return { status: 'pending', title: 'ECPay 付款流程已建立，等待付款完成。' };
  }

  return { status: 'pending', title: `ECPay 狀態：${status}` };
}

export default function EcpayTestPage() {
  const [config, setConfig] = useState<EcpayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resultSummary = useMemo(() => getResultSummary(window.location.search), []);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/ecpay?action=config');
        const payload = asRecord(await readJsonResponse(response));
        if (!response.ok) {
          throw new Error(parseApiError(payload, 'Failed to load ECPay test configuration.'));
        }

        const nextConfig: EcpayConfig = {
          env: getStringField(payload, 'env') === 'production' ? 'production' : 'test',
          merchantIdMasked: getStringField(payload, 'merchantIdMasked'),
          hasMerchantId: Boolean(payload.hasMerchantId),
          hasHashKey: Boolean(payload.hasHashKey),
          hasHashIv: Boolean(payload.hasHashIv),
          productName: getStringField(payload, 'productName'),
          amount: Number(payload.amount || 0),
          paymentMethod: getStringField(payload, 'paymentMethod'),
          actionUrl: getStringField(payload, 'actionUrl')
        };

        if (!cancelled) {
          setConfig(nextConfig);
          console.log('[ECPay Test] config loaded', nextConfig);
        }
      } catch (nextError) {
        const message = nextError instanceof Error && nextError.message
          ? nextError.message
          : 'Failed to load ECPay test configuration.';
        console.error('[ECPay Test] config error', nextError);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const startPayment = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/ecpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-order', amount: 1, productName: '懂妳 ECPay 測試付款', tradeDesc: 'Dongni ECPay payment test' })
      });
      const payload = asRecord(await readJsonResponse(response));
      if (!response.ok) {
        throw new Error(parseApiError(payload, 'Failed to create ECPay order.'));
      }

      const order = payload as unknown as CreateOrderResponse;
      console.log('[ECPay Test] create order success', order);
      window.localStorage.setItem('dongni.ecpay.pendingTrade', order.merchantTradeNo);

      const form = document.createElement('form');
      form.method = order.method || 'POST';
      form.action = order.actionUrl;
      form.style.display = 'none';

      Object.entries(order.fields || {}).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (nextError) {
      const message = nextError instanceof Error && nextError.message
        ? nextError.message
        : 'Failed to create ECPay order.';
      console.error('[ECPay Test] create order error', nextError);
      setError(message);
      setSubmitting(false);
    }
  };

  const statusClassName = `ecpay-result ecpay-result-${resultSummary.status}`;

  return (
    <main className="ecpay-page">
      <section className="ecpay-panel">
        <h1>ECPay Payment Test</h1>
        <div className="ecpay-grid">
          <div className="ecpay-card"><span>Environment</span><strong>{config?.env || '-'}</strong></div>
          <div className="ecpay-card"><span>Product</span><strong>{config?.productName || '-'}</strong></div>
          <div className="ecpay-card"><span>Amount</span><strong>{config ? `${config.amount} TWD` : '-'}</strong></div>
          <div className="ecpay-card"><span>Payment method</span><strong>{config?.paymentMethod || '-'}</strong></div>
          <div className="ecpay-card"><span>Merchant ID</span><strong>{config?.merchantIdMasked || '-'}</strong></div>
          <div className="ecpay-card"><span>Action URL</span><strong>{config?.actionUrl || '-'}</strong></div>
        </div>

        {loading ? <p>Loading ECPay test configuration...</p> : null}
        {error ? <div className="ecpay-error" role="alert">{error}</div> : null}

        <button
          type="button"
          className="ecpay-submit"
          onClick={() => void startPayment()}
          disabled={loading || submitting || Boolean(error) || !config}
        >
          {submitting ? 'Redirecting to ECPay...' : 'Start ECPay Test Payment'}
        </button>

        <section className={statusClassName}>
          <h2>{resultSummary.title}</h2>
          <dl>
            <dt>MerchantTradeNo</dt>
            <dd>{params.get('merchantTradeNo') || window.localStorage.getItem('dongni.ecpay.pendingTrade') || '-'}</dd>
            <dt>TradeNo</dt>
            <dd>{params.get('tradeNo') || '-'}</dd>
            <dt>RtnCode</dt>
            <dd>{params.get('rtnCode') || '-'}</dd>
            <dt>RtnMsg</dt>
            <dd>{params.get('rtnMsg') || '-'}</dd>
            <dt>PaymentType</dt>
            <dd>{params.get('paymentType') || config?.paymentMethod || '-'}</dd>
            <dt>Amount</dt>
            <dd>{params.get('amount') || (config ? String(config.amount) : '-')}</dd>
            <dt>Checksum</dt>
            <dd>{params.get('checksum') || '-'}</dd>
          </dl>
        </section>
      </section>
    </main>
  );
}
