# Sprawdzenie: czy zakupy z płatności trafiają do Google (end to end)

Sprawdzam tylko odczytowo. Nic nie zmieniam w Google Ads, płatnościach ani śledzeniu, dopóki nie zatwierdzisz konkretnej poprawki.

## Co sprawdzę

1. **Zapis kliknięcia z reklamy.** Jaki odsetek opłaconych zamówień z ostatnich 7 i 14 dni ma zapisane kliknięcie z reklamy (gclid). Spadek oznacza zakupy, których Google nigdy nie zobaczy.
2. **Wallid i BrokkrPay → zamówienie opłacone.** Czy zamówienia opłacone przez Wallid (bank) i BrokkrPay (karty) zmieniają status na „paid” i nie wiszą jako „pending”. Dla BrokkrPay: czy powiadomienie o płatności dochodzi do sklepu i czy kwota w Google jest w funtach, a nie w dolarach.
3. **Zakup w przeglądarce.** Czy strona potwierdzenia wysyła zdarzenie zakupu do Google raz (bez podwójnego liczenia po odświeżeniu), także gdy klient wraca z aplikacji banku.
4. **Kopia zapasowa po stronie serwera.** Czy opłacone zamówienia, przy których klient nie wrócił na stronę, są wysyłane do Google przez serwer.
5. **Dzienny plik konwersji.** Czy dzisiejszy plik, który Google Ads pobiera rano, zawiera właściwe opłacone zamówienia z 22–26 X, bez duplikatów i ze złymi kwotami. Czy Google Ads go pobrał bez błędów.
6. **Google Ads.** Które działanie „Purchase” liczy się jako główne, ile konwersji Google zapisał za 22–26 X, i porównanie z prawdziwymi zamówieniami ze sklepu.

## Co dostaniesz

- Raport po polsku: zielony / żółty / czerwony dla każdego kroku, z liczbami.
- Listę problemów z proponowaną poprawką do zatwierdzenia jedna po drugiej.

## Szczegóły techniczne

- Firestore `orders` (paid, ostatnie 14 dni): pola `adClickIds`/gclid, `gaClientPurchaseAt`, `gaMpPurchaseAt`, status.
- Kod: `src/lib/gclid-capture.ts`, `src/lib/analytics.ts`, `src/lib/purchase-recovery.ts`, `src/lib/server/ga-measurement.ts`, `src/routes/checkout.success.tsx`, `src/routes/api/public/hooks/offline-conversions.ts`.
- CSV konwersji przez curl z CRON_SECRET (tylko nagłówki i liczba wierszy, bez danych klientów).
- Google Ads (konto 4410206709), tylko odczyt: conversion_action, metryki konwersji per dzień, diagnostyka offline upload.
