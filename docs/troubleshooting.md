# Troubleshooting

## The integration is there but nothing looks different

Reload the browser twice: Home Assistant's service worker serves the previous page once. Then check your profile —
the theme has to be **Fluvy** for the pages to follow; the cards and the panel work with any theme.

## "Custom element doesn't exist: fluvy-…"

The dashboard rendered before the module arrived. Reload once. If it stays, look at **Settings → System → Repairs**:
if your dashboard resources are configured in YAML, the resource has to be added by hand (the issue shows it).

## The theme is not in the list

**Settings → System → Repairs** says why: `configuration.yaml` does not include the themes folder. Add

```yaml
frontend:
  themes: !include_dir_merge_named themes
```

and run the action `frontend.reload_themes` (Developer tools → Actions). No restart is needed.

## The text is Roboto, not Inter

The fonts are loaded from the same folder as the build; a content blocker or a proxy that rewrites `/fluvy-frontend/`
stops them. The browser's network panel shows the request that failed.

## "Fluvy is already running; this copy stands down"

Two builds met in one page: usually a manual install from before the integration, still referenced by
`configuration.yaml` or by a resource under `/local/fluvy/`. **Settings → System → Repairs** lists the lines to
remove; the integration has already replaced them in memory.

## A Home Assistant page looks half Fluvy

A Home Assistant release changed that page. See [Everywhere](shell.md): type `__fluvy.shell.report()` in the console
and open an issue with the output.

## A page inside HACS looks plain

HACS runs in a frame of its own; the shell reaches it, but only once the frame has finished loading. Reload the page.

## The wall shows the sidebar again

Wall mode hides the sidebar and the dashboard header through the shell's sheets; each one probes for what it
restyles and stands down when a Home Assistant release changes it (`__fluvy.shell.report()` in the browser console
lists the `wall:` sheets and whether their probe matched). Until Fluvy follows the release, the wall is a plain
dashboard.

If the sidebar came back after a tap on the × in the corner, the device left wall mode: *Back to the wall* on the
notice, the switch of the *Wall* tab, or `?kiosk` on the address make it a wall again. If it came back after a hold
on the corner (a house that chose *Long press*), the wall is only paused: *Resume* on the toast, or wait for the
screensaver's time.

## The wall's screen goes dark by itself

The screen wake lock exists only on a secure page (HTTPS). Over plain HTTP the tablet's own screen timeout rules;
Fluvy cannot keep it awake.

## A list filled by auto-entities

[auto-entities](https://github.com/thomasloven/lovelace-auto-entities) hands its matches to the card under `entities`,
each an object with options of its own, and sometimes a section's title or a divider among them. Every Fluvy card of
a list reads them that way (the bars card takes them as its `rows`, the stat tiles as their `tiles`) and skips the
titles and dividers. While the filter matches nothing, the card shows its head and an empty panel, then its rows the
moment something matches; an empty list is never a configuration error. Say what nothing means with `empty_text`, or
let the card step aside while it is empty with `hide_empty: true` (auto-entities' own `show_empty: false` does the
same from outside):

```yaml
type: custom:auto-entities
filter:
  include:
    - domain: binary_sensor
      attributes:
        device_class: window
      state: 'on'
card:
  type: custom:fluvy-openings-card
  title: Open windows
  empty_text: All closed
```

A card that showed "add at least one entity" before 1.9 keeps that error until the page is reloaded once.

## The alerts card is not on the dashboard

It hides itself while all is clear (`hide_empty` is on for this card), and comes back the moment an alert applies.
`hide_empty: false` keeps an "All clear" tile in its place; in the editor's preview it is always drawn. A snoozed
alert waits in the overview (a long press on any alert), with Wake.

## A card is shorter or taller than it was

Since 1.9 a card out of reach (unavailable, unknown, a missing entity) keeps the size and the anatomy it has live, a
thermostat in half a section puts its − and + under the temperature, an empty room keeps its photo, and the generated
dashboards reserve each card its real height. A card stored at four columns whose minimum is now six (compact
thermostat, light, fan, lock, gauge, room) draws at six: Home Assistant holds a card to its minimum.

## Collecting a report

**Settings → Devices & services → Fluvy → ⋮ → Download diagnostics** gives the build served, its URLs, the dashboard
resource, the theme's state and any open issue — with nothing of your home in it. Add the browser's console lines that
mention `fluvy`, the Home Assistant version, the browser or app, and how Fluvy is installed.
