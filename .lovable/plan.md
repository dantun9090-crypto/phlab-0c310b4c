# Deep Audit PH Labs — Root Cause + Plan

## ✅ Już naprawione w tej turze

**Root cause obu screenshotów** = `HomeSsrShell` w `src/routes/index.tsx` (linie 132-325). To był placeholder "dla FCP" dodany wcześniej, który:

- renderował własne `<h1>Pro Peptide Research Lab / For In-Vitro Research</h1>` bez `font-family` → browser default = **serif** (screenshot 1),
- renderował własny fixed header z emoji `⌕ 🛒 ☰` który zachodził na prawdziwą `<Navigation>` podczas hydracji → **rozjechane menu** (screenshot 2),
- używał inline styles zamiast Tailwinda → wyglądał zupełnie inaczej niż prawdziwa strona.

**Fix:** SSR shell zastąpiony pustym `<div>` z tłem `#020617` (slate-950). Prawdziwy `<Home>` z `src/pages/Home/index.tsx` renderuje się od razu po hydracji, bez flash of unstyled content i bez "podwójnego" headera. Purge Cloudflare wykonany.

Meta `HOME_TITLE` w `src/routes/index.tsx` zsynchronizowany z `useSEO` w Home (`HPLC-Verified Research Peptides UK | PH Labs`) — wcześniej były dwa różne tytuły.

## 🔍 Reszta deep auditu — do zrobienia w kolejnych iteracjach

### 1. Weryfikacja fixa na produkcji
- Odpalić Playwright na `https://phlabs.co.uk/` (mobile 390px + desktop) po deploy'u
- Sprawdzić że H1 = "HPLC-Verified..." NIE "Pro Peptide Research Lab", font = sans-serif
- Otworzyć hamburger → sprawdzić że drawer wjeżdża od prawej, linki mają padding i tła
- Screenshoty tego samego widoku co user (Firefox mobile UA) dla porównania

### 2. Sprawdzenie każdej podstrony (routes audit)
Dla każdej z: `/`, `/products`, `/product/[slug]`, `/cart`, `/checkout`, `/account`, `/lab-reports`, `/research`, `/contact`, `/vip-store`, `/admin`, policies (`/privacy`, `/terms`, `/shipping`, `/refund`):
- SSR HTML zawiera prawdziwy `<h1>` i główną treść (nie tylko shell / spinner)
- Meta `<title>` i `<description>` unikalne per route, nie odziedziczone z `__root`
- `og:image` tylko na leaf routes (nigdy `__root`)
- `canonical` = `https://phlabs.co.uk/…` bez `www`
- Powyżej fold: żadnych fontów serif chyba że user o to prosi (design system → sans + emerald)
- "For Research Use Only. Not for Human Consumption." widoczne na każdym product page + footer

### 3. Hydration mismatches
Konsola pokazuje `[HYDRATION DIAG] FINAL pre-React mutation count = 4` (`gapi.iframe` wstrzykuje `<script>` + `<iframe>` przed React zdąży hydratować).
- Zdefer'ować ładowanie `apis.google.com/js/api.js` do `requestIdleCallback` po hydracji
- Lub przenieść za React tree (na koniec body) żeby nie zmieniało DOM przed hydracją

### 4. Web Vitals
Konsola: `FCP 5696ms (poor)` na `/` w dev. Sprawdzić na prod:
- SSR shell był ostatnią zmianą — po jego usunięciu FCP powinno spaść (real content zamiast pustego div)
- Font loading strategy: `font-display: swap` na wszystkich `@font-face`
- LCP element: banner image? hero H1? — sprawdzić i preload odpowiedni asset
- CLS: reserve space for banner/adverts

### 5. bfcache
Konsola: `⚠ Cache-Control on / contains "no-store" — page is NOT bfcache-eligible`.
- Decyzja: HTML `no-store` jest celowe (świeże buildy) ale zabija bfcache → flash blank przy Back
- Opcja: przełączyć na `no-cache, must-revalidate` + polegać na `x-build-id` mismatch reload (już mamy)

### 6. CSP audit
Widziałem `'unsafe-eval'` w `script-src` na produkcji. Sprawdzić czy naprawdę potrzebne (jakiś bundler eval? sentry replay?) — usunąć jeśli nie.

### 7. Firestore rules & security
- Zweryfikować że deployed rules = hardened rules z project-knowledge (`isAdmin`, `!hasAny(['isAdmin','role','isVip'])`)
- Sprawdzić czy `/auditLogs` faktycznie zapisywane server-side przy każdej admin akcji
- Sprawdzić że robots.txt blokuje `/admin`, `/cart`, `/checkout`, `/api`, `/vip-store`

### 8. Payments smoke test
- Stripe: webhook endpoint (`/api/public/stripe-webhook`?) waliduje sygnaturę
- TrueLayer: request signing (EC P-521 kid)
- Fena: worker proxy nie leakuje sekretów do klienta
- Age gate 18+ walidowane server-side w checkout functions

### 9. Sitemap & SEO
- `/sitemap.xml` reguluje się automatycznie po product save (Firebase trigger?)
- Base URL = `https://phlabs.co.uk` wszędzie (nie www, nie phlab.lovable.app)
- 13 aktywnych produktów z inventory ma live URL i JSON-LD Product schema

### 10. Bundle & performance
- `/admin` i `/checkout` code-split (dynamic import) → sprawdzić `bundle-analyzer`
- Lazy load poniżej fold: adverts, testimonials, FAQ
- Cloudflare Image Resizing dla wszystkich Firebase Storage URLs

## Technical notes
- Fix trafi na produkcję po następnym publish (build ID zmieni się, force-reload wyłapie mismatch u obecnych użytkowników)
- Po publish uruchomię pełną weryfikację Playwright na `phlabs.co.uk` (nie preview)
- Każdy z punktów 2-10 to osobna iteracja z konkretnymi zmianami; nie zmieniam UI ani product logic — tylko poprawki infra/hydration/security/perf zgodne z workspace + project knowledge
