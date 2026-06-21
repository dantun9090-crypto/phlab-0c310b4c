
## Goal

Add proactive monitoring, alerting, hardened idempotency, and E2E coverage for the Wallid payment flow — without rebuilding infra you already have.

## What's already in place (won't be duplicated)

- **Per-IP rate limiting** on every Wallid endpoint (`enforceRateLimit` / `checkRateLimit`, Supabase-backed sliding window, 20/min/IP on webhooks, 5–6/min on create/cron). Adequate for protection — no Upstash needed.
- **HMAC + 300s replay window** on both `/api/webhooks/wallid` and `/api/public/hooks/wallid`.
- **Idempotency** via `wallid_webhook_events.event_id` UNIQUE index — duplicates silently skipped.
- **Atomic order transitions** via `transitionDocStatusAdmin` (snapshot isolation across webhook / status poll / reconcile cron / monitor — only one writer wins, only one email enqueued).
- **Reconcile cron** (`/api/public/hooks/wallid-reconcile`, every 5 min) and **monitor cron** (`/api/public/hooks/wallid-monitor`, every 15 min + nightly 02:00) — both already enqueue admin email on threshold breach.
- **No-store cache headers** everywhere (just shipped).
- **Manual sync card** in admin Payments tab.

## What this plan adds

### 1. `/api/public/hooks/wallid-alerts` (new, 5-min cron)

A single multi-channel alerting endpoint. Reuses existing `CLEANUP_SECRET` auth + `enforceRateLimit` pattern.

Checks each run:
- **Stuck orders** — Firestore `paymentProvider=wallid`, status in `pending_payment|processing_payment|awaiting_payment|new`, `createdAt < now-15min`. Threshold: >3 in 1h window → alert. Any `needs_review` → immediate alert (no threshold).
- **Webhook error rate** — count rows in `wallid_webhook_events` where `status='LOG'` vs total in last 10 min; supabase has the raw payloads already. >5% non-2xx → alert. (Implementation note: we'll add a small `http_status` column to the log row so this is queryable. Migration included.)
- **Rescue load** — read the last `wallid-monitor` run result (we'll persist it to `app_config` keyed `wallid:last-monitor-run`). If `reconciled+flaggedReview > 3` → alert.

Alert sinks, in order, with graceful fallback:
1. **Slack** — POST to `SLACK_PAYMENTS_WEBHOOK` (Incoming Webhook URL). Standard `text + attachments` payload as you specified.
2. **Discord** — on Slack non-2xx, POST to `DISCORD_PAYMENTS_WEBHOOK` (Discord embed format).
3. **Email** — on both failing, `enqueueMailOnce(`wallid-alert:${type}:${hourBucket}`, ...)` to `orders@phlabs.co.uk`. Already idempotent per hour.

Auto-resolution: `wallid_alert_state` Firestore doc per alert type stores `{ active, firstAlertAt, lastAlertAt, lastCount }`. When the next run sees `count=0` and prior `active=true`, fires one ✅ Resolved message and flips `active=false`.

Quiet-hours batching: counts in [3,5] queue into hourly digest (one message per hour bucket via `enqueueMailOnce`-style dedup key on the Slack side: we send the digest only if `now - lastDigestAt >= 1h`). counts >5 or `needs_review` always send immediately.

Rate-limit alerts: if the existing `wallid_rate_limits` table shows >20 blocks in 5 min from the same IP → security alert. Otherwise just logged.

### 2. Idempotency hardening

- **Composite key** — change webhook event identity from `event_id` to `${event_id}:${api_payment_id}`. Migration: add `unique (event_id, api_payment_id)` constraint, keep existing `unique(event_id)` for now to stay backward compatible during rollout. (Wallid in practice never reuses event IDs, but this is cheap defense.)
- **`wallid_webhook_duplicates`** table — every UNIQUE-violation hit logs `{ original_processed_at, duplicate_received_at, payload_summary, ip }` for audit. Both handler files updated.
- **Replay window tightened to ±300s** — already done. Added explicit reject on future timestamps >60s ahead with `webhook_timestamp_invalid`.
- **TTL cleanup** — `wallid_webhook_events` rows older than 7 days deleted by a new cron (3 AM UTC) — extends the existing `security-cleanup` hook so we don't add another endpoint.

(We won't change to a true Firestore transaction — the source of truth for idempotency is the Postgres UNIQUE index, which is already strictly serializable. A Firestore transaction here would not add safety and would slow webhook ack.)

### 3. Rate limiting

Keep existing `enforceRateLimit` (already sliding-window, Supabase-backed). Add:
- **Global flood guard** — 100/min across all IPs on each Wallid endpoint via a second `enforceRateLimit` call keyed `global:${endpoint}`.
- **IP allowlist bypass** — if `WALLID_WEBHOOK_IPS` env is set (comma-separated CIDRs/IPs), skip both rate limits AND log to `audit_logs`.

No Upstash, no BullMQ, no Cloud Tasks — the existing handlers are async, Supabase writes are durable, and Cloudflare Workers absorb bursts. Adding a queue here trades real complexity for a problem you don't have at this volume.

### 4. E2E tests

Add Playwright config + `e2e/wallid-payment.spec.ts` with the 12 scenarios you listed (a–l). Setup:
- New `playwright.config.ts`, `package.json` script `test:e2e`.
- Fixture: `e2e/fixtures/admin.ts` reuses Firebase admin to seed and clean test orders.
- `page.route('https://api.wallid.com/**', …)` to mock Wallid responses.
- CI workflow `.github/workflows/e2e.yml` runs against preview URL.

Scenarios b/c (webhook-before-redirect, redirect-before-webhook) use a helper that POSTs a signed mock webhook to the preview's `/api/public/hooks/wallid` between page steps.

### 5. Cron schedule changes (Supabase pg_cron)

```text
*/5  * * * *  wallid-alerts          (new)
*/15 * * * *  wallid-monitor         (existing — unchanged)
*/5  * * * *  wallid-reconcile       (existing — unchanged)
0    2 * * *  wallid-monitor?window=48  (existing — unchanged)
0    3 * * *  webhook-events TTL cleanup (rolled into security-cleanup)
```

## Inputs I need from you before building

These determine whether 1) Slack/Discord channels work at all and 2) which scope to actually build:

1. **Slack webhook URL** — do you have an Incoming Webhook configured for #payments (or similar)? If yes, I'll request `SLACK_PAYMENTS_WEBHOOK` via the secret tool. If no, do you want me to set up the Slack connector (`@lovable.dev` bot, posts via gateway) instead? The connector is easier — no webhook URL needed, you just authorize the workspace.
2. **Discord webhook URL** — same question. Optional; if you skip it, the chain is Slack → email.
3. **`WALLID_WEBHOOK_IPS`** — do you have the list of source IPs Wallid sends webhooks from? If not, we skip the allowlist (no behaviour change — rate limiter still allows them at 20/min/IP, which is well above real Wallid traffic).
4. **E2E scope** — Playwright pulls in 200+ MB of browsers and adds a CI job. Do you want the full 12-scenario suite, or a tighter "smoke" version (happy path + idempotency + invalid-signature + rate-limit + status-headers)? The smoke set covers ~80% of regression risk for ~20% of the maintenance cost.

## Files I'll create / change (once you confirm)

```text
NEW   src/routes/api/public/hooks/wallid-alerts.ts
NEW   src/lib/wallid-alerts.server.ts            # Slack/Discord/email fan-out
NEW   supabase/migrations/<ts>_wallid_alerts.sql # wallid_webhook_duplicates + http_status col + composite unique
EDIT  src/routes/api/webhooks/wallid.ts          # composite key + duplicates logging + global rate limit + IP allowlist
EDIT  src/routes/api/public/hooks/wallid.ts      # same as above
EDIT  src/routes/api/public/hooks/wallid-reconcile.ts  # global rate limit + IP allowlist
EDIT  src/routes/api/public/hooks/wallid-monitor.ts    # write last-run summary to app_config
EDIT  src/routes/api/public/hooks/security-cleanup.ts  # also prune webhook_events >7d
NEW   playwright.config.ts
NEW   e2e/wallid-payment.spec.ts
NEW   e2e/fixtures/admin.ts
NEW   .github/workflows/e2e.yml
EDIT  package.json                               # add @playwright/test, test:e2e script
EDIT  src/pages/Admin/tabs/PaymentsTab.tsx       # surface alert state + last run summary
```

## What I won't do (and why)

- **Upstash Redis / BullMQ / Cloud Tasks** — your runtime is Cloudflare Workers + Supabase. You already have durable rate-limiting and idempotency. Adding Upstash is a new vendor, new secret, new failure mode, for zero current benefit. If you outgrow Supabase rate-limit writes, we revisit.
- **Switching idempotency to a Firestore transaction** — the Postgres UNIQUE index is the canonical guard. Firestore transaction is weaker (eventual cross-doc) and slower.
- **Changing the existing webhook timestamp window** — already 300s past + we'll add 60s future.

---

**Please answer the 4 questions above (Slack route, Discord, IP allowlist, E2E scope) and I'll start with whichever pieces are unblocked first.**
