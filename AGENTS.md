# AGENTS

- Redirects: all path 301s live in src/lib/legacy-redirects.ts and are resolved with resolveFinalRedirect() in both src/server.ts and cloudflare/phlabs-prerender.mjs — why: guarantees one hop and stops the edge from following redirects into 200s on old URLs.
- Reversed /compare/ pairs: merge via COMPARE_CONSOLIDATION in src/lib/programmatic-seo.ts plus a matching redirect rule — why: one kept URL per comparison, FAQs merged automatically.
- Marketing emails: never write campaigns straight to `mail`; queue via src/lib/server/marketing-drip.ts (marketingOutbox, released by the marketing-drip cron within an hourly cap) — why: the mail host bounces anything over 100 messages/hour.
- Supabase client in the browser: never import `@/integrations/supabase/client` statically from eager modules (src/start.ts middleware, route loaders/head, components exported from route files); use `import()` at call time and `attachSupabaseAuthLazy` from src/lib/supabase-auth-lazy.ts — why: a single static import ships the ~800 KB SDK to every page.
- /products first paint: src/legacy/ProductsSsrShell.tsx mirrors the Products page hero (same classes, copy, computed metrics), stays hidden until src/styles.css loads, and is also the CSR fallback in src/client.tsx — why: the hero paragraph is the mobile LCP element; any size mismatch makes the live paragraph a new, later LCP.
