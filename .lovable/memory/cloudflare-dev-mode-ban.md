---
name: Cloudflare Dev Mode ban
description: Cloudflare Development Mode causes 3h blank-page cycle; admin banner + auto-off; never use it for dev work
type: constraint
---

# Cloudflare Development Mode — DO NOT USE for dev work

Dev Mode bypasses the edge cache for the WHOLE zone and auto-expires after exactly 3 hours. When it flips off, Prerender.io may serve stale bot snapshots referencing JS chunks from an older build → blank white page until next purge + recache. Confirmed root cause of the "works for ~3h then blank" bug (2026-06-23).

## Enforcement
- Admin panel shows `DevModeBanner` (src/pages/Admin/components/DevModeBanner.tsx) whenever Dev Mode is ON, with countdown + one-click "Turn off now".
- Server fns: `getDevModeStatus` / `setDevMode` in `src/lib/cloudflare-devmode.functions.ts` (admin-gated via `requireFirebaseAdmin`).
- On real deploys, `/api/public/post-publish-check` already purges CF + recaches Prerender — that path is unchanged.

## For local / staging work use instead
- `?cf-cache-bypass=1` query param
- Worker preview URL
- Lovable preview URL (bypasses CF entirely)

## How to verify off
`curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones/ed093ef4578e8e3568e26c3e979558c6/settings/development_mode"` → value: "off".
