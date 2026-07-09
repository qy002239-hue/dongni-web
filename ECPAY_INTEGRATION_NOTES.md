# ECPay Integration Notes

- Flow uses ECPay All-in-One payment format and front-end form POST redirect.
- Current implementation supports `Credit` as the default payment method.
- `ReturnURL` is handled by `/api/ecpay?action=notify` for server-side notifications and must respond with `1|OK` after checksum verification.
- `OrderResultURL` is handled by `/api/ecpay?action=return` and redirects the browser back to `/test/ecpay` with result parameters.
- Payment persistence is best-effort only. If `dongni_payments` is missing or its schema is incompatible with generic fields (`order_id`, `status`, `amount_total`, `currency`), the ECPay flow still works but DB persistence is skipped safely.
- Required env vars:
  - `ECPAY_ENV=test`
  - `ECPAY_MERCHANT_ID`
  - `ECPAY_HASH_KEY`
  - `ECPAY_HASH_IV`
  - `ECPAY_RETURN_URL` (`/api/ecpay?action=return`)
  - `ECPAY_NOTIFY_URL` (`/api/ecpay?action=notify`)
  - `PUBLIC_SITE_URL`
