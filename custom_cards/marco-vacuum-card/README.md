# Marco Vacuum Card

Karta Lovelace do zarządzania grupami pomieszczeń zapisana jest wewnątrz integracji Marco Vacuum i jest rejestrowana automatycznie.

## Instalacja

1. Zainstaluj lub zaktualizuj **Marco Vacuum** przez HACS jako repozytorium typu **Integration**.
2. Uruchom ponownie Home Assistant.
3. Dodaj kartę ręcznie do dashboardu (Edytor YAML):

```yaml
type: custom:marco-vacuum-card
vacuum_entity: vacuum.marco
```

Nie trzeba kopiować pliku JS, dodawać zasobu w ustawieniach dashboardu ani instalować osobnego repozytorium typu Dashboard.

## Funkcje

- wybór mapy i pomieszczeń z listy,
- tworzenie, edycja i usuwanie grup,
- obsługa wskazanej encji odkurzacza, także przy wielu odkurzaczach.

Karta używa encji sensora integracji oraz usług `marco_vacuum.save_group` i `marco_vacuum.delete_group`.

Wartość `vacuum_entity` musi wskazywać odkurzacz skonfigurowany w Marco Vacuum.

## Karta statusu Marco

Druga, niezależna karta wyświetla bieżący stan odkurzacza, rozpoznaną grupę i aktualne pomieszczenie, postęp sprzątania, baterię oraz podstawowe parametry. Udostępnia przyciski pauzy, wznowienia i powrotu do stacji.

Dodaj ją do dashboardu (Edytor YAML):

```yaml
type: custom:marco-vacuum-status-card
vacuum_entity: vacuum.marco
```

Grupa jest rozpoznawana przez dokładne porównanie ID mapy i zestawu aktywnych segmentów z zapisanymi grupami. Przy braku jednoznacznego dopasowania karta nie przypisuje nazwy grupy.
