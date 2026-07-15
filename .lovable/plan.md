# Full fix: Cloudflare Development Mode nie może już zepsuć strony

## Problem
Dev Mode na Cloudflare (zone `phlabs.co.uk`) omija cache dla całej strefy i **auto-wygasa po 3h**. Gdy się wyłącza, Prerender.io może serwować stare snapshoty z chunkami JS ze starego builda → **blank white page** dla realnych użytkowników.

Obecnie mamy tylko:
- Baner w adminie (`DevModeBanner`) — wymaga że ktoś patrzy w admin
- Watchdog (co 5 min) — tylko **alerty** na Telegram po 30 min i 120 min, **nie wyłącza** Dev Mode
- Ręczne API `setDevMode` — nikt tego automatycznie nie wywołuje

Efekt: jak ktoś (albo integracja) włączy Dev Mode i zapomni, po ~3h strona się psuje.

## Cel
Dev Mode **nigdy** nie może zostać włączony dłużej niż kilka minut na produkcji, a jak już wygaśnie/zostanie wyłączony — cache i Prerender.io muszą być natychmiast odświeżone, żeby nie było blank page. Bez dotykania UI, kolorów, layoutu, checkoutu, Firebase.

## Plan (5 kroków, wyłącznie backend + admin panel)

### 1) Auto-turn-off Dev Mode w watchdogu
W `src/routes/api/public/hooks/watchdog.ts`, funkcja `checkCloudflareDevMode`:
- Gdy `value === 'on'` i `ageMin >= 10` (10-minutowy grace period na realną pracę developera): wywołaj `PATCH /settings/development_mode` z `value: 'off'`.
- Zapisz `autoDisabledAt` do `watchdog/devmode_alerts` + audit log (`kind: 'watchdog_devmode_auto_off'`).
- Wyślij Telegram info: "Dev Mode auto-disabled po X min — cache i Prerender przewietrzone".
- Nie ruszam istniejących alertów 30 min / 120 min — zostają jako defence-in-depth (gdyby auto-off padło).

### 2) Auto-purge + auto-recache po wyłączeniu
Zaraz po udanym `value: 'off'` (albo gdy watchdog wykryje przejście `on → off` między cyklami — porównanie z `doc.sessionStartedAt` + brak `turnedOffAt`):
- `POST https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache` z `{ purge_everything: true }`.
- `POST https://api.prerender.io/recache` z listą krytycznych URLi: `/`, `/products`, `/sitemap.xml`, `/robots.txt`, wszystkie kategorie (jak w `src/lib/cache-invalidate.functions.ts`) — dla `desktop` i `mobile`.
- Wynik zapisany do `watchdog_runs` + audit log.

### 3) Grace-period configurable z admin panelu
Do `WatchdogTab.tsx` dodać jedno pole liczbowe: **"Auto-disable Dev Mode after N minutes"** (default 10, min 1, max 60), trzymane w Firestore `siteSettings/watchdogConfig.devModeGraceMin`. Watchdog czyta wartość na starcie cyklu. Nic więcej nie zmieniam w UI — tylko dokładam input w istniejący layout tabu.

### 4) Manualny przycisk "Force off + purge + recache" w banerze
W `DevModeBanner.tsx` obok "Turn off now" dołożyć drugi guzik **"Turn off + purge cache"** (ten sam styl, ten sam kolor). Wywoła nowy serverFn `setDevModeAndPurge` który robi kroki 1+2 synchronicznie i zwraca podsumowanie (purge status, prerender status). Baner pokaże toast/tekst z wynikiem.

### 5) Health-check hook (`/api/public/hooks/health-check.ts`) — utrzymać istniejący
Ten hook już eskaluje `admin_alerts` gdy widzi `devModeOn`. Zostawiamy bez zmian — działa jako niezależny sensor.

## Bezpieczeństwo (co MUSI zostać nietknięte)
- Żadnych zmian w `src/routes/__root.tsx`, `src/client.tsx`, `src/server.ts`, service workerze, recovery, chunk-retry — tam nic nie dotykam (świeżo po naprawie blank page).
- Żadnych zmian w checkoucie, Firebase rules, Wallid, Prerender workerze (`cloudflare/phlabs-prerender.mjs`), CSP, headerach.
- Header, kolory, layout, produkty — bez zmian.
- Grace period ≥ 1 min, żeby real developer (jeśli kiedykolwiek) miał chwilę pracy — ale nigdy więcej niż 60 min.
- `setDevMode` wymaga `requireFirebaseAdmin` — bez zmian. Watchdog uwierzytelnia się `x-watchdog-secret` — bez zmian.

## Weryfikacja przed zamknięciem
1. `bun run typecheck` + build lokalnie.
2. Włączyć Dev Mode ręcznie z panelu Cloudflare → poczekać na następny cykl watchdoga → sprawdzić w Firestore `auditLogs` wpis `watchdog_devmode_auto_off` i w `watchdog_runs` że purge + recache poszły.
3. Sprawdzić `curl -I https://phlabs.co.uk/` — `cf-cache-status: HIT` (albo `EXPIRED` → `HIT` na drugim requeście) po 30s od auto-off.
4. Testy e2e `e2e/blank-watchdog-*.spec.ts` muszą przejść bez zmian (nie ruszam kodu który testują).
5. Manualnie kliknąć "Turn off + purge cache" w banerze na preview → toast z wynikiem.

## Pliki do zmiany
- `src/routes/api/public/hooks/watchdog.ts` — dodaj auto-off + auto-purge + auto-recache w `checkCloudflareDevMode`
- `src/lib/cloudflare-devmode.functions.ts` — dodaj `setDevModeAndPurge` serverFn (reuse `purgeCloudflare` + prerender recache patternów z `cache-invalidate.functions.ts`)
- `src/pages/Admin/components/DevModeBanner.tsx` — drugi przycisk + wyświetlanie wyniku
- `src/pages/Admin/tabs/WatchdogTab.tsx` — jedno pole "grace minutes"
- (opcjonalnie) `src/lib/watchdog-config.functions.ts` — nowy plik, get/set `siteSettings/watchdogConfig`, admin-gated

## Czego NIE robię
- Nie tworzę nowego workflowu GitHub Actions ani cron zewnętrznego — istniejący cron watchdoga (co 5 min) jest wystarczający.
- Nie usuwam banera ani alertów Telegram — zostają jako fallback.
- Nie ruszam `phlabs-prerender` workera.
- Nie zmieniam TTL cache ani reguł CF poza samym Dev Mode.
