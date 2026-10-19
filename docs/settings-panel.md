# The settings panel

**Fluvy** in the sidebar, at `/fluvy`. Administrators see five tabs, in one row; everyone else sees Appearance (their own
palette) and Preferences.

| Tab | What it holds | Whose |
| --- | --- | --- |
| **Appearance** | palette (fifteen presets, the house's saved palettes, the community's, or a custom accent — shared as a file), shape (soft, round, crisp), button style, the dashboards' tabs (Fluvy, pills, original or hidden; names, icons or both; the dashboard's name), the sidebar and header (Home Assistant's logo, dividers, the header on the page); the lights, where a card says nothing, and the status colours (see below); a live preview on real cards (its little house answers a tap itself: nothing at home changes) | the house; a person may keep their own palette and shape |
| **Scope** | dashboards only or everywhere; which dashboards when "only"; the frame, the icons, the Activity page, the History page | the house |
| **Dashboards** | the five automatic dashboards: create any with one tap, open it, its options, its sidebar entry, recreate it | the house |
| **Wall** | what this device is (a wall panel, its address to open on the tablet), which dashboards are walls, the screensaver (with a preview of it), the way out (a × in the corner, or a long press), the way back from a subview (a button with its name, or Home Assistant's header), day and night, the background; the preview shows the wall as it would be now, in its night when it is night — see [wall mode](wall.md) | the house; *this device* is the tablet's own |
| **Preferences** | language of the cards (a dropdown: *Automatic* follows Home Assistant, or one of Fluvy's), motion, haptics, a link to improving a translation; *This device · Size*: how large this screen reads its dashboards (90 to 150 %, the view alone — see [wall mode](wall.md)); *Fluvy*: the version, the shell's health, export and import of the settings, the house's reset | each person; *this device* is the screen's own; import and reset are an administrator's |

## House and person

The **house settings** are what an administrator sets: everyone sees them. The **personal settings** are each person's,
on every device they sign in on: a palette, a shape and tabs of their own, or the house's; language; motion; haptics.
The look a person sees is the house's, with their own choices on top. A **device setting** belongs to one browser
alone — whether it is a wall panel, and the size it reads at — and never follows a person.

## Lights

Two of the house's settings (1.9) decide what a card of lights does where its own config says nothing. Both are off
until chosen, so a dashboard looks as it did:

| Setting | Values | What a card takes from it |
| --- | --- | --- |
| **Show their colour** | Never · When on · Always | a light card's `tint`: its light's colour on its whole surface, while the light is on, or at rest too |
| **In their bulb's colour** | off · on | `light_colors` on tiles, a tiles group, a room's tiles and rows, an entities card's rows: a lit colour bulb in its colour |

A change shows on every card of the page at once, before it is saved; a card that sets the key keeps its own. The
room lights card keeps its own default (its lights in their colours), and the automatic dashboards write neither.

## Status colours

Four of the house's settings (1.9) colour what a card says about the state of things, over every palette — a person's
own palette too:

| Status | What wears it |
| --- | --- |
| **Warning** | what wants a look: an open door or window, a low battery, a reminder due (an appliance's "Clean", "Refill"), an alert of severity warning, the warning tone a card or an item may be given |
| **Danger** | what is wrong now: a leak, smoke, a critical alert, the danger tone |
| **Success** | what is fine: an appliance ready, an eco programme, someone at home (the dot on their picture) |
| **Notice** | information: an alert of severity info |

Each is **Auto** — the palette's own, as before 1.9, so nothing changes on upgrade — or **Custom**: one of six colours
round the wheel (the orange is issue #47's), or any colour typed as a hex or picked from the system's picker. Fluvy
keeps the hue you picked and moves only its lightness — and the chroma the screen cannot show there — as far as it must
to read: the words in it at 4.5:1 on the card and the page, its icon at 3:1 on its circle, the words on its fill and
the fill's hairline as every status's. In light mode an orange like `#dc630b` (3.5:1 on white) becomes `#b04c00`
(5.4:1); in dark it is itself. From it come the status's whole family in both modes — its words, its icon, its fill,
the fill's edge and the ink on it — on every card and sheet, and in Home Assistant's own status colours
(`--warning-color`, `--error-color`, `--success-color` and their scales). Home Assistant's colour *names* (`orange`,
`red`, `green`) stay the palette's: a card asked for orange is still orange.

Where a picked colour sits too close to another status (warning, danger, success and notice stand 5.5 apart, CIEDE2000,
fill from fill and words from words, in light and in dark), Fluvy first takes more of its colour into its fill and
its words a step deeper; where that is not enough, the panel says so under it ("Close to Danger") and changes nothing
else — a hue is never turned aside. The settings are an administrator's (read-only for everyone else), shown on the
panel and the page at once, and saved from the bar ("Status colours · Warning · #dc630b").

## Where they are stored

In Home Assistant's own frontend data, not in a file of Fluvy's: the house under `frontend/set_system_data`
(key `fluvy`, writable by administrators), the person under `frontend/set_user_data` (key `fluvy`). Every browser
subscribes to both, so a palette changed on the desktop recolours the phone at once. What is stored is parsed and
never trusted: a value that does not make sense falls back to its default. A copy of the last applied look is kept in
the browser (`localStorage`, `fluvy:look`) only so that the page paints in the right colours before Home Assistant
answers.

## "Everywhere" and the theme

Home Assistant's own pages take Fluvy's design only while the theme Home Assistant wears for that person is **Fluvy**
— their profile's theme, or the house's default. With another theme, every Home Assistant page keeps that theme and the
look stays on Fluvy's dashboards, as with "only dashboards". The panel says so, and offers the Fluvy theme through the
profile's own theme picker; it never changes anyone's theme by itself.
