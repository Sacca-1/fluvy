# The cards

Fifty-five cards, listed as **Fluvy · …** in the card picker, each with a live preview and an editor form. The form is
the reference for a card's options: it shows what the card does by default, and a default you leave as it is is never
written into the configuration. In YAML, a card is `type: custom:<tag>` plus the entity or entities it draws and any
option the editor offers; the *Options* column below names them (a select's values in brackets, a list with its item
keys), and *Reads* the older names a card still accepts (read, never written back). Every entity card also takes
`entity`, `name`, `icon`, `tap_action`, `hold_action`, `tone`, `color` and `card_color` (a quiet wash of a colour as
the card's own surface, its edge and dividers in it — see [the theme guide](theme.md#a-colour-per-card-and-per-item));
a list card takes `title`. A card with a head also takes `show_icon`: `auto` (the default: the circle gives way where
a long name in a narrow column needs its room, and only then), `always` (the circle stays while the name keeps a
few letters beside it: a smaller circle first, then none) or `never`. The tables are generated from the code (`pnpm docs:cards`).

Every card holds from the floor of a narrow column — 152 px for a card that takes half a section, 211 px for a full
one — up to a wall's 520 px, in light and dark, in every language Fluvy speaks; `unavailable`, `unknown` and a
missing entity are drawn on purpose (a quiet surface, inert controls, a dash for the value), never as an error, and
at the size and in the anatomy the card has live, so a grid never jumps when a device goes offline. Names may be
shortened with an ellipsis; values never are. A card that takes an action changes on screen first and calls
the service after; sliders and dials send on release, not per frame. A card of a list with nothing in it (a filter
that matches nothing yet, the last entry taken out) shows its head and an empty panel in its own words, never an
error: `empty_text` says what nothing means there ("All closed"), and `hide_empty: true` lets the card step aside
until something is listed again (see [auto-entities](troubleshooting.md#a-list-filled-by-auto-entities)).

`tap_action` and `hold_action` are Home Assistant's actions: `more-info` (the default), `toggle`, `navigate`, `url`,
`perform-action` (and `call-service`, as it was written before Home Assistant 2024.8), `assist`, `fire-dom-event`
and `none`. The head is the card's button: a tap on its circle, its name, the line under it or the room up to what
trails them answers the tap, and a still press anywhere on it the hold (with a keyboard: Tab to it, Enter taps,
Shift+F10 or the menu key holds). A control in the head (a switch, a "…" button) keeps its own tap beside it, and the
body keeps its own controls, so a slide is never a tap; a mouse that drags never taps either. A tile answers both on
its whole surface, a large one around its switch and ruler; a player on its art and its words; a greeting with no
avatar on its words. A head whose actions have nothing to act on (a card of many entities has no details of its own)
is no button at all. An action with a `confirmation` is asked about first, by Home Assistant's own dialog, and nothing
on the card moves before the answer.

## Customisation

Every card exposes what to show (section switches such as `show_fan`), which items appear and in which order (subset
lists such as `modes: [off, heat, cool]`), and at least one other layout through `variant`. Chip rows fill the row by
default and are content-sized on request (`preset_style`, `fan_style`, `suction_style: chips`). Cards that list rows
(lock, alarm, camera, bars, stat tiles) take a `rows` list edited with Fluvy's own rows editor. While a device is off,
the thermostat and the fan can keep to the essentials (`when_off: essentials`) — the thermostat its head, value and
modes, the fan its switch and speed ruler — and presets, fan speeds, oscillation and direction come back the moment a
mode or the switch wakes it (the water heater and the humidifier only have modes, so nothing hides on them).

A sensor card's readouts are named by their measure when nothing is set ("Temperature", "Humidity"); `label` names
the card's own sensor, an entry's `name` names that entry, and each entry may take its own `color`:

```yaml
type: custom:fluvy-sensor-card
entity: sensor.office_climate_temperature
label: Inside
entities:
  - entity: sensor.office_climate_humidity
    name: Humidity
    color: teal
```

A colour bulb's quick colours (`colors`) are the house's own, any number in any order: `warm`, `cool`, a Home
Assistant colour name, `#rrggbb`, `[r, g, b]`, `picker` (a round that opens the browser's colour picker), or any of
those with a `name` its round says. The editor edits them row by row — a colour (the words, the picker, or *Custom
colour* with a colour well) and a name — and shows the bulb's default six until the list is touched; a hex reads as
itself and a colour name as words ("Deep purple") when no name is given.

```yaml
type: custom:fluvy-light-card
entity: light.lamp
colors:
  - warm
  - color: "#ff2d55"
    name: Lila
  - color: [0, 128, 128]
    name: Teal
  - deep-purple
  - picker
```

A lit light card can show its light's colour on its whole surface (`tint`, 1.9): `on` while the light is on, `always`
with a quiet wash of it at rest too, `off` never. How much: `full` (the default) is a lit tile's fill in that colour —
the same on every palette as a tile's — `soft` a gentler wash, and `brightness` a wash as strong as the lamp is bright
(a lamp at 10 % still reads lit). The colour is the card's own `color` when it has one (*Primary* is the palette's
accent; the editor's *State* follows the light), else its `tone`, else the light's: the colour it glows, a group's lit
members' by their brightness, the one you just tapped. A white shows as the palette's lit light, or by its temperature
with `light_whites: temperature`. Where a card says nothing, the house decides (the settings panel → Appearance → Lights;
off unless chosen):

```yaml
type: custom:fluvy-light-card
entity: light.sofa_lamp
tint: on
tint_strength: brightness
```

Tiles, a tiles group, a room's tiles and rows, and an entities card's rows can wear a lit colour bulb's colour as well
(`light_colors: true`, or the house's choice): a tile's own `color` or `tone`, and the card's, come first.

The history bars card reads a sensor's long-term statistics (`days` bars of a `period`: days, weeks or months; a
bar is what a meter gained, or a measurement's `mean`, `max` or `min`). Its head readouts (`head`) and the facts
under the chart (`facts`) are lists of kinds you compose in order — `total`, `average`, `highest`, `lowest`,
`today`, and the equivalents `co2` (× `co2_factor`, 0.4 kg a kWh), `trees` (22 kg a tree a year), `km` (5 km a
kWh), `money` (× `price`, in the house's currency), `share` (`of` another sensor) and `template` — each with its
own `name`, `icon`, `color`, `unit`, `decimals`, `factor` and `tap_action`. The factors are rough and yours to set.
Every part switches off (`show_values`, `show_axis`, `show_grid`, `show_dates`, `show_facts`, `show_head`), the
day in progress joins with `include_today`, and `variant: compact` keeps the bars and their dates, `mini` a row of
readouts and a sparkline:

```yaml
type: custom:fluvy-history-bars-card
entity: sensor.grid_export_energy
name: Feed-in to grid
icon: up
color: '#86B98C'
price: 0.19
facts:
  - kind: share
    of: sensor.solar_energy
    name: Share of production
    icon: tower
  - kind: money
    name: Revenue (est.)
  - kind: co2
    name: CO₂ avoided
```

By default a meter's bars are what Home Assistant counts (its long-term `change`, the Energy dashboard's numbers).
A counter that starts again from zero on a cycle — a day counter, a monthly rain gauge — is better read by its own
readings: `reset: day` (or `week`, `month`, `year`) reads it at each hour's or day's end, so a reset that comes as
two writes, a restart that reads 0 for a moment, or a `total` without `last_reset` is never counted twice or below
zero; `reset: never` reads a lifetime meter the same way. The editor names a utility meter's own cycle. `stat: state`
draws the reading at the end of each bar (a monthly gauge by month is each month's rain). A sensor with no state
class has no statistics: its bars come from the recorder's history, kept for its last days (`source: history` asks
for it always). Today is live, the average, the highest and the lowest are the finished bars', and the days before
a sensor existed stay empty. `negative_color` and `current_color` give the bars below zero and the one in progress
colours of their own; `unit` converts within energy, power, volume and distance:

```yaml
type: custom:fluvy-history-bars-card
entity: sensor.rain_this_month
days: 28
include_today: true
reset: month
unit: in
current_color: blue
```

## Templates in row text

In every list of rows (entities, lock, alarm, camera, bars, stat tiles, actions, helpers) a row's `secondary` may be
a Home Assistant template instead of a keyword or words of its own: anything with `{{ … }}` or `{% … %}` is rendered
by Home Assistant and kept live, so the line changes as the entities it reads do. The row's own entity is `entity` in
the template and the person looking at the dashboard `user`; a template that fails renders an empty line, never its
own text. The editor's field takes a keyword or a template alike.

```yaml
type: custom:fluvy-entities-card
rows:
  - entity: climate.living
    secondary: "{{ state_attr('climate.living', 'current_temperature') }} °C · {{ states('sensor.humidity') }} %"
```

## Schedules

The automations card lists every automation of the house — on or off, when it last ran — and the schedules Fluvy
wrote among them with their days, their times and their next run. A schedule is a native Home Assistant automation
(it is in Settings → Automations too, and Home Assistant's own editor opens it); Fluvy only adds the easy sheet, the
list and the management. Tap `+` to add one: what it targets, what it does (on, off, open, close, run; a
brightness or a target temperature), on which days (every day, workdays by the workday integration's sensor, the
weekend, or the days you pick), when (a time, or sunrise and sunset with an offset) and, with an end, until when.
One edited in Home Assistant past Fluvy's shape is still listed, as a plain row; only administrators add, edit or
delete, and everyone else sees the list, the switch and Home Assistant's dialog on tap.

```yaml
type: custom:fluvy-automations-card
show: schedules
variant: tiles
entities:
  - automation.good_morning
  - automation.blinds
```

A card in a popup is about one lamp, not the house: `targets` lists the entities it is about (each with a name, an
icon and what a new schedule for it does — its verb, a brightness, a temperature), the list shows their schedules and
the automations Home Assistant relates to them, the head says when the lamp next turns on, and `+` opens the sheet
already set to it, so a timer is `+`, pick the time, Save. The sheet's "Until" has quick ends (15 min, 30 min, 1 h,
2 h after the start). Only administrators create or edit automations (Home Assistant's rule); everyone else gets the
list and the switches.

```yaml
type: custom:fluvy-automations-card
title: Timers
targets:
  - entity: light.kitchen
```

## Appliances

The appliance card finds a washer, a dryer, a dishwasher, an oven, a hob, a hood, a fridge, a freezer, a wine cooler, a
coffee machine, a kettle, an air fryer, a microwave, a toaster, a blender, a sandwich maker — or any appliance on a
smart plug, read from the plug's switch and power — by what its integration says (LG ThinQ and LG's older SmartThinQ,
Home Connect, Miele, SmartThings, Matter, Whirlpool, Tuya, hOn, Electrolux) or by its name in any of Fluvy's
languages; `kind` names it when the card guesses wrong, `roles` names an entity for a role. The card is the design a
reader drew for us: a picture of the appliance (`picture`: a drawing a kind, the icon, none, or `image` for your own
photo), its name and what it is doing, a power button tinted by what it does, its kind's hero — the time left over a
bar, an oven's temperature and target, a fridge's compartments, a hob's zones, a coffee machine's drinks — and three
`rows` under a hairline (the programme, water, energy, a filter to clean, the last coffee: picked, ordered, named,
coloured and given actions in the rows editor), `maintenance` as rows of their own, and buttons only where the
integration's own code says exactly how (start, pause, stop, power, the light; the rest is shown and never written).
`variant: compact`, `ring` (a dial) and `row` are the smaller layouts; every part switches off (`show_power`,
`show_hero`, `show_progress`, `show_rows`, `show_controls`…). An administrator sees a bell beside the time left:
"Tell me when it's done" writes a normal automation that notifies their phone when the appliance finishes.

```yaml
type: custom:fluvy-appliance-card
device: 1f2c…            # the appliance's device; or entity: one of its entities
kind: washer             # auto by default
rows: [program, water, energy]
```

The appliances card lists the house's appliances (or those it names in `appliances`) as rows, compact rows, tiles
or — `variant: cards` — each as its whole card side by side, as many as fit: what needs a hand first, then what runs,
what waits, what is done, what rests; `show: active` keeps only the busy ones. The automatic dashboards lay the
house's appliances out the same way across Home and across every room.

```yaml
type: custom:fluvy-appliances-card
variant: cards
```

## Alerts

The alerts card gathers what needs a look. Each alert is one line — a `preset` (`low_battery`, `unavailable`, `open`,
`unlocked`, `hazards`, `errors`, `updates`, `lights_on`, `ha_alerts`, `repairs`) or a matcher of your own (ids,
`entity_id` patterns, `domain`, `device_class`, `integration`, `area`, `floor`, `label`, `device`, `state`, `above`,
`below`, `attribute`, `for`…) — and one definition drives its count, its list in the sheet and its buttons. A preset
waits where a moment is no news — `unavailable` and `open` five minutes, `unlocked` ten — and `for` says otherwise
(`for: 0` shows it at once). Alerts are ordered by `severity` (critical, warning, info; info in the palette's accent,
or its blue where the accent is warm enough to pass for a warning), an alert can `escalate` after a while or past a
count, and `conditions` take Home Assistant's own visibility shapes. `variant` draws them as `tiles` (the default),
`mini`, `chips`, `rows` under a head, or a `banner` that turns through them; the card hides itself while all is clear
(`hide_empty: false` keeps an "All clear" tile). A tap opens the alert's sheet — each entity with its state, where
and how long, a button of its own (Lock, Close, Install, Dock, Acknowledge) and the alert's (Lock all, asked first) —
and Snooze (an hour, eight, until tomorrow morning, until it changes; the snooze follows you to every device, or
stays on this device with `snooze: device`); a long press opens every alert, the snoozed ones with Wake. Home
Assistant's repairs (for administrators) and its `alert` entities are alerts too.

```yaml
type: custom:fluvy-alerts-card
alerts:
  - preset: unavailable
    domain: light
    name: Lights unavailable
  - preset: low_battery
  - preset: open
    for: { minutes: 15 }
  - preset: errors
  - preset: updates
```

<!-- generated:cards -->

## Everyday

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Tile** | `custom:fluvy-tile-card` | A light, switch, cover, fan or sensor as a tile: large with a precision ruler or two readouts, compact row, or mini. | `size` (`large`, `compact`, `mini`), `tint` (`on`, `always`), `light_colors`, `readouts` | — |
| **Tiles** | `custom:fluvy-tiles-card` | A group of compact or mini tiles, two to four per row, 8 px apart. | `size` (`compact`, `mini`, `large`), `columns` (`1`, `2`, `3`, `4`, `auto`), `tint` (`on`, `always`), `light_colors`, `readouts`, `empty_text`, `hide_empty`, `tiles` (a list: `entity`, `name`, `icon`, `tone`, `color`, `readouts`, `tap_action`, `hold_action`) | `entities` → `tiles` |
| **Light** | `custom:fluvy-light-card` | The precision dimmer: relative drag, slide away to slow down, hold for the 1 % scale, colour temperature. | `variant` (`auto`, `full`, `compact`), `show_stepper`, `show_temperature`, `show_color`, `temperature_tint`, `live_update`, `tint` (`off`, `on`, `always`), `tint_strength` (`soft`, `brightness`, `full`), `light_whites` (`palette`, `temperature`), `colors` (a list: `color`, `name`, `rgb`) | — |
| **Room lights** | `custom:fluvy-lights-card` | A room’s lights on one card: one tap for the whole room, a round, chip or tile for each light, in its colour. | `area`, `variant` (`row`, `chips`, `tiles`), `show_brightness`, `show_count`, `show_level`, `light_colors`, `tint` (`on`, `always`), `empty_text`, `hide_empty`, `lights` (a list: `entity`, `name`, `icon`, `color`) | `entities` → `lights` |
| **Thermostat** | `custom:fluvy-thermostat-card` | Climate, water heater or humidifier on a dial, with modes, presets and fan speeds. | `subtitle`, `variant` (`dial`, `compact`, `ruler`), `show_stepper`, `show_modes`, `modes_style` (`tiles`, `chips`, `full`), `modes` (`off`, `heat`, `cool`, `heat_cool`, `auto`, `dry`, `fan_only`), `show_current`, `show_presets`, `preset_style` (`full`, `chips`), `show_fan`, `fan_style` (`full`, `chips`), `when_off` (`all`, `essentials`) | — |
| **Entities** | `custom:fluvy-entities-card` | Rows of entities: a switch for what toggles, the value for what is measured. | `title`, `subtitle`, `variant` (`rows`, `compact`), `show_count`, `light_colors`, `empty_text`, `hide_empty`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | `entities` → `rows` |
| **Media** | `custom:fluvy-media-card` | A media player: artwork, seek bar, transport and volume — full, compact row or hero. | `variant` (`full`, `mini`, `hero`), `source_style` (`full`, `chips`), `show_source`, `show_volume`, `show_power`, `controls` (`power`, `previous`, `play`, `next`, `volume`) | — |
| **Now playing** | `custom:fluvy-now-playing-card` | The compact player of the home screen: artwork, thin progress, transport and volume. | `show_volume`, `show_power`, `controls` (`power`, `previous`, `play`, `next`, `volume`) | — |
| **Cover** | `custom:fluvy-cover-card` | Blinds, shutters, garage doors and valves: vertical position ruler, tilt, open · stop · close, favourites. | `subtitle`, `tilt_angle`, `variant` (`full`, `compact`), `favorites_style` (`full`, `chips`), `show_tilt`, `show_favorites`, `favorites` (a list: `name`, `position`, `tilt`) | — |
| **Fan** | `custom:fluvy-fan-card` | Speed ruler with steps, oscillation, direction and presets. | `subtitle`, `variant` (`full`, `compact`), `show_stepper`, `show_presets`, `preset_style` (`full`, `chips`), `show_oscillation`, `show_direction`, `when_off` (`all`, `essentials`) | — |
| **Vacuum** | `custom:fluvy-vacuum-card` | Robot vacuum or mower: battery, start · stop · dock · locate, suction. | `subtitle`, `variant` (`full`, `compact`), `show_battery`, `battery_entity`, `area_entity`, `duration_entity`, `remaining_entity`, `suction_style` (`full`, `chips`) | — |
| **Lock** | `custom:fluvy-lock-card` | Slide to unlock, never one accidental tap; codes, jammed state, related rows. | `subtitle`, `variant` (`full`, `compact`), `show_rows`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | — |
| **Alarm** | `custom:fluvy-alarm-card` | Arm modes as tiles and the keypad sheet for codes. | `subtitle`, `variant` (`tiles`, `compact`), `modes` (`disarm`, `arm_home`, `arm_away`, `arm_night`, `arm_vacation`, `arm_custom_bypass`), `show_rows`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | — |
| **Camera** | `custom:fluvy-camera-card` | A still that refreshes itself, or Home Assistant’s live stream, in the shape you choose; tap for the stream. | `subtitle`, `camera_view` (`auto`, `live`), `refresh`, `aspect_ratio` (`16:9`, `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, `native`), `fit_mode` (`cover`, `contain`), `show_rows`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | `sub` → `subtitle` |
| **3D printer** | `custom:fluvy-printer-card` | A 3D printer’s job: progress, time left, heaters, layers, filament and the camera; pause, resume and stop. OctoPrint, PrusaLink, Bambu Lab, Moonraker, Creality, Elegoo, Anycubic, Snapmaker and FlashForge. | `device`, `variant` (`full`, `compact`, `row`), `readouts` (`nozzle`, `bed`, `chamber`, `layer`, `speed`, `filament`, `elapsed`), `show_image`, `image` (`auto`, `camera`, `preview`), `camera_view` (`auto`, `live`), `fit_mode` (`cover`, `contain`), `aspect_ratio` (`16:9`, `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, `native`), `show_filament`, `show_controls`, `sensors` (a list: `entity`, `name`), `roles` (a list: `role`, `entity`) | — |
| **Appliance** | `custom:fluvy-appliance-card` | A washer, dryer, dishwasher, oven, hob, fridge, coffee machine or small appliance on a plug, pictured: what it does, when it is ready, what it uses, its reminders. | `device`, `kind` (`auto`, `washer`, `dryer`, `washer_dryer`, `dishwasher`, `oven`, `microwave`, `hob`, `hood`, `fridge`, `freezer`, `wine`, `coffee`, `kettle`, `air_fryer`, `toaster`, `blender`, `sandwich_maker`, `appliance`), `variant` (`full`, `compact`, `ring`, `row`), `unit` (`both`, `main`, `sub`), `picture` (`art`, `icon`, `none`), `image`, `show_power`, `power_action`, `show_notify`, `show_hero`, `show_progress`, `progress_style` (`auto`, `bar`, `steps`), `time` (`both`, `left`, `end`), `show_zones`, `setpoint_style` (`readout`, `stepper`), `show_drinks`, `show_rows`, `drinks`, `row_values` (`inline`, `end`, `plain`), `readouts` (`program`, `temperature`, `spin`, `dryness`, `energy`, `water`, `cycles`, `detergent`, `elapsed`, `total`, `this_cycle`, `probe`, `power`), `show_maintenance`, `show_modes`, `modes_style` (`chips`, `tiles`), `modes` (`super_cool`, `super_freeze`, `eco`, `holiday`, `ice_maker`, `sabbath`, `child_lock`), `show_controls`, `show_programs`, `controls` (`start`, `pause`, `stop`, `power`, `light`), `unload_reminder`, `unload_after`, `done_for`, `door_alert`, `low_level`, `running_power`, `finished_after`, `rows` (a list: `key`, `entity`, `name`, `icon`, `color`, `tap_action`, `hold_action`), `sensors` (a list: `entity`, `name`), `maintenance` (a list: `key`, `name`, `icon`, `color`, `tap_action`, `hold_action`), `zones` (a list: `entity`, `name`, `icon`, `color`, `tap_action`, `hold_action`), `roles` (a list: `role`, `entity`) | — |
| **Appliances** | `custom:fluvy-appliances-card` | The house’s appliances as live rows, or their whole cards side by side: what runs, what is done, what waits. | `title`, `subtitle`, `variant` (`rows`, `compact`, `tiles`, `cards`), `max_rows`, `picture` (`art`, `icon`, `none`), `show` (`all`, `active`), `sort` (`state`, `name`, `none`), `show_count`, `hide_empty`, `empty_text`, `appliances` (a list: `device`, `entity`, `name`, `icon`, `color`, `kind`, `tap_action`, `hold_action`) | — |
| **Weather** | `custom:fluvy-weather-card` | Condition, temperature, feels-like, wind and the daily or hourly forecast. | `variant` (`full`, `compact`), `forecast` (`daily`, `hourly`, `both`), `days`, `show_forecast` | `forecast` → `show_forecast` |
| **Sensor** | `custom:fluvy-sensor-card` | A sensor with its 24 h curve, trend, min, max and average, or up to three sensors on one chart. | `subtitle`, `variant` (`chart`, `tile`), `hours`, `show_stats`, `label`, `entities` (a list: `entity`, `name`, `icon`, `color`) | — |
| **Readouts** | `custom:fluvy-readouts-card` | Up to four values side by side with their trends. | `hours`, `variant` (`grid`, `row`), `empty_text`, `hide_empty`, `rows` (a list: `entity`, `name`, `tap_action`) | `entities` → `rows` |
| **People** | `custom:fluvy-people-card` | Who is home: avatars, zones, times and phone batteries, each person with a tap of their own. | `title`, `variant` (`grid`, `rows`), `map_path`, `show_zone`, `show_time`, `show_battery`, `empty_text`, `hide_empty`, `people` (a list: `entity`, `name`, `battery`, `color`, `tap_action`, `hold_action`) | `layout` → `variant`, `entities` → `people` |
| **Openings** | `custom:fluvy-openings-card` | Doors, windows and motion at a glance, with what is open counted. | `title`, `subtitle`, `variant` (`rows`, `compact`, `tiles`), `max_rows`, `show_count`, `show_time`, `empty_text`, `hide_empty`, `rows` (a list: `entity`, `name`, `icon`, `color`, `tap_action`, `hold_action`) | `entities` → `rows` |
| **Alerts** | `custom:fluvy-alerts-card` | What needs a look — low batteries, devices gone, doors left open, leaks, updates, repairs — each from one line, as tiles, chips, rows or a banner, hidden while all is clear. | `title`, `subtitle`, `variant` (`tiles`, `mini`, `chips`, `rows`, `banner`), `columns` (`1`, `2`, `3`, `4`, `auto`), `show_count`, `show_culprit`, `show_duration`, `compact`, `order` (`severity`, `config`), `rotate`, `snooze` (`user`, `device`, `house`, `off`), `max_alerts`, `empty_text`, `hide_empty`, `alerts` (a list: `preset`, `name`, `icon`, `severity`, `tone`, `color`, `entity`, `domain`, `device_class`, `entity_id`, `integration`, `state`, `not_state`, `above`, `below`, `attribute`, `phones`, `acknowledged`, `area`, `floor`, `label`, `device`, `exclude`, `for`, `unchanged_for`, `include_unavailable`, `hidden`, `diagnostic`, `count_by`, `min_count`, `name_by`, `sort_rows`, `split`, `snooze`, `admin_only`, `tap_action`, `hold_action`, `row_action`, `row_hold_action`, `row_button`, `actions`, `conditions`, `escalate`, `match`, `id`) | — |

## Rooms and the map

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Room** | `custom:fluvy-room-card` | A room of the house from its area: its picture, its climate, what is on, and its controls. | `area`, `variant` (`photo`, `tile`, `row`), `controls` (`rows`, `tiles`, `none`), `show_climate`, `show_count`, `picture`, `path`, `temperature_entity`, `humidity_entity`, `size` (`large`, `compact`, `mini`), `readouts`, `tint` (`on`, `always`), `light_colors`, `tiles` (a list: `entity`, `name`, `icon`, `tone`, `color`, `readouts`, `tap_action`, `hold_action`) | — |
| **Map** | `custom:fluvy-map-card` | Where everyone is: the house’s zones as columns of faces, a row a person, or Home Assistant’s map on a plate. | `title`, `variant` (`zones`, `map`, `rows`), `map_shape` (`wide`, `square`), `hours_to_show`, `default_zoom`, `fit_zones`, `show_empty`, `show_distance`, `map_path`, `empty_text`, `hide_empty`, `zones` (a list: `entity`, `name`, `icon`) | — |

## Structure and navigation

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Hello** | `custom:fluvy-hello-card` | The greeting: name, date, weather and avatar. | `person`, `weather`, `show_weather`, `show_date`, `show_avatar` | — |
| **Chips** | `custom:fluvy-chips-card` | A row of chips that navigate between views or open entities. | `tint` (`on`, `always`), `empty_text`, `hide_empty`, `chips` (a list: `name`, `icon`, `path`, `entity`, `color`, `action`) | `label` → `name` |
| **Heading** | `custom:fluvy-heading-card` | A section title with its count and a link. | `title`, `heading_style` (`title`, `subtitle`), `variant` (`bar`, `plain`), `subtitle`, `path` | `meta` → `subtitle` |

## Scenes, actions and helpers

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Scene** | `custom:fluvy-scene-card` | One scene, script or button as a tile with a done state. | `subtitle`, `show_subtitle` | `meta` → `subtitle` |
| **Scenes** | `custom:fluvy-scenes-card` | A grid of scenes and scripts. | `title`, `columns` (`auto`, `1`, `2`), `tint` (`on`, `always`), `empty_text`, `hide_empty`, `scenes` (a list: `entity`, `name`, `icon`, `subtitle`, `color`, `tap_action`) | `entities` → `scenes` |
| **Actions** | `custom:fluvy-actions-card` | Buttons and scripts as a list with run buttons. | `title`, `subtitle`, `columns`, `empty_text`, `hide_empty`, `rows` (a list: `entity`, `name`, `icon`, `secondary`) | `entities` → `rows` |
| **Helpers** | `custom:fluvy-helpers-card` | Numbers, selects, texts, booleans and dates as their own controls. | `title`, `subtitle`, `options_style` (`full`, `chips`), `empty_text`, `hide_empty`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `presets`) | `entities` → `rows` |
| **To-do** | `custom:fluvy-todo-card` | A to-do list: check, add, hide the done. | `subtitle`, `show_completed`, `show_add`, `show_due` | `title` → `name`, `hide_completed` → `show_completed` |
| **Timer** | `custom:fluvy-timer-card` | A timer counting down live, with pause and cancel. | `show_gauge`, `show_actions` | — |
| **Updates** | `custom:fluvy-updates-card` | Pending updates with install buttons and progress. | `title`, `subtitle`, `show_up_to_date`, `toggle`, `toggle_secondary`, `empty_text`, `hide_empty` | — |
| **Automations** | `custom:fluvy-automations-card` | Every automation of the house: on or off, run, last and next run; schedules written as native automations, created and edited in a sheet. | `title`, `subtitle`, `variant` (`rows`, `compact`, `tiles`), `show` (`all`, `schedules`), `sort` (`name`, `next`, `last`), `show_add`, `show_switch`, `show_last`, `show_next`, `show_filters`, `max_rows`, `area`, `workday`, `time_step`, `domains` (`light`, `switch`, `input_boolean`, `fan`, `cover`, `climate`, `scene`, `script`, `valve`, `media_player`), `targets` (a list: `entity`, `name`, `icon`, `verb`, `level`, `temperature`) | — |

## Energy

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Energy** | `custom:fluvy-energy-card` | Power right now, the day curve and the energy legend. | `subtitle`, `hours`, `variant` (`full`, `compact`, `sources`, `overview`), `show_soc`, `show_house`, `show_axis`, `show_grid`, `line_width` (`regular`, `thin`), `stack`, `cost_entity`, `show_cost`, `legend` (a list: `entity`, `name`) | `title` → `name` |
| **Energy flow** | `custom:fluvy-energy-flow-card` | Where the house’s energy comes from and where it goes, live or over a period: import and export at once, every source, lanes in their origin’s colour. | `title`, `subtitle`, `home`, `variant` (`rows`, `cross`, `list`), `flow_style` (`stream`, `legs`, `rail`), `motion` (`full`, `calm`, `off`), `max_power`, `badge` (`solar`, `self_powered`, `grid`, `none`), `period` (`live`, `day`, `week`, `month`), `show_period`, `sources` (a list: `type`, `power`, `phases`, `import`, `export`, `invert`, `level`, `capacity`, `name`, `icon`, `color`, `threshold`, `arrows`, `show`), `consumers` (a list: `entity`, `name`, `icon`, `color`), `readouts` (a list: `entity`, `name`) | `home_power` → `home`, `solar_power` (folded in), `grid_power` (folded in), `grid_invert` (folded in), `battery_power` (folded in), `battery_invert` (folded in), `battery_level` (folded in) |
| **Energy balance** | `custom:fluvy-energy-balance-card` | What comes in against what goes out, live or over a period: the house is the remainder, so the totals agree; each phase of the grid, and the money. | `title`, `subtitle`, `period` (`live`, `day`, `week`, `month`), `show_period`, `show_phases`, `show_cost`, `sources` (a list: `type`, `power`, `phases`, `import`, `export`, `invert`, `name`, `color`, `threshold`) | — |
| **Grid** | `custom:fluvy-grid-card` | The grid right now: the net import or export, in and out at once, each phase with its voltage, the price and today’s totals. | `title`, `subtitle`, `power`, `phases`, `import`, `export`, `invert`, `voltages`, `price`, `readouts` (a list: `entity`, `name`) | `power` → `phases` |
| **Batteries** | `custom:fluvy-batteries-card` | The house’s batteries as one: their state of charge, full or empty in, the reserve on the ruler, a row per battery and their mode. | `title`, `subtitle`, `reserve`, `mode`, `batteries` (a list: `power`, `phases`, `import`, `export`, `invert`, `level`, `capacity`, `name`, `icon`, `color`) | — |
| **Car charger** | `custom:fluvy-ev-charger-card` | The car on its charger: its charge against the target, ready by when, what the session added and how much of it came from the sun, the charging mode. | `invert`, `level`, `target`, `ready_by`, `status`, `session_energy`, `solar_share`, `vehicle`, `mode` | — |
| **Where it went** | `custom:fluvy-energy-sankey-card` | A day, week or month of energy from where to where, in true proportions: the grid, the battery and the sun into the house, the charge and the export, and the house into its devices. | `title`, `subtitle`, `period` (`day`, `week`, `month`), `show_period`, `max_devices`, `devices` (a list: `entity`, `name`, `parent`) | — |
| **Energy score** | `custom:fluvy-energy-score-card` | Self-powered, sun used and low-carbon as rings, the Energy dashboard’s own gauges, over imported, exported and net. | `title`, `subtitle`, `period` (`day`, `week`, `month`), `show_period`, `co2` | — |
| **Energy devices** | `custom:fluvy-energy-devices-card` | Where the energy goes, device by device on one scale: nested circuits, and what no meter measures. | `title`, `subtitle`, `total`, `sort`, `max_rows`, `rows` (a list: `entity`, `name`, `icon`, `parent`, `cost_entity`, `tone`, `color`, `tap_action`) | `entities` → `rows` |
| **Water & gas** | `custom:fluvy-meters-card` | Today’s water and gas against a typical day, what flows right now, and a leak sensor or a valve beside them. | `title`, `subtitle`, `variant` (`full`, `rows`), `meters` (a list: `entity`, `rate`, `typical`, `name`, `icon`, `kind`), `rows` (a list: `entity`, `name`, `icon`) | — |
| **Gauge** | `custom:fluvy-gauge-card` | A ring gauge for any numeric sensor with min, max and average, or centred on zero for a meter that runs both ways. | `subtitle`, `variant` (`ring`, `bar`, `signed`), `min`, `max`, `max_entity`, `label`, `badge`, `hours` | — |
| **Stat tiles** | `custom:fluvy-stat-tiles-card` | A headline value and a grid of read-only stat tiles. | `title`, `subtitle`, `variant` (`full`, `compact`), `columns` (`auto`, `2`, `3`), `badge_entity`, `badge_label`, `empty_text`, `hide_empty`, `tiles` (a list: `entity`, `name`, `icon`, `tone`, `highlight`), `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | `entities` → `tiles` |
| **Production** | `custom:fluvy-production-card` | Hourly production bars with the forecast behind, stacked per array when there are several. | `subtitle`, `forecast_entity`, `peak_entity`, `show_forecast`, `show_peak`, `variant` (`full`, `compact`), `arrays` (a list: `entity`, `name`) | `title` → `name` |
| **History bars** | `custom:fluvy-history-bars-card` | A sensor’s last days, weeks or months as bars from its long-term statistics: the total and the average in the head, the value over each bar, and a strip of facts under them — the highest and lowest, or what it comes to in CO₂, trees, kilometres or money. | `subtitle`, `variant` (`full`, `compact`, `mini`), `days`, `period` (`day`, `week`, `month`), `stat` (`change`, `state`, `mean`, `max`, `min`), `reset` (`auto`, `never`, `day`, `week`, `month`, `year`), `source` (`auto`, `history`), `date_format` (`date`, `weekday`, `short`), `decimals`, `unit`, `negative_color`, `current_color`, `include_today`, `show_head`, `show_values`, `show_axis`, `show_grid`, `show_dates`, `show_facts`, `co2_factor`, `price`, `head` (a list: `kind`, `name`, `unit`, `decimals`, `factor`, `of`, `template`, `tap_action`), `facts` (a list: `kind`, `name`, `icon`, `color`, `unit`, `decimals`, `factor`, `of`, `template`, `tap_action`) | `title` → `name` |
| **Bars** | `custom:fluvy-bars-card` | Rows with a bar each: plants, batteries, strings, levels. | `title`, `subtitle`, `variant` (`full`, `compact`), `badge_ok`, `badge_warn`, `empty_text`, `hide_empty`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `sub_entity`, `tone`, `color`, `min`, `max`, `low`, `high`, `plain`, `tap_action`) | `entities` → `rows` |
| **Distribution** | `custom:fluvy-distribution-card` | One stacked bar and a legend: who draws what. | `title`, `subtitle`, `max_rows`, `variant` (`stack`, `rows`), `total`, `empty_text`, `hide_empty`, `entities` (a list: `entity`, `name`, `tone`, `color`) | — |
| **Humidity** | `custom:fluvy-humidity-card` | Humidity on a comfort band, with dew point and trend. | `subtitle`, `low`, `high`, `temperature_entity`, `humidifier_entity`, `hours`, `show_trend` | `trend_hours` → `hours` |

## Time

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Clock** | `custom:fluvy-clock-card` | Analog or digital, hero, side or tile, with or without weather. | `face` (`analog`, `digital`), `variant` (`hero`, `side`, `tile`), `numerals` (`none`, `quarters`, `all`), `title`, `show_seconds`, `hour12`, `show_date`, `show_week`, `weather`, `show_forecast`, `time_zone` | `variant` → `face`, `seconds` → `show_seconds`, `date` → `show_date`, `week` → `show_week`, `forecast` → `show_forecast` |
| **Calendar** | `custom:fluvy-calendar-card` | Agenda, month, week, month + day, timeline, upcoming or tile. | `variant` (`agenda`, `month`, `week`, `month-day`, `timeline`, `upcoming`, `tile`), `title`, `tile` (`date`, `next`), `first_weekday` (`language`, `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`), `days`, `start_hour`, `end_hour`, `calendars` (a list: `entity`, `name`, `tone`, `color`) | `entities` → `calendars` |

<!-- /generated:cards -->

## A minimal card

```yaml
type: custom:fluvy-tile-card
entity: light.living_room_lamp
```

Open the editor on it to see every option the tile offers — size, readouts, the tap action — with its default.

## Where they are used

The [automatic dashboard](automatic-dashboard.md) puts every one of these cards to use in a house that has one of
everything; its tests hold that promise. The [design language](../design/language.md) is what each card is built and
reviewed against.
