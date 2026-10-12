# The cards

Fifty-two cards, listed as **Fluvy · …** in the card picker, each with a live preview and an editor form. The form is
the reference for a card's options: it shows what the card does by default, and a default you leave as it is is never
written into the configuration. In YAML, a card is `type: custom:<tag>` plus the entity or entities it draws and any
option the editor offers; the *Options* column below names them (a select's values in brackets, a list with its item
keys), and *Reads* the older names a card still accepts (read, never written back). Every entity card also takes
`entity`, `name`, `icon`, `tap_action`, `hold_action`, `tone`, `color` and `card_color` (a quiet wash of a colour as
the card's own surface, its edge and dividers in it — see [the theme guide](theme.md#a-colour-per-card-and-per-item));
a list card takes `title`. The tables are generated from the code (`pnpm docs:cards`).

Every card holds from 300 to 520 px wide, in light and dark, in every language Fluvy speaks; `unavailable`, `unknown` and a
missing entity are drawn on purpose (a quiet surface, inert controls, a dash for the value), never as an error. Names
may be shortened with an ellipsis; values never are. A card that takes an action changes on screen first and calls
the service after; sliders and dials send on release, not per frame.

`tap_action` and `hold_action` are Home Assistant's actions: `more-info` (the default), `toggle`, `navigate`, `url`,
`perform-action` (and `call-service`, as it was written before Home Assistant 2024.8), `assist`, `fire-dom-event`
and `none`. The icon circle answers the tap and a still press on the head the hold; a tile answers both on its whole
surface. An action with a `confirmation` is asked about first, by Home Assistant's own dialog, and nothing on the
card moves before the answer.

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

<!-- generated:cards -->

## Everyday

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Tile** | `custom:fluvy-tile-card` | A light, switch, cover, fan or sensor as a tile: large with a precision ruler or two readouts, compact row, or mini. | `size` (`large`, `compact`, `mini`), `tint` (`on`, `always`), `readouts` | — |
| **Tiles** | `custom:fluvy-tiles-card` | A group of compact or mini tiles, two to four per row, 8 px apart. | `size` (`compact`, `mini`, `large`), `columns` (`1`, `2`, `3`, `4`, `auto`), `tint` (`on`, `always`), `readouts`, `tiles` (a list: `entity`, `name`, `icon`, `tone`, `color`, `readouts`, `tap_action`, `hold_action`) | `entities` → `tiles` |
| **Light** | `custom:fluvy-light-card` | The precision dimmer: relative drag, slide away to slow down, hold for the 1 % scale, colour temperature. | `variant` (`auto`, `full`, `compact`), `show_temperature`, `show_color`, `temperature_tint`, `live_update`, `colors` (a list: `color`, `name`, `rgb`) | — |
| **Room lights** | `custom:fluvy-lights-card` | A room’s lights on one card: one tap for the whole room, a round, chip or tile for each light, in its colour. | `area`, `variant` (`row`, `chips`, `tiles`), `show_brightness`, `show_count`, `show_level`, `light_colors`, `tint` (`on`, `always`), `lights` (a list: `entity`, `name`, `icon`, `color`) | `entities` → `lights` |
| **Thermostat** | `custom:fluvy-thermostat-card` | Climate, water heater or humidifier on a dial, with modes, presets and fan speeds. | `variant` (`dial`, `compact`, `ruler`), `modes_style` (`tiles`, `chips`, `full`), `modes` (`off`, `heat`, `cool`, `heat_cool`, `auto`, `dry`, `fan_only`), `show_presets`, `preset_style` (`full`, `chips`), `show_fan`, `fan_style` (`full`, `chips`), `when_off` (`all`, `essentials`) | — |
| **Entities** | `custom:fluvy-entities-card` | Rows of entities: a switch for what toggles, the value for what is measured. | `title`, `subtitle`, `variant` (`rows`, `compact`), `show_count`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | `entities` → `rows` |
| **Media** | `custom:fluvy-media-card` | A media player: artwork, seek bar, transport and volume — full, compact row or hero. | `variant` (`full`, `mini`, `hero`), `source_style` (`full`, `chips`), `show_source`, `show_volume`, `show_power`, `controls` (`power`, `previous`, `play`, `next`, `volume`) | — |
| **Now playing** | `custom:fluvy-now-playing-card` | The compact player of the home screen: artwork, thin progress, transport and volume. | `show_volume`, `show_power`, `controls` (`power`, `previous`, `play`, `next`, `volume`) | — |
| **Cover** | `custom:fluvy-cover-card` | Blinds, shutters, garage doors and valves: vertical position ruler, tilt, open · stop · close, favourites. | `subtitle`, `tilt_angle`, `variant` (`full`, `compact`), `favorites_style` (`full`, `chips`), `show_tilt`, `show_favorites`, `favorites` (a list: `name`, `position`, `tilt`) | — |
| **Fan** | `custom:fluvy-fan-card` | Speed ruler with steps, oscillation, direction and presets. | `subtitle`, `variant` (`full`, `compact`), `show_presets`, `preset_style` (`full`, `chips`), `show_oscillation`, `show_direction`, `when_off` (`all`, `essentials`) | — |
| **Vacuum** | `custom:fluvy-vacuum-card` | Robot vacuum or mower: battery, start · stop · dock · locate, suction. | `subtitle`, `variant` (`full`, `compact`), `show_battery`, `battery_entity`, `area_entity`, `duration_entity`, `remaining_entity`, `suction_style` (`full`, `chips`) | — |
| **Lock** | `custom:fluvy-lock-card` | Slide to unlock, never one accidental tap; codes, jammed state, related rows. | `subtitle`, `variant` (`full`, `compact`), `show_rows`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | — |
| **Alarm** | `custom:fluvy-alarm-card` | Arm modes as tiles and the keypad sheet for codes. | `subtitle`, `variant` (`tiles`, `compact`), `modes` (`disarm`, `arm_home`, `arm_away`, `arm_night`, `arm_vacation`, `arm_custom_bypass`), `show_rows`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | — |
| **Camera** | `custom:fluvy-camera-card` | A still that refreshes itself, or Home Assistant’s live stream, in the shape you choose; tap for the stream. | `subtitle`, `camera_view` (`auto`, `live`), `refresh`, `aspect_ratio` (`16:9`, `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, `native`), `fit_mode` (`cover`, `contain`), `show_rows`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | `sub` → `subtitle` |
| **3D printer** | `custom:fluvy-printer-card` | A 3D printer’s job: progress, time left, heaters, layers, filament and the camera; pause, resume and stop. OctoPrint, PrusaLink, Bambu Lab, Moonraker, Creality, Elegoo, Anycubic, Snapmaker and FlashForge. | `device`, `variant` (`full`, `compact`, `row`), `readouts` (`nozzle`, `bed`, `chamber`, `layer`, `speed`, `filament`, `elapsed`), `show_image`, `image` (`auto`, `camera`, `preview`), `camera_view` (`auto`, `live`), `fit_mode` (`cover`, `contain`), `aspect_ratio` (`16:9`, `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, `native`), `show_filament`, `show_controls`, `sensors` (a list: `entity`, `name`), `roles` (a list: `role`, `entity`) | — |
| **Weather** | `custom:fluvy-weather-card` | Condition, temperature, feels-like, wind and the daily or hourly forecast. | `variant` (`full`, `compact`), `forecast` (`daily`, `hourly`, `both`), `days`, `show_forecast` | `forecast` → `show_forecast` |
| **Sensor** | `custom:fluvy-sensor-card` | A sensor with its 24 h curve, trend, min, max and average, or up to three sensors on one chart. | `subtitle`, `variant` (`chart`, `tile`), `hours`, `show_stats`, `label`, `entities` (a list: `entity`, `name`, `icon`, `color`) | — |
| **Readouts** | `custom:fluvy-readouts-card` | Up to four values side by side with their trends. | `hours`, `variant` (`grid`, `row`), `rows` (a list: `entity`, `name`, `tap_action`) | `entities` → `rows` |
| **People** | `custom:fluvy-people-card` | Who is home: avatars, zones, times and phone batteries, each person with a tap of their own. | `title`, `variant` (`grid`, `rows`), `map_path`, `show_zone`, `show_time`, `show_battery`, `people` (a list: `entity`, `name`, `battery`, `color`, `tap_action`, `hold_action`) | `layout` → `variant`, `entities` → `people` |
| **Openings** | `custom:fluvy-openings-card` | Doors, windows and motion at a glance, with what is open counted. | `title`, `subtitle`, `variant` (`rows`, `compact`, `tiles`), `max_rows`, `show_count`, `show_time`, `rows` (a list: `entity`, `name`, `icon`, `color`, `tap_action`, `hold_action`) | `entities` → `rows` |

## Rooms and the map

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Room** | `custom:fluvy-room-card` | A room of the house from its area: its picture, its climate, what is on, and its controls. | `area`, `variant` (`photo`, `tile`, `row`), `controls` (`rows`, `tiles`, `none`), `show_climate`, `show_count`, `picture`, `path`, `temperature_entity`, `humidity_entity`, `size` (`large`, `compact`, `mini`), `readouts`, `tint` (`on`, `always`), `tiles` (a list: `entity`, `name`, `icon`, `tone`, `color`, `readouts`, `tap_action`, `hold_action`) | — |
| **Map** | `custom:fluvy-map-card` | Where everyone is: the house’s zones as columns of faces, a row a person, or Home Assistant’s map on a plate. | `title`, `variant` (`zones`, `map`, `rows`), `map_shape` (`wide`, `square`), `hours_to_show`, `default_zoom`, `fit_zones`, `show_empty`, `show_distance`, `map_path`, `zones` (a list: `entity`, `name`, `icon`) | — |

## Structure and navigation

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Hello** | `custom:fluvy-hello-card` | The greeting: name, date, weather and avatar. | `person`, `weather`, `show_weather`, `show_date`, `show_avatar` | — |
| **Chips** | `custom:fluvy-chips-card` | A row of chips that navigate between views or open entities. | `tint` (`on`, `always`), `chips` (a list: `name`, `icon`, `path`, `entity`, `color`, `action`) | `label` → `name` |
| **Heading** | `custom:fluvy-heading-card` | A section title with its count and a link. | `title`, `subtitle`, `variant` (`bar`, `plain`), `path` | `meta` → `subtitle` |

## Scenes, actions and helpers

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Scene** | `custom:fluvy-scene-card` | One scene, script or button as a tile with a done state. | `subtitle`, `show_subtitle` | `meta` → `subtitle` |
| **Scenes** | `custom:fluvy-scenes-card` | A grid of scenes and scripts. | `title`, `columns` (`auto`, `1`, `2`), `tint` (`on`, `always`), `scenes` (a list: `entity`, `name`, `icon`, `subtitle`, `color`, `tap_action`) | `entities` → `scenes` |
| **Actions** | `custom:fluvy-actions-card` | Buttons and scripts as a list with run buttons. | `title`, `subtitle`, `columns`, `rows` (a list: `entity`, `name`, `icon`, `secondary`) | `entities` → `rows` |
| **Helpers** | `custom:fluvy-helpers-card` | Numbers, selects, texts, booleans and dates as their own controls. | `title`, `subtitle`, `options_style` (`full`, `chips`), `rows` (a list: `entity`, `name`, `icon`, `secondary`, `presets`) | `entities` → `rows` |
| **To-do** | `custom:fluvy-todo-card` | A to-do list: check, add, hide the done. | `subtitle`, `show_completed`, `show_add`, `show_due` | `title` → `name`, `hide_completed` → `show_completed` |
| **Timer** | `custom:fluvy-timer-card` | A timer counting down live, with pause and cancel. | `show_gauge`, `show_actions` | — |
| **Updates** | `custom:fluvy-updates-card` | Pending updates with install buttons and progress. | `title`, `subtitle`, `show_up_to_date`, `toggle`, `toggle_secondary` | — |
| **Automations** | `custom:fluvy-automations-card` | Every automation of the house: on or off, run, last and next run; schedules written as native automations, created and edited in a sheet. | `title`, `subtitle`, `variant` (`rows`, `compact`, `tiles`), `show` (`all`, `schedules`), `sort` (`name`, `next`, `last`), `show_add`, `show_switch`, `show_last`, `show_next`, `show_filters`, `max_rows`, `area`, `workday`, `time_step`, `domains` (`light`, `switch`, `input_boolean`, `fan`, `cover`, `climate`, `scene`, `script`, `valve`, `media_player`) | — |

## Energy

| Card | Type | What it is | Options | Reads |
| --- | --- | --- | --- | --- |
| **Energy** | `custom:fluvy-energy-card` | Power right now, the day curve and the energy legend. | `subtitle`, `hours`, `variant` (`full`, `compact`, `sources`, `overview`), `show_soc`, `show_house`, `cost_entity`, `show_cost`, `legend` (a list: `entity`, `name`) | `title` → `name` |
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
| **Stat tiles** | `custom:fluvy-stat-tiles-card` | A headline value and a grid of read-only stat tiles. | `title`, `subtitle`, `variant` (`full`, `compact`), `columns` (`auto`, `2`, `3`), `badge_entity`, `badge_label`, `tiles` (a list: `entity`, `name`, `icon`, `tone`, `highlight`), `rows` (a list: `entity`, `name`, `icon`, `secondary`, `tone`, `color`, `tap_action`) | — |
| **Production** | `custom:fluvy-production-card` | Hourly production bars with the forecast behind, stacked per array when there are several. | `subtitle`, `forecast_entity`, `peak_entity`, `show_forecast`, `show_peak`, `variant` (`full`, `compact`), `arrays` (a list: `entity`, `name`) | `title` → `name` |
| **History bars** | `custom:fluvy-history-bars-card` | A sensor’s last days, weeks or months as bars from its long-term statistics: the total and the average in the head, the value over each bar, and a strip of facts under them — the highest and lowest, or what it comes to in CO₂, trees, kilometres or money. | `subtitle`, `variant` (`full`, `compact`, `mini`), `days`, `period` (`day`, `week`, `month`), `stat` (`change`, `mean`, `max`, `min`), `date_format` (`date`, `weekday`, `short`), `decimals`, `unit`, `include_today`, `show_head`, `show_values`, `show_axis`, `show_grid`, `show_dates`, `show_facts`, `co2_factor`, `price`, `head` (a list: `kind`, `name`, `unit`, `decimals`, `factor`, `of`, `template`, `tap_action`), `facts` (a list: `kind`, `name`, `icon`, `color`, `unit`, `decimals`, `factor`, `of`, `template`, `tap_action`) | `title` → `name` |
| **Bars** | `custom:fluvy-bars-card` | Rows with a bar each: plants, batteries, strings, levels. | `title`, `subtitle`, `variant` (`full`, `compact`), `badge_ok`, `badge_warn`, `rows` (a list: `entity`, `name`, `icon`, `secondary`, `sub_entity`, `tone`, `color`, `min`, `max`, `low`, `high`, `plain`, `tap_action`) | — |
| **Distribution** | `custom:fluvy-distribution-card` | One stacked bar and a legend: who draws what. | `title`, `subtitle`, `max_rows`, `variant` (`stack`, `rows`), `total`, `entities` (a list: `entity`, `name`, `tone`, `color`) | — |
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
