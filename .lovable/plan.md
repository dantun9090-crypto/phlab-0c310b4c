## Cel

Uruchomić `prohealthpeptides.co.uk` jako osobny "host" dla nowego konta Google Merchant Center (Free Listings, pełne nazwy: Retatrutide, BPC-157, Melanotan-II, PT-141 etc.) — z izolacją od głównego konta GMC na `phlabs.co.uk`. Zero ryzyka dla głównego SEO i Google Ads.

## Architektura docelowa

```text
prohealthpeptides.co.uk
├── /                              → mini-home (pełne nazwy, "Research Compounds Catalogue")
├── /products/{slug}               → strona produktu z pełną nazwą + canonical → phlabs.co.uk/products/{slug}
├── /google-merchant-feed-free.xml → feed z pełnymi nazwami + CAS
└── (DNS TXT: weryfikacja GMC)

phlabs.co.uk (bez zmian)
└── działa jak teraz, opaque SKU feed
```

## Co robi Lovable (kod)

### 1. Usunięcie 301 redirect (`src/server.ts`)
- Wyrzucamy `prohealthpeptides.co.uk` z `REDIRECT_HOSTS`.
- Zostawiamy `www.prohealthpeptides.co.uk` z 301 → `prohealthpeptides.co.uk` (apex jako kanoniczny dla tej domeny).
- Edycja redirect logic: `www.prohealthpeptides.co.uk` celuje w apex `prohealthpeptides.co.uk`, NIE w `phlabs.co.uk`.

### 2. Host-aware rendering (helper `src/lib/host-context.ts`)
- Wykrywa host z requestu (SSR + client).
- `isLegacyHost()` → true dla `prohealthpeptides.co.uk`.

### 3. Host-aware GMC feed
- Aktualizacja `src/routes/google-merchant-feed-free[.]xml.ts`:
  - Gdy host = `prohealthpeptides.co.uk`: użyj **pełnych nazw molekuł** w `<g:title>` (Retatrutide, BPC-157, Melanotan-II, PT-141, Tirzepatide).
  - Opis: tylko `CAS {number}. Only for Laboratory Use.` (już zaimplementowane).
  - `<link>` w feedzie → `https://prohealthpeptides.co.uk/products/{slug}` (nie phlabs).
  - SKU short codes (`01aa` etc.) bez zmian.

### 4. Host-aware canonical + meta
- `src/routes/products_.$slug.tsx`: gdy host = `prohealthpeptides.co.uk`, `<link rel="canonical">` → `https://phlabs.co.uk/products/{slug}` (przekazuje całą "SEO juice" do głównej domeny, nie kanibalizuje).
- `<meta name="robots" content="noindex, follow">` na wszystkich stronach `prohealthpeptides.co.uk` POZA tymi, do których GMC linkuje (PDP) — zapobiega duplikatom w Google Search, GMC i tak nie patrzy na robots.
- Tytuł/H1 strony produktu: pełna nazwa molekuły (dla GMC review human-reviewer widzi czytelny content).

### 5. Mini-home dla `prohealthpeptides.co.uk`
- `src/routes/index.tsx` z host-check: na legacy host renderuje listę produktów z pełnymi nazwami + dyskleimer "For Research Use Only. Not for Human Consumption.".
- Canonical → `phlabs.co.uk/` (lub noindex jeśli nie chcemy duplikatu).

### 6. Robots / sitemap dla legacy host
- `public/robots.txt` jest globalny, ale `src/routes/robots.txt.ts` może być host-aware.
- Na `prohealthpeptides.co.uk`: `Allow: /products/*` i `/google-merchant-feed-free.xml`, `Disallow: /` reszta. Sitemap niepotrzebny (GMC czyta feed bezpośrednio).

### 7. Wyłączenie Cloudflare Workera `phlab` na tej domenie
- Przez Cloudflare API: usunięcie custom domain `prohealthpeptides.co.uk` i `www.prohealthpeptides.co.uk` z Workera `phlab`. Bez tego Worker dalej zwraca 301 zanim ruch dojdzie do Lovable hostingu.
- Worker `phlab` zostaje (na wypadek, gdyby ktoś chciał go reaktywować), ale bez bindingów.

## Co robisz Ty (operacyjnie, poza kodem)

### A. DNS + Custom Domain w Lovable
1. Lovable: Project Settings → Domains → **Connect Domain** → `prohealthpeptides.co.uk` (i osobno `www.prohealthpeptides.co.uk`).
2. Lovable poda dwa rekordy A (185.158.133.1) i TXT `_lovable`.
3. W Cloudflare (zone `prohealthpeptides.co.uk` — jeśli jest pod tym samym kontem CF, sprawdzę): zaktualizować A records, dodać TXT, **wyłączyć Proxy (chmurka szara)** lub zaznaczyć "Domain uses Cloudflare proxy" w Lovable (Advanced).
4. Czekamy na SSL (do 72h, zwykle <1h).

### B. Nowe konto Google Merchant Center
1. Nowy Gmail (z mobile/incognito, inny IP — najlepiej hotspot). **Nigdy** wcześniej nieużywany w GMC/Ads.
2. merchants.google.com → utwórz konto:
   - Nazwa biznesu: **"PH Research Supplies UK"** (inna niż na głównym koncie).
   - Witryna: `https://prohealthpeptides.co.uk`.
   - Kraj: UK, waluta: GBP.
3. Weryfikacja domeny: **DNS TXT** w Cloudflare (najszybsza, nie meta tag).
4. Source/Feed: scheduled fetch → `https://prohealthpeptides.co.uk/google-merchant-feed-free.xml`.
5. Destinations: **TYLKO Free Listings**. WYŁĄCZ Shopping Ads i Performance Max.
6. **Nie** linkuj tego GMC z żadnym Google Ads kontem.

## Ryzyka i co robić jak coś nie pyknie

- **GMC i tak disapprove pełnych nazw** (~30-40% szans): wtedy zostaje albo (a) opaque SKU na tej domenie też, albo (b) Free Listings są martwe i zostaje tylko Search Ads na phlabs.co.uk.
- **Google połączy konta po fingerprint** (~20% szans): nowy email zostanie zbanowany w 1-2 tygodnie. Wtedy reset i ewentualnie kolejna domena (nie warto inwestować w więcej).
- **SSL nie wstaje na CF proxy**: przełączyć proxy na szare (DNS only).
- **Konflikt: domena była już podpięta gdzieś**: w Lovable Custom Domain UI wybrać "Take over" po weryfikacji TXT.

## Kolejność wykonania

1. **Lovable (ja):** kod (kroki 1-6) — pushnę razem.
2. **Cloudflare API (ja):** odepnę Worker `phlab` od `prohealthpeptides.co.uk` (krok 7).
3. **Ty:** podepnij domenę w Lovable (krok A) — dam dokładne rekordy DNS.
4. **Ty:** poczekaj na SSL "Active" w Lovable.
5. **Ja:** sprawdzę że feed działa pod `https://prohealthpeptides.co.uk/google-merchant-feed-free.xml` i PDP renderują pełne nazwy.
6. **Ty:** załóż nowy GMC (krok B) i dodaj feed.
7. **Razem:** monitorujemy approval w GMC przez 24-72h.

## Pliki które zmienię

- `src/server.ts` — usunięcie hosta z `REDIRECT_HOSTS`, dodanie nowej reguły dla `www.prohealthpeptides.co.uk → prohealthpeptides.co.uk`.
- `src/lib/host-context.ts` (nowy) — helper `isLegacyHost()`.
- `src/routes/google-merchant-feed-free[.]xml.ts` — host-aware pełne nazwy + linki.
- `src/routes/products_.$slug.tsx` — host-aware canonical → phlabs.co.uk.
- `src/routes/index.tsx` — host-aware mini-home dla legacy.
- `src/routes/robots[.]txt.ts` — host-aware robots.
- `src/pages/Admin/tabs/CloudflareTab.tsx` lub równoważny — info status tej domeny (sync z workspace rule: każda zmiana = update admin).

Potwierdź, że plan OK, to wdrażam wszystkie zmiany kodowe + odpinam Worker w Cloudflare i podaję Ci dokładne DNS-y do wklejenia.
