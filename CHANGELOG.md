# Changelog

All notable changes to Fluvy are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.7.0] — 2026-10-12

### Added

- **The sensor card's own readout can be named** (#28): `label` names the card's own sensor under its readout when
  others share the chart, as an entry's `name` does. Left empty, a readout takes its measure's word ("Temperature",
  "Humidity") when no other sensor on the chart measures the same, else its name beyond the title: a room's
  "Office climate temperature" and "Office climate humidity" read "Temperature" and "Humidity" with nothing set. The
  editor says so under both fields.
- **Colour on the light card** (#32): a colour bulb gets a row of quick colours under its ruler — two whites first
  where it has a temperature, then red, orange, green and blue, or the house's own list (`colors`: `warm`, `cool`, a
  Home Assistant colour name, `#rrggbb`, `[r, g, b]`, or `picker`, a round that opens the browser's colour picker and
  holds a colour of your own) — and a hue ruler in the temperature ruler's slot while it glows a colour; a white
  swatch brings the temperature ruler back. The card wears the bulb's colour: its icon, its
  switch and its brightness ruler take it. `show_color` turns it off; a white bulb's card is unchanged.
- **A colour for the whole card** (#34): `card_color` tints a card's own surface — a quiet wash of the colour as its
  fill, its edge and dividers in the colour — on every card that takes a `color`, so cards can be grouped at a
  glance (every light warm, every cover blue). It is independent of `color`, keeps the words at full contrast on every
  palette in light and dark, and never covers a card that is off or unavailable.
- **The essentials while off** (#31): the thermostat's and the fan's `when_off: essentials` keep the head, the value
  and what wakes the device — the mode tiles, or the fan's switch and speed ruler — and hide presets and fan speeds
  (presets, oscillation and direction on the fan) while it is off; they come back the moment a mode or the switch is
  tapped, below it, before Home Assistant answers. The default, `all`, shows everything as before.
- **Nine printer integrations** (#29, #30): the printer card now knows Creality (`ha_creality_ws`, with the CFS's
  trays), Elegoo (its durations in milliseconds, its chamber a box, its filament a colour), Anycubic's local
  integration (with the ACE's slots and the external spool), the Snapmaker U1 and the older Snapmaker line (fixed
  names, "HH:MM:SS" durations, read-only) and FlashForge (its LED, its error code, the job's thumbnail over the IFS's
  pictures) by their own words, beside OctoPrint, PrusaLink, Bambu Lab and Moonraker. The job's file and a failure's
  code are read from the status's own attributes where a printer has no sensor for them (Creality's). Every phase the
  new integrations report folds into the card's — Elegoo's self-tests, homing and levelling as preparing, Creality's
  "off" as offline, "completed" as finished. Elegoo's Canvas slots and FlashForge's IFS are not shown as trays.

### Changed

- **The camera's live stream stays put** (#28): scrolling the card off the screen no longer ends the stream and
  scrolling back no longer starts another; the element is kept for 45 s off screen and a hidden tab is left to Home
  Assistant's own players. A stream that cannot play gives way to the stills and is tried again a minute later, then
  less often. In full screen the stream shows the whole picture and a still is asked at the screen's width.
- **A printer is known by what it has**: a device of an integration the card does not know is a printer when it
  carries a status (or a printing sensor), a nozzle or a bed, and a job's measure together — a washer with a progress
  and a time left is never one — and the card reads its roles by the words the integrations share. The entity known
  most surely to play a role plays it: a "print status" over a "wifi status", the job's thumbnail over a spool's
  picture, whichever the registry lists first. A printer of any integration still works given its `device` and
  `roles`.

### Fixed

- **A sensor's own colour on the chart** (#28): an entry's `color` ("Also on the chart") now paints its readout's key
  and its curve; it used to fall back to the card's accent.
- **The overview's state of charge** (#28): the battery's dashed line now keeps to the positive half of the chart,
  0 % on the kW zero line and 100 % on the tag's line, so a low battery on a day of heavy export or charging no
  longer reads as an outflow.
- **Narrow columns** (the 1.6.1 list): at the widths a phone's zoom makes, an alarm's, a thermostat's and a water
  heater's mode tiles give way to chips rather than cut a word; a tile's foot shows one readout where two labels
  would overlap; the sensor's statistics take fewer columns where a label would not fit; the flow's dead-source line,
  the weather's context and the keypad's line give way in segments; the lock's slide hint hides where it would not
  fit; the camera's off text takes two lines; a scene tile's line is dropped, never cut; a room's head line and a
  map row's word fit their own room; the keypad's keys give way to 56; the energy card's rolling axis keeps its
  middle label only where it stands apart; a long panel tab keeps its words; the meter's note ends in an ellipsis
  rather than leave the card; a fold that hides an alert says so in the warning ink in every layout; a short age is
  read in full; the flow's comets no longer fade along a re-laid-out layer's old lanes; the Spanish camera pill says
  "En directo"; a compact alarm's glyph chips are never under 44 (two rows rather than narrower chips); an option
  tile's value is dropped rather than cut where a word of it would not fit its cell (the thermostat's "Standby" under
  Off, the alarm's and a charger's mode descriptions); the grid card's readouts and the map's zones take fewer
  columns where a label would not fit; a tile's foot keeps its two cells and judges its labels against them.
- A new printer card's first choice could land on a Bambu Lab AMS (a device with trays and no job): it now takes the
  house's first printer.

## [1.6.0] — 2026-10-08

### Added

- **The whole house on one chart** (#26): the energy card's `variant: overview` draws today as Home Assistant's
  "Power sources" graph does — every source's power stacked above the line (the sun's whole production, the battery's
  discharge, a generator, a car, the grid's import), what went into the battery, a car and the grid under it, the
  house's use as a line over them — plus your batteries' charge, dashed on its own 0–100 % scale. The legend gives the
  day's energy at rest and each flow's power under the finger; `show_soc` and `show_house` take the charge or the
  house's line away. [How it reads a house](docs/energy.md).
- **A way back from a subview on the wall** (#26): a wall has no header, so Home Assistant's back arrow went with it.
  *Wall → Back from a subview* chooses a back button (the default: a pill at the top left with a chevron and the
  subview's name, on the line of the exit corner) or Home Assistant's header, in subviews only.
- **The camera, live and in its own shape** (#26): `camera_view: live` plays Home Assistant's own stream (WebRTC, HLS
  or MJPEG, as the camera offers) while the card is on screen, and falls back to stills where there is none;
  `aspect_ratio` (16:9, 4:3, 3:2, 1:1, 2:1, 21:9, or `native`, the camera's own) and `fit_mode` (`cover`, or `contain`
  for the whole picture on the screen's dark, as a 180° camera needs); `refresh` from half a second. Stills are asked
  at the card's width in device pixels: sharp, and no heavier than they need to be.
- **Several sensors on one chart** (#26): the sensor card's *Also on the chart* (`entities`) adds up to two more
  sensors — a readout each above the chart, and a curve each on its own scale in its measure's tone. Scrubbed, every
  readout says that moment and the axis says when.
- **People: an action and a phone battery each** (#25, #26): the people card's `people` take a name, a colour (a
  ring round their picture), and a tap and a hold action per person — `navigate` to a person's own page, for one.
  `show_battery` puts each phone's battery beside its person: a glyph filled to its level and "78 %", glyph and figure
  in the warning tone at 20 % and under, a bolt while it charges; found from the person's phone (its battery sensor,
  or the tracker's own `battery_level`) or named as `battery`.
- **Openings with their own names** (#26): the openings card's `rows` take a name, an icon, a colour (its circle, at
  rest too), a tap and a hold per opening; `variant: compact` lays them out as 48 rows and `variant: tiles` two a row,
  and `show_time` takes the times away.
- **A colour per item, at rest too** (#26): scenes, chips, people and openings take a `color` per item, as tiles do.
  `tint: always` on tiles, tile groups, scenes, chips, rooms and lights shows an item's colour at rest as well, a quiet
  wash with a hairline of it, while on keeps the full fill.
- **A 3D printer card** (#27): `custom:fluvy-printer-card`, given the printer's device, finds the rest itself for
  OctoPrint, PrusaLink, Bambu Lab and Moonraker. The job and its picture (the camera's stills or its live stream, or
  the job's preview), the progress, the time left, when it will be ready and how long it has run; the nozzle, the bed
  and the chamber (both figures while a heater is on its way), the layers, the speed and the filament — a Bambu Lab
  AMS's trays with their colours, the one printing marked; the stage while it prepares and, when a print fails, why.
  Pause or resume, stop (asked first) and the light; any readout opens its entity, and any of the printer's entities
  can be one more (`sensors`). `variant: compact` and `variant: row` (a ring of the progress round the printer); any
  part can be named by hand (`roles`). System buttons and an emergency stop are never shown. The automatic Home
  dashboard adds a compact one for each printer it finds.

### Changed

- The camera, lock and alarm cards load on demand, with the printer: what every dashboard loads first is 9 KB lighter.

### Fixed

- The visual editor showed switches off that the card had on, and choices empty that the card had made (the date and
  forecast of a clock, a cover's tilt, a fan's presets, the greeting's weather, a timer's buttons, a gauge's style, a
  map's layout… on forty cards): every switch and choice now shows what the card does when the config says nothing.
- Words that ran out of their chip or row in some languages at a phone's width: the wall's back button and long press
  (Spanish, Italian), the screen's dark after sunset (German, Dutch), the openings' "all sensors" row (Spanish,
  French, Portuguese), the people card's title (German: a shorter one where the long one does not fit).
- Narrow columns, large sizes and long languages: a card's head gives its badge way before its title, then its circle;
  a list's rows (lock, alarm, camera, openings, people) give their circles to their names together, and a row's age
  takes its short form ("21 d") rather than an ellipsis; the greeting says the language's short hello where even the
  greeting alone would be cut (a phone at 150 %); the update and helper buttons, the weather, calendar, clock, rooms,
  meters and energy cards keep their words whole in all eight languages.
- A house in Fahrenheit: a thermostat whose entity gives no range or step of its own now takes Home Assistant's own in
  Fahrenheit (45–95 °F, a whole degree a step) where it took Celsius' (7–35, by halves), and a water heater's
  110–140 °F.
- **The greeting showed the same person to everyone** (#26): a greeting card without a `person` now greets whoever is
  signed in — their person's name and picture, and their more-info on a tap. The automatic dashboards and a new card
  no longer write a person into the greeting; a card that names one keeps it, so empty its *Person* field to follow
  the signed-in user.

## [1.5.0] — 2026-10-03

### Added

- **Dashboard tabs, your way** (#20): the view tabs in a dashboard's header — Home Assistant's own — take the look as
  the house chooses in *Appearance → Dashboard tabs*: Fluvy's (the dashboard's name, then the views as words, the
  accent under the open one), pills, Home Assistant's own, or hidden; each tab with its view's name, its icon or both
  (a view without an icon gets the one its name says), and the dashboard's name before them in any style.
  A person who keeps their own look keeps their own tabs. The edit mode and subviews keep Home Assistant's header.
- **The corner, your way**: *Appearance → Sidebar and header* puts Home Assistant's logo in the sidebar's head in place
  of the menu icon, takes away the dividers under the sidebar's name and the header, lays the header on the page's
  own colour, and puts the header's actions (add, search, Assist, edit) in one menu — all four, the corner of Fluvy's
  screenshots.
- **Templates in row text** — a row's `secondary` may be a Home Assistant template
  (`{{ states('sensor.humidity') }} %`), rendered by Home Assistant and kept live, on every card that lists rows:
  entities, lock, alarm, camera, bars, stat tiles, actions and helpers. The row's entity is `entity` in the template
  and the person looking `user`; a template that fails renders nothing, never its own text. The editor's field takes
  a keyword or a template alike (#21).
- **Compact variants** for the cards that ran long (#21): the bars card's `variant: compact` draws 48 px rows — the
  name and the value on one line, the 4 px bar under them; the weather card's `variant: compact` is one head row
  (the condition circle, the name, "condition · high / low" and the temperature) over the hours and the days ahead
  as columns, as many as the width holds (`days` stays the maximum); the stat tiles card's `variant: compact` draws
  64 px tiles of label over value, three a row when every label and value fits (`columns: auto | 2 | 3`, which the
  full tiles take too), and 48 px rows.
- **A size per device** — a tablet on the wall reads its dashboards at 90, 100, 110, 125 or 150 %, remembered by
  that browser alone: `?zoom=125` on the address (`?zoom=off` back), or *This device · Size* in the panel's
  Preferences tab and the Wall tab's device card. Only the dashboard's view grows; Home Assistant's header, sidebar,
  dialogs and the edit mode keep their size, and the size is set before the page paints. Every drag, scrub and
  measure of the cards reads the pointer in the control's own pixels, so a ruler, a lock's grip, a dial, a chart
  or a tab row behaves the same at any size (#21).
- **Power on the media cards** (#21): the media card turns a player on and off from a round in its head (in place
  of "…", which the artwork's tap still opens), a hero from its corner, and the now-playing strip from its left edge
  (`show_power`, on where the player can be switched); a player that is off offers "Turn on" and no dead transport.
  The compact row and the strip take `controls`: power, previous, play, next and volume, in the order written, as
  many as the width holds.

### Changed

- The settings panel has five tabs, on one line: *About* is now the last card of *Preferences* (*Fluvy*: the
  version, the look in use, the settings file, the house's reset). An old `/fluvy/about` link opens Preferences.
- On the dashboards that wear the look, the header's tabs are Fluvy's by default: the views as words instead of
  Home Assistant's icons. *Appearance → Dashboard tabs → Original* gives Home Assistant's tabs back.
- The automatic dashboards no longer repeat their views as chips under the greeting, now that the header's tabs carry
  their names; `greeting_tabs: show` (or the dashboard's options in the panel) puts them back.

### Fixed

- An automatic dashboard whose grid meter is found by its name (no power sensors in the Energy dashboard, no export
  sensor) drew its grid gauge with no entity: the card was handed `true` and failed to render. It names the meter.
- The energy card's `sources` variant (the house's power by source) is drawn from the power sensors the Energy
  dashboard names, as Home Assistant's own "Power sources" graph is: energy meters that tick in coarse steps, or a
  hybrid inverter's AC meter counted as the sun, no longer flatten the midday or put the sun in the night (#23). What
  went into the battery is drawn under the line with the export; "right now" is the house's own use; a gap in the
  recorder is a gap. Without power sensors the meters are read in blocks long enough for their step not to show.
- The bars card counted a `plain` row as 76 px in its height; it is 60. The stat tiles card's height left out the
  gaps above its tiles and its rows, so an automatic dashboard cut its columns 32 px short.
- A bars, stat tiles or weather row squeezed under what holds its name (half a column) cut the name to a letter; the
  rows now give their circles to the names, as a head does. A compact row of an entity that cannot be read said only
  "—"; it says "Unavailable", "Unknown" or "Not found". A missing entity drew a sensor's trend glyph; it draws the
  `ban` glyph. A dead stat tile was an ordinary tile; it wears the dashed hairline, in both variants.

## [1.4.0] — 2026-10-01

### Added

- **The energy flow, rebuilt** on one energy model shared by every energy card. A source is read the way its meter
  is: one signed sensor, two sensors (what comes in and what goes out), or one per phase summed per sign — so a
  house that imports on two phases and exports on the third shows both flows, and the sun's share of the house is
  right again (#19). With no sources given, the card reads the Energy dashboard's own: every grid connection, array
  and battery, two power sensors kept as two. Several arrays and batteries, a generator and a car that powers the
  house are sources too; `consumers` show where the energy goes. Variants `rows`, `cross` and `list`; styles
  `stream`, `legs` and `rail`; `motion: full | calm | off`; the badge says the sun's share, the self-sufficiency or
  the grid's way; each source takes its name, icon, colour, threshold, arrows and when to show. A day, a week or a
  month from the statistics, allocated hour by hour the way the Energy dashboard does, so the figures match.
- Every lane in the colour of where its energy came from, a solid arrowhead whose tip ends the lane, and pulses of
  light at a steady 24–72 px/s (eight a card at most, paused off screen and in a hidden tab).
- New energy cards: **Energy balance**, **Grid** (each phase, the price), **Batteries**, **Car charger**,
  **Where it went** (a sankey of the period), **Energy score**, **Water & gas**.
- The energy card's `sources` variant (the house's power today by where it came from), nested energy devices with
  what is not measured, Distribution's `total` (the whole's own meter: what no source accounts for), production by
  array, and a signed gauge for a meter that can go negative.
- [docs/energy.md](docs/energy.md): how the energy cards read a house, and every case.
- **Room lights** (`fluvy-lights-card`): a room's lights on one card. A tap on the card turns the whole room on or off;
  each light is a round beside the room's name (`row`), a chip with its name (`chips`) or a compact tile (`tiles`)
  that a tap turns and a hold opens. A light that is on wears its bulb's colour and its round a ring of its level;
  the lights come from an `area` or a list, each with its own name, icon and colour; `show_brightness` adds one
  ruler for the room. The automatic dashboard's Lights view starts each room of two lights or more with it.

### Changed

- The automatic dashboards read the whole Energy dashboard (every connection, the battery's charge, water and gas)
  and give the Energy template a *Today* view (a day's flow, where it went, the score) and a *Water & gas* view.
- The energy family loads as its own file, fetched as Fluvy starts: every page stays under its budget.
- 1.3's flow keys (`solar_power`, `grid_power`, `grid_invert`, `battery_*`, `home_power`, `flow_style: ribbons`) are
  still read, and never written.
- In the flow card's editor a source shows only the fields its kind is read by (a grid has no state of charge).
- A figure in kW (or kWh, MW…) from 1 to 100 keeps its decimal: "1.0 kW" beside "2.2 kW".

### Fixed

- The automatic dashboard could take an export meter for the grid's own; export meters are now the grid's second
  sensor.
- Production counted "today" on the browser's clock; it counts on the house's.
- An unavailable icon circle was filled in a solid palette (Volt, Mint); it is the dashed ring alone, as in the others.
- A tile gave nothing under the finger (its entrance held the press back); it shrinks and eases again, as designed.
- The room card's inner tiles were 76 tall; they are 84, as designed.
- In a narrow column the light and fan cards' heads kept room for a 48 px switch that is 56: the second line now
  gives way before it is cut.

## [1.3.3] — 2026-09-30

### Added

- `fire-dom-event` as a card action, as Home Assistant's own cards take it: the whole action leaves the card as
  `ll-custom`, so browser_mod's popups (with `browser_id: THIS`) and other frontend integrations answer a
  Fluvy card's tap and hold.
- `assist` as a card action (it opens Home Assistant's Assist), and `navigation_replace` on a `navigate`.

### Fixed

- An action with a `confirmation` ran without asking. Home Assistant's own dialog now asks first, with its words
  and its exemptions, and a tile no longer flips before the answer.
- `call-service`, as `perform-action` was written before Home Assistant 2024.8 (with `service` and
  `service_data`), did nothing.

## [1.3.2] — 2026-09-30

### Added

- A visible way out of wall mode: a small × in the top-right corner, there when the wall comes and whenever
  someone touches the screen, gone when it rests. A tap takes the device out of the wall, and a notice offers the
  way back for a few seconds. The house chooses in the *Wall* tab (*Way out*) between this button, the default,
  and the hidden long press of before, which pauses the wall instead.

## [1.3.1] — 2026-09-29

### Fixed

- A light card in half a phone's column (two lamps on a line) had no switch: under 200 px its head dropped it and
  left the ruler to turn the lamp on and off. The head is now fitted round the switch, as the fan's is — the sub
  steps aside, then the icon circle, never the switch — and the card keeps its height.

## [1.3.0] — 2026-09-29

### Added

- Five automatic dashboards, each a template and a strategy of its own: **Home** (the dashboard of before, with a
  Rooms view when the house has two rooms with something in them, and a page per room), **Rooms** (a tab a floor,
  a card a room), **Energy** (now, production, devices, meters), **Security** (the alarm, the cameras, the openings
  room by room) and **Wall** (two columns for a tablet, without tabs). The panel's *Dashboards* tab lists them,
  creates any with one tap, edits each one's options apart, lists it in the sidebar or not, and recreates it in two
  taps; the settings file carries every dashboard's options.
- Two cards, forty-one in all: **Room** — an area as the approved area card (its photo under the name pill, its
  temperature, humidity and how many devices are on, its lights, climate, media and devices as rows or as inner
  tiles; as a tile, or as a compact row) — and **Map** — where everyone is, as columns of zones with the faces in
  each (two, then a "+N" disc), as rows, or as Home Assistant's own map on a plate.
- Wall mode for a tablet on the wall: no sidebar, no header, the screen kept awake, a screensaver with the clock (or
  black) after a while that any touch or a motion sensor wakes, day and night by Home Assistant's mode, the sun or
  a pair of hours with a night veil, the wall mesh behind the cards. The house sets it in the panel's *Wall* tab,
  whose preview shows the wall as it would be now (its night included) and which shows the screensaver itself on a
  tap; the tablet becomes a wall with `?kiosk` on the address (or the tab's switch) and remembers; a hold of the
  top-right corner pauses it. Everything of the wall loads only on a device that is one.
- Palettes that travel: a custom palette shared as a file (`<name>.fluvy-palette.json`) with a title and an author,
  read back onto the gallery, saved to the house (twelve, under *Yours*) or removed; the palettes the community has
  contributed ship under *Community* with their authors. A draft that equals one of them is that palette.
- Turkish (`tr`): the eighth language, in every card, page, dialog and editor form, with the words the automatic
  dashboards read a Turkish-named house by.
- Every card under one editors' contract: what to show (`show_*`), which items and in which order (subset lists
  with Fluvy's rows editor), at least one other layout (`variant`), the chip rows filling by default
  (`<x>_style: full | chips`), a `tap_action` and a `hold_action` (a still press on the head) on every entity card,
  a `tone` and a `color` on the card and on each item, `unknown` drawn as a live surface. New variants: compact cover,
  fan, vacuum, lock and alarm (144 tall), a camera tile, a gauge bar, compact energy and production, distribution
  rows, readouts grid, a plain heading, compact entities, the clock's face and layout apart, the calendar's
  calendars as items.
- Colour per card: every card takes a `color` — one of Home Assistant's colour names (`teal`, `deep-orange`…) or
  any `#rrggbb` — that stands in for the palette's accent inside it: its chart, its lit light, its icon circle,
  its dial. The colour is derived on the very palette the card wears, in light and in dark, through the same
  arithmetic that makes the palette (its ink readable on the card, its fill legible under its ink, twelve graph
  series apart), so a red card on Linen is Linen's red. The editor offers Home Assistant's colour picker, whose
  swatches show the palette's colours. Device tones (a fan, a heater, a speaker) keep their own.
- The dropdown: the cards' text field as a button, opening its list in the browser's top layer — over Home
  Assistant's sidebar and dialogs — under the field, or over it near the foot of the page, as wide as the field;
  keys, letters and the pointer as a native select's, a hint beside each name, the chosen row marked. The
  Preferences tab's language is the first to use it (eight chips before): *Automatic* with the language it
  resolves to, then Fluvy's languages by their own names with the English name beside.
- Preferences: a *Help improve this translation* row that opens the translating guide.
- View backgrounds: the wall mesh (`--fluvy-mesh-*`), derived from the palette's own page colour.

### Changed

- The cards' options share one vocabulary: `subtitle` (`sub`, `meta` before), `variant` (`layout`, `view`),
  `hours` (`trend_hours`), `color` (`accent`), `name` on an entity card (`title` before on the to-do, energy and
  production cards), `show_*` for every switch (`hide_completed` before), `calendars` as items on the calendar
  (`entities` + `tones`). Every older name is still read, for good; it is never written back.
- The settings are version 2: the house keeps its shared palettes and its wall. A house that goes back to 1.2 keeps
  them unread; a 1.2 save keeps what it does not know once the house has been saved by 1.3.
- The panel has six tabs — *Dashboards* (it was *Dashboard*) and *Wall* are new.
- The automatic dashboards' strategy, the wall, the community palettes and the cards' visual editor load on demand
  (their own chunks); a dashboard page pays only for the cards. The automatic dashboards cut their columns by every card's declared
  height, measured at a phone's column — the layouts are level where the old table left them uneven.
- The theme's named colours follow the tone Home Assistant gives each: pink is the armed alarm's rose, cyan the
  water, teal the presence green, lime the dehumidifier's green, light green the battery, deep purple the house,
  brown the gas (it was the accent). Every surface Home Assistant paints through them moves with them.
- The theme says which palette it is (`--fluvy-palette`), and so does a look applied live.
- Card editors: the choices of a dropdown (a variant, a forecast, a first weekday…) and the tones are said in the
  dashboard's language; they were English words whatever the language.
- A compact tile inside a card (a room's controls) is an inner tile: 84 tall, the control radius, the page's fill,
  no hairline; off, its icon circle is the card's fill with the text ink. The state line on an on-fill is the fill's
  ink at 80 % (4.5:1 on every palette; the palette gates hold it).
- The docs' card tables are generated from the code (`pnpm docs:cards`), and the release refuses a chunk over its budget.

### Fixed

- Tiles: a mini tile is never narrower than 84 px (a group asked for more columns lays out fewer), so its icon
  circle is always the 44 of every other tile; a small tile's state line is fitted to the tile — "Open · 40 %"
  loses its figure before it is cut, and an unavailable tile shows "—" where the word cannot fit — and a large
  unavailable tile drops its "· 11 days ago" the same way. A compact tile's icon left under 160 px, not under 128:
  the size queries measured the content box.
- Energy flow, gauge, bars and the other chart cards: in a column too narrow for the icon circle and the title,
  the circle goes and the title stays whole (a typed title may end in an ellipsis, as a name does). The energy
  card's curve draws in the card's colour again (its chart lacked a tone carrier).
- The cards' words arriving in a new language refreshed every card twice.
- The dropdown's list, once it scrolls (nine languages), was a tab stop of its own.
- The docs said "five tabs", listed the automatic dashboard's options without `weather` and `language`, and gave
  the Security view a rule it does not follow (it needs an alarm, a lock, a camera or a gate).

## [1.2.1] — 2026-09-28

### Removed

- The swipe between a dashboard's views (1.2.0). Home Assistant draws one view at a time, so the arriving view
  could only appear once it was on the page — a slide out, a gap, a slide in — and rendering the neighbouring
  view ourselves proved neither light nor safe. A gesture that cannot show what is coming is worse than none;
  the tabs stay, and the *Swipe between views* preference goes with it.

## [1.2.0] — 2026-09-27

### Added

- Swipe between a dashboard's views on a phone: the view follows the finger, and letting go past a third of the
  width (or a flick) opens the next tab, which slides in from the finger's side. A drag that begins on a ruler, a
  dial, a slider, a scrolling row of chips or a map is theirs; a drag that leans vertical stays a scroll; the
  screen's edges are left to the system. Each person's to turn off in Preferences → *Swipe between views*.
- German, Dutch, French, Italian and Brazilian Portuguese, for every card, page and the settings panel, chosen in
  Preferences or taken from Home Assistant's language. One catalogue per language, fetched only when spoken; the
  automatic dashboard reads a house named in any of them.

## [1.1.2] — 2026-09-27

### Added

- Tiles card: each tile's readouts are chosen in the editor (a plug's power, its energy today, its cost); a wide
  tile shows three, a narrower one two. A sensor whose device class is monetary is labelled Cost.
- Light card: half a section is enough. Under 260 px of content (or `variant: compact`) the card keeps its head,
  with the level in the state line, and the brightness ruler alone, so two lamps share a line; the layout editor
  lets it go down to six columns (it stopped at nine).

## [1.1.1] — 2026-09-27

### Changed

- The demo opens in the light mode on Blaze, and lays its frames out in lanes filled by height: nothing overlaps,
  nothing is left hanging.

### Fixed

- Settings: the first card sits 16 px under the toolbar on a desktop too (it touched it).

## [1.1.0] — 2026-09-27

### Added

- A public demo at https://acosta290.github.io/fluvy/: the real cards, pages and settings panel on the simulated
  home, with the palette, mode, device and language changed live; deployed by `pages.yml` on every push to `main`.
- Motion clips in the README: the precision dimmer, the energy flow changing pace, a palette applied in the settings
  panel, a scrub across the History charts. `pnpm clips` records them on the playground (`tools/render/clip.mjs`)
  with the gestures the interaction suites prove.
- The settings panel's Dashboard tab lists Fluvy auto in Home Assistant's sidebar, or takes its entry out (an
  administrator's switch).

### Changed

- Activity: the icons sit 4 px clear of the timeline's spine, as the dots already did.
- The interaction suites and the clips share one gestures module (`tools/render/lib/gestures.mjs`).

### Fixed

- The documentation counts fifteen palettes (there was never a Cobalt), lists the automatic dashboard's options as
  the code has them (`dial | compact | ruler`, `ribbons | rail | legs`, eight views) and no longer mentions an
  Activity card that does not exist; CI measures the two devices sheets by their names.

## [1.0.2] — 2026-09-27

### Changed

- The README shows the whole product: the app with the sidebar and tabs, three galleries of cards, the two
  pages, the four tabs of the settings panel.


## [1.0.1] — 2026-09-27

### Changed

- The HACS listing says what Fluvy is: "Fluvy - Premium Theme & Cards", so a search for a theme finds it.
- The README renders inside HACS as well: absolute image URLs, no `<picture>` element.
- The licence badge is static, so it never depends on a cache.

### Removed

- The files prepared for Home Assistant's brands repository, which no longer takes custom integrations; the
  integration serves its own icon.


## [1.0.0] — 2026-09-27

The first public release.

### Added

- The Fluvy theme: one generated theme, light and dark, written from the same tokens the cards use.
- Thirty-nine cards for lights, climate, energy, media, security, calendar, clocks, helpers, people, weather and
  more, each with an editor form and a picker preview.
- The automatic dashboard (`strategy: { type: custom:fluvy-home }`): Home, Lights, Climate, Energy, Media and
  Sensors built from the registries and the energy preferences.
- The settings panel in the sidebar: sixteen palettes in a pastel and an electric line or a custom accent, three
  shapes, where the look applies, per-person preferences, applied live.
- The Activity and History pages, replacing Home Assistant's logbook and history pages while the house wants them.
- The shell: Home Assistant's own pages (Settings, dialogs, forms, the sidebar) in the same design while the
  Fluvy theme is worn.
- The integration (`custom_components/fluvy`): installs through HACS, serves the build, loads it on every page,
  registers the panel and the Lovelace resource, installs the theme, and says through Repairs what only you can do.
- English and Spanish.

[Unreleased]: https://github.com/acosta290/fluvy/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/acosta290/fluvy/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/acosta290/fluvy/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/acosta290/fluvy/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/acosta290/fluvy/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/acosta290/fluvy/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/acosta290/fluvy/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/acosta290/fluvy/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/acosta290/fluvy/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/acosta290/fluvy/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/acosta290/fluvy/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/acosta290/fluvy/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/acosta290/fluvy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/acosta290/fluvy/releases/tag/v1.0.0
