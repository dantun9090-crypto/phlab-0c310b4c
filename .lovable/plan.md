# Ads: rozszerzenie tekstów w grupie reklam „PH"

Tylko propozycje. Nic nie idzie do Google bez Twojego „ok".

## Co jest teraz w „PH" (odczyt na żywo, właśnie sprawdzone)

- 11 krótkich nagłówków (limit Google: 15)
- 3 długie nagłówki (limit: 5)
- 6 opisów (limit: 5, z czego jeden musi mieć max 60 znaków)

Skutki: długie nagłówki zmieszczą się oba (3 + 2 = 5). Krótkich nagłówków możesz dodać maksymalnie 4, nie 5 (11 + 5 = 16, o jeden za dużo). Opisów slot jest już pełny — każdy nowy opis wymaga usunięcia jednego starego w tej samej zmianie.

## Długości — trzy teksty są za długie

Limit dla długiego nagłówka i opisu to 90 znaków. Policzone dokładnie:

| Tekst | Znaków | Status |
|---|---|---|
| Wszystkie 5 krótkich nagłówków | 19–27 | OK |
| „UK-based research peptide supplier with independent HPLC testing and searchable COA for every batch" | 99 | za długi |
| „Research-grade compounds with batch verification, tracked delivery and UK stock" | 79 | OK |
| „Every batch independently tested by HPLC and mass spectrometry. Search your COA by batch number online." | 103 | za długi |
| „UK stock with same-working-day dispatch. Temperature-controlled packaging and tracked insured delivery." | 103 | za długi |
| „Research use only. Not for human consumption. Certificate of Analysis provided for every batch." | 95 | za długi |

Proponowane skróty (bez zmiany sensu, wciąż zero nazw substancji i zero claimów):

- Długi nagłówek: „UK research peptide supplier with independent HPLC testing and COA for every batch" (82)
- Opis: „Every batch independently tested by HPLC and mass spectrometry. Search your COA online." (87)
- Opis: „UK stock, same-working-day dispatch. Temperature-controlled, tracked insured delivery." (85)
- Opis: „Research use only. Not for human consumption. COA provided for every batch." (75)

## Co proponuję dodać

Krótkie nagłówki (4 z 5 — powiedz, który odpada, albo usunę jeden istniejący):
1. Same-Day Dispatch UK
2. Independent Lab Verified
3. Search COA By Batch
4. Trusted UK Peptide Source
5. Temperature-Controlled Post

Długie nagłówki (oba):
1. UK research peptide supplier with independent HPLC testing and COA for every batch
2. Research-grade compounds with batch verification, tracked delivery and UK stock

Opisy (3 nowe, w miejsce 3 najsłabszych obecnych, bo slot jest pełny):
1. Every batch independently tested by HPLC and mass spectrometry. Search your COA online.
2. UK stock, same-working-day dispatch. Temperature-controlled, tracked insured delivery.
3. Research use only. Not for human consumption. COA provided for every batch.

Do usunięcia (najbardziej powtarzalne, treść i tak zostaje w nowych):
- „Every batch independently tested. View the COA for your batch online."
- „UK stock, tracked insured dispatch, temperature-controlled packaging."
- „Every batch verified by an independent laboratory. Research use only."

Zostają: „Independent HPLC testing and a COA for every batch, searchable by batch number.", „Independent Lab Analysis. Same-Day Dispatch. Order before 3pm GMT", „Temperature-controlled packaging, insured tracked delivery, docs included."

## Zgodność

Zero nazw substancji, zero claimów medycznych/zdrowotnych, framing research-use-only. „Same-day dispatch" pokrywa się z obecnym tekstem konta („order before 3pm GMT") — potwierdź, że to nadal prawda, bo inaczej to obietnica dostawy, której Google może zakwestionować.

## Czego nie ruszam

Budżet, licytacja, kierowanie, feed, negatywy, obrazy, logo, nazwa firmy, strona docelowa, kod strony. Nic na stronie się nie zmienia.

## Notatki techniczne

- Konto `customers/4410206709`, asset group „PH" `6733075399`.
- Jedna atomowa operacja: `assetOperation create` (temp id) + `assetGroupAssetOperation create` na każdy nowy tekst, plus 3 `assetGroupAssetOperation remove` dla zdejmowanych opisów, żeby Google sprawdził limity slotów na stanie końcowym.
- Wywołanie przez connector-gateway (`googleAds:mutate`, v22) — narzędzie projektowe zgłasza brak setupu.
- Po mutacji ponowny odczyt `asset_group_asset` i raport: co ma status ENABLED, ile jest tekstów na slot.
