import {
  declarationsCss,
  derivePalette,
  lookDeclarations,
  paletteKey,
  seedOf,
  statusesKey,
  withStatuses,
  type Palette,
  type CssDeclaration,
  type PaletteChoice,
  type PaletteMode,
  type PillName,
  type ShapeName,
  type StatusColours,
} from '@fluvy/tokens/runtime';

import { CHROME_DEFAULTS, TABS_DEFAULTS, type Chrome, type ViewTabs } from './tabs.js';

export { paletteKey };

/**
 * What a user picks: a palette (a preset's name or a custom one), a shape, how round the pills are, and how the
 * dashboards' view tabs and the corner of every page look (absent: the defaults). Neither is a token: `lookKey`
 * leaves them out.
 */
export interface Look {
  readonly palette: PaletteChoice;
  readonly shape: ShapeName;
  readonly pills: PillName;
  readonly tabs?: ViewTabs;
  readonly chrome?: Chrome;
}

/** A look's tabs, the defaults when it names none. */
export const tabsOf = (look: Look): ViewTabs => look.tabs ?? TABS_DEFAULTS;

/** A look's corner (the sidebar's head, the hairlines, the header's surface), the defaults when it names none. */
export const chromeOf = (look: Look): Chrome => look.chrome ?? CHROME_DEFAULTS;

const palettes = new Map<string, Palette>();

/**
 * A palette derived once per choice (both modes, 1–2 ms), with the house's status colours over it where it has any
 * (`withStatuses`).
 */
export function paletteOf(choice: PaletteChoice, statuses: StatusColours = {}): Palette {
  const own = paletteKey(choice);
  const key = own + statusesKey(statuses);
  let palette = palettes.get(key);
  if (!palette) {
    palette =
      key === own
        ? derivePalette(seedOf(choice))
        : withStatuses(seedOf(choice), paletteOf(choice), statuses);
    palettes.set(key, palette);
  }
  return palette;
}

/** A stable key for a whole look. */
export const lookKey = (look: Look): string =>
  `${paletteKey(look.palette)}|${look.shape}|${look.pills}`;

/** One mode of a look as declarations, in the house's status colours. */
export const declarationsOf = (
  look: Look,
  mode: PaletteMode,
  statuses?: StatusColours,
): readonly CssDeclaration[] =>
  lookDeclarations(paletteOf(look.palette, statuses), mode, look.shape, look.pills);

/** One mode of a look as a CSS rule on `selector`; `important` to win over a theme Home Assistant set inline. */
export function lookRule(
  look: Look,
  mode: PaletteMode,
  selector: string,
  important = false,
  statuses?: StatusColours,
): string {
  return `${selector}{${declarationsCss(declarationsOf(look, mode, statuses), important)}}`;
}
