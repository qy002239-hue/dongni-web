# 懂妳上架測試清單

## 部署前

- [ ] 已在 Supabase SQL Editor 執行 `supabase/schema.sql`
- [ ] Supabase Google 登入已啟用
- [ ] Supabase Site URL 已設成 Vercel 網址
- [ ] Supabase Redirect URLs 已包含 Vercel 網址
- [ ] Vercel 已設定 `OPENROUTER_API_KEY`
- [ ] Vercel 已設定 `PAYPAL_ENV`
- [ ] Vercel 已設定 `PAYPAL_CLIENT_ID`
- [ ] Vercel 已設定 `PAYPAL_CLIENT_SECRET`
- [ ] Vercel 已設定 `SUPABASE_URL`
- [ ] Vercel 已設定 `SUPABASE_SECRET_KEY`（或舊版 `SUPABASE_SERVICE_ROLE_KEY`）
- [ ] Vercel 已設定 `ADMIN_PASSWORD`
- [ ] Vercel 已設定 `VITE_SUPABASE_URL`
- [ ] Vercel 已設定 `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] PayPal sandbox app 已建立

## NT$200 測試

- [ ] 使用者可 Google 登入
- [ ] 新使用者顯示免費體驗中
- [ ] 初始未使用次數顯示為 0
- [ ] 免費期內可聊天，不扣付費次數
- [ ] 點 Plus 後可開啟 PayPal Checkout
- [ ] NT$200 付款成功後回到懂妳
- [ ] Supabase `dongni_payments` 出現一筆付款紀錄
- [ ] Supabase `dongni_credit_events` 出現 `purchase +1`
- [ ] 前端未使用次數顯示為 1
- [ ] 送出訊息前或送出後會提醒：30 分鐘內沒有輸入訊息，對話會自動結束
- [ ] 畫面不顯示倒數時間
- [ ] Supabase `dongni_credit_events` 出現 `conversation_start -1`
- [ ] Supabase `dongni_conversation_sessions` 出現一筆 session
- [ ] 回覆完成後未使用次數顯示為 0
- [ ] 30 分鐘內可繼續送訊息，不再重複扣次
- [ ] 每次送出訊息後，`expires_at` 會延長到現在起 30 分鐘
- [ ] 閒置超過 30 分鐘後再送訊息，會扣新的 1 次
- [ ] 將 `trial_ends_at` 調到過去後，沒有付費次數時會導向 Plus

## NT$1000 測試

- [ ] 點 Plus 後可選 NT$1000 / 6 次
- [ ] NT$1000 付款成功後回到懂妳
- [ ] Supabase `dongni_payments` 出現一筆 `dongni-plus-six-pack`
- [ ] Supabase `dongni_credit_events` 出現 `purchase +6`
- [ ] 前端未使用次數顯示為 6
- [ ] 送出一次訊息後未使用次數顯示為 5，並提醒 30 分鐘閒置規則

## 重複付款確認測試

- [ ] 重新整理 PayPal 成功返回頁
- [ ] Supabase `dongni_payments` 沒有重複新增同一筆 order
- [ ] 未使用次數沒有被重複加

## 失敗情境

- [ ] 未登入時不能付款
- [ ] 未登入時不能聊天
- [ ] 沒有進行中的對話且 0 次時不能聊天，會導向 Plus
- [ ] OpenRouter key 錯誤時前端顯示錯誤訊息
- [ ] PayPal client secret 錯誤時付款建立失敗並顯示錯誤

## 管理後台測試

- [ ] `/admin` 會顯示懂妳管理後台登入畫面
- [ ] 密碼錯誤時不能看到資料
- [ ] 輸入 `ADMIN_PASSWORD` 後可看到統計數字
- [ ] 可看到使用者、付款紀錄、對話 session、次數異動紀錄
