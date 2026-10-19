import { fromHex, toHex } from '../color/oklch.js';
import { buildRamp, peakChromaFrom, RAMP_LIGHTNESS } from '../color/ramp.js';
import type { Hex, PaletteModeColors, RampStep, SemanticRole } from '../types.js';

/**
 * Home Assistant's named colours (`--amber-color`, `--blue-color` …; the 25 its `ui_color` selector offers less
 * `primary` and `accent`, which are the palette's own), each as the colour of ours it stands for. One table for
 * two readers: the theme writes the 21 Home Assistant declares (`ha/groups.ts`), and a card's `color` resolves a
 * name through it (`resolveAccent`), so a card asking for "teal" is the teal every Home Assistant surface shows.
 * Each name keeps the tone Home Assistant gives it: pink is the armed alarm's red-rose, cyan the water, teal the
 * presence green-blue, lime the dehumidifier's green, brown the gas — never a second accent.
 */
export const HA_COLOR_NAMES = [
  'red',
  'pink',
  'orange',
  'deep-orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'light-green',
  'teal',
  'cyan',
  'blue',
  'light-blue',
  'indigo',
  'purple',
  'deep-purple',
  'brown',
  'light-grey',
  'grey',
  'dark-grey',
  'blue-grey',
  'black',
  'white',
] as const;
export type HaColorName = (typeof HA_COLOR_NAMES)[number];

/**
 * An 11-step ramp from the hue and chroma of one of our status inks (the accent ramp's recipe); `named`: the palette's
 * own status, under the house's (a colour name stays the palette's colour).
 */
export function statusRamp(
  colors: PaletteModeColors,
  role: SemanticRole,
  named = false,
): Readonly<Record<string, Hex>> {
  const ink = fromHex(((named && colors.named) || colors.semantic)[role].ink);
  return buildRamp({ hue: ink.h, peakChroma: peakChromaFrom(ink.l, ink.c) });
}

/**
 * The six neutral names, darkest first, each at the lightness of a step of the palette's neutral ramp: the rungs of
 * the grey ladder a card's colour is drawn on (`build/accent-family.ts`), where a typed grey lands by its lightness.
 */
export const NEUTRAL_RUNGS: readonly (readonly [HaColorName, RampStep])[] = [
  ['black', '05'],
  ['dark-grey', '40'],
  ['blue-grey', '50'],
  ['grey', '60'],
  ['light-grey', '80'],
  ['white', '95'],
];

/** Blue-grey is the one grey with a hue: a whisper of Home Assistant's own (#607d8b), never enough to be a colour. */
const BLUE_GREY = { c: 0.022, h: 229 } as const;

export const NAMED_COLORS: Readonly<Record<HaColorName, (colors: PaletteModeColors) => Hex>> = {
  red: (c) => statusRamp(c, 'danger', true)['50'] as Hex,
  pink: (c) => c.state['security-armed'].ink,
  orange: (c) => statusRamp(c, 'warning', true)['50'] as Hex,
  'deep-orange': (c) => c.state['climate-heat'].ink,
  amber: (c) => c.state['light-active'].ink,
  yellow: (c) => c.state['energy-solar'].ink,
  lime: (c) => c.state['climate-dry'].ink,
  green: (c) => statusRamp(c, 'success', true)['50'] as Hex,
  'light-green': (c) => c.state['energy-battery'].ink,
  teal: (c) => c.state['presence-home'].ink,
  cyan: (c) => c.state['energy-water'].ink,
  blue: (c) => c.state['climate-cool'].ink,
  'light-blue': (c) => c.semantic.info.ink,
  indigo: (c) => c.state['energy-grid'].ink,
  purple: (c) => c.state['media-playing'].ink,
  'deep-purple': (c) => c.state['energy-home'].ink,
  brown: (c) => c.state['energy-gas'].ink,
  'light-grey': (c) => c.neutralRamp['80'],
  grey: (c) => c.neutralRamp['60'],
  'dark-grey': (c) => c.neutralRamp['40'],
  'blue-grey': () => toHex({ l: RAMP_LIGHTNESS['50'], ...BLUE_GREY }),
  // the palette's own black and white: the ends of its neutral ramp, never #000 or #fff
  black: (c) => c.neutralRamp['05'],
  white: (c) => c.neutralRamp['95'],
};

/** The 21 names Home Assistant's theme declares (it has no `--black-color` or `--white-color` of a theme's). */
export const THEME_COLOR_NAMES: readonly HaColorName[] = HA_COLOR_NAMES.filter(
  (name) => name !== 'black' && name !== 'white',
);

export function isHaColorName(value: unknown): value is HaColorName {
  return typeof value === 'string' && (HA_COLOR_NAMES as readonly string[]).includes(value);
}

/** The names Home Assistant reads from a dashboard's YAML beside its picker's: its theme's own inks. */
const INK_NAMES: Readonly<Record<string, (colors: PaletteModeColors) => Hex>> = {
  'primary-text': (c) => c.text.primary,
  'secondary-text': (c) => c.text.secondary,
  disabled: (c) => c.unavailable.ink,
};

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
/** `rgb(…)` or `rgba(…)`, with commas or spaces, an alpha after a comma or a slash. */
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)%?\s*)?\)$/;

/** Three channels as `#rrggbb`; nothing unless each is a number from 0 to 255. */
function hexOf(parts: readonly unknown[]): Hex | undefined {
  const n = parts.map((part) => (typeof part === 'number' && Number.isFinite(part) ? part : NaN));
  if (n.some((v) => Number.isNaN(v) || v < 0 || v > 255)) return undefined;
  return `#${n.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A card's `color` as a colour: one of Home Assistant's names (its picker's, or `primary-text`, `secondary-text` and
 * `disabled` from YAML), a hex of any length and case, `rgb(…)`, or an `[r, g, b]` triplet — as `#rrggbb`, its
 * opacity dropped (none at all is no colour). `primary`, `accent`, `none`, `state`, an empty value and anything else
 * are nothing: the card keeps the palette's accent.
 */
export function resolveAccent(choice: unknown, colors: PaletteModeColors): Hex | undefined {
  if (Array.isArray(choice)) return choice.length === 3 ? hexOf(choice) : undefined;
  if (typeof choice !== 'string') return undefined;
  const text = choice.trim().toLowerCase();
  if (isHaColorName(text)) return NAMED_COLORS[text](colors);
  if (Object.hasOwn(INK_NAMES, text)) return INK_NAMES[text]!(colors);
  const hex = HEX.exec(text)?.[1];
  if (hex) {
    const long = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return long.slice(6) === '00' ? undefined : `#${long.slice(0, 6)}`;
  }
  const rgb = RGB.exec(text);
  if (!rgb || Number(rgb[4] ?? 1) === 0) return undefined;
  return hexOf(rgb.slice(1, 4).map(Number));
}
