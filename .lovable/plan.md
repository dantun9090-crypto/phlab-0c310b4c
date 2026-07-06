# End-to-end cache fix — no more "need Dev Mode after publish"

## Diagnosis (what's actually broken)

Live headers on `phlabs.co.uk/` right now:

```
cf-cache-status: DYNAMIC
cache-control: public, max-age=0, must-revalidate
cdn-cache-control: public, max-age=60, stale-while-revalidate=60
```

So HTML lives in Cloudflare's edge for **60s fresh + 60s stale-while-revalidate = up to ~2 min of stale HTML per POP** after a publish. That stale HTML references the previous build's hashed JS/CSS chunks; when those chunks 404, the app blanks until you flip Dev Mode (which bypasses cache entirely). That's the "I need Dev Mode" symptom.

Three concrete failures compound it:

1. **Purge fires before Lovable's new Worker is live.** `.github/workflows/post-deploy-purge.yml` triggers on `push to main` and waits only 30s. Lovable's publish → Worker version propagation is decoupled from the git push and often takes longer. The purge runs against the OLD worker → CF re-caches the OLD HTML → 60s+60s stale window restarts.
2. **Lovable "Publish" button does not push to main.** Publishing from the Lovable UI deploys the Worker directly; it does NOT always trigger the GitHub `push` event that fires the purge workflow. So publishes done from the editor get zero automatic purge.
3. **No build-id gate on cached HTML.** Nothing invalidates the edge object when a new build ID lands — CF happily serves the old HTML until its TTL expires.

Dev Mode "fixes" it only because Dev Mode = 3-hour full bypass. That's not a fix, it's a workaround that also kills performance for everyone.

## The fix (four changes, all safe)

### 1. Trigger the purge from the Worker itself, after each deploy
Add a tiny `scheduled`/first-request hook in `src/server.ts` that compares the running `BUILD_ID` against a KV/D1 or in-memory "last purged build" and, on mismatch, POSTs `purge_everything` to the CF API using `CF_API_TOKEN` + `CF_ZONE_ID` bindings. This runs the moment the new Worker version serves its first request — which is the only reliable "new deploy is live" signal. No dependency on git push.

### 2. Also keep the GitHub workflow, but harden it
- Trigger on `workflow_dispatch` AND `push`, AND on `repository_dispatch: lovable-publish` for editor publishes.
- Bump the wait from 30s → 90s (Lovable propagation p95).
- After purge, poll `/` for `cf-cache-status: MISS` on a fresh URL to confirm the new Worker is serving before exiting.

### 3. Shrink the HTML edge window from 60+60s to 30+0s until the build-id hook proves stable
In `src/server.ts` around line 669, change:
```
public, s-maxage=60, max-age=0, stale-while-revalidate=60
```
to:
```
public, s-maxage=30, max-age=0
```
(no SWR on HTML). Worst case stale window drops from ~2 min to 30 s per POP. Once (1) is deployed and verified, the s-maxage can go back up.

### 4. Chunk-404 self-heal (belt and braces)
Add a `window.addEventListener('error', ...)` in `src/client.tsx` that, on a `<script>`/`<link>` load failure whose URL matches `/assets/*-<hash>.(js|css)`, does ONE hard reload with `location.replace(location.href + (hasQuery ? '&' : '?') + '__cb=' + Date.now())`. Guard with `sessionStorage` so it can only fire once per session — prevents refresh loops. This means even if edge serves stale HTML for a few seconds, users self-recover instantly instead of seeing a blank page.

## What this gives you

- Publish from Lovable editor → Worker's first request auto-purges → next visitor gets fresh HTML in <5s, no manual action.
- Publish via git push → GitHub workflow ALSO purges as a safety net.
- Even if a visitor lands during the tiny window before purge completes, chunk 404 → one silent reload → fresh page.
- **Dev Mode never needs to be touched again.** (And per `mem://cloudflare-dev-mode-ban`, it must stay off.)

## Files touched

- `src/server.ts` — build-id purge hook + HTML TTL 60→30, drop HTML SWR.
- `src/client.tsx` — chunk-404 self-heal listener.
- `.github/workflows/post-deploy-purge.yml` — 30s→90s wait + `repository_dispatch` trigger + post-purge MISS probe.
- New secret binding on the Worker: `CF_API_TOKEN` + `CF_ZONE_ID` (already available in GitHub secrets — I'll wire them into `wrangler.jsonc` via `secrets:put`).

## Not changing

- CSP / nonce logic.
- Static asset caching (`immutable`, 1yr) — that's correct.
- `sw.js` / `service-worker.js` no-store rules.
- Prerender.io path for bots.

Approve and I'll ship all four in one pass.
