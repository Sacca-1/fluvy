/**
 * The accent's family: every colour that follows from one hue and chroma on one palette × mode — the ink and its
 * hover and text forms, the fill with its border and ink, the ink on the solid accent, the primary action, the
 * accent ramp and the twelve graph series. Derived once for the palette's own accent (`derive.ts`) and again,
 * with the same arithmetic, for a card's own colour (`../accent-family.ts`). Part of `build/derive.ts`.
 */
import { contrastRatio } from '../../color/contrast.js';
import { minPairwiseDeltaE } from '../../color/delta-e.js';
import { ensureContrast, type FitDirection } from '../../color/fit.js';
import { fromHex, maxChroma, normalizeHue, type Oklch, toHex } from '../../color/oklch.js';
import { buildRamp, chromaEnvelope } from '../../color/ramp.js';
import {
  GRAPH_SERIES_COUNT,
  type FillStyle,
  type Hex,
  type PaletteCharacter,
  type PaletteMode,
  type PaletteSeed,
  type Ramp,
} from '../../types.js';
import { inkOn } from './identity.js';
import { GATES, type CharacterLimits } from './limits.js';
import { type ModeProfile, solidHover } from './profiles.js';
import { GRAPH_HARMONY } from './roles.js';

/** The palette × mode the family is derived on: what the accent is fitted against and drawn with. */
export interface AccentContext {
  readonly mode: PaletteMode;
  readonly profile: ModeProfile;
  readonly character: PaletteCharacter;
  readonly limits: CharacterLimits;
  readonly fillStyle: FillStyle;
  /** The surface an ink is fitted against: the page in light (darker than the card), the card in dark. */
  readonly inkBackground: Hex;
  readonly card: Hex;
  readonly textPrimary: Hex;
  readonly neutralHue: number;
  /** The neutral peak chroma, scaled for this mode. */
  readonly neutralPeakChroma: number;
}

/** The colour the family follows from. */
export interface AccentInput {
  readonly hue: number;
  /** Peak chroma, scaled for this mode (0: a monochrome accent). */
  readonly peakChroma: number;
  /** The graph series' peak chroma, scaled for this mode. */
  readonly graphPeakChroma: number;
  /** Too light to be a line on white (Noir's lime): a derived light mode draws its lines in ink. */
  readonly lightAccent: boolean;
  /** The colour as a fill, kept where the lines go neutral. */
  readonly fill: Oklch;
  /** The seeded mode's hexes, fitted rather than derived. */
  readonly anchor?: Pick<PaletteSeed, 'accentInk' | 'accentFill' | 'accentOnFill'>;
}

export interface AccentFamily {
  readonly ink: Hex;
  readonly hover: Hex;
  readonly text: Hex;
  readonly fill: Hex;
  readonly fillBorder: Hex;
  readonly onFill: Hex;
  /** Ink placed on the solid accent. */
  readonly onAccent: Hex;
  readonly primary: { readonly fill: Hex; readonly hover: Hex; readonly on: Hex };
  readonly ramp: Ramp;
  readonly graph: readonly Hex[];
  /** A resting circle as pale as the card draws this hairline round it (white, on the grey ladder). */
  readonly ring?: Hex;
}

/**
 * A tint is the plate an icon of its ink sits on (a resting icon circle): it steps away from the ink until the
 * glyph reads (the icon gate). A solid fill is the colour itself; its resting circles take a wash of it.
 */
export function legibleUnder(fillStyle: FillStyle, fill: Oklch, ink: Oklch): Oklch {
  return fillStyle === 'solid'
    ? fill
    : ensureContrast(fill, toHex(ink), GATES.icon, fill.l > ink.l ? 'lighter' : 'darker');
}

export function deriveAccent(ctx: AccentContext, input: AccentInput): AccentFamily {
  const { mode, profile: p, fillStyle, inkBackground } = ctx;
  const { anchor } = input;
  // Direction an ink has to move to gain contrast: darker on light grounds, lighter on dark.
  const inkDirection: FitDirection = mode === 'light' ? 'darker' : 'lighter';
  // Ink placed on the solid accent runs the other way, because the accent itself is
  // dark in light mode and light in dark mode — unless it is not: a vivid accent can be
  // light in light mode (an electric orange takes black ink), so the far end is the fallback.
  const onSolidDirection: FitDirection = mode === 'light' ? 'lighter' : 'darker';

  const neutralAt = (l: number, chromaScale = 1): Oklch => ({
    l,
    c: ctx.neutralPeakChroma * chromaEnvelope(l) * chromaScale,
    h: ctx.neutralHue,
  });
  const accentAt = (l: number, chromaScale = 1): Oklch => ({
    l,
    c: input.peakChroma * chromaEnvelope(l) * chromaScale,
    h: input.hue,
  });

  // A derived electric accent asks for nearly all the chroma its hue holds at that lightness (a green holds
  // far less than an orange): the palette stays electric in the mode nobody drew.
  function derivedAccent(): Oklch {
    const base = accentAt(p.accentL);
    if (ctx.character !== 'vivid' || input.peakChroma === 0) return base;
    return { ...base, c: Math.max(base.c, 0.9 * maxChroma(base.l, base.h)) };
  }
  // An accent too light to be a line on white (Noir's lime) keeps its colour as the fill in the derived light
  // mode and draws its lines in the ink: black, lime and white is Noir; an olive lime is not.
  const neutralLines = !anchor && mode === 'light' && input.lightAccent;
  const accentInkOklch = neutralLines
    ? fromHex(ctx.textPrimary)
    : ensureContrast(
        anchor ? fromHex(anchor.accentInk) : derivedAccent(),
        inkBackground,
        ctx.limits.accentInkGate,
        inkDirection,
      );
  const accentInk = toHex(accentInkOklch);
  // hover moves away from the end of the scale the ink is near (a lime would turn white, a black blacker)
  const hoverDelta =
    accentInkOklch.l > 0.85
      ? -Math.abs(p.accentHoverDelta)
      : accentInkOklch.l < 0.3
        ? Math.abs(p.accentHoverDelta)
        : p.accentHoverDelta;
  const accentHover = toHex({ ...accentInkOklch, l: accentInkOklch.l + hoverDelta });
  // a filled button under the pointer steps away from the ink on it (a black glyph on hot orange: the orange
  // lightens), so the glyph never loses contrast to the hover
  const awayFrom = (fill: Oklch, on: Hex): Oklch => ({
    ...fill,
    l: fill.l + (fromHex(on).l > fill.l ? -1 : 1) * Math.abs(p.accentHoverDelta),
  });
  // a soft ink already clears the text gate and comes back unchanged; a vivid one is taken deeper
  const accentText = toHex(ensureContrast(accentInkOklch, inkBackground, GATES.text, inkDirection));

  const accentFillOklch = legibleUnder(
    fillStyle,
    anchor
      ? fromHex(anchor.accentFill)
      : neutralLines
        ? input.fill
        : accentAt(p.fillL, p.fillChromaScale),
    accentInkOklch,
  );
  const accentFill = toHex(accentFillOklch);
  // the hairline starts a step towards the ink on the fill, the way it is fitted (a near-black plate's goes lighter)
  const accentFillBorder = toHex(
    ensureContrast(
      {
        ...accentFillOklch,
        l:
          accentFillOklch.l +
          (inkOn(accentFillOklch) === 'darker' ? -1 : 1) * Math.abs(p.fillBorderDelta),
      },
      accentFill,
      GATES.borderVsCard,
      inkOn(accentFillOklch),
    ),
  );
  const accentOnFill = toHex(
    ensureContrast(
      anchor ? fromHex(anchor.accentOnFill) : accentAt(p.onFillL, p.onFillChromaScale),
      accentFill,
      GATES.onFill,
      inkOn(accentFillOklch),
    ),
  );
  const onSolid = ensureContrast(
    neutralAt(p.onAccentL, 0.4),
    accentInk,
    GATES.text,
    onSolidDirection,
  );
  const textOnAccent = toHex(
    contrastRatio(toHex(onSolid), accentInk) >= GATES.text
      ? onSolid
      : ensureContrast(
          neutralAt(1 - p.onAccentL, 0.4),
          accentInk,
          GATES.text,
          onSolidDirection === 'lighter' ? 'darker' : 'lighter',
        ),
  );

  const ramp = buildRamp({ hue: input.hue, peakChroma: input.peakChroma });

  // --- Graph series ---------------------------------------------------------
  // Two tone rows over the six harmony hues: row one mid, row two one step deeper. The
  // small per-hue stagger inside each row is what keeps neighbours 30° apart legible.
  const series = (stretch: number): Hex[] =>
    [0, 1].flatMap((row) =>
      GRAPH_HARMONY.map((entry) => {
        const l = p.graphBaseL + (entry.lightnessOffset - row * p.graphToneDelta) * stretch;
        return toHex(
          ensureContrast(
            {
              l,
              c: input.graphPeakChroma * entry.chromaScale * chromaEnvelope(l),
              h: normalizeHue(input.hue + entry.hueOffset),
            },
            ctx.card,
            GATES.icon,
            inkDirection,
          ),
        );
      }),
    );
  // a hue the seeds were never tuned for (a card's own colour) can land two series a hair too close: the tone
  // stagger stretches, a little at a time, until every series stands apart — a seeded accent moves nothing
  let graph = series(1);
  for (
    let stretch = 1.1;
    stretch <= 1.6 && minPairwiseDeltaE(graph) < GATES.graphSeparation;
    stretch += 0.1
  )
    graph = series(stretch);
  if (graph.length !== GRAPH_SERIES_COUNT) {
    throw new Error(`Harmony yields ${graph.length} series, expected ${GRAPH_SERIES_COUNT}`);
  }

  return {
    ink: accentInk,
    hover: accentHover,
    text: accentText,
    fill: accentFill,
    fillBorder: accentFillBorder,
    onFill: accentOnFill,
    onAccent: textOnAccent,
    primary:
      fillStyle === 'solid'
        ? { fill: accentFill, hover: toHex(solidHover(accentFillOklch)), on: accentOnFill }
        : {
            fill: accentInk,
            hover: toHex(awayFrom(accentInkOklch, textOnAccent)),
            on: textOnAccent,
          },
    ramp,
    graph,
  };
}
