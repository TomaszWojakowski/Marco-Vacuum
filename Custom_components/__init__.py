"""Marco Groups integration."""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .const import (
    CONF_VACUUM,
    DOMAIN,
    PLATFORMS,
    SERVICE_DELETE_GROUP,
    SERVICE_SAVE_GROUP,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)


def _map_catalog(vacuum_state) -> list[dict[str, Any]]:
    """Return normalized maps and their visible rooms from Dreame attributes."""
    if vacuum_state is None:
        return []

    attrs = vacuum_state.attributes
    raw_maps = attrs.get("maps") or []
    raw_rooms = attrs.get("rooms") or {}
    catalog = []

    if not isinstance(raw_maps, list) or not isinstance(raw_rooms, dict):
        return []

    for item in raw_maps:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        map_id = int(item["id"])
        map_name = item.get("name") or str(map_id)
        rooms_for_map = raw_rooms.get(map_name, [])
        rooms = []
        if isinstance(rooms_for_map, list):
            for room in rooms_for_map:
                if not isinstance(room, dict) or room.get("id") is None:
                    continue
                rooms.append({
                    "id": int(room["id"]),
                    "name": str(room.get("name") or room["id"]),
                })
        catalog.append({
            "map_id": map_id,
            "name": str(map_name),
            "rooms": rooms,
        })

    return catalog


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Marco Groups."""
    vacuum_entity = entry.data[CONF_VACUUM]
    store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry.entry_id}")
    stored = await store.async_load()
    groups = stored.get("groups", []) if isinstance(stored, dict) else []

    runtime = {
        "vacuum_entity": vacuum_entity,
        "store": store,
        "groups": groups if isinstance(groups, list) else [],
        "sensor": None,
    }
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = runtime

    async def save_group(call: ServiceCall) -> None:
        """Create a group, or replace it when group_id is supplied."""
        state = hass.states.get(vacuum_entity)
        catalog = _map_catalog(state)
        map_id = int(call.data["map_id"])
        selected_map = next((item for item in catalog if item["map_id"] == map_id), None)
        if selected_map is None:
            raise HomeAssistantError(
                f"Mapa {map_id} nie jest dostępna w atrybutach {vacuum_entity}."
            )

        requested_ids = [int(value) for value in call.data["segments"]]
        if not requested_ids or len(requested_ids) != len(set(requested_ids)):
            raise HomeAssistantError("Wybierz co najmniej jedno różne pomieszczenie.")

        room_by_id = {room["id"]: room for room in selected_map["rooms"]}
        missing = [segment_id for segment_id in requested_ids if segment_id not in room_by_id]
        if missing:
            raise HomeAssistantError(
                f"Nie znaleziono pomieszczeń {missing} na mapie {selected_map['name']}."
            )

        group_id = call.data.get("group_id") or str(uuid4())
        new_group = {
            "id": group_id,
            "name": call.data["name"].strip(),
            "map_id": map_id,
            "map_name": selected_map["name"],
            "segments": [
                {"id": segment_id, "name": room_by_id[segment_id]["name"]}
                for segment_id in requested_ids
            ],
        }
        if not new_group["name"]:
            raise HomeAssistantError("Nazwa grupy nie może być pusta.")

        existing_index = next(
            (i for i, group in enumerate(runtime["groups"]) if group.get("id") == group_id),
            None,
        )
        if existing_index is None:
            runtime["groups"].append(new_group)
        else:
            runtime["groups"][existing_index] = new_group

        await store.async_save({"groups": runtime["groups"]})
        sensor = runtime.get("sensor")
        if sensor:
            sensor.async_write_ha_state()

    async def delete_group(call: ServiceCall) -> None:
        """Delete a saved group."""
        group_id = call.data["group_id"]
        before = len(runtime["groups"])
        runtime["groups"] = [
            group for group in runtime["groups"] if group.get("id") != group_id
        ]
        if len(runtime["groups"]) == before:
            raise HomeAssistantError(f"Nie znaleziono grupy {group_id}.")
        await store.async_save({"groups": runtime["groups"]})
        sensor = runtime.get("sensor")
        if sensor:
            sensor.async_write_ha_state()

    hass.services.async_register(
        DOMAIN,
        SERVICE_SAVE_GROUP,
        save_group,
        schema=vol.Schema({
            vol.Required("name"): cv.string,
            vol.Required("map_id"): cv.positive_int,
            vol.Required("segments"): vol.All(cv.ensure_list, [cv.positive_int]),
            vol.Optional("group_id"): cv.string,
        }),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_DELETE_GROUP,
        delete_group,
        schema=vol.Schema({vol.Required("group_id"): cv.string}),
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    @callback
    def vacuum_state_changed(event) -> None:
        if event.data.get("entity_id") == vacuum_entity:
            sensor = runtime.get("sensor")
            if sensor:
                sensor.async_write_ha_state()

    unsubscribe = hass.bus.async_listen("state_changed", vacuum_state_changed)
    entry.async_on_unload(unsubscribe)
    entry.async_on_unload(
        lambda: hass.services.async_remove(DOMAIN, SERVICE_SAVE_GROUP)
    )
    entry.async_on_unload(
        lambda: hass.services.async_remove(DOMAIN, SERVICE_DELETE_GROUP)
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Marco Groups."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
