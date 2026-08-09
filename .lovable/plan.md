# Add PeptidePay as a second checkout payment option

Wallid Pay-by-Bank stays the default and untouched. PeptidePay is added **alongside** it as an extra choice for customers who want card / Apple Pay / Google Pay / crypto. Nothing in the Wallid flow, order creation, emails or reconciliation changes.

I verified the provider before planning: `peptide-pay.com/docs` confirms the API base is `https://pay.qistdigital.com/api/v1`, the header is `x-peptidepay-signature`, and the env names are `PEPTIDEPAY_API_KEY` / `PEPTIDEPAY_WEBHOOK_SECRET`.

## Things you should know before approving

- **This overrides your locked "Wallid is the only provider" rule.** If you approve, I'll update project memory so future sessions don't strip it back out.
- **Real cost is ~7.5%, not 3%.** PeptidePay takes 3%; the card on-ramp (MoonPay/Banxa/Revolut) adds ~4.5% on top, customer-side. Crypto-direct is ~3%.
- **Settlement is USDC on Polygon**, not GBP into your bank. That is a different accounting posture from Wallid for HMRC/VAT — you will be reconciling crypto receipts, and the sale amount vs. what lands in the wallet will differ. Wallid stays available so you're not forced onto this for every order.
- **No chargeback protection and no KYC on your side** — funds go straight to your wallet address.
- Card details are only ever collected on PeptidePay's hosted checkout. No card form is added to phlabs.co.uk.

## What gets built

1. **`src/lib/peptidepay.server.ts`** — server-only.
   - `createPeptidePaySession({ amountPence, currency, metadata, successUrl, cancelUrl, customerEmail, productName, idempotencyKey })` → POST `/api/v1/checkout/init`, returns `{ id, url, status, expiresAt }`. Sends `Authorization: Bearer PEPTIDEPAY_API_KEY` and omits `wallet` (header is the identity); falls back to wallet-only mode with `PEPTIDEPAY_WALLET` when no key is set.
   - `verifyPeptidePaySignature(rawBody, signatureHeader)` → parses `t=…,v1=…`, rejects if `|now − t| > 300s`, computes HMAC-SHA256 over `"${t}.${rawBody}"` with `PEPTIDEPAY_WEBHOOK_SECRET`, and compares with the existing timing-safe helper `timingSafeEqualStr` (works on Cloudflare Workers, where Node's `crypto.timingSafeEqual` is not reliable).

2. **`src/routes/api/payments/peptidepay-create.ts`** (POST) — mirrors the existing `api/payments/create` security model exactly: rate limit, Firebase ID token *or* guest `paymentToken` auth, `buildOrderCtxForPayment` to load the order and enforce ownership + unsettled status, and **the amount comes from the Firestore order, never the request body**. Stores `paymentProvider: "peptidepay"`, the session id and a `peptidepayIdempotencyKey` on the order, then returns `{ url }` for the client to redirect to.

3. **`src/routes/api/public/peptidepay-webhook.ts`** (POST) — must live under `api/public/` because everything else under `/api` is behind published-site auth and the provider's POST would be blocked. Reads `await request.text()` **before** any JSON parse, verifies the signature, returns 401 on mismatch or on a missing header (unsigned wallet-only deliveries are rejected since we run with a webhook secret). On valid: dedupe on `session_id`, and if the order is already paid return 200 immediately. Otherwise flip the order to paid via the existing atomic `transitionDocStatusAdmin`, record `txid` / `amount` / `paid_at`, and enqueue the confirmation email through `enqueueMailOnce` (already idempotent). Returns 200 fast.

4. **Status polling** — the existing `/api/payments/status` route and the success page's poller are extended to recognise `paymentProvider === "peptidepay"` and fall back to `GET /api/v1/sessions/{id}` when no webhook has landed yet. No new order-status endpoint or success page is created; `/checkout/success` already polls and already has the "still processing, we'll email you" state.

5. **Checkout UI** — `src/components/PaymentMethodOptions.tsx` gains a second card ("Card, Apple Pay, Google Pay or crypto") next to the existing Pay by Bank card, in the current design tokens (slate-900 card, emerald accent, no layout or header changes). Under the CTA: `<a href="https://peptide-pay.com" rel="noopener">Secured by PeptidePay</a>`.

6. **Admin** — Payments tab shows the PeptidePay provider row with credential/health state and the webhook URL to paste into their dashboard, per the admin-panel-sync rule.

7. **`.env.example`** — documents `PEPTIDEPAY_API_KEY`, `PEPTIDEPAY_WEBHOOK_SECRET`, `PEPTIDEPAY_WALLET`.

8. **Tests** — `tests/peptidepay-signature.test.ts` (valid signature passes, tampered body 401, stale timestamp rejected, missing header rejected) and an idempotency test asserting the same `session_id` twice has no second side effect.

## Secrets I'll need from you

`PEPTIDEPAY_API_KEY` (`sk_live_…`), `PEPTIDEPAY_WEBHOOK_SECRET` (`whsec_…`), and `PEPTIDEPAY_WALLET` (your Polygon USDC address). I'll request these through the secure secret form after you approve — don't paste them into chat.

## What I will not do

- I won't run the live smoke-test curl or a real payment. PeptidePay has no sandbox, so every call is a real on-chain transfer. After deploy you run the £1 test and their "Send test webhook" button yourself.
- I won't touch the worker, CSP, cache or prerender code beyond adding `pay.qistdigital.com` to the CSP `connect-src`/form-action if the redirect requires it.
