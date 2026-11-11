# Diagnoza: wolno przychodzące maile na info@phlabs.co.uk (Outlook)

Tylko sprawdzenie, bez zmian w sklepie ani w ustawieniach poczty.

## Kroki
1. Na serwerze poczty (cPanel, mail.phlabs.co.uk) odczytam z nagłówków kilku ostatnich maili, o której każdy dotarł do skrzynki.
2. Porównam to z godziną, o której mail pokazał się w Outlooku. Duża różnica oznacza, że opóźnia Outlook (synchronizacja), a mała, że opóźnia nadawca lub serwer.
3. Sprawdzę kolejkę i zwrotki serwera oraz filtr spamu (szare listy, czyli greylisting, potrafią opóźnić pierwszy mail od nowego nadawcy o 5–30 minut).
4. Sprawdzę, jak konto jest dodane w Outlooku: przez Outlook.com „Połączone konta” (sprawdza pocztę co około 30–60 minut) czy jako bezpośrednie IMAP (kilka sekund).

## Wynik
Podam przyczynę i konkretną poprawkę, np. dodanie skrzynki jako IMAP zamiast połączonego konta albo wyłączenie greylistingu. Zmiany na serwerze zrobię dopiero po Twojej zgodzie.
