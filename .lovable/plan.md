## Scope

Six related tasks across Admin tooling, the `/compound` landing page, and CI.

---

### 1. Admin → Email Campaign (Adverts): professional redesign

File: `src/pages/Admin/tabs/` (locate the existing Email Campaign / Adverts tab — likely `EmailCampaignsTab.tsx` or `MarketingAdvertsTab.tsx`; read first).

- Keep all existing fields, logic and Firestore writes — visual polish only.
- New layout: gradient header band with PH Labs logo + tab title, slate-950 background, slate-900 cards with `border-2 border-slate-700`, emerald accent buttons.
- Each campaign/advert rendered as a structured card with: logo/thumbnail slot, title, offer badge (discount %, "NEW", "LIMITED"), preview snippet, status pill (Draft / Scheduled / Sent), CTA row.
- Section dividers for: Active offers, Scheduled, Drafts, Sent (collapsible).
- Live email preview pane (right column on desktop, below on mobile) rendering subject + body in a mock email frame.
- Admin form rules preserved: real `<input>`/`<textarea>`, `border-2 border-slate-600`, `bg-slate-800`, white text, `min-h-[48px]`, `rounded-lg`.

### 2. Admin Incidents: resolve / dismiss with audit trail + notes

File: `src/pages/Admin/tabs/ResearchIncidentsTab.tsx` + new server fn `src/lib/research-incidents.functions.ts` (extend).

- New per-row actions: **Resolve**, **Dismiss**, both opening a small modal that requires an optional note (textarea).
- Server fn `resolveResearchIncident({ id, action: 'resolved'|'dismissed', note })`:
  - `.middleware([requireSupabaseAuth])` + admin role check via `has_role`.
  - Writes Firestore: `errorEvents/{id}` → `{ status, resolvedBy, resolvedAt, note }`.
  - Appends audit entry in `auditLogs/{autoId}` with `{ adminUid, action: 'incident.resolve'|'incident.dismiss', target: id, before, after, ip, timestamp }`.
- UI: status pill column (Open / Resolved / Dismissed). Resolved/Dismissed rows hidden by default behind a "Show closed" toggle. Drawer shows audit history (who/when/note).
- Snooze alert logic ignores closed incidents when computing `overlayActive`.

### 3. Admin Incidents: export selected rows as JSON / CSV

Same file.

- Add a leading checkbox column + "Select all on page" header checkbox.
- Toolbar shows `{n} selected · Export JSON · Export CSV · Clear`.
- JSON export: array of full incident objects including parsed `details` payload.
- CSV export: flat columns (`id,createdAt,type,path,message,userAgent,ip,referrer,status,resolvedBy,resolvedAt,note,detailsJson`) — `detailsJson` kept as escaped string so CSV stays one row per incident.
- Pure client-side blob download (`URL.createObjectURL`) — no server round-trip.

### 4. Admin Incidents: search + advanced filters

Same file.

- Existing type filter kept, plus:
  - Free-text search box (matches `path`, `message`, `userAgent`, `referrer`, `detailsJson`).
  - Timeframe select: Last 1h / 24h / 7d / 30d / All.
  - "Route" select populated dynamically from incidents (e.g. `/research`, `/compound`).
  - "Detected marker" select populated from `details.marker` values when present.
- All filters compose with current type filter and "Show closed" toggle. Filter state stored in component state (not persisted) — counts updated live.

### 5. `/compound` premium polish (no structural changes)

File: `src/components/PremiumLanding.tsx` (the `/compound` route mounts this).

- Keep markers (`data-source="premium-landing"`), keep both "For Research Use Only" disclaimers and "Back to homepage" CTA — visual tests depend on them.
- Hero: full-bleed dark gradient backdrop with subtle molecular SVG layer + soft emerald glow; large editorial serif/display H1 with blur-in reveal; thinner kicker line above eyebrow.
- Section additions (visual only, all server-rendered, no new business logic):
  - Trust strip: ISO-style icons (HPLC ≥ 99%, COA Available, UK Dispatch, Discreet Packaging).
  - Three-up "Why PH Labs" cards with iconography and emerald hairline borders.
  - Quality-control timeline (synthesis → HPLC → MS → COA → dispatch).
  - Quiet CTA band before the legal footer.
- Typography: pair existing display font with a refined body; tighten leading on H1; use `text-balance` on headings.
- Motion: one hero reveal + scroll-triggered fade-up on sections (respect `prefers-reduced-motion`). No carousels, no autoplay video.
- Tokens: any new colour/gradient/shadow added to `src/styles.css` as semantic tokens — no hardcoded hex in JSX.

### 6. Periodic visual baseline workflow for `/research`

Already exists: `.github/workflows/visual-baseline-research.yml` (created earlier). Audit only — if missing the same Monday-06:30-UTC schedule + `update_snapshots` dispatch + auto-issue creation that `visual-baseline-compound.yml` has, bring it to parity. No new file expected unless drift is found.

---

## Technical notes

- All Admin changes stay in the existing tab file + server-fn module; no new top-level routes.
- Firestore writes go through `createServerFn` with `requireSupabaseAuth` + admin gate; never trust client `isAdmin`.
- CSV builder handles quote-escaping and newline-in-field safely.
- Premium landing must keep all `[data-source="premium-landing"]` markers and the existing `PremiumLandingGuard` so `e2e/compound-overlay.spec.ts` and `e2e/compound-smoke.spec.ts` keep passing.
- After edits, re-run: `bunx vitest run tests/research-route-source.test.ts` + read `e2e/compound-*.spec.ts` to confirm no marker drift.

Confirm to proceed and I'll implement all six in one batch.
