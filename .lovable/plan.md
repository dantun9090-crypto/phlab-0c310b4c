# Automatyczne potwierdzenie płatności dla klienta (Wallid)

## Co jest teraz

Wiadomość „płatność zaksięgowana" jest już wysyłana automatycznie z każdej ścieżki Wallid (powiadomienie z banku, sprawdzanie co 5 minut, ręczna synchronizacja w panelu). Problem leży wyżej: zamówienie nie zawsze zostaje oznaczone jako opłacone, a bez tego e-mail nie idzie.

Potwierdzone na zamówieniu Mariam (PHP-MU2Z2B5I): pierwsza próba płatności 15.09 nie powiodła się, zamówienie dostało status „nieudana płatność". Kolejnego dnia klientka zapłaciła z linku ponownego — Wallid zapisał SUCCESS o 09:57, ale zamówienie zostało zablokowane, bo automat pozwala przejść na „opłacone" tylko ze statusów oczekujących (`pending`, `pending_payment`, `awaiting_payment`, `processing_payment`, `needs_review`). Ze statusu „nieudana"/„wygasła" nie przechodzi. Efekt: brak e-maila, dopóki ktoś nie zrobi tego ręcznie (u Mariam o 12:15).

To dotyczy każdego klienta, który zapłaci po nieudanej pierwszej próbie — a takich prób w ostatnich dniach jest kilkanaście.

## Co zrobię

1. **Udana płatność zawsze wygrywa.** We wszystkich ścieżkach Wallid dopuszczam przejście na „opłacone" również ze statusów „nieudana", „wygasła", „anulowana płatność" i „do weryfikacji". Przejścia na „nieudana"/„wygasła" pozostają wąskie jak dziś, więc opłacone zamówienie nigdy nie cofnie się na nieudane.
2. **Sprawdzanie co 5 minut obejmie ponowne płatności.** Dziś cykliczne sprawdzanie pyta Wallid tylko o sesje w stanie oczekującym; dołożę też sesje FAILED/EXPIRED z ostatnich 48 h, których zamówienie nie jest jeszcze opłacone — czyli dokładnie przypadki linku „zapłać ponownie".
3. **Ręczne oznaczenie „opłacone" w panelu też wyśle potwierdzenie.** Gdy administrator sam przestawi zamówienie na opłacone, klient dostanie tę samą wiadomość (jednorazowo — istniejąca blokada powtórek zostaje).
4. **Ostrzeżenie w panelu** przy zamówieniach, gdzie Wallid raportuje SUCCESS, a zamówienie nie jest opłacone — żeby taka rozbieżność nie przeszła niezauważona.
5. **Zamówienie Mariam** doprowadzę do porządku po wdrożeniu (potwierdzenie już do niej poszło, więc bez ponownej wysyłki).

Treść e-maila, wygląd strony, adresy, kanał Google i konfiguracja płatności pozostają bez zmian.

## Szczegóły techniczne

- `allowFrom` rozszerzone o `failed`, `payment_failed`, `expired`, `cancelled_payment` (tylko przy `firestoreStatus === "paid"`) w: `src/routes/api/public/hooks/wallid.ts`, `src/routes/api/webhooks/wallid.ts`, `src/routes/api/public/hooks/wallid-reconcile.ts`, `src/routes/api/public/hooks/wallid-monitor.ts`, `src/lib/wallid-sync.functions.ts`, `src/routes/api/payments/status.ts`.
- `wallid-reconcile.ts`: zapytanie do `wallid_payments` obejmie także `FAILED`/`EXPIRED` (48 h) i pominie zamówienia już opłacone; limit 100 wierszy zostaje.
- `OrdersTab.tsx` → `handleStatusChange`: przy `status === 'paid'` wywołanie tego samego `enqueueMailOnce("payment-confirmed:{orderId}")` z `paymentConfirmedEmail`, źródło `admin:manual-paid` (deduplikacja bez zmian).
- Ostrzeżenie w panelu: w widoku zamówienia porównanie `wallid_payments.status === 'SUCCESS'` z lokalnym statusem, badge „Wallid: SUCCESS — zamówienie nieopłacone".
- Weryfikacja: `bunx tsgo --noEmit`, `bun run build`, test jednostkowy na dopuszczonych przejściach (paid z failed → tak, failed z paid → nie).
