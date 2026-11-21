# Kopia zapasowa całego projektu (bez usuwania czegokolwiek)

## Najprostsze sposoby (możesz zrobić sam)
1. **GitHub (już podłączony):** otwórz repozytorium na GitHubie → zielony przycisk **Code** → **Download ZIP**. To pełny kod strony w jednym pliku.
2. **W Lovable:** Ustawienia projektu → GitHub → otwórz repo i pobierz ZIP jak wyżej.

Kod to nie wszystko: produkty, zamówienia i klienci są w Firebase, a nie w kodzie.

## Co zrobię po zatwierdzeniu planu
1. **ZIP z kodem** zapiszę w Twoich Plikach (Files). Bez folderu `.git`, bez pobranych bibliotek i bez plików z hasłami (`.env`).
2. **Kopia danych z Firebase** jako pliki JSON w Plikach: produkty (także VIP), zamówienia, klienci, opinie, artykuły, strony, banery i logi admina. Tylko odczyt, w Firebase niczego nie zmienię ani nie usunę.
3. **Kopia tabel z Lovable Cloud** (CSV), też tylko do odczytu.
4. Pokażę listę plików i ich rozmiary.

## Ważne
- Hasła i klucze do usług nie trafią do kopii, ze względów bezpieczeństwa.
- W pliku z zamówieniami i klientami są dane osobowe. Trzymaj go w bezpiecznym miejscu.
- W projekcie, w Firebase, w Cloudflare i w Google Ads nic się nie zmieni.
