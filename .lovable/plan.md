# Przeniesienie produktów VIP do osobnej kolekcji (poprawka bezpieczeństwa)

## Problem
`product_stock` ma regułę `allow read: if true`, a klucz Firebase jest publiczny. Każdy może więc odczytać nazwy, ceny i flagę `isVip` produktów VIP przez API Firestore. Ukrywanie działa tylko w wyglądzie strony, a nie na poziomie danych.

## Co zrobię
1. **Nowa kolekcja `product_stock_vip`** z regułą w `firestore.rules`:
   - odczyt: tylko zalogowany klient z `customers/{uid}.isVip == true` (oraz admin, żeby edytor działał),
   - zapis: `isAdmin()`.
   - Reguła `product_stock` zostaje bez zmian (publiczny odczyt produktów nie-VIP).
2. **Migracja (jednorazowy skrypt Admin SDK):**
   - najpierw tryb próbny: lista produktów `isVip: true` i kopia zapasowa JSON w /tmp,
   - kopiuję każdy dokument do `product_stock_vip` z tym samym ID i wszystkimi polami (`isVip: true` zostaje tylko do wyświetlania w adminie),
   - sprawdzam, czy kopia się zgadza, i dopiero wtedy usuwam oryginał z `product_stock`.
3. **Strona VIP Store** czyta z `product_stock_vip`. Odczyt z `product_stock` z filtrem znika.
4. **Admin ProductEditor:** przełącznik VIP przenosi produkt między kolekcjami w jednej transakcji (zapis w docelowej i usunięcie ze źródłowej), z wpisem w `auditLogs`. Lista produktów w adminie łączy obie kolekcje i pokazuje plakietkę VIP.
5. **Serwer (koszyk i zamówienie):** `cart-validation.server.ts` i `create-order.server.ts` szukają produktu w `product_stock`, a jeśli go tam nie ma, w `product_stock_vip` (przez konto serwisowe). Produkt z kolekcji VIP przechodzi tylko wtedy, gdy kupujący jest VIP lub adminem. Inaczej koszyk zostanie odrzucony tak jak dziś.
6. **Strona produktu VIP (ten sam adres i slug):** gdy produktu nie ma w `product_stock`, a widz jest VIP lub adminem, strona dociąga go z `product_stock_vip`. Pozostali dostają ten sam ekran co dziś. Adresy URL i slugi zostają bez zmian.
7. **Bez zmian:** feed Google Merchant, sitemap i prerender czytają tylko `product_stock`, więc produkty VIP i tak z nich wypadają. Wygląd strony, kasa i płatności zostają nietknięte.

## Weryfikacja
- Testy: koszyk z produktem VIP odrzucony dla kupującego bez VIP, przyjęty dla VIP (aktualizacja `cart-validation.test.ts`).
- Anonimowe zapytanie REST do `product_stock_vip` zwraca 403, a `product_stock` nie zawiera już żadnego `isVip: true`.
- Deploy reguł (`firebase deploy --only firestore:rules`) dopiero po migracji. Build i typecheck.
- Zgodnie z Twoją wcześniejszą prośbą pokażę diff przed publikacją. Po publikacji wyczyszczę cache Cloudflare.

## Ryzyko
Krótkie okno między migracją a publikacją kodu: VIP Store może przez chwilę być pusty. Dlatego najpierw publikuję kod, który czyta obie kolekcje, a dopiero potem migruję dane i wdrażam reguły.
