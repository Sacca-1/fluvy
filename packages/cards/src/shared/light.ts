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

/** How a lit white shows its colour: as the palette's lit light (the default), or by its temperature. */
export type LightWhites = 'palette' | 'temperature';

/**
 * A white's colour as Home Assistant's own tile shows it: its `rgb_color` with the saturation lifted to 0.4 at the
 * same hue and value — or none under 0.1 (a daylight white): the palette's lit light, never Home Assistant's grey.
 */
function whiteHex(rgb: readonly number[]): string | undefined {
  const [r = 0, g = 0, b = 0] = rgb;
  const max = Math.max(r, g, b);
  const saturation = max ? (max - Math.min(r, g, b)) / max : 0;
  if (saturation < 0.1) return undefined;
  const lift = Math.max(1, 0.4 / saturation);
  return hexOf([r, g, b].map((c) => max - (max - c) * lift));
}

/**
 * The colour a lit bulb glows (`#rrggbb`): its `rgb_color` while it is on in a colour mode, and — `light_whites:
 * temperature` — in its white (`whiteHex`); a white otherwise, a light that only dims and an off one have none.
 */
export function bulbHex(
  view: EntityView,
  on: boolean,
  whites: LightWhites = 'palette',
): string | undefined {
  const rgb = view.attr<number[] | null>('rgb_color');
  if (!on || !Array.isArray(rgb) || rgb.length < 3) return undefined;
  const mode = view.attr<string | null>('color_mode') ?? '';
  if (COLOURED.has(mode)) return hexOf(rgb);
  return whites === 'temperature' && mode === 'color_temp' ? whiteHex(rgb) : undefined;
}

/**
 * The colour of lights glowing together (a group's members, a room's lights): each lit one's (`bulbHex`) weighted by
 * its brightness — a white adds nothing as the palette shows whites, so one red bulb among whites glows red, where
 * Home Assistant's own mean would wash it out; none: no member glows a colour.
 */
export function meanHex(lights: readonly EntityView[], whites?: LightWhites): string | undefined {
  let [r, g, b, weight] = [0, 0, 0, 0];
  for (const light of lights) {
    const hex = bulbHex(light, light.state === 'on', whites);
    if (!hex) continue;
    const share = light.attr<number>('brightness') || 255;
    const n = Number.parseInt(hex.slice(1), 16);
    r += ((n >> 16) & 255) * share;
    g += ((n >> 8) & 255) * share;
    b += (n & 255) * share;
    weight += share;
  }
  return weight ? hexOf([r / weight, g / weight, b / weight]) : undefined;
}

/** The colour each light last glowed on this page: what one switched on shows before Home Assistant says. */
const glowed = new Map<string, string>();

/**
 * The colour a light drawn lit glows: what Home Assistant says it glows (`bulbHex`; a group, its members' `meanHex`),
 * kept — or, while it is drawn on before Home Assistant has said so (the switch flipped), the one it last glowed, so
 * it never flashes the palette's light first.
 */
export function glowOf(
  view: EntityView,
  on: boolean,
  whites?: LightWhites,
  members: readonly EntityView[] = [],
): string | undefined {
  if (!on) return undefined;
  if (view.state !== 'on') return glowed.get(view.id);
  const hex = members.length ? meanHex(members, whites) : bulbHex(view, true, whites);
  if (hex) glowed.set(view.id, hex);
  else glowed.delete(view.id);
  return hex;
}
