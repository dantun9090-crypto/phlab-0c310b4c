## Cel

Naprawić 4 problemy zgłoszone przez użytkownika w admin panelu → Inventory:
1. **Zapis nie działa / błąd** — niejasne komunikaty, brak wskazania które pole jest złe
2. **Upload zdjęć się wywala** — retry nie zawsze pomaga, brak sensownej informacji dlaczego
3. **Formularz niewygodny** — 1193 linie w jednym scrollu, wszystko na raz
4. **Warianty (200mg/500mg) źle działają** — ceny/stock potrafią się zresetować, drag nie zawsze łapie

## Co zbuduję

### 1. Zakładki w `ProductEditor` (zamiast jednego scrolla)

5 zakładek na górze modala, z licznikami błędów w każdej:

```text
┌─────────────────────────────────────────────────────────┐
│ [Basics ●] [Images] [Variants ●] [SEO] [COA & HPLC]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  aktywna zakładka                                       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ ● Autosaved 2s ago          [Preview] [Cancel] [Save]   │
└─────────────────────────────────────────────────────────┘
```

- **Basics** — nazwa, slug, kategoria, cena, stock, purity, visibility, krótki + długi opis
- **Images** — 4 sloty + banner (bez zmian w logice uploadu, tylko lepszy UI błędu)
- **Variants** — lista wariantów, drag, walidacja unikalnych SKU
- **SEO** — meta title, description, canonical, keywords, MerchantFeedPreview
- **COA & HPLC** — PDF COA + chromatogramy HPLC per wariant

Kropka `●` przy zakładce = są tam błędy walidacji.

### 2. Live walidacja (Zod)

Schema Zod dla produktu. Po każdej zmianie pola pokazuje błąd **przy polu** (czerwony tekst pod inputem), nie na dole modala. Save disabled dopóki są błędy w wymaganych polach. Save button pokazuje np. „3 błędy w Variants" jeśli walidacja nie przeszła — użytkownik od razu widzi gdzie iść.

### 3. Autosave (tylko dla istniejących produktów)

- Debounce 2s po ostatniej zmianie → wywołuje `updateProduct(id, delta)`
- Wskaźnik statusu: `● Saving...` / `✓ Saved 2s ago` / `⚠ Save failed — retry`
- **Nowe produkty** — autosave wyłączony, wymaga explicit „Create Product" (bo nie ma jeszcze id i musimy walidować kompletność)
- Upload zdjęć/COA/HPLC zapisuje się natychmiast po zakończeniu uploadu (bez debounce), więc jak zamkniesz modal po uploadzie — plik już jest zapisany

### 4. Inline edit w tabeli Inventory

W kolumnach **Price** i **Stock** — kliknięcie w wartość zamienia ją w input, Enter/blur zapisuje przez `updateProduct`. Loading spinner podczas save. Toast (sonner) o sukcesie/błędzie.

Kolumna **Visibility** — dodać nowy chip z dropdownem: active / hidden / out_of_stock, zmiana zapisuje inline.

Bez otwierania modala dla drobnych zmian ceny/stocku — 90% edycji tego wymaga.

### 5. Lepsze błędy uploadu zdjęć

Rozszerzyć obecny error handler o rozpoznawanie:
- `storage/quota-exceeded` → „Firebase Storage quota exceeded — skontaktuj się z adminem"
- `storage/canceled` → „Upload przerwany — spróbuj ponownie"
- błąd sieci (`Failed to fetch`) → „Brak internetu lub CORS — sprawdź połączenie"
- fallback: pokazać `error.code` w tooltipie żeby dało się zdiagnozować

## Techniczne szczegóły

- **Nie zmieniam** logiki `updateProduct` / `addProduct` w `src/lib/firebase.ts` — działają
- **Nie zmieniam** Firestore rules ani upload pathów (`products/{id}/images/...`) — działają
- **Nie zmieniam** compliance/sanitize logic (`sanitizeLab`, `checkComplianceAndLog`) — wymagane
- Refactor `ProductEditor.tsx` (1193 → ~1400 linii z tabami, ale dużo bardziej czytelne). Zakładki jako komponenty w tym samym pliku, żeby nie mnożyć plików.
- Nowy plik `src/lib/product-schema.ts` — Zod schema + typy walidacji
- `InventoryTab.tsx` — dodać `<InlineEditCell>` mini-komponent (tylko w tym pliku)
- Zachowuję **wszystkie** obecne funkcje: HPLC upload, COA upload, banner, sanitize, compliance guard, drag variants, prerender/indexnow ping po save

## Czego NIE robię (żeby nie rozszerzać scope)

- Nie przepisuję logiki wariantów od zera — poprawiam tylko drag+walidację unikalnych SKU
- Nie przenoszę uploadu na serwer (obecnie klient → Firebase Storage bezpośrednio) — to inna historia
- Nie ruszam layoutu tabeli Inventory, tylko dodaję inline edit w istniejących kolumnach
- Nie ruszam headera admina, motywu, kolorów

## Test plan po wdrożeniu

1. Otworzyć produkt → zmienić cenę w Basics → poczekać 2s → sprawdzić „Saved" indicator
2. Dodać nowy produkt → puste pola → sprawdzić że Save pokazuje „3 błędy in Basics"
3. Wgrać zdjęcie → sprawdzić czy leci upload i url wraca
4. Dodać wariant z tym samym SKU co inny → sprawdzić błąd walidacji
5. W tabeli Inventory kliknąć w cenę → zmienić → Enter → sprawdzić toast + odświeżenie

Potwierdź plan a wchodzę w implementację. Powiedz też **którego produktu dotyczył problem** (nazwa/SKU) — sprawdzę czy w Firestore nie ma czegoś dziwnego w danych (np. broken images array, missing slug) co mogło spowodować „nic nie działa".