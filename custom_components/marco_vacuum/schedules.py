"""Schedule support for Marco Vacuum."""

from __future__ import annotations

from datetime import time
import asyncio
import logging
from typing import Any
from uuid import uuid4

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import CONF_VACUUM, DOMAIN

_LOGGER = logging.getLogger(__name__)
_STORAGE_VERSION = 1
_SERVICE_SAVE = "save_schedule"
_SERVICE_DELETE = "delete_schedule"
_SERVICE_RUN = "run_schedule"


def _runtime(hass: HomeAssistant, call: ServiceCall) -> dict[str, Any]:
    runtimes = [
        item for item in hass.data.get(DOMAIN, {}).values()
        if isinstance(item, dict) and "vacuum_entity" in item
    ]
    entity_id = call.data.get(CONF_VACUUM)
    found = next((item for item in runtimes if item["vacuum_entity"] == entity_id), None) if entity_id else (runtimes[0] if len(runtimes) == 1 else None)
    if found is None:
        raise HomeAssistantError("Nie można jednoznacznie ustalić odkurzacza. Wskaż vacuum_entity.")
    return found


async def async_run_schedule(hass: HomeAssistant, runtime: dict[str, Any], schedule: dict[str, Any]) -> None:
    """Select the schedule map and start cleaning its selected segments."""
    entity_id = runtime["vacuum_entity"]
    state = hass.states.get(entity_id)
    if state is None or state.state in ("unavailable", "unknown"):
        raise HomeAssistantError(f"Odkurzacz {entity_id} jest niedostępny.")

    map_id = int(schedule["map_id"])
    if str(state.attributes.get("selected_map_id")) != str(map_id):
        await hass.services.async_call(
            "dreame_vacuum", "vacuum_select_map",
            {"entity_id": entity_id, "map_id": map_id},
            blocking=True,
        )
        # Wait for the integration to report the newly selected map before
        # sending segment IDs, which are map-specific.
        for _ in range(30):
            state = hass.states.get(entity_id)
            if state and str(state.attributes.get("selected_map_id")) == str(map_id):
                break
            await asyncio.sleep(1)
        else:
            raise HomeAssistantError(f"Robot nie przełączył się na mapę {map_id}.")

    payload = {
        "entity_id": entity_id,
        "segments": [int(item) for item in schedule["segments"]],
    }
    for key in ("repeats", "suction_level", "water_volume"):
        if schedule.get(key) is not None:
            payload[key] = int(schedule[key])
    await hass.services.async_call(
        "dreame_vacuum", "vacuum_clean_segment", payload, blocking=True
    )


async def _save(hass: HomeAssistant, call: ServiceCall) -> None:
    runtime = _runtime(hass, call)
    catalog = runtime.get("map_catalog", [])
    vacuum_state = hass.states.get(runtime["vacuum_entity"])
    from . import _map_catalog
    catalog = _map_catalog(vacuum_state)
    map_id = int(call.data["map_id"])
    selected_map = next((item for item in catalog if item["map_id"] == map_id), None)
    if selected_map is None:
        raise HomeAssistantError(f"Mapa {map_id} nie jest dostępna.")
    segments = [int(value) for value in call.data["segments"]]
    room_ids = {room["id"] for room in selected_map["rooms"]}
    if not segments or len(segments) != len(set(segments)) or any(item not in room_ids for item in segments):
        raise HomeAssistantError("Wybierz prawidłowe pomieszczenia z jednej mapy.")
    days = sorted(set(int(day) for day in call.data["days"]))
    if not days or any(day < 0 or day > 6 for day in days):
        raise HomeAssistantError("Wybierz co najmniej jeden prawidłowy dzień tygodnia.")
    schedule_id = call.data.get("schedule_id") or str(uuid4())
    item = {
        "id": schedule_id,
        "name": call.data["name"].strip(),
        "enabled": bool(call.data["enabled"]),
        "map_id": map_id,
        "map_name": selected_map["name"],
        "segments": segments,
        "segment_names": [room["name"] for room in selected_map["rooms"] if room["id"] in segments],
        "time": call.data["time"],
        "days": days,
        "repeats": int(call.data["repeats"]),
        "suction_level": int(call.data["suction_level"]),
        "water_volume": int(call.data["water_volume"]),
    }
    if not item["name"]:
        raise HomeAssistantError("Podaj nazwę harmonogramu.")
    try:
        time.fromisoformat(item["time"])
    except ValueError as err:
        raise HomeAssistantError("Godzina musi mieć format HH:MM.") from err

    schedules = runtime["schedules"]
    index = next((i for i, old in enumerate(schedules) if old["id"] == schedule_id), None)
    if index is None:
        schedules.append(item)
    else:
        schedules[index] = item
    await runtime["schedule_store"].async_save({"schedules": schedules})
    sensor = runtime.get("sensor")
    if sensor:
        await sensor.async_update_ha_state(force_refresh=True)


async def _delete(hass: HomeAssistant, call: ServiceCall) -> None:
    runtime = _runtime(hass, call)
    before = len(runtime["schedules"])
    runtime["schedules"] = [item for item in runtime["schedules"] if item["id"] != call.data["schedule_id"]]
    if len(runtime["schedules"]) == before:
        raise HomeAssistantError("Nie znaleziono harmonogramu.")
    await runtime["schedule_store"].async_save({"schedules": runtime["schedules"]})
    sensor = runtime.get("sensor")
    if sensor:
        await sensor.async_update_ha_state(force_refresh=True)


async def _run(hass: HomeAssistant, call: ServiceCall) -> None:
    runtime = _runtime(hass, call)
    schedule = next((item for item in runtime["schedules"] if item["id"] == call.data["schedule_id"]), None)
    if schedule is None:
        raise HomeAssistantError("Nie znaleziono harmonogramu.")
    await async_run_schedule(hass, runtime, schedule)


def register_services(hass: HomeAssistant) -> None:
    """Register schedule CRUD and run services once."""
    if hass.services.has_service(DOMAIN, _SERVICE_SAVE):
        return
    async def save_schedule(call: ServiceCall) -> None:
        await _save(hass, call)

    async def delete_schedule(call: ServiceCall) -> None:
        await _delete(hass, call)

    async def run_schedule(call: ServiceCall) -> None:
        await _run(hass, call)

    hass.services.async_register(DOMAIN, _SERVICE_SAVE, save_schedule, schema=vol.Schema({
        vol.Required("name"): vol.All(cv.string, vol.Length(min=1, max=80)),
        vol.Required("map_id"): cv.positive_int,
        vol.Required("segments"): vol.All(cv.ensure_list, [cv.positive_int]),
        vol.Required("days"): vol.All(cv.ensure_list, [vol.All(vol.Coerce(int), vol.Range(min=0, max=6))]),
        vol.Required("time"): cv.string,
        vol.Required("enabled"): cv.boolean,
        vol.Required("repeats"): vol.All(vol.Coerce(int), vol.Range(min=1, max=3)),
        vol.Required("suction_level"): vol.All(vol.Coerce(int), vol.Range(min=0, max=3)),
        vol.Required("water_volume"): vol.All(vol.Coerce(int), vol.Range(min=1, max=3)),
        vol.Optional("schedule_id"): cv.string,
        vol.Optional(CONF_VACUUM): cv.entity_id,
    }))
    hass.services.async_register(DOMAIN, _SERVICE_DELETE, delete_schedule, schema=vol.Schema({
        vol.Required("schedule_id"): cv.string,
        vol.Optional(CONF_VACUUM): cv.entity_id,
    }))
    hass.services.async_register(DOMAIN, _SERVICE_RUN, run_schedule, schema=vol.Schema({
        vol.Required("schedule_id"): cv.string,
        vol.Optional(CONF_VACUUM): cv.entity_id,
    }))


async def async_setup_entry(hass: HomeAssistant, entry, runtime: dict[str, Any]) -> None:
    """Load schedules and start the minute scheduler for one vacuum."""
    store = Store(hass, _STORAGE_VERSION, f"marco_vacuum_schedules_{entry.entry_id}")
    data = await store.async_load()
    runtime["schedule_store"] = store
    runtime["schedules"] = data.get("schedules", []) if isinstance(data, dict) and isinstance(data.get("schedules", []), list) else []
    runtime["last_schedule_runs"] = {}

    async def _run_due_schedule(schedule: dict[str, Any]) -> None:
        try:
            await async_run_schedule(hass, runtime, schedule)
            _LOGGER.info("Uruchomiono harmonogram Marco Vacuum: %s", schedule.get("name"))
        except Exception:
            _LOGGER.exception("Nie udało się uruchomić harmonogramu Marco Vacuum: %s", schedule.get("name"))

    def tick(now) -> None:
        # async_track_time_change expects a synchronous callback. Schedule the
        # coroutine explicitly on HA's event loop and mark the date first so
        # a long-running cleaning command cannot start twice.
        weekday = now.weekday()
        clock = now.strftime("%H:%M")
        for schedule in list(runtime["schedules"]):
            if not schedule.get("enabled") or clock != schedule.get("time") or weekday not in schedule.get("days", []):
                continue
            run_key = f"{schedule['id']}:{now.date().isoformat()}"
            if runtime["last_schedule_runs"].get(schedule["id"]) == run_key:
                continue
            runtime["last_schedule_runs"][schedule["id"]] = run_key
            hass.async_create_task(_run_due_schedule(schedule))

    unsub = async_track_time_change(hass, tick, second=0)
    entry.async_on_unload(unsub)
