# Lista odrzuconych linków (disavow) — dopisanie 5 spamerów

## Co to jest
Plik disavow to lista stron, które linkują do phlabs.co.uk, a których Google ma nie brać pod uwagę przy ocenie sklepu. Nie usuwa tych linków z internetu. Mówi tylko Google: „nie licz ich ani na plus, ani na minus”.

## Jak to działa
1. Plik już istnieje (phlabs.co.uk/disavow.txt, 20 domen z lipca).
2. Dopisuję 5 nowych domen spamowych, znalezionych w audycie z danymi z Semrush.
3. Ty wgrywasz plik raz w narzędziu Google: https://search.google.com/search-console/disavow-links. Wybierasz tam właściwość phlabs.co.uk i klikasz „Prześlij”. Nowy plik zastępuje stary, dlatego zawiera całą listę.
4. Google zaczyna to uwzględniać przy kolejnych odwiedzinach tych stron, zwykle w ciągu kilku tygodni. Pozycje nie zmienią się od razu.

## Dlaczego warto
Te strony dały tysiące linków ze słowami „treatment”, „medical”, „surgery” i „patients”. Taki medyczny kontekst nie pasuje do sklepu tylko do badań i może szkodzić. Wszystkie mają siłę 2–11/100, więc nic nie tracisz.

## Zmiana
Na końcu listy dochodzi sekcja „Round 3 (2026-09-29)” z 5 domenami:
- shosting.cyou (19 857 linków)
- charms.co.kr (14 247)
- ophot.net (4 344)
- kfoe.or.kr (3 722)
- wiseservice.co.kr (3 003)

moe.go.th nie trafia na listę (rządowa strona z Tajlandii, siła 45). curry-pot.com już jest na liście.

Nie zmieniam niczego innego: wyglądu, adresów, robots.txt ani stron. Po zmianie publikuję i czyszczę cache, a potem sprawdzam, że plik jest dostępny na żywo.

## Szczegóły techniczne
- Plik: public/disavow.txt (dopisanie na końcu, format `domain:`).
- Wgranie do Google robisz ręcznie, bo Google nie daje do tego API.
