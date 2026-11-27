# Promocja Black Friday SALE17 w Google Ads

## Co już jest w sklepie
- Kod SALE17 istnieje i jest aktywny: 17% zniżki, minimalne zamówienie £10.
- Problem: kod wygasa 28 listopada o 23:59, a promocja ma trwać do 1 grudnia. Google odrzuca promocje, gdy kod nie działa w sklepie przez cały czas trwania reklamy.

## Kroki
1. Przedłużyć ważność kodu SALE17 w sklepie do 1 grudnia 23:59 (czas UK). Nic innego w kodzie się nie zmienia (17%, min. £10 zostają). Zmiana widoczna w panelu admina w zakładce kodów promocyjnych i zapisana w logu admina.
2. Dodać do kampanii Performance Max rozszerzenie „Promocja”:
   - 17% off, kod SALE17
   - okazja: Black Friday
   - od dziś do 1 grudnia
   - przy zamówieniach od £10 (zgodnie z warunkiem kodu)
   - opis: „Research peptides”, link do strony głównej phlabs.co.uk
   - język angielski
3. Google sprawdzi rozszerzenie przed zatwierdzeniem. Jeśli odrzuci okazję „Black Friday” z powodu daty końcowej 1 grudnia, użyję bez okazji (zwykła promocja do 1 grudnia) i powiem Ci o tym.
4. Sprawdzić po dodaniu: status rozszerzenia (w trakcie sprawdzania / zatwierdzone) i że kod działa w kasie.

## Czego nie ruszam
Budżet, cel ROAS 360%, produkty, Merchant Center, kasa i płatności.

## Uwagi
- Zmiana w Google Ads wymaga Twojej zgody na karcie zatwierdzenia.
- Sprawdzanie przez Google zwykle trwa do 1 dnia; peptydy mogą wydłużyć ten czas.

## Szczegóły techniczne
- Firestore `coupons/3UNGECQG6KargMkecTtN`: `expiryDate` → 2026-12-01T23:59:59Z (GMT w grudniu) przez firebase-admin, wpis w `auditLogs`.
- Google Ads: `assetOperation.create` z `promotionAsset` (promotionTarget, percentOff=17000000, promotionCode, occasion BLACK_FRIDAY, ordersOverAmount £10, start/end date, finalUrls, languageCode en) + `campaignAssetOperation.create` z fieldType PROMOTION dla kampanii 24058542701, jedna atomowa partia.
