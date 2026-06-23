# Performance & Audit Fixes — phlabs.co.uk

Scope is large (10 items). I'll tackle them in priority order across a few batches. This plan covers what I'll do now versus defer.

## Batch 1 — Quick wins (this turn)

1. **Firestore 400 on `settings/promoBanner`** — locate the read, wrap in try/catch, return null on failure (no console noise).
2. **Color contrast fixes** — `.rg-cta` background → `#0a8f5c`; trust-bar label color → `#7a98b8`.
3. **Hidden source maps** — add `build.sourcemap: 'hidden'` to `vite.config.ts`.
4. **Iframe titles** — add `title="Firebase Authentication"` / `title="Google Merchant Center"` where we mount them (only ones we control; the Firebase `__/auth/iframe` is injected by the SDK and not directly controllable).
5. **BF-cache** — audit for `unload` / `beforeunload`, swap to `pagehide` where found.

## Batch 2 — Medium effort (next turn, after Batch 1 verified)

6. **Lazy-load Merchant Center widget** — defer mount until `requestIdleCallback` + IntersectionObserver past fold.
7. **Code-split Firebase off home route** — audit `src/routes/index.tsx` import chain, convert eager Firebase imports to dynamic on home; keep eager on auth/account/checkout.

## Batch 3 — Infra / config (separate turn)

8. **Cloudflare HTML edge cache verify** — `curl -I` against prod, inspect `cf-cache-status`. If MISS on `/` and `/products`, adjust cache rules. Note: `/` is intentionally `no-store` per the SSR blank-page memory until SSR hydration is re-enabled — this is a known trade-off.
9. **SSR hydration prep** — audit `src/client.tsx` for window/document at module scope; document mutation-count rollout gate. Do NOT flip the flag.

## Out of scope / no action

10. `/login` SEO 66 — intentional noindex, robots.txt already disallows.

## Constraints honored

- No CSP changes, no Wallid flow changes, no GA4 changes, no www redirect changes.
- Build must pass before commit.

Confirm and I'll start with Batch 1.
