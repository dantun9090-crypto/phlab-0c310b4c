# Zakładka Customers dla Pawła Osmańskiego

Paweł (szalony242@wp.pl) jest jedyną osobą z dostępem "tylko zamówienia". Dostanie też zakładkę **Customers**, tylko do podglądu.

## Co zobaczy
- W panelu admina: Orders + Customers. Nic więcej.
- W Customers może przeglądać i wyszukiwać klientów (imię, e-mail, adres, zamówienia).
- Nie może edytować, usuwać ani nadawać VIP/admina. Te przyciski są dla niego ukryte, a baza i tak je zablokuje.

## Zmiany techniczne
- `src/pages/Admin/index.tsx`: lista `ORDERS_ONLY_TABS` = ['orders','customers']; renderTab dla roli orders pokazuje Orders albo Customers zamiast zawsze Orders.
- `CustomersTab`: prop `readOnly`, który ukrywa akcje edycji, usuwania i zmiany ról.
- `firestore.rules`: `customers` read dla `isOrdersStaff()`; zapis bez zmian (tylko admin). Rules wdrożone na żywo, wpis w logu admina.
- Build, publikacja, purge Cloudflare, sprawdzenie na koncie testowym z tą samą rolą.
