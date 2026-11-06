# Pełny przegląd sklepu end to end (tylko odczyt)

Cel: sprawdzić, czy wszystko działa i jest opłacone. Nic nie zmieniam. Każdy problem zgłoszę i poproszę o zgodę na naprawę.

## Co sprawdzę

1. **Lovable Cloud i rozliczenia Lovable** – czy backend działa (baza, logowanie, obciążenie, miejsce na dysku), czas odpowiedzi, plan i stan subskrypcji, saldo kredytów, czy auto-doładowanie jest włączone i jaki ma limit, oraz ryzyko kolejnego wstrzymania (jak 5 listopada).
1b. **Firebase i Google Cloud** – czy baza zamówień i logowanie klientów działają, czy indeksy są gotowe, czy rozszerzenie wysyłki maili i funkcje chodzą bez błędów, czy zdjęcia produktów się ładują, oraz czy konto rozliczeniowe Google Cloud jest aktywne (brak zawieszenia lub przekroczonych limitów).
2. **Płatności** – czy Wallid i BrokkrPay pokazują się w kasie na żywo; ostatnie opłacone zamówienia i webhooki z ostatnich 24h; czy są zamówienia, które utknęły jako „pending”.
3. **Sklep na żywo** – strona główna, katalog, strona produktu, koszyk i kasa (do kroku przed płatnością) na phlabs.co.uk; dopisek „For Research Use Only” na produkcie i w stopce.
4. **Cloudflare** – status stref phlabs.co.uk i prohealthpeptides.co.uk, czy Worker do prerenderingu jest przypięty, cache HIT/MISS, przekierowanie www → domena główna, ważność SSL.
5. **Prerendering** – czy Googlebot dostaje gotową stronę (prerender.io) i czy zwykli klienci normalną.
6. **Google Ads** – stan kampanii Performance Max, faza nauki, ROAS, wydatki i konwersje z ostatnich 7 dni, problemy z reklamami lub produktami, stan płatności konta.
7. **Konwersje** – czy import offline z 6 listopada przeszedł bez błędów, czy tag zakupu na stronie wysyła zdarzenia, ile zamówień ma identyfikator kliknięcia reklamy.
8. **Merchant Center / feed produktów** – czy feed się ładuje, liczba produktów, zgodność cen i dostępności.
9. **E-maile** – kolejka marketingowa (limit 90/h), ostatnie maile z zamówień, nowe zwrotki.
10. **Zaplanowane zadania** – czy codzienne eksporty i kolejka maili uruchamiały się dziś.

## Wynik

Jedna tabela: obszar → OK / problem → co zrobić. Bez żadnych zmian w reklamach, płatnościach ani ustawieniach bez Twojej zgody.
