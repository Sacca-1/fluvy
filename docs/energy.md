# Energy

Fluvy's energy cards read a house the way its meters do and say only what they measure. This page is the guide:
how a card finds its sources, how to describe the ones it cannot find, and what each card of the family shows. Every
option of every card is in [the cards](cards.md).

## Where the cards read the house from

**The Energy dashboard, when a card is given nothing.** A flow, a balance, a grid, a batteries card with no
sources of their own read Home Assistant's energy preferences — every grid connection, every array and battery,
with the power sensor you gave each one there (`Settings → Dashboards → Energy`, the power sensors of 2025.12 and
later). A grid or a battery set up there with two power sensors (one for what comes in, one for what goes out) is
read as two sensors — Home Assistant's own diagram nets them into one; Fluvy keeps both, so a house that imports and
exports at the same moment shows both flows.

**Your own sources, when you describe them.** A card's `sources` list replaces the Energy dashboard's. A source is
one of `solar`, `grid`, `battery`, `generator` or `vehicle` (a car that can power the house), read in one of three
ways:

```yaml
sources:
  - type: solar
    power: sensor.inverter_power          # one sensor, positive toward the house
  - type: grid
    import: sensor.grid_import_power      # two sensors, both positive
    export: sensor.grid_export_power
  - type: battery
    power: sensor.battery_power           # + discharging; invert: true for a meter signed the other way
    level: sensor.battery_soc
    capacity: 10                          # kWh: weights several batteries' charge, and says "full in"
```

`power` is one signed sensor: positive is energy toward the house (import, production, discharge). A meter that
counts the other way takes `invert: true`. `import` and `export` are two sensors, both positive. `phases` is a list
of signed sensors, one per phase (or per inverter, per string), summed **per sign** — see below.

Each source may also have a `name`, an `icon`, a `color` (any Home Assistant colour, or `#rrggbb`), `threshold` (the
watts under which it rests, 10 by default), `arrows: none` and `show: active | never` (never: counted, not drawn).

## A house that imports and exports at once

A three-phase house with its solar on one phase can import on two phases while it exports on the third. A single net
meter shows the difference and hides both flows — and then every share worked out from it is wrong (the sun seems to
cover more of the house than it does). Read the grid per phase:

```yaml
type: custom:fluvy-energy-flow-card
sources:
  - type: solar
    power: sensor.inverter_power
  - type: grid
    phases:
      - sensor.grid_power_l1
      - sensor.grid_power_l2
      - sensor.grid_power_l3
  - type: battery
    power: sensor.battery_power
    level: sensor.battery_soc
```

Each phase sensor must say its own direction (positive importing, negative exporting — or all inverted together with
`invert: true`). The positive phases are summed as what comes in, the negative ones as what goes out; the grid then
draws two lanes, the import in the grid's colour and the export in the colour of where it came from. If a phase
cannot be read, the grid says "—": a sum that skipped a dead phase would be a wrong number. The Grid card shows each
phase on its own bar, and the balance lists them under "Per phase".

## Live, or a period

A flow, a balance, the sankey and the score can show a day, a week or a month (`period: day`), with Day · Week ·
Month chips to switch. A period reads the Energy dashboard's meters from Home Assistant's long-term statistics, hour
by hour (a day by day over a week or a month), and allocates each hour the way the Energy dashboard does — grid energy
the house did not use went to the battery first, then the sun charged the battery, then it was exported, then the
battery exported, then the rest ran the house — and adds the hours up. The figures are the dashboard's own.

## The cards

- **Energy flow** — where the energy comes from and where it goes. Variants `rows` (sources left, the house right),
  `cross` (the sun above, the grid left, the house right, the battery below, with the flows between sources) and
  `list`; styles `stream` (lanes with pulses of light), `legs` (thin dashed lanes) and `rail` (one quiet track);
  `motion: full | calm | off`; `consumers` (where it goes: the house's biggest loads, and the rest of the house);
  the badge says how much of the house runs on sun (`badge: solar`), its self-sufficiency (`self_powered`), or the
  grid's way (`grid`).
- **Energy balance** — what comes in against what goes out, live or over a period, always adding up (the house is
  what is left); the grid's phases under it; over a period, what it cost and what the feed-in paid.
- **Grid** — the net import or export, what comes in and goes out, each phase with its voltage, the price now, and
  today's import, export and cost.
- **Batteries** — one state of charge for several batteries (weighted by capacity, so give each its `capacity`),
  full in / empty in while they all go the same way, the reserve, each battery on its own row, and the mode, when
  there is a select for it.
- **Car charger** — the car's charge against its target and the time it should be ready, the session's energy and
  time, how much came from the sun, the charging mode; a car that powers the house says so.
- **Where it went (sankey)** — a period from where to where, in true proportions: the grid, the battery and the sun
  into the house, the battery and the export, and the house into its devices and what is not measured.
- **Energy score** — self-powered, the sun used and low-carbon, as the Energy dashboard's own gauges compute them.
- **Water & gas** — each meter's use today against a typical day, what flows right now, and a leak sensor or a valve
  beside them.
- **Energy** — `variant: sources` draws the house's power today by where it came from, stacked, with what went into
  the battery and out to the grid below the line. When the Energy dashboard names a power sensor for every source, the
  curve is their five-minute means — what Home Assistant's own "Power sources" graph draws — and "right now" is the
  house's own use; otherwise the meters, in blocks of 15 minutes, or 30 or 60 when a meter counts in coarse steps
  (0.1 kWh). A hybrid inverter's AC meter registered as solar counts what the battery gives back as sun: give the
  Energy dashboard its power sensors and the card draws from them.
  `variant: overview` draws the whole house today, as Home Assistant's "Power sources" graph does, plus your batteries:
  - every source's power above the line: the sun's whole production, what the battery gave and what came from the
    grid;
  - below the line, what went into the battery and out to the grid;
  - the house's use as a line;
  - the batteries' state of charge as a dashed line on its own scale: 100 % at the top, 0 % on the zero line, so it
    always sits in the positive half, above what went out of the house. It comes from the charge
    sensor the Energy dashboard names; several batteries are weighted by their capacity, and with no capacity given
    there is no line.

  At the top, "right now" and the charge now. Run a finger along the chart and the readouts and the legend show that
  moment, with a dot on each source's edge. `show_soc: false` and `show_house: false` hide the two lines. A
  generator or a car shows only when the Energy dashboard names a power sensor for every source.

  Both charts by source carry a power scale on the left (W or kW, negatives below the line) with dashed gridlines
  across, and the whole house a 0–100 % scale for the charge on the right, on the same lines. In a narrow column
  the charge's scale goes first (its readout and the "100 %" at the top still say it), then the power's.
  `show_axis: false` and `show_grid: false` turn them off. `line_width: thin` draws every line 1 px.

  The sources are stacked: each one sits on the one before it, so the battery's band starts where the sun's ends and
  its top is the two added together (5.6 kW of sun and 4.2 kW from the battery top out at 9.8 kW). Each band keeps
  its own edge in its colour, and the legend gives each source's own value under your finger. `stack: false` draws
  every source from zero on its own instead, so their heights can be compared directly.
- **Energy devices** — rows can nest (`parent`), and a `total` meter shows what is not measured, at every level.
- **Production** — `arrays` stacks each array's hourly bars.
- **History bars** — a sensor's last `days` days (or weeks, or months: `period`) as bars from its long-term
  statistics, the value over each bar, the total and the average beside the title, and a strip of facts under the
  chart: the highest, the lowest and the average, or `co2`, `trees`, `km`, `money`, a `share` of another sensor and
  a `template`, each named, iconed, coloured and tappable as you like (`head` and `facts` are lists in your order).
  A counter that starts again on a cycle is read by its own readings (`reset: day`, `week`, `month`, `year`, or
  `never` for a lifetime meter) so a reset or a restart is never counted twice; a sensor with no state class reads
  the recorder's history; today is live and the average, highest and lowest are the finished bars'.
- **Gauge** — `variant: signed` for a meter that can be negative: zero at the top, "1.8 kW out".

## A configuration each

Every card below works with nothing but its type — it reads the Energy dashboard — and takes these when you want to
say more. Its every option is in [the cards](cards.md).

```yaml
type: custom:fluvy-energy-balance-card
period: day                 # live (default) · day · week · month
show_cost: true             # over a period: cost, feed-in and net, from the Energy dashboard's prices
```

```yaml
type: custom:fluvy-grid-card
phases: [sensor.grid_l1_power, sensor.grid_l2_power, sensor.grid_l3_power]
voltages: [sensor.grid_l1_voltage, sensor.grid_l2_voltage, sensor.grid_l3_voltage]
price: sensor.electricity_price
```

```yaml
type: custom:fluvy-batteries-card
reserve: 20                 # %: the mark on the ruler, and what "empty in" counts down to
mode: select.battery_mode
batteries:
  - { power: sensor.garage_battery_power, level: sensor.garage_battery_soc, capacity: 10, name: Garage }
  - { power: sensor.basement_battery_power, level: sensor.basement_battery_soc, capacity: 10, name: Basement }
```

```yaml
type: custom:fluvy-ev-charger-card
entity: sensor.wallbox_power   # + charges the car; negative: the car powers the house
level: sensor.car_battery
target: 80                     # or an entity
ready_by: "07:00"              # or an entity
session_energy: sensor.wallbox_session_energy
status: sensor.wallbox_status
vehicle: Model 3
mode: select.wallbox_mode
```

```yaml
type: custom:fluvy-energy-sankey-card
period: day
max_devices: 4                 # the rest are one "Other devices" bar
```

```yaml
type: custom:fluvy-energy-score-card
period: week
co2: sensor.grid_fossil_fuel_percentage   # the low-carbon ring; default: the first CO₂ Signal sensor
```

```yaml
type: custom:fluvy-meters-card
meters:
  - { entity: sensor.water_meter, rate: sensor.water_flow, typical: 150 }
  - { entity: sensor.gas_meter }
rows: [binary_sensor.kitchen_leak, valve.main_water]
```

```yaml
type: custom:fluvy-energy-devices-card
total: sensor.house_energy_today        # what no device accounts for
rows:
  - { entity: sensor.kitchen_energy_today, name: Kitchen }
  - { entity: sensor.oven_energy_today, name: Oven, parent: sensor.kitchen_energy_today }
```

```yaml
type: custom:fluvy-production-card
entity: sensor.solar_energy_today
arrays:
  - { entity: sensor.east_array_power, name: East }
  - { entity: sensor.west_array_power, name: West }
```

```yaml
type: custom:fluvy-gauge-card
entity: sensor.grid_power
variant: signed
max: 5000                      # in the sensor's unit; the scale runs from -max to max
```

## Honest by design

A figure that cannot be read is "—", never a 0; a source that stops reporting is drawn as a dashed hairline and the
head says since when; readings older than ten minutes make the whole diagram rest and say how old they are; the house
is never guessed from a sum that is missing a part.

## Performance

The pulses are Web Animations of `transform` and `opacity` only, sampled once per lane: the compositor runs them
without the main thread. At most eight travel on a card, and all of them pause when the card is off screen or the tab
is hidden. The energy cards arrive as their own file, fetched as Fluvy starts: a dashboard without energy on it never
waits for them.
