# Payment Environment Checklist

Production preflight matrix for payment runtime. Keep this file value-agnostic (names/purposes only).

| Variable | Scope | Purpose | Required |
|---|---|---|---|
| PUBLIC_SITE_URL | Production | Canonical public domain for redirects/callbacks | Yes |
| APP_URL | Production | Fallback public app domain used by backend | Recommended |
| ECPAY_ENV | Production | ECPay endpoint mode (`production`) | Yes |
| ECPAY_MERCHANT_ID | Production | ECPay merchant identifier | Yes |
| ECPAY_HASH_KEY | Production | ECPay signature key | Yes |
| ECPAY_HASH_IV | Production | ECPay signature IV | Yes |
| ECPAY_RETURN_URL | Production | Browser return callback URL | Yes |
| ECPAY_NOTIFY_URL | Production | Server notify callback URL | Yes |
| PAYPAL_ENV | Production | PayPal endpoint mode (`live`) | Yes |
| PAYPAL_CLIENT_ID | Production | PayPal live app client id | Yes |
| PAYPAL_CLIENT_SECRET | Production | PayPal live app secret | Yes |
| PAYPAL_WEBHOOK_ID | Production | PayPal live webhook id | Yes |
| SUPABASE_URL | Production | Backend DB/service endpoint | Yes |
| SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY | Production | Backend admin key | Yes |
| VITE_SUPABASE_URL | Production | Frontend Supabase URL | Yes |
| VITE_SUPABASE_PUBLISHABLE_KEY | Production | Frontend publishable key | Yes |

## Quick verification sequence

1. Verify env names exist in Vercel Production scope.
2. Deploy latest commit to production.
3. Check payment options API can return provider availability.
4. Execute one ECPay and one PayPal real flow verification.
5. Verify DB consistency in `dongni_payments`, `dongni_credit_events`, `dongni_webhook_events`.
6. Verify duplicate callback/webhook does not duplicate grant.

## Notes

- Do not store or print secret values in repository docs.
- Presence in `vercel env ls` does not guarantee usable secret values; always validate by runtime behavior/log evidence.
