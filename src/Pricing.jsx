import React from 'react';
import './Pricing.css';

function Pricing({ onBack }) {
  const handlePayment = () => {
    console.log("start one-time payment");
    // TODO: 集成 Stripe Checkout API
    // 当前仅输出日志，未来可接入真实支付系统
  };

  return (
    <div className="pricing-container">
      <div className="pricing-content">
        {/* 返回按钮 */}
        <div className="pricing-header">
          <button
            onClick={onBack}
            className="pricing-back-btn"
          >
            ← 返回
          </button>
          <div className="pricing-title">【懂 妳 Plus】</div>
          <div style={{ width: "60px" }}></div>
        </div>

        {/* 主要内容 */}
        <div className="pricing-main">
          {/* 描述文案 */}
          <div className="pricing-description">
            <p className="pricing-text-primary">
              有些話，不一定適合說給身邊的人聽。
            </p>
            <p className="pricing-text-primary">
              但妳不需要一直一個人吞下去。
            </p>

            <p className="pricing-text-secondary">
              懂妳會在這裡，聽妳說完。
              <br />
              不催妳、不評判妳、不把妳推去變得更好。
            </p>

            <p className="pricing-text-secondary">
              只是先陪妳，把今晚撐過去。
            </p>
          </div>

          {/* 價格卡片 */}
          <div className="pricing-card">
            <div className="pricing-plan-name">懂妳 Plus</div>
            <div className="pricing-price">
              <span className="currency">NT$</span>
              <span className="amount">200</span>
              <span className="period">/ 次</span>
            </div>
            <div className="pricing-type">單次付款，不會自動續費。</div>

            {/* 支付按钮 */}
            <button
              onClick={handlePayment}
              className="pricing-payment-btn"
            >
              以 NT$200 開啟懂妳 Plus
            </button>

            {/* 底部声明 */}
            <p className="pricing-disclaimer">
              這是單次付款，不是訂閱，不會自動續費。懂妳不是醫療、心理治療或緊急救援服務；如果妳正處於立即危險，請立刻聯絡當地緊急資源。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Pricing;
