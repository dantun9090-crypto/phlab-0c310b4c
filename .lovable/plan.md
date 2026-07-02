## Issue

Sentry captured a `TypeError: Failed to fetch dynamically imported module` for `src/legacy/LegacyApp.tsx` on `/about` in the **dev preview** (`lovableproject.com`, `environment=development`, Chrome Android WebView).

This is the classic "stale chunk after redeploy" failure: the browser holds an old `index.html` that references an older `LegacyApp-*.js` hash, the new deploy replaced the hash, so the dynamic `import("./LegacyApp")` in `src/legacy/LegacyClientApp.tsx` 404s. We already detect this via `isStaleChunkError` in `src/lib/recovery.ts` and have `hardReload()` machinery, but:

1. The failing import in `LegacyClientApp.tsx` has no `.catch()` — the rejection escapes as an unhandled promise rejection, which is exactly what Sentry captured (`mechanism = onunhandledrejection`), and the user sees a blank `/about` instead of an automatic recovery.
2. Sentry is currently reporting `environment=development` noise from the preview sandbox, which pollutes the production issue feed.

## Plan

### 1. Make the legacy dynamic import self-healing
Edit `src/legacy/LegacyClientApp.tsx`:
- Wrap `import("./LegacyApp")` in `.catch()`.
- If the error matches `isStaleChunkError(err)` from `@/lib/recovery`, call `hardReload({ clean: true })` (scoped SW/cache eviction + clean navigation).
- Otherwise, mark hydration error state (no-op for this class) and swallow so Sentry still records but no unhandled rejection bubbles.
- Add a single retry with a short backoff before triggering hard reload, to survive a transient network blip on mobile WebView.

### 2. Same guard on the other dynamic legacy entry
`src/routes/login.tsx` imports `LegacyApp` statically, but any other `React.lazy`/`import()` of legacy chunks (grep `import(.*Legacy`) gets the same `.catch` → stale-chunk recovery wrapper via a tiny helper in `src/lib/recovery.ts` (e.g. `safeDynamicImport(fn)`).

### 3. Silence dev-preview noise in Sentry
In `src/lib/sentry.ts` `beforeSend`:
- Drop events where `event.environment === "development"` AND the request URL host ends in `lovableproject.com` or `lovable.app` preview subdomain — these are ephemeral sandboxes, not real users.
- Keep production (`phlabs.co.uk`) events untouched.

### 4. Verify
- Read `src/lib/sentry.ts` and `src/legacy/LegacyClientApp.tsx` to confirm exact shape before editing.
- After edit: manually trigger by throwing a fake `ChunkLoadError` from the retry path in dev and confirm `hardReload` fires with `sw=off` in the URL (existing behaviour).
- Confirm no Sentry event fires for the preview host after change.

## Technical notes

- `hardReload({ clean: true })` already: unregisters app-owned SWs, evicts app caches, waits 2s for CF propagation, then `location.replace` with `sw=off`. Re-entrant flag `HARD_RELOAD_FLAG` prevents loops.
- Recovery helper stays pure; only `LegacyClientApp.tsx` gains the effectful catch.
- No UI, no backend, no schema changes. Frontend-only, ~40 lines total.