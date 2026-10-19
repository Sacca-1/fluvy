import { composite, contrastRatio } from '../color/contrast.js';
import { deltaE } from '../color/delta-e.js';
import { ensureContrast, walkLightness } from '../color/fit.js';
import { fromHex, hueDistance, type Oklch, toHex } from '../color/oklch.js';
import { chromaEnvelope, peakChromaFrom, RAMP_LIGHTNESS } from '../color/ramp.js';
import { NEUTRAL_RUNGS } from '../ha/named.js';
import { accentAnchors, GREY_CHROMA } from '../palettes/custom.js';
import { restWash } from '../emit/vars.js';
import type { Hex, PaletteModeColors, PaletteSeed } from '../types.js';
import { deriveAccent, type AccentContext, type AccentFamily } from './derive/accent.js';
import { readIdentity } from './derive/identity.js';
import { GATES } from './derive/limits.js';
import { profileOf, SECONDARY_ON_FILL } from './derive/profiles.js';

export type { AccentFamily } from './derive/accent.js';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * A card's own colour on the palette it sits on: the family the accent would have had, had the palette been
 * seeded with `pick` — its hue and chroma read as `readIdentity` reads a seed's accent (clamped into the
 * character's band), fitted against this palette's own surfaces, in this mode, with the mode's profile. A grey is
 * drawn on the grey ladder instead (`neutralFamily`). The palette's states, statuses and surfaces are not touched:
 * only what the accent owns.
 */
export function accentFamily(
  seed: PaletteSeed,
  colors: PaletteModeColors,
  pick: Hex,
): AccentFamily {
  const identity = readIdentity(seed);
  const { limits, character } = identity;
  const p = profileOf(seed, colors.mode);
  const base = profileOf(seed, seed.baseMode);
  const color = fromHex(pick);
  const neutralPeak = identity.neutralPeakChroma * p.neutralChromaScale;
  const ctx: AccentContext = {
    mode: colors.mode,
    profile: p,
    character,
    limits,
    fillStyle: colors.fillStyle,
    inkBackground: colors.mode === 'light' ? colors.surface.page : colors.surface.card,
    card: colors.surface.card,
    textPrimary: colors.text.primary,
    neutralHue: identity.neutralHue,
    neutralPeakChroma: neutralPeak,
  };
  // a pick this close to grey is a grey (as a custom palette's accent is), and so is every grey of the palette's
  // own, whatever its rounding: never lifted into the character's chroma band, where it would read as a colour
  if (color.c < Math.max(GREY_CHROMA, neutralPeak + 0.003))
    return neutralFamily(ctx, colors, color);
  const peak = clamp(
    peakChromaFrom(color.l, color.c / base.accentChromaScale),
    ...limits.accentChroma,
  );
  return deriveAccent(ctx, {
    hue: color.h,
    peakChroma: peak * p.accentChromaScale,
    graphPeakChroma: clamp(peak, ...limits.graphChroma) * p.graphChromaScale,
    lightAccent: character === 'vivid' && color.l > 0.85,
    fill: accentAnchors(color, character, colors.fillStyle).fill,
  });
}

/**
 * The palette's own accent as a family, as the theme writes it: what an item that asks for `primary` or `accent`
 * wears, under a card's colour too.
 */
export function paletteAccent(colors: PaletteModeColors): AccentFamily {
  return {
    ...colors.accent,
    onAccent: colors.text.onAccent,
    primary: colors.primary,
    ramp: colors.accentRamp,
    graph: colors.graph,
  };
}

/* ---------- the grey ladder ---------- */

/** The six names' lightness, darkest first: where each stands on the ladder (`NEUTRAL_RUNGS`). */
const RANKS = NEUTRAL_RUNGS.map(([, step]) => RAMP_LIGHTNESS[step]);
const LAST = RANKS.length - 1;

/** Where a grey stands on the ladder, 0 black … 1 white: its lightness between the six names' own, so a typed one lands between. */
export function ladderPosition(l: number): number {
  const above = RANKS.findIndex((rank) => l <= rank);
  if (above === 0) return 0;
  if (above < 0) return 1;
  const below = RANKS[above - 1]!;
  return (above - 1 + (l - below) / (RANKS[above]! - below)) / LAST;
}

/** A ladder's lightnesses on one palette × mode: each rung's plate, and the ink at either end. */
interface Ladder {
  readonly fills: readonly number[];
  readonly inks: readonly [black: number, white: number];
}

const ladders = new WeakMap<PaletteModeColors, Ladder>();

/** `count` lightnesses of `grey` from `a` to `b`, both included, an equal CIEDE2000 step apart. */
function evenly(a: Oklch, b: Oklch, count: number, grey: (l: number) => Oklch): number[] {
  const samples = Array.from({ length: 49 }, (_, i) => a.l + ((b.l - a.l) * i) / 48);
  const along = [0];
  for (let i = 1; i < samples.length; i += 1)
    along.push(along[i - 1]! + deltaE(toHex(grey(samples[i - 1]!)), toHex(grey(samples[i]!))));
  const total = along.at(-1)!;
  return Array.from({ length: count }, (_, k) => {
    const goal = (total * k) / (count - 1);
    let i = 1;
    while (i < samples.length - 1 && along[i]! < goal) i += 1;
    const span = along[i]! - along[i - 1]!;
    const share = span > 0 ? Math.min(1, (goal - along[i - 1]!) / span) : 0;
    return samples[i - 1]! + (samples[i]! - samples[i - 1]!) * share;
  });
}

/** What the ladder keeps above each gate: a grey with a hue of its own (blue-grey) is fitted on the palette's. */
const MARGIN = 0.15;
/** A plate this far from the card (contrast) is seen at a glance. */
const SEEN = 1.6;
/** From here up the ladder (white, and a typed near-white) a resting circle in light is outlined. */
const OUTLINED = 0.9;

/**
 * The ladder of one palette × mode, in its own greys. The plates: an "on" surface stands off the card as any
 * colour's does (`GATES.fillSeparation`) and carries its words (the on-fill ink, and its 80 % state line, at 4.5) and
 * its glyph (3:1). In light black's is the deepest that still does under a near-black word, white's the palest; in
 * dark black's is the hole under the card, the others lift above it, white's to the palest a light word still reads
 * on. The inks: black's is the text in light (a black glyph) and the dimmest still legible in dark; white's the
 * other way round. In between, the plates are an equal step apart to the eye, the inks an equal step in lightness.
 */
function ladderOf(ctx: AccentContext, colors: PaletteModeColors): Ladder {
  const known = ladders.get(colors);
  if (known) return known;
  const grey = (l: number): Oklch => ({
    l,
    c: ctx.neutralPeakChroma * chromaEnvelope(l),
    h: ctx.neutralHue,
  });
  const dark = colors.mode === 'dark';
  const text = colors.text.primary;
  const { card } = colors.surface;
  const cardL = fromHex(card).l;
  const onFill = toHex(grey(dark ? fromHex(text).l : RAMP_LIGHTNESS['05']));
  const offCard = (fill: Hex): boolean => deltaE(fill, card) >= GATES.fillSeparation + MARGIN;
  const wash = (fill: Hex): Hex => composite(fill, colors.washBase, colors.washShare);
  // the plate furthest from the card: black's in light, white's in dark, where the words and the text's glyph still read
  const far = walkLightness(
    grey(dark ? 0.6 : 0.5),
    dark ? 'darker' : 'lighter',
    (fill) =>
      contrastRatio(composite(onFill, fill, SECONDARY_ON_FILL), fill) >= GATES.text + MARGIN &&
      contrastRatio(text, wash(fill)) >= GATES.icon + MARGIN,
  );
  // the plate next to the card: white's in light (its words read on it as on any lighter one), black's under it in dark
  const near = walkLightness(grey(cardL), 'darker', offCard);
  // the faintest ink that reads on its ground at the accent's gate, and as a glyph on the faintest circle: white's in
  // light, on the page and its own; black's in dark, on the card and a solid palette's lifted circle
  const floor = [ctx.inkBackground, dark ? colors.washBase : wash(toHex(near))].reduce(
    (ink, ground, i) =>
      ensureContrast(
        ink,
        ground,
        i ? GATES.icon + MARGIN : ctx.limits.accentInkGate,
        dark ? 'lighter' : 'darker',
      ),
    grey(fromHex(ctx.inkBackground).l),
  ).l;
  const ladder: Ladder = dark
    ? {
        fills: [near.l, ...evenly(walkLightness(grey(cardL), 'lighter', offCard), far, LAST, grey)],
        inks: [floor, fromHex(text).l],
      }
    : { fills: evenly(far, near, LAST + 1, grey), inks: [fromHex(text).l, floor] };
  ladders.set(colors, ladder);
  return ladder;
}

/**
 * A grey's family: black, the greys and white as six distinct, ordered, never chromatic rungs of one ladder (a grey
 * typed lands between them by its lightness). Each keeps the palette's own greys' hue — a grey with a hue of its own
 * (blue-grey) a whisper of it, never enough to be a colour. Light mode: black is a black glyph on a grey plate, each
 * rung lighter in its glyph and its plate, white the palest plate with the palest legible glyph. Dark mode: black is
 * the plate under the card with the dimmest legible glyph — it never turns white — and white a near-white glyph on
 * the most lifted plate. A solid palette's resting circle is still a wash of the plate.
 */
function neutralFamily(ctx: AccentContext, colors: PaletteModeColors, pick: Oklch): AccentFamily {
  const { fills, inks } = ladderOf(ctx, colors);
  // the palette's own greys (and an achromatic pick) in its greys' hue and chroma; a grey that leans elsewhere keeps
  // its lean, as a whisper
  const own = pick.c >= 0.004 && hueDistance(pick.h, ctx.neutralHue) > 20;
  const hue = own ? pick.h : ctx.neutralHue;
  const peak = own ? Math.min(peakChromaFrom(pick.l, pick.c), GREY_CHROMA) : ctx.neutralPeakChroma;
  const at = (l: number): Hex => toHex({ l, c: peak * chromaEnvelope(l), h: hue });
  const t = ladderPosition(pick.l);
  const rung = Math.min(LAST - 1, Math.floor(t * LAST));
  const share = t * LAST - rung;
  // dark's first step crosses the card: a plate there would be the card, so it is one side or the other
  const crosses = colors.mode === 'dark' && rung === 0;
  const card = colors.surface.card;
  // a plate seen on the card is seen in its rest wash too (`tint: always`): a grey has nothing but its lightness to
  // show it, so it steps past the few plates whose 40 % would still be the card
  const fill = walkLightness(
    fromHex(
      at(
        crosses
          ? fills[share < 0.5 ? 0 : 1]!
          : fills[rung]! + (fills[rung + 1]! - fills[rung]!) * share,
      ),
    ),
    colors.mode === 'dark' ? 'lighter' : 'darker',
    (plate) =>
      contrastRatio(plate, card) < SEEN ||
      contrastRatio(restWash(plate, card, colors), card) >= GATES.cardVsPage,
  ).l;
  const family = deriveAccent(ctx, {
    hue,
    peakChroma: peak,
    graphPeakChroma: ctx.limits.graphChroma[0] * ctx.profile.graphChromaScale,
    lightAccent: false,
    fill: fromHex(at(fill)),
    anchor: {
      accentInk: at(inks[0] + (inks[1] - inks[0]) * t),
      accentFill: at(fill),
      // a near-black word on a light plate, the text's own near-white on a dark one
      accentOnFill: at(
        colors.mode === 'dark' ? fromHex(colors.text.primary).l : RAMP_LIGHTNESS['05'],
      ),
    },
  });
  // white on a white card is an outlined disc: its plate's hairline round its resting circle
  return colors.mode === 'light' && t >= OUTLINED ? { ...family, ring: family.fillBorder } : family;
}
