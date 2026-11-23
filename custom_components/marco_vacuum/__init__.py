"""Marco Vacuum integration."""

from __future__ import annotations

import asyncio
from pathlib import Path
import logging
from typing import Any
from uuid import uuid4

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace import LOVELACE_DATA

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import (
    CoreState,
    EVENT_HOMEASSISTANT_STARTED,
    HomeAssistant,
    ServiceCall,
    callback,
)
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
_CARD_FILENAME = "marco-vacuum-card.js"
_CARD_PATH = Path(__file__).parent / "www" / _CARD_FILENAME
_CARD_URL_PATH = f"/{DOMAIN}/{_CARD_FILENAME}"
_CARD_URL = f"{_CARD_URL_PATH}?v=0.1.7"


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


def _get_runtime(hass: HomeAssistant, call: ServiceCall) -> dict[str, Any]:
    """Resolve the target vacuum runtime for a service call."""
    runtimes = [
        runtime
        for runtime in hass.data.get(DOMAIN, {}).values()
        if isinstance(runtime, dict) and "vacuum_entity" in runtime
    ]
    vacuum_entity = call.data.get(CONF_VACUUM)

    if vacuum_entity:
        runtime = next(
            (item for item in runtimes if item["vacuum_entity"] == vacuum_entity),
            None,
        )
        if runtime is None:
            raise HomeAssistantError(
                f"Nie znaleziono konfiguracji Marco Vacuum dla {vacuum_entity}."
            )
        return runtime

    if len(runtimes) == 1:
        return runtimes[0]
    if not runtimes:
        raise HomeAssistantError("Nie ma skonfigurowanego żadnego odkurzacza Marco Vacuum.")
    raise HomeAssistantError(
        "Przy wielu odkurzaczach wskaż pole vacuum_entity."
    )


async def _async_save_group(hass: HomeAssistant, call: ServiceCall) -> None:
    """Create a group, or replace it when group_id is supplied."""
    runtime = _get_runtime(hass, call)
    vacuum_entity = runtime["vacuum_entity"]
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

    await runtime["store"].async_save({"groups": runtime["groups"]})
    sensor = runtime.get("sensor")
    if sensor:
        sensor.async_write_ha_state()


async def _async_delete_group(hass: HomeAssistant, call: ServiceCall) -> None:
    """Delete a saved group."""
    runtime = _get_runtime(hass, call)
    group_id = call.data["group_id"]
    before = len(runtime["groups"])
    runtime["groups"] = [
        group for group in runtime["groups"] if group.get("id") != group_id
    ]
    if len(runtime["groups"]) == before:
        raise HomeAssistantError(f"Nie znaleziono grupy {group_id}.")
    await runtime["store"].async_save({"groups": runtime["groups"]})
    sensor = runtime.get("sensor")
    if sensor:
        sensor.async_write_ha_state()


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up domain-level services once for all configured vacuums."""
    hass.data.setdefault(DOMAIN, {})

    # Serve the bundled card. In storage mode we register it as a Lovelace
    # resource, which makes HA await the module before rendering dashboard cards.
    if _CARD_PATH.is_file():
        try:
            await hass.http.async_register_static_paths([
                StaticPathConfig(_CARD_URL_PATH, str(_CARD_PATH), cache_headers=False)
            ])
        except RuntimeError:
            # The path may already be registered during an integration reload.
            _LOGGER.debug("Static card path already registered: %s", _CARD_URL_PATH)

        async def _async_register_lovelace_card() -> bool:
            """Register/update the card resource once Lovelace is ready."""
            lovelace = hass.data.get(LOVELACE_DATA)
            if lovelace is None:
                return False

            resources = getattr(lovelace, "resources", None)
            if resources is None:
                return False

            if lovelace.resource_mode != "storage":
                # YAML dashboards have a read-only resource collection.
                # Keep the legacy fallback for that explicitly configured mode.
                add_extra_js_url(hass, _CARD_URL)
                _LOGGER.warning(
                    "Marco Vacuum card loaded via extra_module_url because Lovelace "
                    "is in YAML mode. Storage mode is required for deterministic "
                    "automatic resource loading."
                )
                return True

            # Ensure the storage collection has loaded before inspecting it.
            await resources.async_get_info()
            existing = next(
                (
                    item
                    for item in resources.async_items()
                    if item.get("url", "").split("?", 1)[0] == _CARD_URL_PATH
                ),
                None,
            )
            if existing is None:
                await resources.async_create_item(
                    {"res_type": "module", "url": _CARD_URL}
                )
                _LOGGER.info("Registered Marco Vacuum Lovelace card resource")
            elif existing.get("url") != _CARD_URL:
                await resources.async_update_item(
                    existing["id"],
                    {"res_type": "module", "url": _CARD_URL},
                )
                _LOGGER.info("Updated Marco Vacuum Lovelace card resource")
            return True

        async def _async_wait_for_lovelace(_event=None) -> None:
            """Wait briefly for Lovelace storage resources to become available."""
            for _attempt in range(60):
                if await _async_register_lovelace_card():
                    return
                await asyncio.sleep(1)
            _LOGGER.warning(
                "Could not register Marco Vacuum card: Lovelace resources "
                "were not ready after 60 seconds"
            )

        if hass.state == CoreState.running:
            hass.async_create_task(_async_wait_for_lovelace())
        else:
            @callback
            def _schedule_lovelace_registration(_event) -> None:
                """Schedule registration from the Home Assistant event loop."""
                hass.async_create_task(_async_wait_for_lovelace())

            hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STARTED,
                _schedule_lovelace_registration,
            )
    else:
        _LOGGER.warning("Marco Vacuum Lovelace card file is missing: %s", _CARD_PATH)

    async def save_group(call: ServiceCall) -> None:
        await _async_save_group(hass, call)

    async def delete_group(call: ServiceCall) -> None:
        await _async_delete_group(hass, call)

    hass.services.async_register(
        DOMAIN,
        SERVICE_SAVE_GROUP,
        save_group,
        schema=vol.Schema({
            vol.Required("name"): cv.string,
            vol.Required("map_id"): cv.positive_int,
            vol.Required("segments"): vol.All(cv.ensure_list, [cv.positive_int]),
            vol.Optional("group_id"): cv.string,
            vol.Optional(CONF_VACUUM): cv.entity_id,
        }),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_DELETE_GROUP,
        delete_group,
        schema=vol.Schema({
            vol.Required("group_id"): cv.string,
            vol.Optional(CONF_VACUUM): cv.entity_id,
        }),
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up one Marco Vacuum instance."""
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

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    @callback
    def vacuum_state_changed(event) -> None:
        if event.data.get("entity_id") == vacuum_entity:
            sensor = runtime.get("sensor")
            if sensor:
                sensor.async_write_ha_state()

    unsubscribe = hass.bus.async_listen("state_changed", vacuum_state_changed)
    entry.async_on_unload(unsubscribe)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload one Marco Vacuum instance."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unload_ok
