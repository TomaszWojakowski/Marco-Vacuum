"""Daily room cleaning history for Marco Vacuum."""

from __future__ import annotations

import asyncio
from datetime import datetime
import logging
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from .const import CONF_VACUUM, DOMAIN
from .schedules import async_run_schedule

_LOGGER = logging.getLogger(__name__)
SERVICE_REFRESH = "refresh_daily_history"
SERVICE_RUN = "run_manual_cleaning"


def _runtime(hass: HomeAssistant, call: ServiceCall) -> dict[str, Any]:
    runtimes = [
        item for item in hass.data.get(DOMAIN, {}).values()
        if isinstance(item, dict) and "vacuum_entity" in item
    ]
    entity_id = call.data.get(CONF_VACUUM)
    found = next(
        (item for item in runtimes if item["vacuum_entity"] == entity_id),
        None,
    ) if entity_id else (runtimes[0] if len(runtimes) == 1 else None)
    if found is None:
        raise HomeAssistantError("Nie można jednoznacznie ustalić odkurzacza. Wskaż vacuum_entity.")
    return found


def _device_for_vacuum(hass: HomeAssistant, entity_id: str):
    """Resolve the upstream Dreame device through HA registries."""
    entity_registry = er.async_get(hass)
    entity = entity_registry.async_get(entity_id)
    if entity is None:
        raise HomeAssistantError(f"Nie znaleziono encji {entity_id} w rejestrze Home Assistant.")

    entry_ids = set()
    if getattr(entity, "config_entry_id", None):
        entry_ids.add(entity.config_entry_id)
    if entity.device_id:
        device = dr.async_get(hass).async_get(entity.device_id)
        if device:
            entry_ids.update(device.config_entries)

    for entry_id in entry_ids:
        coordinator = hass.data.get("dreame_vacuum", {}).get(entry_id)
        device = getattr(coordinator, "_device", None) if coordinator else None
        if device is not None:
            return device
    raise HomeAssistantError(
        f"Nie udało się powiązać {entity_id} z urządzeniem integracji Dreame Vacuum."
    )


def _date_of(item: Any):
    value = getattr(item, "date", None)
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.date()
    return dt_util.as_local(value).date()


def _int_ids(value: Any) -> set[int]:
    if not isinstance(value, (list, tuple, set)):
        return set()
    result = set()
    for item in value:
        try:
            result.add(int(item))
        except (TypeError, ValueError):
            continue
    return result


def _segment_ids(value: Any) -> set[int]:
    if isinstance(value, dict):
        values = value.keys()
    elif isinstance(value, (list, tuple, set)):
        values = value
    else:
        return set()
    result = set()
    for item in values:
        try:
            result.add(int(item))
        except (TypeError, ValueError):
            continue
    return result


def _blocked_ids(*values: Any) -> set[int]:
    """Return room IDs reported as blocked by the history item or decoded map."""
    result: set[int] = set()
    for value in values:
        result |= _segment_ids(value)
    return result


async def async_refresh_daily_history(
    hass: HomeAssistant, runtime: dict[str, Any]
) -> list[dict[str, Any]]:
    """Rebuild today's room summary from the upstream Dreame cleaning history."""
    from . import _map_catalog

    entity_id = runtime["vacuum_entity"]
    device = _device_for_vacuum(hass, entity_id)
    history = getattr(getattr(device, "status", None), "_cleaning_history", None) or []
    vacuum_state = hass.states.get(entity_id)
    catalog = _map_catalog(vacuum_state)
    today = dt_util.now().date()

    room_lookup: dict[tuple[int, int], dict[str, Any]] = {}
    map_lookup: dict[int, dict[str, Any]] = {}
    for map_item in catalog:
        map_id = int(map_item["map_id"])
        map_lookup[map_id] = map_item
        for room in map_item.get("rooms", []):
            room_lookup[(map_id, int(room["id"]))] = {
                "map_id": map_id,
                "map_name": map_item["name"],
                "room_id": int(room["id"]),
                "name": room["name"],
            }

    summary: dict[tuple[int, int], dict[str, Any]] = {}
    tasks: dict[tuple[int, str], dict[str, Any]] = {}
    indexed_today = [
        (index, item) for index, item in enumerate(history, start=1)
        if _date_of(item) == today
    ]

    # History is newest-first. Reverse it so task groups are created chronologically.
    indexed_today.reverse()
    for index, item in indexed_today:
        try:
            map_data = await hass.async_add_executor_job(device.history_map, index)
        except Exception:
            _LOGGER.exception("Nie udało się pobrać mapy historii %s dla %s", index, entity_id)
            map_data = None

        map_id = None
        if map_data is not None:
            map_id = getattr(map_data, "saved_map_id", None) or getattr(map_data, "map_id", None)
            if map_id not in map_lookup:
                nested = getattr(map_data, "cleaning_map_data", None)
                map_id = (
                    getattr(nested, "saved_map_id", None) or getattr(nested, "map_id", None)
                    if nested is not None else None
                )
        history_map_name = getattr(item, "map_name", None)
        if map_id not in map_lookup:
            normalized_name = str(history_map_name or "").strip().casefold()
            match = next(
                (m for m in catalog if str(m["name"]).strip().casefold() == normalized_name),
                None,
            )
            map_id = match["map_id"] if match else None
        if map_id is None:
            _LOGGER.warning(
                "Historia Marco: nie można przypisać wpisu do mapy: entity=%s index=%s "
                "item.map_name=%r item.map_id=%r decoded.map_id=%r decoded.saved_map_id=%r "
                "catalog=%s object_name=%r",
                entity_id,
                index,
                history_map_name,
                getattr(item, "map_id", None),
                getattr(map_data, "map_id", None) if map_data is not None else None,
                getattr(map_data, "saved_map_id", None) if map_data is not None else None,
                [(m["map_id"], m["name"], [r["id"] for r in m["rooms"]]) for m in catalog],
                getattr(item, "object_name", None),
            )
            continue

        outcome_maps = [map_data] if map_data is not None else []
        nested = getattr(map_data, "cleaning_map_data", None) if map_data is not None else None
        if nested is not None:
            outcome_maps.append(nested)

        selected_ids: set[int] = set()
        blocked_values = [
            getattr(item, "blocked_segments", None),
            getattr(item, "blocked_rooms", None),
        ]
        for outcome_map in outcome_maps:
            selected_ids |= _int_ids(getattr(outcome_map, "active_segments", None))
            blocked_values.extend([
                getattr(outcome_map, "blocked_segments", None),
                getattr(outcome_map, "blocked_rooms", None),
            ])
        blocked_ids = _blocked_ids(*blocked_values)

        timestamp = getattr(item, "date", None)
        timestamp_text = (
            dt_util.as_local(timestamp).isoformat(timespec="minutes")
            if isinstance(timestamp, datetime) and timestamp.tzinfo
            else timestamp.isoformat(timespec="minutes")
            if isinstance(timestamp, datetime)
            else None
        )
        logical_task = getattr(item, "multiple_cleaning_time", None)
        if logical_task is None:
            # Without Dreame's grouping key, keep this history row as its own task.
            logical_task = f"history:{index}"
        task_key = (int(map_id), str(logical_task))
        task = tasks.setdefault(task_key, {
            "map_id": int(map_id),
            "selected_ids": set(),
            "blocked_ids": set(),
            "completed": False,
            "last_timestamp": None,
            "last_timestamp_text": None,
        })
        task["selected_ids"] |= selected_ids
        task["blocked_ids"] |= blocked_ids
        task["completed"] = task["completed"] or bool(getattr(item, "completed", False))
        if isinstance(timestamp, datetime):
            previous = task["last_timestamp"]
            current_order = timestamp.timestamp()
            previous_order = previous.timestamp() if isinstance(previous, datetime) else float("-inf")
            if current_order >= previous_order:
                task["last_timestamp"] = timestamp
                task["last_timestamp_text"] = timestamp_text

    # Resolve each logical cleaning once, after merging all its history rows.
    # A blocked room fails the whole logical attempt; otherwise a selected room
    # succeeds only when the task itself is reported completed.
    for task in tasks.values():
        map_id = task["map_id"]
        attempted_ids = task["selected_ids"] | task["blocked_ids"]
        timestamp_text = task["last_timestamp_text"]
        for room_id in attempted_ids:
            base = room_lookup.get((map_id, room_id))
            if base is None:
                continue
            key = (map_id, room_id)
            record = summary.setdefault(key, {
                **base,
                "successful_cleanings": 0,
                "last_status": None,
                "last_attempt": None,
                "last_error": None,
            })
            if room_id in task["blocked_ids"]:
                record["last_status"] = "error"
                record["last_error"] = "Pomieszczenie zablokowane"
            elif task["completed"]:
                record["successful_cleanings"] += 1
                record["last_status"] = "ok"
                record["last_error"] = None
            else:
                record["last_status"] = "unknown"
                record["last_error"] = None
            record["last_attempt"] = timestamp_text

    # Keep map and room order consistent with the currently configured map catalog.
    result = []
    for map_item in catalog:
        map_id = int(map_item["map_id"])
        for room in map_item.get("rooms", []):
            record = summary.get((map_id, int(room["id"])))
            if record:
                result.append(record)

    runtime["daily_history"] = result
    runtime["daily_history_date"] = today.isoformat()
    runtime["daily_history_error"] = None
    runtime["daily_history_updated"] = dt_util.now().isoformat(timespec="seconds")
    sensor = runtime.get("sensor")
    if sensor:
        sensor.async_write_ha_state()
    binary_sensor = runtime.get("daily_history_binary_sensor")
    if binary_sensor:
        binary_sensor.async_write_ha_state()
    return result


async def _refresh_service(hass: HomeAssistant, call: ServiceCall) -> None:
    runtime = _runtime(hass, call)
    await async_refresh_daily_history(hass, runtime)


async def _run_manual(hass: HomeAssistant, call: ServiceCall) -> None:
    runtime = _runtime(hass, call)
    entity_id = runtime["vacuum_entity"]
    state = hass.states.get(entity_id)
    if state is None or state.state in ("unavailable", "unknown"):
        raise HomeAssistantError(f"Odkurzacz {entity_id} jest niedostępny.")
    attrs = state.attributes
    from . import _map_catalog
    selected_map = next(
        (item for item in _map_catalog(state) if int(item["map_id"]) == int(call.data["map_id"])),
        None,
    )
    segments = [int(value) for value in call.data["segments"]]
    valid_ids = {int(room["id"]) for room in selected_map["rooms"]} if selected_map else set()
    if not segments or len(segments) != len(set(segments)) or not set(segments).issubset(valid_ids):
        raise HomeAssistantError("Wybierz prawidłowe pomieszczenia z jednej dostępnej mapy.")
    if (
        attrs.get("running") or attrs.get("started") or attrs.get("segment_cleaning")
        or attrs.get("zone_cleaning") or state.state in ("cleaning", "room_cleaning", "paused")
    ):
        raise HomeAssistantError("Robot już wykonuje zadanie. Poczekaj na jego zakończenie.")

    schedule = {
        "map_id": int(call.data["map_id"]),
        "segments": segments,
        "cleaning_type": call.data["cleaning_type"],
        "cleangenius": call.data["cleangenius"],
        "cleangenius_mode": call.data["cleangenius_mode"],
        "settings_mode": call.data["settings_mode"],
        "shared_settings": dict(call.data["shared_settings"]),
        "room_settings": dict(call.data["room_settings"]),
    }
    await async_run_schedule(hass, runtime, schedule)


def register_services(hass: HomeAssistant) -> None:
    """Register daily-history and manual-cleaning services once."""
    if hass.services.has_service(DOMAIN, SERVICE_REFRESH):
        return

    async def refresh(call: ServiceCall) -> None:
        await _refresh_service(hass, call)

    async def run_manual(call: ServiceCall) -> None:
        await _run_manual(hass, call)

    hass.services.async_register(
        DOMAIN,
        SERVICE_REFRESH,
        refresh,
        schema=vol.Schema({vol.Optional(CONF_VACUUM): cv.entity_id}),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RUN,
        run_manual,
        schema=vol.Schema({
            vol.Required("map_id"): cv.positive_int,
            vol.Required("segments"): vol.All(cv.ensure_list, [cv.positive_int]),
            vol.Optional("cleaning_type", default="custom"): vol.In(["custom", "cleangenius"]),
            vol.Optional("cleangenius", default="routine_cleaning"): vol.In(["off", "routine_cleaning", "deep_cleaning"]),
            vol.Optional("cleangenius_mode", default="mop_after_vacuum"): vol.In(["vacuum_and_mop", "mop_after_vacuum"]),
            vol.Optional("settings_mode", default="shared"): vol.In(["shared", "individual"]),
            vol.Optional("shared_settings", default={}): dict,
            vol.Optional("room_settings", default={}): dict,
            vol.Optional(CONF_VACUUM): cv.entity_id,
        }),
    )


async def async_setup_entry(hass: HomeAssistant, entry, runtime: dict[str, Any]) -> None:
    """Initialize daily history and watch for task completion."""
    runtime.setdefault("daily_history", [])
    runtime.setdefault("daily_history_date", dt_util.now().date().isoformat())
    runtime.setdefault("daily_history_error", None)
    register_services(hass)

    try:
        await async_refresh_daily_history(hass, runtime)
    except Exception as err:
        runtime["daily_history_error"] = str(err)
        _LOGGER.exception("Nie udało się zainicjalizować dziennej historii %s", runtime["vacuum_entity"])

    async def delayed_refresh() -> None:
        await asyncio.sleep(8)
        state = hass.states.get(runtime["vacuum_entity"])
        if state and (
            state.attributes.get("running") or state.attributes.get("started")
            or state.attributes.get("segment_cleaning") or state.state in ("cleaning", "room_cleaning")
        ):
            return
        try:
            await async_refresh_daily_history(hass, runtime)
        except Exception:
            _LOGGER.exception("Nie udało się odświeżyć dziennej historii %s", runtime["vacuum_entity"])

    def schedule_refresh() -> None:
        old_task = runtime.get("daily_history_refresh_task")
        if old_task and not old_task.done():
            old_task.cancel()
        runtime["daily_history_refresh_task"] = hass.async_create_task(delayed_refresh())

    @callback
    def task_event(_event) -> None:
        if _event.data.get("entity_id") == runtime["vacuum_entity"]:
            schedule_refresh()

    @callback
    def vacuum_state_changed(event) -> None:
        if event.data.get("entity_id") != runtime["vacuum_entity"]:
            return
        old_state = event.data.get("old_state")
        new_state = event.data.get("new_state")
        if old_state is None or new_state is None:
            return
        old_attrs = old_state.attributes
        new_attrs = new_state.attributes
        was_active = bool(
            old_attrs.get("running") or old_attrs.get("started")
            or old_attrs.get("segment_cleaning") or old_state.state in ("cleaning", "room_cleaning")
        )
        is_active = bool(
            new_attrs.get("running") or new_attrs.get("started")
            or new_attrs.get("segment_cleaning") or new_state.state in ("cleaning", "room_cleaning")
        )
        if was_active and not is_active:
            schedule_refresh()

    unsub_task = hass.bus.async_listen("dreame_vacuum_task_status", task_event)
    unsub_state = hass.bus.async_listen("state_changed", vacuum_state_changed)
    entry.async_on_unload(unsub_task)
    entry.async_on_unload(unsub_state)

    async def midnight_refresh(_now) -> None:
        try:
            await async_refresh_daily_history(hass, runtime)
        except Exception:
            _LOGGER.exception("Nie udało się odświeżyć dziennej historii po zmianie dnia")
    from homeassistant.helpers.event import async_track_time_change
    unsub_midnight = async_track_time_change(hass, midnight_refresh, hour=0, minute=0, second=5)
    entry.async_on_unload(unsub_midnight)
