# Ads: rozszerzenie tekstów w grupie reklam „PH"

Zaakceptowane przez Ciebie, z Twoją korektą. Jedna atomowa zmiana, potem odczyt kontrolny.

## Stan obecny (odczyt na żywo)

- 11 krótkich nagłówków (limit 15)
- 3 długie nagłówki (limit 5)
- 6 opisów (slot pełny)

## Krótkie nagłówki: +5, −1 → 15

Dodaję: Same-Day Dispatch UK · Independent Lab Verified · Search COA By Batch · Trusted UK Peptide Source · Temperature-Controlled Post

Usuwam: „Purity Verified By HPLC" (redundancja z „HPLC-Verified Purity").

Po zmianie: 15 krótkich nagłówków, dokładnie limit Google.

## Długie nagłówki: +2 → 5

1. UK research peptide supplier with independent HPLC testing and COA for every batch (82)
2. Research-grade compounds with batch verification, tracked delivery and UK stock (79)

## Opisy: wymiana 3 → 3

Dodaję:
1. Every batch independently tested by HPLC and mass spectrometry. Search your COA online. (87)
2. UK stock, same-working-day dispatch. Temperature-controlled, tracked insured delivery. (85)
3. Research use only. Not for human consumption. COA provided for every batch. (75)

Usuwam:
- Every batch independently tested. View the COA for your batch online.
- UK stock, tracked insured dispatch, temperature-controlled packaging.
- Every batch verified by an independent laboratory. Research use only.

Zostają: „Independent HPLC testing and a COA for every batch, searchable by batch number.", „Independent Lab Analysis. Same-Day Dispatch. Order before 3pm GMT", „Temperature-controlled packaging, insured tracked delivery, docs included."

## Zgodność

Zero nazw substancji, zero claimów medycznych/zdrowotnych, framing research-use-only. Same-day dispatch potwierdzone przez Ciebie (zamówienia do 14:00, dni robocze). Uwaga: jeden z pozostających opisów mówi „order before 3pm GMT" — jeśli faktyczna odcięta to 14:00, ten tekst też warto poprawić; powiedz, czy dopisać to do tej samej zmiany.

## Czego nie ruszam

Budżet, licytacja, kierowanie, feed, negatywy, obrazy, logo, nazwa firmy, strona docelowa, kod strony.

## Notatki techniczne

- Konto `customers/4410206709`, asset group „PH" `6733075399`.
- Jedno atomowe `googleAds:mutate`: 10× `assetOperation create` (temp id) + 10× `assetGroupAssetOperation create` (HEADLINE / LONG_HEADLINE / DESCRIPTION) + 4× `assetGroupAssetOperation remove` (1 headline, 3 descriptions) — remove w tym samym wywołaniu, żeby Google walidował limity na stanie końcowym.
- Wywołanie przez connector-gateway (v22); narzędzie projektowe zgłasza brak setupu.
- Po mutacji ponowny odczyt `asset_group_asset` (status != REMOVED) i raport: liczba assetów na slot oraz potwierdzenie usunięć.
