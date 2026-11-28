"""Binary sensors for Marco Vacuum."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_VACUUM, DOMAIN


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    runtime = hass.data[DOMAIN][entry.entry_id]
    entity = MarcoDailyCleaningErrorBinarySensor(entry, runtime)
    runtime["daily_history_binary_sensor"] = entity
    async_add_entities([entity])


class MarcoDailyCleaningErrorBinarySensor(BinarySensorEntity):
    """Indicate whether any room's latest cleaning attempt failed today."""

    _attr_has_entity_name = False
    _attr_name = "Marco Vacuum – zaległe pomieszczenia"
    _attr_icon = "mdi:robot-vacuum-alert"

    def __init__(self, entry: ConfigEntry, runtime: dict) -> None:
        self._runtime = runtime
        self._attr_unique_id = f"{entry.data[CONF_VACUUM]}_daily_cleaning_error"

    @property
    def is_on(self) -> bool:
        return any(
            item.get("last_status") == "error"
            for item in self._runtime.get("daily_history", [])
        )

    @property
    def extra_state_attributes(self) -> dict:
        return {
            "vacuum_entity": self._runtime["vacuum_entity"],
            "date": self._runtime.get("daily_history_date"),
            "rooms": [
                item for item in self._runtime.get("daily_history", [])
                if item.get("last_status") == "error"
            ],
            "updated": self._runtime.get("daily_history_updated"),
            "error": self._runtime.get("daily_history_error"),
        }
