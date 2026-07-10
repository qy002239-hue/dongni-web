# Production Payment Acceptance Checklist

Date: 2026-07-10
Project: dongni-web

## A. Environment and Deployment
- [ ] `PAYPAL_ENV=live` in Vercel Production only.
- [ ] `ECPAY_ENV=production` in Vercel Production only.
- [ ] `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` are set for Production.
- [ ] `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, `ECPAY_HASH_IV` are production values.
- [ ] `PUBLIC_SITE_URL` is production domain and matches callback origins.
- [ ] `ECPAY_RETURN_URL` and `ECPAY_NOTIFY_URL` start with `PUBLIC_SITE_URL`.
- [ ] `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) exist in Production.

## B. Secret Safety
- [ ] `.env`, `.env.local`, and `.env.*` are not tracked by git.
- [ ] No secret values appear in frontend bundle (`dist/`).
- [ ] No secret values appear in production logs.
- [ ] APIs only return masked credential details where needed.

## C. Payment Integrity
- [ ] Frontend never sends final amount for real plans; backend plan map decides amount.
- [ ] `api/create-checkout-session` only accepts server-defined plan IDs.
- [ ] `api/ecpay` in Production rejects non-plan test order creation.
- [ ] Payment success is granted by backend capture/webhook, not by frontend redirect only.
- [ ] Failed/canceled return flow does not grant credits.

## D. Webhook Security and Idempotency
- [ ] PayPal webhook signature verification must pass (`verify-webhook-signature`).
- [ ] ECPay callback `CheckMacValue` verification must pass.
- [ ] Duplicate webhook/callback deliveries do not duplicate grants.
- [ ] Webhook/callback events are recorded in `dongni_webhook_events`.
- [ ] Payment grants are idempotent via payment ledger checks and RPC path.

## E. End-to-End Scenarios
- [ ] PayPal success path: create -> approve -> capture -> grant exactly once.
- [ ] PayPal cancel path: no grant, user sees cancel message and returns safely.
- [ ] PayPal failure path: no grant, error surfaced.
- [ ] ECPay success notify path: payment persisted and grant exactly once.
- [ ] ECPay return path: redirect to result page with signed status.
- [ ] ECPay failure/cancel path: no grant.
- [ ] Duplicate callbacks/events: no duplicate grant.

## F. Trial and Entitlement
- [ ] 3-day trial can only be granted once per user.
- [ ] Trial start/end timestamps are persisted and validated server-side.
- [ ] Trial expiry correctly switches to paid-credit checks.
- [ ] Failed/canceled payment never changes trial or paid entitlement.

## G. Region and UX
- [ ] Taiwan user is recommended ECPay.
- [ ] Non-Taiwan Traditional Chinese user is recommended PayPal.
- [ ] Payment modal works on desktop and mobile breakpoints.
- [ ] Error and cancel return flows are clear and recoverable.

## H. Database Verification
- [ ] `dongni_payments` rows are inserted/updated with correct provider and status.
- [ ] `dongni_credit_events` has exactly one purchase event per completed order.
- [ ] `dongni_user_credits` reflects expected plan credits and remaining balance.
- [ ] `dongni_webhook_events` records received/ignored/processed/failed events.

## I. Operational Validation
- [ ] `vercel inspect` shows latest Production deployment as Ready.
- [ ] `api/payment-options` reflects provider availability and reasons.
- [ ] Callback/webhook URLs are reachable from payment providers.
- [ ] Rollback steps and owner runbook are available.
