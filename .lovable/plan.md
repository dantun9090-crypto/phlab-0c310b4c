# Plan: Boost phlabs.co.uk Performance

Cel: podnieść Core Web Vitals (LCP, INP, CLS) i wynik Lighthouse na mobile/desktop dla strony głównej, /products i /compound. Bez zmian UI, bez SSR/CSR — zostajemy przy prerenderingu na Cloudflare.

## 1. Obrazy (największy wpływ na LCP)
- Hero i logo: preload tylko jednego LCP obrazu (`<link rel="preload" as="image" fetchpriority="high">`) w `head()` route'a `/`.
- Konwersja bundlowanych obrazów przez `vite-imagetools` do AVIF + WebP z fallbackiem JPG; `<picture>` z `srcset` i `sizes`.
- Dynamiczne obrazy produktów: Cloudflare Image Resizing (`/cdn-cgi/image/...`) z `width`, `format=auto`, `quality=75`; mobilne warianty 400/800px.
- Każdy `<img>` dostaje `width`, `height`, `decoding="async"`, `loading="lazy"` (poza LCP, który dostaje `fetchpriority="high"` i `loading="eager"`).
- Usunięcie zbędnych dużych PNG z `src/assets/` — audyt rozmiarów >100KB.

## 2. JavaScript & code-splitting
- Audyt bundla (`vite build --mode production` + `rollup-plugin-visualizer`) — cel: initial JS < 170KB gz na mobile.
- Lazy-load: `/admin/*`, `/checkout`, panele modali, edytory, ciężkie zależności (chart libs, markdown, pdf).
- Split vendor chunków: `react`, `router`, `firebase`, `ui` osobno.
- Usunięcie martwych zależności; wymiana ciężkich na lżejsze (np. `date-fns` selektywne importy, `zod` tylko tam gdzie potrzebny).
- `defer` / `type=module` dla wszystkich skryptów; analytics ładowane po `requestIdleCallback`.

## 3. CSS
- Włączyć Tailwind v4 `content` scanning strict — usunąć nieużywane utility.
- Critical CSS inline w `__root.tsx` head (już częściowo jest — zweryfikować rozmiar <14KB).
- Font-display: `swap`; preload tylko 1-2 wag WOFF2; reszta lazy.
- Zredukować `src/styles/cls-fixes.css` do minimum — celu CLS < 0.05.

## 4. Cloudflare edge
- Ruleset dla `_next/`, `/assets/*`, `.woff2`, `.avif`, `.webp`: `Cache-Control: public, max-age=31536000, immutable` + Edge Cache TTL 1 rok.
- HTML: no-store (już jest) — nie ruszamy.
- Włączyć Brotli (jeśli nie jest) i Early Hints dla `/`, `/products`.
- Argo Smart Routing i Tiered Cache — sprawdzić czy aktywne, włączyć jeśli nie.
- Speed Brain — MUSI zostać wyłączone (pamięć projektu).

## 5. Fonty
- Wszystkie fonty via `<link rel="preload" as="font" type="font/woff2" crossorigin>` w root head, tylko WOFF2, tylko wagi używane above-the-fold.
- `font-display: swap` + `size-adjust` żeby ograniczyć CLS przy podmianie.

## 6. Trzecie strony
- Analytics (GA/gtag) — `async`, ładowane po interakcji lub `requestIdleCallback` (max 3s po LCP).
- Usunąć/opóźnić skrypty które nie są krytyczne pre-LCP (chat widget, pixele).

## 7. Prerender + SW
- Zweryfikować że prerendered HTML ma zainlineowany LCP `<img>` (nie czeka na JS).
- Service Worker: precache tylko shell + krytyczne assety, nie HTML.

## 8. Weryfikacja
- Lighthouse CI (`.lighthouserc.json` już jest) — desktop + mobile na `/`, `/products`, `/compound`.
- Porównanie z `lighthouse-baseline/` — cel: perf mobile ≥ 0.90, LCP < 2.5s, CLS < 0.05, TBT < 200ms.
- E2E `home-hero-lcp.spec.ts` musi przejść.
- RUM `web_vitals` w adminie — sprawdzić p75 przez 48h po deployu.
- Test na iOS Safari, Firefox, Chrome — potwierdzić brak regresji (blank page, cache).

## Kolejność wdrożenia
1. Obrazy + preload LCP (największy zysk, najmniejsze ryzyko)
2. Code-splitting + audyt bundla
3. Fonty + CSS krytyczne
4. Cloudflare cache rules dla assetów
5. Odroczenie third-party skryptów
6. Lighthouse CI + porównanie z baseline

## Sekcja techniczna
Pliki dotknięte:
- `src/routes/__root.tsx` — preload fontów, critical CSS review
- `src/routes/index.tsx`, `/products.tsx`, `/compound.tsx` — per-route `head().links` preload LCP
- `vite.config.ts` — `vite-imagetools`, `manualChunks`, `visualizer`
- `src/components/**` — `<img>` → `<picture>` + `fetchpriority`
- `public/_headers` — asset cache immutable
- `cloudflare/wrangler.jsonc` — cache rules (jeśli konieczne)
- `.lighthouserc.*.json` — progi

Ryzyka:
- Zmiana chunków może wywołać kolejny epizod stale cache — łagodzone przez istniejący `/cache-reset` flow i BUILD_ID w SW.
- Cloudflare Image Resizing wymaga aktywnego planu — sprawdzić przed użyciem.

Nie ruszamy: UI, kolorów, layoutu, headera, Firebase, płatności, SSR/CSR, Speed Brain.
