## Admin Health Monitor + Auto Cache Recovery

Large multi-part feature. Plan below; will implement on approval.

### Part 1 — Build ID injection
- `vite.config.ts`: define `__BUILD_ID__` (already exists) + HTML transform plugin to inject `<meta name="build-id" content="…">` into `index.html` `<head>`.
- `src/server.ts`: add `X-Build-Id: <BUILD_ID>` header to all HTML responses (alongside existing nonce rewriter).

### Part 2 — Health check server function
- New `src/lib/health-monitor.functions.ts`:
  - `getCacheHealth` (createServerFn, admin-gated via `requireFirebaseAdmin`):
    1. Fetch `https://phlabs.co.uk/` with Chrome UA; grab `cf-cache-status`, `age`, meta build-id.
    2. Regex-extract first 5 `<script src=…>` chunk URLs; HEAD each; collect 404s.
    3. Call CF API `zones/{id}/settings/development_mode`.
    4. Return shape from spec.
  - `purgeCacheNow` (admin-gated) → wraps existing `purgeCloudflareCache` purge_everything.
  - `ackHealthAlert` (admin-gated) → marks `admin_alerts/{id}` acknowledged.
- Secrets already present: `CLOUDFLARE_API_TOKEN`; zone ID hardcoded as elsewhere. No new secrets required.

### Part 3 — Admin Health tab
- New `src/pages/Admin/tabs/HealthMonitorTab.tsx`:
  - Status cards (Cache / Assets / Dev Mode / Build ID / SSR flag) with 30s `useQuery` polling of `getCacheHealth`.
  - Action buttons: Purge Cloudflare Cache, Refresh, Download Report (JSON of last 24h logs).
  - History table reading `admin_health_logs` (latest 50) via Firestore client SDK.
  - Unacknowledged `admin_alerts` list with Acknowledge button.
- Register tab in existing Admin tabs registry (same pattern as `SecurityAuditTab`).
- Sticky alert banner: lightweight component in Admin layout that subscribes to `admin_alerts` where `acknowledged == false`, shows top banner with Purge / Dismiss.

### Part 4 — Auto-monitoring & client loop breaker
- TanStack server route `src/routes/api/public/hooks/health-check.ts` (cron-callable, shared-secret via apikey header pattern from existing hooks):
  - Runs same logic as `getCacheHealth`.
  - Writes doc to `admin_health_logs` (via firebase-admin).
  - If `buildMismatch || staleChunksDetected` → call CF purge_everything; set `autoAction: 'PURGE_EXECUTED'`.
  - If `devModeOn` → insert `admin_alerts` doc severity critical.
- pg_cron job (every 5 min) calling the hook — documented in memory; user adds via Lovable Cloud SQL since this project is Firebase-only. **Note:** project uses Firebase not Supabase, so I'll instead add a Cloudflare Cron Trigger note OR use a Firebase Scheduled Function. Cleanest: add a new Firebase scheduled function `scheduledHealthCheck` in `functions/` if that folder exists; otherwise document calling the hook from existing Cloudflare worker cron. **Will check `functions/` folder existence first and choose.**
- Client loop detector: edit `src/client.tsx` — before `hydrateRoot`, run sessionStorage reload counter; if ≥3 in 60s, render emergency HTML and skip mount.

### Part 5 — Firestore schema & rules
- Add rules for `admin_health_logs` (admin read, server-only write) and `admin_alerts` (admin read+update-ack, server-only create) in `firestore.rules`.

### Constraints respected
- Reuses `requireFirebaseAdmin` middleware.
- No customer-facing surface affected (loop detector is universal but only triggers on 3 rapid reloads).
- No new top-level routes — Health lives inside existing `/admin` tab system.
- CSP/Wallid/GA4 untouched.
- Mock-data fallback if `CLOUDFLARE_API_TOKEN` missing (it's set, but defensive).

### Files touched (estimate)
- new: `src/lib/health-monitor.functions.ts`, `src/pages/Admin/tabs/HealthMonitorTab.tsx`, `src/components/admin/HealthAlertBanner.tsx`, `src/routes/api/public/hooks/health-check.ts`
- edited: `vite.config.ts`, `src/server.ts`, `src/client.tsx`, `firestore.rules`, Admin tabs registry, Admin layout (banner mount)

Approve and I'll build it in one pass.
