
# Wallid Payment Gateway — Integration Plan

Hosted-checkout flow: we create a payment server-side, redirect the customer to Wallid's page, then update the order via webhook + status polling fallback.

## 1. Secrets (server-only, added when you receive credentials)

- `WALLID_API_KEY_ID`
- `WALLID_API_KEY_SECRET`
- `WALLID_WEBHOOK_SECRET` (optional but we will require it)
- `WALLID_BASE_URL` = `https://payment-api.wallid.co/api/payment-gw/v1`

Never exposed to client. Webhook URL given to Wallid:
`https://phlabs.co.uk/api/public/webhooks/wallid`

## 2. Files to add

```
src/lib/wallid.server.ts                          // Basic auth helper + typed create/status calls
src/lib/payments/create-wallid-session.functions.ts  // createServerFn: validates cart, computes total in pence, calls /create, writes order(status:'pending', provider:'wallid', apiPaymentId)
src/routes/api/public/webhooks/wallid.ts          // POST handler: raw-body HMAC verify, timestamp ±300s, parse events[], update order in Firestore (admin SDK), idempotent on event_id
src/routes/payment/success.tsx                    // already exists – wire apiPaymentId polling
src/routes/payment/cancel.tsx                     // already exists – mark order failed if still pending
src/pages/Admin/tabs/Payments/WallidTab.tsx       // admin-panel surface (per workspace rule)
```

## 3. Checkout flow

1. Client clicks "Pay with Wallid" → calls `createWallidSession` server fn with `{ cartId }`.
2. Server fn (auth + 18+ check):
   - Re-reads cart/products from Firestore (server-trusted prices, never client totals).
   - Builds `items[]` with `price_minor` in pence, GBP.
   - POSTs `/create` with `order_id = <firestoreOrderId>`, success/fail URLs containing `?apiPaymentId=...`.
   - Writes `/orders/{id}` with `status:'pending'`, `provider:'wallid'`, `apiPaymentId`, `amountMinor`, `currency:'GBP'`.
   - Returns `payment_link` only.
3. Client `window.location` → `payment_link`.

## 4. Webhook handler (`/api/public/webhooks/wallid`)

- Read raw body **before** JSON parse.
- Verify `X-Webhook-Timestamp` within ±300s (replay guard).
- Compute `sha256=` HMAC over `${ts}.${rawBody}`, `crypto.timingSafeEqual` vs `X-Webhook-Signature`.
- On mismatch / stale / missing secret → `401`.
- Parse `events[]`. For each event:
  - Idempotency: skip if `/webhookLogs/{event_id}` exists; else create it.
  - Look up order by `apiPaymentId`, verify `amount` + `currency` match stored values (defence against tampered replays).
  - Map status: `SUCCESS → paid`, `FAILED → failed`, `EXPIRED → expired`. Write `statusError` if present.
  - Append to `/auditLogs`.
- Always respond `200` within 30s (process async only if needed; current load is fine sync).

## 5. Resilience

- Success page: on mount, poll `GET /status?apiPaymentId=...` via a thin server fn every 2s for up to 30s if order still `pending` (covers webhook delay).
- Cancel page: if order still `pending` after 60s, mark `failed` with reason `user_cancelled`.

## 6. Firestore rule additions

`/orders` already allows admin update; webhook uses Admin SDK so it bypasses rules. No client write path for status changes.
Add to `/webhookLogs/{id}`: `read: isAdmin(); write: if false;` (already in workspace rules).

## 7. Admin panel (workspace rule: every change reflected in admin)

New `Admin → Payments → Wallid` tab:
- Toggle enable/disable (Firestore `/settings/payments.wallid.enabled`).
- Show last 50 webhook events from `/webhookLogs` filtered by `provider:'wallid'`.
- Show recent orders with provider=wallid + status + apiPaymentId + link to Wallid dashboard.
- "Re-sync status" button per order → calls `/status` and updates Firestore.

## 8. Security checklist (workspace non-negotiables)

- [x] All secrets server-side only, never `VITE_*`.
- [x] Server-validated totals (never trust client cart total).
- [x] Webhook HMAC verify + timestamp + constant-time compare + idempotency.
- [x] 18+ age + UK shipping check enforced in `createWallidSession` before API call.
- [x] Admin actions (toggle, re-sync) logged to `/auditLogs`.
- [x] No PII returned from `/api/public/*`.

## 9. What I need from you

1. `WALLID_API_KEY_ID` and `WALLID_API_KEY_SECRET` (I'll request via the secrets tool when you're ready).
2. The `WALLID_WEBHOOK_SECRET` value you give Wallid (or let me generate one and we send it to them).
3. Confirm webhook URL to register with Wallid: `https://phlabs.co.uk/api/public/webhooks/wallid`.

Once credentials are in, implementation is ~one pass: server fn + webhook + admin tab + checkout button wiring.
