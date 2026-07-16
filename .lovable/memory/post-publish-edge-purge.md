---
name: Post-publish scoped edge purge (NEVER purge_everything)
description: After every publish/deploy to phlabs.co.uk, purge ONLY the scoped list of HTML + feed URLs on zone ed093ef4578e8e3568e26c3e979558c6. NEVER call purge_everything — hashed /assets/* are immutable and must never be purged, otherwise users with open sessions get chunk 404 + blank page.
type: preference
---

After ANY publish/deploy to phlabs.co.uk, run a **scoped** Cloudflare edge cache purge — never `purge_everything`.

**Why not purge_everything:**
Hashed build assets (`/assets/*`, `/_build/*`) are content-hashed + `Cache-Control: public, max-age=31536000, immutable`. Wiping them from the edge makes users with an already-open page 404 on the next chunk request → blank page / infinite refresh. The workflow contract is: HTML is `no-store` at browser + CDN, hashed assets are immutable and MUST survive every deploy.

**How to apply (phlabs.co.uk zone `ed093ef4578e8e3568e26c3e979558c6`):**
```
curl -X POST "https://api.cloudflare.com/client/v4/zones/ed093ef4578e8e3568e26c3e979558c6/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":[
    "https://phlabs.co.uk/",
    "https://phlabs.co.uk/products",
    "https://phlabs.co.uk/sitemap.xml",
    "https://phlabs.co.uk/robots.txt",
    "https://phlabs.co.uk/llms.txt",
    "https://phlabs.co.uk/google-merchant-feed.xml",
    "https://phlabs.co.uk/google-merchant-feed-free.xml",
    "https://phlabs.co.uk/feed.xml"
  ]}'
```

**Legacy prohealth zone (only when the legacy proxy is touched):**
```
--data '{"files":[
  "https://prohealthpeptides.co.uk/",
  "https://prohealthpeptides.co.uk/sitemap.xml",
  "https://prohealthpeptides.co.uk/robots.txt",
  "https://prohealthpeptides.co.uk/google-merchant-feed-free.xml"
]}'
```

**Break-glass only:** the admin Cache & Recache tab has a manual `scope='all'` (purge_everything) button. Use ONLY when a genuinely poisoned asset must be evicted — never automatically.
