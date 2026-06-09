Plan naprawy:

1. Potwierdzić dokładny objaw na produkcji i preview
- Sprawdzić `/`, `/?_r=...`, `/products`, `/sw.js` i `/service-worker.js`.
- Porównać zwykłego użytkownika z bot UA, żeby potwierdzić czy problem idzie przez Worker/prerender, service worker, czy klienta React.
- Zebrać nagłówki cache/worker/prerender i błędy konsoli.

2. Usunąć źródło blank page po ostatniej zmianie
- W `src/routes/__root.tsx` zastąpić niepotrzebny inline `BOOT_WATCHDOG` prostym, bezpiecznym skryptem tylko dla `?sw=off`.
- Usunąć pozostałości starych flag `__phl_boot_reload_*` i komentarze/znaki, które mogą znów rozbić JSX/template literal.
- Nie ruszać układu, kolorów ani headera.

3. Sprawdzić i wyrównać Worker/Prerender
- Zweryfikować aktywną logikę w `src/server.ts` względem `cloudflare/worker.js` i upewnić się, że produkcyjna ścieżka nie zapętla prerendera ani nie blokuje HeadlessChrome Prerender.io.
- Dla HTML dopilnować `no-store` tylko na ścieżkach recovery (`?sw=off`, SW), a normalne strony mają bezpieczny cache.
- Dla botów zostawić fallback do origin, jeśli Prerender.io zwróci 5xx/timeout.

4. Dodać widoczny recovery path dla użytkowników ze starym SW/cache
- Upewnić się, że link `/?sw=off` czyści tylko cache/app-shell PH Labs i kończy na czystym URL.
- Jeśli blank wynika ze starego service workera, użytkownik dostanie działającą ścieżkę odświeżenia bez kasowania całego storage domeny.

5. Walidacja po zmianie
- Sprawdzić build/transform przez dostępne logi narzędziowe.
- Otworzyć produkcję i preview w przeglądarce, zrobić screenshot, sprawdzić konsolę i sieć.
- Przetestować Googlebot UA / prerender nagłówki, żeby upewnić się, że indexing nadal działa.

Zakładany efekt: strona przestaje robić blank/kolumnowy stan po ładowaniu, `?_r=...` nie wraca, a Worker/prerender pozostają aktywne i bezpieczne dla Google.