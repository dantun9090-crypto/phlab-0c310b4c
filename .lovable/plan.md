## Status of each item

Already in the codebase — no work needed:
- `/contact` (+ /about, /privacy-policy, /shipping-policy, /refund-policy, /terms-and-conditions, /cookies, /lab-reports, /quality-control, /research, /resources) bypass prerender.io and serve direct SSR. Prerender timeout bumped 15s → 30s. (Done last turn in `src/server.ts`.)
- Sitemap already lists every static page + every Firestore product + every article (`src/routes/sitemap[.]xml.ts`).
- Product page already has BreadcrumbList JSON-LD + visual breadcrumb, Product JSON-LD, FAQ JSON-LD, Return-policy JSON-LD, "Related Products" grid.
- Article pages already emit Article JSON-LD (`src/pages/Resources/ArticlePage.tsx`).
- Footer already has Products (by category), Company (About / Quality / Resources / Lab Reports / FAQ / Contact / Storage), Legal (Terms / Privacy / Refund / Shipping / Cookies), Contact columns.
- Homepage already has a Featured Products grid + FAQPage JSON-LD; Organization & WebSite JSON-LD live in `__root.tsx`.

## What this change adds

### 1. Homepage — SEO Index block (additive, before footer)
New section component rendered after existing homepage content, so the existing hero/featured/FAQ layout is untouched. Contains three static lists in plain `<a>` tags (no JS gating — appears in raw HTML for Googlebot):
- **All Research Compounds** — direct links to all 12 product slugs.
- **Research Library** — direct links to all 28 resource article slugs.
- **About PH Labs** — `/about`, `/quality-control`, `/lab-reports`.

Implementation: new component `src/components/HomeSeoIndex.tsx`, imported once at the bottom of `src/pages/Home/index.tsx` inside the existing `<div>`. Styled with project tokens (slate-950 surface, emerald accents, slate-300 text). No restyle of any existing section.

### 2. Product page — Related Resources block (additive)
The `ARTICLE_MAP` keyword→article lookup already exists; today it's only used for a single matched article. Add a rendered "Related Research Articles" block below the existing Related Products grid that lists 1–3 matched articles with `/resources/<slug>` links and Article schema-style microcopy. Falls back to the top-3 generic articles when no keyword matches. Pure UI addition, no business logic change.

### 3. Sitemap link tag in `<head>`
Add `{ rel: "sitemap", type: "application/xml", href: "/sitemap.xml" }` to the root route's `links` in `src/routes/__root.tsx`. Adds it once for every page.

### 4. Resubmit sitemap to Google Search Console
After the deploy, call the GSC API via the connector gateway:
`PUT /webmasters/v3/sites/https%3A%2F%2Fphlabs.co.uk%2F/sitemaps/https%3A%2F%2Fphlabs.co.uk%2Fsitemap.xml`
Report status back to the user.

## What this change does NOT do (with reasons)

- **Footer overhaul to list every product + every article**: footer already covers categories, company, legal, contact. Dumping 12 product names + 28 article titles into the footer of every page would add ~3 KB to every render and clutter the design system. The homepage SEO-index block solves the "Discovered – not indexed" crawl problem more cleanly: one in-content hub page Google already crawls daily, linking out to every URL.
- **Per-URL "Request indexing" in GSC**: that action isn't exposed in the Search Console API (only `urlInspection.index.inspect` is read-only). Sitemap resubmission + new on-page internal links is the supported path; the user can click "Request Indexing" manually for any URL that still lags after the next crawl.
- **Title / description uniqueness audit**: every route file already sets its own `head().meta` via `useSEO` / `createFileRoute`. No evidence of duplicates in the current code. Out of scope for this change.

## Files touched

- `src/components/HomeSeoIndex.tsx` (new)
- `src/pages/Home/index.tsx` (import + render `<HomeSeoIndex />` once)
- `src/pages/ProductDetail/index.tsx` (add Related Resources block under existing Related Products)
- `src/routes/__root.tsx` (add `rel="sitemap"` link)
- Post-deploy: GSC sitemap resubmit via `curl` to the connector gateway.