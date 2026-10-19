# Installation

Fluvy is one integration. Installing it through HACS puts everything in place: the module every page loads, the
settings panel, the dashboard resource and the theme. Nothing is written to `configuration.yaml`.

## Requirements

- Home Assistant **2026.9.0** or newer.
- [HACS](https://hacs.xyz) (or the release zip, below).
- The themes folder included in `configuration.yaml`. Most installations already have these lines; if not, add
  them (the theme is a file Home Assistant reads from `themes/`):

  ```yaml
  frontend:
    themes: !include_dir_merge_named themes
  ```

## Through HACS

Until Fluvy is listed in HACS's default store, it is added once as a custom repository; downloads and updates then
work exactly as for any other integration.

1. HACS → menu (⋮) → **Custom repositories** → add `https://github.com/acosta290/fluvy`, type **Integration**
   (the button in the README opens this dialog with the fields filled in). Skip this step once Fluvy is in the
   default store.
2. Search for **Fluvy** and download it.
3. Restart Home Assistant (HACS asks for it).
4. **Settings → Devices & services → Add integration** → search for **Fluvy** → add. There is nothing to configure.
5. Reload the browser, then choose the **Fluvy** theme in your profile (**Theme → Fluvy**) or accept the offer in
   the panel's *Scope* tab. Everyone in the house does this once, on any device; it follows their profile.

## Why an integration, and not a theme

In HACS — and in Home Assistant's Marketplace from 2026.11, which reads the same catalogue — Fluvy is listed under **Integration**,
not under Theme or Dashboard, so the type filters never show it: search for "Fluvy" or "theme" with no type filter.
A HACS theme can only be a YAML file copied into `themes/`, which Home Assistant never serves to the browser, and a
dashboard plugin is JavaScript with no Python behind it; Fluvy is the theme plus the cards, the dashboards, the
settings panel, the Activity and History pages and the restyling of Home Assistant's own pages, and only an
integration can put all of that in place (the module on every page, the panel, the resource, the theme file, the
Repairs). Every project of that shape is listed the same way.

## From the release zip

Download `fluvy.zip` from the [latest release](https://github.com/acosta290/fluvy/releases/latest), unzip it so that
the files land in `<config>/custom_components/fluvy/` (the zip holds the folder's content: `manifest.json` sits
directly inside `fluvy/`), restart Home Assistant and continue at step 4 above.

## What the integration does

Every start, the integration:

- serves the build it ships under a URL named after the build, `/fluvy-frontend/<version>-<build>/…`, cacheable for a
  month because a new build is a new URL;
- loads the module on every page (Home Assistant's `extra_module_url`, set from code — no YAML);
- registers the settings panel (`/fluvy`, **Fluvy** in the sidebar, for everyone, not only administrators);
- keeps one dashboard resource pointing at the current build, so dashboards load the cards before they render;
- installs the theme into `<config>/themes/fluvy/fluvy.yaml` (only when it changed) and reloads the themes.

It stores nothing but its config entry. Fluvy's own settings live in Home Assistant's frontend data (see
[the settings panel](settings-panel.md)).

## Repairs

When something only you can do is needed, it appears in **Settings → System → Repairs**:

| Issue | What it means | What to do |
| --- | --- | --- |
| *Fluvy's theme is not loaded* | the theme file is in place but `configuration.yaml` does not include the themes folder | add the two lines from *Requirements*, then run the action `frontend.reload_themes` (Developer tools → Actions). No restart needed; the issue clears itself. |
| *Add Fluvy's dashboard resource* | your dashboard resources are configured in YAML (`lovelace: resources:`), which Fluvy cannot write | add the resource the issue shows (`type: module`) and reload the browser. Fluvy already loads on every page; the resource lets dashboards load it before they render. |
| *Remove Fluvy's old lines from configuration.yaml* | a manual install from before the integration left `panel_custom:` and `extra_module_url` entries pointing at `/local/fluvy/` | delete the lines the issue lists, keep the `themes:` line, check the configuration and restart when convenient. The integration has already taken over. |

## Updating

HACS shows the new version like any other; download, restart. The new build gets a new URL, so no browser or
service worker ever serves an old build. The theme is rewritten only when it changed.

## Uninstalling

**Settings → Devices & services → Fluvy → Delete.** The integration removes the panel, the module, the dashboard
resource and the theme file. Then remove Fluvy in HACS and restart. Dashboards you built with Fluvy cards keep their
configuration; the cards show as missing until Fluvy is back.
