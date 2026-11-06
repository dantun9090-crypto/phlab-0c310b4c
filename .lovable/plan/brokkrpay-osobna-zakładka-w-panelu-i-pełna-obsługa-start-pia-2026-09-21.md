# BrokkrPay — osobna zakładka w panelu i pełna obsługa (start: piaskownica)

Nowa bramka dodawana **obok** Wallid Pay-by-Bank. Wallid pozostaje domyślną i nietkniętą metodą płatności. BrokkrPay startuje w trybie testowym, wyłączony na publicznym checkoucie do momentu, gdy sam go włączysz w panelu.

## Co musisz wiedzieć przed zatwierdzeniem

- **To odstępstwo od Twojej zasady „tylko Wallid”.** Po zatwierdzeniu zapiszę to w pamięci projektu, żeby kolejne sesje tego nie usuwały.
- **BrokkrPay rozlicza wyłącznie w dolarach i tylko w pełnych dolarach** — nie ma centów. Zamówienie £39.98 musi zostać przeliczone na pełną kwotę w USD. Zgodnie z Twoją decyzją kurs ustawiasz ręcznie w zakładce, a kwota jest zaokrąglana **w górę** do pełnego dolara (klient nigdy nie zapłaci mniej niż wartość zamówienia).
- **Na wyciągu z karty i na paragonie klient zobaczy nazwę i artykuły partnera handlowego**, nie PH Labs. Wymagany komunikat pojawi się przy przycisku płatności, na stronie potwierdzenia i w e-mailu.
- Dane karty zbierane są wyłącznie na hostowanej stronie płatności — na phlabs.co.uk nie pojawia się żaden formularz karty.
- Zapłata jest księgowana **tylko** po podpisanym powiadomieniu o statusie `SUCCESS`; powrót klienta na stronę to sam komunikat wizualny.
- Nie zrobię prawdziwej płatności live — testy w piaskownicy kartą testową wykonasz sam z zakładki.

## Nowa zakładka „BrokkrPay” w panelu

Osobna zakładka (obok obecnej zakładki Płatności), w tym samym stylu co reszta panelu, z czterema sekcjami:

1. **Status i klucz** — stan sklepu w BrokkrPay, tryb test/live, czy checkout jest gotowy (i dlaczego nie), kto obciąża kartę, waluta, adres portalu. Plus pole kursu GBP→USD z zapisem i podglądem przykładu („£39.98 → $NN”), oraz przełącznik „BrokkrPay widoczny na checkoucie” (domyślnie wyłączony).
2. **Rejestracja powiadomień jednym klikiem** — przycisk ustawiający adres powiadomień i zapisujący sekret automatycznie, bez ręcznego kopiowania. Pokazuje aktualnie zarejestrowany adres.
3. **Płatność testowa + podgląd zdarzeń** — tworzenie linku testowego na dowolną kwotę (link otwierany w nowej karcie), sprawdzanie czy kwota jest dopuszczalna, oraz lista ostatnich przychodzących powiadomień ze statusem i numerem zamówienia.
4. **Zamówienia BrokkrPay** — wyszukiwanie po Twoim numerze zamówienia lub identyfikatorze BrokkrPay, ponowne wysłanie linku e-mailem, anulowanie nieopłaconego linku, pełny stan zamówienia.

Wszystko chronione tokenem administratora — żadna z tych operacji nie jest wywoływalna anonimowo.

## Checkout (nieaktywne do Twojego włączenia)

- Drugi kafelek metody płatności obok Pay by Bank, w obecnych kolorach i układzie, z wymaganym komunikatem o partnerze handlowym nad przyciskiem.
- Kafelek pojawia się tylko wtedy, gdy przełącznik w panelu jest włączony **i** klucz działa. Serwer sprawdza to samodzielnie, więc ominięcie interfejsu nic nie daje.
- Kwota do obciążenia zawsze wyliczana z zamówienia w bazie, nigdy z przeglądarki.

## Szczegóły techniczne

- `src/lib/brokkrpay.server.ts` — klient API (`https://api.brokkrpay.com`): `createPaymentLink` (whole units USD, nagłówek `Idempotency-Key` = id zamówienia), `getOrder`, `findByReference`, `resendEmail`, `cancelOrder`, `getSite`, `setWebhook`, `checkAmount`; weryfikacja podpisu `Brokkr-Signature` (`t=…,v1=…`, HMAC-SHA256 nad `"<t>.<raw body>"`, okno 5 min, porównanie w czasie stałym istniejącym `timingSafeEqualStr`). Klucz tylko z `BROKKRPAY_API_KEY` / sekret z `BROKKRPAY_WEBHOOK_SECRET`, czytane w handlerach.
- `src/lib/brokkrpay-fx.ts` + zapis w `site_config/brokkrpay` — kurs, `enabled`, tryb; przeliczanie `ceil(gbp * rate)`, wspólne dla serwera i podglądu w panelu.
- `src/routes/api/payments/brokkrpay-create.ts` — kopiuje model bezpieczeństwa z `peptidepay-create.ts`: limit żądań po IP, token Firebase lub jednorazowy `paymentToken` gościa, `buildOrderCtxForPayment` (własność + status), kwota z Firestore, kontrola zgodności kwoty z żądania, zapis `paymentProvider: "brokkrpay"`, `brokkrpayOrderId`, kursu i kwoty USD na zamówieniu.
- `src/routes/api/public/brokkrpay-webhook.ts` — `request.text()` przed parsowaniem, weryfikacja podpisu (401 przy braku/niezgodności), idempotencja przez dokument `brokkrpay_webhook_events/{orderId}_{state}`, dopasowanie po `reference`, zmiana statusu atomowo przez `transitionDocStatusAdmin`, e-mail potwierdzający przez `enqueueMailOnce`, obsługa `test: true` (zerowy identyfikator — logowane, bez skutków), odpowiedź 2xx poniżej 10 s.
- `src/lib/brokkrpay-admin.functions.ts` — funkcje serwerowe dla zakładki, wszystkie za `requireFirebaseAdmin`.
- `src/routes/api/payments/status.ts` — rozpoznaje `paymentProvider === "brokkrpay"` i dopytuje `GET /api/orders/{id}`, gdy powiadomienie jeszcze nie dotarło.
- `src/components/PaymentMethodOptions.tsx` — drugi kafelek + komunikat o partnerze handlowym; bez zmian układu, nagłówka i tokenów kolorów.
- CSP: dodanie `api.brokkrpay.com` do `connect-src` po stronie serwera tylko jeśli okaże się potrzebne (przekierowanie jest zwykłą nawigacją).
- Testy: `tests/brokkrpay-signature.test.ts` (poprawny podpis, zmodyfikowane ciało → 401, przedawniony znacznik czasu, brak nagłówka), `tests/brokkrpay-fx.test.ts` (zaokrąglanie w górę, granice), test idempotencji podwójnego powiadomienia. Po zmianach typecheck + build.
- `.env.example`: `BROKKRPAY_API_KEY`, `BROKKRPAY_WEBHOOK_SECRET`.

## Czego nie ruszam

Wallid i jego webhook, tworzenie zamówień, ceny, wysyłka, sitemap/SEO, nagłówek strony, analityka, Cloudflare Worker, prerender.

## Co potrzebuję od Ciebie

Klucz testowy `bpk_test_…` z portalu BrokkrPay — poproszę o niego bezpiecznym formularzem po zatwierdzeniu planu (nie wklejaj go do czatu). Sekret powiadomień zapiszę automatycznie z odpowiedzi API przy rejestracji adresu.
