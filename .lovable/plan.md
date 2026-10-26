# Google Ads + Merchant Center: MOTS-c i pełne sprawdzenie (tylko odczyt)

## Ile czekać po poprawce w Merchant Center
- Google zwykle sprawdza poprawiony produkt ponownie w ciągu 1–3 dni roboczych, czasem do 7 dni.
- Szybciej idzie, gdy w Merchant Center kliknie się „Poproś o weryfikację” przy produkcie albo gdy Google pobierze plik produktów od nowa (zwykle raz dziennie).
- Gdy produkt wróci jako „Zatwierdzony”, reklamy Performance Max zaczynają go pokazywać w ciągu kilku godzin.
- **Usunięty produkt nadal widoczny jako problem:** to normalne. Merchant Center pokazuje stary błąd, dopóki nie pobierze pliku produktów od nowa (do 24 h), a usunięty produkt znika z listy zwykle w 1–3 dni. Sprawdzę, czy ten produkt naprawdę zniknął z pliku, który Google pobiera, oraz kiedy Google ostatnio pobrał plik.

## Co sprawdzę (bez żadnych zmian)
1. **Plik produktów:** czy MOTS-c i 2 poprawione produkty są w pliku, z poprawnymi danymi (kategoria, MPN, cena, link, opis bez zakazanych słów).
2. **Merchant Center:** status MOTS-c i 2 poprawionych produktów, podany przez Google powód odrzucenia i czy czekają na ponowne sprawdzenie.
3. **Stan reklam:** czy kampania działa, ograniczenia (nauka, budżet, zasady), odrzucone elementy grupy reklam.
4. **Nauka kampanii:** czy nadal trwa nauka po przerwie i zmianie budżetu na £92, i kiedy powinna się skończyć.
5. **ROAS i konwersje:** wydatki, kliknięcia, zakupy i zwrot za ostatnie 14 dni dzień po dniu, w porównaniu z opłaconymi zamówieniami w sklepie. Cel 360% bez zmian.
6. **Śledzenie zakupów:** czy dzienny plik zamówień dla Google został pobrany dziś rano bez błędów.

## Co dostaniesz
- Krótki raport po polsku: zielony / żółty / czerwony dla każdego punktu, z prawdziwymi liczbami.
- Dla MOTS-c: dokładny powód od Google i konkretna poprawka.
- Najwyżej 1–2 sugestie. Nic nie zmienię w Google Ads ani w Merchant Center bez Twojej zgody.

## Szczegóły techniczne
- Odczyty Google Ads (konto 4410206709): campaign primary_status/reasons, asset_group i asset_group_asset statusy, metryki dzienne, change_event, diagnostyka offline uploadu.
- Merchant Center: statusy produktów przez API (jeśli połączenie ma dostęp); inaczej odczyt live `/google-merchant-feed.xml` i porównanie z regułami (bez Health & Beauty, MPN zamiast GTIN, bez tekstu zgodności w custom labels).
- Firestore `orders` dla opłaconych zamówień 13–26 X.
