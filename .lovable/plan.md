## What's in the upload

A ~214-file Vite + React 19 ecommerce/research-peptides app:
- **Routing:** `react-router-dom` v7, pages under `src/pages/*/index.tsx` (Home, About, Account, Admin with ~20 tabs, Products, ProductDetail, Checkout, Payment, Calculator, Resources, Research, Login/Register, many policy pages, etc.)
- **Backend:** Firebase (Firestore, Auth, Storage) is the primary data layer (`src/lib/firebase.ts` ≈ 39 KB); a thin `supabase.ts` stub also present
- **Other heavy deps:** `@react-three/fiber` + `drei` + `three`, `framer-motion`, `@stripe/stripe-js`, `react-helmet-async`, `jszip`
- **Custom infra in `main.tsx`:** CLS prevention, prerender.io readiness flag, dynamic GA/Plausible injection from Firestore, `ThemeProvider` context

The current Lovable project is the empty TanStack Start template (file-routes under `src/routes/`, Tailwind v4, no Firebase, no Three.js, no Stripe, no React Router).

## Why a full one-shot port isn't realistic

The two stacks differ in ways that touch nearly every file:

| Concern | Uploaded app | This template |
|---|---|---|
| Router | `react-router-dom` (`<Routes>`, `useNavigate`, `Link`, `useParams`) | TanStack Router (`createFileRoute`, typed `<Link to>`) |
| Page location | `src/pages/Foo/index.tsx` | `src/routes/foo.tsx` (flat dot-separated) |
| Head/SEO | `react-helmet-async` `<Helmet>` | `head()` option on each route |
| Backend | Firebase (Firestore/Auth/Storage) | Lovable Cloud / Supabase (no Firebase available) |
| CSS | Tailwind v3 + `tailwind.config.ts` + 44 KB `index.css` | Tailwind v4 via `@import` in `src/styles.css` |
| Entry | custom `main.tsx` with CLS / prerender / analytics | `src/start.ts` + `__root.tsx` shell |

Almost every page imports `react-router-dom` and Firebase, so every page needs touch-ups. Doing all 30+ pages, the 20-tab Admin, Three.js scenes, Stripe checkout, Firestore data models, and the 44 KB stylesheet in one turn would almost certainly produce a broken build.

## Recommended approach — phased port

I'll do it in stages, verifying the build at each step. Please pick the scope below.

### Phase 1 — Foundation (always)
1. Install missing deps the template doesn't have: `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `@stripe/stripe-js`, `jszip`, `three`, `@react-three/fiber`, `@react-three/drei`. Skip `react-router-dom` and `react-helmet-async` (replaced by TanStack equivalents). Skip `firebase` initially — see Phase 3.
2. Port the design system: translate `tailwind.config.ts` + the relevant tokens from the old `index.css` into `src/styles.css` (Tailwind v4 `@theme` + `oklch` tokens).
3. Bring over presentational components that don't need routing or Firebase: `Logo`, `SocialIcons`, `ErrorBoundary`, `ScrollToTop`, `CookieConsent`, `MolecularBackground`, `AnimatedBackground`, `UnderConstruction`, `Layout`, `Navigation` (with `react-router-dom` → TanStack `<Link>` rewrite).
4. Set up `__root.tsx` with the shared layout (Navigation + footer + Outlet) and port `ThemeContext`.

### Phase 2 — Public pages
Convert each `src/pages/<Name>/index.tsx` to `src/routes/<name>.tsx` with `createFileRoute` and a `head()` block, rewriting `useNavigate`/`Link`/`useParams` and `<Helmet>` calls. Pages I'd port in this phase:
Home, About, Contact, Products, ProductDetail (`/products/$slug`), CategoryPage, Search, Calculator, Resources + ArticlePage, Research, LabReports, QualityControl, StorageGuide, LandingPage, VipStore, Privacy/PrivacyPolicy, Terms/TermsOfService, ShippingPolicy, RefundPolicy, CookiePolicy, NotFound.

### Phase 3 — Backend decisions (need your input)
The uploaded app is deeply tied to Firebase. Options:

- **A. Keep Firebase as-is.** Add `firebase` package, port `src/lib/firebase.ts`, mark all Firebase calls as client-only (Firebase SDK doesn't run in the Cloudflare Worker SSR runtime — need `'use client'`-style guards / dynamic imports). Login/Register/Account/Admin/Checkout keep working against your existing Firebase project. **Fastest path to a working port.**
- **B. Migrate to Lovable Cloud (Supabase).** Enable Lovable Cloud, recreate Firestore collections as tables with RLS, rewrite all `firebase.ts` calls. **Much larger effort — effectively a rebuild of the data layer.** Recommend only if you want to leave Firebase behind.
- **C. Skip backend pages for now.** Port only the public/marketing pages in Phase 2 and stub Login/Register/Account/Admin/Checkout. Decide on backend later.

### Phase 4 — Auth-gated areas (depends on Phase 3)
Login, Register, Account, Admin (20 tabs), Checkout, Payment. Admin alone is ~25 files and may need its own follow-up turn.

## Technical notes

- `src/pages/Home/index.tsx` is 63 KB and `src/pages/Account/index.tsx` is 78 KB — they likely need to be split into smaller route + component files during the port (current files exceed comfortable single-file edits).
- `react-helmet-async` is banned in this template — every `<Helmet>` becomes a `head()` entry on its route.
- `tailwindcss-animate` and the v3 config style won't map 1:1 to Tailwind v4; I'll translate the tokens you actually use.
- Three.js / R3F work fine in the browser but must be client-only (dynamic import or guard against SSR).
- `react-router-dom` will NOT be installed — every `Link`, `NavLink`, `useNavigate`, `useParams`, `useLocation`, `Outlet` import is rewritten to `@tanstack/react-router`.
- `main.tsx` customizations (CLS, prerender flag, GA/Plausible injection) move into `__root.tsx` inside a client-only effect.

## What I need from you before I start

1. **Backend choice (Phase 3):** A (keep Firebase), B (migrate to Lovable Cloud), or C (skip auth pages for now)?
2. **Scope of this first turn:** just Phase 1, Phase 1+2, or push through Phase 1+2+3 in one go (will take a while and may need follow-ups)?
3. **Anything to drop?** Anything in the file list you do NOT want ported (e.g. specific Admin tabs, Three.js intro, calculator, VIP store)?

Once you answer I'll execute. If you'd rather I just dive in, I'll default to **Phase 1 + Phase 2 + Option A (keep Firebase)** and stop there for review.