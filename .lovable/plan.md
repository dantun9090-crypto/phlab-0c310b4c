# Google Ads conversion tracking — diagnostic report

Read-only audit. No code was changed. Findings first, then the fixes I'd propose if you approve.

## 1. Where the Google tag is loaded

Not in static HTML head. Two separate loaders exist:

- `src/routes/__root.tsx` (~line 1507): a `useEffect` that appends an **inline bootstrap script** to `document.body` after hydration, then loads `/metrics/gtag/js?id=G-5HM4YT7HDW` (first-party Cloudflare Tag Gateway) only after **LCP + requestIdleCallback**, or first interaction, or `load + ~4-10s`. Sets `window.__phlGaBootstrapped = true`.
- `src/lib/analytics.ts` → `initAnalytics()`, called from `src/components/Layout.tsx` (line 219). Loads gtag.js via the same gateway, injects **GTM-MT4BZ2X8**, and configures the extra destinations.

The inline bootstrap configures `G-5HM4YT7HDW`, `GT-P3HVF8R5`, `GT-WRHD4Q69`, `MC-KJMB7MKB29`. It does **not** configure `AW-18173004380`. Only `initAnalytics()` configures the Ads destination.

## 2. The Ads conversion snippet

`trackAdsPurchaseConversion()` in `src/lib/analytics.ts` (line 572) fires
`gtag('event','conversion',{ send_to: 'AW-18173004380/ksL0COOWrt0cENyUyNlD', value, currency:'GBP', transaction_id })`.
It is called only from `trackPurchase()` — i.e. **purchase only**. `add_to_cart`, `begin_checkout`, `view_cart`, `add_payment_info` are GA4-only events (they do carry `send_to` including the AW id, so Ads-side imported GA4 events could pick them up, but there is no dedicated Ads label for them).

Call sites of `trackPurchase`: `src/routes/checkout.success.tsx`, `src/routes/payment.success.tsx`, `src/pages/Checkout/index.tsx` (bank-transfer placement), `src/lib/purchase-recovery.ts`.

## 3. GA4 present + duplication risk

GA4 `G-5HM4YT7HDW` is present, plus GTM `GTM-MT4BZ2X8`, plus Bing UET, Clarity, Taboola. Two known duplication hazards:

- The inline bootstrap sets `send_page_view: true`; `initAnalytics()` detects `__phlGaBootstrapped` and skips its own config, so page_view duplication is guarded.
- If GTM `GTM-MT4BZ2X8` also contains a GA4 config tag or an Ads conversion tag, purchases will be **double-counted** (hardcoded gtag + container tag). This cannot be verified from the codebase — it needs a look inside the GTM container.

## 4. Client vs server-side

Client-side is the primary path. Server-side safety net exists but is **GA4 Measurement Protocol only** (`src/lib/server/ga-measurement.ts`, `GA4_MP_API_SECRET`), triggered by the reconcile cron (`.github/workflows/wallid-reconcile.yml` → `/api/public/hooks/reconcile-payments.ts`). It sends a GA4 `purchase` with a synthetic `server.<orderId>` client id — no gclid, so Ads attribution is weak. There is **no Google Ads Enhanced Conversions for Web/Leads upload and no offline conversion import**.

## 5. Consent gating

Consent Mode v2 with **denied defaults** for `ad_storage` / `ad_user_data` / `ad_personalization` until the user accepts marketing in the cookie banner (`php_cookie_consent`, `src/components/CookieConsent.tsx`). "Reject" writes `marketing: false` permanently. So for every visitor who rejects or ignores the banner, the Ads conversion is sent as a **cookieless ping** — Ads will only ever report those as modelled conversions, and modelling needs volume. This depresses, but does not zero, conversions.

Also: `isBot()`/DNT short-circuit `initAnalytics()` entirely.

## 6. Recent commits touching this area

`git log` on the tracking files shows repeated attempts at exactly this problem:
`3d5146ff` "fire purchase conversion with active Purchase (4) label", `de7da48b` "point purchase conversion at active Ads label (Purchase (3))", `f1b44d78` / `770e040b` guest Wallid purchase events, `383e28ab` / `4eb1bc08` purchase-fired ack for MP backfill dedup, `7d3157ca` "Added phlabs GTM container".

The label has been changed at least twice (Purchase (3) → Purchase (4) → current `ksL0COOWrt0cENyUyNlD`). Whether the current label is the **active, non-archived** Purchase action in Ads is unverifiable from code.

## 7. Where the conversion is supposed to fire, and whether that page works

Expected pages: `/checkout/success?order_id=…` (Wallid + PeptidePay) and `/payment/success`. Both are `noindex`, served `no-store` by the worker, so caching is not the issue.

**This is where the likely primary gap is.** Neither `src/routes/checkout.success.tsx` nor `src/routes/payment.success.tsx` renders `Layout` — `Layout` is only imported by Products, ProductDetail, Category, Search, VipStore, Checkout and the legacy router. Consequences on the success pages:

1. `initAnalytics()` **never runs** there. So the only gtag present is the `__root` inline bootstrap, which never calls `gtag('config','AW-18173004380', …)`. A `gtag('event','conversion',{send_to:'AW-.../label'})` aimed at an unconfigured destination is **dropped** — no request to Google Ads. GA4 purchase still lands (G- is configured); the Ads conversion does not. That matches "GA4 shows purchases, Ads shows zero".
2. GTM is also never injected on those pages, so any container-side conversion tag can't rescue it either.
3. Timing race: the inline bootstrap only defines `window.gtag` after LCP+idle. `fireGaPurchaseOnce()` bails early via `ensureAnalyticsReady()` if `window.gtag` is still undefined — but it writes the idempotency flag `php_ga_purchase_<orderId> = "1"` **regardless**, and also acks `purchaseFired: true` to `/api/payments/status` (setting `gaClientPurchaseAt`, which suppresses the MP backfill). So a dropped event is permanently marked as fired.
4. `purchase-recovery.ts` runs from `Layout`, i.e. only if the buyer later browses a Layout page in the same browser — and it is blocked by the same `php_ga_purchase_*` flag above.

## Likely root cause, ranked

1. **AW-18173004380 is never configured on the success pages** (no `Layout` → no `initAnalytics`) → the `conversion` event has no destination. Highest confidence, fully code-verified.
2. **Idempotency flag + server ack are written even when the event was dropped**, so both the client retry and the server backfill are disabled for that order.
3. **Ads conversion action / label mismatch** — needs verification in the Ads UI (or via the Google Ads API creds referenced in `src/lib/google-ads-push.functions.ts`).
4. **Consent-denied traffic** yields cookieless pings only — a volume drag, not the cause of zero.
5. **Possible GTM duplicate tagging** — only relevant once conversions start arriving.

## Proposed fixes (for your approval — nothing changed yet)

1. Move the tag bootstrap so `AW-18173004380` is configured on **every** route (config it in the `__root` inline bootstrap alongside the `GT-`/`MC-` ids, and/or call `initAnalytics()` from `__root` rather than `Layout`).
2. Make `trackPurchase`/`trackAdsPurchaseConversion` return a success signal; only write `php_ga_purchase_<orderId>` and only ack `purchaseFired: true` when the event actually reached `dataLayer` with the AW destination configured. Otherwise queue and retry until gtag is ready.
3. Add a `?ga_debug=1` verification pass on a real `/checkout/success` URL to confirm the `AW-.../ksL0…` hit leaves the browser.
4. Verify in Google Ads that the conversion action for label `ksL0COOWrt0cENyUyNlD` is active and set to "Primary".
5. Audit the GTM container for a second GA4/Ads tag before enabling anything else.
6. Optional hardening: add Ads-side Enhanced Conversions upload (or offline import from Firestore) as a real server-side safety net, since the current backfill only reaches GA4.
