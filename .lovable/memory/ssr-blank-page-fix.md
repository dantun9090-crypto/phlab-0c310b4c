---
name: SSR blank page fix
description: Fix for blank pages on phlabs.co.uk caused by legacy router SSR crash and stale CDN cache
type: feature
---

# Blank page fix (June 2026) — works, do not regress

If every page renders blank (especially in incognito / on production), the root cause is the legacy React Router (`createBrowserRouter`) crashing during SSR because `document` is undefined, plus Cloudflare caching the empty shell.

## Required pieces (all must stay in place)

1. **`src/legacy/AppRouter.tsx`** — uses `createMemoryRouter` on the server and `createBrowserRouter` in the browser. `AppLayout` forces `showIntro = false` during SSR (no dark intro overlay in initial HTML).
2. **`src/legacy/LegacyApp.tsx`** — stable singleton for the browser router; accepts `initialPath` for SSR.
3. **Route entry files** pass `initialPath` to `LegacyApp`:
   - `src/routes/index.tsx`
   - `src/routes/products.tsx`
   - `src/routes/products.$slug.tsx`
   - `src/routes/$.tsx`
4. **`src/server.ts`** — HTML document responses are cached at the CF edge for **60s only** (`cdn-cache-control: public, max-age=60, stale-while-revalidate=86400`) with browser `max-age=0, must-revalidate`. After a publish, returning users get fresh HTML within 60s (or immediately if CF purge is run). Sensitive routes (`/admin`, `/cart`, `/checkout`, `/payment`, `/account`, `/login`, `/register`, `/api/*`, `/vip*`) stay full `no-store`. **Do NOT raise the HTML TTL above 60s** — longer = stale HTML + new hashed chunks = blank pages on returning users after publish. **Do NOT go back to no-store everywhere** — that costs 500-800ms TTFB on every request.
5. **Cloudflare `phlabs cache` ruleset** — must continue to bypass cache for `/sw.js` and `/service-worker.js`.
6. **MolecularIntro overlay was removed 2026-06-10** — it rendered a "PH Labs loading" overlay for 650ms over every first-paint and looked identical to a blank page. Do not re-add it.
7. **Do not mutate `<head>` before React hydrates.** The old inline `CANONICAL_ENFORCER` script changed canonical/OG/Twitter tags during initial parse and triggered React hydration error #419. Canonical enforcement now runs from `RootComponent` `useEffect` after hydration. Keep it post-hydration.
8. **Unknown-route 404 HTML must be no-store.** A cached 404 for `/products/bpc-157` stuck at the edge even after `product_stock` had the product. Keep generated 404 HTML `no-store` at browser/CDN/surrogate layers.

## Symptoms of regression

- Blank white/dark page on https://phlabs.co.uk in incognito
- Server logs: `ReferenceError: document is not defined`, React hydration error #419, or live product URLs returning cached 404/HIT after data exists
- View-source shows empty `<div id="root">` (no SSR content)

## First checks if it breaks again

1. View source on the live URL — is `<div id="root">` empty? → SSR crash returned.
2. Did anyone re-introduce a client-only mount (useEffect dynamic import of LegacyApp)? Revert.
3. Did a script mutate `<head>` before hydration? Move it into a client `useEffect`.
4. Did 404 HTML or service-worker/recovery URLs lose `no-store`? Re-add.
5. Purge Cloudflare cache for the apex (`phlabs.co.uk`) after deploying.
