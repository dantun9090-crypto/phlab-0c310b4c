
# PH Labs SEO & Infrastructure Hardening Plan

This is a large, multi-surface change. Before I start editing, I want to confirm the scope and call out things that are already in place so we don't duplicate work or regress what's live.

## What's already done (verified in repo / per project memory)

- **`phlabs-prerender` Worker** is live on `phlabs.co.uk/*` and already proxies bots to Prerender.io with `PRERENDER_TOKEN`.
- **`prohealthpeptides.co.uk` → apex 301** handled by legacy `phlab` Worker (kept intact).
- **`www.phlabs.co.uk` → apex 301** handled by `REDIRECT_HOSTS` in `src/server.ts` (origin level).
- **CSP nonce, security headers, cache-bypass for `/sw.js` and `/service-worker.js`** already in `src/server.ts` + CF Page Rules.
- **`public/robots.txt`** already matches your spec almost verbatim (one diff: it has `Google-Extended: Disallow:/` instead of your requested separate `ChatGPT-User`/`OAI-SearchBot`/etc. block — actually all of those ARE present; only `Google-Extended` is extra, which is fine and should stay).
- **`src/routes/sitemap[.]xml.ts`** exists and uses `https://phlabs.co.uk`.
- **`src/routes/google-merchant-feed[.]xml.ts`** exists.

## What I'll change

### 1. Cloudflare Worker (`phlabs-prerender`) — rewrite to full spec
Single deployable `worker.js`, deployed via CF API to the existing worker. Behavior:
- Hostname normalization (www→apex, http→https) — defense in depth on top of origin.
- Bot UA detection (full list incl. AdsBot, FacebookExternalHit, Twitterbot, LinkedInBot, generic bot/crawler/spider/lighthouse/headless).
- Prerender.io forward for GET bot requests, 25s timeout, 5xx/429/timeout → origin fallback.
- Direct origin proxy for normal users (preserves current `cf-cache-status: HIT` behaviour via existing CF cache rules).
- Webhook bypass: `/api/truelayer/*`, `/api/fena/*`, `/webhook/*` → origin, no prerender, no transformation, no body buffering.
- Security headers on ALL responses (HSTS preload, nosniff, frame-deny, referrer-policy, permissions-policy; strip `X-Powered-By`/`Server`).
- Rate limiting per IP via Cloudflare's WAF rate-limit ruleset (Workers can't reliably hold per-IP counters without Durable Objects / KV — I'll deploy this as a CF rate-limit rule alongside the Worker rather than in-Worker memory, which is the correct production pattern).
- 5xx → stale cache via Cache API, else branded HTML; Error 1000 detection → 503 + Retry-After.
- Health endpoint `/_health` handled in Worker (bypasses origin + prerender).
- Stored as `cloudflare/worker.js` in repo so it's reviewable; deployed via CF API.

### 2. SEO meta on every route
- Add `<link rel="canonical">` (leaf-only, per TanStack canonical caveat) + `hreflang` `en-GB` + `x-default` + `og:url` to:
  - `src/routes/index.tsx`
  - `src/routes/products.tsx`
  - `src/routes/products.$slug.tsx` (dynamic, from loader data)
  - `src/routes/payment.success.tsx`, `payment.cancel.tsx` (noindex)
- Canonical strips query params and trailing slashes (except `/`).
- `og:url` and `twitter:domain` set to apex.

### 3. JSON-LD Product schema
- Added to `products.$slug.tsx` `head().scripts`, derived from loader data (name, image, sku, price, GBP, InStock, priceValidUntil 2027-06-08).

### 4. Internal links audit
- `rg`-sweep the codebase for hardcoded `www.phlabs.co.uk` and `https://phlabs.co.uk` in href/Link/CTA/footer/logo and switch to apex / relative paths.

### 5. Sitemap & merchant feed
- Verify and (if needed) update `sitemap[.]xml.ts` and `google-merchant-feed[.]xml.ts` to confirm zero `www.` URLs and set `<lastmod>` to today.

### 6. robots.txt
- Add the few entries from your spec that aren't already present. Keep existing `Google-Extended` block.

### 7. 404 / 500 / health
- 404: enhance `src/routes/$.tsx` with required copy + status 404 + links.
- 500: ensure `brandedErrorResponse` in `src/server.ts` uses your copy + returns 500.
- `/_health`: handled at Worker edge (no origin round-trip), returns `{status, timestamp, version}`.

### 8. Admin panel sync (per project rule)
- Surface new Worker config, JSON-LD coverage, and canonical audit results in the matching Admin tabs so the admin UI stays the source of truth.

### 9. Verification
After deploy, run the curl tests you listed and report results inline.

## Things I will NOT change (matches your constraints)
- No product data, SKUs, Firebase collections, images touched.
- TrueLayer / Fena payment code untouched (webhook bypass is pure routing).
- RUO compliance text untouched.
- Admin auth, security event logging, admin rate limiting untouched.
- Firebase config untouched.
- No Stripe / card gateway added.
- en-GB throughout.

## Open question (1)

**In-Worker rate limiting**: doing per-IP limits in pure Worker memory is unreliable across CF's edge isolates. The correct production pattern is either:
- (a) **CF Rate Limiting Ruleset** (declarative, runs before the Worker, no edge-state issues) — my recommendation, and I'll deploy it via CF API alongside the Worker.
- (b) **Durable Object counter** — accurate but adds cost + cold-start latency on every request.

Plan defaults to (a). Confirm or say "use DO" and I'll switch.

Approving this plan will execute all 9 sections in one pass; I'll report verification curl output at the end.
