# 懂妳 Web

懂妳是一個情緒陪伴聊天網站，包含：

- Google 登入
- 首次使用免責聲明
- 新手引導
- OpenRouter 串流聊天
- PayPal 付款頁
- PayPal 付款成功後自動加次數
- Supabase 次數資料表與扣次紀錄
- 新使用者 3 天免費體驗
- NT$200 / 1 次、NT$1000 / 6 次兩種 Plus 方案
- 專屬管理後台 `/admin`

## 上架前必做

完整步驟請看：

- `LAUNCH_RUNBOOK.md`
- `LAUNCH_TEST_CHECKLIST.md`

1. 到 Supabase SQL Editor 執行 `supabase/schema.sql`。
2. 到 Vercel 設定下方必要環境變數。
3. 到 PayPal Developer 建立 app，取得 Client ID 與 Secret。
4. 把 PayPal sandbox key 填到 Vercel 的 `PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`。
5. 用 PayPal sandbox 測一次 NT$200 與 NT$1000 付款，確認未使用次數分別增加 1 與 6。
6. 新使用者登入後，確認顯示 3 天免費體驗。
7. 開始一次對話前，確認會提醒使用者「30 分鐘內沒有輸入訊息，對話會自動結束」。

## 必要環境變數

部署到 Vercel 時，請設定：

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

`OPENROUTER_MODEL` 可省略，預設會使用 `anthropic/claude-sonnet-4-5`。

`SUPABASE_SERVICE_ROLE_KEY` 與 `ADMIN_PASSWORD` 只放在 Vercel 環境變數，不能放到前端或公開 repo。

## 管理後台

上架後可到 `https://你的-vercel 網址/admin` 進入懂妳專屬管理後台。

後台會要求輸入 `ADMIN_PASSWORD`，通過後可查看：

- 使用者總數、免費體驗中人數、進行中對話數、未使用次數總量
- 今日付款筆數與今日營收
- 累積付款筆數與累積營收
- 使用者列表、付款紀錄、對話 session、次數異動紀錄

## 本機開發

安裝前端與 Vercel API 需要的依賴：

```bash
npm install
npm run dev
```

前端會跑在 Vite 預設網址，聊天與付款 API 部署時由 Vercel 的 `/api/*` 處理。

如果要跑舊的 Express 本機後端：

```bash
cd src/server
npm install
cd ../..
npm run server
```

同時需要設定：

```bash
OPENROUTER_API_KEY=your-openrouter-key-here
PORT=3001
ALLOWED_ORIGIN=http://localhost:5173
```

## PayPal 付款方案

付款方案在 `api/create-checkout-session.js` 的白名單裡：

- `dongni-plus-single`: NT$200，`credits=1`
- `dongni-plus-six-pack`: NT$1000，`credits=6`

前端只送方案 id，實際金額由後端決定，避免使用者竄改金額。

付款成功後，PayPal 會帶使用者回到懂妳，前端會呼叫 `api/paypal-capture-order.js` 確認付款並呼叫 Supabase 的 `grant_dongni_purchase`。同一筆 PayPal order 只會加一次次數。

## 次數扣除規則

- 使用者必須登入。
- 新使用者第一次登入後會自動開啟 3 天免費體驗。
- 免費體驗期間可以使用懂妳，不會扣付費次數。
- 前端會顯示目前免費體驗狀態與未使用次數。
- 免費期結束後，沒有進行中的對話且未使用次數為 0 時，會引導到 Plus 付款頁。
- 每次開始新的對話 session 時，後端呼叫 `start_dongni_conversation_session` 扣 1 次。
- 對話開始前，前端會提醒使用者：30 分鐘內沒有輸入訊息，對話會自動結束。
- 每次使用者輸入訊息後，後端會把 session 延長到「現在起 30 分鐘」。
- 若 30 分鐘內沒有任何訊息輸入，session 會結束；下一次再輸入時會扣新的 1 次。
- 扣次紀錄會寫入 `dongni_credit_events`。

## 部署到 Vercel

1. 將專案推到 GitHub。
2. 在 Vercel 匯入專案。
3. 設定上方必要環境變數。
4. 部署。

Vercel 設定使用 `vercel.json`：

- `buildCommand`: `vite build`
- `outputDirectory`: `dist`
- `/api/*` 交給 Vercel Functions
- 其他路徑回到 `index.html`

## 主要檔案

- `src/App.jsx`: 登入、免責聲明、聊天主畫面
- `src/App.css`: 聊天主畫面樣式
- `src/Onboarding.jsx`: 新手引導
- `src/Pricing.jsx`: 付款頁
- `src/Pricing.css`: 付款頁樣式
- `src/AdminDashboard.jsx`: 懂妳管理後台
- `src/AdminDashboard.css`: 管理後台樣式
- `src/api.js`: 前端聊天 API 呼叫
- `api/chat.js`: Vercel 聊天 API
- `api/admin-dashboard.js`: 管理後台資料 API
- `api/create-checkout-session.js`: PayPal 訂單建立 API
- `api/paypal-capture-order.js`: PayPal 付款確認後加次數
- `api/credits.js`: 查詢目前剩餘次數
- `api/conversation-session.js`: 查詢或開始 30 分鐘閒置制對話 session
- `api/stripe-webhook.js`: 舊 Stripe webhook，改用 PayPal 後不需要設定
- `supabase/schema.sql`: Supabase 資料表與原子加扣次函式
