# Fluvy — visual language (Linen, v1 draft)

Single source of the rules every sheet is judged against. Numbers are CSS px. Everything sits on a 4 px grid at DPR 1/2/3
(`tools/render/measure.mjs` enforces it, plus control heights, icon boxes, touch targets, baselines, text-in-box, **containment** — no painted box outside its padded ancestor, no unpainted box outside its parent, nothing outside the frame — and **pill sides** — badge/chip width − text ∈ [28, 31]; independent review reports were kept for every round; the approved renders are in `design/approved/`).

## Quality bar (the quality checklist, 2026-09-18)

Every screen — our cards and every Home Assistant page under the theme — is judged against these before anything else. When one instance of a flaw is fixed, the same class is hunted everywhere.

1. **One scroll.** A page never scrolls inside a scrolling page. The frame declares its 16 px margins through HA's safe-area insets, so pages sized from the viewport fit it.
2. **Our forms.** Fields, pickers, menus, switches, checks, radios, sliders and code editors speak the cards' idiom (see Form controls); no Material underline, no square field, no system scrollbar inside menus and picker lists.
3. **Aligned text.** Readout rows centred; labels and values on shared baselines; nothing drifts to the left of its column.
4. **Uniform spacing.** One rhythm between siblings (4 px grid; 8 / 12 / 16 / 24 steps); no two fields touching, no uneven gaps in a stack.
5. **Chip rows fill.** A horizontal row of chips or options occupies its row — equal widths or distributed — and leaves no empty tail. (A scrolling strip that overflows on purpose, such as view tabs, is exempt.)
6. **Text stays inside.** Ellipsis for names, wrap for prose; values never ellipsise, never overflow or clip.
7. **Clean motion.** Short, purposeful transitions (transform and opacity only), no jank, nothing replayed on a view change.
8. **Pixel alignment.** Edges, centres and baselines line up to the pixel across a row and down a column.

Code follows the same bar: clean, ordered, reusable, one place per concern.

## Surfaces

| Surface | Size / geometry | Notes |
| --- | --- | --- |
| Card | radius 20, padding 20, content column 320 in a 360 card | hairline `inset 0 0 0 1px border`; no resting shadow |
| Compact card | padding 16, rounds 44 | mini media rows, compact climate row, counter row |
| Player card | 48 rounds throughout (transport and the head's round on the 80 art: power for a player that can be switched on or off, else "…") | the one card where the header round is 48, so it centres on the art on the grid; the head keeps one trailing round — two beside the art would leave a title 104 px in a phone's column — and the dialog stays a tap on the art or a still press on the head away |
| Tile | 172 × 168, padding 16, radius 16 | two per row: 172 + 16 + 172 on the phone (`.fv-grid2`), 152 + 8 + 152 on the desktop, 208 + 8 + 208 on the wall; the foot slot is 40: a 44 ruler hit band drawn 4 up, or two xs readouts |
| Tile · compact | 76 tall, padding 16, radius 16 — the scene tile's geometry: 44 icon, 12 gap, name 15/600 over state 13/500 (36 block centred on the icon) | the whole tile is the button — tap toggles what toggles (opens what does not), hold 500 ms opens the details; no switch: the tone fill says "on"; a small tile says "Unavailable" without the time |
| Tile · mini | 108 tall, padding 12, radius 16: 44 icon, 8 gap, name 13/600 over state 12/500, centred | same behaviour; three or four per row |
| Tiles group | `.fv-tiles`: compact or mini tiles 8 px apart, or large ones (icon circle + switch, ruler or readouts) at the section's gaps; 2 / 3 / 4 per row or `auto` (148 / 84 minimum) | one card, the Mushroom-style pairs and threes; grouped and lone tiles are the same tile. A compact tile under 128 gives its name the icon's room, so buttons people reach for on a phone are large |
| Sheet | 392 wide, padding 16, content 360, radius 24 top | grabber, title/sub + close or switch |
| Phone frame | 392, side padding 16, content 360 | status bar, hello, room chips, sections, bottom nav 60 |
| Unavailable | dashed 1 px outline, page fill, neutral ink | card, tile, stat tile, icon ring **and** badge all dashed; value "—", the word "Unavailable" stays — a compact row, which has no second line for the word, says it as its value ("Unavailable", "Unknown", "Not found"; the dash only where the word would not leave the name its room); an entity that is not there draws the `ban` glyph, never a kind's |

## Header pattern (every card except the weather hero)

44 icon circle (20 glyph) · title 16/600 · sub 13/500 secondary · trailing = **one** of: 28 badge (state, content-sized: 14 px sides, text + 28 → 4-grid, tabular numerals), 48×28 switch, 44 round ("…", map, add).
Sub = context or time (`Living room · 46 % RH`, `21:40 by Marta`). Badge = state, once. Never repeat the state in sub + badge + row.
In a narrow column the head is fitted by measure (`HeadFit`), and what gives way has an order: a badge (its state is in the body too), the sub's trailing segments, then the icon circle. **A control never gives way**: a switch stays at every width — two lamps on a phone's line (172 each) read "name · switch" over their ruler.

## Icon circles

- 44 with a 20 glyph everywhere; **hero 64 with a 32 glyph** only for the weather condition and confirm sheets.
- Glyphs live on the 24 grid with a 1.75 round stroke, ink 3..21 tall and centred on (12, 12) — a glyph that draws smaller (flame, moon) is re-centred with a `<g transform>` or redrawn to the set's height; the flame keeps its inner tongue ≥ 1 unit clear of the outer base.
- Fill semantics: filled pastel = on / active / alert. Off, idle, events (person detected, vehicle) and weather day rows are neutral.
- Dashed ring = unavailable.

## Controls (one idiom per job)

| Job | Idiom | Sizes |
| --- | --- | --- |
| Continuous value | ruler (lit from its origin — left, or bottom on a vertical — up to the knob; value-based ticks: minor 5 %, major 25 %; tile rulers 1/12 & 1/4, temperature tiles 1 °C / 5 °C; fine mode 1 % / 2 %) + knob | ruler 44 high (vertical: 44 wide, ticks and knob centred on the band's centre line); end ticks keep their full 2 px stroke |
| Knob | white disc, tone ring 2 px, centre dot, drop lift (falls on the halo), and a 4 px halo of the surface colour outside the ring (`--knob-halo`); a ruler tick that would meet the halo is omitted — ticks are whole or absent | **28 compact** (tiles, seek bar, small dial) · **36 standard** (card rulers, vertical ruler, large dial) |
| Read-only marker | the knob ring without the dot and without lift, same size as the knob | battery, vacuum battery, timer elapsed |
| Nudge | stepper pill 96 × 44 (− │ +) | on the value row; centred under a dial |
| Setpoint | dial: soft disc, tick ring, knob riding the ring, current-temperature dot, min/max labels, stepper below | `dial({ min, max, target | range, current })` — real units, never fractions; a range dial keeps the stepper and marks the selected knob with the focus halo (tap to select) |
| Toggle | 48 × 28 switch in a 56 × 44 hit | tile heads, rows, sheet heads |
| Modes | option tiles (84 tall, radius 12): a 20 outline glyph top-left, 12/500 label, 16/600 value; active = tone fill + dark ink, **no ring, no dots** | row fills the column exactly: 3 × 104 + 2 × 4 = 320; sheet 3 × 112 + 2 × 12 = 360; desktop 3 × 96 + 2 × 12 = 312; every row is full — a shorter last row splits the column among its own tiles (5 modes: 3 + 2 wider, `optionGrid`) |
| Stats | the option anatomy, read-only (`tiles()`), 2 × 156 + 8; **compact** (1.5): 64 tall (12 · label 16 · 4 · value 20 · 12), no glyph row, three a row in the mode row's rhythm (3 × 104 + 2 × 4) while the widest label and value fit a cell (`optionColumnsFor`, measured), four as two by two, else two, one a row where not even two cells hold a value — a value never wraps; `columns: auto \| 2 \| 3` | capacity, sub-values of a card |
| Gauge | the dial's tick ring without the disc; uppercase label above the value in the open centre; MIN / MAX / AVG readouts below | solar power, any read-only 0–max |
| Bar row | 76 tall: circle on the title/sub pair, value at the right, a 4 px bar from x 76 to the content edge under the text; a `plain` row is the 60 list row; **compact** (1.5): 48 tall, the 40 circle on the row (4..44), the name and the value on one line (12..32, baselines paired as the one-line rows'), the bar at 36..40 from the text column (52) to the content edge; a plain row the 48 compact list row. **Rows squeezed under what holds a name** (the words' column beside the value under 96, or under the name itself — measured, as the head is): the rows give their circles to the names, every row of the list with them, the bar and the hairline starting the row; a name that still does not fit ends in an ellipsis, as names may, never before it has begun | strings, plants, meters |
| Distribution | one stacked 12 px bar (2 px gaps) + legend rows 36 with 12 × 12 square swatches | what is drawing now |
| Filters / presets | chips: 36 pill in a 44 hit, text only, **content-sized**: 14 px sides → width = laid-out text + 28 rounded up to 4 (a post-render `fit()` pass measures the text in layout; the sheets render only once Inter is in use); same label → same width everywhere | gap 8; **a chip row fills its row** (revised 2026-09-18, quality bar #5): equal cells in as many rows as the labels need (`chipColumns`: four short words on one line, four long ones as 2 × 2, a shorter last row split among its own chips — never a label cut to make a row); content-sized chips only on request (`*_style: chips`); tab rows (phone rooms, view tabs) use the 14 px face with 16 px sides (text + 32 → 4-grid), ink-filled active, and fill their line when they fit (they scroll — finger, trackpad, wheel or mouse drag — when they do not) |
| Commands | 44 rounds, one filled primary, quiet siblings, 8 gaps, left-aligned row | vacuum, blinds open/stop/close, timer |
| Transport | five equal rounds, `space-between` (5 × 48 in 320, 5 × 56 in 360 → 20 gaps) | shuffle · prev · play/pause · next · repeat |
| Buttons | `.fv-btn` 48 high, radius 12: quiet (page), accent, link (page + accent text) | paired actions always share one width (172/172 in a sheet; keypad pair 124/124); single actions are content-sized (text + 32) |
| Button family | one sheet (`fluvy/buttons.css`): **round** `.fv-round` 44 circle, 20 glyph — quiet, accent, **on-page** (the card's fill and hairline, for a button on the page's ground; the strong hairline on hover), **bare** (no fill, the colour of its words; a 6 % wash on hover); **action** `.fv-action` (a command row's cell); **button** `.fv-btn` (above) and its **pill** (44, the pill radius, 14/600, width = its measured words); **link** `.fv-link` (13/600 accent text, its 44 target reaching 14 past the words so they end on the column) | **switched on** (`is-on`): in a card the round's glyph takes the accent (shuffle, repeat); on the page's ground the button takes the accent's fill, as an active chip (sources narrowing, Today from another day). One disabled look (40 %, no pointer) and one press (0.94) for every button, from the interaction layer; no card declares its own button |
| Keys | 72 × 56, radius 12, page fill; backspace = quiet key with a glyph | keypad 3 × 72 + 2 × 24 |
| Slide to unlock | 44 pill track, knob at the true start (no halo: nothing to cut), destination ring (the knob's 36 + 2 px geometry in text-secondary ink) with the unlock glyph at the right, hint centred | no ticks — it is not a dimmer |
| Text field | `.fv-field` (one sheet, `fluvy/fields.css`): 44, radius 12, 16 sides, page fill and a hairline (the strong hairline on hover), as Home Assistant's own fields wear the theme; glyph 20 in the secondary ink, 12 from the words (a leading glyph 2 px out, a trailing one 3 px out: optical); a trailing clear button is a 36 bare round 4 from the edge; words 15/500 (16 under a finger: iOS zooms into less), the placeholder 400 in the secondary ink | **on-page** takes the card's fill; focus = the 2 px accent ring inside; a value refused on leaving keeps a danger hairline, one refused while typed turns the words to the warning. The helpers' text, the to-do composer, Activity's search, the panel's hex and the time field are all this field |
| Dropdown | `<fluvy-select>` (`fluvy/menus.css`): the text field as a button — the chosen label 15/500, a 20 chevron in the secondary ink that turns over while open, the 2 px accent ring while open or focused; its menu in the browser's top layer (a popover, over Home Assistant's sidebar and dialogs; the same box fixed under the field where a WebView has no top layer): 4 under the field and as wide as it (192 at least, the window less 32 at most), padding 4, radius 16 on the card's fill with the hairline and the lift, 44 rows at radius 12 (concentric), the name 15/500 and its hint 13/500 in the secondary ink at the end (the hint leaves under 280: a name reads whole, a hint is never cut), the row under the pointer or the keys on the page fill, the chosen one an active tile (accent fill, its hairline, a check); 8 + 44 × n tall (every row up to nine; from ten, eight and a half, so the cut row says there is more), over the field when there is more room above than below, only as tall as that side allows (the rest scrolls, no bar); unfolds from its field's edge in 200 ms (opacity, a 0.98 scale and 4 px of travel, no overshoot), leaves in a 120 ms fade — a surface that shrinks as it goes reads as flinching — and follows its field while open (a card still animating in) | opens on a tap, ↓ ↑ Enter Space Home End or a letter; ↓ ↑ never wrap and skip what cannot be chosen, PageUp / PageDown move five, letters find the next name (no diacritics needed, a repeated letter cycles), Tab chooses and moves on, Escape closes with nothing changed and never reaches the page; a tap outside, a scroll or a resize close it; choosing ticks the haptics once. The Preferences tab's language |
| Calendar | one component (`monthGrid()` in `cards/shared/days.ts`, `fluvy/days.css`): the weekday row (11/600, tracked, secondary, 8 over the days) over seven columns (the owner's tracks), each day a 44 target — its number 15/500 in tabular figures, weekends in the secondary ink, a 4 px dot for events — whose plate (radius 12) carries its state; the arrows walk the one tab stop (a day, a week; Home / End the week's ends; Page Up / Down a month), turning the month when it leaves it; a new month slides in from its side | **one day** (the calendar card's month and week): the chosen day on the primary fill, today on the palette's mark or, while another day is chosen, the accent's pastel. **A period** (Activity's dates): the chosen days one band on the accent's fill, its ends on the primary, today in the accent with a dot. Hover lays the page's fill on the plate (in a period, an end's plate), focus rings the day inside |
| Artwork | `.fv-art`: the plate a player's picture sits on — the accent's gradient (a solid palette's primary) under a highlight, radius 12 (the hero's 20, lifted), the glyph centred in the plate's ink; the picture fades in over it and the 8 % hairline is drawn again on top; nothing playing, the plate goes neutral (page fill, hairline) | the player (80, 44, the hero's 200) and the home's now playing (64) |
| Empty state | a 44 ring on the card fill with a 20 glyph, over one 14/500 secondary line, centred in a 120 panel (page fill inside a card, page-alt on the page) | `emptyState(glyph, text)`; HA's empty lists and drawers take the same idiom through the shell |
| Words as a value | a state written in words ("Grid-Connected, normally", "Niet gedetecteerd") sits at the right edge: one 16/20 line where it fits beside the name, else two 14/18 lines; the name gives way first (its floor leaves the longest word its line, 40 % of the row at least), and prose is clamped at three lines (1.6) | figures stay one line |

Rectangular tappables share **one radius: 12** (option tiles, buttons, keys, fields, toast actions); cards 20, tiles 16, sheets 24, device frames 24, the phone 40. Art thumbnails ≤ 80 are 12, the 200 hero 20. A scene tile on the page is a tile (76 / 16, hairline); inside a card it is an inner tile (84 / 12, page fill, no hairline). Active inner tiles are fill only (no hairline), like option tiles.

- Calendar month + day: the month grid on top, a day label ("Thursday 17 · 4 events") and that day's event rows underneath — the week card's idiom, a month tall; selecting a day swaps the list.
- **Shell (2026-09-18, the sheet's chrome):** the theme colours the sidebar and the header; the rest is the module's shell layer, only while the Fluvy theme is the page's theme and removed when it is not. Public properties: `font-family: var(--ha-font-family-body)` on `body` (Home Assistant's template hard-codes Roboto there), `--ha-border-radius-sm: 12px` on `ha-sidebar`. Three adopted stylesheets (never touching elements): the sidebar — our glyphs as masks on the built-in panels (home, energy → bolt, map, logbook → list, history → clock, media → speaker, to-do → check, settings → sliders; custom panels keep theirs), the selected pill in the accent fill, labels 14/500, title 600; the drawer — no hairline between sidebar and content; the app root on ≥ 1024 px — a rounded panel (radius 24, 16 px inset, page-alt behind, hairline around) that contains the header and the drawer. Phones and tablets under 1024 stay full-bleed. `fluvy:` sidebar icons that failed before the module loaded are re-asked. The set's outlines are scaled 10/9 (ink 2..22) to sit beside Material icons at 24.
- **Shell, beyond the sidebar (2026-09-18 night):** the notifications drawer takes a white header without hairline, its title 20/600, the list 16 px in, and the empty state as the cards draw it (a 44 ring on the card fill with the check glyph, one 14/500 secondary line, in a 16-radius page-alt panel, the language's one empty state); notification cards get a 16/600 head and a 14/20 body. The settings lists' icon badges are our icon circle (accent on the accent fill) instead of the frontend's brand colours. Rule for every further page: the theme first (colours, radii, the body font), an adopted sheet only for what the theme cannot reach, always our existing idioms (icon circle, empty state, card head), never new ones.
- **Scrolling in the frame (revised 2026-09-18):** the app keeps the whole window and scrolls as Home Assistant designed it (the window for dashboards, inner lists for tables, logbook and history); the frame is declared as 16 px safe-area insets on `home-assistant-main`, so the header, sidebar, content, floating buttons and every viewport-sized page step inside by themselves, and a fixed, click-through layer paints the page around a 24-radius opening with a hairline. One scroll per page, nothing clipped; the page scrollbar is thin and in the theme's thumb colour. The dashboard's chrome (greeting, tabs, readouts strip) never plays the entrance (`still`), so the same header reads as fixed while the views change under it.
- **Form controls (HA's own, in Settings, editors and dialogs; 2026-09-18):** every control speaks the cards' idiom. Fields (`ha-input`, `ha-textarea`, `ha-picker-field` — also the face of `ha-select` — and the older composite pickers: labels, entity name, state content, clock format, the time row) are a 12-radius box on the **page fill** with a hairline, the strong hairline on hover, a 2 px accent ring on focus, no Material underline. Menus (`ha-dropdown`, what a select opens) take the sheets' 16 radius and lift, 44 rows at radius 10 in a 6 px inset, page fill on hover/focus, the chosen row as an active tile (accent fill, dark ink). Switches are the cards' 48 × 28 switch (20 thumb; off = page fill in a strong hairline with a card-white thumb, dark = lifted track with the secondary ink as thumb; on = solid accent, card thumb). A checked box or radio is the solid accent with the on-accent mark (radius 6 boxes, 1.5 px rings). Sliders carry the cards' knob (card-white 20 thumb, 2 px accent ring, lift) on a 6 px track. The code editor is a field with a hairline gutter. Buttons use the one tappable radius (12); card headers are 20/600. Where HA exposes a variable the **theme** sets it (switch, checkbox, radio, slider track, button radius, card header size, `--input-*`, disabled fills/inks); the rest are sheets in the component classes' Lit `elementStyles`, emptied when the Fluvy theme is not the page's theme.
- **Forms, second pass (2026-09-19, three explorations of System, editors and dialogs on a live instance — entities, profile, card editors):** a dialog's footer sits on the body's 24 column, 24 under the content, its buttons 48 tall, 8 apart and 112 wide when paired; every creation form (helpers, labels, tags, people, areas, floors) keeps one 16 rhythm (a required field no longer touches the next); a field's hint starts on its text's 16 column; a raised label is 11/500 with the value 16 under it, as the selects'; list rows are the cards' 20 + 16 lines (60 for two); radio options keep no margin of their own (a 44 pitch, a row of them 16 apart, the circle on its label's column); a short choice drawn as a row of radios (Network's Automatic · Static · Disabled) is a row of option tiles; side-by-side form cells line up on their boxes' bottoms, and a picker's label above its box is the fields' 13/500; the card editor's fields, preview and footer share one 24 column; the entities' own toggles are the 48 × 28 switch; code editors run on 20 px lines. A modal drawer (notifications) opens inside the floating frame, in its shape: 16 from the window, the frame's corners on its side, its hairline.
- **Home Assistant's theme is the person's (2026-09-19):** "Everywhere" reaches Home Assistant's pages only while the theme Home Assistant wears for that person is Fluvy (their profile's, or the house's default). Another theme keeps every Home Assistant page (no look, no shell: frame, icons, forms), and the look stays on Fluvy's dashboards as with "only dashboards"; the panel says so and offers the Fluvy theme through the profile's own picker event.
- **Quick search and pickers:** section chips on the page fill without separators (in the quick bar, five equal whole-pixel cells from 601), section titles as the cards' labels (11/600 caps, no grey band), rows of two lines at 60 (14/20 over 13/16), every glyph in our 40 icon circle on the accent fill instead of Home Assistant's brand colours, the tip 13/500 with its link in the accent.
- **Home Assistant's own Material icons (2026-09-19):** the chrome's icons (`ha-svg-icon`, told only a path: undo, redo, help, the ⋮ menu and its items, pencils, close, back arrows, search, copy, delete…) are drawn as our glyphs while the shell is on and the house keeps our icons: a table of 32-bit keys of the Material paths (`tools/icons/mdi-glyphs.json` → `packages/core/src/icons/mdi.ts`, `@mdi/js` pinned to Home Assistant's 7.4.47, only for the generator) tells which glyph replaces each; the Material path is kept on the element and comes back when the icons are switched off or another theme is worn.
- **A dashboard in edit mode:** the edit bar keeps its accent fill, everything on it in the bar's ink; Done is the primary action (36, the tappable radius, never shrunk); the open view is a tile on the card fill holding its arrows and pencil (no underline); frames of what can be edited are a fine dashed hairline; what adds (a title, a badge, a card, a section) is a fine dashed accent outline filling with the accent's wash; what edits is a quiet control on the card fill with a hairline.
- **All of Home Assistant under the theme (exploration of 2026-09-18):** the theme maps HA's whole colour system, not only the accent — the named palette (`--amber-color`… 21 names, which every per-domain state colour, timeline, logbook dot and 2026 summary resolves through), the success / warning / danger scales (`--ha-color-green|orange|red-05…95` from our status inks), off as the quiet strong hairline, weather glyphs, outlines, the edit-mode header (the accent fill), the code editor's syntax (keys accent, values ink, figures info, punctuation disabled). Type: HA's "bold" is our 600, font sizes keep `--ha-font-size-scale`, the old Material components get Inter without tracking (`--mdc-typography-*` from the shell's page sheet, not the theme: 2026.10 retires those names), HA tiles take the compact tile's 15/600 over 13/500. The shell registry then gives every HA component class its idiom: data tables (14/20 cells, 13/600 secondary headers, 36 toolbar controls), search boxes (card-white 12-radius field), menus, tabs on whole pixels, dialog titles 600 with an ellipsis, alerts as status panels (role fill, radius 12), option boxes as tiles, button toggle groups as a segmented track, section and card titles 20/600, card actions on the content column, empty states, Leaflet controls, logbooks that open instead of scrolling inside a scrolling surface, the automation editor (headings, rows, side panel, targets), and the charts' canvas font (the one wrapped builder). a shell health check (see `docs/shell.md`) lists which sheets HA still draws after an update.
- **All of Home Assistant, second round (2026-09-18, night):** Inter is registered at start on every page (not when the first card appears) and inside every same-origin panel frame (HACS), which gets a shell of its own. HA's charts draw the canvas in the body font and a series HA paints in its own default primary in the page's primary. The empty-state idiom reaches HA through one shell helper (tables, "No activity found", the area page's lists, the To-do panel, the notifications drawer). A card head that carries icon buttons (the Activity card, the log cards) keeps the standard head line (12 · 34 · 16) and hangs the 48 buttons over it. Option choices in HA become our option tiles with their glyph (the profile's Auto · Light · Dark), view switches our segmented track (Daily / Hourly), paired footer actions one width (112). A required field without a hint keeps no empty row; HA's 10 px step is the 11 px floor. Page titles are 600 everywhere, inactive tabs take the secondary ink, and a tab strip keeps a fixed trailing slot so it never moves between sibling pages.
- **Automatic dashboard:** `strategy: { type: custom:fluvy-home }` builds Home, Lights, Climate, Energy and Sensors from the registries and the energy preferences with the approved `/fluvy-home` layout: lights = `light.*` plus switches whose words say light, appliances = the other switches (one per device, twin outlets dropped) with their power and energy readings, climate = thermostats + weather + temperature/humidity sensors that are not the weather service's, energy = solar/grid/battery power by words + the energy dashboard's devices, sensors = device batteries, phones (mobile_app), people, openings, plants, updates. Names: the entity's own words, the device's name when the own words only say the kind, the area or the device for a reading's place. Capped lists, empty sections and views left out, titles in the dashboard's language, `hide: [energy]` to drop a view.
- **Loading:** a Lovelace resource runs only once a dashboard has rendered; the shell reaches every page (Settings opened cold, History, Map) because the integration also loads the module at start on every page (`add_extra_js_url`, the loader beside the build under `/fluvy-frontend/<version>-<build>/`), and registers the settings panel with that same loader; a build's URL never changes, so no cache serves a stale one.
- **Icon set:** the glyphs (125) are a Home Assistant icon set, `fluvy:<name>` (kebab-case of the glyph key: `cloud-sun`), registered through `window.customIcons`; the paths are the strokes outlined to fills at build time (`tools/icons/outline.py`, shapely, 0.06 simplification) on the same 24 grid, written as an absolute start and relative steps in tenths (SVG's shortest numbers: 17 KB gzip for the set instead of 27). Inside our cards a `fluvy:` reference draws the stroke glyph inline; elsewhere `<ha-icon>` draws the fill. Our dashboards use `fluvy:` icons in the sidebar; built-in panels keep MDI.
- **Heading icon:** an optional icon before the section title — a 20 px glyph in a 24 box in the accent ink, 8 px before the 20/24 title, on its cap height; the title ellipsises before the meta gives way. It replaces emoji in titles.
- **Section heading rhythm:** a heading below other cards of its section opens a new group — 24 under the previous cards (the grid's 16 + 8), 16 above its own; a heading that opens a section keeps the column's top line, so columns still start level.
- **Columns end on one line (generated views):** the automatic dashboard cuts its blocks — a heading with its first row, a pair of tiles, a card — into the three columns every possible way in reading order and keeps the cut whose feet are closest (heights measured from the real cards, the first column carrying the greeting and the tabs); single-purpose cards (media, vacuum, to-do) then fill the shortest feet. Tiles go two a row; an odd one out closes its group as a compact tile across the column, so no row is half empty.
- **Tiles squeezed narrow (2026-09-19):** a large tile whose inner width cannot hold its icon circle, 8 and the switch (under 132 px) folds the switch into the circle (the circle becomes the switch, as Home Assistant's own tile's icon is); a sensor's value that would not fit beside the circle goes to the state line; a foot keeps one readout under 120 px of inner width and the ruler is drawn to the inner width. A group of tiles lays out fewer columns when its width cannot hold the ones asked (large 100, compact 128, mini 64 at least); a lone compact tile under 128 gives its name the circle's room, a mini tile under 60 draws a 36 circle. A thermostat's "Target · Now 20.8°" label keeps one line: the "· now" part goes when it would not fit beside the stepper.
- **Names that must read:** two compact tiles side by side under 200 px step the name to 14 px; a large tile's name that would end in an ellipsis steps to 14 px, and a large tile with nothing under its state line lets the name take two balanced lines; a scenes card goes one tile a row when a name would not read in two lines of a half tile; a pill sized to its text is padded on both sides from the measured text, so its label never ends in an ellipsis; in a list row a state in words wraps between its words once the name is down to its third, figures never wrap.
- **Customisation principle (user, 2026-09-18):** every card exposes what to show (section toggles such as `show_fan`), which items appear and in which order (subset lists such as `modes: [off, heat, cool]`), and at least two more layouts through `variant`. Chip rows fill the row by default and are content-sized on request (`preset_style`, `fan_style`, `suction_style: chips`). Editors show what the card does by default (`formEditor` / `listsEditor` with defaults): the dial, the mode tiles, every mode the device offers; a default the user leaves as it was is never written into the config. The thermostat is the reference: `variant: dial | compact | ruler`, `modes`, `modes_style: tiles | chips | full`, `preset_style`, `fan_style`.
- **When off (1.7):** a device card can keep to the essentials while the device is off (`when_off: essentials`; the default `all` shows everything): the head, the state (dial, readout or ruler, dimmed as today) and what wakes it — the mode tiles on the thermostat, the switch and the speed ruler on the fan. What hides is what has no use off: the thermostat's presets and fan speeds, the fan's presets, oscillation and direction. "Off" is the card's own (`stateOf()` / `expect()`), so a mode or the switch tapped brings everything back in the same render, before Home Assistant answers, and below the tile under the finger — nothing moves under it; Home Assistant resizes as for any `rows: 'auto'`. Covers (tilt, favourites) and media (sources, volume) keep everything: those are how they wake. The water heater and the humidifier only have modes: nothing hides. `layoutHeight` stays the on height (the automatic dashboard reserves it).
- Energy: see § Energy (1.4) below — the flow, its motion and the companion cards.
- Charts are scrubbable: a mouse over a curve or a bar strip reads the value under it (a finger while pressing; a vertical swipe still scrolls) — the dot, the dashed cursor and the bubble follow, the bubble adds the time ("3.1 kW · 10:15"), the card's big readout shows the scrubbed figure with the time as its label; on leaving, everything returns to now.
- The colour-temperature ruler tints its ticks with a faint warm → cool gradient (amber → cool grey-blue, opacity 0.85) and the knob's dot takes the colour under it; the ring keeps the tone. `temperature_tint: false` gives the neutral ticks of the brightness ruler.
- A row that grows (a wrapped sub, a multi-line to-do) keeps its icon, check and chevron centred on the whole text block (`align-items: center`, never `flex-start` with padding); a control beside a large figure (stepper, play/pause) sits on the figure's 44 line box (`align-items: flex-end` on the row), which centres it on the figure's ink. A row value never wraps; the sub gives way (ellipsis).
- Readout rows in equal columns (legends, totals, min/max/average, the stats strip) are **always centred in their columns**, whatever sits above them — a chart, a gauge, a list — so the row reads as one evenly distributed set (rule of 2026-09-18, replacing the earlier left-aligned-under-a-chart exception). A readout row under a left-aligned title (a tile foot, a meter beside bars) is not a column set and stays left.
- Command rows (cover open/stop/close, vacuum pause/stop/dock/locate) are **action rows**: glyph buttons in equal cells that fill the content column — 2 × 152, 3 × 96, 4 × 68 with a 16 gap — 44 tall, radius 12, page fill, the primary one accent. Never a left-hugging strip of circles. Centred media transports stay round.
- Switch off in dark: track `border-strong` (a clear step above the card), thumb `text-secondary`; on = tone track with the dark thumb. Light keeps the page-alt track, hairline and white thumb.
- Trailing chevrons: glyph right-aligned in its 44 box with a −8 optical margin so the ink sits on the column edge (section meta: −5).
- **Media power and compact controls (1.5):** a player that can be switched on or off carries a power round — the player head's trailing round, the hero's corner (48, on the art's top line and the content's edge; the art gives the corner its 12 px), the mini row and the now-playing strip when `controls` names it. Off, it is the one clear thing to do: "Turn on" in the primary fill, and no dead transport under it (the play round waits for the player to be on). `controls` is an ordered subset of `power · previous · play · next · volume`, each only when the player can take it, drawn in the named order; a row that cannot hold them all lets them give way in an order of need — next, previous, volume, then power; play never, it is the control — as a head's lines do. The mini row holds as many as fit beside a title of 96 (three at a phone's column), its volume round muting where the player can and opening the dialog where it cannot; a column that cannot hold one round beside the art lets the art go first (the compact tile's rule) and keeps one round, the words then being the row's tap. The strip centres the transport, keeps power on its left edge and volume on its right, draws power and volume alone on a player that is off (no dead transport, as the card), and a half column spreads 44 rounds.

## Clocks and calendar

- Analog face = the ruler's ticks bent into a circle: majors R/10 in ink, minors R/20 in border-strong (majors only at R 56); hour hand 0.52 R inside the numerals, minute 0.85 R and second 0.88 R over the numerals to the tick ring, widths 6/4/2 (R ≥ 96) · 5/3/2 (72) · 4/3/2 (56), round caps; only the second hand carries a counterweight (cap radius + 8); the cap is the Fluvy knob without halo or lift, 28 / 20 / 16. Numerals 14/600 secondary at 0.75 R (12/600 at R 56). Plain clocks are accent; a weather clock takes the sky's tone (accent at night, solar by day). Digital time 64/72 at −0.03 em, tabular, ink pulled onto the column (−0.06 em, declared `data-align="optical"`); seconds or AM/PM as a 24 unit on the baseline; date 14/500 secondary — the full date in a 320 column, "Thu 17 Sep" in narrow columns and tiles.
- Calendar: one table of events drives every view. Event rows 60 (time 40 right-aligned + 4 px tone bar 44 + title/sub, past rows quiet); month cells 44 radius 12 on a 46 pitch (today = accent fill, weekends secondary, one 4 px dot per day with events); week columns 44 × 72 with the same one-dot rule; timeline 24 px per hour, true block heights (12 minimum), pastel blocks with dark ink and a 4 px tone bar, a 2 px accent now-line on the true minute; a block never shows more time than the event has. Calendars never use the accent (accent = today, selection, now, the primary action). A trailing slot may hold a 44 + 8 + 44 command pair.

## Room

- The area card of the ambient sheet, as a card: a **160 hero** bleeding to the card's edges (the room's photo,
  cross-faded in once decoded, under a scrim `rgb(0 0 0 / 0.28) → transparent 55 %` from the foot; without a photo,
  the accent's gradient 90 → 70 → 60), the **name pill** at 20 / 16 from the hero's corner (36 tall, card fill, 15/600,
  a 20 glyph in the accent, 12 before the glyph and 16 after the text, sized to its words on the 4 grid), then **three
  readouts** 20 under the hero in equal columns (m → s → xs by measure), then the room's controls: **category rows**
  (Lights, Climate, Media, All devices — 60, chevron, the hairline from the text's left edge) or **inner tiles** two a
  row. The hero and the rows open the room's page (`path`), or the area's settings for an administrator; nowhere to
  go, no chevron.
- **Inner tile** = a compact tile inside a card: 84 tall, radius 12, page fill, no hairline; on = the tone's fill
  alone with the tone's ink and a card-fill circle; off = a card-fill circle with the text ink (a pastel circle on
  the page ground would read as lit). Two a row, 8 apart; a name steps to 14 under 200 and may end in an ellipsis
  (long names belong to `controls: rows`).
- Compact surfaces write degrees without the unit — "4 of 10 on · 21.4°", "Idle · 22.8°" — the readouts keep "°C".
- **Weather · compact (1.5):** the hero folds into one head row — the 44 condition circle, the name (an ellipsis as names may), "condition · high / low · feels · wind" as the sub, fitted by `HeadFit` (the optional segments leave from the end, then the circle gives way: the words say the condition), the temperature at the end as the compact family writes it ("18.0°", 16/600) — over the hour strip and the days ahead as the strip's 64 columns (the weekday, the day's glyph, the high and its low in the secondary ink), as many as the width holds — fewer while the widest pair would not keep 4 px clear in its cell, `days` the most — starting after today, which the head already says.
- The **tile** variant is a head (44 icon circle, the name, the count and the climate as its sub, "opens" as the
  bare 44 chevron with its ink on the column edge) over the inner tiles; the **row** variant is the compact tile
  itself (76), two a row on the automatic dashboards.
- Compact tiles measure their container's content box: the name steps to 14 under 168 inside (200 outside), the
  icon leaves under 96 inside (128 outside).

## Map

- The head is about the people (a person glyph in the leading circle); the map is what the trailing round does
  (`/map`). The sub counts who is home.
- **Zones as columns** of whole pixels computed from the content width (320: 4 × 80 with no gap, 3 × 104 with 4
  between, 2 × 160): a 44 icon circle (home = presence tone, a zone = its own icon or the pin, away = the walking
  figure, unknown = a person outline in the dashed off ring), 12, an 11/600 uppercase label, 12, a stack of faces 44
  high. Two faces at most, overlapping by 8 with the card's 2 px ring, initials 13/600; three or more fold to one
  face and a "+N" disc of the same size (page fill, 13/600 secondary). No presence dots in a stack (the column says
  where) and no count row (the fold's number and the sub carry it). Card 228.
- **Rows**: one a person — the 44 avatar with its presence dot, the name, where they are as the value ("Home",
  the zone's name, "Away · 26 km" only when distance is asked for and the fix is good, "Unknown").
- The **map** variant is Home Assistant's own map card on a plate (16 radius, 1.6:1 or square); it falls back to the
  columns in silence where the card helpers are missing.

## Several sensors (1.6)

- **The card**: up to three sensors on one card (a room's temperature and humidity). The head is the set's: the
  room's name, the trend glyph in the accent, the window.
- **The readouts**: one per sensor in equal columns, 32 apart with a 36 hairline in the middle of the gap, each centred
  in its column (its circle and its words as one, the words left inside). Each is the sensor's circle in its measure's
  tone, then its name (what it says beyond the head: "Temperature" under "Living room") over its value, at the medium
  readout where every value fits.
- **What gives way**, checked on every name at every step: the circles go before a name would end in an ellipsis; a
  readout without its circle carries its curve's key beside its name (a 12 × 2 line in the curve's ink, 8 after the
  name; none where no curve is drawn). Then the gap closes to 16. Then one line a readout: the name and its key at the
  start, the value at the end on the name's baseline, a hairline across between them. A name that still does not fit
  ends in an ellipsis before its key: the name gives way, its key never does (the key is its own part, never inside
  the name's box). A value never shrinks past the extra-small size, and never wraps.
- **The chart**: one curve per sensor, each on its own scale (the units differ, so a line is read against its own
  readout), in its measure's tone. Fills are lighter (16 %) so no curve hides another. A tone that would repeat
  passes to the next spare one.
- **Scrubbing**: every readout says that moment, written at its reading's precision while it stays in the reading's
  unit (the figure never grows under the finger; a moment in a larger unit, 1.23 kW under 505 W, keeps its own). When
  is a pill in the bubble's colours (the text's ink, the page's words) on the axis row, which is 20 tall for it, the
  hours centred in it; kept inside the axis's width, under the cursor, while the hours give way. Past 24 h it says the
  weekday too ("Tue 09:47"), as the single chart's bubble does. No bubble over the plot, so the scale's top is 12 below
  the chart's (the ink from 17.5). The cursor runs from the highest dot down, under the dots, and sits under the
  finger: the scrubbed box is the drawn width. The statistics are one sensor's, so they stay out.
- **The hours under a chart** (one sensor or several): the clock times at the window's quarters ending in "Now", as
  many as keep 12 between every two, measured in their language — five, else three, else the two ends; a window of
  days says its days ago at its start and middle, three, else the two ends.

## Camera (1.6)

- **The picture**: stills that refresh themselves (as quick as half a second), or Home Assistant's own stream
  (`camera_view: live`: its player, WebRTC, HLS or MJPEG as the camera offers). The stream is one element for the
  card's life: it plays while the card is on screen and for 45 s off it (a scroll past the card is not a reason to end
  a camera's session and open another: some cameras go away under that, issue #28), a hidden tab is left to Home
  Assistant's players, and it goes for good with the card or when the card changes its camera or goes back to stills.
  Where Home Assistant gives no player, or the player gives up, the card falls back to stills and asks again a minute
  later, then less often. In full screen the stream shows the whole picture.
- **The shape**: 16:9 by default, or 4:3, 3:2, 1:1, 2:1, 21:9, or the camera's own (read off its first frame). Its
  height lands on the 4 grid.
- **The fit**: the plate fills its shape (`cover`, cropping what overflows), or shows the whole picture
  (`contain`) on the screen's dark, as a player's bands are.
- **Sharpness**: a still is asked at the plate's width in device pixels (sharp, and no heavier than it needs to be).
  Frames under a second apart cut, as a video does: a fade would never finish.
- **While streaming**: no time pill. "Live" stays.
- **A low picture**: under 108 the time pill goes (the rounds would sit on it); "Live" at the top start and the rounds
  at the bottom end never share a column. The plate never goes under 68 (the rounds, 12 above and below).
- **The camera's own shape** is remembered once read, so the plate is laid out in it before the first frame, and
  checked against the first frame: a camera that changed its shape (another profile, turned upright) is taken and
  remembered anew, one reflow.
- **Over a contained picture's bands** (and full screen's) a pill keeps its shape with a light hairline round its wash.
- **Full screen** has the room a low plate lacks: its clock and its snapshot round are back, and its round says how
  to leave it (the close glyph, "Exit full screen").
- **"Live"** is as wide as its word in every language, never under 64, on one line, on the 4 grid.
- **A narrow plate gives way in order**: on a low plate (the rounds share its rows) the snapshot round goes before it
  would come within 8 of "Live"; then "Live" folds to its dot; on a taller plate the clock goes before it would come
  within 8 of "Live".
- **The rounds over the picture** are a light glass with a fixed dark glyph, alike in light and dark; a pointer's hover
  makes the glass a touch whiter, never the glyph.
- **The live dot** is one vivid red (#f0453a) in both modes, ringed in white at 55 %, so it reads on any picture and
  alone, folded. Full screen never folds it: the word is back with the room. A stale "Live" (no frame for a while)
  fades and is hidden from readers too.
- **The rows under the picture** (and the lock's and the alarm's) give their circles together where a name would get
  less than its 96 beside what ends its row — the value's words, a switch's 56, a chevron's 44; an age takes its short
  form ("21 d", "3 h", "12 min") where any row's full words would not fit, every age of the list alike. A row that
  cannot be read says its state's word, never an age — where the word would be cut, its dashed skin says it alone and
  the word is the row's label.

## Greeting (1.6)

- **It gives way in tiers, never cut**: 28 with the name; 22 where the name is long; the greeting alone (the avatar
  says who), at 28 again where it fits; at 22; and last, where even that would be cut (a phone's column at the largest
  sizes), the language's short hello ("Hello", "Hallo", "Ciao"). The date and the weather give way under it as before.
- **Whose greeting**: without a `person`, the signed-in user's person (name, picture, more-info); a `person` pins one.

## Dashboards (the panel's tab)

- Five templates as rows in one card: a created one is a row that opens (accent circle, its url as the sub, the bare
  chevron); a missing one carries its description as the sub and a small quiet button at its end ("Create", 36 tall,
  radius 12) — the row is the tap target, the button says what the tap does; while it is being made the sub says so
  and the row takes no second tap. Then one card of options per dashboard the house has, headed by the dashboard's
  own name: its views as rows (the first "Always", the others switches), each choice as a full chip row, the wall's
  rooms as chips that toggle, then the sidebar switch and *Recreate* in two taps (the armed row in the warning tone,
  "Cancels in 4 seconds"). The preview draws the template touched last.

## View tabs (1.5, the dashboard header's)

- Home Assistant's own tabs (`hui-root`'s `ha-tab-group`), restyled by marks on the root, never replaced: a tab is
  still Home Assistant's element, its tap and its keyboard are Home Assistant's.
- **Fluvy** (default): the dashboard's name first (20/600, −0.01em, 24 line; 12 after the bar's 12 padding — on the
  view's column, 24 in — and 12 before the tabs; it never shrinks for them, a long one ends in an ellipsis at 40 %), then the views as words 14/600 in the secondary ink, 12 a side; the open one in the text's ink with a
  2 px accent line at the header's foot exactly as wide as its name. No line under the others, no track.
- **Pills**: the room tabs' pill (36 tall, 16 a side, pill radius, the card fill with the hairline; the open one in
  the selected ink, no hairline), 8 apart, centred in the 56 bar. They are Home Assistant's elements, laid out by it
  at text + 32: the 4-grid rounding of Fluvy's own measured pills does not reach them (nothing blurs: the hairline is
  an inset shadow on whole pixels).
- **Content**: the name (an icon tab writes its `aria-label`), the icon (24, Home Assistant's size), or both (a 20
  icon, 8, the name). A view without an icon, asked for its icon, gets the one its name says in any of the eight
  languages (a mask of the fluvy set in the tab's ink, from an on-demand table); a name that says none keeps its words.
- **The dashboard's name** is a switch of its own in every style: before Home Assistant's own tabs too, and with
  hidden tabs the bar may hold the actions alone.
- **Hidden**: no tabs; the name (when shown) grows and the actions keep the bar's end.
- A phone (`.narrow`) drops the name; the row scrolls under the finger and fades 24 px only where it goes on — its
  start once scrolled, its end while there is more — and keeps 24 px at its end. Home Assistant's chevrons give way
  there; on a wide screen they stay (a mouse has no other way along the row).
- Never in the edit mode, a subview or a one-view dashboard (Home Assistant's own title stays), and never on a
  dashboard that does not wear the look.
- The panel's card: a header mock on the card fill with the hairline (radius 12, 56 tall), the four styles as option
  tiles with their glyphs, the content as filling chips, the name as a switch row; *Hidden* and *Original* (Home Assistant's own),
  with nothing more to choose, each say why in a hint (*Hidden*: where the automatic dashboards' chips under the
  greeting are switched on).

## The corner (1.5, the sidebar's head and the header)

- Three choices of the house's (or a person's own look): **Home Assistant's logo** — its house in its blue (#18BCF2,
  24 on the 24 grid) on the menu button, which keeps its tap (open and close the sidebar), the name at 16/600 with
  0.01em, as Fluvy's screenshots draw it; **dividers** — the 1 px hairline under the sidebar's head and under the
  header, or none; **the header** — a bar on the card's fill, or on the page's own colour (no bar); **the actions** —
  Home Assistant's four buttons, or its phone's one menu on every screen (it draws them; Fluvy asks for that render),
  its button drawn as Fluvy's "…". All four: the screenshots' corner.
- The sidebar takes them only where the look covers Home Assistant (its sheets fill on `<html>`'s marks and the
  theme); a dashboard's header wherever it wears the look (marks on its root). The edit mode keeps Home Assistant's.
- The panel's card draws the corner: the sidebar's head (at most 256) beside the header (never narrower than its
  actions; the dashboard's name in it only where it holds a word: not on a phone), each on its fill over a band of
  the page, the hairline under both when chosen, the frame above them; four switch rows; under "only dashboards" a
  hint says where the sidebar follows. The tabs card's preview shows the header's actions when the tabs are hidden
  (what the bar then holds); its name is the header's (20/600, an ellipsis at 40 %, all the room when hidden).

## Wall

- A wall is the dashboard alone: no sidebar, no header, the view padded by the tablet's safe area and, when the house
  asks, the wall mesh behind the cards. Nothing of Fluvy's is on it but the **corner**, the way out, a 44 square at
  the top right in one of two presentations the house chooses. The **button** (the default — nobody is locked in a
  wall): a 32 disc on the card's fill at 88 %, hairline and the knob's drop (it floats over whatever the dashboard has
  in its corner), the × glyph 16 in the secondary ink; it is there when the wall comes (6 s) and while someone is (a
  touch, a pointer that moves, a key; 4 s after the last), fades in 200 ms and takes no touch while away — the tap
  that brings it back is the dashboard's, the next one leaves. A tap takes the device out of the wall and a **toast**
  at the foot says "Wall mode off" with "Back to the wall" for 8 s. The **hold**: invisible until pressed; a hold
  fills a 2 px ring (radius 18, the accent, its track at 20 %) over a second and a half and the tablet taps back once
  — letting go before cancels; it pauses the wall, and the toast says "Wall paused" with "Resume" for as long as the
  pause lasts. The toast: 44 tall, card fill, hairline and lift, radius 12, its words 14/600 and a 32 accent button.
- **The way back from a subview** (1.6): the wall has no header, so Home Assistant's back arrow goes with it. The house
  chooses between two ways back:
  - **The button** (the default): the corner's disc grown into a pill at the top left, on the corner's line. It is 32
    tall in a 44 target, 6 from the edges, on the card's fill at 88 % with the hairline and the knob's drop. It holds
    a 20 chevron in the secondary ink, 4, then the view's title at 14/600, which ends in an ellipsis at half the
    screen. It is there for as long as the subview is: navigation is never hidden. The view keeps the pill's 44 above
    its cards, and a tap is Home Assistant's own way back (`back_path`, else its history).
  - **Home Assistant's header**, in subviews only, with the corner moved under it.
- The **screensaver** is a modal in the top layer: the wall mesh (or black), the digital clock in its hero size with
  the date under it in a 480 column, centred; dimmed, the clock is white at 60 %. It fades in over 320 ms and out over
  200; the touch that wakes it reaches nothing under it. At night the wall may lay a black veil at 20, 40 or 60 % over
  the page while awake.
- The panel's Wall tab: *This device* (the wall switch and the address with a copy button), *Wall dashboards* (the
  Scope list's idiom), *Screen* (the minutes as chips — five, in two rows on a phone —, two switch rows, a row
  whose button shows the screensaver itself over the page until a tap, and the motion sensor as a dropdown of every
  one the house has, its room as the hint), *Day and night* (four option tiles in 2 × 2 with a value line each, two
  time fields for the hours, the veil's share as chips), *Background* (two chips) and a preview of the clock over
  two tiles on the background chosen — in the night's tokens, under the night's veil, when the settings would make
  it night now. Its chip rows are written for a phone of 320 at least, in every language (a word that would not fit
  a chip there takes a shorter one). Every wall control edits the latest wall (`editWall`): two taps before a render never lose the
  first.

## Size (a device's, 1.5)

- A tablet across the room reads larger: 90, 100, 110, 125 or 150 % — the device's own, like the wall switch
  (`?zoom=125`, or *This device · Size* on the Preferences tab and the Wall tab's device card: five chips in one row,
  three over two on a phone).
  It is CSS `zoom` on the dashboard's view alone: the cards, their type and their controls scale together and the
  layout follows (a column that held three cards holds two); every rule of ours is written in the view's own pixels,
  so nothing is laid out twice.
- What does not scale: Home Assistant's header and sidebar, its dialogs, and the edit mode (a dashboard is edited at
  the size it is laid out in). A card's own dialog (the keypad) and a menu in the top layer scale with the view and
  are placed in its pixels.
- A gesture under zoom is read in the control's pixels: a drag travels by the control's own length (`trackDrag`'s
  `dx`, `localPoint`), a tap or a scrub by its fraction of the box. At the same column width the size never makes a
  new ellipsis; a bigger size makes a phone's column narrower (two thirds of it at 150 %), and the cards then give way
  as they do in any narrow column, by their own rules.
- The header's dashboard name follows the view's column at every size (its margin is the view's 24 grown with the
  size, less the bar's 12). A hairline inside the view is drawn at the size too: at 110 or 125 % it can straddle two
  device pixels — a known softness of a scaled page, the price of one layout for every size.

## Palettes that travel

- Two more gallery lines after Electric: *Yours* (the house's saved palettes) and *Community* (the shipped ones, six
  shown and a "Show all (n)" chip), each swatch titled by its file with "by <author>" under the name (11/500,
  secondary, 16 line); the Custom entry is active only when the draft equals none of them. The *Share* card follows
  the custom editor: two labelled text fields (title, author) in a pair, the pair "Share this palette" (disabled until
  a title) | "Import a palette", and for an administrator one row — save (accent circle) or remove (its title as the
  sub) — or the reason there is no room.

## Energy (1.4, approved 2026-09-30 after four judge rounds)

**One colour rule.** A lane is coloured by where its energy came from: the sun's surplus going to the grid is gold,
the grid charging a battery is lilac, a battery selling to the grid is green. Destinations — the house, its
consumers — are ink (`--fluvy-text` at 62 % over the card). Figures and words are never coloured; the direction lives
in the unit slot, in the secondary ink ("0.4 kW out", "0.6 kW charging"). *In / out* is said of the grid only; a
battery or a car is *charging / discharging* (*charged / discharged* over a period, in kWh). A meter that cannot know
where its energy came from (a phase, a signed gauge) uses the grid's colour both ways. Head icons use the accent (the
lilac `energy-home` tone no longer marks a head).

**The house.** A 44 neutral disc; its supply as 3 px arcs at r 26.5 (outer edge 28), one per origin, in the order
sun · battery · generator · car · grid, 4 px apart; they slide to a new mix in 700 ms (the one dash animation,
declared). Nothing is estimated: when a source cannot be read and the house has no meter of its own, the house reads
"—" and the arcs rest.

**Lanes and arrowheads.** A lane is 6 px, its origin's ink at 40 % over the card, round caps. Its arrowhead is a
solid triangle 9 long and 11 wide, its corners rounded by its own 1.5 px stroke (the vertex at −0.75 so the tip is
the true end): the head's tip IS the lane's end, 6 px off what it reaches, and the lane stops 7 px before the tip
(split by de Casteljau), so its round cap ends inside the head and nothing shows past it. Legs and rail: a 2.5 px
lane with a 6 × 7 head, trimmed 5. A lane that reverses (a battery, a car, the grid) draws a body and a head for each
way and crossfades them — and its colour — in 400 ms.

**States.** At rest (below the source's threshold, 10 W by default): the lane at 50 %, its head at 35 %, no pulse,
the node's circle neutral, its figure in the secondary ink. Stale (no reading for 10 minutes): everything rests, the
arcs at 50 %, the sub says "Updated 12 min ago", no badge. Unreadable: a 1 px dashed hairline with no head, the node
a dashed ring, its figure "—", the sub "Grid unavailable since 19:47", the badge "Unavailable". Nothing is taken
away in any state, so nothing reshuffles.

**Rows (the default).** Sources stacked on the left, one pitch (80) apart from TOP 42 (one pitch under the head's
icon centre); words centred on their circle (lines 16 · 20 · 20); every lane leaves 12 px after the widest words of
the column (measured) and meets the house's ring (34 = 28 + 6) at a slot: 20 px of arc between neighbours (lane 6 +
head 8 + 6 clear); a grid that can import and export at once (read per phase, or by two sensors) is a pair of
parallel lanes 16 px apart, its second lane shown only while it does both; the window is 90° above the house's left
point and 48° below it (its words hang there); when the slots cannot fit, a pair shares one contact; a pair level
with the house arrives level at ±8. A lane shorter than 56 px is no lane: the card lists its nodes (the direction
drops to its own line only when its line would not fit, and then every line of that node does; a label keeps its
first segment — "Battery · 62 %" → "Battery"); below Home Assistant's own minimum the rows drop their circles.
Consumers (≥ 560 of content) mirror the sources on the right, the house in the middle, their lanes in ink; narrower,
they are rows with ink bars, "64 % of the house", and the rest of the house as its own row.

**Cross.** Home Assistant's arrangement: sun above, grid left, house right, battery below, mirror-symmetric about the
middle of the grid and the house; diagonals leave at ±45° and arrive radially with one pull (44). Each source's lane
into the house is always there (at rest when idle); the lanes between sources (sun → grid, sun → battery,
grid ↔ battery) appear only while they carry energy. The grid → house lane bridges the sun → battery lane: it is
drawn over it with a 12 px card-coloured edge, and its pulses travel over the other's.

**Motion.** Pulses are comets (a 26 × 6 capsule, its head the lane's cap in full ink, its tail fading into the lane)
carried by the Web Animations API — transform and opacity only, the lane sampled once — at a constant pace in px/s:
24 → 72 px/s as the flow's share of the house's peak (`max_power`, 6 kW by default; square root, so a trickle still
moves), one pulse under 1 kW, two under 3 kW, three above, one more per 140 px of lane, eight on a card at most
(the strongest flows first). A new reading retunes the pace without moving a pulse (`updatePlaybackRate`); a lane
that changes its way or colour fades its pulses out and the new ones in (400 ms). Off screen and in a hidden tab
every pulse pauses. `motion: calm` keeps one slower pulse a lane; `off` and reduced motion keep none (the lanes and
heads stay). A figure animates only when its text changes.

**Legends and blocks.** Distribution's idiom: a 12 px bar of segments with 2 px gaps and 6 px end radii; 12 × 12
squares, the name 14/500 and the figure 16/600 under it, in equal centred columns — measured: when a name does not
fit its column the row folds (four into two by two, three or fewer into one a line). A block is its LABEL (11/600
caps) and total on one 20 px line, the bar 8 under, the legend 12 under that.

**Phases.** A row per phase: its name (and voltage) in 40, a bar centred on zero in the grid's colour both ways
(out to the left, in to the right, a 2 × 16 zero mark), the figure in 96 on the right; the axis "← out · in →" under
them.

**Sankey.** One px-per-kWh scale for every bar and ribbon (true proportions); rows Grid · Battery · Solar → House ·
Charged · Exported, so no ribbon crosses another; the house's own ribbons leave 56 px under its bar, under its words,
at 24 %; labels packed by their measured width (at the bar's start, else its end, else a second tier), 16 px apart.

**Glyphs.** `tower` is the grid in every state (the head keeps the bolt), `generator` a fuel can, `swap` two opposed
arrows (the balance), `oven`.

**Honest figures (2026-10-01).** A group's state of charge is weighted by capacity, so batteries that do not all state
theirs have no group charge ("—", the ruler asleep), and a group whose batteries go opposite ways has no "full in"
or "empty in": at those powers it never gets there. A row of a meter that cannot be read at all is the unavailable
row (the dashed ring, "Unavailable" opening its line); a state after "·" is lower case. A signed meter that is not
power (a temperature) has no default badge: "Active" is not a state of −4.2 °C. One precision runs through a row of
figures ("1.0 kW out" beside "2.2 kW out").

**Modes.** An option Home Assistant does not translate is worded, never shown as an id ("pv" → "PV", "minpv" →
"Min PV"); a mode with no meaning to say puts its name on the tile's value line, so the values share a baseline. A
chip chosen in half a column takes the same tone as its tile (the sun's for a solar mode).

**Stacks of arrays.** Four steps of the ink (100 · 45 · 72 · 30); the forecast of a stack is hollow (a 1.5 px outline
at 45 %), so no array is mistaken for hours to come. A legend of arrays folds by the legend rule, names and figures
measured.

**By source (1.5).** The house's power today: its use stacked by origin above the line (the sun first, the grid
last); under the line, from it down, what went into the battery (the battery's ink) and out to the grid (the grid's
ink), both at 60 % — Home Assistant's "Power sources" convention, where a sink sits below zero. Drawn from the power
sensors' five-minute means when the Energy dashboard names one for every source (as Home Assistant draws its own
graph), else from the meters in 15-minute blocks (30 or 60 when their step — 0.1 kWh — would show as a saw-tooth); a bucket without the grid or the battery is a gap (the curve
stops, the cursor reads "—"), never a zero. "Right now" is the house's own use, allocated live as the flow card does.

**The whole house (1.6).** Home Assistant's "Power sources" convention, kept whole:
- **Above the line**, every source's power stacked from the line up: the sun's whole production first, then the
  battery's discharge, a generator, a car, the grid's import.
- **Below it**, from the line down, the battery's charge, a car's and the export, at 60 %.
- **The house's use** is a 2 px line in the text's ink over the stacks.
- **The batteries' charge** is dashed (2 px, true 4 · 4, butt ends) in the battery's ink on its own scale: 100 % on
  the tag's line (28 under the chart's top, its "100 %" at the top right, untracked), 0 % on the kW zero line, which is
  the chart's foot when nothing left the house: the charge always lives in the positive half, and only the areas of
  what went out are drawn under the line (1.7, issue #28). A 4 px
  card-coloured edge under it lets it read over the areas it crosses. Each run is laid out a whole number of dashes
  long, starting and ending on one, so a gap reads as two ends.
- **The tags** are never crossed by a line: the house's line, the charge and the cursor give way round each tag's box
  (4 round), in every stacked energy chart; the areas pass under the tag's text halo; the dots are drawn over the tags,
  never under their words. The tag under the line sits at the chart's start, or at its end where the charge crosses
  the start; where it crosses both, there is no tag (the legend names the areas).
- **The cursor** starts under the tag row (16 + 4), in every stacked energy chart. At "now" the house's dot is its
  ring; the charge's is a small solid dot (r 3) in the battery's ink with a 1.5 card edge, drawn over the ring, so it
  reads cleanly beside it, on its rim or inside it.
- **The foot**: the scale ends a pixel above the chart's foot, so the lowest area's 2 px edge is drawn whole.
- **The top row** is "Right now" (the house) with the charge now as its side readout. Each readout carries the key of
  its line beside its label, on the side away from the column it is aligned to: after a label on the column's start,
  before one on its end. So the words stay on the column (a 12 × 2 line; 12 × 2 dashes, 4 · 4 · 4). With no live
  power for the house (meters only), the chart ends on the last bucket whose meters have closed (an open one reads
  low, so it is not drawn), and that is the moment the row reads at rest: its time as the label ("21:15"), its power,
  the house's key, the charge then; the cursor and its ring sit there, on the line's end (a bucket's point sits at its
  middle, so it has closed half a bucket after it). With no house at all, the charge takes the start column. The
  house by source reads a house with meters only the same way, so its height never changes under the finger.
- **Scrubbing** stops at the chart's end (now, or the last closed bucket) and the cursor sits on the bucket it reads,
  so its ring is always on the line; across a gap it reads "—".
- **The day axis** writes its five hours where they keep 12 apart in the chart's width, else three (00:00 · 12:00 ·
  24:00), as the sensor chart thins its own.
- **The title**: "House power" where it fits beside its round, else "House" (each language its short one).
- **The legend** is a square per area drawn. At rest it gives the day's energy (from the power's integral, or from the
  meters' hours as the Energy dashboard allocates them). Scrubbed, it gives each flow's power at that moment, one unit
  and one precision for the row; the readouts read that moment too ("12:30 · 522 W", "Battery 77 %").
- **Gaps**: a gap stops every series, and a charge that cannot be known (two batteries without their capacity) is
  "—" with no line.

**Empty.** An energy card's empty panel sits 16 under its head and says what is missing in one line ("No batteries
yet"), with how to fix it as the hint under it ("Add them here, or give the Energy dashboard its batteries").

## People (1.6)

- **Each their own**: a name, a colour (a 2 px ring round the avatar, 2 clear of it on the card: a picture would hide a
  fill), and a tap and a hold of their own (a page of theirs, by default their details).
- **The title** is the card's own where it fits beside the map's round, a shorter one where it does not ("Who is
  home" → "At home"); a typed one is the user's (a name, which may end in an ellipsis).
- **A person's line** keeps their state; its detail (the zone, the time) goes, whole, where the column cannot hold
  both: a state never ends in an ellipsis. Where a state would not hold its grid column even alone, the card lays its
  people as rows. Rows give their avatars together, as every list's circles (the hairline then starts the row); a
  battery stays whole and its detail goes first; a state that would leave a name under 40 is a dash, its word the
  row's label.
- **A phone's charge** (`show_battery`, or a battery named by hand): the set's battery glyph (20, 16 in a row's sub)
  filled to its level, 12 wide inside and never under 3 so a low one shows, then the figure ("78 %", "—" unread). At
  20 % and under, glyph and figure take the warning ink; on its charger (Android's charging sensor, iOS's battery
  state, a tracker's word) a bolt crosses the glyph with a card edge and it is never low. The grid puts it under the
  state line, 4 below; a row before its detail ("▮ 78 % · 19:47"). Found from the tracker the person is seen by, else
  any of theirs, else a tracker's own `battery_level`.

## Openings (1.6)

- **Each row its own**: a name, an icon, a colour, a tap and a hold. Its colour is who it is: its circle wears it at
  rest. What needs acting on (open, wet, smoke) fills the circle in the warning tone and says its state in the
  warning's ink, whatever its colour; events (motion) and the rest stay neutral.
- **Layouts**: rows (60, the time under each name: "14 min" open, "2 h ago" since — gone, whole, where it would not
  fit beside the value), compact (48, the name and the
  state on one line; a value never wraps), or tiles (two a row, 84 inner tiles, columns at the dashboard's gap and rows
  8 apart: the circle, the name, the state and its time; an open one fills in the warning, a coloured one wears its
  rest wash; a tile's time goes, whole, where its tile cannot hold it; where a state would not fit even alone, or a
  name beside the circle would end before it had begun (96, or the name), every tile gives its circle's room to its
  words, and where a state still would not fit, one tile a row — measured in the tile's own type, at the grid's own
  gap). `show_time` takes the times away.
- **A sensor gone** is a dash on the dashed skin of anything gone; its word is said where the time would be when it
  fits, and is always its label.
- **The "all sensors" row** gives its circle with the rows'. Folded, it says what it hides and any alert among it
  ("2 more · 1 open"; compact, "+2" in the warning's ink); its chevron turns up when it is open.
- **The head** keeps its badge (the card's alert) before the sub's last part, then gives way as every head; the
  sheet's "Openings & motion" where it keeps both its circle and its badge, else "Openings".
- **The same sensor twice** keeps both rows (rows are by position, never by entity).

## 3D printer (1.6)

- **Full**: the head; the picture; the progress row; the bar; its line; the readouts; the filament unit's trays; the
  buttons. **Compact**: the head, the bar and one line, the readouts at the extra-small size. **Row**: the compact
  anatomy (76, 16 in), the printer's circle ringed by the job, its name over what it does, pause or resume. Narrow,
  it gives way in order: the line's trailing parts (the ring says the progress), then the round (where the state or a
  name's 96 would not hold beside it), then the name takes an ellipsis; the state is never cut.
- **The head**: the printer's glyph (the warning's when it failed, so a failure never reads as a pause), its name, the
  job (the stage while it prepares: "Heatbed preheating"), the state in the badge. The badge gives way first, as
  badges do, and the state is then said at the head of the sub ("Failed · Hook"): the state is never left unsaid.
  The job is the file sensor's name without the slicer's extension; a printer without one (Creality) says it in the
  status's own attributes, and a "None" (FlashForge at rest) is no job.
- **Why it failed**, in the integration's words, is a line of its own under the head: 13/500 in the warning's ink,
  two lines at most. The failed job keeps its bar where it stopped. A printer without an error of its own says the
  code its status carries (Creality's "2004").
- **Who it is**: a printer of an integration the card knows (OctoPrint, PrusaLink, Bambu Lab, Moonraker, Creality,
  Elegoo, Anycubic, Snapmaker's U1 and its older line, FlashForge) is read by its own words, the entity known most
  surely to play a role playing it (a "print status" over a "wifi status"); a printer of any other is known by what
  it has — a status, a heater and a job's measure together — so a washer with a progress is never one. A duration is
  read in its sensor's unit (minutes, seconds, Elegoo's milliseconds) or as a clock ("01:02:03", the older
  Snapmaker's). A system button, an emergency stop and a unit's own readings are never a role.
- **The picture**: the camera (stills, or Home Assistant's stream with `camera_view: live`), else the job's preview
  (`image` picks); its shape and fit as the camera card's (16:9 by default), never taller than 360 — capped, it keeps
  its shape, centred. A preview is fetched again only when its picture changes.
- **The card's colour** stands in for the accent only: paused and failed keep the warning, whatever its colour (as an
  item's colour never covers a status anywhere: an open window's tile stays the warning's).
- **Narrow** (where a heater's widest pair, "888 / 888 °F", would not hold half the column at the extra-small size;
  measured, never a fixed width): every heater reads alone and the layer writes its total as its unit ("112" with
  "/ 240"), so two readouts hold a row where their figures fit.
- **The progress row**: the progress at the large size and the time left beside it on its baseline; where the two (a
  label or a figure, the wider) and 16 do not fit, the time left goes under, on the column's start, 12 below.
- **The bar**: 8 tall, radius 4, in the phase's tone; under it one line: "Ready at 22:59" (the integration's finish
  time: it does not drift), the time printed so far, the layer where no readout says it — its parts left out whole,
  from the end. Finished: "Finished at 21:17", from the finish time or when the state changed, never now; another
  day's moment says its day by the calendar ("Ready Fri at 05:27", a date from six days out), a job finished before
  today how long ago ("Finished yesterday", "Finished 2 days ago").
- **The readouts**: equal columns, as many a row as hold every label and every value — at the small size, else the
  extra-small, before one fewer a row (two at the extra-small beat one at the small) — never leaving one alone on a row of three or four (four as two by two, five as three and two); a last
  row that cannot fill is centred. A heater says "142 / 220 °C" from 3 °C off its target (5 °F), and its reading alone
  from 1 °C (2 °F) (no flicker between); it is always measured as its widest form ("888 / 888"), so a drifting heater never moves the
  card. Each readout opens its entity. Any entity of the printer can be one more (`sensors`).
- **The filament unit's trays** (Bambu Lab's AMS, Creality's CFS, Anycubic's ACE — on the printer's device or on one
  of their own reached through it; the unit's slots in their number, the spool outside it last): a 44 cell a tray,
  its colour as a 12 swatch and its type (by the words the units use: `type`, `material`, `name`, else the state), the
  one printing (`active`, `selected`, `loaded`) ringed in the accent (a 2 px ring and its words in the accent's ink,
  never a fill: the action row keeps the one loud fill, and it says so to a reader, `aria-current`), an empty one
  (said so, or holding no type) with a dashed ring (a shape of its own); every swatch has a ring in the text's ink at
  about half, so black filament on a dark card and white on a light one still show. Four a row where every
  type fits its cell, else two, else the swatches alone (the type is each one's label and tip), four across where each
  keeps 44, else two by two. Cells with a hairline: a state, not buttons. The trays and the buttons share one gap, 8 to 16 (never wider
  than the 16 between the two groups): the first that lands both rows on the 4 grid, else the one nearest 16 that
  lands them on whole pixels; 4 only where nothing wider keeps every cell 44.
- **The buttons**: pause or resume (the primary, in the row too), stop (asked first, in Home Assistant's dialog), the
  light (the glyph takes the accent while it is on). Never a system button or an emergency stop.
- **Tones**: printing, preparing and finished in the accent; paused and failed in the warning (failed with its own
  glyph); at rest and stopped neutral; offline the unavailable skin.
- **The ring** (the row): 2 px at r 26.5 round the 44 circle, 3.5 clear of it, from twelve o'clock.

## Light colour (1.7)

- **A colour bulb's controls** (`supported_color_modes` with `hs`, `rgb`, `rgbw`, `rgbww` or `xy`) live under the
  brightness block of the full layout: **one ruler slot** and **a row of quick colours**. The slot holds the
  colour-temperature ruler while the bulb is white (`color_temp`) and a **hue ruler** (`tint: hue`: the hue circle
  along the ticks, the knob's dot the hue under it, 0–360 in whole degrees) while it glows a colour, or always where it
  has no white to set. A release sends `hs_color` at the bulb's own saturation (100 where it reports none).
- **The quick colours** are 44 rounds, 8 apart, from the left, wrapping (six fill a phone's column): each its colour
  with a 1 px edge of that colour a shade deeper (`color-mix` 86 % with the text ink), the one the bulb is on with a
  check in black or white by luminance. A colour sends `rgb_color`, a white `color_temp_kelvin`, both wake an off
  bulb; **the swatches are the mode's switch** (a white brings the temperature ruler back). The bulb is "on" a swatch
  within ±12 a channel, or within 15 % of its temperature range. The default six are warm and cool whites (2700 and
  5000 K, clamped to the bulb) then red, orange, green, blue; a bulb without a white gets red, orange, green, blue,
  purple, pink. The house lists its own (`colors`: `warm`, `cool`, a Home Assistant colour name, `#rrggbb`,
  `[r, g, b]`, `picker`); a colour name is Home Assistant's own bulb colour, not the palette's tone — a bulb wears no
  palette. **`picker`** is a round ringed in the hues (the colour wheel's conic) that opens the browser's own colour
  picker: an `<input type=color>` fills the round unseen, so the tap and the keyboard reach it; a colour chosen there
  is sent as `rgb_color` 250 ms after the last change (a drag in the picker is not a call a move). The round holds
  the bulb's colour, checked, inside a 3 px ring of the hues while the bulb is on a colour none of the other rounds
  has — a white is never the picker's — and opens on Home Assistant's orange otherwise.
- **The card wears the bulb's colour** (`data-accent` of its `rgb_color` while lit in a colour, the finger's choice
  while held) where the config gives it no `color`: the icon circle, the switch and the brightness ruler take it
  through the lit-light family the accent remaps; `compact` gets this and nothing else. A choice is held five seconds
  or until the bulb reports it, as a level is.
- **Heights** are the config's: the slot (100) when a temperature or a hue ruler may show, the row (8 + 52 a row of
  six) when the colours may; a white bulb under the same config draws less. `show_color: false` is the white bulb's
  card. The controls' table and row come in their own chunk the first colour bulb fetches.

## Room lights (1.4)

A room's lights on one card. **Row** (the default): the head's anatomy — the room's own icon (the area's, else `home`:
never a light's glyph), its name and "2 of 3 on · 63 %" — with a 44 round a light at its end, 8 apart. The room's
switch is a button under the whole card (a tap: every light off when one is on, else every light on, in one call; the
card gives under the finger, `scale` 0.985 — its entrance holds `transform`); the head lets a tap through to it, the
rounds and the gaps between them take their own — a round's hit reaches 4 px into the gaps, the rest of a gap is dead,
so a near miss never switches the room. The card is a group of the room's button and a switch a light (never a switch
inside a button). A lit round takes its colour's fill and ink, as a chosen chip or an on tile — its bulb's colour when
the bulb has one (hs, rgb, xy: derived as an accent family, so its ink holds 3:1), else the palette's light — and a 2
px ring 4 inside its edge (on its fill, in its ink) to its level from the top, all the way round for a light that does
not dim or when the level is not shown: every lit round has a ring, no off one has. The ring follows a new level in
`--fv-base` (its one animation, declared). An off round is the neutral circle; an unreadable one the dashed ring,
which takes no tap and gives nothing under the finger (a hold still opens its details). Rounds that would leave the
name less than 96 (its own width when shorter) take their own line, 16 below the head, on whole pixels: the first
under the head's icon, the last on the content's edge, six a line at most, the lines balanced and sharing one set of
columns; the icon circle gives way first. **Chips**: the room's switch in the head (its hit is 56: the head keeps that
room), a filled chip a light (its glyph and name, chosen in its colour; an unreadable one the dashed ring), columns as
the names hold whole (three: two and one). **Tiles**: the room card's inner tiles (84), two a row; an odd last one
takes the row; one a row where a tile would be under 120, and under 136 a tile gives its name the icon's room.
`show_brightness` puts one ruler for the room under the head (16 + 44 + 20; the 16 above it is the ruler's own, never
the room's): the average of what is on; a change sets what is on (everything when nothing is). An empty card's panel
sits 16 under its head.

## Narrow columns (1.7, the 1.6.1 list)

What a card does at the widths a phone's zoom makes (211–266), beyond the rules above — never a word cut:
- **Option tiles** (an alarm's modes, a thermostat's and a water heater's) stay tiles only while every word holds its
  cell at the columns `optionColumnsFor` gives; else the row is the compact layout's chips, which give way in their
  order (glyph and word, the words, the glyphs alone). `optionsHold`.
- **A tile's foot** holds two (or three) readouts only while every label holds its equal cell (8 apart); else the first
  readout has the foot to itself (fr's "PUISSANCE · AUJOURD'HUI" on a phone).
- **A row of statistics** (the sensor's min · max · average) takes fewer columns where a label would not fit, the last
  one alone taking its whole row (`statsColumns`).
- **A head's line in segments**: the flow's dead source reads "Solar · unavailable · since 19:47", the weather's
  "Feels 16° · Wind 12 km/h NW", a keypad's "Enter your code · 29 s" — the segments after the first go from the end.
- **A room's head line** is fitted in the head's own class and room (the circle, the gap, the chevron's 44); a scene
  tile's line is dropped, never cut; a map row keeps its word and lets the distance go when both would not hold 55 %.
- **The lock's slide hint** hides where it would not fit between the knob and the end ring (the glyphs say it, the
  status line reads it out); **the camera's off text** takes a second line on a narrow plate; **the keypad** keeps its
  keys 56 wide at least and closes its gaps to 8.
- **The energy card's rolling axis** keeps its middle label only where the three stand 12 apart (`axisHolds`, shared
  with the sensor); **a long panel tab** keeps its words and the other tabs share what is left.
- **A fold line that hides an alert** says so in the warning ink in every layout; a short age ("21 d") is read in
  full; a layer's comets go at once when the layer changed size, never fading along the old lanes.
- **A glyph-alone chip is never under 44** (`widestOf` counts one 44): a compact alarm's five modes in a 211 column
  take two rows of glyphs rather than 36-wide chips.
- **An option tile's value is dropped, never cut**: a value of several words wraps, a word longer than the cell (de's
  "Bereitschaft" under Off, nl's "Overbrugging" under Away, de's "Überschuss" under a charger's sun mode) is let go —
  the thermostat's and the mode row's tile by tile (`valuesHeld`), the alarm's every value or none (`valuesHold`); a
  tile whose value is its only word keeps it.

## Readouts and text

- Readout = 11/600 uppercase label (0.06 em) + tabular value + unit on the baseline; a unit has its own line box (`line-height: 1`) so it never grows the value's box. Sizes: xs 16/20 (tile foot), s 20/24, m 24/28, l 40/44.
- Trend arrows in secondary ink (green is reserved for confirmations and the presence dot).
- Paired readouts of different sizes are baseline-aligned (`data-baseline` group); side readouts get the padding that puts them on the big value's baseline.
- A 16/600 value beside a 15/600 title or 14/500 legend name (list rows, bar rows, legend rows) carries `top: −1px`: Blink floors the half-leading, so in the same 20 px box the 16 px baseline lands 1 px low. One-line rows pair title and value in a `data-baseline` group; two-line rows (title + sub) centre the value on the pair instead.
- Percent always with a thin space: `70 %`. Temperatures in compact surfaces: `21.5°`; on dials `21.5 °C`.
- Celsius or Fahrenheit: a sensor's figure in its own unit, a climate's and a water heater's in the house's (Home
  Assistant hands them in it). Nothing assumes Celsius: a range, a step or a threshold an entity does not give is Home
  Assistant's own in the house's unit (a thermostat 7–35 °C by halves or 45–95 °F by whole degrees), and a readout is
  measured as wide as the unit makes it (a chamber's 104 °F has three figures).
- Compact family (tile + row): value `22°`, sub `Heating · 21.1°`. Dial family: value `21.5 °C`, sub `Now 20.8°`.
- Segments after `·` are lowercase unless proper nouns. Never ellipsis on a value.
- Chart bubbles: dark pill, tail on the cursor; charts reserve 44 px headroom so the bubble never touches the curve (a
  chart of several curves has no bubble: when is a pill on its axis row, so it keeps 12); the cursor sits at "now" and the fill stops there; the axis is the full 24 h (`00:00 … 24:00`) with labels placed by value (`axis()`), first left-aligned, last right-aligned — same rule as ruler labels.
- Legends without dots unless each dot is a plotted series. Empty states: a 44 neutral ring on the card fill + one line of secondary text, centred in a 120 page-filled panel; the way out, when there is one, is the hint under it (it may wrap). An unavailable icon circle is the dashed ring alone, unfilled in every palette.
- Flow diagrams: see § Energy (1.4) — contacts on the house are slots 20 px of arc apart, every arrowhead ends its lane.

## Colour — one theme, palettes chosen live

- **One theme, "Fluvy"**, carries the default look (Linen, Soft). Every other palette and shape is applied live by the bundle's look engine from Fluvy's settings (the house's, or a person's own): no palette has a theme file of its own, and nothing has to be picked in a profile. The engine and the theme file are written by the same function (`@fluvy/tokens/runtime` `lookDeclarations`).
- **Two lines.** *Pastel* (the soft pool: Linen, Sand, Sage, Mist, Clay, Slate, Harbour, Dusk, Ember) and *Electric* (the tint trio Blaze, Flamingo, Iris; the solid pair Volt, Mint; Noir, dark first). A palette is a seed: page, card, accent, fill, on-fill, and for the electric line `character: 'vivid'`, `fill: 'tint' | 'solid'`, an optional `highlight`, and the device colours it moved aside (`states`, `statuses`) or made its accent (`twin`). The seed is what ships: the build adjusts nothing on the electric line.
- **Electric = the accent is a graphic colour.** It draws icons, strokes, curves and fills at full chroma (>= 3:1); its text form `--fluvy-accent-text` (links, link buttons, a calendar's month) is the same hue taken to 4.5:1. In a soft palette the two are one colour. It keeps at least 80 % of the chroma sRGB holds at its hue and lightness in both modes. Device colours keep their own hues (no pull towards the accent), and the accent is never mistaken for one (ΔE2000 ≥ 8): the one it lands on becomes its **twin** (Mint's "home" is its green), the others step aside.
- **Solid fills** are the colour itself with black or white on it by contrast; a resting icon circle then carries only a wash of it (`--fluvy-wash`, up to 32 % over the card in light, backing off where an ink would drop under 3:1; in dark the lifted neutral surface, `--fluvy-wash-base`), so only what is on is loud. A status's fill sits a step deeper than the device colours' (a warning never reads as gas), and any two fills stay ΔE2000 5.5 apart. What is drawn on a solid tile takes the fill's ink (`--fluvy-solid` 100 %: a black switch track with a thumb in the tile's colour, black ticks and knob ring, no glow; labels and units in the on-fill ink at 72 %); on a tint (`--fluvy-solid` 0 %) the tone's own ink reads, as it always has. A tint plate always lets its own ink read as an icon (3:1): the plate steps paler until it does.
- **Primary action** (`--fluvy-primary`, `-hover`, `--fluvy-on-primary`): the round play button, the "+", a command row's first, a checked to-do, the calendar's selected day. Its hover steps away from the ink on it. The accent with its ink on a tint palette; on a solid one the fill with its black (ref Volt's black-on-periwinkle), never a black glyph on a mid-tone.
- **Highlight** (`--fluvy-highlight*`): a second brand colour, the accent where a palette has none, always a **fill with its on-fill ink** (never a stroke, text, chart or the primary action), at most one per region. It marks *here*: `--fluvy-selected` / `--fluvy-on-selected` fill the open tab (ink on a soft palette, the highlight on Volt and Iris); and, only on a palette that has one, *you* and *today* (`--fluvy-mark` / `--fluvy-on-mark`: the avatar, the calendar's today). Where a palette has no highlight there is no mark, and those places keep their accent design (on a solid palette its fill, never a dark ramp of it). Today keeps its colour when it is the selected day; another selected day takes the primary fill. Beside the mark (the greeting's avatar) the rooms' "here" is the ink pill, so the region holds one highlight: on a palette with a mark the rooms row always takes the ink pill, and the highlight's "here" is left to the settings panel's tabs.
- **Custom palettes** go through the same derivation and gates, whatever colour is picked: an electric pick keeps its share of the gamut when its line has to go deeper to be seen (a pastel pink becomes a hot pink on white), the device colour it lands on becomes its twin, and crowded status or device colours turn a few degrees aside (at most 32° for a device, 24° for a status: a warning stays amber) until nothing is too close. "Electric" is asked of the accent only as far as the pick is: a dusty rose stays a dusty rose.
- **Colour per card (2026-09-28).** A card's `color` — one of Home Assistant's colour names, or any `#rrggbb` — is *which colour that card is*: it stands in for the palette's accent inside the card (its chart's line and fill, its icon circle, its gauge's ring, its lit light — the accent's twin — its primary action, its ramp and graph series; the highlight too where the palette has none of its own), and nothing else: surfaces, text, the neutral ramp, the status and device tones and every Home Assistant name stay the palette's. The family is derived on the very palette the card wears (`--fluvy-palette`, written by the theme and by a look applied live) in the mode it is in, through the palette's own accent arithmetic (`deriveAccent`: the same ink fitting, fill legibility, on-fill and graph gates; a pick whose series sit too close stretches their tone stagger until they stand apart), and written into the card's shadow root on its children — never on the host, whose computed values the card reads — without `!important`. A part with a colour of its own and no tone is drawn in the accent (`toneOf`); a device tone (a fan, a heater, a speaker) is never recoloured. Home Assistant's colour names resolve through one table (`NAMED_COLORS`), the same the theme writes them from, each in the tone Home Assistant gives it (pink the armed rose, cyan the water, teal the presence green, brown the gas): a card asking for teal is the teal every Home Assistant surface shows. The editor offers Home Assistant's colour picker; its swatches show the palette's colours because the card editor dialog wears the look of its dashboard.
- **A card's own surface (1.7, the second exception).** `card_color` tints the card itself: `--fluvy-card` becomes a
  wash of the colour's fill over the palette's card (`surfaceWash`: as much of the fill, up to 40 %, as keeps the
  primary and the secondary ink at 4.5 and the fill's hairline at 1.35 over it; with none to spare, the card itself),
  and `--fluvy-border` becomes the fill's hairline, so the card's edge and every divider in it say the colour. Both are
  written by the card's `AccentSheet` on its children, beside the accent's family, so everything that paints with the
  card's fill (a knob's halo and face, a resting icon circle's mix, the focus ring, a chart's strokes and halos)
  follows without a rule of its own. It is independent of `color`: the surface and the accent are two choices. The
  page fill, the inner tiles' ground, the inks, the tones and the statuses stay the palette's; an item that is on keeps
  its full fill; a card that is off or unavailable keeps the neutral skin (a state is never covered). Not on the
  greeting, a heading or the tabs, which have no surface of their own. The gate runs in the build for every palette,
  mode and pick.
- **An item's colour, at rest too (1.6, the one exception to "surfaces stay the palette's").** Lists of things
  people tell apart by colour take a `color` per item: tiles, scenes, tabs, people (a ring round the avatar: a picture
  would hide a fill), openings (its circle), rows, bars, stat tiles and lights. Its fill shows while the item is on (the
  default), and the house may ask for it at rest too (`tint: always`, on tiles, a tiles group, a room's tiles, room
  lights' tiles, scenes and tabs), on coloured items only: an item with no colour of its own keeps the card's surface.
  A colour never covers a status: an open window, a jammed lock stay the warning's, circle, fill and words. Only a
  `tone` asked for by name outranks a status (the house's choice): the circle and the fill take it.
  At rest it is the item's rest wash (`--fluvy-accent-rest`, `-rest-inner` over the page on an inner tile) with the
  fill's hairline; on, the full fill as ever. The rest wash is as much of the fill, up to 40 %, as keeps the words on
  it — the primary and the secondary ink — at 4.5, derived per palette, mode and colour and gated in the build for all
  of them: a tint palette's pale fill takes the 40 %; a solid one in dark gives about a quarter, still 1.18 or more
  from the card. In a tint palette the whole way from the card to the fill is about 1.25, so the rest wash and the
  fill are close in lightness: on and off are told apart by the icon circle (filled when on), the fill's step and the
  state's word. The words keep
  their usual ink. A named colour is Home Assistant's tone on the palette (amber is the lit light's ink, which a
  palette may move aside): the palette keeps its harmony, and a hex picks one exactly.
- Text on a filled surface uses that surface's on-fill ink (a tile's state line, a scene row's time), never the page's secondary.
- Gates (build and tests, every preset and custom combinations): text 4.5, icons and graphics 3, ink on fill 4.5, icon on its resting circle 3, hairline 1.35, card vs page 1.18 (light), dark card lift 4–6 pp, ΔE separation of series and roles.

## Settings panel

- One centred column of cards (760 at most; the phone's 16 gutter). Its breakpoints are its own width (inside Home Assistant the sidebar takes part of the screen): from 648 it is laid out as on a desktop (12 gaps, the wide tabs); the preview takes the desktop card sizes when it has 672 of its own (a 760 panel); from 1184 the preview leaves the column for a 400 side column of its own, sticky (scrolling within itself when taller than the window) and on every tab — the look's preview, or the automatic dashboard's on its tab. Narrower, the preview closes the tabs that have one.
- **The Dashboard tab's preview** draws the lights in the chosen size, the thermostat in its variant and the energy flow in its style — on the house's own meters when it has any (the automatic dashboard's detection: the energy preferences, then the words), on made-up ones (sun, grid, a charging battery) when it has none.
- **Settings file**: Export writes everything Fluvy keeps — the house's settings, this person's, the automatic dashboard's options (not the house's own entities), the version and the date; Import restores them (the dashboard's options when the house has an automatic dashboard).
- **Tabs**: five — Appearance, Scope, Dashboards, Wall, Preferences — a tab row (14 px face) on the card surface, the open one in the selected ink. A phone scrolls content-sized pills and keeps the open one in the middle, fading only where the row goes on; a wide panel fills the column with the five equal tabs on one line. Fluvy's own facts (the About tab until 1.4) are Preferences' last card, *Fluvy*: its version as the head's sub, the look in use and the Home Assistant pages it styles as rows, the settings file as a label over the equal Export · Import pair with its hint under, and the house's reset row (an administrator's).
- **The panel wears the look being chosen**: a tap on a palette or a shape re-skins the page it was made on; the preview shows the real cards at their real size (desktop tiles 152 beside the thermostat's 312).
- **Nothing saves on tap (2026-09-19)**: every tab edits, and the edit is shown before it is saved — the look on the panel itself; where it applies, the frame and the menus' icons on the whole screen (the look engine's preview); the language and motion of the cards on the page. An edit back to the saved value is no edit, and an edit clears itself when Home Assistant hands the saved value back (no flicker to the old one). The Dashboard tab previews its cards (the lights as large tiles or rows, the thermostat in its variant).
- **Pending changes**: a bar in a dock at the foot of the column, in the flow (it never covers the last card) and sticky (at hand while scrolling), on every tab: what changes (one change in words, each part from → to: "Linen → Volt · Soft → Round", "Floating frame · Off"; several: "3 changes"), Discard, and how to save: a changed look as an equal pair, for the house or only for me (one accent "Apply for me" for someone who may not change the house's), anything else one accent Save. The "Saved" notice sits in the same dock. Enter 220 ms, leave 160 ms, transform and opacity only.
- **Gallery**: three a row at every width (108 / 216 cells), Linen first; each palette a miniature of the product (its page, an on tile in its fill with an icon circle and lit ticks, an off tile in its card, its highlight); the chosen one on the accent fill with a check. Custom is a builder row of its own under both lines.
- **Custom palette builder**: the accent examples are the style's own — twelve pastels (L 0.85, C 0.08) or twelve electric colours, hue for hue, so changing the style keeps a listed pick's place; any colour can still be typed or picked. The highlight says what it does under its label (you and now: the avatar, today, the open tab), and the preview carries the greeting, whose avatar wears it. A colour dot's edge is its own colour a shade deeper (a grey ring stair-steps round a saturated dot).
- **Only on dashboards while Home Assistant wears Fluvy**: when the profile's theme (or the house's default theme) is Fluvy itself, every page wears it whatever the scope. Choosing "Only dashboards" then shows why in a note, with Home Assistant's own way back: the profile's theme picker event (`settheme`, theme `''` = the default) for the person; `frontend.set_theme` for an administrator when it is the house's default.
- **Scope → Everywhere** offers what belongs to the whole app: the floating frame and **our icons in the menus** (the sidebar's glyphs and Settings' icon circles; off, Home Assistant draws its own). Both are the house's, apply live on every screen, and are shown read-only to someone who is not an administrator.
- Choices inside a card share one rhythm (8 between cells on a phone, 12 on a desktop); a label binds to the row under it; prose wraps; a destructive action (Reset) arms on the first tap and says so ("Tap again to reset", "Cancels in 4 seconds").
- **Preferences (2026-09-28)**: the language is the dropdown above — *Automatic* first, with the language it resolves to as its hint, then Fluvy's languages by their own names with the English name beside (eight chips before); the panel speaks the chosen language at once, before it is applied. Under the switches, a row opens the translating guide (`docs/translating.md`) in a new tab.

## Activity page (`/logbook`, 2026-09-19)

- **One scroll, and the rail is its scrollbar** (the native one is hidden). The time rail is the vertical ruler of the language: 2 px ticks centred on the axis (an hour, a label every three on the near side, "24" at the end of the day; over 36 h a tick per day and the day's number in the middle of its band), the histogram on the far side growing outward (whole pixels, a square root so a quiet quarter stays readable beside a burst of hundreds), the **part on screen lit** — drawn on the axis itself, a 2 px accent line from the knob to the foot of the screen (at least 8 past the knob's halo, so it never vanishes — but at the very end of the scroll, where the knob rests on the rail's foot and there is no room below it), with its ticks and bars in the accent — and the **36 knob** with the page's colour as its halo. **Whole or absent:** a tick, bar or label the halo would reach goes, whole (opacity, 120 ms), while the knob is over it; the dotted future stops 6 short of each tick it crosses. At rest the scale is the secondary ink at 80 % (3 : 1 on the page, a graphic); lit, the accent. The histogram is scaled to the busy stretches (twice the 90th percentile), not an outlier's: a restart's hundreds run the whole room with a 2 px notch, and the rest of the day keeps its shape; a bar eases to a new count (a filter, a live entry), and another period's histogram crossfades in over the last one, which holds its place while the next loads. The bubble sits left of the knob with its tail on it: the time, and how busy that stretch was. A mouse scrubs from anywhere on the rail (a click in the track jumps); a finger only from the knob (its target is 52) — elsewhere it scrolls the page, and a tap jumps. Keys: ↑ ↓ a quarter hour, Page an hour, Home now, End the oldest entry. It is felt as the lamps' rulers are: a light touch when the knob is taken (or a tap jumps), a selection tick at every hour crossed (every day over a long period), a medium one at either end. Every haptic of Fluvy — cards, rulers, dials, the rail — goes through `@fluvy/ui`'s `haptic()`: the person's Haptics preference holds for all of them, and ticks from one source are thinned to one per 60 ms. Desktop rail 88 wide beside the 720 column; phone 44 with the axis 28 from the screen's edge and, while a finger holds it, a strip of the page's ground (faded in over 12 px, never a hard cut) with the hours — a week's days — on it.
- **The scroll ↔ time map** runs through the rows (a row settles right under the pinned hour header), each hour's header (the quiet part of an hour is its header) and the start of the day, which is **the end of the scroll**: the last screen is the oldest hour, its header pinned over its rows and the start of the day (the page's foot leaves exactly that room, measured), and whatever lies past it maps there. An hour off screen is not laid out (content-visibility) and keeps the room of its rows at a real row's pitch; a long jump **chases its row** — measured again each frame as the hours it passes are laid out — until it sits under the header. After a scrub, a tap or a key the knob is pinned to what is shown until the reader scrolls by hand. Under the start of the day, the way on to the day before (a quiet button with its date).
- **Timeline rows** are the two-line list rows: 64 tall (12, the 40 circle, 12), the time 52 (72 for a 12 h clock) right-aligned, the 40 icon circle (20 glyph) for what people look for and an 8 dot for the house's small print (sensors, settings), name 15/20 over 13/16; a wrapped line stays on the 4 grid (84). **One spine** runs through every node and every hour header (an 8 hollow node on it), dashed across a quiet half hour, down to the start of the day. The hour header: its time in the time column, its count and a hairline in the text column; pinned, it gets its edge.
- **State pill** (the timeline's): 20 tall on the name's line, 8 sides, the from pill quiet, the to pill in the state's tone when it is on, dashed when unavailable; "from › to" is one unit and wraps as a whole. Moments (a button pressed, a doorbell) are neutral circles; runs of automations take the accent.
- **Folding**: restarts (the stop, what was written while down, the start, what came back in the next ten minutes — never what a person or an automation did), bursts and repeats are one row with a chevron; a row's detail opens under it (a card on the text column: When / Change / Trigger / Cause / Where, then equal 48 buttons — More info, Only this, History or Traces, Device). The buttons' layout is **measured, not a breakpoint**: one row of equals when every label fits its cell (12 px sides) in the page's language, else the main one alone and the rest in pairs, else one a row. The cause is a way in (its glyph, its name · what it is, ›); what it is goes when the line has no room for it. **Only this** is a quick look, not a choice of sources: the day narrowed to that device, nothing remembered, and the narrowed line's **Back** returns to the filter and the sources it came from.
- **The floor is 320** (a phone at its smallest, or zoomed): every moment is checked from 320 up, page and card. A button whose label cannot keep its 12 px sides even alone takes 8, then two balanced lines; the eyebrow drops the weekday ("Today") when the line cannot hold both; the way to the day before takes the date's short form, then "Previous day".
- **Text is never cut** but for names: the day's title steps down (32 → 24 on a desktop; the phone's short form 24 → 20; still too wide, its two ends — or its words — go on two balanced lines), state pills never shrink and are sized in layout (the canvas knows no font features; `@fluvy/ui`'s `textWidth` measures with them), "from › to" wraps as a unit and breaks after its arrow only when wider than its whole line, a burst's or a repeat's entry puts its change under its time on a short line, a line of parts ("135 changes · 3 runs · 1 restart", a detail's date · time) drops the "·" of a part that starts a line. The desktop layout starts at 720 (where its day header fits).
- **Filters** are the language's chips (a 36 pill in a 44 target): on a desktop, one row or two balanced rows of equal cells (5 · 5) — never more; when two rows cannot hold the labels, and on a phone, a strip of fitted pills (wheel and mouse drag too, faded at its ends). A filter that would change nothing is not offered: no row for one entity, on an empty day, or when every chip would show the same count; while searching, the counts are the search's.
- **Dates**: presets on top (Today · Yesterday over Last 7 days; a week is two taps on the grid, so the presets stay one short row), the language's calendar choosing a period, on seven equal cells (44 in the popover, wider in a phone's sheet, 41 wide × 44 tall on a 320 phone), the chosen days one band (its ends filled), the hours of the first and last day in **our time field** (hh : mm in the house's clock, and the day's half on a 12-hour one; digits, ↑ ↓, a whole segment moves on; a whole last day reads 24:00, or 11:59 PM on a 12-hour clock, where 12:00 AM would read as the day's start), one accent Show — kept back, with the reason under it, while the end is not after the start. Field labels are the fields' 13/500. A popover (radius 16) on a desktop; a bottom sheet with a grabber, its title and close on a phone. **Sources**: a drawer out of the floating frame in its shape, hosting Home Assistant's own picker.
- **On a card** (a person's preference): the column in its own card (radius 20, hairline), its controls on the page's fill; the room at the foot stays outside the card.
- **A period across midnight** names each day above its first hour, and dates its start ("Start of the period · Sep 16"); a more-info's "Show more" reads **Last 24 hours**, the entity's name as the eyebrow.
- **Motion**: another day — its title turns in from where the day went while the list leaves that way (160 ms; the summary says "Loading…" meanwhile), a skeleton holds the place, the new rows rise (30 ms apart, 10 at most). A live entry opens its place from nothing (grid rows 0fr → 1fr, 320 ms; its clip has no padding, so the row and its spine are where every row's are) with a ring that grows and fades (transform, 1.4 s); counters roll up. "N new" sits in the pinned header's 40 band, whose count steps aside meanwhile. Fluvy's Reduce motion reaches the rail's and the dates' shadow roots too. While the view's file loads, the takeover keeps our bar (Home Assistant's menu on a phone, the page's name) — never a blank page. Layers leave with **keyframes of their own** (an animation that keeps its name is not restarted: a reversed direction alone never ends, and a click-catching scrim would stay) and a timer that removes them regardless.

## History page (`/history`, 2026-09-20)

*(approved at its fifth review round. Three rules it settled hold for every chart of
ours: a mark placed by value sits at its value, a curve drawn from samples reaches the window's own highest and
lowest reading, and nothing is read past the end of the record.)*

- **A card per measure, one scale.** Everything a house measures in the same unit and device class shares one chart and one scale: our smooth curve, drawn only as far as the record goes — a window that runs into the future keeps its room and stays empty, and nothing is read past that end, by pointer or by key. A lone curve takes the card's accent, gets the area under it (a gradient in its own colour, fading to nothing), the band a summarised reading moved between, and MIN / MAX / AVERAGE beneath; several curves take the palette's graph colours — each series the one its entity id hashes to, so a search keystroke, a "+N more" or another window never recolours a room's line — and a legend of a row each (dot, name, its reading at the cursor), with the rest folded behind "+N more" until it is asked for. A chart never draws more series than the palette has colours to tell apart. 44 of headroom over the highest reading is the bubble's, as on every chart of ours.
- **One unit, one precision per card.** The unit is the one a typical reading takes — a house averaging 592 W reads watts in its head, its legend, its bubble, its readouts and its scale marks; one averaging 4 kW reads kilowatts everywhere — so three readings of one measure can be compared by eye. The decimals follow what the card's readings reach in that unit (Home Assistant's own precision wins while the unit is untouched), and a measure that only ever reads whole numbers is written whole. A reading that is not there is a dash, never a zero.
- **What a height means**: two hairlines at what the window actually reached, high and low, each with its figure and its unit at the left. A card of one measure with no device class is named by that measure's own name, not by its unit.
- **One cursor.** A finger on any chart reads every chart at the same instant: the dashed line, a dot on each curve — placed on the curve the chart drew, never on a reading the line does not pass through — the bubble (only where a single curve makes it unambiguous, and leaning into the card's padding rather than let its tail leave the dot), the card's big readout with the instant as its label, and every legend row and state line at that instant. A finger lifts and the page reads now again; a mouse keeps the reading until it leaves. The instant is named at the window's own resolution: the clock through a day, the day and the hour through a week, the day alone through a month of daily averages. Both the charts and the state lines take the keys — ← → a step (Shift, five), Home, End, Escape — and the page says what it reads on one live line.
- **The state lines** are what is not a number: a row each, the busiest first — its name and what it was under the cursor over the window as a bar of stretches, at the card's full content column, so their cursor lands exactly where the charts' does. A stretch spent on takes the accent; one spent doing something else (paused, idle, returning, docked) the neutral ink; one the recorder knew nothing of, that ink striped; a resting one the page's own fill. Under them the same axis the charts carry, and "+N more" for the lines a card will not draw — the same button, in the same place, as the legend's.
- **The window** is the last 24 hours and follows the clock, so a page left open all morning still says what it shows; ‹ Today › walks it by its own length and never into the future, and the calendar opens the pages' shared picker (a popover on a desktop, a sheet on a phone). How it is read follows how wide it is: its own states up to two days, the hour's statistics up to eight, the day's beyond — a month of hourly means draws a comb, not a curve — and a summarised chart says which it is under its title.
- **The axis** names the window's own ends (saying which day they are when the clock alone would print the same words twice) and puts round marks between them — hours through a day, whole days beyond — as many as the width affords, each costing its own measured ink and a gap: three labels on a 320 phone, five or six at 1440, never a label outside the card's column.
- **Its sources** are Home Assistant's own picker in our drawer, with Clear and Done at its foot, and what is picked is kept where Home Assistant keeps it — its links (`?entity_id=…&start_date=…&back=1`) open the same window ours writes.
- **Nothing to draw** says which nothing it is: nothing picked yet, a window with no history, or a search no measure and no state answers — each one panel (the page's other fill) holding its line and its reason, with the way out under it.

## Shape

- Three shapes, one scale each (sm · md · control · lg · card · xl): **Soft** 4 · 8 · 12 · 16 · 20 · 24 (approved), **Round** 6 · 10 · 16 · 22 · 28 · 32, **Crisp** 2 · 6 · 8 · 12 · 14 · 18. Cards, tiles, controls and sheets use the role variables (`--fluvy-radius-card|lg|control|xl`); Home Assistant's radius names refer to ours, so a shape moves them too. Circles never change; the small functional radii (bars 2, bubbles 10) do not either.
- **Buttons (the pill-shaped things), chosen apart from the shape (2026-09-19)**: **Pill** (approved, fully round), **Soft** 12, **Crisp** 6 — `--fluvy-radius-pill`, and through it Home Assistant's `--ha-border-radius-pill`. Chips, tab rows, badges, the bottom nav, the panel's notice, HA's assist and filter chips and the more-info centre button follow it; a switch stays a capsule.
- **A look inside another declares what it lacks**: the names only some palettes write (a solid primary's edge, the highlight's mark) are declared `initial` by a look that has none, so a look worn inside another (the panel wearing the look being chosen, a dashboard inside a themed page) never shows the outer one's through.

## Colour (Linen)

- On/active = filled pastel surface with dark ink. Never a tinted icon on white.
- Warning is an amber (`--fluvy-warning`, hue 58, chroma ×1.15), distinct from the gold accent; used for open sensors, unreachable devices, and the `⚠` glyph, which is reserved for alerts.
- Energy tones: solar gold, grid lilac, battery green, generator the gas tone, a car the vehicle teal; destinations (the house, its consumers) are ink. See § Energy (1.4).
- Dark mode is re-derived, not inverted; glow on filled ticks only; no neon; no backdrop blur.

## View backgrounds

Generated, opaque, no images: the page colour plus three radial stops in the palette's own hues (`design/approved/backgrounds`). Light = **Paper** (warm mesh) or **Plain** (page alone, the default); dark = **Charcoal** (page + an amber breath); wall panels = **Wall** (Charcoal one step deeper). Cards keep their hairline separation on every one; no blur, no photo by default (room photos are an opt-in, processed 1.6:1 with a tinted scrim).

## Compositions

- **Phone** 392: side padding 16, content 360; status bar 44, hello 60, room tab chips (14 px, ink active, content-sized), section titles 24 with a "4 devices ›" meta, tiles 2 × 172, cards 360, bottom nav 60.
- **Desktop** 1440 × 1024: the HA shell drawn as HA draws it and only coloured by our tokens — sidebar 256 with HA's fixed logo on the icon column and a colourable title (brand row 44), items 40 high / radius 4 / 24 icons, selection = the selected-icon colour at 12 %, foot ending on the sections' bottom line; toolbar 76 with the dashboard name sized by content, view tabs as text with a 2 px accent selection bar, bare 44 icon buttons at the right. Content 1184 with 32 padding → three 352 columns (content 312) and 32 gaps, 16 between cards; first nav item top = first card top (84); all three columns end on one line (992). Cards stretch to the column: tiles 152 + 8 + 152, rulers 120 / 312, options 3 × 96 + 2 × 12, readout columns 96 with 12 gaps, five 56 transport rounds with 8 gaps, scene tiles 84, presence as three 60 rows (success dot = presence), the plug foot 56 + 64.
- **Tablet / wall** 1024 × 768 (HA's header 76 kept when the tablet is not a wall — title, text tabs, bare icon buttons; no invented bar; as a wall the header and the sidebar are gone and the dashboard fills the tablet, the wall template's two columns): 8 between the header and the first row, 24 at the bottom; content 960 → two 464 columns (content 424) ending on one line (84–744, 660 of content); tiles 208 + 8 + 208, rulers 176 / 424, readout columns 128 with 20 gaps. Type tiers for a panel read from 1–2 m: glance = the clock 40/44 in the hello card and the dial value 48 (dial drawn large at R 88), approach = 24 readouts and the 22 greeting (card titles stay 16, rows 15), touch = 13 subs. Dark is the default for a wall panel; a day/night theme schedule is a product setting, not a design.
- **Review sheets**: explicit 392 / 392 grid with a 48 gap on a 900 canvas (1504 / 1088 for the compositions); frames start-aligned; rows top-aligned. Sheets are the storybook of the implementation. Every sheet also renders with `--frame dark`.
