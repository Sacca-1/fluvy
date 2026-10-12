import { hexOf } from '../shared/light.js';

/*
 * The quick colours' grammar, the part of it the card and its editor need before a colour bulb fetches the controls
 * (`colour.ts`): what an entry may be, the six a bulb gets by default, and the two transforms the rows editor edits
 * the list with — a config entry as a row, a row back as the smallest entry that says the same.
 */

export type Rgb = readonly [number, number, number];

/** A quick colour with a name of its own: `color` is any bare entry, `name` what its round says. */
export type SwatchObject = {
  readonly color: string | readonly number[];
  readonly name?: string;
};

/**
 * A quick colour as configured: `warm`, `cool`, one of Home Assistant's colour names, `#rrggbb` (or `#rgb`),
 * `[r, g, b]`, `picker` — the round that opens the browser's own colour picker — or any of those with a name.
 */
export type SwatchEntry = string | readonly number[] | SwatchObject;

/** A row of the editor: the select's value (a word, the picker, `custom` or a typed one), the well, the name. */
export type SwatchItem = {
  readonly color: string;
  readonly rgb?: Rgb;
  readonly name?: string;
};

/** The quick colours the editor offers by word, the picker's round last; a colour of your own comes as Custom. */
export const SWATCH_WORDS: readonly string[] = [
  'warm',
  'cool',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'picker',
];

/** The select's value for a colour of your own: the row then shows the colour well, and writes its hex. */
export const CUSTOM = 'custom';

/** What a fresh Custom row is before the well is touched: Home Assistant's orange, the picker's opening colour too. */
const CUSTOM_OPENS_ON: Rgb = [255, 152, 0];

/** The quick colours a bulb gets when the config lists none: two whites first where it has a temperature. */
const WITH_WHITES: readonly SwatchEntry[] = ['warm', 'cool', 'red', 'orange', 'green', 'blue'];
const COLOURS_ONLY: readonly SwatchEntry[] = ['red', 'orange', 'green', 'blue', 'purple', 'pink'];

export const defaultSwatches = (modes: readonly string[]): readonly SwatchEntry[] =>
  modes.includes('color_temp') ? WITH_WHITES : COLOURS_ONLY;

export const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** `#rrggbb` or `#rgb` (any case, the hash optional) as `[r, g, b]`; anything else nothing. */
export function rgbOf(text: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return undefined;
  const digits = match[1] ?? '';
  const hex = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** `[r, g, b]` (any further channel left out) with each channel kept to 0–255; anything that is not three numbers nothing. */
export function tripletOf(value: unknown): Rgb | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value.slice(0, 3);
  if (parts.length < 3 || parts.some((n) => typeof n !== 'number' || !Number.isFinite(n)))
    return undefined;
  return parts.map(clamp255) as unknown as Rgb;
}

const named = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * A config entry as the editor's row: a word (or the picker) is the select's value; a hex or a triplet is Custom
 * with its well; a Home Assistant colour name typed beside the words is kept as typed; a named entry keeps its name.
 * Anything that is none of these is dropped.
 */
export function swatchItem(raw: unknown): SwatchItem | null {
  if (typeof raw === 'string') {
    const text = raw.trim().toLowerCase();
    if (!text) return null;
    const rgb = rgbOf(text);
    return rgb ? { color: CUSTOM, rgb } : { color: text };
  }
  if (Array.isArray(raw)) {
    const rgb = tripletOf(raw);
    return rgb ? { color: CUSTOM, rgb } : null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { color, name } = raw as { color?: unknown; name?: unknown };
  const item = typeof color === 'string' || Array.isArray(color) ? swatchItem(color) : null;
  const label = named(name);
  return item && label ? { ...item, name: label } : item;
}

/**
 * A row back as its config entry, the smallest that says the same: a word alone is the bare word; a Custom row is
 * its hex (a fresh one Home Assistant's orange); a typed hex is its canonical `#rrggbb`; a name wraps the entry as
 * `{ color, name }`. A well left on a word row is stale and ignored. A row without a colour is nothing.
 */
export function swatchEntry(item: Readonly<Record<string, unknown>>): string | SwatchObject | null {
  const color = named(item['color'])?.toLowerCase();
  if (!color) return null;
  const custom = color === CUSTOM ? (tripletOf(item['rgb']) ?? CUSTOM_OPENS_ON) : rgbOf(color);
  const entry = custom ? hexOf(custom) : color;
  const name = named(item['name']);
  return name ? { color: entry, name } : entry;
}
