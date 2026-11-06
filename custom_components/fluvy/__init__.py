"""Fluvy — a theme and card library for Home Assistant.

The integration puts the build where Home Assistant looks for it: it serves the module from its own
folder under a URL named after the build, loads it on every page, puts the settings panel in the
sidebar, keeps the Lovelace resource current and installs the theme. It stores nothing but its
config entry; Fluvy's settings live in the frontend's own system and user data.
"""

# SPDX-License-Identifier: GPL-3.0-only

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.const import EVENT_THEMES_UPDATED
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import DOMAIN, FLUVY_DATA, THEME_FILE, FluvyRuntime
from .frontend import (
    async_add_module,
    async_register_settings_panel,
    async_register_static,
    async_remove_module,
    async_remove_settings_panel,
    read_build,
    sweep_sidecars,
)
from .issues import (
    async_check_legacy_yaml,
    async_clear_issues,
    async_sync_resource_issue,
    async_sync_theme_issue,
)
from .resources import async_ensure_resource, async_remove_resources
from .theme import async_install_theme, async_remove_theme, theme_loaded, theme_path

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the build, once per process (a static route cannot be taken back; no entry owns it)."""
    root = Path(__file__).parent
    frontend_dir = root / "frontend"
    found = await hass.async_add_executor_job(read_build, frontend_dir)
    if found is None:
        _LOGGER.error(
            "Fluvy has no build to serve (%s): reinstall it through HACS, then restart",
            frontend_dir,
        )
        hass.data[FLUVY_DATA] = None
        return True
    version, build = found
    integration = await async_get_integration(hass, DOMAIN)
    if str(integration.version) != version:
        _LOGGER.warning(
            "Fluvy %s ships a frontend of version %s; its URLs follow the frontend",
            integration.version,
            version,
        )
    swept = await hass.async_add_executor_job(sweep_sidecars, frontend_dir)
    if swept:
        _LOGGER.warning("Removed %d compressed sidecar(s) beside Fluvy's scripts", swept)
    runtime = FluvyRuntime(version, build, frontend_dir, root / "themes" / THEME_FILE)
    await async_register_static(hass, runtime)
    hass.data[FLUVY_DATA] = runtime
    _LOGGER.debug("Fluvy %s (build %s) is served from %s", version, build, runtime.url_base)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Put Fluvy on every page: the module, the panel, the resource, the theme."""
    runtime = hass.data[FLUVY_DATA]
    if runtime is None:
        raise ConfigEntryError(translation_domain=DOMAIN, translation_key="frontend_missing")

    async_check_legacy_yaml(hass)
    async_add_module(hass, runtime)
    await async_register_settings_panel(hass, runtime)
    outcome = await async_ensure_resource(hass, runtime.bundle_url)
    async_sync_resource_issue(hass, outcome, runtime.bundle_url)
    _LOGGER.debug("Lovelace resource %s: %s", runtime.bundle_url, outcome)
    async_sync_theme_issue(hass, await async_install_theme(hass, runtime))

    healing = False

    async def _async_heal_theme() -> None:
        # the theme file went missing while running: put it back once, then let the issue speak
        nonlocal healing
        healing = True
        try:
            async_sync_theme_issue(hass, await async_install_theme(hass, runtime))
        finally:
            healing = False

    @callback
    def _themes_updated(_event: Event) -> None:
        loaded = theme_loaded(hass)
        if not loaded and not healing and not theme_path(hass).is_file():
            hass.async_create_task(_async_heal_theme())
            return
        async_sync_theme_issue(hass, loaded)

    entry.async_on_unload(hass.bus.async_listen(EVENT_THEMES_UPDATED, _themes_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Take the module and the panel off the pages (the served files stay until a restart)."""
    runtime = hass.data[FLUVY_DATA]
    if runtime is not None:
        async_remove_module(hass, runtime)
    async_remove_settings_panel(hass)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Fluvy was removed: take the resource and the theme away, forget the issues."""
    removed = await async_remove_resources(hass)
    _LOGGER.debug("Removed %d Lovelace resource(s)", removed)
    await async_remove_theme(hass)
    async_clear_issues(hass)
