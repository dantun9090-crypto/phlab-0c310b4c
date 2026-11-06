# Ujednolicenie opisów produktów + język laboratoryjny

Twarde ograniczenie przyjęte: **żaden link, slug, adres URL, canonical, link w JSON-LD ani link w kanale Google nie zostanie zmieniony.** Jeśli uznam, że jakiś adres powinien się zmienić, zostawię tylko komentarz w kodzie z sugestią. Architektura renderowania (pre-render), CSP w `src/server.ts` oraz konfiguracja płatności pozostają nietknięte.

## 1. Opisy produktów w kanale Google — spójny format

Nazwy i opisy produktów pochodzą z jednego pliku (`src/lib/merchantSeoData.ts`), z którego panel administracyjny („Apply Merchant SEO") zapisuje je do bazy. Dziś 13 wpisów ma różną strukturę: część nazw podaje wielkość opakowania (np. „10 mg"), część nie; część opisów ma dodatkową notatkę, część nie; różne długości.

Co zrobię:

- Jeden wzorzec nazwy dla wszystkich 13 produktów, w tej samej kolejności elementów: nazwa naukowa → forma → wielkość opakowania → czystość HPLC → numer CAS → „For Research Use Only (RUO)".
- Zachowam istniejące anonimizowane nazwy tam, gdzie są celowe (produkty wysokiego ryzyka w płatnym kanale) — bez zmiany dopasowań i bez zmiany adresów.
- Jeden wzorzec opisu, ten sam zestaw pól i ta sama kolejność dla każdego produktu: nota „For Research Use Only. Not for Human Consumption.", specyfikacja techniczna (CAS, wzór, masa cząsteczkowa, sekwencja, skład, czystość, postać, przechowywanie), zdanie o dokumentacji partii, zdanie o zakazie użycia u ludzi.
- Zbliżona długość opisów (ok. 700–900 znaków) i identyczne formatowanie punktów.
- **Bez dawek i bez sposobu użycia** — zgodnie z Twoją decyzją. Zamiast tego dane techniczne: masa netto w mg, czystość, CAS, wzór, sekwencja, warunki przechowywania.
- Pisownia brytyjska w całości (lyophilised, colourless, sterilised, analysed).
- Zero języka marketingowego: usunę wszelkie „premium", „best", „powerful", „revolutionary" jeśli gdzieś zostały, oraz wszelkie sugestie efektu zdrowotnego.

Kanał produktowy będzie czytał te same wpisy, więc opisy w Google ujednolicą się automatycznie — **linki do produktów zostają dokładnie takie same**.

## 2. E-maile do klientów — ten sam język i nota badawcza

W szablonach e-maili (`src/templates/`) nota „For Research Use Only. Not for Human Consumption." jest dziś tylko w potwierdzeniu zamówienia. Zrobię:

- Ta sama nota w stopce **każdego** e-maila do klienta: wysyłka, potwierdzenie płatności, przypomnienie i ponowna płatność, faktura, powitanie, katalogu, anulowanie, status zamówienia, formularz kontaktowy.
- Ujednolicone brzmienie i pozycja noty (jedna wspólna stopka, żeby nie rozjeżdżały się warianty).
- Pisownia brytyjska i neutralny, rzeczowy ton — bez zwrotów sprzedażowych i bez obietnic działania.
- Wygląd e-maili (kolory, układ, logo) bez zmian.

## 3. Weryfikacja

- Uruchomię istniejące kontrole zgodności (skan zabronionych sformułowań, testy kanału produktowego, testy e-maili) oraz pełny build.
- Uruchomię sprawdzenie adresów: potwierdzę, że lista adresów produktów w mapie sitemap i w kanale produktowym jest **identyczna** przed i po zmianie. Jeśli cokolwiek się różni, wycofam zmianę.
- Podsumuję, co dokładnie się zmieniło w treści.

## Szczegóły techniczne

- `src/lib/merchantSeoData.ts` — jeden `buildDescription()` z ustalonym porządkiem pól, wymuszone pola obowiązkowe, wszystkie 13 wpisów przepisane na ten sam wzorzec. `match` bez zmian, `slug`/`id` bez zmian, `MERCHANT_CODE_OVERRIDES` i `product-id-slug-map.ts` bez zmian.
- Trasy kanałów (`google-merchant-feed[.]xml.ts`, `google-merchant-feed-free[.]xml.ts`, `google-ads-safe-feed[.]xml.ts`, `bing-feed[.]xml.ts`) — tylko odczyt, żadnej zmiany w budowaniu `link`/`id`.
- `src/templates/emailBase.ts` — jedna wspólna stopka z notą RUO; szablony wywołują ją zamiast własnych wariantów.
- Zakres bez zmian: `src/server.ts`, konfiguracja płatności, `src/router.tsx`, komponenty UI, style.
- Kontrole: `scripts/compliance-scan.ts`, `tests/merchant-feed-banned-tokens.test.ts`, `scripts/check-sitemap-routes.ts`, `bunx tsgo --noEmit`, build.
