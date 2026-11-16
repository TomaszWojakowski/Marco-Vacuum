"""Config flow for Marco Vacuum."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_VACUUM, DOMAIN


class MarcoVacuumConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Marco Vacuum."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Select the vacuum entity to read maps and rooms from."""
        errors = {}
        if user_input is not None:
            vacuum_entity = user_input[CONF_VACUUM]
            state = self.hass.states.get(vacuum_entity)

            if state is None:
                errors["base"] = "entity_not_found"
            elif vacuum_entity.split(".", 1)[0] != "vacuum":
                errors["base"] = "not_a_vacuum"
            elif not isinstance(state.attributes.get("maps"), list):
                errors["base"] = "not_dreame_entity"
            else:
                await self.async_set_unique_id(vacuum_entity)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"Marco Vacuum ({vacuum_entity})",
                    data={CONF_VACUUM: vacuum_entity},
                )

        schema = vol.Schema({
            vol.Required(CONF_VACUUM): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="vacuum")
            )
        })
        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )
