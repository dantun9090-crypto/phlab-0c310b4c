## Goal

Run Firebase and Supabase side-by-side. Nothing currently on Firebase moves. Supabase becomes the home for new content + analytics features.

## Responsibility split (the rule of thumb)

| Domain | Database |
|---|---|
| Auth (login, register, sessions, anon) | **Firebase** |
| Orders, payments, cart, invoices | **Firebase** |
| Products, coupons, inventory | **Firebase** (already there) |
| Customers / user profiles | **Firebase** |
| Blog / Resources / Articles content | **Supabase** |
| SEO metadata, sitemap data, redirects | **Supabase** |
| Analytics events, page views, funnels | **Supabase** |
| Email logs, contact form submissions, audit trail | **Supabase** |
| Banners / landing page CMS content | **Supabase** |

Rule: if it touches money, auth, or an existing Firestore collection → Firebase. If it's new content or telemetry → Supabase.

## Step 1 — Enable Lovable Cloud

Provision a new Supabase project via Lovable Cloud. This auto-injects:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (browser)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server)
- Generates `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`

No Firebase config changes. `src/lib/firebase.ts` and `src/lib/firebase-auth.ts` stay untouched.

## Step 2 — Add a thin DB-selection helper

New file `src/lib/db.ts` — a single import surface so feature code is explicit:

```ts
// Firebase — auth + transactional
export { db as firebaseDb, auth } from '@/lib/firebase';
// Supabase — content + analytics (browser)
export { supabase } from '@/integrations/supabase/client';
```

Convention doc at the top of the file listing the responsibility table above, so future edits stay consistent.

## Step 3 — Server access

- Browser: import `supabase` from `@/integrations/supabase/client` for RLS-scoped reads/writes (anonymous content reads, analytics inserts).
- Server: use `createServerFn` + `requireSupabaseAuth` for user-scoped writes; use `supabaseAdmin` from `client.server.ts` only for admin/maintenance.
- Register `attachSupabaseAuth` in `src/start.ts` `functionMiddleware` so bearer tokens flow to protected server fns.

No changes to existing Firebase data flow in `Home`, `Checkout`, `Payment`, `Admin`.

## Step 4 — Worked examples (delivered as `docs/dual-database.md`)

Four short, copy-pasteable snippets:

1. **Firebase read/write** (existing pattern — orders): `addDoc(collection(firebaseDb, 'orders'), …)`.
2. **Supabase read (browser)** — fetching blog posts: `supabase.from('articles').select('*').eq('published', true)`.
3. **Supabase write (browser)** — analytics event: `supabase.from('analytics_events').insert({ type, path, ts })`.
4. **Supabase server fn** — admin-only content publish via `createServerFn` + `supabaseAdmin`.

Plus a "which DB?" decision flowchart in the same doc.

## Step 5 — Seed Supabase with two starter tables (so it's "ready to use")

Schema migration creating:
- `articles` (id, slug, title, body, published, created_at) — RLS: public read where `published=true`, admin write.
- `analytics_events` (id, type, path, user_agent, created_at) — RLS: public insert, admin read.

These are minimum demos showing the pattern. No existing pages are rewired to Supabase — they only get used when you ask for the blog/analytics features.

## What does NOT change

- Header, footer, layout, design tokens — untouched.
- Firebase Auth guard (`RequireAuth`) — untouched.
- All existing pages, admin tabs, Firestore collections — untouched.
- No Firebase → Supabase migration of any kind.

## Files to be created/edited

**Created**
- `src/lib/db.ts` (selector + rule-of-thumb doc)
- `docs/dual-database.md` (examples + decision guide)
- Supabase migration: `articles`, `analytics_events` + RLS
- `src/lib/content.functions.ts` (one example server fn)

**Edited (minimal)**
- `src/start.ts` — append `attachSupabaseAuth` to `functionMiddleware` (if not already)
- `.env-like injection` — handled automatically by Lovable Cloud

**Untouched**
- All Firebase files, all existing pages, all admin tabs.
