# Wallid Checkout Resilience, Telemetry & UX

Scope is strictly limited to checkout/payment code. No other routes, no new npm packages, no schema changes beyond a new `checkoutTelemetry` Firestore collection.

## Files to create

- `src/lib/checkoutTelemetry.ts` — `logCheckoutEvent(event)` writing to Firestore `checkoutTelemetry` with `serverTimestamp`, `userAgent`, `url`. Try/catch swallow-on-fail. Console echo when `?checkout_debug=1`. Discriminated union `CheckoutEvent` exactly as spec'd (strict TS, no `any`).
- `src/lib/checkoutPreflightRetry.ts` — `callPreflightWithRetry(fn, { maxRetries, baseDelayMs })` with exponential backoff (1s/2s/4s), retrying only on network / 5xx / thrown errors. Accepts `onAttempt(attempt, total)` callback so UI can show "Retrying (1/3)…".
- `src/tests/checkout-preflight-failure.e2e.test.ts` — Uses the framework already in the repo (vitest + RTL from existing `tests/`); mocks preflight (fail all retries → Pay still enabled → clicking calls createOrder), mocks createOrder delay (Processing…/disabled/spinner), and empty-cart click (scroll + inline message + telemetry mock asserted).

## Files to modify

- `src/pages/Checkout/index.tsx` — the only checkout page:
  - Add `isSubmitting`, `disabledReason`, `retryInfo` state.
  - Replace inline preflight call with `callPreflightWithRetry`; on failure keep Pay enabled and set `disabledReason = 'preflight_failed'` with retrying message; on exhaustion disable Pay with "refresh the page" copy and emit `preflight_fail` telemetry (errorType `network`, retry count).
  - Pay button onClick: `setIsSubmitting(true)` first line; wrap remaining logic in try/finally; `setIsSubmitting(false)` in finally. Emit `pay_click`, `create_order_start`, `create_order_success|fail`, `redirect_target`, `gateway_error`.
  - Button UI: "Processing…" label, `disabled` attr, opacity 0.6, `cursor-not-allowed`, inline CSS-border spinner (no lib) when submitting.
  - Below Pay button render inline red-danger message from `disabledReason` map. Auto-clears when condition resolves.
  - On click while disabled, scroll `#checkout-validation-banner` into view (`behavior: smooth, block: center`) and toggle a `flash-highlight` class (defined in `src/index.css` via existing utility layer — brief yellow fade keyframe, no new palette).
  - Ensure the validation banner element has `id="checkout-validation-banner"`.

- `src/index.css` (or the existing global stylesheet already used by checkout) — add a single `@keyframes checkout-flash` + `.checkout-flash` utility. No color palette changes; uses existing amber token.

Nothing else is touched. Wallid createOrder + redirect flow stays intact — telemetry and state are additive wrappers around the existing calls.

## Technical details

- Firestore instance reused from `@/lib/firebase` (`db`, `collection`, `addDoc`, `serverTimestamp`). No new deps.
- `CheckoutEvent` union exactly as specified; `logCheckoutEvent` merges `{ userAgent: navigator.userAgent, url: window.location.href, timestamp: serverTimestamp() }` server-side. All browser reads guarded with `typeof window !== 'undefined'` (SSR-safe — checkout is client-rendered but `@/lib/firebase` is SSR-touched).
- Retry classifier: retry when `error.statusCode >= 500`, missing statusCode, `error.code === 'NETWORK_ERROR'`, `AbortError`, or generic thrown `Error` without status. 4xx surfaces immediately.
- `disabledReason` derivation is a single `useMemo` combining cart-empty / validation-errors / preflight state / submitting so message stays in sync automatically.
- After edits: run `bun run typecheck` and `bun run build` (project scripts) — both must pass. Sitemap preflight is unaffected (no route changes).

## Deliverables reported back

1. Files modified/created list.
2. Typecheck pass confirmation.
3. Build pass confirmation.
4. Note: telemetry lands in Firestore → `checkoutTelemetry` collection (auto IDs). Filter by `stage` field; `?checkout_debug=1` mirrors events to browser console.
