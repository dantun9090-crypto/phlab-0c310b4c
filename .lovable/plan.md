
# Stage 1 — Foundation (Firebase, Admin Access, Prerender Cleanup)

Only Stage 1 is planned here; Stages 2-4 follow after this one is accepted.

## Important corrections found while inspecting the project

Two parts of the brief would **break** the live admin panel if applied verbatim:

1. **Admin identity.** This project decides admin from Firestore `customers/{uid}.isAdmin === true` (see `src/pages/Admin/index.tsx` and the existing hardened `storage.rules`). There is **no** `users/{uid}` doc and **no** `request.auth.token.admin` custom claim. Deploying the proposed rules (`request.auth.token.admin == true`) would lock every admin out of Storage and cause exactly the "Permission Denied" the stage is meant to fix. Plan keeps the existing `customers/isAdmin` check.
2. **Blanket Firestore rule.** `match /{document=**} { allow read, write: if ... }` placed in `firestore.rules` would sit alongside the hardened per-collection rules and cannot be reconciled with public product reads / anonymous order creation. It also removes the deliberate guard that blocks client-side `isAdmin`/`role`/`isVip` escalation. Not adding it; admin-wide access is already granted per collection via `isAdmin()`.

## 1A. Storage rules — fix "Permission Denied"

- Keep the existing deny-by-default structure and `isAdmin()` (Firestore `customers` lookup).
- Add the two missing paths from the brief:
  - `/adverts/{allPaths=**}` — public read, admin-only image write (max 10 MB).
  - `/coa/{allPaths=**}` — authenticated read, admin-only write.
- Deploy with the existing `scripts/deploy-storage-rules.mjs` (uses `FIREBASE_SERVICE_ACCOUNT_JSON`, already wired for both buckets). No Firebase CLI needed.
- Verify admin uploads currently in use (`src/components/admin/ImageUploader.tsx`, product editor) run under an authenticated Firebase session — report any that don't rather than silently changing upload logic.

## 1B. Admin guard

- Add `src/hooks/useAdminGuard.ts` returning `{ isAdmin, loading }`:
  - waits for `onAuthStateChanged`,
  - reads `customers/{uid}` and accepts `isAdmin === true` **or** `role === 'admin'`,
  - redirects to `/` when resolved and not admin.
- Refactor `src/pages/Admin/index.tsx` to consume the hook instead of its inline copy of this logic (behaviour unchanged), and apply it to the standalone admin routes: `src/routes/admin.health.tsx`, `admin.newsletter.tsx`, `admin.purge.tsx`, `admin.audit-report.tsx`, `admin.publish-status.tsx`, `admin.merchant-feed-preview.tsx`.
- Confirm the admin sidebar renders all tab entries for an admin user; fix any conditional hiding found. No visual/layout redesign.

## 1C. Prerender + robots hygiene

- `cloudflare/phlabs-prerender.mjs`: extend the existing non-HTML/bypass lists with junk-scanner patterns — `*.php`, `/wp-*`, `/xmlrpc*`, `/.env*`, `/.git*`, `*.sql`, `*.bak`, `*.zip`, plus `/admin*` and `/api/*` (already partly covered). These return origin passthrough and never consume a Prerender.io render.
- `src/assets/robots.txt` (the real source; there is no `public/robots.txt`): add the `Disallow` lines for `/*.php$`, `/*.env$`, `/wp-`, `/xmlrpc`, `/.git` while preserving all existing blocks and AI-scraper rules.
- Sitemap: `scripts/check-sitemap-routes.ts` already gates drift; run it to confirm no junk entries — no sitemap content changes expected.

## Verification

- `bunx tsc` typecheck + production build, both 0 errors.
- Existing test gates: `e2e/prerender-quota-guards.spec.ts`, `scripts/check-decommissioned-routes.ts`, `tests/compound-robots-sitemap-hardened.test.ts`.
- Admin panel sync: note the new Storage-rule paths in the relevant admin tab per project convention.

Untouched: checkout, payments, CSP, worker cache/SWR logic, product data.
