---
name: Prerender.io access
description: Token, Worker integration, timeout, recache API, verification commands
type: reference
---
Token: `PRERENDER_TOKEN` (Cloudflare Worker secret on `phlabs-prerender`, also in project secrets).
Integration: `phlabs-prerender` Worker on `phlabs.co.uk/*` proxies bot UAs (regex includes googlebot, bingbot, facebookexternalhit, twitterbot, prerender, lighthouse, headlesschrome…) to `https://service.prerender.io/<full-url>` with `X-Prerender-Token` header.

**Timeout: 45s** (bumped 2026-06-08 from 25s). Fresh uncached homepage prerenders take ~18s; old 25s caused `AbortError` → origin SSR fallback.

On success the Worker adds:
- `x-prerendered: true`
- `x-phl-via: prerender`
- `cache-control: public, max-age=3600, stale-while-revalidate=86400` (if prerender didn't set one)

On failure: `x-phl-via: origin-bot-fallback;pre=<status>;err=<errName>` — diagnose without redeploying.

Verified 2026-06-08: Googlebot GET / → 62ms `cf-cache-status: HIT` + `x-prerendered: true`. Human GET first-hit 1.1s SSR, subsequent 70-80ms (CF edge cache via `cf.cacheEverything` in Worker subrequest).

**Note**: `curl -I` (HEAD) bypasses prerender (Worker requires GET) — always test with `curl -s -D - -o /dev/null -A 'Googlebot/2.1' https://phlabs.co.uk/`.

Recache hook: `POST /api/public/hooks/prerender-recache?force=1` (admin → Prerender Status tab → Auto-recache).
