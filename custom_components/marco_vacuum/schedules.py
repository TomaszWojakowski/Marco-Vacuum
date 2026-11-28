"""Schedule support for Marco Vacuum."""

from __future__ import annotations

from datetime import time
import asyncio
import logging
from typing import Any
from uuid import uuid4

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, callback
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


async def _select_option(hass: HomeAssistant, entity_id: str, option: str) -> None:
    """Select an option on an entity, with a useful error if unavailable."""
    state = hass.states.get(entity_id)
    if state is None or state.state in ("unavailable", "unknown"):
        raise HomeAssistantError(f"Encja {entity_id} jest niedostępna.")
    await hass.services.async_call(
        "select", "select_option",
        {"entity_id": entity_id, "option": option},
        blocking=True,
    )


async def _wait_for_entity(hass: HomeAssistant, entity_id: str, timeout: int = 15) -> None:
    """Wait until an entity becomes available."""
    for _ in range(timeout):
        state = hass.states.get(entity_id)
        if state and state.state not in ("unavailable", "unknown"):
            return
        await asyncio.sleep(1)
    raise HomeAssistantError(f"Encja {entity_id} nie stała się dostępna.")


async def _wait_for_select_option(
    hass: HomeAssistant, entity_id: str, option: str, timeout: int = 15
) -> None:
    """Wait until a select exposes the requested option."""
    for _ in range(timeout):
        state = hass.states.get(entity_id)
        if state and state.state not in ("unavailable", "unknown"):
            options = state.attributes.get("options", [])
            if option in options:
                return
        await asyncio.sleep(1)
    raise HomeAssistantError(
        f"Opcja {option} nie jest dostępna w encji {entity_id}."
    )


async def _prepare_custom_cleaning(
    hass: HomeAssistant, entity_id: str, schedule: dict[str, Any]
) -> None:
    """Apply the saved per-room settings using Dreame's supported service."""
    object_id = entity_id.split(".", 1)[1]
    genius_entity = f"select.{object_id}_cleangenius"
    custom_entity = f"switch.{object_id}_customized_cleaning"

    # CleanGenius and customized cleaning cannot be active together on Dreame.
    await _select_option(hass, genius_entity, "off")
    await _wait_for_entity(hass, custom_entity)
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": custom_entity}, blocking=True
    )

    segments = [int(value) for value in schedule["segments"]]
    if schedule.get("settings_mode", "shared") == "individual":
        room_settings = schedule.get("room_settings", {})
        settings = [room_settings.get(str(segment), {}) for segment in segments]
    else:
        shared = schedule.get("shared_settings", {})
        settings = [shared for _ in segments]

    # Keep schedules created by versions before 0.2.8 working as before.
    if (
        schedule.get("settings_mode", "shared") == "shared"
        and not schedule.get("shared_settings")
        and not schedule.get("room_settings")
    ):
        payload = {
            "entity_id": entity_id,
            "segment_id": segments,
            "suction_level": [int(schedule.get("suction_level", 1)) for _ in segments],
            "repeats": [int(schedule.get("repeats", 1)) for _ in segments],
            "water_volume": [int(schedule.get("water_volume", 2)) for _ in segments],
        }
    else:
        # This X50 reports wetness_level capability, so use its 1–32 scale.
        payload = {
            "entity_id": entity_id,
            "segment_id": segments,
            "suction_level": [int(item.get("suction_level", 1)) for item in settings],
            "repeats": [int(item.get("repeats", 1)) for item in settings],
            "cleaning_mode": [int(item.get("cleaning_mode", 2)) for item in settings],
            "wetness_level": [int(item.get("wetness_level", 16)) for item in settings],
            "cleaning_route": [int(item.get("cleaning_route", 1)) for item in settings],
        }
    await hass.services.async_call(
        "dreame_vacuum", "vacuum_set_custom_cleaning", payload, blocking=True
    )


async def async_run_schedule(hass: HomeAssistant, runtime: dict[str, Any], schedule: dict[str, Any]) -> None:
    """Apply the schedule mode, select its map, and start the selected rooms."""
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
        for _ in range(30):
            state = hass.states.get(entity_id)
            if state and str(state.attributes.get("selected_map_id")) == str(map_id):
                break
            await asyncio.sleep(1)
        else:
            raise HomeAssistantError(f"Robot nie przełączył się na mapę {map_id}.")

    object_id = entity_id.split(".", 1)[1]
    if schedule.get("cleaning_type", "custom") == "cleangenius":
        custom_entity = f"switch.{object_id}_customized_cleaning"
        custom_state = hass.states.get(custom_entity)
        if custom_state and custom_state.state == "on":
            await hass.services.async_call(
                "switch", "turn_off", {"entity_id": custom_entity}, blocking=True
            )
        genius_value = schedule.get("cleangenius", "routine_cleaning")
        await _select_option(hass, f"select.{object_id}_cleangenius", genius_value)
        mode_entity = f"select.{object_id}_cleangenius_mode"
        mode_value = schedule.get("cleangenius_mode", "mop_after_vacuum")
        await _wait_for_select_option(hass, mode_entity, mode_value)
        await _select_option(hass, mode_entity, mode_value)
    else:
        await _prepare_custom_cleaning(hass, entity_id, schedule)

    await hass.services.async_call(
        "dreame_vacuum", "vacuum_clean_segment",
        {"entity_id": entity_id, "segments": [int(item) for item in schedule["segments"]]},
        blocking=True,
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
        "repeats": int(call.data.get("repeats", 1)),
        "suction_level": int(call.data.get("suction_level", 1)),
        "water_volume": int(call.data.get("water_volume", 2)),
        "cleaning_type": call.data.get("cleaning_type", "custom"),
        "cleangenius": call.data.get("cleangenius", "routine_cleaning"),
        "cleangenius_mode": call.data.get("cleangenius_mode", "mop_after_vacuum"),
        "settings_mode": call.data.get("settings_mode", "shared"),
        "shared_settings": dict(call.data.get("shared_settings", {})),
        "room_settings": dict(call.data.get("room_settings", {})),
    }
    if item["cleaning_type"] not in ("custom", "cleangenius"):
        raise HomeAssistantError("Nieprawidłowy tryb sprzątania.")
    if item["cleangenius"] not in ("off", "routine_cleaning", "deep_cleaning"):
        raise HomeAssistantError("Nieprawidłowy wariant CleanGenius.")
    if item["cleangenius_mode"] not in ("vacuum_and_mop", "mop_after_vacuum"):
        raise HomeAssistantError("Nieprawidłowy sposób pracy CleanGenius.")
    if item["settings_mode"] not in ("shared", "individual"):
        raise HomeAssistantError("Nieprawidłowy sposób konfiguracji pomieszczeń.")

    def _validate_settings(raw: dict[str, Any]) -> dict[str, int]:
        try:
            settings = {
                "cleaning_mode": int(raw.get("cleaning_mode", 2)),
                "suction_level": int(raw.get("suction_level", 1)),
                "wetness_level": int(raw.get("wetness_level", 16)),
                "cleaning_route": int(raw.get("cleaning_route", 1)),
                "repeats": int(raw.get("repeats", 1)),
            }
        except (TypeError, ValueError) as err:
            raise HomeAssistantError("Parametry sprzątania muszą być liczbami.") from err
        if settings["cleaning_mode"] not in (0, 1, 2):
            raise HomeAssistantError("Nieobsługiwany tryb sprzątania (wybierz 0–2).")
        if settings["suction_level"] not in range(4):
            raise HomeAssistantError("Siła ssania musi mieć wartość 0–3.")
        if settings["wetness_level"] not in range(1, 33):
            raise HomeAssistantError("Wilgotność musi mieć wartość 1–32.")
        if settings["cleaning_route"] not in (1, 2, 3, 4):
            raise HomeAssistantError("Trasa sprzątania musi mieć wartość 1–4.")
        if settings["repeats"] not in (1, 2, 3):
            raise HomeAssistantError("Liczba powtórzeń musi wynosić 1–3.")
        return settings

    if item["settings_mode"] == "shared":
        item["shared_settings"] = _validate_settings(item["shared_settings"])
        item["room_settings"] = {}
    else:
        item["room_settings"] = {
            str(segment): _validate_settings(item["room_settings"].get(str(segment), {}))
            for segment in segments
        }

    if not item["name"]:
        raise HomeAssistantError("Podaj nazwę harmonogramu.")
    try:
        time.fromisoformat(item["time"])
    except ValueError as err:
        raise HomeAssistantError("Godzina musi mieć format HH:MM.") from err

    # Persist a new snapshot first. Do not mutate the live runtime list until
    # storage has accepted and we have verified the saved data can be read back.
    schedules = list(runtime.get("schedules", []))
    index = next((i for i, old in enumerate(schedules) if old.get("id") == schedule_id), None)
    if index is None:
        schedules.append(item)
    else:
        schedules[index] = item

    store = runtime.get("schedule_store")
    if store is None:
        raise HomeAssistantError("Magazyn harmonogramów nie został zainicjalizowany.")
    try:
        await store.async_save({"schedules": schedules})
        stored = await store.async_load()
    except Exception as err:
        _LOGGER.exception("Błąd zapisu harmonogramu %s dla %s", schedule_id, runtime["vacuum_entity"])
        raise HomeAssistantError(f"Nie udało się trwale zapisać harmonogramu: {err}") from err

    saved_schedules = stored.get("schedules", []) if isinstance(stored, dict) else []
    if not any(isinstance(saved, dict) and saved.get("id") == schedule_id for saved in saved_schedules):
        _LOGGER.error(
            "Weryfikacja zapisu harmonogramu nie powiodła się: id=%s vacuum=%s storage_key=%s",
            schedule_id, runtime["vacuum_entity"], getattr(store, "key", "unknown"),
        )
        raise HomeAssistantError("Home Assistant nie potwierdził trwałego zapisu harmonogramu. Sprawdź dziennik integracji.")

    runtime["schedules"] = saved_schedules
    _LOGGER.info(
        "Trwale zapisano harmonogram %s (%s) dla %s; łącznie: %d",
        item["name"], schedule_id, runtime["vacuum_entity"], len(saved_schedules),
    )
    sensor = runtime.get("sensor")
    if sensor:
        sensor.async_write_ha_state()


async def _delete(hass: HomeAssistant, call: ServiceCall) -> None:
    runtime = _runtime(hass, call)
    current = list(runtime.get("schedules", []))
    updated = [item for item in current if item.get("id") != call.data["schedule_id"]]
    if len(updated) == len(current):
        raise HomeAssistantError("Nie znaleziono harmonogramu.")
    store = runtime.get("schedule_store")
    if store is None:
        raise HomeAssistantError("Magazyn harmonogramów nie został zainicjalizowany.")
    try:
        await store.async_save({"schedules": updated})
        stored = await store.async_load()
    except Exception as err:
        _LOGGER.exception("Błąd usuwania harmonogramu %s dla %s", call.data["schedule_id"], runtime["vacuum_entity"])
        raise HomeAssistantError(f"Nie udało się trwale usunąć harmonogramu: {err}") from err
    saved_schedules = stored.get("schedules", []) if isinstance(stored, dict) else []
    if any(isinstance(saved, dict) and saved.get("id") == call.data["schedule_id"] for saved in saved_schedules):
        raise HomeAssistantError("Home Assistant nie potwierdził usunięcia harmonogramu.")
    runtime["schedules"] = saved_schedules
    sensor = runtime.get("sensor")
    if sensor:
        sensor.async_write_ha_state()


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
        vol.Optional("repeats", default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=3)),
        vol.Optional("suction_level", default=1): vol.All(vol.Coerce(int), vol.Range(min=0, max=3)),
        vol.Optional("water_volume", default=2): vol.All(vol.Coerce(int), vol.Range(min=1, max=3)),
        vol.Optional("cleaning_type", default="custom"): vol.In(["custom", "cleangenius"]),
        vol.Optional("cleangenius", default="routine_cleaning"): vol.In(["off", "routine_cleaning", "deep_cleaning"]),
        vol.Optional("cleangenius_mode", default="mop_after_vacuum"): vol.In(["vacuum_and_mop", "mop_after_vacuum"]),
        vol.Optional("settings_mode", default="shared"): vol.In(["shared", "individual"]),
        vol.Optional("shared_settings", default={}): dict,
        vol.Optional("room_settings", default={}): dict,
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
    _LOGGER.info("Scheduler Marco Vacuum uruchomiony dla %s; wczytano %d harmonogramów", runtime["vacuum_entity"], len(runtime["schedules"]))

    async def _run_due_schedule(schedule: dict[str, Any]) -> None:
        try:
            await async_run_schedule(hass, runtime, schedule)
            _LOGGER.info("Uruchomiono harmonogram Marco Vacuum: %s", schedule.get("name"))
        except Exception:
            _LOGGER.exception("Nie udało się uruchomić harmonogramu Marco Vacuum: %s", schedule.get("name"))

    @callback
    def tick(now) -> None:
        # async_track_time_change expects a synchronous callback. Schedule the
        # coroutine explicitly on HA's event loop and mark the date first so
        # a long-running cleaning command cannot start twice.
        now = dt_util.as_local(now)
        weekday = now.weekday()
        clock = now.strftime("%H:%M")
        for schedule in list(runtime["schedules"]):
            if not schedule.get("enabled") or clock != schedule.get("time") or weekday not in schedule.get("days", []):
                continue
            run_key = f"{schedule['id']}:{now.date().isoformat()}"
            if runtime["last_schedule_runs"].get(schedule["id"]) == run_key:
                continue
            runtime["last_schedule_runs"][schedule["id"]] = run_key
            _LOGGER.info("Harmonogram Marco Vacuum: czas dopasowany dla %s (%s), odkurzacz %s", schedule.get("name"), schedule.get("id"), runtime["vacuum_entity"])
            hass.async_create_task(_run_due_schedule(schedule))

    unsub = async_track_time_change(hass, tick, second=0)
    entry.async_on_unload(unsub)
