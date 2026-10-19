/**
 * Shared vocabulary for the token system.
 *
 * Everything Home Assistant's JavaScript can read must ship as a plain `#rrggbb`
 * string: `theme2hex` passes `oklch()`, `hsl()` and `color-mix()` straight through
 * and later concatenates an alpha suffix onto them, producing invalid colors.
 * OKLCH is therefore an internal working space only — see `color/oklch.ts`.
 */

/** Lowercase `#rrggbb`. The only colour format that leaves this package. */
export type Hex = string;

export type PaletteMode = 'light' | 'dark';

/** Steps of an 11-step ramp. Higher number = lighter, matching `--ha-color-*-05…95`. */
export const RAMP_STEPS = [
  '05',
  '10',
  '20',
  '30',
  '40',
  '50',
  '60',
  '70',
  '80',
  '90',
  '95',
] as const;

export type RampStep = (typeof RAMP_STEPS)[number];

export type Ramp = Readonly<Record<RampStep, Hex>>;

/** Muted status roles. Deliberately pastel: no fluorescent greens, no alarm red. */
export const SEMANTIC_ROLES = ['success', 'warning', 'danger', 'info'] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

/**
 * Domain state colours. These are the entity states a dashboard actually shows;
 * each one keeps a recognisable hue anchor (heat is warm, cool is blue) while being
 * pulled slightly towards the palette accent so a board reads as one system.
 */
export const STATE_KEYS = [
  'light-active',
  'climate-heat',
  'climate-cool',
  'climate-dry',
  'climate-fan',
  'media-playing',
  'presence-home',
  'security-armed',
  'energy-grid',
  'energy-solar',
  'energy-battery',
  'energy-home',
  'energy-gas',
  'energy-water',
] as const;
export type StateKey = (typeof STATE_KEYS)[number];

/** Number of categorical series emitted as `--graph-color-1…N`. */
export const GRAPH_SERIES_COUNT = 12;

export interface SurfaceColors {
  /** Dashboard background. */
  readonly page: Hex;
  /** `--secondary-background-color`: sunken in light, lifted in dark. */
  readonly pageAlt: Hex;
  /** Card surface. Lighter than the page in both modes. */
  readonly card: Hex;
  /** Popovers and dialogs, one notch away from `card`. */
  readonly cardElevated: Hex;
  /** 1px hairline that closes the card edge (>= 1.35:1 against `card`). */
  readonly border: Hex;
  /** Dividers and focus outlines. */
  readonly borderStrong: Hex;
}

export interface TextColors {
  readonly primary: Hex;
  readonly secondary: Hex;
  /** Already composited at 70% over `card`, because HA needs an opaque hex. */
  readonly disabled: Hex;
  /** Ink placed on the solid accent (`--text-primary-color`). */
  readonly onAccent: Hex;
}

/** A filled pastel surface plus the ink that sits on it — the "on/active" pattern. */
export interface RoleColors {
  /** Ink on `card`/`page`: icons, values, links. */
  readonly ink: Hex;
  /** Filled surface for the active state. */
  readonly fill: Hex;
  /** Hairline around the filled surface. */
  readonly fillBorder: Hex;
  /** Ink on `fill`. Dark in light mode, light in dark mode. */
  readonly onFill: Hex;
}

export interface AccentColors extends RoleColors {
  /** Hover/pressed variant of `ink`. */
  readonly hover: Hex;
  /** A resting icon circle: the fill itself in a tint palette, a wash of it over the card in a solid one. */
  readonly wash: Hex;
  /**
   * The accent as text (links, a link-button's label): always >= 4.5:1 on card and page. A soft palette's ink
   * already is, so the two are the same colour; a vivid ink is a graphic colour (>= 3:1) and its text is the
   * same hue taken deeper.
   */
  readonly text: Hex;
}

export interface UnavailableColors {
  /** Neutral ink composited at 70%. Never red. */
  readonly ink: Hex;
  readonly border: Hex;
}

export interface PaletteModeColors {
  readonly mode: PaletteMode;
  readonly surface: SurfaceColors;
  readonly text: TextColors;
  readonly accent: AccentColors;
  /** The second brand colour (the greeting, today, a primary highlight); the accent where a palette has none. */
  readonly highlight: RoleColors;
  /** Where you are (the open tab): the ink as a pill, or the highlight where a palette has one. */
  readonly selected: { readonly fill: Hex; readonly on: Hex };
  /**
   * The primary action (a play button, the round "+", a command row's first): the accent with its ink in a
   * tint palette, the solid fill with its on-fill ink in a solid one.
   */
  readonly primary: { readonly fill: Hex; readonly hover: Hex; readonly on: Hex };
  /**
   * Home Assistant's lesser buttons and quiet surfaces (a filled Save, a plain Cancel's hover and press, a date
   * picker's hovered day, an autofilled field), on the steps of the accent ramp Home Assistant itself uses: a
   * resting plate, a pressed one, and one ink that reads on both and on the dialog.
   */
  readonly buttons: { readonly rest: Hex; readonly press: Hex; readonly on: Hex };
  /**
   * You and today (the avatar, the calendar's today), marked with the palette's second brand colour; a palette
   * without one has no mark, and each of those places keeps its own accent design.
   */
  readonly mark?: { readonly fill: Hex; readonly on: Hex };
  readonly character: PaletteCharacter;
  /** How this palette fills an "on" surface; a solid palette washes its resting icon circles into the card. */
  readonly fillStyle: FillStyle;
  /** The resting icon circle's ground: the card, or the lifted surface in a dark solid palette. */
  readonly washBase: Hex;
  /** The share of a role's fill a resting icon circle carries over `washBase` (1 in a tint palette). */
  readonly washShare: number;
  readonly neutralRamp: Ramp;
  readonly accentRamp: Ramp;
  readonly semantic: Readonly<Record<SemanticRole, RoleColors>>;
  /**
   * Information as a tone (an alert of severity info): the accent where it can never be read as a warning or a
   * danger, else the status `info`. One choice for the palette, the same in both modes (`derivePalette`).
   */
  readonly notice: RoleColors;
  /**
   * The palette's own statuses where the house picked colours of its own (`withStatuses`, 1.9): what Home Assistant's
   * colour names stand for (red, orange, green are colours, not roles, and stay the palette's). Absent: `semantic`.
   */
  readonly named?: Readonly<Record<SemanticRole, RoleColors>>;
  readonly state: Readonly<Record<StateKey, RoleColors>>;
  readonly unavailable: UnavailableColors;
  readonly graph: readonly Hex[];
}

/**
 * How loud a palette is. `soft`: pastel — chroma capped at about a third of what sRGB holds, warm or cool greys,
 * inks deep enough to read as text. `vivid`: electric — the accent at full chroma for icons, strokes and fills,
 * near-neutral greys, near-black ink, with the same contrast gates (a vivid accent is a graphic colour; its
 * text is derived deeper).
 */
export type PaletteCharacter = 'soft' | 'vivid';

/** How an "on" surface is filled: a pale tint of its colour with a deep ink, or the colour itself, solid, with black or white on it. */
export type FillStyle = 'tint' | 'solid';

export interface Palette {
  readonly name: string;
  /** The choice this palette stands for (`paletteKey`): a preset's name, or a custom palette's fields. */
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly character: PaletteCharacter;
  /**
   * The domain states that are the accent itself (their separation from the accent is not asked): a seed's declared
   * twin, and a light that is on — the palette's own colour, as the rest of the tile.
   */
  readonly twins: readonly StateKey[];
  readonly light: PaletteModeColors;
  readonly dark: PaletteModeColors;
}

/**
 * A designer-supplied starting point. Only the mode named by `baseMode` is given;
 * the other mode is derived (never channel-inverted) by `build/derive.ts`.
 * Any anchor that misses a contrast gate is nudged along lightness only, so the
 * hue and chroma the designer chose survive.
 */
export interface PaletteSeed {
  readonly name: string;
  /** A custom palette's key (`paletteKey`); a preset's is its name. */
  readonly key?: string;
  readonly title: string;
  readonly description: string;
  readonly baseMode: PaletteMode;
  readonly page: Hex;
  readonly card: Hex;
  readonly accentInk: Hex;
  readonly accentFill: Hex;
  readonly accentOnFill: Hex;
  /** Default `soft`. */
  readonly character?: PaletteCharacter;
  /** Default `tint`. Only a vivid palette fills solid. */
  readonly fill?: FillStyle;
  /** A second brand colour, given as its fill (a lime greeting); the same hex in both modes. Default: the accent. */
  readonly highlight?: Hex;
  /** A domain state that is the brand colour itself (Mint's "home", Iris's house): it takes the accent's colours. */
  readonly twin?: StateKey;
  /** A state moved away from the accent (Blaze's heat to red): its hue anchor and chroma, for this palette only. */
  readonly states?: Readonly<
    Partial<Record<StateKey, { readonly hue?: number; readonly chroma?: number }>>
  >;
  /** A status moved away from the accent (Mint's success, yellower than its green), for this palette only. */
  readonly statuses?: Readonly<
    Partial<Record<SemanticRole, { readonly hue?: number; readonly chroma?: number }>>
  >;
}
