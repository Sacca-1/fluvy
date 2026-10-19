# Changelog

All notable changes to Fluvy are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.9.1-homelab.1] — 2026-10-19

- Homelab fork: native sensor band card with configurable ranges, reference markers and responsive captions.

## [1.9.0] — 2026-10-19

### Fixed

- A room card no longer says "Nothing in this room yet" while the room has a reading: the temperature and humidity
  sensors chosen in the area's settings are read even when they are hidden or diagnostic, the card's own
  `temperature_entity` and `humidity_entity` (and tiles asked for with `controls: tiles`) are always drawn, a sensor
  whose state arrives after the dashboard opened (Home Assistant restarting) shows up without a reload, the working
  sensor is read when another of its kind is unavailable, and a room with only a thermostat shows its temperature (and
  its humidity where the thermostat measures one); an empty room keeps its photo or its head, its chevron, its tap and
  its hold, and an administrator sees why it is empty ("2 hidden or diagnostic entities · choose its sensors in the
  area's settings", three lines at most, the way to the settings leaving first in a narrow column) (#39).
- A room counts what is on once: its "Devices on" readout counts what its "All devices" row counts (a heating thermostat
  is on), so a room with only a thermostat no longer reads "0 of 1" above "1 of 1 on"; and its tile card gives its icon
  to a name that would be cut beside it ("Living room…" at the narrowest width now reads whole) (#39).
- Colours are right on the first frame, on every card: wherever Fluvy's look does not reach a card (a dashboard not
  named `fluvy-*`, and its card editor) the card worked out its colour, its surface and its items' colours on the
  default palette until it was attached again, and in the editor on every edit; every card now wears your palette
  from its first frame, and the editor's preview looks again whenever its dialog takes or leaves the look (#40).
- Blue-grey turned violet, blue or green on Iris, Volt and Mint, and white took a near-black icon on the electric
  palettes (#40).
- A card's tap no longer goes with its icon: the whole head (the icon, the name, the line under it) is the card's
  button on every card, so a lamp in half a phone's section, whose icon gives way to a long name, still opens or
  toggles; the switch and the "…" button in a head keep their own tap, a slider is never a tap, a mouse drag never
  taps, and the keyboard reaches it (Tab, Enter taps, Shift+F10 holds) (#42).
- A large tile holds: a long press on it runs its hold action instead of its tap, and its switch is no longer inside
  a button; a media player's art and words, the now-playing strip, a greeting without its avatar and a room's photo
  and row take the tap and the hold too, and an unavailable large tile keeps its readings (as dashes) and its switch
  (#42).
- History bars: a day counter whose reset comes as two writes (two inverter counters summed by a template) read its
  midnight twice as Home Assistant counts it, every night, in the Energy dashboard too; with `reset: day` the card
  reads it by its readings, and today follows the sensor live (33.3, not 51.2) (#45).
- History bars: a read of the recorder that failed was kept for the rest of the hour as "No statistics yet"; it now
  says it could not read the recorder and asks again a minute later. On their own row the readouts' second cell lost
  32 px to a gap it does not have, so a figure with its unit could spill out of it at 211 px.
- History bars read in the unit a typical bar reads in: a day Home Assistant counted twice (a restart's whole reading
  counted again) reads "18,280.2 kWh" beside its ordinary days in kWh, which no longer read "0.0 MWh"; and a scale never
  runs to five intervals, the next nice step taken instead.
- Water and gas: a meter that read a little less than an hour ago (a dip) was taken for one that had been reset, and
  today jumped by its whole reading; a fall below 90 % is a reset, as Home Assistant counts it, a smaller dip a dip.
- A compact thermostat in half a section no longer puts its − and + over the temperature: the readout stays at its
  size and the buttons sit centred under it, two thermostats side by side draw the same size whatever their values
  (9,5 next to 19,5), nothing moves when you step past 10 or turn the device off, and in a narrower column (a phone at
  150 %) the temperature stands alone and opens the details (#46).
- The thermostat's modes keep the order you gave them: the editor's list is now chips you drag into order, offering
  your thermostat's own modes, and unticking a mode no longer reverses the rest (HomeMatic's "Auto · Aus"); the
  alarm's modes work the same way, and the line under a thermostat's name no longer repeats it when the area has the
  same name (#46).
- At 211 px and in half a section no control leaves its card: the fan's −/+ (42 px out in German), the cover's tilt
  and side column and the timer's buttons go under their reading, the dial's ring takes its size from the column,
  German "Relative Luftfeuchtigkeit" no longer runs onto its figure ("Luftfeuchte" where the long word does not fit),
  and a timer's name stays whole in half a section.
- The alarm's keypad works in the narrowest column (broken since 1.7): there a typed code lit no dot and Disarm stayed
  disabled, because the line under the sheet's title ("Enter your code · 29 s") was shortened in a way that stopped the
  sheet from drawing anything after it; the line now gives way to "Enter your code" before it is drawn.
- An empty list is no longer a configuration error: the bars, entities, tiles, updates, stat tiles, helpers,
  distribution, actions, scenes, openings, chips, map, people, readouts and room lights cards show their head and an
  empty panel in their own words while a filter (auto-entities) matches nothing, and their rows the moment it does,
  on the same card — before, the error stayed even after the filter found something; only a list that is not a list
  is still an error (#48).
- Lists handed over by auto-entities: the bars and stat tiles read its `entities` key, the updates, map and heading
  cards read lists of objects (`{entity: …}`), every card watches the ids of such a list, and section titles and
  dividers among the matches are skipped instead of drawn as missing entities (#48).
- A readout's own `tap_action` runs (it was dropped), and the helpers card at narrow widths no longer lets a switch,
  a time, a date or a long select's value run past its row or get cut to "0.": the rows give their circles to their
  names first.
- A card keeps its size while its device is unavailable, unknown or missing: it draws its live anatomy — its circle,
  its name, its state, its readouts as "—", its controls disabled (a switch faded like the stepper beside it, never
  drawn as a live Off) — instead of a short row or one quiet line, so a grid of cards no longer jumps when a device goes
  offline (a 3D printer's large tile beside three live ones was the case that showed it); only its colours change.
- A thermostat, fan, cover, robot vacuum, lock, alarm, humidity card or timer whose entity is missing (an integration
  still starting after a restart, a renamed entity) no longer shrinks to one line: it draws its whole card with its
  controls greyed out and keeps the modes, presets, speeds and features it had when the page last saw it (one the page
  never saw draws its usual parts: a thermostat the modes you configured, or Off · Heat · Cool; a fan its speed, ruler,
  Oscillate and Direction; a cover its position and Open · Stop · Close; a robot vacuum Start · Stop · Return to dock
  and its battery); out of reach a thermostat's mode tiles no longer show the temperature they last ran at, a humidifier
  is shown neither off nor running, the helpers card keeps a number's slider and a select's options, a robot keeps the
  readings you configured, a lock its Open button and a room of lights its switch, greyed.
- Sensor and energy cards keep their size while their entities are unavailable, unknown or missing: the sensor card
  keeps its curve, axis and statistics (a tile its spark), the gauge its ring, range and row, history bars,
  production and meters their history, the weather its hours and days ahead, batteries the time beside their charge,
  the balance its rows, the score its low-carbon ring, the car charger and the energy card their whole card; a
  sensor that is no longer in the house is read as the recorder kept it, so its bars and its day stay; stat tiles
  never wrap a figure (where half the card would cut "21.5 °C", the tiles go one a row).
- Energy card: a sensor that is not there no longer shrinks the card to one line; it keeps its head, "Right now —",
  the chart's room, the hours and the legend, as an unavailable one does.
- Players, calendars, clocks, to-do lists, cameras, 3D printers, update lists, people, maps, openings and automations
  keep their size while what they show is unavailable, unknown or missing: a player's seek line, rounds and volume
  still; a calendar's grid and its rows as still bars (and at its size from the first frame while it is still
  reading); a printer at the size of a job, its time left, layer and trays no longer moving the card as a job counts
  down; a clock's forecast row as dashes (two and one where German or French labels would overlap); a to-do list's
  declared five rows before its items arrive; the now-playing strip no longer leaves an empty row above its artwork.
- A player's seek line and the now-playing strip's progress stay in place while nothing has a length (idle, off, a
  radio stream): the card no longer grows when a track starts.
- The light card's colour field shows *State* (it follows the light) instead of *Primary*; choosing Primary now gives
  the theme's accent (it showed the lit light), the card's `tone` is honoured (it was ignored), the cool quick colour
  reads as a cool white (it showed as peach cream), a colour bulb's card compact by its width keeps a row of its quick
  colours, a light card that cannot be read keeps its size and controls, on a card with a `card_color` the rounds, the
  − and +, options, chips, inner tiles and resting circles take a deeper step of the card's wash instead of the page's
  colour (on Volt's light palette too), and the room lights card shows the colour a light last glowed the moment you
  switch it on.
- Someone who is not an administrator saw an empty automations list with `show: schedules` and with the Schedules
  chip; their schedules are listed now, with the clock, and an administrator's no longer flash as plain rows before
  their settings load.
- The schedule sheet: an end you have not set follows the start (a sunset start no longer ends at 16:00), "At a
  time" comes back to the time it had, a target that shares no action with those chosen is no longer offered (so
  "Do" is never empty), a name suggested before anything is chosen no longer starts with "·", a long name in an
  empty card's panel breaks inside it, the Workdays and Custom tiles' second line reads as a word, and German says
  "Werktagssensor", Brazilian Portuguese "Reprodutores".
- Escape in a schedule sheet or a keypad inside a Bubble Card popup closes only the sheet, and dragging the sheet no
  longer slides the popup closed.
- The schedule sheet's off switches show their thumb in dark mode: the sheet, the alerts' sheet and the keypad wear
  their card's mode (the "Until" switch was 1.05:1 on its track since 1.8.0).
- "Tap again to delete" and "Tap again to confirm" read under a mouse pointer: an armed button wears the danger's fill
  and its ink on every palette (it was 1.12:1 in dark Linen with the pointer on it).
- A room's name pill in half a section drops its icon before the name runs out of the photo, and the room's and the
  fan's rows give their icons to their words in a narrow column (French "Lumières", "Oscillate" at 211 px).
- A tile's two readings share its foot only where both labels and both figures hold in their halves (German
  "Leistung" and "0.8 kWh" in half a section); a month's name in a narrow calendar takes its short form; a player's
  sources lay out two a row where three would cut a name; a head's circle gives way only where that makes the name
  whole.
- The History page's date picker says From and To (Von and Bis, De and À…) instead of the raw "from" and "to" it
  showed in every language since 1.8.0.
- The settings panel keeps its words inside their buttons and chips on a narrow phone: where the apply bar's two buttons
  do not hold half the bar each, they take the whole width one under the other (French's "Appliquer à la maison" ran
  over "Seulement pour moi" at 360, German's "Für das Haus übernehmen" out of its button at 412), and a row of choices
  goes two and one rather than cut a word (pt-BR's "Quando ligado", Spanish "Al encenderse").
- In a narrow column a label no longer runs onto its figure and a side readout no longer leaves the card: the energy
  card puts its cost under the reading, the production card its forecast and the humidity card its dew point where
  the two cannot stand side by side, and the production card says "So far" where "So far today" would not fit (German
  and French at 211 and 266 px, and half a section).
- The gauge's min · max · average take as many columns as hold them, two and one in half a section, where they stayed
  three and ran into each other (a unit past its figure at 211 px); in every row of statistics the last one, alone on
  its row, is measured against the whole row, so three go two and one before they go one a line.
- Every card's declared height (`layoutHeight`) says what the card draws at a 360 column, so the automatic
  dashboard's columns end level and the sections grid places cards without gaps: the thermostat counts its presets,
  fan speeds and modes, the fan its oscillation and direction rows, the cover its position or its tilt, the vacuum its
  readouts and commands, the lock its latch, the alarm its modes, the media player its sources, the weather its
  forecasts, the clock its forecast row, the light its bulb, the room what its area holds, the helpers their rows by
  kind, the updates what waits, the appliance card what its appliance draws (its kind from its device, a hob's rows of
  plates, a fridge's compartments and steppers, the quick modes, buttons and programmes it has, a second drum's line)
  and the appliances card's whole cards each theirs, and every list, legend and row of readouts what it lays out by
  measure; the automatic dashboard reads the house when it measures.
- History bars' figures are rounded free of float noise: a sum that lands a hair off its half (10.45000000000072,
  11.049999999999265) rounds by the same rule as the figure people read.
- A camera card put back off screen (another view, a scroll away) stayed attached and played on with no countdown to
  take it out; it now waits for the viewport's word. A stream's retry wait only ever grew; a stream that played resets
  it to a minute. A live card whose stream could not play now says "Stream unavailable" instead of showing "Live" over
  its stills.
- A 3D printer's camera stills kept refreshing while the card was off screen.
- At 211 px the clock's hero drew its period past the column (the unit was never dropped), the side clock's time ran
  past its card beside the smallest face, the weather hero's unit ran past the card, the vacuum's "Remaining" readout
  was cut, and the keypad's keys sat 2.5 px past the sheet.
- The calendar, the clocks, the weather and the to-do list say every word and figure whole at 211 and 266 px in every
  language. The week strip takes the narrow weekdays where the short ones would run together ("LUNMARMER"); a month's
  head says "KW 38", "Sem. 38" or "Sett. 38" where "Semana 38" would be cut; the agenda's next day reads "2 événements"
  rather than "2 événe…"; an event's place may end in its ellipsis as a name, and an upcoming event keeps its time whole
  ("Toute la journée"); "Could not load events" wraps at its words; an all-day event's "Journée / entière" no longer
  runs into its tone bar.
- A clock's caption gives its sky the short word ("klar"), then lets it go whole after the date ("klare N…" before), and
  a weather out of reach says "Offline" where its long word would be cut; the side clock says "Aufgang 07:31" where
  "Sonnenaufgang 07:31" would be cut, its face yielding to it, and leaves the line where not even that holds; a date
  without room for its weekday drops it ("18 de set.").
- The weather's day rows keep a rain chance whole ("Schauer · 60 %", never "6…"), and run the condition under the
  figures where the language's longest would not hold beside them; the hero's label takes the hero's width where a word
  would otherwise break inside ("DESCONHECID/O"); the compact head lets its glyph say a condition the line cannot hold
  ("Partiellement nu…" before). The to-do list says "3 left" where "3 of 5 left" would be cut (Turkish "5 maddeden 3
  k…").
- Controls and lists say every word and figure whole at 152, 172, 211 and 266 px in every language. A count takes its
  short form where its words would be cut ("3/4 encendidos", then "3/4", on the lights and automations cards); the
  lock's and the alarm's "32 dagen geleden door Marta" lets who did it go first, then says "32 d geleden"; a compact
  light or fan whose state would not hold beside its switch (Spanish "Encendida" in half a section) says its level, or
  keeps the line's place empty — the switch says on or off; "Entity not found" is "Not found" on a light's head and in a
  bars row.
- The actions card no longer breaks a name inside a word ("Resta/rt HA" at 211 px, in English too): the play gives way
  first, as it does side by side, then the glyph — decided from the column, the names and the language's "ran 07:00",
  never from a state; a line that would not hold says what the action does over when it ran, the first a name that may
  end in its ellipsis, the time never cut.
- The helpers and updates cards keep a name its room beside what ends its row: every end counts (a chevron, "Up to
  date", Install), the circles give way first, and where even the bare row cannot hold the name — or its line — the
  button or the state goes under it (German "Installieren", the sun's "Above horizon"). Names and lines wrap at their
  words, never inside one ("Announc/e in", "R/outer" before); both heads are fitted, so "Actualizaciones" takes its
  circle's room rather than an ellipsis.
- The entities card gives its circles to a row's line as to its name, the line takes its short form ("32 d geleden",
  "hace 32 d"), a state of a few words takes a second line before the line is cut, a state in words is never narrower
  than its longest word, and where not even then the state goes under the words ("Niet gedetecteerd"); a template's line
  is the owner's words, ending in its ellipsis as names do. The bars card's circles give way to "6 panels" too.
- The fan's speed ruler keeps only the words that stand 12 px apart, measured ("Apagado" ran into "Baja" at 211 px); the
  keypad says "Code eingeben" where "Gib deinen Code ein" would be cut, and its head grows with a title of two lines
  (Turkish "Devre dışı bırak"); the schedule sheet steps a title word wider than its line down to 16 px, then takes its
  short word (Italian "Programma"), and its "Ablaufverfolgung" link says "Ablauf" at 211 px; the automations card's
  empty line says "Nothing scheduled yet" where the lamp's name is one word wider than the panel.
- The energy cards say every word and figure whole at 152, 172, 211 and 266 px in every language. A source that goes
  down reads "Grid · unavailable · since 21:35" on the score, the sankey, the balance and the grid as on the flow, and
  the time leaves whole where the line cannot hold it ("Netz nicht verfü…" before); a stale flow says its age alone in
  half a column ("32 days ago", never "Updated 3…"); the day's line is "Today" where "Since midnight" would be cut
  ("Desde…"), "Last 7 days" is "7 days" ("Afgelopen 7 da…"), "Entity not found" is "Not found" on the energy and sensor
  cards and the meters' rows, and the energy score's title is "Score" where "Punteggio energetico" would be cut.
- Energy rows keep their figures: a share is "36 %" where "36 % vom Gesamten" would be cut (the distribution, the flow's
  "64 % of the house", Turkish "Kitchen içinde %43" on energy devices), a meter's check-in is its time ("21:47"), a
  battery's power stays whole ("descargando 500 W"), and a list's circles give way to these words as they do to the
  names (the humidity's "Son 6 sa").
- Labels never run onto their figures: "Right now" is "Now" where it would wrap (Italian "Adesso"), the grid's "Net
  import" is "Import" in half a column ("Importação" over "1,5 kW" before); the energy card's "No history yet" keeps two
  lines broken between words, else its short form ("Nessuna cronologia", Dutch "Geen historie"), and the grid's empty
  panel says "Keine Sensoren" where "Netzsensor" would break. A sankey device gone from the house keeps the room of the
  name it had, so its labels keep their tiers.
- The player's and the now-playing strip's lines and a heading's meta are never cut: a player gone from the house says
  "Not found" where "Entity not found" would be cut, on the strip why it is out of reach takes a second line, the
  strip's names end in their ellipsis while the state after them stays whole, and a heading's meta longer than its share
  of the row gives its words up to the chevron. The appliances and the alerts' sheet say every word whole in every
  language too.
- In a YAML-mode dashboard an unquoted `on` or `off` reaches the card as true or false (Home Assistant reads YAML 1.1),
  so `tint: on` never tinted a light card, an alerts card's `snooze: off` still kept each person's snoozes, the energy
  flow's `motion: off` still moved, a thermostat's `modes: [off, heat]` lost Off, a schedule target's `verb: on` did
  nothing, and an alert's `state: on` or `not_state: off` compared against "true" and "false". Every key whose values
  are words with on and off among them (`tint`, `motion`, the alerts card's `snooze`, a thermostat's `modes`, a target's
  `verb`) reads true as on and false as off; an alert's `state` and `not_state` match the word, and an attribute's own
  true or false still matches as before.
- Counts of one said as one in every language: the calendar's "+1 autre", "+1 altro", "+1 weiterer" and Spanish "1
  anterior" (were "+1 autres", "+1 altri", "+1 weitere", "1 anteriores"), the History page's "+1 autre" and "+1 altro"
  under a chart's legend and the state lines, the alerts card's Italian "1 in più" (was "altri 1"), the updates card's
  head and the room's "All devices" row ("1 no disponible", "1 indisponible"), and the appliances card's head, which
  counts each in its number ("1 läuft", "1 terminado", "1 terminé").

### Added

- The light card can show its light's colour on its whole surface (`tint`: off, when on, or always with a quiet wash
  at rest); `tint_strength` is `full` (a lit tile's fill in that colour, the same on every palette as a tile's),
  `soft`, or `brightness` (as strong as the lamp is bright; a lamp at 10 % still reads lit); the colour is the card's
  own `color`, its `tone`, or the light's — the bulb's colour, a group's lit members' by brightness, or the colour you
  just tapped — and `light_whites: temperature` shows a white by its temperature instead of the theme's light (#41).
- `light_colors` on the tile, tiles, room and entities cards: a lit colour bulb's tile or row in its colour (#41).
- The settings panel's Appearance tab has a Lights card: how lights show their colour where a card says nothing ("Show
  their colour": never, when on, always; "In their bulb's colour" for tiles, rows and rooms); both are off until you
  choose, so nothing changes on upgrade (#41).
- The automations card can be about one lamp, or a few entities: `targets` (edited row by row: the entity, its name,
  icon, and what a new schedule for it does — on or off, open or close, run, a brightness, a temperature) lists their
  schedules and the automations Home Assistant relates to them, says when the lamp next turns on ("Turns on in
  9 h"), and its `+` opens straight onto the lamp with the verb chosen, so `+` then Save is a working timer; two to
  six targets are chips, more are searched; made for a card in a popup (#43).
- History bars read a counter by its readings: `reset: day | week | month | year` reads a counter that starts again
  from zero (a day counter, a monthly rain gauge) by its readings at each hour's or day's end, so a reset or a
  restart is never counted twice or below zero; `reset: never` reads a lifetime meter the same way, the editor names
  a utility meter's own cycle and says what the sensor is (a `total` without `last_reset`); `stat: state` draws the
  reading at the end of each bar (a monthly gauge by month is each month's rain); a sensor with no state class reads
  the recorder's history (`source: history` asks for it always); `negative_color` and `current_color` give the bars
  below zero and the one in progress colours of their own; `unit` converts within energy, power, volume and distance
  (#44, #45).
- Appliances: an appliance card and a list of the house's appliances. Each is found by what its integration says —
  LG ThinQ and LG's older SmartThinQ (read by its device sensor's attributes as well, both known by what they say and
  never by their names, LG's states folded: sleep is off, a rinse hold is paused, night dry a dry; its rinse aid
  level and tub-clean count read as reminders, and the words Home Assistant has no translation for said in the
  house's language), Home Connect (Bosch, Siemens, Neff, Gaggenau), Miele, SmartThings (Samsung), Matter, Whirlpool,
  Tuya, hOn and Electrolux/AEG — or by its name in any of the eight languages, and on a smart plug by its switch and
  power: what it is, what it is doing in Home Assistant's own words, the step of its cycle, the time left and when it
  is ready, when a delayed start begins, when it finished and whether it still waits to be unloaded (LG's washers,
  which power off when done and have no door, included), a door left open, why it failed, what it asks to be looked
  after (salt, rinse aid, detergent, filters, descaling, beans, the drip tray), a fridge's compartments, a second drum
  or cavity, a range's burners named by where they sit. Start, pause, stop, power, a programme and a setpoint are
  offered for the integrations whose services are pinned by their source; the others are shown, never written.
  Switching off an appliance that is not at rest asks first, and a fridge, a freezer or a wine cooler always does (on a
  smart plug it is in operation while switched on, never "done", and offers no "Tell me when it's done"). The
  card follows the reporter's design: a picture of the appliance (a product drawing a kind, or your own photo, or the
  icon), its name and what it is doing, a power button tinted by what it does, then its kind's hero — the time left
  of its whole over a bar, an oven's temperature and its target, a fridge's compartments, a hob's zones, a coffee
  machine's drinks — and three rows under a hairline (the programme, water and energy, a filter to clean, the last
  coffee: never what the hero already says), each part hidden or shown, the rows picked, ordered, named, coloured and
  given actions; the picture gives way before a letter of the name does; every big appliance
  is the same height, so a row of them lines up — one that lacks a row shows its next one, or a dash in its place, and a
  second oven cavity or drum is one of its three rows; the small ones on smart plugs (toasters, blenders and sandwich
  makers too) are rows with their picture and power button; compact, dial and row layouts, steppers for setpoints, quick
  modes, buttons and programmes to choose stay one setting away; "Unloaded" is remembered per finish. A second card
  lists the house's appliances as rows, compact rows, tiles with their pictures, or each as its whole card (`variant:
  cards`), what needs a hand first. The automatic dashboards lay the appliances out as in the reporter's design: across
  Home under its columns, the large ones as whole cards side by side (four across a desktop, as many as fit on a tablet
  or a phone) and the small ones as rows, each band leading to a page of every appliance; every room shows its own the
  same way. "Tell me when it's done": an administrator taps the bell beside the time left and Fluvy writes a normal Home
  Assistant automation that notifies their phone (or Home Assistant's notifications) when the appliance finishes; the
  bell turns it off and on, and a long press then a tap within four seconds removes it. An appliance out of reach keeps
  its card's size, gone from the house too (an integration still loading), with its rows, compartments, steppers and
  buttons; its head is one height whatever it says (what it does sits beside the name or under it by the column, never
  by the words), so a row of them stays level. Six of the kinds join Fluvy's icon set (`fluvy:washer`, `fluvy:dryer`,
  `fluvy:dishwasher`, `fluvy:fridge`, `fluvy:oven`, `fluvy:coffee`) (#47).
- Alerts: `fluvy-alerts-card` gathers what needs a look — low batteries, devices gone unavailable, doors and windows
  left open, locks left unlocked, leaks and smoke, a vacuum in error, updates, lights left on, Home Assistant's own
  alerts and repairs — each from one line (`preset: low_battery`) or a matcher of your own (ids, patterns, domains,
  device classes, integrations, areas, floors, labels, devices, states, numbers, attributes, `for`), and one
  definition drives its count, its list and its buttons. Severity orders them and colours them (critical, warning, info
  — info in the new notice tone: the palette's accent, or its blue where the accent is warm enough to pass for a
  warning: Ember, Sand, Clay, Blaze, Flamingo), a door left open waits five minutes and a lock ten before they show (a
  door walked through never moves Home), an alert can escalate after a while or past a count, and `conditions` take Home
  Assistant's own visibility shapes. Show them as compact or mini tiles, chips, rows under a head, or a banner that
  turns through them; the card hides itself while all is clear. A tap opens the alert's list — each entity with its
  state, where and how long, a button of its own (Lock, Close, Install, Dock, Acknowledge) and the alert's own (Lock
  all, asked first) — and Snooze (an hour, eight, until tomorrow morning or until it changes: the snooze is yours and
  follows you to every device, or stays on this device, or is the house's); a long press opens every alert, the snoozed
  ones with Wake. Home Assistant's repairs (for administrators) and its alert entities are alerts too. Everything is in
  the visual editor, a preset or your own matcher per alert, and the card watches the whole house at the cost of what
  changed (#48).
- Danger, a tone for what is wrong now, in every card's tone dropdown (#48).
- Scales and gridlines on the energy card's charts: by source and the whole house carry a power scale on the left
  (W or kW, negative values below the line, the unit at the side, its words in the secondary ink) with dashed gridlines
  across, and the whole house a 0–100 % scale for the battery's charge on the right, on the same lines; in a narrow
  column the charge's scale goes first, then the power's; `show_axis` and `show_grid` turn them off; `line_width: thin`
  draws every line of the chart 1 px and `stack: false` draws every source from zero on its own instead of stacked;
  reading the chart marks each source's edge with a dot under your finger (a ring round the charge's dot where the two
  would meet), and the by-source legend gives each source's power at that moment (#49).
- Status colours of your own: in Fluvy's settings, *Appearance → Status colours*, the warning, the danger, the success
  and the notice (an alert of severity info) can each keep the palette's colour (Auto, the default, so nothing changes
  on upgrade) or take one you pick — six suggestions, the orange of #47's mockup among them, or any colour. Fluvy keeps
  its hue and only makes it as light or as deep as it must be to read, on every palette and in light and dark: the
  mockup's orange is `#b04c00` on white and itself in dark mode. Every card and sheet takes it at once — the alerts'
  severities, an appliance's reminders ("Clean", "Refill"), open doors and low batteries, every tone dropdown's Warning
  and Danger, the badges, the rows — and so do Home Assistant's own warning, error and success colours. Where two
  statuses would look alike, the panel says so. The house's, set by an administrator (#47).
- The heading card's `heading_style` (`title`, `subtitle`), as Home Assistant's own heading card has it: `title` is a
  page's section title (27/600, its link 16), which the automatic dashboard's appliance bands use (#47); `subtitle`, the
  default, is the heading as it was.
- `show_icon` (`auto`, `always`, `never`) on every card with a head (#42): `always` keeps the circle while the name keeps
  a few letters beside it (a smaller circle where the full one would not fit); beside a switch in half a phone's section
  (152 or 172 px) not even the smaller one leaves the name its letters, so there the name has the row, as with `auto`.
- `show_stepper` on the thermostat, light and fan (without the − and +, the reading of a value row is the card's tap; a
  dial without them is 56 px shorter), `show_modes`, `show_current` and `subtitle` on the thermostat, and in a heat/cool
  range a tap on the low or the high temperature chooses which one − and + change (#46).
- `empty_text` and `hide_empty` on every card of a list: the words an empty card says ("All closed"), and whether it
  steps aside while it is empty (never in the editor); the updates card with `hide_empty: true` steps aside while
  nothing waits, as Home Assistant's own does (#48).
- A card's or an item's colour can also be `primary-text`, `secondary-text` or `disabled` (your palette's inks, as
  Home Assistant's YAML knows them), a hex with an opacity (dropped), `rgb(…)`, or any CSS colour your browser reads
  (#40).
- The schedule sheet's "Until" has quick ends: 15 min, 30 min, 1 h and 2 h after the start.
- The hue ruler of a colour bulb says red, green and blue under their colours.

### Changed

- Visible on upgrade: the Rooms view, the room tabs and the wall include an area whose only reading is a sensor
  named in the area's settings, or a thermostat, and an area listed in the wall's `areas` stays even when it is
  empty; the photo card of an empty room keeps its photo with the empty panel under it, so it is taller than 1.8's
  head and panel (320 px, 352 with an administrator's hint, against 204 in a 360 column), and the tile card of an
  empty room keeps its chevron and its tap (+16 px); the room card's editor shows the variant the card draws and the
  sensors it found, and the automatic dashboard's room subview shows the humidity its area names when the room has no
  other reading (#39).
- Visible on upgrade: black, the greys and white are a ladder — six steps in your palette's own greys, each lighter
  than the one before and never a colour (blue grey keeps a hint of cool); in light mode black is a black icon on a
  grey plate and white an outlined pale disc, in dark mode black is a plate deeper than the card (it no longer turns
  white) and white a bright icon on the lightest plate; a grey you type in (`#000`, `#333333`, `#ffffff`) lands on
  the same ladder by how light it is, and Home Assistant's own `--blue-grey-color` is that cool grey too (#40).
- Visible on upgrade: an item whose colour is `primary` (or `accent`) is your palette's accent, also inside a card
  with a colour of its own (it took the card's colour), and the card editor shows None for a card's surface colour
  (`card_color`) until you choose one (it said Primary, with a blue swatch) (#40).
- Visible on upgrade: a tap on a card's name now runs its tap action (more-info by default), as a tap on its icon
  did; the Actions, Helpers and Automations cards lose their "…" button, the head itself running the tap action you
  set; the lights chips and tiles head flips the room on a name tap (only when a light can be switched or a
  `tap_action` is set); tiles are no longer `role=button` articles but carry a `button.fv-tile__tap` overlay, so
  card-mod aimed at `.fv-tile[role=button]`, `button.fv-ico` in heads, `.md-art-tap`, `.hm-art-tap`, `.md-mini__text`
  or the printer ring row's circle stops matching (#42).
- Visible on upgrade: the media card's artwork gives way in a narrow column (266 px and under, half a section), so
  the title, the source and the controls keep their room.
- Visible on upgrade: compact light, fan, lock, gauge (bar), room (row) and compact thermostat cards take at least
  half a section (`min_columns` 4 → 6); Home Assistant holds a card to its minimum, so one stored at four columns
  now draws at six (#42, #46).
- Visible on upgrade: history bars — the days before a sensor's first statistic are empty, not zero, so an average
  no longer falls for days the sensor did not exist; the average, the highest and the lowest are the finished days';
  today is live, carried on to the sensor's reading on every state change, and the card asks the recorder again a
  minute after each hour and at midnight; means, extremes and readings that do not add up show no total, money or
  equivalents; a sensor with no state class shows its recent history instead of "No statistics yet"; the bar in
  progress is drawn lighter with a dashed edge and the pointer reads it as "Today"; without a head, a tap on the chart
  runs the card's tap action; the scale's ticks and unit are in the secondary ink, as the dates (#44, #45).
- Visible on upgrade: in half a section a thermostat (compact or ruler), a full light, a fan and a timer put their −
  and + (or rounds) under the reading, so they are 56 px taller there (full width is unchanged); the − and + stay on
  the card, greyed, while the device is off or unavailable (they used to disappear), and work in a heat/cool range
  on the end you pick; in a narrow column a cover's Open/Closed words give way to keep the tilt buttons inside the
  card; a water heater's and a humidifier's modes use Home Assistant's own translated names; a ruler thermostat's
  declared height counts its mode tiles (396, was 356) (#46).
- Visible on upgrade: an empty list card shows its head and an empty panel instead of the error card (an error card
  already stuck goes after one reload); the openings card uses its short title ("Openings") where the long one would
  end in an ellipsis and no badge keeps it; the helpers card's rows give their circles to their names in narrow
  columns where a switch or a value's button would squeeze a name (#48).
- Visible on upgrade: a light card with a `tone` draws in that tone (the bulb's colour no longer replaces it), one
  set to `color: primary` or `accent` draws in the theme's accent, a light group's card takes its colour from its lit
  members weighted by brightness with whites left out (it took Home Assistant's mean), a colour bulb's card in half a
  section or on a zoomed phone is a row of quick colours taller (60 px), a light card that cannot be read is as tall
  as the live one, and the quick colours' whites read cool and warm (a pale blue-white, a paler amber) (#41).
- Visible on upgrade: the automations sheet's "Until" shows the quick ends; the empty card says "Tap + to add a
  schedule" only where there is a `+`; the card picker previews the automations card listing the house by name; on
  an existing schedule the sheet's focus starts on the verb it does (#43).
- Visible on upgrade: the generated Home (`custom:fluvy-home`) opens with "Needs attention" (leaks and smoke, open,
  unlocked, errors, low batteries; for administrators also updates and repairs), three tiles and a fold, hidden while
  all is clear; on Home and in the rooms of every template an appliance device (a washer, a fridge, a kettle on a
  plug: what the appliance card finds) leaves the plug tiles for the appliance bands, Home's band headings leading to
  a new "Appliances" subview, not a tab; an appliance's own temperature or humidity sensor no longer counts as a
  room's reading; the energy views are unchanged (#47, #48).
- Visible on upgrade: every card's tone dropdown offers Danger; Home Assistant's icon picker lists six more Fluvy
  icons (the appliance kinds); for an administrator, an appliance's whole card with a finish to hear shows a quiet
  bell beside its figures (`show_notify: false` hides it) (#47, #48).
- Visible on upgrade: energy card, by source and the whole house — the scales and gridlines are on by default, so
  the plot is narrower by their labels (about 40 px a side), the hours are centred on their hour under the plot and read
  in the scales' secondary ink, the "Charged · exported" tag under the line goes (the scale and the legend say it), the
  "100 %" tag gives way to the charge's scale where it fits, the chart's top is the next nice tick above the day's peak
  rather than the peak itself, each band's edge is drawn over the house's line so the top of the stack shows the top
  source's colour, and the "Right now" row is always there ("—" while nothing can be read) (#49).
- Visible on upgrade: out of reach, every card keeps its size and anatomy in the off skin — an unavailable or missing
  thermostat, lock or alarm wears the dashed card like the fan, cover and vacuum, its mode tiles and chips dashed and
  taking no tap; an unavailable scene keeps the scene tile's own shape; a sensor card whose sensor is out of reach
  shows the window it had in grey with its bubble at "now" saying "—"; the media card always draws its seek line
  (idle full card 272 → 352 px, hero +76) and the now-playing strip its progress line (212 px whatever it plays);
  a calendar loading draws four still rows; a clock whose weather is out of reach keeps its forecast row (+60 px);
  offline or missing printers keep the full job anatomy (84 → about 700 px); a to-do list out of reach keeps five
  still rows and reports six to the layout before its items arrive; the updates head says "N unavailable" instead
  of "Up to date"; the energy balance lists a two-way source it cannot read once; the weather says "Not found" for a
  weather entity that is not there; a missing entity the page read earlier keeps its name, unit, classes and
  capabilities.
- Visible on upgrade: a row of three chips that cannot stand in one line goes two and one, the last chip across the
  line, before it goes one a line (thermostat modes, fan presets, the schedule sheet and every other three-chip
  row); a row of statistics (the EV charger's session, the balance's money, the grid's totals, the energy card's
  legend, the flow's totals) takes as many columns as hold its words and figures, two and one in half a column
  instead of one a line under 240 px, and never wraps a word onto its figure; the vacuum's and the cover's commands
  wrap into two full rows rather than draw a button under 44 px; the energy overview puts the battery under the
  house's reading by measuring the two, not under a 240 px column.
- Visible on upgrade: lists keep their circles only while the column holds every name beside what ends its row — the
  grid's price, the distribution's rows, the humidity card's rows, the meters, the entities card, the calendar's day
  rows and the map's rows now follow the rule the fan, room, helpers and updates rows already did.
- Visible on upgrade: the map card has a short title ("Everyone") for a narrow column, as the people card has "At
  home"; where not even the short title holds beside the map round (half a phone's column), both cards keep the title
  whole and put "Map" in a row under the body.
- Visible on upgrade: in a narrow column (half a section, 211 or 266 px) and in a long language, a word that would be
  cut takes its short form instead — "Now", "Import", "Today", "Not found", "Score", "3/4 encendidos", "KW 38", "Code
  eingeben" — a row's value, button or state that would not hold beside its words goes under them, a compact light's or
  fan's state gives way to its level beside the switch, a heading's meta that would be cut leaves its chevron alone, and
  the now-playing strip's names end in their ellipsis while the player's state after them stays whole.
- Visible on upgrade: in a YAML dashboard an unquoted `motion: off` now stops the energy flow and a thermostat's `modes:
  [off, heat]` keeps Off (YAML had read them as false).
- Visible on upgrade: the clock's time steps down a size before a digit or its period is cut (the hero's 64 → 48, the
  side clock's 40 → 32 with its face following it down to a tile's 24, the tile's 40 → 32); the weather hero's figure
  steps down to the readout size where it would cut its unit in a narrow column, and its day rows take short weekdays
  where a long one (Portuguese) would not hold.
- Visible on upgrade: the vacuum's readouts take as many columns as hold their words (two and one in a 211 column);
  the keypad's keys give way on the 4 grid in a sheet too narrow for them; an energy device's modes are tiles only
  while every name holds its cell, else chips, as the thermostat's; the sankey in half a column sets its words in two
  columns, at the start and the end of each tier.
- Visible on upgrade: a sensor card with several curves never draws two of them in colours closer than the palette
  engine's own distance between series (two warm curves on Linen).
- Visible on upgrade: the printer's row with its progress ring is the card's button — its name and its line open the
  printer too, not only its circle, and its round still pauses and resumes (#42, #47); the 3D printer's times (what
  is left, when it is ready, how long ago it finished) are shared with the appliances: the same days and the same
  rules, the printer's own words.
- Visible on upgrade: the automatic dashboard's columns are cut with the house in hand (a thermostat with presets
  and fan speeds, a fan with oscillation, a player with sources are reserved their real height), so columns end
  closer to one line; in the demo home the appliances list and the thermostat move to the first column, the player
  and the to-do list to the second.
- English comes in parts: what every page says stays in the bundle's core, and a family's own words travel with the
  family's chunk — the settings panel's, the History page's and the Activity page's are fetched only when the page
  is opened; the naming words the automatic dashboard reads a house by are build input and no longer ship in any
  language; the wall's words (its way out, its toast, its way back) are core's, so a wall that never opened the
  panel says them; "Traces" is a shared word, so the schedule sheet says it without the Activity page.
- Budgets: every page 236 KB gzip (224 in 1.8: the head as the card's button, the grey ladder, the value row, empty
  lists, the room's contents, the appliances' announcement and icons, the house-aware heights, the status colours of
  your own, every word held whole in every language, less the 9 KB the lazy families' English left core), the energy
  family 76 KB (64), the automations family 20 KB (16), the languages 24 KB (20); new chunks of their own: the
  appliances (51 KB) and their pictures (32), the alerts (24) and their sheet (12), the history bars' readings (8).
- For translators: English is a folder of parts (`packages/core/src/i18n/locales/en/`), every other language still
  one catalogue; the naming words have a file per language (`packages/core/src/i18n/words/`), and the appliance
  kinds' stems beside the strategy's. See `docs/translating.md`.
- Words, from the 1.9 translation review: Turkish says the alerts editor's domains "Etki alanları" (it said "Alanlar",
  which reads as the areas beside it), the unavailable preset "Kullanılamayanlar" as Home Assistant does, "Kompakt
  satırlar", and the appliance editor's "Bölme görünümü" and "Hızlı mod görünümü" no longer repeat the labels above
  them. German: "An einer smarten Steckdose", "Dieser Zyklus", an oven's target "Ziel" throughout as #47's mockup writes
  it ("Ziel 200 °C", "Zieltemperatur"), "Trocknungsgrad". French: a hob's "Allumées : 1 sur 4", "Déverrouillées", "Rien"
  beside a clear alert, a reminder's "OK", a job's "encore 45 min" and "depuis 45 min", and the typographic apostrophe
  in the cards. Italian: "Accese: 1 di 4", "dashboard" (was "plancia"), the severity "Attenzione", "Avvia la
  manutenzione", "ancora 45 min" and "da 45 min". Dutch: the appliance editor's "Rijen" (was "Regels"), "Snelfuncties
  tonen", "Zoals opgegeven" in both cards. Spanish: "Encendidas: 1 de 4", "Nivel de secado", "Iniciar el mantenimiento".
  Brazilian Portuguese: "Ligadas: 1 de 4", "Trava infantil", "Alvo 200 °C", "Temperatura-alvo", and an appliance at work
  says "Funcionando".
- The appliances and the alerts families are fetched as the bundle starts, as the energy family is, and defined as
  they land; each language's catalogue carries their words (about 3 KB more).

### Development

- The measurer draws the widths it measures as cards, the way Home Assistant lays them out: half-section cards at 152
  and 172, full cards at the 211 floor and at 266, phones at their own sections (328 and 380) and a desktop at 360;
  until now it passed window widths and the playground's frame shrank to fit, so every narrow probe drew the same
  176-px card and no card between 176 and 263 was ever measured (which is how a compact thermostat's figure could sit
  under its stepper, #46). It also sees words drawn under a control or over each other (`overlap`), two runs of text
  laid over each other anywhere else (`collision`: a week strip's "LUNMARMER"), a word broken across two lines or a
  figure parted from its unit (`midword`: "Resta/rt HA"), a figure, a unit or a percentage cut by an ellipsis or a line
  clamp (`cut-figure`: "Schauer · 6…") and any other word so cut that is no name (`cut-word`: "2 événe…"; a tooltip excuses a name's words only, never a cut figure or a status line), a pill that
  cuts its own name (`pill-cut`), a line cut by its box with no ellipsis (`clipped`), a catalogue key on screen
  (`raw-key`) and a card head without a free 44 × 44 to tap (`head-target`); a name may end in its ellipsis, the house's
  (an entity's, a device's, an area's, a person's, what a player plays) or a card config's (`name`, `title`). CI
  measures every language at the four card widths in a job of its own beside the English sweep (`pnpm measure:narrow`),
  and `tools/render/measure-fixtures.mjs` holds each rule to a frame drawn to break it and a clean one it must let pass;
  every half-section card has a playground frame at its own size; `tools/render/known-violations.json` lists what a
  later block owns and only shrinks.
- `tools/render/heights.mjs` is a gate: a drift over 8 px between a card's declared and drawn height fails CI
  unless `tools/render/known-heights.json` lists it with its reason; the file only shrinks (`--write-known` rewrites
  it, keeping the reasons), and the interaction suites read the declarations with the house too.
- Every card of the catalogue is held to its live size and anatomy while its entities are unavailable, unknown or
  missing, in every variant and at every card width the measurer uses (`tools/render/interactions-unavailable.mjs`,
  `unavailable.test.ts`), with Home Assistant's own way of writing an entity it cannot reach in the demo home; a card
  that finds what it shows (a room in its area, the house's automations) has only what its config names taken out
  when missing, and one whose rows are what its entities say keeps every row and part but not the live twin's
  height, the reason said. `resolveEntity` remembers, for the page's lifetime, what Home Assistant last wrote of each
  entity's description and capabilities; `button()` in `@fluvy/ui` takes a `disabled` flag.
- `interactions-unavailable.mjs --states never` mounts each card with the ids its config names renamed to ones the page
  has never read, and holds it to the height it declares where the house is not there to say (the fan, the cover and the
  robot vacuum hold; the scenes, helpers and history bars cards not yet, so the state is asked for, not part of `pnpm
  visual`); the appliances card finds the house's appliances in its registries, so missing takes out only what its
  config names, and `@fluvy/core` answers a missing entity's capabilities as a state object (`capabilitiesOf`) for what
  reads states rather than views. The security suite types a code and disarms at 211 and 360; the rooms suite reads the
  tile heads and the hints at 211 in every language; the lists suite holds every list's empty panel to 16 under its head
  and 20 above its foot.
- The playground puts the house's status colours over any page (`?warning=%23dc630b`, `&danger=`, `&success=`,
  `&notice=`; a frame its own with `FrameSpec.statuses`), and `interactions-colours.mjs` checks in Chromium, light and
  dark, that a picked warning reads at 4.5 on its card while the danger stays the palette's; the build gates the
  derivation over every preset, the community's palettes and custom ones, and keeps the notice ΔE2000 5.5 from the
  warning and the danger (`roles/notice-separation`).
- The playground's stand-in for Home Assistant answers its WebSocket from one table (history for every entity asked,
  statistics by period and over a window, `recorder/get_statistics_metadata` from the house, related items, repairs,
  stored data and its subscriptions, backend translations), sheets add their own answers on top, its registries stay
  the same objects as Home Assistant's do, a frame's columns are held to the card's own minimum as Home Assistant
  holds them, a house can be drawn with no frame for a suite that mounts its own cards (`?frames=none`), a dashboard
  that does not wear the look is drawn as Home Assistant does (`?theme=off&fallback=mist`), and new sheets show the
  greys, the unavailable twins, the appliances (with the reporter's mockup beside ours), the alerts and the recorder's
  load (ten history bars and five plug appliances ask under two questions a minute).
- The history bars' gridlines, ticks and unit live in `energy/axes.ts`, shared with the energy card (classes
  `ax-grid`, `ax-tick`, `ax-unit`, were `hb-grid`, `hb-tick`, `hb-unit`); the bundle fails when a family's English is
  found in the every-page code, and a test holds every module that says a family's words to the chunk that registers
  them.
- The history bars suite's recorder-load check failed between 23:00 and 24:00 (its hour crossed midnight and every
  window was asked again); it now runs its hour from a morning of the sheets' day. The public demo lists the
  appliances and alerts sheets. The measurer's ledger of known violations is empty.
- A facts guard (`pnpm --filter @fluvy/docs check`) holds the spelled counts in the README, the docs, the package
  description and the design language — the cards, the palettes, the automatic dashboards, the languages, the panel's
  tabs — to the code, the every-page budget to `finish.mjs` and the chunk table in `docs/development.md` to
  `check.mjs`.

## [1.8.0] — 2026-10-12

### Added

- **Automations** (#33): `fluvy-automations-card` lists every automation of the house — on or off, when it last
  ran — and the schedules Fluvy writes among them with their days, times and next run; rows, compact rows or tiles,
  filters, a fold for long lists. A schedule is a native Home Assistant automation (in Settings → Automations too),
  created and edited in a sheet: what it targets, what it does (on, off, open, close, run; a brightness or a
  target temperature), on which days (every day, workdays by the workday sensor, the weekend, your own), when (a
  time, or sunrise and sunset with an offset) and until when. Only administrators add, edit or delete; everyone
  sees the list, the switch and Home Assistant's dialog on tap. The card comes in its own chunk, the sheet in
  another fetched on the first tap; the words of the family are in eight languages.
- **Quick colours of your own, named and edited one by one** (#37): the light card's `colors` take any colour as
  `#rrggbb` or `[r, g, b]` beside the words, each with a name of its own (`{ color: '#ff2d55', name: 'Lila' }`)
  that its round says, and the editor edits the list row by row — a colour (the words, the picker, or Custom colour
  with a colour well) and a name — in your order, any number of them, with the bulb's default six shown as rows
  until the list is touched. A hex now reads as itself ("#ff2d55", no longer "Ff2d55") and a Home Assistant colour
  as words ("Deep purple"); the row wraps by count (three make one short row, twelve two) and the card's height
  follows.
- **History bars** (#38): `fluvy-history-bars-card` draws a sensor's last days, weeks or months as bars from Home
  Assistant's long-term statistics — the value over each bar on a nice scale with dashed gridlines and the unit
  beside it, the dates under them, the total and the average beside the title (on their own row on a phone), and a
  strip of facts under the chart on the page's surface: the highest, the lowest and the average by default, or what
  the bars come to in CO₂, trees, kilometres and money, a share of another sensor, or a template of your own. The
  readouts and the facts are lists you compose in order, each with its own name, icon, colour, unit, decimals,
  factor and tap action; a bar can be what a meter gained or a measurement's mean, highest or lowest; the day in
  progress joins when asked; a pointer or the arrow keys read a bar's day in the readouts' place. Three layouts
  (`full`, `compact`, `mini`), every part switchable, eight languages, in the energy family's chunk.

### Changed

- The every-page budget is 224 KB (222 in 1.7), the languages' 20 KB (16): the automations family's announcement
  and words and the light's own colours; the automations card and its sheet come as two chunks of their own, the
  history bars in the energy family's.
- Dev dependencies: eslint 10.12, typescript-eslint 8.71.1, Vite 8.3.4, happy-dom 20.14.6, Playwright 1.64,
  @types/node 24.19.1.

### Fixed

- A pill (a chip's width) was fitted by its box rather than its content, and fitted again in the font event itself,
  a frame before the face was usable: a tab row could flicker between filling its line and not — the chips card's
  tabs at a phone's column, seen by the measurer in CI since 1.6. Fitted by the content, in the element's own pixels
  under a zoomed view, a frame after a font lands.

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
