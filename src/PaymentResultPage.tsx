import { useMemo } from 'react';
import './EcpayTestPage.css';

type PaymentResult = {
  status: string;
  merchantTradeNo: string;
  tradeNo: string;
  paymentType: string;
  amount: string;
  tradeDate: string;
  rtnCode: string;
  rtnMsg: string;
  checksum: string;
  merchantTradeNoCheck: string;
  callbackSource: string;
};

function getResultTitle(status: string): string {
  if (status === 'success') return '付款成功';
  if (status === 'failed') return '付款失敗';
  if (status === 'checksum-error') return '檢查碼驗證失敗';
  if (status === 'merchant-trade-no-error') return '商店訂單編號驗證失敗';
  return status ? `付款狀態：${status}` : '尚無付款結果';
}

function readResult(search: string): PaymentResult {
  const params = new URLSearchParams(search);
  return {
    status: String(params.get('status') || '').trim(),
    merchantTradeNo: String(params.get('merchantTradeNo') || '').trim(),
    tradeNo: String(params.get('tradeNo') || '').trim(),
    paymentType: String(params.get('paymentType') || '').trim(),
    amount: String(params.get('amount') || '').trim(),
    tradeDate: String(params.get('tradeDate') || '').trim(),
    rtnCode: String(params.get('rtnCode') || '').trim(),
    rtnMsg: String(params.get('rtnMsg') || '').trim(),
    checksum: String(params.get('checksum') || '').trim(),
    merchantTradeNoCheck: String(params.get('merchantTradeNoCheck') || '').trim(),
    callbackSource: String(params.get('callbackSource') || '').trim()
  };
}

export default function PaymentResultPage() {
  const result = useMemo(() => readResult(window.location.search), []);
  const title = getResultTitle(result.status);

  return (
    <main className="ecpay-page">
      <section className="ecpay-panel">
        <h1>Payment Result</h1>
        <section className={`ecpay-result ecpay-result-${result.status || 'pending'}`}>
          <h2>{title}</h2>
          <dl>
            <dt>Payment Status</dt>
            <dd>{result.status || '-'}</dd>
            <dt>MerchantTradeNo</dt>
            <dd>{result.merchantTradeNo || '-'}</dd>
            <dt>TradeNo</dt>
            <dd>{result.tradeNo || '-'}</dd>
            <dt>PaymentType</dt>
            <dd>{result.paymentType || '-'}</dd>
            <dt>Amount</dt>
            <dd>{result.amount || '-'}</dd>
            <dt>TradeDate</dt>
            <dd>{result.tradeDate || '-'}</dd>
            <dt>RtnCode</dt>
            <dd>{result.rtnCode || '-'}</dd>
            <dt>RtnMsg</dt>
            <dd>{result.rtnMsg || '-'}</dd>
            <dt>CheckMacValue</dt>
            <dd>{result.checksum || '-'}</dd>
            <dt>MerchantTradeNo Check</dt>
            <dd>{result.merchantTradeNoCheck || '-'}</dd>
            <dt>Callback Source</dt>
            <dd>{result.callbackSource || '-'}</dd>
          </dl>
        </section>
      </section>
    </main>
  );
}
