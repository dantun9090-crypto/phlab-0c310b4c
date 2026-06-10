---
name: Cloudflare Speed Brain OFF
description: Speed Brain must stay disabled on phlabs.co.uk zone — caused blank pages in Chrome/Opera/Edge
type: constraint
---

# Cloudflare Speed Brain — keep DISABLED

Speed Brain on the `phlabs.co.uk` zone (`ed093ef4578e8e3568e26c3e979558c6`) MUST stay off.

## Why
Speed Brain injects a `speculation-rules: prefetch /*` header (Speculation Rules API, eagerness: conservative). Only Chromium browsers (Chrome, Opera, Edge) honour it — Firefox ignores it.

Combined with HTML `cache-control: max-age=300, stale-while-revalidate=86400`, Chromium prefetched stale/broken HTML into its prerender cache and served that on navigation → **blank pages in Chrome/Opera/Edge, while Firefox worked fine**.

## How to verify it's off
```bash
curl -sI https://phlabs.co.uk/ | grep -i speculation-rules
```
Should return nothing. If header reappears → Speed Brain got re-enabled.

## How to disable again (if regressed)
```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/ed093ef4578e8e3568e26c3e979558c6/settings/speed_brain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value":"off"}'
```

## Do NOT re-enable
Even if Cloudflare suggests it as a "speed improvement". The current HTML caching + service worker setup is incompatible with speculative prefetch.
