
## Goal

Lock down the regressions that just bit us (`/compare/*` getting silently `noindex`'d, `/research` canonical bleeding into pillar pages) with automated checks that fail the build, and make production crawl results visible directly in the PR / Actions UI.

## 1. Canonical uniqueness check

New script: `scripts/check-canonicals.mjs`

- Crawls the same URL set as `scripts/check-prod-routes.mjs` (critical list + every `<loc>` in `/sitemap.xml`).
- For each URL, GETs the HTML and asserts:
  - Exactly **one** `<link rel="canonical">` tag.
  - Its `href` is absolute, on `https://phlabs.co.uk`, and equals the fetched URL (ignoring trailing slash + query allowlist `?utm_*`).
  - `og:url` (if present) matches the canonical.
- Output: per-URL OK / FAIL with the offending hrefs.
- Exit 1 on any failure.
- Wire into `package.json` as `check:canonicals` and add a step to `.github/workflows/post-deploy-regression.yml` right after the prod-routes step.

## 2. Robots / noindex validation

Extend `scripts/check-prod-routes.mjs` (don't fork — same crawl, more assertions):

- A URL may carry `x-robots-tag: noindex` or `<meta name="robots" content="noindex">` **only if** the response status is 404 OR is a 3xx redirect (checked with `redirect: "manual"` first pass).
- All other URLs with noindex → FAIL (this is exactly the `/compare/*` regression class).
- Sitemap URLs may never be noindex regardless of status (existing rule, keep).
- Emit a structured JSON report at `/tmp/prod-routes-report.json` with `{url, status, xRobots, metaRobots, verdict}` rows for the next step to consume.

Also tighten `src/server.ts`: the SSR-sentinel logic already added (`<meta name="prerender-status-code" content="404">`) is the only path that may inject the `x-robots-tag: noindex` header. Add an inline comment + a unit test in `tests/post-deploy-regression.test.ts` asserting a known-good route (e.g. `/compare/bpc-157-vs-tb-500`) is **not** stamped noindex.

## 3. Publish results as artifact + PR summary

Update `.github/workflows/post-deploy-regression.yml`:

- New step after prod-routes + canonicals: render `/tmp/prod-routes-report.json` into a Markdown table (failures first, then a collapsed `<details>` with the full pass list) and append to `$GITHUB_STEP_SUMMARY`.
- Upload `prod-routes-report.json`, `prod-routes.log`, and `canonicals.log` as a single artifact `route-audit-${{ github.sha }}` (retention 30 days).
- On `pull_request` events: post/update a sticky PR comment with the same Markdown table (using `actions/github-script` + comment marker `<!-- route-audit -->`). On `push`/`schedule` just rely on the step summary.

## 4. Staging route checker (release gate)

New workflow: `.github/workflows/pre-release-route-check.yml`

- Triggers: `workflow_dispatch` (manual) + `pull_request` targeting `main` with paths affecting `src/routes/**`, `src/server.ts`, `src/lib/known-roots.ts`, `cloudflare/worker.js`, `wrangler.jsonc`.
- Runs `BASE=https://id-preview--1f12c255-a30a-4bea-bbab-28d9e6f70804.lovable.app node scripts/check-prod-routes.mjs` + `node scripts/check-canonicals.mjs` against the preview/staging URL.
- Uses the same artifact + PR-comment renderer as step 3 (comment marker `<!-- staging-route-audit -->` so it doesn't clobber the prod one).
- Fails the job (and therefore blocks merge if branch protection requires it) on any non-200, unauthorized noindex, or canonical violation.
- Includes the same 60s edge-propagation wait used in the post-deploy workflow.

## Files

**New**
- `scripts/check-canonicals.mjs`
- `scripts/render-route-audit-md.mjs` (shared Markdown renderer used by both workflows)
- `.github/workflows/pre-release-route-check.yml`

**Edited**
- `scripts/check-prod-routes.mjs` — noindex policy + JSON report output
- `.github/workflows/post-deploy-regression.yml` — canonicals step, artifact, PR summary
- `package.json` — `check:canonicals`, `check:routes:staging` scripts
- `src/server.ts` — inline doc comment on the sentinel-only noindex path
- `tests/post-deploy-regression.test.ts` — assert no spurious noindex on `/compare/*`

## Out of scope

- No changes to product behavior, UI, route components, or the worker's request handling itself beyond comments + the existing sentinel logic.
- No changes to sitemap contents.
