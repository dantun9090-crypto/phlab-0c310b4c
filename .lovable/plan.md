# Niedochodzące maile na info@phlabs.co.uk

## Co znalazłem (tylko odczyt, nic nie zmieniono)
- Skrzynka jest zajęta w 18% (192 MB z 1 GB), więc nie jest pełna i nic nie jest odrzucane z braku miejsca.
- Na skrzynce nie ma żadnych filtrów, a maile do innych adresów @phlabs.co.uk nie trafiają do innej skrzynki.
- **Folder spamu na serwerze zawiera 53 nieprzeczytane i 156 starszych maili.** Maile z oceną spamu powyżej 5 trafiają tam z dopiskiem „***SPAM***” w temacie. Outlook często nie pokazuje tego folderu, więc wyglądają, jakby w ogóle nie doszły.
- 15 najnowszych maili ze spamu to w większości prawdziwy spam (oferty peptydów, „Good morning”, pozycjonowanie stron). Jest tam jednak jedna przydatna wiadomość: zwrotka Outlooka z 10 XI („Undeliverable: FW: Confirm your email — PH Labs”).
- Linki: cPanel https://eldborg.orangewebsite.com:2083, Webmail https://eldborg.orangewebsite.com:2096. Folder spamu widać w Webmailu jako „spam”.

## Proponowane poprawki (po zatwierdzeniu)
1. Dodam do listy zaufanych nadawców ważne adresy, żeby nigdy nie trafiały do spamu: brokkrpay.com, royalmail.com, storefeeder.com, wallid, google.com, trustpilot.com, postmaster@outlook.com oraz własną domenę phlabs.co.uk.
2. Przejrzę wszystkie 209 maili ze spamu. Prawdziwe wiadomości, np. od klientów, przeniosę do skrzynki odbiorczej, a spam zostawię.
3. Folder „spam” na serwerze ustawię jako widoczny, żeby pojawił się w Outlooku przy koncie IMAP.
4. Próg spamu (5) zostawię bez zmian, bo wyłapuje on dużo prawdziwego spamu.

## Uwaga
Maile odrzucone przez serwer już przy odbiorze (np. przez czarne listy) nie trafiają nawet do spamu. Jeśli brakuje konkretnej wiadomości, podaj nadawcę i godzinę, a sprawdzę ją w cPanel → Track Delivery.
