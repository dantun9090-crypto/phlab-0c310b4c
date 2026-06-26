## Why a plan (and not just code)

You picked the three highest-risk options:

1. **Rename canonical Firestore slugs** — touches the live `products` collection plus every `orders`, `inventory`, `landing_pages`, `articles`, `product_stock` doc that references those slugs.
2. **Keep A/B dual entries** — 26 GMC offers need renumbering to `PHL1A/PHL1B … PHL13A/PHL13B`, each with a new `/products/phl-Nx` URL and 301s from every old alias.
3. **Strip "peptide / purity / compound" site-wide** — hundreds of hits across product names, article bodies (e.g. "43-residue peptide fragment"), SEO descriptions, redirect tables, code identifiers (`descriptionForCompound`, `purityForSize`), comments, sitemap entries, and admin labels.

Done in one shot this *will* break the live shop (orders reference slugs, Firestore docs are keyed by slug, scientific articles become nonsense if "peptide" is blindly removed). Below is the safe execution order. Each phase ships independently and is reversible.

---

## Phase 1 — Catalog rename map (code only, no Firestore writes)

Single source of truth in `src/lib/phl-catalog.ts`:

```text
PHL1  retatrutide-research-peptide       10 mg   phl-1a  phl-1b
PHL2  retatrutide-research-peptide       20 mg   phl-2a  phl-2b
PHL3  bpc-157                            10 mg   phl-3a  phl-3b
PHL4  ghk-cu-research-peptide            50 mg   phl-4a  phl-4b
PHL5  mots-c-research-peptide            10 mg   phl-5a  phl-5b
PHL6  tb-500-thymosin-beta-4             10 mg   phl-6a  phl-6b
PHL7  pt-141-research-peptide            10 mg   phl-7a  phl-7b
PHL8  nad-research-compound             100 mg   phl-8a  phl-8b
PHL9  nad-research-compound             500 mg   phl-9a  phl-9b
PHL10 nad-research-compound            1000 mg   phl-10a phl-10b
PHL11 melanotan-ii-research-peptide      10 mg   phl-11a phl-11b
PHL12 klow-blend                         80 mg   phl-12a phl-12b
PHL13 kpv-research-peptide               10 mg   phl-13a phl-13b
PHL14 glow-blend                         70 mg   phl-14a phl-14b
PHL15 bacteriostatic-water-…             10 ml   phl-15a phl-15b
```

`merchant-dual-entries.ts` is rewritten from this table — no more per-product `phlCode`/`linkA`/`linkB` literals.

## Phase 2 — GMC feed rewrite (deploy alone, verify in Merchant Center)

In `src/routes/google-merchant-feed[.]xml.ts`:

- IDs → `PHL{N}A` / `PHL{N}B`.
- Titles → exact strings you gave (Entry A); Entry B gets a parallel "Laboratory Reference Standard" variant so A/B stay distinct.
- Description → `For laboratory and analytical research only. Strictly for in-vitro scientific testing and reference standards. Technical specification: CAS Number: <cas>.`
- `<g:product_type>` → `Research Materials`. Category 6975 stays.
- Brand / Condition / Availability / Currency / Promotion ID per spec.
- Four `<g:product_highlight>` lines per offer.
- Strip "peptide / purity / compound" from all generated strings via a `sanitiseFeedText()` helper; assert in `tests/google-merchant-feed.test.ts` that the rendered XML contains none of those tokens.

## Phase 3 — Public URL aliases + 301s (no Firestore touch yet)

- `src/routes/products_.$slug.tsx`: alias resolver maps `phl-Na`/`phl-Nb` → canonical Firestore slug, renders in place with HTTP 200, canonical tag `= /products/phl-Na`, H1 + `<title>` = the matching GMC title.
- `src/lib/legacy-redirects.ts`: 301 every old alias (`reta-10-phl`, `retatrutide-10mg-phl`, `bpc-10-phl`, `h3n8wp`, `v9r4tb`, `z2j5fd` …) → new `phl-Nx` URL. Old canonical paths (`/products/retatrutide-research-peptide`) also 301 → `/products/phl-Na`.
- Sitemap regenerated from the rename map; `bing-feed.xml` aligned.
- After this phase the new URLs are live and Merchant Center can re-crawl.

## Phase 4 — Firestore canonical-slug migration (manual approval gate)

Run via a one-off admin server function (`firebase-admin`, your existing `FIREBASE_SERVICE_ACCOUNT_JSON`):

1. Snapshot `products`, `product_stock`, `orders`, `inventory`, `landing_pages`, `articles` to `/mnt/documents/firestore-backup-<ts>.json`.
2. For each product doc: write a new doc with id `phl-Na`, copy fields, add `legacySlug` + `phlCode`. Mark the old doc `archived:true` but don't delete (orders still reference it).
3. Update `product_stock` keys.
4. Backfill `orders.productSlug` with `phl-Na` mapping kept in a translation table; old order docs remain readable.
5. Switch `ProductDetail` lookup to prefer `phl-N` and fall back to `legacySlug`.

This phase is destructive — I'll surface it as a dry-run first, you approve, then we run it for real.

## Phase 5 — Site-wide banned-word scrub

Two passes, both gated by an allow-list because blanket regex destroys legitimate scientific copy:

**Pass A — user-visible text (auto):**
- Strip from product titles/descriptions, category hub copy, navigation labels, sitemap, JSON-LD, SEO overrides, admin UI labels, email templates.
- Replace `purity` → `grade`, `compound` → `material`/`preparation` per your map.
- Skip strings inside `articles/**` body content that match scientific phrasing patterns (`\d+-residue peptide`, `peptide bond`, `peptide hormone`) — replacing those makes the article wrong. Those get a manual review queue surfaced in Admin → Content Audit.

**Pass B — identifiers & comments (manual review):**
- Rename `descriptionForCompound` → `descriptionForMaterial`, `purityForSize` → `gradeForSize`, etc., in a single mechanical refactor commit.
- Comments touched in the same commit.

**Articles collection (Firestore + `src/pages/Resources/data/articles.ts`):**
- 14 articles need title/slug/body rewrites. I'll generate proposed rewrites into `/mnt/documents/article-rewrites.md` for your sign-off before writing back.

## Phase 6 — Verification

- `bun run typecheck` + `bun run build`.
- `tests/google-merchant-feed.test.ts` asserts: no banned token in rendered XML, every offer has the 4 highlights, IDs match `^PHL\d+[AB]$`.
- `scripts/crawler-smoke.ts` extended to GET every new `phl-Nx` URL with Googlebot UA → expect 200, no `noindex`, H1 matches feed.
- Playwright run against localhost for `/products/phl-1a` and `/products/phl-1b` — screenshot + title assertion.
- Cloudflare purge + Prerender recache for the 30 new URLs.

---

## What I need from you to start

**Approve this plan, and confirm Phase 4 (Firestore canonical rename) — the rest I can ship in sequence without further prompts.** If you'd rather keep Firestore slugs untouched (Phase 4 skipped), the public site still ends up at `/products/phl-Nx` via aliasing and you avoid all order/inventory risk — say the word and I'll drop Phase 4.

Estimated turns: Phase 1+2+3 in one batch, Phase 4 in its own turn (with dry-run diff), Phase 5 in two turns (auto pass, then article rewrites for your review), Phase 6 in one turn.