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

## Karta konserwacji

Karta konserwacji wyświetla pozostały poziom szczotek, filtra i środka odkamieniającego, dostępne informacje o wyposażeniu stacji oraz historię wymian i konserwacji. Wpisy historii są przechowywane przez integrację w pamięci trwałej Home Assistant.

Dodaj kartę do dashboardu:

```yaml
type: custom:marco-vacuum-maintenance-card
vacuum_entity: vacuum.marco
```

Wpisy historii dodaje się przyciskiem **Dodaj wpis**. Dostępna jest usługa `marco_vacuum.log_maintenance`.

## Karta harmonogramów

Karta pozwala tworzyć, edytować i usuwać harmonogramy dla wskazanej mapy i grupy pomieszczeń. Każdy harmonogram ma własne dni tygodnia, godzinę, liczbę przejazdów, moc ssania i poziom wody. Można też uruchomić go ręcznie.

Dodaj kartę w edytorze YAML:

```yaml
type: custom:marco-vacuum-schedules-card
vacuum_entity: vacuum.marco
```

Harmonogramy są przechowywane przez integrację w pamięci trwałej Home Assistant. Automatyczne uruchamianie odbywa się lokalnie w Home Assistant. W tej wersji parametry wspólne korzystają z usług Dreame `vacuum_select_map` i `vacuum_clean_segment`; integracja Dreame udostępnia w tej usłudze liczbę przejazdów, moc ssania i poziom wody. Wybór osobnego trybu sprzątania nie jest jeszcze dostępny w tej karcie.
