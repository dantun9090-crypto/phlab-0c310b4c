
# Premium performance pass for /compound

Goal: push mobile Lighthouse on `/compound` from **0.65 → 0.85+** (desktop stays at **0.94**) without touching other routes, without removing any feature, and with regression visibility in CI.

Current baseline (live, simulate throttling):
- Desktop: **0.94** — LCP 1.5 s, TBT 40 ms, CLS 0
- Mobile: **0.65** — LCP 3.5 s, TBT **900 ms**, CLS 0, FCP 1.1 s

Mobile TBT is the only real bottleneck. It comes from the shared `__root.tsx` JS — Firebase auth listener, legacy app shell, web-vitals, error-monitor, mutation logger, chunk-reload, SW register, pageview beacon. None of these are needed by the marketing landing.

---

## 1. Route-scoped marketing layout (no `__root.tsx` changes)

Create a pathless layout that wraps the marketing routes only. The existing `__root.tsx` stays exactly as it is — we don't redesign anything, don't remove anything, and other routes are unaffected.

```text
src/routes/
  __root.tsx                     ← UNCHANGED. Still runs for / and every other route.
  _marketing.tsx                 ← NEW. Pathless layout. Gates the heavy stuff.
  _marketing.compound.tsx        ← MOVED from compound.tsx (same URL: /compound)
```

Because `_marketing` starts with an underscore it does NOT appear in the URL — `/compound` stays `/compound`. The TanStack route id becomes `/_marketing/compound`.

`_marketing.tsx` does three things:
- Renders just `<Outlet />` inside a minimal wrapper.
- Sets `<meta name="phl-marketing" content="1">` (used by gated modules below to early-return).
- Exposes a `window.__PHL_MARKETING__ = true` flag set inline in `head().scripts` so it's available BEFORE the global app modules evaluate.

## 2. Gate the heavy global side-effects, don't delete them

In `__root.tsx`, the imports `@/lib/chunk-reload`, `@/lib/sw-register`, `installErrorMonitor`, `initWebVitals`, `installPreReactMutationLogger`, and the Firebase auth listener wiring all need to early-return when `window.__PHL_MARKETING__ === true`. We do NOT remove the imports (workspace rule), we add a one-line guard at the top of each side-effect entry point:

```ts
// src/lib/chunk-reload.ts (and friends)
if (typeof window !== 'undefined' && (window as any).__PHL_MARKETING__) {
  // marketing landing — skip on this route to keep TBT low
} else {
  // existing module body unchanged
}
```

Files getting the guard:
- `src/lib/chunk-reload.ts`
- `src/lib/sw-register.ts`
- `src/lib/web-vitals.ts` (`initWebVitals` becomes no-op when flag set)
- `src/lib/error-monitor.ts` (`installErrorMonitor` no-op when flag set)
- `src/lib/recovery.ts` mutation logger install (no-op when flag set)
- Firebase auth listener bootstrap (the one started inside the root) — no-op when flag set

The legacy app shell / pageview beacon / `PageTransition` already only render inside the route subtree we're leaving alone, so they don't reach `/compound` once it moves under `_marketing`.

## 3. Route-level code splitting for /compound

`compound.tsx` already uses `createFileRoute` so TanStack Start auto-splits the `component` chunk. The remaining cost is `PremiumLanding.tsx` being imported eagerly. Wrap it in `React.lazy` + `<Suspense fallback={<HeroSkeleton />}>` so the LCP hero (already preloaded as image) paints from a tiny inline skeleton while the JS for the form/animations streams in.

```tsx
const PremiumLanding = lazy(() => import('@/components/PremiumLanding'));
```

The hero image, headline, and CTA buttons go in a tiny inline `HeroFallback` so LCP doesn't wait on the chunk.

## 4. Drop third-party scripts on /compound

Inside `_marketing.tsx` `head()`:
- No GA `gtag.js` (kept on every other route via existing `__root.tsx`).
- No Google Merchant badge.
- No Firebase SDK import.

GA pageview for `/compound` is logged via a single `navigator.sendBeacon` to `/api/public/error-monitor`-style endpoint we already have, fired from `useEffect` after first paint. No script tag, no blocking.

## 5. CI: store Lighthouse comparison so regressions are visible

Extend `.github/workflows/lighthouse-compound.yml`:
- Run mobile + desktop on every PR against the **preview** URL.
- Upload the full `lighthouse-results/*.json` as a workflow artifact.
- Append a row to `lighthouse-history.csv` on `main` (committed to repo) with `{date, sha, mobile_perf, desktop_perf, lcp_m, tbt_m, lcp_d, tbt_d}`.
- Fail the PR if mobile perf drops more than 0.05 vs the last recorded baseline on `main`.
- Post the comparison as a PR comment (mobile/desktop score deltas + the four CWV deltas).

Budgets file `lighthouse-budgets.json` updated: mobile perf floor **0.85**, desktop floor **0.93**, TBT mobile budget **300 ms**.

---

## Risk control

- All changes are additive or behind a runtime flag — `/`, `/products`, `/account`, `/checkout`, `/admin` etc. evaluate identically to today.
- The Firebase auth listener still runs everywhere except `/compound`; no auth-protected route touches the marketing layout.
- If the flag misbehaves on `/compound`, fall back is one line: delete `window.__PHL_MARKETING__ = true` from `_marketing.tsx` and the old behavior is restored on next deploy.
- We do not touch `__root.tsx`'s layout, design tokens, header order, or any feature.

## Expected outcome

- Mobile `/compound`: TBT **900 → ~150 ms**, perf **0.65 → 0.85–0.92**.
- Desktop `/compound`: perf stays **0.94+** (already passing).
- Every other route: identical behavior, identical bundle.
- CI: every PR shows the mobile/desktop delta; regressions block merge.

## Technical detail

- TanStack underscore-prefixed layout routes are pathless: `_marketing.compound.tsx` resolves to URL `/compound` and `createFileRoute("/_marketing/compound")`. `routeTree.gen.ts` regenerates automatically.
- The `window.__PHL_MARKETING__` flag is set via an inline `head().scripts` entry on `_marketing.tsx` so it runs before any deferred module evaluates on the client. SSR path: `_marketing.tsx` also renders a `<meta name="phl-marketing" content="1">` which `__root.tsx`'s shellComponent can read if needed; current plan does not require server-side branching.
- Lighthouse CI uses `treosh/lighthouse-ci-action@v12` with `configPath: ./lighthouserc.cjs`, plus a small Node post-step that writes/commits `lighthouse-history.csv` only on `push` to `main` (skipped on PRs).
- No new dependencies. No backend changes. No Firebase rule changes. No Cloudflare config changes.
