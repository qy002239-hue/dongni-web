# Go-Live Checklist

Date: 2026-07-10  
Project: dongni-web  
Target: Production (`https://dongni-web.vercel.app`)

Owner platform precondition:
- ECPay production merchant and keys must be correctly configured.
- PayPal live app credentials and webhook must be correctly configured.

Execution rule after owner setup is done:
- Run all checklist items end-to-end in one pass and publish only final acceptance results.

## 1. 功能驗收

### 1.1 帳號與對話
- [ ] 登入成功，取得有效 session/token。
- [ ] 聊天可正常送出與回覆，無前端/後端錯誤。
- [ ] 記憶寫入與讀取正常（`dongni_user_memory` / `dongni_memory_events`）。
- [ ] 登出後 token 失效，再登入可恢復正常流程。

### 1.2 試用與權限
- [ ] 免費試用首次啟用成功（3 天）。
- [ ] 免費試用不可重複領取。
- [ ] 試用開始/到期時間寫入正確，時區與到期邏輯正確。
- [ ] 到期後權限切換正確，不會誤判為仍可免費使用。

### 1.3 付款與方案
- [ ] 購買一次（NT$200 / 1 次）完整成功，權限/次數正確更新。
- [ ] 購買六次（NT$1000 / 6 次）完整成功，權限/次數正確更新。
- [ ] ECPay 流程可進入付款頁並完成後端入帳。
- [ ] PayPal 流程可進入付款頁並完成 capture/webhook 入帳。
- [ ] 付款後權限更新正確，重新登入後狀態一致。

## 2. 安全驗收

### 2.1 API 權限
- [ ] 未登入不可呼叫建立訂單與確認付款 API。
- [ ] 已登入只能操作自己的訂單，不可越權。
- [ ] 金額與方案僅由後端決定，前端不可竄改最終計費。

### 2.2 Secret 與環境變數
- [ ] Secret 不在前端 bundle、repo、公開 log 中曝光。
- [ ] `.env*` 未被 Git 追蹤（僅保留 example 檔）。
- [ ] Production Environment Variables 名稱/值/環境範圍正確。
- [ ] `PAYPAL_ENV=live`、`ECPAY_ENV=production` 且與實際憑證一致。

### 2.3 Webhook 與冪等
- [ ] PayPal webhook 驗簽成功（`verify-webhook-signature`）。
- [ ] ECPay callback `CheckMacValue` 驗簽成功。
- [ ] 重複付款防護有效（同一 order 不重複入帳）。
- [ ] 重複 webhook 防護有效（同一事件不重複加值）。
- [ ] `dongni_webhook_events` 事件落庫與狀態更新正確。

## 3. 部署驗收

### 3.1 Production 狀態
- [ ] Vercel Production deployment `Ready`。
- [ ] Alias 指向最新 commit，版本一致。

### 3.2 Build 與 Runtime
- [ ] `npm run lint` 通過。
- [ ] `npm run build` 通過。
- [ ] Runtime health 檢查正常（主要 API 無異常崩潰）。

### 3.3 Logs
- [ ] Vercel Function logs 無未處理例外。
- [ ] 支付相關錯誤可追溯且不含敏感資訊。
- [ ] 回調與 webhook 事件可在 logs 與 DB 對照。

## 4. 金流驗收

### 4.1 ECPay / PayPal 共同情境
- [ ] 成功：完成付款後只入帳一次，權限正確更新。
- [ ] 失敗：不入帳，不開通權限，提示正確。
- [ ] 取消：不入帳，不開通權限，返回流程正確。
- [ ] 重複付款：不發生重複加值。
- [ ] 回調：callback/webhook 驗簽與重送處理正常。
- [ ] 後端入帳：`dongni_payments` / `dongni_credit_events` / `dongni_user_credits` 狀態一致。

### 4.2 資料庫核對
- [ ] `dongni_payments` provider/status/order/capture/amount 正確。
- [ ] `dongni_credit_events` 每筆成功付款僅 1 筆 purchase event。
- [ ] `dongni_user_credits` 剩餘次數與方案一致。
- [ ] `dongni_webhook_events` 包含 `received`/`processed`/`duplicate`/`failed` 等狀態。

## 最終判定
- [ ] 全部項目通過：`Go`
- [ ] 任一關鍵項目失敗：`No-Go`
