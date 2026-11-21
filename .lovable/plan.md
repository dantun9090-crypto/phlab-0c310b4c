# Diagnoza: przycisk „Publish changes" (tylko odczyt, nic nie zmieniono)

## Ustalenia
1. **Synchronizacja z GitHub: OK, brak rozbieżności.** Projekt w Lovable ma już najnowszy commit `00a9243e fix(auth): move login lockout server-side` (21 XI 17:56 UTC), a pod nim `d5d99c13` (worker) i `28aac7c3` (deps). Nie trzeba niczego ściągać, nie ma konfliktu.
2. **Publikacja: aktualna.** Ostatnia publikacja 21 XI **18:16 UTC**, czyli po wszystkich trzech commitach. System raportuje `has_unpublished_changes: false`.
3. **Główna przyczyna:** „Publish changes" nic nie robi, bo nie ma czego publikować. Lista „unpublished commits" w okienku jest nieaktualna (zapamiętany stan sprzed 18:16). Pochodzi z interfejsu edytora, nie z kodu sklepu. Odświeżenie edytora powinno ją wyczyścić.
4. **Advanced checks:** ostatni skan jest kompletny. Ma 5 uwag, w tym 3 poważne:
   - ceny z koszyka klienta używane przy tworzeniu zamówienia,
   - token Prerender.io w publicznie czytelnym Firestore,
   - zapis do Firebase Storage dla każdego zalogowanego.
   Nie blokują publikacji (ostatnia przeszła). Etykieta „outdated" oznacza tylko, że skan jest starszy niż ostatni commit.
5. W konsoli w chwili kliknięcia nie ma błędu związanego z publikacją. Są tylko ostrzeżenia GTM/Bing i chwilowe zerwania połączenia z Firestore.

## Ograniczenia
- Nie widzę samego okienka edytora. Punkt 3 to wniosek z danych publikacji, nie zrzut kliknięcia.
- Mój odczyt z API GitHuba zwrócił 401 (zły token connectora). Stan main sprawdziłem więc przez historię zsynchronizowaną z projektem.

## Proponowane kroki (czekają na Twoją zgodę)
1. Ty: odśwież edytor (Ctrl+Shift+R) i otwórz ponownie okienko Publish. Lista commitów powinna zniknąć.
2. Ja (po zgodzie): ponowny skan bezpieczeństwa, żeby zdjąć etykietę „outdated". Ten krok tylko czyta i nie zmienia plików.
3. Opcjonalnie później: osobny plan naprawy 3 poważnych uwag ze skanu.
4. Opcjonalnie: odnowienie połączenia GitHub (401) w ustawieniach connectorów.
