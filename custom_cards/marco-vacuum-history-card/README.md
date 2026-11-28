# Marco Vacuum – dzienna historia sprzątania

Karta pokazuje pomieszczenia sprzątane danego dnia, liczbę skutecznych sprzątań oraz wynik ostatniej próby. Pomieszczenia z błędem są domyślnie zaznaczone i można je ponowić jednym uruchomieniem.

## Konfiguracja Lovelace

```yaml
type: custom:marco-vacuum-history-card
vacuum_entity: vacuum.marco
```

Zasoby karty są rejestrowane automatycznie przez integrację Marco Vacuum.

## Zachowanie

- Licznik zwiększa się wyłącznie dla segmentów zwróconych przez dane mapy jako skutecznie wyczyszczone.
- Status błędu wynika z zablokowanych lub pominiętych segmentów w historii zadania.
- Kolejna skuteczna próba ustawia status pomieszczenia na OK; późniejszy błąd ponownie ustawia Błąd.
- Domyślne zaznaczenie jest wyliczane dla aktualnie wybranej mapy przy otwarciu karty i po zmianie dnia.
- Ręczne sprzątanie obejmuje zaznaczone pokoje na jednej mapie i używa wspólnych parametrów dla całego zadania.
- Parametry ręcznego sprzątania nie są porównywane z wcześniejszymi zadaniami.

## Usługi

- `marco_vacuum.refresh_daily_history` – awaryjne odświeżenie dzisiejszej historii.
- `marco_vacuum.run_manual_cleaning` – uruchomienie wskazanych pomieszczeń z parametrami zadania.
