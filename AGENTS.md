# AGENTS

- Redirects: all path 301s live in src/lib/legacy-redirects.ts and are resolved with resolveFinalRedirect() in both src/server.ts and cloudflare/phlabs-prerender.mjs — why: guarantees one hop and stops the edge from following redirects into 200s on old URLs.
- Reversed /compare/ pairs: merge via COMPARE_CONSOLIDATION in src/lib/programmatic-seo.ts plus a matching redirect rule — why: one kept URL per comparison, FAQs merged automatically.
