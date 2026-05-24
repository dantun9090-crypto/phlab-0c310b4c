# Runtime Boundaries — browser-only vs Worker-only

This project runs in two completely separate JavaScript runtimes:

- **Browser** — the visitor's tab. Has `window`, `document`, `localStorage`,
  Firebase JS SDK with real-time listeners, IndexedDB, etc.
- **Cloudflare Worker (workerd)** — the SSR runtime that builds the HTML
  Googlebot / prerender.io / first-paint receives. Has `fetch`, Web Crypto,
  request/response headers — but **no Node-only APIs** (`child_process`,
  native modules, `fs.watch`, etc.), **no `window`/`document`**, and module
  init happens once per isolate, not per request.

If you put code in the wrong runtime, one of two things happens:

1. SSR crashes with `window is not defined` / `[unenv] X is not implemented`,
   the Worker falls through to the branded error page, and Google sees a
   500 instead of your content.
2. Server secrets or admin-only checks leak into the client bundle and
   anyone can read/bypass them in DevTools.

The rest of this doc nails down which file belongs where, and why.

---

## Browser-only — never touch on the Worker

These files import browser APIs at module scope or at render time. They
either run inside `useEffect`, are wrapped in `<ClientOnly>`, or are gated
behind `useHydrated()` so SSR never reaches the offending line.

| File | Why browser-only |
|---|---|
| `src/lib/prerender-ready.ts` | Reads/writes `window.prerenderReady`, polls via `requestAnimationFrame`, queries DOM with `document.querySelectorAll`. Imported by pages but only invoked inside `useEffect` after data loads. See the **Why prerender-ready is excluded** section below. |
| `src/lib/firebase.ts` | Initializes the Firebase JS SDK with `localStorage` auth persistence and real-time WebSocket listeners. None of this works on workerd. |
| `src/lib/firebase-auth.ts`, `src/lib/mockAuth.ts` | Wrap Firebase Auth, which assumes `window` and `localStorage`. |
| `src/contexts/ThemeContext.tsx`, `src/hooks/useTheme.ts` | Read `localStorage` and `matchMedia` for theme persistence. |
| `src/hooks/useRecentlyViewed.ts` | Persists to `localStorage`. |
| `src/components/CookieConsent.tsx` | `localStorage` + `document.cookie`. |
| `src/components/ScrollToTop.tsx`, `src/utils/clsPrevention.ts`, `src/utils/removeWatermark.ts` | DOM mutation. |
| `src/legacy/LegacyApp.tsx`, `src/legacy/AppRouter.tsx` | Ported Wegic shell — depends on `window` event listeners. Only lazy-loaded inside route components, never imported in loaders. |
| All admin tab components (`src/pages/Admin/tabs/*.tsx`) | Use Firebase JS SDK for live queries, file uploads, image cropping — all browser-only. The admin **IP gate** is the only admin piece that runs server-side (see below). |

**Rule:** if a file imports `firebase/app`, `firebase/auth`, `firebase/firestore`,
or touches `window`/`document`/`localStorage` at module scope, it must NEVER
be reachable from a route `loader`, a `createServerFn` handler, a server
route, or `src/server.ts`.

---

## Worker-only — never bundle into the client

These files run inside `workerd` during SSR. Several of them read service
credentials, perform IP allow-list checks, or rely on Worker-only request
headers (`cf-connecting-ip`). Bundling them into the browser would either
leak credentials or no-op (because the headers don't exist client-side).

| File | Why Worker-only |
|---|---|
| `src/server.ts` | The Worker entry point. Wraps the TanStack Start handler with try/catch, response normalization, and structured request logging. Has no meaning in the browser. |
| `src/start.ts` | TanStack Start's `errorMiddleware`. Server-side middleware only. |
| `src/lib/error-page.ts` | Self-contained HTML fallback served by the Worker when SSR fails. Imported by `src/server.ts` only. |
| `src/lib/error-capture.ts` | Installs `globalThis.addEventListener('error', …)` listeners so h3-swallowed errors are still loggable. The browser has its own error reporting; this file is for the Worker isolate. |
| `src/lib/worker-log.ts` | ndjson logger writing to Cloudflare's log pipeline (`wrangler tail`, Logpush). `console.log` in the browser would just spam DevTools — and `extractClientIp` reads `cf-connecting-ip`, which only exists Worker-side. |
| `src/lib/admin-ip-gate.functions.ts` | **Security boundary.** Reads `cf-connecting-ip` from the Worker request, compares against the Firestore `ipWhitelist` collection, and fails closed. If this ran client-side, any admin user could skip it in DevTools (this is exactly the bug we fixed). |
| `src/lib/cart-validation.functions.ts` | Server-side cart price/stock validation against Firestore REST. Must be server-side so the client cannot tamper with totals. |
| `src/lib/firestore-rest.ts` | Calls Firestore REST API with `fetch`. Used by route loaders to pre-render `/products` and `/products/$slug` HTML inside the Worker. Safe in either runtime *technically*, but only ever called from Worker code paths — duplicating it client-side would skip the real-time Firebase listener that the browser shell already provides. |
| `src/routes/sitemap[.]xml.ts` | Server route returning raw XML. |
| Any `**/*.functions.ts` or `**/*.server.ts` file | `*.server.ts` is import-blocked from the client bundle by the build. `*.functions.ts` is safe to *import* anywhere — the build replaces the body with an RPC stub in client bundles — but the **handler code itself only ever executes on the Worker**. |

**Rule:** if a file reads `process.env`, calls `getRequest()`, touches
`cf-connecting-ip`, or hits the Firestore REST API with a service intent
(price validation, IP allow-list, sitemap), keep it server-only and call it
via `createServerFn` or a server route.

---

## Why `src/lib/prerender-ready.ts` is excluded from Worker code paths

The prerender helper exists for one job: tell prerender.io / Googlebot
*"the page is fully painted, you can snapshot the DOM now"*. It does this
by:

1. Setting `window.prerenderReady = false` while data is loading.
2. Polling with `requestAnimationFrame` until expected DOM nodes (e.g.
   `[data-product-card]` on `/products`) are actually in the document.
3. Flipping `window.prerenderReady = true` so prerender.io captures the
   hydrated HTML and not the empty SSR shell.

Every line of that helper touches a browser-only API:

- `window.prerenderReady` — there is no `window` on workerd.
- `requestAnimationFrame` — Worker tick model has no rAF.
- `document.querySelectorAll(selector)` — no DOM exists during SSR.

If this code ran on the Worker:

- **At best**, the first reference (`window.prerenderReady = false`) throws
  `ReferenceError: window is not defined`, the SSR pass crashes, our
  Worker wrapper serves the branded error page, and **Googlebot indexes
  the error page instead of the product listing**. That's an SEO
  catastrophe for a site whose whole point is being crawlable.
- **At worst** (with a `typeof window` guard), the call no-ops on the
  server, but the SSR HTML still ships with `<meta name="prerender-ready"
  content="false">` and **no follow-up flips it**, so prerender.io waits
  the full 8s timeout on every render and serves stale empty HTML.

So the helper is consumed like this:

```ts
// src/pages/Products/index.tsx
import { flipPrerenderReadyWhenRendered, markPrerenderPending } from "@/lib/prerender-ready";

useEffect(() => {
  markPrerenderPending();
  // …fetch products from Firestore (browser SDK)…
  flipPrerenderReadyWhenRendered("[data-product-card]", products.length);
}, [products]);
```

Three guarantees keep it Worker-safe:

1. **Only imported by page components**, never by route `loader`s,
   `head()` builders, server fns, or server routes.
2. **Only called inside `useEffect`**, which never runs during SSR.
3. **CI catches regressions** — `scripts/check-worker-imports.ts` runs
   after `bun run build` and scans `dist/server/**` for Node-only or
   browser-only patterns leaking into the Worker bundle (see
   `.github/workflows/ci.yml`).

The corresponding SSR concern (telling prerender.io to wait) is handled
entirely with static `<meta>` tags emitted in the route's `head()` function
— pure strings, no runtime browser dependency:

```ts
// src/routes/products.tsx
head: () => ({
  meta: [
    { name: "prerender-ready", content: "false" },
    { name: "fragment", content: "!" },
    // …
  ],
}),
```

That meta tag is what prerender.io reads on first SSR; the helper above is
what flips it true once the client hydrates. The two halves cooperate
across the runtime boundary without sharing any code.

---

## Quick checklist when adding new code

- New file uses `window`/`document`/`localStorage`/Firebase JS SDK?
  → browser-only. Never import it from a route `loader`, a server fn, a
  server route, or anything in `src/server.ts` / `src/start.ts`.
- New file reads `process.env`, request headers, or service credentials?
  → Worker-only. Put it in `*.functions.ts` (RPC) or `*.server.ts`
  (server-only helper), and call it via `createServerFn`.
- Need the same value in both runtimes? → expose it through a
  `createServerFn` and let the client call it. Don't duplicate the secret
  into a `VITE_` variable.
- Touching prerender readiness? → keep the rAF/DOM polling in
  `prerender-ready.ts`, keep the `<meta name="prerender-ready">` tag in
  the route's `head()`. Don't merge the two.
- Worried about regressions? → `bun run ci` runs the production build and
  the import guard; `bun run worker:smoke` exercises the deployed Worker
  end-to-end (admin IP helpers, Firestore REST, `/products` SSR).
