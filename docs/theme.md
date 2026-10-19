# The theme

Fluvy's theme is generated, not written: one set of design tokens (`packages/tokens`) is derived into the theme file
Home Assistant reads, the CSS the cards are drawn with, and the look engine that recolours everything live. What you
see in a card and in a Home Assistant dialog comes from the same numbers.

## The file

`themes/fluvy/fluvy.yaml`, installed by the integration, holds one theme, **Fluvy**, with a light and a dark mode;
Home Assistant decides which mode from your profile (light, dark, or the system's). The file carries the default
look, Linen; every other palette and shape is applied on top of it by the panel, live, without a reload — the theme
file is what paints the first frame and what Home Assistant's own dialogs and pages follow.

## Palettes

Fifteen presets in two lines, each with a light and a dark mode that are derived, not inverted:

- **pastel** — Linen (the default), Sand, Sage, Mist, Clay, Slate, Harbour, Dusk, Ember (designed dark first);
- **electric** — Blaze, Flamingo, Iris, Volt, Mint, Noir (dark first).

Or a **custom** accent: a base (warm, neutral or cool), an accent colour, an optional highlight and a fill (tint or
solid). Every palette — preset or custom — goes through the same generator and the same contrast gates: text at
4.5:1 at least, icons and large text at 3:1, cards separated from the page and from their borders. An accent that
cannot carry text at 4.5:1 gets a darker ink for text and keeps its full colour for icons and charts.

## Status colours

The palette also decides the statuses — the warning's amber, the danger's red, the success's green and information's
notice colour. The house may give any of them a colour of its own in the panel's *Appearance → Status colours*
([how](settings-panel.md#status-colours)): the theme then writes that status's tokens in it — `--fluvy-warning` and
its `-fill`, `-fill-border` and `-on-fill`, the same for `danger`, `success` and `notice`, and Home Assistant's
`--warning-color`, `--error-color`, `--success-color` and their `--ha-color-*` scales — fitted to the same gates as
the palette's own, on every palette and in both modes. `--fluvy-palette` then names them after the palette
(`linen|warning=#dc630b`), so a card that works a colour out for itself does so in them too.

## Share a palette

A custom palette travels as a file. In the panel's *Appearance* tab, with a custom accent chosen, the *Share* card
takes a title and an author and writes `<name>.fluvy-palette.json`; *Import a palette* reads one back onto the
gallery, where it is the palette chosen. An administrator may **save** it to the house's palettes — up to twelve,
shown under *Yours* in every browser of the house — or remove it. The palettes the community has contributed ship
with Fluvy under *Community* (six shown, *Show all* for the rest), each with its author beside it; a draft that equals
one of them is that palette, not "Custom". [How to contribute one](../CONTRIBUTING.md#contributing-a-palette).

## Shape and buttons

Three shapes set the radii of cards, tiles and controls: **soft** (20 / 16 / 12 px, the default), **round**
(28 / 22 / 16) and **crisp** (14 / 12 / 8). Circles and the rulers' 2 px lines never change. The buttons — the
pill-shaped things: chips, tabs, badges, the panel's notice — are chosen apart from the shape: a true **pill** (the
default), or the corners of a **soft** (12) or a **crisp** (6) button; a switch stays a capsule.

## A colour per card, and per item

A card's `color` is the accent inside that card. Lists of things you tell apart by colour also take a `color` on each
item: tiles, scenes, tabs (the chips card), people (a ring round their picture), openings (their circle), rows, bars,
stat tiles and lights. By default an item's colour shows while it is on. A colour can be:

- one of Home Assistant's colour names, from its picker (`teal`, `deep-orange`, `black` …), or the three its YAML
  knows besides: `primary-text`, `secondary-text` and `disabled`, your palette's own inks;
- a colour typed in: `#rrggbb`, `#rgb`, `rgb(…)`, or any CSS colour the browser reads. An opacity is dropped: the
  colour is drawn solid, so its words keep their contrast;
- `primary` (or `accent`): your palette's accent. On an item it is the palette's accent even inside a card with a
  colour of its own.

Cards work out their colours on the palette they wear, from the moment they are drawn: on a dashboard that wears the
look, and on one that does not (it then wears the look your house chose), in its editor too.

`tint: always` makes a coloured item show its colour at rest too, as a quiet wash of it with a hairline in the same
colour; an item without a colour of its own keeps the card's surface. It works on the tile card, a tiles group, a
room's tiles, room lights' tiles, scenes and tabs. The wash is as strong as the words on it allow (they always read at
full contrast), so it is softer in a dark, vivid palette. On, the item still takes its full fill:

```yaml
type: custom:fluvy-tiles-card
size: compact
tint: always
tiles:
  - entity: light.hall
    color: red
  - entity: switch.kettle
    color: '#e17055'
```

**A colour for the whole card** (1.7): `card_color` tints the card's own surface — a quiet wash of the colour as its
fill, its edge and dividers in the colour — so cards can be told apart at a glance: every light warm, every cover blue.
It is independent of `color`, so a warm card can still hold a teal item. The wash is as strong as the words on it
allow (they keep their full contrast), what is on inside keeps its own fill, and a card that is off or unavailable
goes back to the neutral surface: a state is never covered. What sits inside it on the page's fill — a round, the − and
+, an option, a chip, a resting circle — takes the wash's own deeper step instead (1.9). On a tiles group the colour is
each tile's surface, as the group has none of its own. In the editor it reads None until you choose one.

```yaml
type: custom:fluvy-lights-card
area: living_room
card_color: amber
```

A colour name is Home Assistant's tone for it on your palette — amber, for one, is the colour of a lit light, which a
palette may move aside to keep its own accent clear — so the whole dashboard stays in harmony. A `#rrggbb` is exactly
that colour.

**Black, the greys and white** (1.9) are six steps of one ladder in your palette's own greys: black, dark grey, blue
grey, grey, light grey, white, each a step lighter than the one before, and never a colour (blue grey keeps a hint of
cool). In light mode black is a black icon on a grey plate, and white an outlined pale disc; in dark mode black is a
plate deeper than the card and white a bright icon on the lightest plate. A grey you type in (`#000`, `#333333`,
`#ffffff`) lands on the same ladder by how light it is.

Because names follow the palette, two of them can land on one colour or close to it:

- on the electric palettes amber takes the lit light's colour there: deep purple's on Volt and Iris, teal's on Mint,
  grey's on Noir in light; and on Volt indigo sits close to amber too;
- on Mist, blue and amber are close in light;
- on every palette's pale fills, in light and in dark, neighbours on the wheel (red and deep orange for one) are hard
  to tell apart at rest.

For items that must stay apart, choose names far apart on the wheel (teal and deep orange, blue and pink), or give
them hex colours.

## Dashboard tabs

The view tabs in a dashboard's header — Home Assistant's own, the ones you pick a view with — take the look on every
dashboard that wears it, as the house chooses in *Appearance → Dashboard tabs*:

| Style | What the header shows |
| --- | --- |
| **Fluvy** (default) | the dashboard's name, then the views as words; the open one in the text's colour with the accent under exactly its name |
| **Pills** | the views as pills, the open one filled |
| **Original** | Home Assistant's own tabs, untouched |
| **Hidden** | no tabs (the views are reached from the dashboard itself) |

With Fluvy's tabs or pills, each tab shows the view's **name** (default), its **icon**, or **both**; a view without an
icon gets the one its name says, in any of Fluvy's languages ("Luces" a bulb, "Hab 1" a room), and keeps its words
when its name says none. The **dashboard's name** before the tabs is a switch of its own, in every style; on a phone
it gives way to the tabs, which scroll under the finger and fade where the row goes on. The edit mode, a subview and a dashboard of a
single view keep Home Assistant's header. A person who keeps their own look keeps their own tabs too.

## Sidebar and header

*Appearance → Sidebar and header* sets the corner of every page: **Home Assistant's logo** in the sidebar's head in
place of the menu icon (a tap on it still opens and closes the sidebar), the **dividers** under the sidebar's name and
under the header, the **header on the page** (no bar, the page's own colour) and the **actions in one menu**: add,
search, Assist and edit behind one "…", as Home Assistant draws them on a phone. All four on is the corner of Fluvy's
screenshots. The sidebar takes them where Fluvy styles all of Home Assistant (*Scope → Everywhere*); a
dashboard's header takes them wherever the dashboard wears the look. The edit mode keeps Home Assistant's header.

## Using the theme on its own

The theme works without the cards: choose it in your profile and every Home Assistant page takes Fluvy's colours,
type and radii. The cards, the shell and the pages need the integration; the theme alone is a theme.

## Tokens for your own cards

Every colour, radius and spacing Fluvy uses is a custom property, `--fluvy-*`, set on the page while the look is
applied (and on Fluvy's dashboards when the scope is "only dashboards"). A card of your own that reads
`var(--fluvy-accent)`, `var(--fluvy-card)` or `var(--fluvy-warning)` follows the palette and the house's status colours; the full list is what `packages/tokens` emits
(`pnpm build` writes it to `packages/tokens/dist/`). Home Assistant's own variables (`--primary-color`,
`--card-background-color`, the `--ha-color-*` scales, the state colours, the chart colours) are all set by the theme
file, so anything themed the Home Assistant way follows too.
