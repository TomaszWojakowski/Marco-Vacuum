# Marco Vacuum Card

Karta Lovelace do zarządzania grupami pomieszczeń zapisanymi przez integrację Marco Vacuum.

## Funkcje

- wybór mapy i pomieszczeń z listy,
- tworzenie, edycja i usuwanie grup,
- obsługa wskazanej encji odkurzacza, także przy wielu odkurzaczach.

Karta używa encji sensora integracji oraz usług `marco_vacuum.save_group` i `marco_vacuum.delete_group`.

## Instalacja ręczna

1. Skopiuj `marco-vacuum-card.js` do katalogu `/config/www/`.
2. W **Ustawienia → Pulpity → Zasoby** dodaj:
   - URL: `/local/marco-vacuum-card.js`
   - typ: **Moduł JavaScript**.
3. Odśwież przeglądarkę. W razie potrzeby wyczyść cache.

## Konfiguracja karty

Dodaj kartę ręcznie:

```yaml
type: custom:marco-vacuum-card
vacuum_entity: vacuum.marco
```

Wartość `vacuum_entity` musi wskazywać odkurzacz skonfigurowany w Marco Vacuum.

## HACS

To repozytorium jest obecnie dodane w HACS jako **Integration**. HACS nie instaluje z tej samej pozycji pliku frontendowej karty. Plik znajduje się tu w `custom_cards/marco-vacuum-card/` i jest instalowany ręcznie według instrukcji powyżej. Kartę można później wydzielić do osobnego repozytorium HACS typu **Dashboard**.
