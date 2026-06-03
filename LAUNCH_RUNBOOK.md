# 懂妳上架操作手冊

這份文件是最後上架用。照順序做，不要跳步。

## 1. Supabase

### 1.1 建立資料表與加扣次函式

1. 打開 Supabase 專案。
2. 進入 SQL Editor。
3. 貼上並執行 `supabase/schema.sql` 的全部內容。
4. 確認出現這三張表：
   - `dongni_user_credits`
   - `dongni_payments`
   - `dongni_credit_events`

### 1.2 準備 Supabase 金鑰

到 Supabase Project Settings → API，取得：

- Project URL → `SUPABASE_URL` 與 `VITE_SUPABASE_URL`
- Publishable / anon key → `VITE_SUPABASE_PUBLISHABLE_KEY`
- service_role key → `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel 環境變數，不可以放到前端或公開給使用者。

## 2. PayPal

### 2.1 先用 test mode

先不要用正式金流。先在 PayPal sandbox 測：

- NT$200 方案，付款成功後應增加 1 次。
- NT$1000 方案，付款成功後應增加 6 次。

### 2.2 準備 PayPal 金鑰

到 PayPal Developer Dashboard 建立 App，取得：

- Client ID → `PAYPAL_CLIENT_ID`
- Secret → `PAYPAL_CLIENT_SECRET`

### 2.3 PayPal 付款返回

PayPal 不需要先建立 webhook。付款成功後會回到 `PUBLIC_SITE_URL`，懂妳會呼叫 `api/paypal-capture-order.js` 確認付款並加次數。

## 3. OpenRouter

到 OpenRouter 建立 API key，放到：

- `OPENROUTER_API_KEY`

模型可以先用預設：

- `OPENROUTER_MODEL=anthropic/claude-sonnet-4-5`

## 4. Vercel

### 4.1 匯入專案

1. 將專案推到 GitHub。
2. 到 Vercel 匯入 GitHub repo。
3. Framework 選 Vite，或讓 Vercel 自動偵測。
4. 確認：
   - Build Command: `vite build`
   - Output Directory: `dist`

### 4.2 設定環境變數

到 Vercel Project Settings → Environment Variables，加入：

```bash
OPENROUTER_API_KEY=your-openrouter-key-here
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
ADMIN_PASSWORD=change-this-admin-password
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

設定完重新部署。

## 5. Google 登入

目前前端使用 Supabase Google OAuth。請在 Supabase Authentication → Providers → Google 確認：

- Google provider 已啟用。
- Redirect URL 包含 Vercel 網址。
- Site URL 設為正式 Vercel 網址。

Supabase Authentication → URL Configuration 也要確認：

- Site URL: `https://你的-vercel 網址`
- Redirect URLs: `https://你的-vercel 網址/**`

## 6. 上架測試

照這個順序測：

1. 打開正式 Vercel 網址。
2. 用 Google 登入。
3. 進入懂妳後，確認顯示免費體驗中與 `未使用次數 0 次`。
4. 送出一則訊息前或送出後，確認畫面提醒「30 分鐘內沒有輸入訊息，對話會自動結束」。
5. 免費期內聊天不會扣付費次數。
6. 點 Plus。
7. 買 NT$200。
8. PayPal 付款完成後回到懂妳。
9. 等 2 到 5 秒，確認顯示 `未使用次數 1 次`。
10. 暫時調整資料庫 `trial_ends_at` 到過去，確認免費期結束後才會使用付費次數。
11. 再買 NT$1000。
12. 確認未使用次數增加 6 次。
13. 測試或暫時調整資料庫 `expires_at`，確認閒置超過 30 分鐘後再輸入會開啟新的對話 session。
14. 打開 `https://你的-vercel 網址/admin`。
15. 輸入 `ADMIN_PASSWORD`，確認可看到使用者、付款、對話 session 與次數異動紀錄。

## 7. 切正式金流

Sandbox 全部成功後再切 live：

1. 在 PayPal Developer 切到 Live App。
2. 把 Vercel 的 `PAYPAL_ENV` 改成 `live`。
3. 換成 PayPal live `PAYPAL_CLIENT_ID` 與 `PAYPAL_CLIENT_SECRET`。
4. 重新部署。
5. 用小額正式付款測一次。

## 8. 上架前仍建議補的頁面

這些不是程式必需，但收費產品建議補：

- 隱私權政策
- 服務條款
- 退款政策
- 聯絡方式

如果先小規模邀請使用，可以先把這些放在 Notion 或簡單靜態頁，再慢慢整合回網站。
