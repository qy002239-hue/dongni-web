# 懂妳上線操作手冊

本文件是 production 上線收尾版本。以「環境正確、部署成功、可觀測、可回滾」為目標。

## 1. Supabase

### 1.1 套用 migration

1. 在 Supabase SQL Editor 依序確認 migration 已套用。
2. 目前關鍵結構：
   - `dongni_user_credits`
   - `dongni_payments`
   - `dongni_credit_events`
   - `dongni_webhook_events`
3. migration 檔案來源：
   - `supabase/migrations/20260707_01_memory.sql`
   - `supabase/migrations/20260710_01_payment_webhook_events.sql`

### 1.2 金鑰

在 Supabase Project Settings -> API 取得：

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`（或舊名 `SUPABASE_SERVICE_ROLE_KEY`）
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## 2. 金流設定

### 2.1 ECPay

- `ECPAY_ENV=production`
- `ECPAY_MERCHANT_ID`
- `ECPAY_HASH_KEY`
- `ECPAY_HASH_IV`
- `ECPAY_RETURN_URL=https://<domain>/api/ecpay?action=return`
- `ECPAY_NOTIFY_URL=https://<domain>/api/ecpay?action=notify`

### 2.2 PayPal

- `PAYPAL_ENV=live`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`

Webhook 建議至少訂閱：

- `CHECKOUT.ORDER.COMPLETED`
- `PAYMENT.CAPTURE.COMPLETED`

## 3. Vercel

1. 確認專案已連到 GitHub。
2. 環境變數已填入 Production scope。
3. 觸發 production deploy。
4. 確認 deployment 狀態為 `Ready`。
5. 確認 alias 指向最新 commit。

## 4. 驗證流程

### 4.1 CI 級基本檢查

```bash
npm run lint
npm run build
```

### 4.2 產品流程檢查

1. 使用者可登入並進入 `/chat`。
2. 聊天可送出並收到回覆。
3. 免費試用與 session 邏輯正常。
4. 可打開 Plus 付款 modal，若供應商不可用會顯示可理解原因。
5. 付款成功後可看到次數更新。
6. 重複 callback / webhook 不會重複入帳。

### 4.3 安全檢查

1. debug/test API 在 production 為 404：
   - `/api/prompt-debug`
   - `/api/debug/runtime-env`
   - `/api/paypal-live-test`
2. 前端 production 不可直接進入測試頁（會導回 `/chat`）。
3. logs 不應輸出完整 secret。

## 5. 觀測與故障排查

- 優先看 Vercel Function logs。
- 支付問題先比對：
  - API 回應
  - `dongni_payments`
  - `dongni_credit_events`
  - `dongni_webhook_events`
- 以 root cause 訊息判讀，不只看 HTTP status。

## 6. 回滾策略

1. 若 deployment 異常，先將 alias 回指上一版穩定部署。
2. 保留事件資料，不手動刪除 `dongni_webhook_events`。
3. 回滾後再次執行最小 smoke：登入、聊天、付款建立流程。

## 7. 上線後維護

- 只允許 bugfix 類變更直接進 production。
- 每次金流修正都要附：
  - 觸發條件
  - logs 證據
  - DB 對帳結果
- 新增 feature 前先更新本文件與 checklist，避免文件漂移。
