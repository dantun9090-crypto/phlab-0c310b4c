# Raport diagnostyczny: zero sprzedaży po usunięciu Tirzepatide/Retatrutide (tylko odczyt)

Cel: jeden raport w Markdown (sekcje A–G), gotowy do wklejenia drugiemu asystentowi AI. Nie zmieniam kodu, danych, produktów, płatności, reklam ani przekierowań i niczego nie publikuję.

## Co zbiorę i skąd
1. **Oś czasu (C):** historia git: commity o VIP, retatrutide, tirzepatide, H1, przekierowaniach, sitemap, checkout i trackingu, z godzinami UTC. Daty publikacji. Dziennik admina (moment oznaczenia produktów jako VIP, 18 XI 13:03). Na tej podstawie ustalę datę graniczną i porównam okres po zmianie z tą samą liczbą dni przed nią.
2. **Sprzedaż (B):** zamówienia z Firebase, tylko odczyt. Tabela dzień po dniu: wszystkie, paid, przychód GBP, pending/failed/cancelled/expired, podział na Wallid/BrokkrPay/przelew. Do tego ostatnie opłacone zamówienie (UTC), liczba pending starszych niż 30 min i 15 ostatnich zamówień z zamaskowanym ID, bez danych osobowych. Rozpoczęte checkouty, jeśli sklep je zapisuje (porzucone koszyki, zdarzenia).
3. **Checkout i płatności (D):** przełącznik checkoutu i metod płatności w ustawieniach. Przejście produkt → koszyk → checkout → wybór metody w przeglądarce bez płacenia. Logi serwera, webhooków Wallid/BrokkrPay i błędy 5xx (maks. 20 najnowszych, bez sekretów). Zamówienia opłacone u operatora, ale nieoznaczone w sklepie: BRAK DOSTĘPU do paneli operatorów, porównam tylko to, co zapisuje sklep.
4. **Ruch i lejek (B):** analityka Lovable (odwiedziny dzień po dniu, źródła). GA4: najpewniej BRAK DOSTĘPU, wtedy wypiszę dokładny raport do pobrania. Zdarzenia lejka, jeśli są zapisywane.
5. **Google Ads (B, E):** tylko odczyt GAQL: koszt, wyświetlenia, kliknięcia, konwersje i wartość dzień po dniu oraz według kampanii, wyniki według produktów. Sprawdzę w kodzie wysyłanie purchase (value, currency, transaction_id, odzyskiwanie zakupów). Ostatni plik konwersji offline i jego zawartość. Czy usunięte produkty lub ich adresy nadal są w reklamach.
6. **SEO i produkty:** lista aktywnych produktów (nazwa, URL, cena, stan, indeksowanie). Kody odpowiedzi usuniętych adresów (curl). Obecność w sitemap, feedzie, danych strukturalnych i linkach wewnętrznych. Merchant Center: BRAK DOSTĘPU, jeśli nie ma połączenia.

## Wynik
Raport zgodnie z Twoim formatem A–G. Każde twierdzenie poparte liczbą, logiem lub commitem. Wnioski oznaczę jako potwierdzone albo hipotezy. Wskażę najbardziej prawdopodobne miejsce problemu i listę brakujących danych. Raport trafi do czatu, a jego kopia jako plik do Twoich Plików. Bez propozycji napraw i zmian ROAS.
