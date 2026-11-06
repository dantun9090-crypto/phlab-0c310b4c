# Google Ads — konwersje: co jeszcze zmienić, żeby zwiększyć sprzedaż

Odczyt na żywo (ostatnie 30 dni, kampania Performance Max). Nic nie zostało zmienione.

## Co widać

- Wydatek £1 521, prawdziwe zakupy z importu zamówień: 68,9 sprzedaży o wartości £4 144. Realny zwrot to ok. 2,7× (£2,72 przychodu na £1 wydatku).
- Google pokazuje 3 159 „konwersji” o wartości £8 591, bo do niedawna liczył też „Products” (2 516 × £1) i „Begin checkout” (553 × £1). Przez to kampania uczyła się przyciągać osoby oglądające produkty, a nie kupujących.
- Dobra wiadomość: kampania ma teraz jako cel **tylko zakupy**. Cele „Begin checkout”, „Add to basket”, telefony i dojazd są już wyłączone. Punkt „ok 7” jest więc załatwiony.
- **Problem:** „Purchase (website)” znów jest ustawiona jako główna, obok „Purchase (offline import)”. Ta sama sprzedaż może być liczona dwa razy. Wczorajsza zmiana została cofnięta, np. w panelu Google albo przez sugestię Google.
- Budżet wzrósł do £89 dziennie. Kampania prawie nie traci wyświetleń z powodu budżetu (1%). Ogranicza ją pozycja reklamy: dostaje 34% możliwych wyświetleń.

## Proponowane zmiany (każda osobno, po Twoim „ok”)

1. **„Purchase (website)” z powrotem na pomocniczą.** Usuwa podwójne liczenie. Najważniejsza zmiana.
2. **Posprzątanie starych, nieużywanych konwersji.** Ukrycie konwersji ze starej domeny prohealthpeptides, „Android installs”, „Smart campaign …”, telefonów i dojazdu. Nie wpływają na stawki, ale zaśmiecają raporty i generują ostrzeżenia.
3. **Za około 2 tygodnie (po okresie nauki): docelowy zwrot z wydatków.** Ustawienie celu ok. 250% na podstawie prawdziwego zwrotu 2,7×. Kampania przestanie wtedy kupować drogie kliknięcia, które się nie zwracają. Konkretną liczbę podam do akceptacji.
4. **Więcej dopasowanych sprzedaży w imporcie.** Ze 200 zamówień tylko 81 miało identyfikator kliknięcia z reklamy. Mogę dodać do importu zaszyfrowany e-mail klienta (dopasowanie po e-mailu), wyłącznie dla klientów, którzy zaakceptowali marketing. Wtedy Google przypisze więcej sprzedaży do reklam i lepiej się uczy. To zmiana w kodzie importu, więc wymaga Twojej wyraźnej zgody, bo ten plik był dotąd nietykalny.
5. **Budżetu, reklam ani produktów nie ruszam.** Wyższy budżet sam nie da więcej sprzedaży. Pomogą lepsze sygnały sprzedaży (punkty 1 i 4) i mocniejsze materiały reklamowe, np. wideo (Performance Max bez wideo osiąga maksymalnie ocenę „Good”).

## Kolejność

1 → 2 od razu, 3 za 2 tygodnie, 4 i 5 tylko na Twoje życzenie. Stop po każdym punkcie.

## Szczegóły techniczne

- Punkt 1: conversionActionOperation update `customers/4410206709/conversionActions/7711984483`, `primaryForGoal=false`. Potem sprawdzenie, czy zmiana się utrzymała.
- Punkt 2: status HIDDEN dla 7648046375, 7729085238, 7648385173, 7648406836, 7648406863, 7648483386, 7648484142, 7648486275. Nie są usuwane, więc można je przywrócić.
- Punkt 3: `campaign.maximize_conversion_value.target_roas` = 2.5 na kampanii 24058542701.
- Punkt 4: `userData.userIdentifiers` (SHA-256 e-mail) w `offline-conversions.ts`, bramkowane zapisaną zgodą marketingową.
- Nie podłączam integracji z karty „Set up Daniel's Google Ads”. Nie zmieniam stron potwierdzenia zamówienia.
