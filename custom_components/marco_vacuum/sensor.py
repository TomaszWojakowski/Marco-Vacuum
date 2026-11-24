"""Sensor platform for Marco Vacuum."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import _map_catalog
from .const import CONF_VACUUM, DOMAIN


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Marco Vacuum sensor."""
    runtime = hass.data[DOMAIN][entry.entry_id]
    sensor = MarcoVacuumSensor(hass, entry, runtime)
    runtime["sensor"] = sensor
    async_add_entities([sensor])


class MarcoVacuumSensor(SensorEntity):
    """Expose the current map/room catalog and saved groups."""

    _attr_has_entity_name = True
    _attr_name = "Grupy"
    _attr_icon = "mdi:robot-vacuum"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, runtime: dict[str, Any]) -> None:
        self.hass = hass
        self._entry = entry
        self._runtime = runtime
        # Keep the existing unique ID so the entity registry can retain its entity ID.
        self._attr_unique_id = f"{entry.data[CONF_VACUUM]}_groups"

    @property
    def native_value(self) -> int:
        """Return the number of saved groups."""
        return len(self._runtime["groups"])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return maps, rooms and saved groups."""
        vacuum_state = self.hass.states.get(self._runtime["vacuum_entity"])
        return {
            "vacuum_entity": self._runtime["vacuum_entity"],
            "maps": _map_catalog(vacuum_state),
            "groups": self._runtime["groups"],
        }
