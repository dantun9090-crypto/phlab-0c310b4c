## Goal
Ensure every 404 response on phlabs.co.uk includes `<meta name="prerender-status-code" content="404">` in the **server-rendered HTML head**, so prerender.io's 404 checker passes.

## Current state (audit)
1. `src/routes/$.tsx` (splat catch-all) — already SSR-emits the meta when the first URL segment isn't in `KNOWN_ROOTS`. ✅
2. `src/pages/NotFound/index.tsx` (legacy SPA 404) — only injects the meta **client-side via useEffect**. Prerender.io's headless Chrome may snapshot before this runs, and the tag never appears in true SSR HTML. ❌
3. `src/routes/__root.tsx` `NotFoundComponent` (TanStack root not-found fallback for `throw notFound()`) — no meta at all. ❌
4. `src/routes/products_.$slug.tsx` — when a product slug doesn't exist, the loader throws `notFound()` and `notFoundComponent` mounts `<LegacyMount />` which eventually renders `NotFoundPage`. The route's `head()` never runs (loader threw), so no SSR 404 meta is emitted for missing products. ❌

## Changes

### 1. `src/routes/__root.tsx` — root `NotFoundComponent`
Add an inline `<meta name="prerender-status-code" content="404" />` and `<meta name="robots" content="noindex, follow" />` directly in the JSX. React 19 hoists meta tags rendered in the body into `<head>` during SSR, so the tag is present in the server response.

### 2. `src/routes/products_.$slug.tsx` — missing product
Replace `notFoundComponent: () => <LegacyMount />` with a component that renders the same `<LegacyMount />` **plus** the two meta tags above. This guarantees the SSR HTML for `/products/<bad-slug>` carries the 404 signal.

### 3. `src/pages/NotFound/index.tsx` — keep as-is
The client-side `useEffect` injection stays as a belt-and-braces for SPA navigations (where there is no server render). All SSR paths are now covered by changes 1 + 2 + the existing `$.tsx` splat handler.

### 4. No other routes touched
Per the requirement, the meta is only added on 404 fallback paths — no impact on indexable routes.

## Verification
- `curl -A "Mozilla/5.0" https://phlabs.co.uk/some-bogus-url | grep prerender-status-code` → should show the tag (already works via `$.tsx`).
- `curl -A "Mozilla/5.0" https://phlabs.co.uk/products/does-not-exist | grep prerender-status-code` → new: should show the tag.
- Prerender.io dashboard → "Run 404 Check" on `phlabs.co.uk` → expect PASS.
- Existing 200-status routes (`/`, `/products`, `/products/bpc-157`, `/resources/...`) → meta must NOT appear (regression check).

## Technical notes
- React 19's metadata hoisting works at SSR (`renderToString` / `renderToPipeableStream`), which is what TanStack Start's Worker entry uses. No `HeadContent` wiring needed for these two fallback components.
- We deliberately do NOT call `throw notFound()` from `products_.$slug.tsx`'s `notFoundComponent` — the loader already did. The component just needs to render the legacy 404 UI plus the meta tags.
- No HTTP status change is required (Prerender.io specifically uses the meta tag because the Worker can already return 200 for SPA hydration). The existing `src/server.ts` 410/404 handling is untouched.