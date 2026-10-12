import type { EntityView } from '@fluvy/core';

/** Home Assistant's colour modes that carry a colour of their own (a white or a dimmed lamp does not). */
export const COLOURED: ReadonlySet<string> = new Set(['hs', 'rgb', 'rgbw', 'rgbww', 'xy']);

/** The colour modes under which a light dims: every mode but `onoff`. */
export const DIMMABLE: ReadonlySet<string> = new Set([
  'brightness',
  'color_temp',
  'hs',
  'xy',
  'rgb',
  'rgbw',
  'rgbww',
  'white',
]);

/** `[r, g, b]` as `#rrggbb`: each channel rounded and kept to 0–255, any further channel (white, warm white) left out. */
export const hexOf = (rgb: readonly number[]): string =>
  `#${rgb
    .slice(0, 3)
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** The colour a lit bulb glows (`#rrggbb`): its `rgb_color` while it is on in a colour mode; a white or an off bulb has none. */
export function bulbHex(view: EntityView, on: boolean): string | undefined {
  const rgb = view.attr<number[] | null>('rgb_color');
  return on &&
    COLOURED.has(view.attr<string | null>('color_mode') ?? '') &&
    Array.isArray(rgb) &&
    rgb.length >= 3
    ? hexOf(rgb)
    : undefined;
}
