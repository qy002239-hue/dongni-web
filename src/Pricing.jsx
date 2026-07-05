import { useState } from 'react';
import './Pricing.css';

const plans = [
  {
    id: 'dongni-plus-single',
    name: 'Dongni Plus',
    amount: '200',
    period: '/ 1 次',
    type: '一段 30 分鐘內可延續的對話',
    button: '使用 PayPal 付款 NT$200'
  },
  {
    id: 'dongni-plus-six-pack',
    name: 'Dongni Plus 六次包',
    amount: '1000',
    period: '/ 6 次',
    type: '六段對話，平均每次約 NT$167',
    button: '使用 PayPal 付款 NT$1000',
    highlight: '較划算'
  }
];

function Pricing({ onBack, onLogin, accessToken, canLogin = true }) {
  const [payingPlan, setPayingPlan] = useState('');
  const [error, setError] = useState('');

  const handlePayment = async (planId) => {
    if (payingPlan) return;

    if (!accessToken) {
      setError('請先使用 Google 登入，再開始 PayPal 付款。');
      return;
    }

    if (accessToken === 'local-e2e-token' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      window.location.assign(`/?e2e=1&payment=paypal-success&token=local-${planId}`);
      return;
    }

    setPayingPlan(planId);
    setError('');

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          plan: planId
        })
      });

      const responseText = await response.text();
      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { error: responseText || 'PayPal checkout did not return a valid response.' };
      }

      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Unable to create PayPal checkout.');
      }

      window.location.assign(data.url);
    } catch (err) {
      setError(err.message || 'Unable to create PayPal checkout. Please try again later.');
      setPayingPlan('');
    }
  };

  return (
    <main className="pricing-container">
      <div className="pricing-content">
        <div className="pricing-header">
          <button onClick={onBack} className="pricing-back-btn" type="button">
            返回
          </button>
          <div className="pricing-title">Dongni Plus</div>
          <div style={{ width: '60px' }} />
        </div>

        <div className="pricing-main">
          <section className="pricing-description">
            <p className="pricing-text-primary">
              選擇妳想加值的懂妳 Plus 次數。
            </p>
            <p className="pricing-text-secondary">
              新使用者仍享有 3 天免費體驗。付費次數會在免費期結束後使用。
            </p>
            <p className="pricing-text-secondary">
              每 1 次 Plus 可開始一段對話；若 30 分鐘沒有新訊息，該段對話會自動結束。
            </p>
            {!accessToken ? (
              <>
                <button
                  className="pricing-login-btn"
                  type="button"
                  onClick={onLogin}
                  disabled={!canLogin}
                >
                  {canLogin ? '使用 Google 登入後付款' : 'Google 登入尚未啟用'}
                </button>
                {!canLogin ? (
                  <p className="pricing-error" role="alert">
                    本機尚未設定 Supabase OAuth 環境變數，暫時無法登入付款。
                  </p>
                ) : null}
              </>
            ) : null}
            {error ? (
              <p className="pricing-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>

          <section className="pricing-plans" aria-label="Plus 付款方案">
            {plans.map((plan) => (
              <article className="pricing-card" key={plan.id}>
                {plan.highlight ? (
                  <div className="pricing-badge">{plan.highlight}</div>
                ) : null}
                <div className="pricing-plan-name">{plan.name}</div>
                <div className="pricing-price">
                  <span className="currency">NT$</span>
                  <span className="amount">{plan.amount}</span>
                  <span className="period">{plan.period}</span>
                </div>
                <div className="pricing-type">{plan.type}</div>

                <button
                  onClick={() => handlePayment(plan.id)}
                  className="pricing-payment-btn"
                  type="button"
                  disabled={Boolean(payingPlan)}
                >
                  {payingPlan === plan.id ? '正在開啟 PayPal...' : plan.button}
                </button>
              </article>
            ))}
          </section>

          <p className="pricing-disclaimer">
            付款由 PayPal 處理。PayPal 確認付款後，懂妳會自動把 Plus 次數加回妳的帳號。
          </p>
        </div>
      </div>
    </main>
  );
}

export default Pricing;
