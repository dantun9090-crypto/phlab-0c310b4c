# /robots.txt & /sitemap*.xml cache probe

- Base: `https://phlabs.co.uk`
- Probed: **4**
- Violations: **3**
- Generated: 2026-07-08T18:57:07.002Z

| Path | Status | content-type | cache-control | cdn-cache-control | cf-cache-status | Age | OK |
|---|---|---|---|---|---|---|---|
| `/robots.txt` | 200 | `text/plain; charset=utf-8` | `public, max-age=31536000, immutable` | `-` | `DYNAMIC` | 0 | ❌ |
| `/sitemap.xml` | 200 | `application/xml; charset=utf-8` | `public, max-age=300, stale-while-revalidate=3600` | `no-store` | `DYNAMIC` | 0 | ✅ |
| `/sitemap-products.xml` | 200 | `text/html; charset=utf-8` | `public, max-age=300, must-revalidate` | `no-store` | `DYNAMIC` | 0 | ❌ |
| `/sitemap-articles.xml` | 200 | `text/html; charset=utf-8` | `public, max-age=300, must-revalidate` | `no-store` | `DYNAMIC` | 0 | ❌ |

## Violations
### ❌ `/robots.txt`
- cdn-cache-control missing — CF will apply its own cache TTL
- cache-control has 'immutable' — stale robots/sitemap will pin in browsers ("public, max-age=31536000, immutable")
- cache-control max-age=31536000 exceeds 3600s ceiling
### ❌ `/sitemap-products.xml`
- content-type "text/html; charset=utf-8" does not match /xml/
### ❌ `/sitemap-articles.xml`
- content-type "text/html; charset=utf-8" does not match /xml/