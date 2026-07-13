# SSG migration for `/` — implementation plan

Goal: serve `/` as a static, edge-cached HTML file with a hash-based CSP (no per-request nonce), keeping every other route on the existing SSR path. Build must pass and 5 verification steps must succeed before finishing.

## Scope (in / out)

In scope
- Prerender only `/` at build time → `dist/index.html`.
- Post-build: extract inline scripts, compute SHA-256, emit `generated/csp-hashes.json`.
- Post-build: inject `<meta name="build-id" content="…">` into `dist/index.html`.
- `src/server.ts`: for path `===` `/` only, serve static HTML with static hash CSP, `Cache-Control: public, max-age=0, s-maxage=14400, stale-while-revalidate=86400`. Skip nonce injection and skip build-id HTMLRewriter for `/`.
- Cloudflare Worker (`phlabs-prerender`): for `/` + non-bot, pass through to origin (which now serves the static file). Bot path unchanged (Prerender.io).
- Playwright test: load `/`, assert no CSP violations in console, assert `<meta name="build-id">` present.

Out of scope (do NOT touch)
- Any other route (`/products`, `/research/*`, `/admin/*` etc.) — they keep dynamic SSR + nonce + build-id rewriter.
- Robots/sitemap/`/api/*` rules.
- Cloudflare dashboard cache rules (user handles separately).
- LCP banner preload logic, image loading, code-split boundaries.
- React component logic beyond what SSG requires.

## Banner freshness decision

Confirmed direction (from prior turn): 1a — accept banner is baked into the static HTML at build time. Promo changes require a rebuild; a Firestore→GitHub Action rebuild hook is out of scope for this PR but noted in follow-ups. The 350ms loader race stays as-is because it runs at prerender time, not per-request.

## Files to change

1. `vite.config.ts` — add `prerender: { routes: ['/'] }` under `tanstackStart` so the SSG output for `/` lands in `dist/`.
2. `scripts/postbuild-csp-hashes.ts` (new) — reads `dist/index.html`, extracts every `<script>` inline body (skips `src=` scripts), SHA-256s each, writes `generated/csp-hashes.json` as `{ hashes: ["sha256-…"], buildId: "<hash>" }` where buildId = SHA-256 of the final HTML.
3. `scripts/postbuild-inject-build-id.ts` (new) — injects `<meta name="build-id" content="<buildId>">` into `<head>` of `dist/index.html` after hashing.
4. `package.json` — `build` script becomes `vite build && tsx scripts/postbuild-csp-hashes.ts && tsx scripts/postbuild-inject-build-id.ts`. Order matters: hash before inject (the meta tag is not an inline script so it doesn't affect CSP, but doing this order keeps hashes deterministic against the pre-injection HTML — safer against any future scanner picking up the meta).
5. `src/server.ts` — early branch: if `url.pathname === '/'` AND method is GET/HEAD AND not a bot, read `dist/index.html` + `generated/csp-hashes.json` (loaded once at Worker cold start), respond with:
   - `Content-Type: text/html; charset=utf-8`
   - `Cache-Control: public, max-age=0, s-maxage=14400, stale-while-revalidate=86400`
   - `Content-Security-Policy: script-src 'self' <hashes> 'strict-dynamic' 'unsafe-eval'; …existing directives without nonce…`
   - No HTMLRewriter, no nonce, no build-id injection.
   All other paths fall through to existing SSR handler untouched.
6. `phlabs-prerender.mjs` (Cloudflare Worker) — bot detection unchanged. For `/` + browser: still `fetch(ORIGIN + "/")` (unchanged); the origin now returns the static HTML with edge-friendly cache headers. Cloudflare Cache Rules with 4h TTL override handled outside code by user.
7. `e2e/home-ssg-csp.spec.ts` (new) — Playwright: navigate to `/`, listen for `page.on('console')` and fail if any `SecurityPolicyViolationEvent`-related message appears; assert `document.querySelector('meta[name=build-id]')` exists.

## Technical details

CSP construction

```
script-src 'self' 'sha256-<h1>' 'sha256-<h2>' … 'strict-dynamic' 'unsafe-eval';
```

`'strict-dynamic'` with `'self'` + hashes: modern browsers ignore `'self'` when `'strict-dynamic'` is present, but keeping `'self'` covers browsers that ignore `'strict-dynamic'` (Safari<15.4 fallback). `'unsafe-eval'` retained to match current SSR policy (Firestore SDK uses `Function()`).

The rest of the CSP (`style-src`, `img-src`, `connect-src`, `frame-src`, etc.) is copied verbatim from the current SSR policy in `src/server.ts` for `/`. Any nonce-related directive is dropped from the `/` branch only.

Build-id hash

Computed as `sha256(dist/index.html contents pre-injection).slice(0,12)`. Emitted into both `generated/csp-hashes.json` (for the Worker to read) and the injected `<meta>` tag. Used later by post-publish check to detect deploy freshness.

Route-level SSG safety

`src/routes/index.tsx` already returns serializable loader data (`{ banner }`) and the SSR shell is a static `<main>` div. No hooks touch `window` at render time — verified during earlier CLS work. `LegacyClientApp` hydrates client-side, which is compatible with SSG: the static HTML mounts the shell, hydration takes over.

Hash-vs-content invariant

Because Vite output filenames are hashed and route-tree state is baked into the bundle, the inline script body changes on every build. The post-build script always regenerates hashes from the *actual* emitted HTML, so hash/body can never drift by construction. This makes step 6 of the original spec (manual hash verification) redundant — the Playwright test in step 7 is the real gate.

## Verification (must pass before finishing)

1. `bun run build` completes; `dist/index.html` and `generated/csp-hashes.json` exist.
2. `curl -sI https://phlabs.co.uk/` → `cache-control: public, max-age=0, s-maxage=14400, stale-while-revalidate=86400`, `content-security-policy` contains `sha256-` hashes and no `nonce-`.
3. `curl -sI https://phlabs.co.uk/admin` → still has `no-store` + `nonce-` in CSP (unchanged).
4. `curl -s https://phlabs.co.uk/ | grep 'meta name="build-id"'` → matches value in `generated/csp-hashes.json`.
5. `bunx playwright test e2e/home-ssg-csp.spec.ts` → passes, zero CSP violations in console.

## Risks & mitigations

- Inline script body includes route context that changes per build → mitigated: hashes always recomputed post-build from actual HTML.
- Static HTML serves stale banner until next deploy → accepted (1a); follow-up rebuild hook noted.
- Firestore SDK or third-party inline script added later without rebuild → CSP would block it. Mitigation: the Playwright test runs on every deploy and fails the pipeline. Existing SSR routes are unaffected.
- Worker cold-start reads `dist/index.html` from bundle → file is bundled at build time via existing Wrangler assets config; no runtime FS needed.

## Follow-ups (not in this PR)

- Firestore banner-change → GitHub Actions rebuild trigger.
- Extending SSG to other high-traffic static routes (`/about`, `/contact`) once `/` is proven.
