/**
 * The house's own status colours (1.9): a warning, a danger, a success or a notice in a colour the house picked instead
 * of the palette's. Each picked colour is a status's whole family on the palette it sits on, in each mode — its ink,
 * its fill, the fill's hairline and the ink on it — derived as the palette's own statuses are, at the hue the house
 * chose: only the lightness moves (and the chroma sRGB cannot hold there), and only as far as the gates ask.
 */
import { composite, contrastRatio } from '../color/contrast.js';
import { deltaE } from '../color/delta-e.js';
import { ensureContrast, walkLightness } from '../color/fit.js';
import { fromHex, toHex, type Oklch } from '../color/oklch.js';
import { chromaEnvelope, peakChromaFrom } from '../color/ramp.js';
import type { Hex, Palette, PaletteModeColors, PaletteSeed, RoleColors } from '../types.js';
import { legibleUnder } from './derive/accent.js';
import { inkOn } from './derive/identity.js';
import { GATES } from './derive/limits.js';
import { profileOf, SECONDARY_ON_FILL, SOLID_STATUS_STEP } from './derive/profiles.js';

/** The statuses the house may colour: three of the palette's, and information (`notice`). */
export const STATUS_NAMES = ['warning', 'danger', 'success', 'notice'] as const;
export type StatusName = (typeof STATUS_NAMES)[number];
/** The house's picks: a status it names wears that colour; one it leaves out is the palette's own (Auto). */
export type StatusColours = Readonly<Partial<Record<StatusName, Hex>>>;

const HEX = /^#[0-9a-f]{6}$/i;

/** The picks out of anything stored: each a `#rrggbb`, lower case, in the statuses' order; anything else is Auto. */
export function parseStatuses(value: unknown): StatusColours {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const out: Partial<Record<StatusName, Hex>> = {};
  for (const name of STATUS_NAMES) {
    const pick = raw[name];
    if (typeof pick === 'string' && HEX.test(pick)) out[name] = pick.toLowerCase();
  }
  return out;
}

/**
 * The picks as the tail of a palette's key (`|warning=#dc630b|notice=#3b5bdb`), '' when every status is the palette's:
 * the look writes the whole where a card reads which palette it wears (`--fluvy-palette`), so a card derives its own
 * colours on the statuses the house chose too.
 */
export const statusesKey = (statuses: StatusColours): string =>
  STATUS_NAMES.map((name) => (statuses[name] ? `|${name}=${statuses[name]}` : '')).join('');

/** A palette's key and its statuses' tail apart (`statusesKey`); a tail it does not read is Auto. */
export function splitStatuses(key: string): {
  readonly palette: string;
  readonly statuses: StatusColours;
} {
  const [palette = '', ...picks] = key.split('|');
  return {
    palette,
    statuses: parseStatuses(Object.fromEntries(picks.map((pick) => pick.split('=')))),
  };
}

/**
 * How much more of the pick's chroma (gamut permitting), then how much deeper towards its ink, a plate may go to stand
 * apart from another status's.
 */
const BOLDER = [1, 1.25, 1.5, 1.75, 2, 2.5] as const;
const DEEPER = [0, 0.02, 0.04, 0.06] as const;

/**
 * A status's family in `pick` on one palette × mode. The ink is the pick itself, taken deeper (lighter in dark) only
 * until it reads as text on the card and the page (4.5) and as a glyph on its resting circle (3). The fill is the
 * palette's own plate for a status — a pale tint at the profile's fill lightness, or on a solid palette the colour
 * itself a status's step from the device colours — in the pick's hue and chroma, paled where the ink would not read on
 * it; its hairline stands 1.35 off it, and its ink reads at 4.5, its 80 % state line too. Where its ink or its fill sits
 * closer than `GATES.fillSeparation` to another status's (`others`), the ink goes deeper and the plate takes more of
 * the pick's chroma, then goes deeper too — never another hue — as far as that sets them apart; where nothing does, it
 * stays as it was (the panel says which two are close).
 */
export function statusFamily(
  seed: PaletteSeed,
  colors: PaletteModeColors,
  pick: Hex,
  others: readonly RoleColors[] = [],
): RoleColors {
  const { mode, surface, fillStyle } = colors;
  const p = profileOf(seed, mode);
  const away = mode === 'light' ? 'darker' : 'lighter';
  const color = fromHex(pick);
  const peak = peakChromaFrom(color.l, color.c);
  const at = (l: number, scale: number): Oklch => ({
    l,
    c: peak * chromaEnvelope(l) * scale,
    h: color.h,
  });
  const apart = (hex: Hex, part: 'ink' | 'fill'): boolean =>
    others.every((other) => deltaE(hex, other[part]) >= GATES.fillSeparation);
  const read = [surface.page, surface.card].reduce(
    (fitted, ground) => ensureContrast(fitted, ground, GATES.text, away),
    color,
  );
  // deeper reads better: a twentieth of the scale at most, and only where it sets the ink apart
  const deeper = walkLightness(read, away, (hex) => apart(hex, 'ink'), 25);
  let ink = apart(toHex(deeper), 'ink') ? deeper : read;
  const step = fillStyle === 'solid' ? SOLID_STATUS_STEP[mode] : { l: 0, chroma: 1 };
  const toward = mode === 'light' ? -1 : 1;
  const plates = DEEPER.flatMap((depth) =>
    BOLDER.map((bolder) =>
      legibleUnder(
        fillStyle,
        at(p.fillL + step.l + toward * depth, p.fillChromaScale * step.chroma * bolder),
        ink,
      ),
    ),
  );
  const fill = plates.find((plate) => apart(toHex(plate), 'fill')) ?? plates[0]!;
  const plate = toHex(fill);
  // a solid palette's resting circle is a wash of the fill: the glyph reads on it too
  ink = ensureContrast(ink, composite(plate, colors.washBase, colors.washShare), GATES.icon, away);
  const on = inkOn(fill);
  return {
    ink: toHex(ink),
    fill: plate,
    fillBorder: toHex(
      ensureContrast(
        { ...fill, l: fill.l + (on === 'darker' ? -1 : 1) * Math.abs(p.fillBorderDelta) },
        plate,
        GATES.borderVsCard,
        on,
      ),
    ),
    // the ink on the fill, as far as its state line (the ink at 80 % over the fill) reads as text: the ink itself does
    onFill: toHex(
      walkLightness(
        at(p.onFillL, p.onFillChromaScale),
        on,
        (hex) => contrastRatio(composite(hex, plate, SECONDARY_ON_FILL), plate) >= GATES.text,
      ),
    ),
  };
}

/**
 * A palette with the house's statuses: each one picked is its family on the palette in each mode (`statusFamily`), set
 * apart from the other statuses as they stand (the picks before it, the palette's own after), the others stay the
 * palette's; its key carries the picks (`statusesKey`). The palette's own statuses are kept beside (`named`): Home
 * Assistant's colour names (red, orange, green) are colours, not roles, and stay the palette's.
 */
export function withStatuses(
  seed: PaletteSeed,
  palette: Palette,
  statuses: StatusColours,
): Palette {
  const tail = statusesKey(statuses);
  if (!tail) return palette;
  const mode = (colors: PaletteModeColors): PaletteModeColors => {
    const { semantic } = colors;
    const now: Record<StatusName, RoleColors> = { ...semantic, notice: colors.notice };
    for (const name of STATUS_NAMES) {
      const pick = statuses[name];
      if (pick)
        now[name] = statusFamily(
          seed,
          colors,
          pick,
          STATUS_NAMES.filter((other) => other !== name).map((other) => now[other]),
        );
    }
    const { notice, ...picked } = now;
    return {
      ...colors,
      semantic: { ...semantic, ...picked },
      named: colors.named ?? semantic,
      notice,
    };
  };
  return {
    ...palette,
    key: palette.key + tail,
    light: mode(palette.light),
    dark: mode(palette.dark),
  };
}
