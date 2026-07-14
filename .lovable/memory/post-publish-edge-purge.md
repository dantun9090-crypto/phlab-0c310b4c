---
name: Post-publish full edge purge
description: After every publish/deploy to phlabs.co.uk, immediately run a full Cloudflare edge cache purge (purge_everything) on zone ed093ef4578e8e3568e26c3e979558c6 without asking.
type: preference
---

After ANY publish/deploy to phlabs.co.uk, automatically run a full Cloudflare edge cache purge.

**How to apply:**
```
curl -X POST "https://api.cloudflare.com/client/v4/zones/ed093ef4578e8e3568e26c3e979558c6/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

**Why:** User has repeatedly hit stale-cache issues after deploys (blank pages, old assets, refresh loops). Always purge proactively after publish — do not wait for a complaint.
