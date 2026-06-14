## Website Check Plan — phlabs.co.uk

A read-only audit pass. No code changes in this step — I'll report findings and propose fixes for your approval.

### 1. SEO scan (automated)
- Trigger a fresh SEO review (`seo_chat--trigger_scan`) — runs ~1 min, results land in the SEO tab.
- Pull current findings (`seo_chat--list_findings`) for the failing + ignored set so I can summarise here too.

### 2. Live-site health checks
For both `https://phlabs.co.uk` and `https://www.phlabs.co.uk`:
- HTTP status + redirect chain (apex should serve 200; www → 301 → apex).
- Response headers: `Cache-Control`, `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Robots-Tag`.
- `/robots.txt` — confirm correct disallows + sitemap URL.
- `/sitemap.xml` — confirm valid XML, base URL is apex, product URLs present.
- `/sw.js` + `/service-worker.js` — confirm `no-store` + cache-bypass still wired.
- Prerender path — curl with `Googlebot` UA and confirm prerendered HTML (not blank shell).
- Home + one product page — check `<title>`, `<meta description>`, canonical, og:url all point to apex.

### 3. SEO snapshot via Semrush (UK database)
- Domain overview: organic keywords, est. traffic, authority score, backlinks.
- Top organic keywords currently ranking.
- Compare against the rebuild plan baseline (1 keyword / ~0 visits from last check).

### 4. Deliverable
A single report grouped into:
- **Critical** (broken / blocking indexing or revenue)
- **High** (SEO / compliance / perf wins)
- **Medium** (polish)
- **Already good** (confirmed working)

Each item gets: what's wrong, why it matters, exact fix. You pick which to action and I implement in the next turn.

### What I will NOT do in this step
- No code edits.
- No publishing.
- No design / layout changes.
- No new products or content.

Approve and I'll run the checks.