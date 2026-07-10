# 懂妳 Web

懂妳是一個情緒陪伴聊天網站，使用 React + Vite 前端與 Vercel Functions 後端，整合 Google OAuth、OpenRouter、Supabase、ECPay 與 PayPal。

## 目前產品範圍

- Google OAuth 登入
- 首次使用免責聲明
- 串流聊天（OpenRouter）
- 對話 session 與 30 分鐘閒置機制
- 3 天免費試用
- Plus 付費方案：NT$200（1 次）、NT$1000（6 次）
- 雙金流：ECPay / PayPal
- 付款成功後原子化加值與 webhook 去重

## 主要路由

- `/chat`
- `/auth/callback`
- `/payment/result`
- `/test-login`（僅本機/非 production）
- `/test/ecpay`（production 會導回 `/chat`）
- `/test/paypal-live`（production 會導回 `/chat`）

## 必要環境變數

部署到 Vercel 時請至少設定：

```bash
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5

GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URL=https://your-domain/api/auth/google/callback

APP_URL=https://your-domain
PUBLIC_SITE_URL=https://your-domain

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key

ECPAY_ENV=production
ECPAY_MERCHANT_ID=your-merchant-id
ECPAY_HASH_KEY=your-hash-key
ECPAY_HASH_IV=your-hash-iv
ECPAY_RETURN_URL=https://your-domain/api/ecpay?action=return
ECPAY_NOTIFY_URL=https://your-domain/api/ecpay?action=notify

PAYPAL_ENV=live
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_WEBHOOK_ID=your-paypal-webhook-id
```

說明：

- `SUPABASE_SECRET_KEY` 只可放後端環境，不可進前端。
- `OPENROUTER_MODEL` 可省略，會使用預設模型。
- production 會封鎖 debug/test API（回傳 404）。

## 本機開發

```bash
npm install
npm run dev
```

Windows PowerShell 若遇到 `npm` 執行策略問題，請改用：

```bash
npm.cmd run dev
```

## 驗證指令

```bash
npm run lint
npm run build
npm run smoke
```

若需聊天品質回歸測試：

```bash
npm run conversation:test
```

## 部署

1. Push 到 GitHub。
2. 由 Vercel 連動部署。
3. 確認環境變數為 production 值。
4. 驗證 production deployment 為 `Ready` 且 alias 指向最新 commit。

## 關鍵檔案

- `src/main.tsx`：前端入口
- `src/App.tsx`：主流程、聊天 UI、支付入口
- `src/services/chat.ts`：聊天 API 呼叫
- `api/chat.js`：聊天 API
- `api/conversation-session.js`：對話 session 與扣次入口
- `api/payment-options.js`：付款提供商可用性判定
- `api/ecpay.js`：ECPay 建單/回調/return
- `api/create-checkout-session.js`：PayPal 建單
- `api/paypal-capture-order.js`：PayPal capture
- `api/paypal-webhook.js`：PayPal webhook
- `api/_webhook-events.js`：webhook 事件去重與狀態保存
- `supabase/migrations/20260707_01_memory.sql`：memory 結構
- `supabase/migrations/20260710_01_payment_webhook_events.sql`：webhook 事件表

## 相關文件

- `LAUNCH_RUNBOOK.md`
- `LAUNCH_TEST_CHECKLIST.md`
- `PRODUCTION_PAYMENT_ACCEPTANCE_CHECKLIST.md`
- `PAYPAL_PRODUCTION_CHECKLIST.md`
- `PAYPAL_ROLLBACK_GUIDE.md`
