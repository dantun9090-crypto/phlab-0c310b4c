# /compound — przyspieszenie bez zmiany wyglądu

## Co pokazał test (żywa strona, komputer)
- Wynik 59/100. Główna treść wyświetla się szybko (1.0 s), ale strona jest „zajęta” przez ok. 4.2 s.
- Kod sklepu zajmuje przeglądarce tylko ok. 0.4 s. Prawie cały czas (ok. 24 s w trakcie testu) idzie na ciągłe przerysowywanie strony.
- Przyczyną są animacje, które nigdy się nie zatrzymują: unosząca się, rozmyta karta w górnej części strony, przesuwający się pasek tekstu, powolne przybliżanie zdjęcia i błysk na złotych elementach. Błysk jest liczony od nowa przy każdej klatce.
- Drugi problem: skrypt raportowania błędów ładuje się od razu i blokuje stronę na ok. 70 ms.

## Zmiany (tylko /compound, wygląd i adres bez zmian)
1. Błysk: ten sam efekt wizualny, ale zrobiony tak, żeby animował go układ graficzny komputera, bez ciągłego przerysowywania.
2. Unosząca się karta: rozmycie tła zostaje, ale animowany jest tylko ruch, a nie cała rozmyta warstwa.
3. Ciągłe animacje (unoszenie, pasek tekstu, przybliżanie zdjęcia, błysk) startują dopiero po pełnym załadowaniu strony. Zatrzymują się, gdy dany fragment nie jest widoczny na ekranie, i są wyłączone u osób, które w systemie wybrały ograniczenie ruchu.
4. Skrypt raportowania błędów ładuje się dopiero po wyświetleniu strony, a nie przed nią.

## Weryfikacja
- Lighthouse na /compound przed i po zmianach (telefon i komputer). Cel: strona „zajęta” krócej niż 0.5 s na komputerze i krócej niż 1 s na telefonie.
- Zrzuty ekranu przed i po: strona ma wyglądać identycznie.
- Testy /compound, które już są w projekcie (wygląd, dostępność, podstawowe działanie).
- Po Twojej zgodzie: publikacja, wyczyszczenie pamięci podręcznej Cloudflare i sprawdzenie, czy phlabs.co.uk/compound działa.

## Czego nie ruszam
Teksty, adresy, kasa i płatności, śledzenie sprzedaży, Google Ads, robots.txt, ustawienia bezpieczeństwa (CSP).

## Szczegóły techniczne
- src/components/PremiumLanding.tsx: luxShimmer (animowane background-position) zamienić na element ::after przesuwany przez transform. lux-float przenieść na wrapper, żeby backdrop-blur nie był przeliczany co klatkę. Infinite animacje opakować w klasę .lux-anim-on, dodawaną po zdarzeniu load + requestIdleCallback. animation-play-state: paused, gdy IntersectionObserver pokaże, że element jest poza ekranem, oraz @media (prefers-reduced-motion).
- Sentry: inicjalizację przenieść do dynamicznego importu po idle (sprawdzić punkt inicjalizacji). Zachować przechwytywanie błędów, które wystąpią wcześniej.
- Strona główna (44 na telefonie) to osobny krok: dopiero po wynikach dla /compound.
