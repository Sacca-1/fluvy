# The automatic dashboards

Five dashboards Fluvy builds by itself, each from one line of configuration:

```yaml
strategy:
  type: custom:fluvy-home      # or fluvy-rooms, fluvy-energy, fluvy-security, fluvy-wall
```

The panel's *Dashboards* tab creates any of them with one tap (as `/fluvy-auto`, `/fluvy-rooms`, `/fluvy-energy`,
`/fluvy-security`, `/fluvy-wall`); any dashboard with that raw configuration is the same thing. Each is rebuilt every
time it opens, from the registries, so a new device shows up by itself.

| Template | What it is for |
| --- | --- |
| **Home** (`custom:fluvy-home`) | the whole house: Home, Rooms, Lights, Climate, Energy, Security, Media, Agenda and Sensors, each when the house has what it shows, and an Appliances page behind Home's appliance bands |
| **Rooms** (`custom:fluvy-rooms`) | a card a room, a tab a floor when the house has two or more; each room opens as its own page |
| **Energy** (`custom:fluvy-energy`) | Now (the flow, the balance, the house by source, the grid, the batteries, the car charger), Today (the day's flow, where it went, the score, the day's balance), Production, Devices, Water & gas, Meters |
| **Security** (`custom:fluvy-security`) | Security (the alarm, what locks, what opens, the first cameras), Cameras, Openings room by room |
| **Wall** (`custom:fluvy-wall`) | two columns for a tablet on the wall, read from a metre away: the greeting, the clock, the readings, the scenes and the rooms; the thermostat, the security rows and who is home |

## What the home dashboard builds

| View | What goes in it |
| --- | --- |
| **Home** | "Needs attention" first (leaks and smoke, open, unlocked, errors, low batteries; for an administrator also updates and repairs — hidden while all is clear), the greeting (your person, the date, the weather), the tabs, the lights under one heading, the covers, the running thermostat, the temperatures, the weather and the clock, the energy flow and the solar or home energy curve, the locks and openings, at the columns' feet the first media player, the vacuum, a to-do list and the first scene, and under the columns the house's appliances: the large ones as whole cards side by side (four across a desktop, as many as fit on a tablet or a phone), the small ones as rows, each band leading to the Appliances page |
| **Rooms** | a card a room (its photo where the area has one), headed by floor when the house has more than one; each room opens its own page with its thermostat, lights, covers, media, readings and camera, and its appliances across the page as on Home — when the house has two rooms with something in them |
| **Lights** | every light and every switch whose words say it is a light, grouped by area (indoor and outdoor when there are no areas), dimmable ones as light cards and switches as tiles; the light automations as scenes last |
| **Climate** | thermostats, water heaters and humidifiers, the weather, the temperature and humidity sensors that are not the weather service's — humidity paired with its temperature |
| **Energy** | the energy flow and the balance, the house's power by source, the grid (by phase when its meters are named so), the batteries, a car charger, the day's flow, where it went and the score (when the Energy dashboard meters its sources), production, the energy dashboard's devices, their distribution, water and gas |
| **Security** | alarm panels, locks, gates and garage doors, the openings, the cameras — when the house has an alarm, a lock, a camera or a gate |
| **Media** | what plays now, then every other player |
| **Agenda** | the calendars in a month view, the to-do lists, the timers, the scripts and automations to run by hand — when there are calendars, timers, things to run, or more than one list |
| **Sensors** | device batteries, phones, the people and the map of their zones, the openings (when there is no Security view), the plants, the helpers, the updates, the first camera |

Views a house has nothing for are left out. Every view keeps the same three columns (two on the wall), so the header
never moves between tabs, and blocks are cut into the columns so that they end on one line. A room's page is a
subview: it opens from its card, never from the tabs, and its heading leads back.

## How it reads a home

- **Words**, in every language Fluvy speaks (a house is named in its own language, whatever the UI's), the way people
  name things: a switch called *Kitchen light* is a light, one
  called *Washing machine* is an appliance; a switch called *boost*, *valve*, *beep* or *timer* is a setting, not an
  appliance.
- **Appliances**: what the appliance card finds — by what its integration says (LG ThinQ, Home Connect, Miele,
  SmartThings, Matter, Whirlpool, Tuya, hOn, Electrolux) or by its name — leaves the plug tiles for the appliance
  bands, and its own temperature or humidity sensor (a fridge's, an oven's) never counts as a room's reading; the
  energy views read the plugs' power as before.
- **Twins**: a device with a switch and an outlet of the same name shows once, with the device's power and energy
  readings beside it.
- **Places**: an entity whose name only says what it measures (*Temperature*) is named after its device or area.
- **Rooms**: an entity belongs to its own area, else to its device's; hidden, configuration and diagnostic entities
  stay out. A room's climate comes from the temperature and humidity sensors set in the area's settings (honoured even
  when they are hidden or diagnostic), else from a sensor of each kind in the room — the first that reads, a dead one
  never hiding a working one — else from its thermostat or humidifier. A unit alone never makes a reading: a "%" is
  as often a battery. An area is a room when its room card would draw something — an entity, or one of those readings
  — and an entity whose state arrives late (Home Assistant still starting) is found the moment it does.
- **The weather service's sensors** (the platform is a weather integration) stay out of the climate view.
- **Solar, grid, battery**: the Energy dashboard first — when it carries the grid's power sensors the energy cards
  are given no sources and read it themselves (every connection, two sensors kept as two). Otherwise power sensors
  whose words say so: a meter named for what leaves the house (*export*, *feed-in*, *einspeisung*, *vertido*…) is the
  grid's second sensor, never the grid itself; grid meters named by phase (*L1*, *Phase A*, *fase 2*) are read per
  phase; a grid meter that reads negative through the night is understood as exporting-positive and inverted; the
  battery's charge is the battery sensor beside its power. A car charger is a power sensor named so (*wallbox*,
  *charger*, *ladestation*, *cargador*…); water and gas are the Energy dashboard's meters, else the house's own.

## Options

In a dashboard's raw configuration, or in the panel's *Dashboards* tab (each dashboard has its own card of options
there; *Recreate* takes them all back to their defaults):

| Option | Values | Templates | What it does |
| --- | --- | --- | --- |
| `hide` | view names: `rooms`, `lights`, `climate`, `energy`, `security`, `media`, `agenda`, `sensors` (home); `today`, `production`, `devices`, `water`, `meters` (energy); `cameras`, `openings` (security) | home, energy, security | views left out (the first view always stays) |
| `thermostat_variant` | `dial` (default), `compact`, `ruler` | home, rooms, wall | how the thermostats are drawn |
| `tile_size` | `large` (default), `compact` | home, rooms | the tiles' size on the Lights view, the Home view and a room's page |
| `flow_style` | `stream` (default; `ribbons` reads as it), `legs`, `rail` | home, energy | the energy flow's drawing |
| `room_variant` | `photo` (default: a photo where the area has one, else a tile), `tile`, `row` | home, rooms | the rooms' cards |
| `areas` | a list of area ids | wall | the rooms the wall shows, in that order, an empty one kept (default: every room with something in it) |
| `camera_refresh` | `5`, `10` (default), `30` | security | seconds between the cameras' stills |
| `scenes_max` | `4`, `6` (default), `8` | wall | how many scenes the wall offers as chips |
| `greeting_tabs` | `hide` (default), `show` | home, rooms, energy, security | the views as chips under the greeting too, besides the header's tabs (until 1.4 they always were) |
| `weather` | a `weather.*` entity | all | the weather of the greeting and the clock (default: the first) |
| `language` | `en`, `es`, `de`, `nl`, `fr`, `it`, `pt-BR`, `tr` | all | the dashboard's words in that language, whoever opens it |

Without `language`, the dashboard's words follow the language of whoever opens it (Home Assistant's, or the one
chosen in the panel's *Preferences*). A house is read in every language at once: a switch called *Küche* or
*cocina* is a light's room in any of them. The settings file *Preferences* exports (its last card, *Fluvy*) carries every dashboard's options
under `dashboards`, by url path; a file from Fluvy 1.2 (one `dashboard` key) still lands on the home dashboard.

## Limits

They never invent: a house without a weather entity gets no forecast, a house without energy preferences gets a flow
only if the words find its meters, a wall without scenes has no scene chips. A dashboard you want to shape by hand is
better started by hand — add the cards from the picker; each is documented in [the cards](cards.md).
