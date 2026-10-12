# Google Ads: sprawdzenie konwersji (12 X 2026)

## Wynik

- OK: Google liczy sprzedaż tylko z jednego źródła, „Purchase (offline import)”. „Purchase (website)” nie jest liczona do wyniku, więc zakupy nie liczą się podwójnie.
- OK: plik ze sprzedażą działa (odpowiada 200) i ma 139 sprzedaży z kliknięć Google. Ostatnia jest z 10 X. Sprzedaże z 11–12 X jeszcze nie weszły, bo plik ma celowo 48 godzin opóźnienia.
- OK: Google ocenia import jako „Excellent”: przyjęto 137 ze 137 sprzedaży, bez błędów.
- Do sprawdzenia: ostatnie pobranie przez Google było 11 X o 06:10–06:49. Dzisiejszego porannego pobrania (12 X) Google jeszcze nie pokazuje. Może to być opóźnienie raportu Google albo pominięte pobranie.
- Do sprawdzenia: Google pokazuje 0 sprzedaży z reklam za 9, 10 i 11 X. Wydatek w tych dniach to £93.81, £102.02 i £98.45. Dwie sprzedaże z 10 X są już w pliku, ale Google ich jeszcze nie pobrał. Za 9 X w pliku nie ma żadnej sprzedaży z kliknięcia Google.
- Bez zmian (do decyzji): nadal włączonych jest 6 starych akcji z kampanii Smart (telefony, dojazd), oznaczonych jako główne. Nic nie zbierają, ale zaśmiecają cele.

## Co zrobię po akceptacji (bez zmian w Google Ads)

1. Jutro po 07:00 sprawdzę, czy Google pobrał plik i czy weszły sprzedaże z 10 X. Jeśli nie, sprawdzę harmonogram pobierania i zgłoszę, co nie działa.
2. Sprawdzę 3 opłacone zamówienia z 9 X: czy klient przyszedł z reklamy Google i czy brak numeru kliknięcia to błąd zapisu.
3. Przygotuję listę 6 starych akcji do wyłączenia lub przestawienia na drugorzędne. Wykonam to dopiero po Twoim „tak”.

## Szczegóły techniczne

- Odczyt: conversion_action, customer segmentowany po dacie i akcji, offline_conversion_upload_conversion_action_summary (WEB_CLIENT i ADS_DATA_CONNECTOR: 137/137, EXCELLENT).
- Plik: /api/public/hooks/offline-conversions.csv (Basic auth), kolumny bez Email, okno 48 h–90 dni.
- Krok 2: Firestore orders z 9 X, pola gclid/gbraid/wbraid.
