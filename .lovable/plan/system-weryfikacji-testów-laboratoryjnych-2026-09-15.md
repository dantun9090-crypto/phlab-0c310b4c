# System weryfikacji testów laboratoryjnych

Baza testów partii (Uther Pharmaceuticals: Janoshik / Chromate / CuriousChems), panel do zarządzania nią oraz publiczna strona `/verify`, na której klient sprawdza partię bez logowania.

Ustalenia: adres publiczny **`/verify` po angielsku**, importujemy **tylko produkty ze sklepu**, zaimportowane wiersze są **domyślnie ukryte** (włączasz je przełącznikiem), **kody QR od razu**.

Żadne istniejące adresy, slugi, linki produktowe, canonical, JSON-LD ani feedy nie zostaną zmienione. `/verify` to nowy adres, dodany do sitemapy.

## 1. Baza danych

Nowa tabela testów: produkt, etykieta (mg), partia, kolor nakrętki, data testu, masa i czystość próbki 1 i 2, wyliczana średnia masy i czystości, link do raportu laboratorium, źródło laboratorium, znacznik „publiczny", daty utworzenia/aktualizacji.

Zasady dostępu: każdy może odczytać wyłącznie wiersze oznaczone jako publiczne; dodawanie, edycja i usuwanie tylko przez panel administracyjny. Indeksy na produkcie, partii i dacie testu, żeby wyszukiwanie było natychmiastowe.

## 2. Panel administracyjny — nowa zakładka „Lab Tests"

- Tabela: produkt, etykieta, partia, kolor, data, próbka 1, próbka 2, średnia, laboratorium, przełącznik „publiczny", akcje.
- Wyszukiwanie na żywo (opóźnienie 300 ms) po produkcie, partii, kolorze i dacie; sortowanie po każdej kolumnie; strony po 25/50/100 wierszy.
- Czystość kolorowana: od 99% zielona, 98–99% żółta, poniżej 98% czerwona. Laboratorium jako kolorowa etykieta.
- Import z pliku CSV: podgląd, przypisanie kolumn pliku do pól bazy, walidacja (czystość 0–100%, daty w formacie MM/DD/YY lub RRRR-MM-DD, pusta próbka 2 = test jednopróbkowy), pomijanie duplikatów po partii i linku, raport „dodano X, pominięto Y". Do pobrania wzór pliku CSV.
- Ręczne dodawanie i edycja w okienku z walidacją i automatyczną średnią.
- Akcje w wierszu: kopiuj link do partii, kopiuj link produktu, kopiuj gotowy tekst do maila, kod QR (okienko z podglądem i pobraniem PNG), usuń z potwierdzeniem.
- Każda zmiana zapisywana w dzienniku działań administratora, jak pozostałe zakładki.

## 3. Strona publiczna `/verify`

Trzy tryby, dane pobierane po stronie przeglądarki (widoczne od razu po włączeniu przełącznika, bez ponownej publikacji):

1. `?batch=…` — karta jednej partii: produkt z etykietą, duży numer partii, kolor nakrętki z kropką, data, tabela próbek i średniej, duża etykieta czystości, źródło laboratorium, przycisk „View full lab report" otwierany w nowej karcie, oznaczenie „Verified by an independent laboratory". Brak partii lub partia nieopublikowana → przyjazny komunikat z odnośnikiem do kontaktu.
2. `?product=…` — wszystkie publiczne testy produktu, od najnowszego, z liczbą testów i odnośnikami do raportu i karty partii.
3. Bez parametrów — pole wyszukiwania (od 2 znaków, podpowiedzi), kafelki produktów ze sklepu, sekcja „How verification works".

Tytuł i opis strony, dane strukturalne FAQ, obsługa nieznanej partii, wygląd spójny ze sklepem, jasny i ciemny motyw, opisy dla czytników ekranu na przyciskach kopiowania. Na stronie widnieje wymagana nota „For Research Use Only. Not for Human Consumption." — treść wyłącznie analityczna (masa, czystość), bez twierdzeń o działaniu.

## 4. Integracja ze sklepem

- Na stronie produktu sekcja „Certificates & lab testing" z oznaczeniem „Lab tested" i przyciskiem do wyników — pokazywana tylko wtedy, gdy produkt ma co najmniej jeden publiczny test.
- Odnośnik „Lab Test Verification" w menu i w stopce.
- `/verify` dopisane do sitemapy; adres dostępny dla robotów i prerenderu.

## 5. Dane z PDF-a

Z przesłanego pliku wyciągam wiersze i przygotowuję plik CSV zawężony do 14 produktów ze sklepu (dopasowanie nazw z pliku do nazw sklepowych, np. TB-500 (TB4) → TB-500). Wiersze z niepoprawną czystością lub bez linku do raportu trafiają na listę odrzuconych do Twojego wglądu. Import wykonujesz sam w panelu (albo zrobię to na Twoje polecenie) — wszystko wchodzi jako ukryte.

## Szczegóły techniczne

- Tabela `lab_tests` w Lovable Cloud (Postgres) + RLS: `SELECT` dla `anon`/`authenticated` tylko przy `is_public = true`; brak polityk zapisu dla tych roli. GRANT-y zgodnie z politykami, `service_role` pełny. Trigger `updated_at`, kolumny `avg_mass`/`avg_purity` jako `GENERATED`.
- Uwierzytelnianie panelu jest w Firebase, więc RLS nie widzi admina: wszystkie operacje zapisu przez `createServerFn` w `src/lib/lab-tests.functions.ts`, które weryfikuje token Firebase (`verifyAdminRequest` z `src/lib/server/firebase-auth-admin.ts`) i dopiero wtedy używa `supabaseAdmin` (import wewnątrz handlera). Klucz service_role nigdy nie trafia do przeglądarki.
- Odczyt publiczny: przeglądarkowy klient `@/integrations/supabase/client` + React Query (`staleTime`, stale-while-revalidate), parsowanie CSV lokalnie (`papaparse`), QR przez `qrcode` (canvas → PNG).
- Zakładka `src/pages/Admin/tabs/LabTestsTab.tsx` zarejestrowana w `src/pages/Admin/index.tsx`; formularze w stylu panelu (`border-2 border-slate-600`, `bg-slate-800`, `min-h-[48px]`).
- Nowa trasa `src/routes/verify.tsx` (`head()` z tytułem, opisem, og/twitter, canonical `https://phlabs.co.uk/verify`), architektura renderowania bez zmian, CSP w `src/server.ts` nietknięte.
- Po zmianach: `bunx tsgo --noEmit`, `bun run build`, test Playwright dla `/verify` (partia publiczna, partia ukryta, tryb produktu).

## Kolejność prac

1. Tabela + zasady dostępu + funkcje serwerowe.
2. Zakładka w panelu: tabela, wyszukiwanie, edycja, import CSV, akcje kopiowania, QR.
3. Strona `/verify` (trzy tryby, SEO, FAQ).
4. Integracja: strony produktów, menu, stopka, sitemapa.
5. Przygotowanie CSV z PDF-a + weryfikacja buildu i testów.
