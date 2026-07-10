# Payment Environment Checklist

This file is the preflight matrix before final go-live payment verification.

| Variable | Scope | Purpose | Current status | Agent auto-write to Vercel | User one-time input needed |
|---|---|---|---|---|---|
| PUBLIC_SITE_URL | Production | Canonical public domain for redirects/callbacks | Exists | Yes | No |
| ECPAY_ENV | Production | Switch ECPay to production endpoint | Exists | Yes (enforce `production`) | No |
| ECPAY_MERCHANT_ID | Production | ECPay merchant identifier | Exists but currently test-id in prod | No | Yes (if merchant changes) |
| ECPAY_HASH_KEY | Production | ECPay signature key | Exists | No | Yes (if merchant changes) |
| ECPAY_HASH_IV | Production | ECPay signature IV | Exists | No | Yes (if merchant changes) |
| ECPAY_RETURN_URL | Production | Browser return callback URL | Exists | Yes (verify) | No |
| ECPAY_NOTIFY_URL | Production | Server notify callback URL | Exists | Yes (verify) | No |
| PAYPAL_ENV | Production | PayPal endpoint mode | Exists | Yes (enforce `live`) | No |
| PAYPAL_CLIENT_ID | Production | PayPal live app client id | Key exists | Yes | Yes |
| PAYPAL_CLIENT_SECRET | Production | PayPal live app secret | Key exists | Yes | Yes |
| PAYPAL_WEBHOOK_ID | Production | PayPal live webhook id | Key exists | Yes | Yes |
| SUPABASE_URL | Production | Backend DB/service endpoint | Exists | No | No |
| SUPABASE_SERVICE_ROLE_KEY | Production | Backend admin key | Exists | No | No |
| VITE_SUPABASE_URL | Production | Frontend Supabase URL | Exists | No | No |
| VITE_SUPABASE_PUBLISHABLE_KEY | Production | Frontend publishable key | Exists | No | No |

## Agent-owned execution after user sends 3 PayPal values

Inputs required from user only once:
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET
- PAYPAL_WEBHOOK_ID

Then agent executes all remaining work:
1. Update production env vars in Vercel.
2. Redeploy production.
3. Run production payment endpoint checks.
4. Run full payment flow verification (success/fail/cancel/duplicate paths where executable).
5. Fix code or config issues found.
6. Return final Go / No-Go.

## One-command apply (agent execution)

`node scripts/apply-paypal-live.mjs --client-id <PAYPAL_CLIENT_ID> --client-secret <PAYPAL_CLIENT_SECRET> --webhook-id <PAYPAL_WEBHOOK_ID>`
