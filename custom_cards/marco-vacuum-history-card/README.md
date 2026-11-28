# Marco Vacuum – dzienna historia sprzątania

Karta pokazuje wszystkie piętra w jednej liście, ale tylko pomieszczenia, dla których dzisiejsza historia zawiera wynik próby. Każdy pokój pokazuje liczbę skutecznych sprzątań i wynik ostatniej próby.

## Konfiguracja Lovelace

```yaml
type: custom:marco-vacuum-history-card
vacuum_entity: vacuum.marco
```

Zasoby karty są rejestrowane automatycznie przez integrację Marco Vacuum.

## Zachowanie

- Pomieszczenia są grupowane według piętra; nie trzeba przełączać mapy.
- Pomieszczenia bez dzisiejszej próby nie są wyświetlane.
- Licznik zwiększa się wyłącznie dla segmentów oznaczonych w mapie historii jako wyczyszczone lub ukończone.
- Status błędu wynika z zablokowanych, pominiętych lub nadal oczekujących segmentów.
- Domyślnie zaznaczane są pomieszczenia, których ostatnia próba zakończyła się błędem.
- Zaznaczenie można zmieniać bez odświeżania karty; wybór pozostaje stabilny podczas aktualizacji encji.
- Robot może wykonać jedno zadanie na wybranej mapie, dlatego jedno uruchomienie może obejmować pomieszczenia tylko z jednego piętra.
- Ręczne sprzątanie używa wspólnych parametrów dla całego zadania. Parametry nie są porównywane z wcześniejszymi zadaniami.

## Usługi

- `marco_vacuum.refresh_daily_history` – awaryjne odświeżenie dzisiejszej historii.
- `marco_vacuum.run_manual_cleaning` – uruchomienie wskazanych pomieszczeń z parametrami zadania.

Wynik dla pokoju jest wyświetlany tylko wtedy, gdy dane mapy historii zawierają wynik dla konkretnego segmentu. Samo zaznaczenie pokoju w zadaniu nie jest traktowane jako dowód, że robot go sprzątał.
