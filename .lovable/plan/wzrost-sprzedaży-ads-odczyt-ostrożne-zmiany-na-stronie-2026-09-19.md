# Wzrost sprzedaży — Ads (odczyt) + ostrożne zmiany na stronie

## Strefa zamrożona — zero zmian

- `/compound` — nic: treść, kod, style, komponenty, JSON-LD, meta, obrazy, preload. Także żadnych optymalizacji szybkości.
- Strony produktowe — wolno tylko punkty 5 i 6. Zakaz: cena (format, waluta, pozycja), availability, JSON-LD/microdata oferty (price, priceCurrency, availability, gtin, mpn, brand), H1 i title produktu, URL-e, opisy widoczne dla crawlera.
- Stopka i strony prawne (returns, shipping, privacy, terms, contact, about) — bez zmian.
- Feed Merchant Center (`/api/public/*feed*`, bing-feed, generatory feedu) — bez zmian.
- Żadnych banerów/overlay z ceną lub % rabatu na stronach produktowych.

## Co konto Ads faktycznie pozwala (sprawdzone na żywo, 30 dni)

Działa **jedna** kampania: „Performance Max" (£51/dzień), reszta usunięta z zerowym wydatkiem. Skutki dla Twoich punktów:

- Punkt 1 (asset group „PH") — w pełni możliwy: widzę assety grupy, ich wyniki i braki.
- Punkt 2 (negative keywords) — możliwy jako propozycja. Uwaga: Performance Max raportuje **kategorie zapytań**, bez kosztu na kategorię — więc listę oprę na kliknięciach, wyświetleniach i konwersjach, nie na wydatku.
- Punkt 3 (placementy) — częściowo. PMax nie rozbija kosztu na Search/YouTube/Display/Discover/Gmail. Dostępne są: typ kanału/konwersji, raport grup zasobów, raport placementów (konkretne kanały YouTube i strony) oraz `asset_group_top_combination_view`. Raport pokaże to, co Google faktycznie udostępnia, i wyraźnie nazwie, czego brakuje — zamiast podać wymyślony podział kosztu.

Już widać: czysto informacyjne zapytania („what is nad+", „nad+ benefits") mają wyświetlenia bez kliknięć — to naturalny rdzeń listy negatywów. Brandy konkurencji i „injectable water" zostają nietknięte, zgodnie z Twoją instrukcją.

## Kolejność prac — STOP po każdym punkcie

1. **Asset group „PH"** — audyt wszystkich assetów (headlines krótkie i długie, descriptions, obrazy, logotypy, wideo), które slotu brakują, i propozycja nowych tekstów w ramach research-use-only. Tylko lista do Twojej akceptacji, nic nie publikuję.
2. **Negative keywords** — wyłącznie informacyjne wzorce („what is", „benefits", „side effects", „how to", „reddit", „dosage"), oparte na realnych kategoriach zapytań z konta. Lista do akceptacji, nic nie dodaję.
3. **Raport placementów** — co Google udostępnia dla PMax, z jasnym oznaczeniem braków. Tylko raport.
4. **Szybkość — `/`, `/products`, `/research`** (nie `/compound`): preload hero/LCP z wysokim priorytetem, leniwe montowanie sekcji faktycznie poniżej foldu (opinie, FAQ, marketing w stopce), odchudzenie wejściowego bundla. **Siatka produktów na `/products` renderowana eager** — to główna treść SEO tej strony i musi zostać w snapshotcie prerenderu; ukryty blok katalogu dla crawlera pozostaje nietknięty. LCP mierzone przed i po; `e2e/home-hero-lcp.spec.ts` musi dalej przechodzić.
5. **Trust przy „Add to cart"** — badge „Batch verified — check COA" z odnośnikiem do `/verify` (tylko gdy weryfikacja partii jest włączona), „≥99% purity, third-party tested" z realnych danych laboratoryjnych, ikony płatności, czas wysyłki. Bez dotykania ceny, availability i structured data; wstawka wyłącznie wizualna, poniżej istniejącego bloku ceny.
6. **AOV** — AOV z 90 dni zamówień opłaconych; próg darmowej dostawy = AOV × 1,2 zaokrąglone do £5 (podam wyliczoną liczbę do akceptacji przed wdrożeniem). Bundle schodkowy: 2 produkty −5%, 3+ −10%, bez kumulacji z SALE11. Pasek „Add £X for free shipping" w koszyku. „Frequently researched together" na stronie produktu — tylko nazwy + „view", bez cen.

   **Rabat liczony po stronie serwera.** Koszyk w przeglądarce to wyłącznie podgląd; jedynym źródłem prawdy o kwocie jest `create-order`. Dodaję tam wyłącznie regułę rabatową (2 szt. −5%, 3+ −10%, brak kumulacji z SALE11) w jednym współdzielonym module wyliczającym rabat — resztę logiki tworzenia zamówienia zostawiam nietkniętą, cena jednostkowa nadal pochodzi z bazy, nigdy z requestu. Testy: zamówienie z 2 i 3 produktami daje identyczną kwotę w przeglądarce i na serwerze, a request z ręcznie podmienioną ceną lub kwotą rabatu jest odrzucany. Wartość konwersji przekazywana do analityki = kwota po rabatach, wyliczona przez serwer (kod pomiaru bez zmian).
7. **Message match — `/`, `/products`, `/research`** (nie `/compound`): H1 i hero pod top konwertujące frazy (reta/retatrutide, MOTS-C, GHK-Cu, bacteriostatic water, „tested peptides UK"). Pełny diff i czekam na „ok". Bez zmian URL-i, canonicali, title tags, meta descriptions, JSON-LD.

## Notatki techniczne

- Ads wyłącznie odczyt (GAQL: `asset_group`, `asset_group_asset`, `campaign_search_term_insight`, raporty placementów, segmenty). Każda mutacja tylko po Twojej akceptacji na karcie.
- Nietykalne: conversion actions, goals, offline import, GA4, GTM-MT4BZ2X8, dataLayer, server-side measurement, `/metrics`, `/api/public/hooks/`, `src/lib/analytics`, checkout flow, `/checkout/success`, Wallid, nowpayments-webhook, create-order, CSP w `src/server.ts`.
- Żadnych nowych snippetów Google w kodzie. Żadnych nowych routes — jeśli okaże się potrzebny, pytam najpierw (wymaga wpisu w `KNOWN_PUBLIC_ROUTES` w `src/lib/sitemap-audit.functions.ts`).
- Zero claimów medycznych; zakazane słowa (heals, treats, cures, fat loss, muscle growth, anti-aging) nie pojawią się. RUO i elementy compliance bez zmian.
- Po każdej zmianie: `bunx tsgo --noEmit` i `bun run build`; diff przed zapisem każdego pliku; po deployu raport, co poszło na produkcję, żebyś mógł monitorować Merchant Center 48 h.

## Czego nie da się zrobić i dlaczego

Quality Score i audyt RSA nie istnieją na tym koncie — nie ma keywordów ani reklam tekstowych, jest tylko Performance Max z jedną grupą zasobów. Przesunięcia budżetu między kampaniami też nie, bo kampania jest jedna.
