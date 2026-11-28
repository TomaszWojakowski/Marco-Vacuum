"""Sensor platform for Marco Vacuum."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers import entity_registry as er

from . import _map_catalog
from .const import CONF_VACUUM, DOMAIN


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Marco Vacuum sensor."""
    runtime = hass.data[DOMAIN][entry.entry_id]
    vacuum_object_id = runtime["vacuum_entity"].split(".", 1)[1]
    target_entity_id = f"sensor.marco_vacuum_data_{vacuum_object_id}"
    registry = er.async_get(hass)
    unique_id = f"{entry.data[CONF_VACUUM]}_groups"
    current_entity_id = registry.async_get_entity_id("sensor", DOMAIN, unique_id)
    if current_entity_id and current_entity_id != target_entity_id and registry.async_get(target_entity_id) is None:
        registry.async_update_entity(current_entity_id, new_entity_id=target_entity_id)

    sensor = MarcoVacuumSensor(hass, entry, runtime)
    runtime["sensor"] = sensor
    async_add_entities([sensor])


class MarcoVacuumSensor(SensorEntity):
    """Expose the current map/room catalog and saved groups."""

    _attr_has_entity_name = False
    _attr_icon = "mdi:robot-vacuum"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, runtime: dict[str, Any]) -> None:
        self.hass = hass
        self._entry = entry
        self._runtime = runtime
        vacuum_object_id = runtime["vacuum_entity"].split(".", 1)[1]
        self._attr_name = f"Marco Vacuum Data {vacuum_object_id.replace('_', ' ').title()}"
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
            "schedules": self._runtime.get("schedules", []),
            "daily_history": self._runtime.get("daily_history", []),
            "daily_history_date": self._runtime.get("daily_history_date"),
            "daily_history_updated": self._runtime.get("daily_history_updated"),
            "daily_history_error": self._runtime.get("daily_history_error"),
        }
