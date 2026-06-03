import React, { useState } from 'react';
import './Pricing.css';

const plans = [
  {
    id: 'dongni-plus-single',
    name: 'Dongni Plus',
    amount: '200',
    period: '/ 1 credit',
    type: 'One conversation credit',
    button: 'Pay NT$200 with PayPal'
  },
  {
    id: 'dongni-plus-six-pack',
    name: 'Dongni Plus Six Pack',
    amount: '1000',
    period: '/ 6 credits',
    type: 'Six credits, about NT$167 each',
    button: 'Pay NT$1000 with PayPal',
    highlight: 'Best value'
  }
];

function Pricing({ onBack, accessToken }) {
  const [payingPlan, setPayingPlan] = useState('');
  const [error, setError] = useState('');

  const handlePayment = async (planId) => {
    if (payingPlan) return;

    if (!accessToken) {
      setError('Please sign in with Google before starting PayPal checkout.');
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

      window.location.href = data.url;
    } catch (err) {
      setError(err.message || 'Unable to create PayPal checkout. Please try again later.');
      setPayingPlan('');
    }
  };

  return (
    <div className="pricing-container">
      <div className="pricing-content">
        <div className="pricing-header">
          <button onClick={onBack} className="pricing-back-btn" type="button">
            Back
          </button>
          <div className="pricing-title">Dongni Plus</div>
          <div style={{ width: '60px' }} />
        </div>

        <div className="pricing-main">
          <div className="pricing-description">
            <p className="pricing-text-primary">
              Choose the amount of Dongni Plus credits you want to add.
            </p>
            <p className="pricing-text-secondary">
              New users still get 3 free trial days. Paid credits are used after the trial ends.
            </p>
            <p className="pricing-text-secondary">
              Each paid credit starts one conversation session. If there is no message for 30 minutes, that session ends.
            </p>
            {error ? (
              <p className="pricing-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="pricing-plans">
            {plans.map((plan) => (
              <div className="pricing-card" key={plan.id}>
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
                  {payingPlan === plan.id ? 'Opening PayPal...' : plan.button}
                </button>
              </div>
            ))}
          </div>

          <p className="pricing-disclaimer">
            Payments are processed by PayPal. Credits are added after PayPal confirms the payment.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Pricing;
