Plan naprawy blank/pustej strony i cache end-to-end:

1. Uprościć boot/cache recovery w `src/routes/__root.tsx`
   - Usunąć ryzykowne automatyczne podmiany całego `document.body.innerHTML` na ściany typu `Refresh needed` / `Update available`, które mogą zostawiać klienta na pustej lub recovery stronie.
   - Zostawić tylko bezpieczne czyszczenie cache + jeden kontrolowany powrót przez `/cache-reset?next=/`.
   - Nie zmieniać UI sklepu, kolorów ani layoutu.

2. Naprawić powrót stałego klienta po deployu
   - Gdy wykryty jest stary build, brak assetu albo błąd ładowania chunków: kasować Cache Storage, stare Service Workery, recovery flagi i otwierać świeżą stronę przez `/cache-reset`.
   - Dodać mocniejszy mechanizm czyszczenia starego `phlabs-lkg-v1`, bo obecny kod celowo zostawia cache last-known-good i to może trzymać stary HTML.

3. Wzmocnić Service Worker kill-switch
   - Zaktualizować `public/sw.js` i `public/service-worker.js`, żeby usuwały wszystkie cache buckets PH Labs, włącznie z `phlabs-lkg-*`, i nie zostawiały żadnej rejestracji.
   - Bez fetch handlera, bez cache’owania HTML.

4. Sprawdzić edge/cache headers
   - Utrzymać HTML jako `no-store` na browser/CDN/proxy.
   - Zweryfikować `/sw.js`, `/service-worker.js`, `/cache-reset`, `/`, `/products`, `/cart`, `/checkout`.
   - Nie ruszać canonical/SEO poza cache headers.

5. E2E regresja w Playwright
   - Dodać/rozszerzyć test „returning user after deploy”: zasymulować stare cache, stary service worker, stare local/session storage, normalne wejście bez hard refresh.
   - Test ma potwierdzić: brak pustej strony, brak `Refresh needed`/`Update available`, brak reload loop, realny H1 widoczny, brak aktywnego SW, cache wyczyszczony.
   - Osobno sprawdzić ścieżkę `/cache-reset?next=/`.

6. Weryfikacja po wdrożeniu
   - Uruchomić lokalny smoke przez przeglądarkę na preview/live w zwykłym Chrome UA, Safari/iOS UA i Firefox UA.
   - Sprawdzić konsolę, requesty document/asset, nagłówki cache i stan `navigator.serviceWorker`/`caches.keys()`.
   - Po publish: pełny purge Cloudflare dla `phlabs.co.uk`, potem ponowna weryfikacja live.