
# Klonowanie phlabs.co.uk jako druga marka

## TL;DR
Tak — w Lovable robi się to przez **Remix**. Ale remix kopiuje **tylko kod**, więc dla prawdziwej drugiej marki musisz osobno założyć nowy Firebase, nowe konta płatności, nową domenę w Cloudflare i nowy GMC. Inaczej Google połączy oba sklepy (znów ten sam problem co teraz z prohealthpeptides).

## Krok po kroku

### 1. Remix projektu w Lovable
- Dashboard → prawy klik na projekt **phlabs** → **Remix**
- Albo wewnątrz edytora: nazwa projektu (lewy górny róg) → Settings → **Remix this project**
- Dostajesz nowy projekt z pełną kopią kodu, własnym preview URL, niezależną historią. Oryginał (phlabs) zostaje nietknięty.

### 2. Co remix kopiuje, a czego NIE
**Kopiuje:** cały kod (routes, komponenty, style, admin panel, workery, testy), `firestore.rules`, `wrangler.jsonc`, workflowy CI.
**NIE kopiuje:**
- Firebase (produkty, klienci, zamówienia, Storage z obrazkami, Auth) — to żyje na koncie phlabs
- Sekretów (`FIREBASE_SERVICE_ACCOUNT_JSON`, `STRIPE_SECRET_KEY`, `FENA_API_KEY`, `CLOUDFLARE_API_TOKEN`, `PRERENDER_TOKEN` itd.)
- Cloudflare Workerów, DNS, stref
- Connectorów (Outlook, Polar, Supabase telegram-bot)
- GMC feed/konta, GSC properties, GA4

### 3. Co musisz zrobić ręcznie po remixie (kolejność)
1. **Nowy Firebase project** w console.firebase.google.com → włącz Firestore + Auth + Storage → wygeneruj nowy service account JSON.
2. **Podmień** w sklonowanym projekcie `VITE_FIREBASE_*` w `.env` i `FIREBASE_SERVICE_ACCOUNT_JSON` w secrets.
3. **Zaimportuj produkty** — albo ręcznie, albo skryptem (mamy `firebase-admin` w projekcie) który ściągnie z phlabs i wgra do nowego z innym brandingiem/opisami.
4. **Domena + Cloudflare** — nowa strefa CF, nowy `CLOUDFLARE_API_TOKEN`, nowe zone ID. Worker `phlabs-prerender` skopiować pod nową nazwą i zbindować do nowej domeny.
5. **Nowe konta płatności** — osobny Stripe account (osobne webhooki, osobny dashboard), osobny Fena terminal, osobny TrueLayer client.
6. **Nowy GMC + GA4 + GSC** — żeby Google nie połączył kont (już masz 2 osobne GMC, więc to się zgadza).
7. **Branding** — zamiana logo, nazwy, kolorów (jeśli inne), tytułów, meta, JSON-LD organization name, footer NAP, social `sameAs`, email templates.
8. **Treść** — najlepiej przepisz opisy produktów (nawet parafraza wystarczy, żeby Google nie widział duplicate content między phlabs a drugą marką).
9. **Compliance check** — `landing-banned-tokens-scan`, `compliance-scan` muszą przejść na nowej marce (te same reguły UK).
10. **Publish** w Lovable → connect custom domain → SSL → done.

### 4. Co zostawić wspólne (bezpiecznie)
- Workflowy CI (jeśli pasują)
- Style design-system (chyba że robisz inne kolory)
- Komponenty UI, hooks, util libs
- Stack tech (TanStack, Firebase SDK, Tailwind)
- Cloudflare worker logic (kod) — tylko bindingi/secrets osobne

### 5. Czego pilnować (pułapki)
- **Sekretów z phlabs NIE wgrywaj na drugi projekt.** Jeden wyciek = oba sklepy padają.
- **`firebase.json` + `.firebaserc`** — muszą wskazywać na NOWY Firebase project, inaczej `firebase deploy` z drugiego sklepu nadpisze rules phlabs.
- **Telegram bot, Outlook connector, IndexNow key** — wszystko trzeba przekonfigurować osobno.
- **Sitemap, robots.txt, canonical, hreflang, JSON-LD `sameAs`** — wszystkie URL-e muszą wskazywać na nową domenę, nie phlabs.co.uk.
- **GMC feed routes** (`google-merchant-feed-free.xml`, `google-ads-safe-feed.xml`, `bing-feed.xml`) — odwołują się do `SITE_URL`/produktów; po podmianie ENV powinny działać automatycznie, ale trzeba zweryfikować.
- **Admin → wszystkie taby** (Health Monitor, Visitors, Telegram, IndexNow, BackLink, Semrush, Microsoft Ads, Bing UET) — każdy z nich ma osobne tokeny/IDs do podmiany.

## Czego jeszcze potrzebuję
Żebym mógł zrobić pełen, gotowy do wykonania remix-plan z konkretnymi plikami do podmiany i skryptem migracji produktów, daj znać:
- **(a)** nazwa + domena drugiej marki (mam zakładać `prohealthpeptides.co.uk`?),
- **(b)** czy chcesz, żebym po remixie napisał skrypt migracji `products` z phlabs → nowy Firebase (z opcjonalną parafrazą opisów),
- **(c)** czy branding (logo/kolory) zostaje identyczny jak phlabs, czy chcesz inny.

Sam remix robisz Ty w UI Lovable — ja nie mam tool'a żeby kliknąć "Remix" za Ciebie. Po tym jak nowy projekt powstanie, otwórz go i powiedz mi co podmieniać — wtedy lecę z (2)–(9) krok po kroku w tamtym projekcie.
