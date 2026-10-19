import { composite, contrastRatio } from '../color/contrast.js';
import { deltaE } from '../color/delta-e.js';
import { ensureContrast, type FitDirection } from '../color/fit.js';
import { fromHex, mixHue, type Oklch, toHex } from '../color/oklch.js';
import { buildRamp, chromaEnvelope } from '../color/ramp.js';
import {
  type FillStyle,
  type Hex,
  type Palette,
  type PaletteMode,
  type PaletteModeColors,
  type PaletteSeed,
  type RampStep,
  type RoleColors,
  SEMANTIC_ROLES,
  type SemanticRole,
  STATE_KEYS,
  type StateKey,
} from '../types.js';
import { deriveAccent, legibleUnder } from './derive/accent.js';
import { fitComposited, inkOn, type PaletteIdentity, readIdentity } from './derive/identity.js';
import { GATES, STATUS_INK_DEPTH, UNAVAILABLE_ALPHA } from './derive/limits.js';
import {
  type ModeProfile,
  profileOf,
  SOLID_FILL,
  SOLID_STATUS_STEP,
  washShareFor,
} from './derive/profiles.js';
import { type RoleTuning, STATE_TUNING } from './derive/roles.js';

export { GATES, UNAVAILABLE_ALPHA } from './derive/limits.js';
export { SECONDARY_ON_FILL } from './derive/profiles.js';

function deriveMode(
  identity: PaletteIdentity,
  mode: PaletteMode,
  p: ModeProfile,
  anchor: PaletteSeed | undefined,
  fillStyle: FillStyle,
): Omit<PaletteModeColors, 'notice'> {
  // Direction an ink has to move to gain contrast: darker on light grounds, lighter on dark.
  const inkDirection: FitDirection = mode === 'light' ? 'darker' : 'lighter';
  const neutralPeak = identity.neutralPeakChroma * p.neutralChromaScale;
  const accentPeak = identity.accentPeakChroma * p.accentChromaScale;
  const rolePeak = identity.rolePeakChroma * p.roleChromaScale;
  const graphPeak = identity.graphPeakChroma * p.graphChromaScale;

  const neutralAt = (l: number, chromaScale = 1): Oklch => ({
    l,
    c: neutralPeak * chromaEnvelope(l) * chromaScale,
    h: identity.neutralHue,
  });

  // --- Surfaces -------------------------------------------------------------
  // Cards are more neutral than the page: the tint belongs to the background, not
  // to the paper sitting on it.
  const cardOklch = anchor ? fromHex(anchor.card) : neutralAt(p.cardL, 0.6);
  const card = toHex(cardOklch);

  let pageOklch = anchor ? fromHex(anchor.page) : neutralAt(p.pageL);
  if (mode === 'light') {
    // Light mode separates card from page by luminance, so the page is pushed down
    // until the card clears the gate. Hue and chroma of the seed are preserved.
    pageOklch = ensureContrast(pageOklch, card, GATES.cardVsPage, 'darker');
  } else {
    // Dark mode separates by a fixed lightness lift instead: a luminance ratio that
    // small is invisible down there, and going further makes cards float.
    const lift = cardOklch.l - pageOklch.l;
    if (lift < GATES.darkCardLift.min || lift > GATES.darkCardLift.max) {
      pageOklch = { ...pageOklch, l: cardOklch.l - 0.05 };
    }
  }
  const page = toHex(pageOklch);

  const pageAlt = toHex(neutralAt(pageOklch.l + p.pageAltDelta));
  // A zero delta means "same surface as the card" (light mode), and it has to be the
  // literal card value: re-deriving it from the ramp would drift off an anchored seed by a
  // step of 8-bit rounding and read as an accidental second white.
  const cardElevated =
    p.cardElevatedDelta === 0 ? card : toHex(neutralAt(cardOklch.l + p.cardElevatedDelta, 0.6));
  const border = toHex(
    ensureContrast(
      neutralAt(cardOklch.l + p.borderDelta, p.borderChromaScale),
      card,
      GATES.borderVsCard,
      inkDirection,
    ),
  );
  const borderStrong = toHex(neutralAt(cardOklch.l + p.borderStrongDelta, p.borderChromaScale));

  // --- Text -----------------------------------------------------------------
  // Fit against whichever surface is the harder one for this mode: the page in light
  // (it is darker than the card), the card in dark (it is lighter than the page).
  const inkBackground = mode === 'light' ? page : card;

  const textPrimary = toHex(
    ensureContrast(neutralAt(p.textPrimaryL, 1.6), inkBackground, GATES.text, inkDirection),
  );
  const textSecondaryOklch = ensureContrast(
    neutralAt(p.textSecondaryL, 1.4),
    inkBackground,
    GATES.text,
    inkDirection,
  );
  const textSecondary = toHex(textSecondaryOklch);
  // Disabled/unavailable ships pre-composited: HA stores theme values as opaque strings.
  const textDisabled = fitComposited(
    textSecondaryOklch,
    card,
    UNAVAILABLE_ALPHA,
    GATES.icon,
    inkDirection,
  );

  // --- Accent ---------------------------------------------------------------
  const family = deriveAccent(
    {
      mode,
      profile: p,
      character: identity.character,
      limits: identity.limits,
      fillStyle,
      inkBackground,
      card,
      textPrimary,
      neutralHue: identity.neutralHue,
      neutralPeakChroma: neutralPeak,
    },
    {
      hue: identity.accentHue,
      peakChroma: accentPeak,
      graphPeakChroma: graphPeak,
      lightAccent: identity.lightAccent,
      fill: identity.accentFill,
      ...(anchor ? { anchor } : {}),
    },
  );
  const {
    ink: accentInk,
    text: accentText,
    fill: accentFill,
    fillBorder: accentFillBorder,
    onFill: accentOnFill,
    onAccent: textOnAccent,
    ramp: accentRamp,
    graph,
  } = family;

  // --- Highlight ------------------------------------------------------------
  // The second brand colour is a solid pop (a lime greeting): its fill as the seed gives it in the seeded
  // mode, re-derived at the solid fill's lightness in the other; black or white on it by contrast.
  const highlight = ((): RoleColors => {
    const h = identity.highlight;
    if (!h) {
      return {
        ink: accentInk,
        fill: accentFill,
        fillBorder: accentFillBorder,
        onFill: accentOnFill,
      };
    }
    const solid = SOLID_FILL[mode];
    const at = (l: number, chromaScale = 1): Oklch => ({
      l,
      c: h.peakChroma * chromaEnvelope(l) * chromaScale,
      h: h.hue,
    });
    // the seed's hex in both modes: a lime or a cyan works on white and on charcoal alike
    const fillOklch = h.fill;
    const fill = toHex(fillOklch);
    return {
      ink: toHex(ensureContrast(at(p.inkL), inkBackground, GATES.icon, inkDirection)),
      fill,
      fillBorder: toHex(
        ensureContrast(
          { ...fillOklch, l: fillOklch.l + solid.fillBorderDelta },
          fill,
          GATES.borderVsCard,
          inkOn(fillOklch),
        ),
      ),
      onFill: toHex(
        ensureContrast(
          at(inkOn(fillOklch) === 'darker' ? solid.onFillL : 0.96, solid.onFillChromaScale),
          fill,
          GATES.onFill,
          inkOn(fillOklch),
        ),
      ),
    };
  })();

  // --- Status and domain states --------------------------------------------
  // One builder for both: a colour the user reads on a card, plus the filled surface
  // and the ink that sits on it. That pairing is the whole "on/active" language —
  // a filled pastel plate with strong ink, never a tinted glyph floating on white.
  const buildRole = (tuning: RoleTuning, minInkRatio: number, assertive: boolean): RoleColors => {
    const hue = mixHue(tuning.hue, identity.accentHue, identity.limits.accentHuePull);
    const peak = Math.min(
      rolePeak * (tuning.chroma ?? 1) * (assertive ? identity.limits.statusChromaBoost : 1),
      identity.limits.maxRoleChroma * p.roleChromaScale,
    );
    const at = (l: number, chromaScale = 1): Oklch => ({
      l,
      c: peak * chromaEnvelope(l) * chromaScale,
      h: hue,
    });

    // "Deeper" means more contrast against the surface, which is darker in light mode and
    // lighter in dark mode — the tone tuning has to follow the mode, not the number line.
    const depth = (tuning.inkDepth ?? 0) + (assertive ? STATUS_INK_DEPTH : 0);
    const inkL = p.inkL + (mode === 'light' ? -depth : depth);

    const inkOklch = ensureContrast(at(inkL), inkBackground, minInkRatio, inkDirection);
    const ink = toHex(inkOklch);
    const step = assertive && fillStyle === 'solid' ? SOLID_STATUS_STEP[mode] : { l: 0, chroma: 1 };
    const fillOklch = legibleUnder(
      fillStyle,
      at(p.fillL + step.l, p.fillChromaScale * step.chroma),
      inkOklch,
    );
    const fill = toHex(fillOklch);
    const fillBorder = toHex(
      ensureContrast(
        { ...fillOklch, l: fillOklch.l + p.fillBorderDelta },
        fill,
        GATES.borderVsCard,
        inkOn(fillOklch),
      ),
    );
    const onFill = toHex(
      ensureContrast(at(p.onFillL, p.onFillChromaScale), fill, GATES.onFill, inkOn(fillOklch)),
    );
    return { ink, fill, fillBorder, onFill };
  };

  const semantic = Object.fromEntries(
    SEMANTIC_ROLES.map((role) => [role, buildRole(identity.statusTuning[role], GATES.text, true)]),
  ) as Record<SemanticRole, RoleColors>;

  const accentRole: RoleColors = {
    ink: accentInk,
    fill: accentFill,
    fillBorder: accentFillBorder,
    onFill: accentOnFill,
  };
  const state = Object.fromEntries(
    STATE_KEYS.map((key) => [
      key,
      identity.twins.includes(key)
        ? accentRole
        : buildRole(identity.stateTuning[key], GATES.icon, false),
    ]),
  ) as Record<StateKey, RoleColors>;

  // A resting icon circle of a solid palette carries a wash of its fill; in dark a wash of a light fill over
  // charcoal turns khaki, so it sits on the lifted neutral surface instead.
  // The wash backs off where an ink would sink into it (a cyan fill under a cyan line): every circle stays an icon.
  const washBase = fillStyle === 'solid' && mode === 'dark' ? cardElevated : card;
  const washShare =
    fillStyle === 'solid'
      ? mode === 'dark'
        ? 0
        : washShareFor([accentRole, ...Object.values(semantic), ...Object.values(state)], washBase)
      : 1;

  // --- Unavailable ----------------------------------------------------------
  // Deliberately neutral: an unreachable device is not an error, so it never goes red.
  // The dashed hairline in the lab carries the "something is missing" signal instead.
  const unavailable = {
    ink: textDisabled,
    border: composite(borderStrong, card, UNAVAILABLE_ALPHA),
  };

  return {
    mode,
    surface: { page, pageAlt, card, cardElevated, border, borderStrong },
    text: {
      primary: textPrimary,
      secondary: textSecondary,
      disabled: textDisabled,
      onAccent: textOnAccent,
    },
    accent: {
      ink: accentInk,
      hover: family.hover,
      text: accentText,
      wash: fillStyle === 'solid' ? composite(accentFill, washBase, washShare) : accentFill,
      fill: accentFill,
      fillBorder: accentFillBorder,
      onFill: accentOnFill,
    },
    highlight,
    selected: identity.highlight
      ? { fill: highlight.fill, on: highlight.onFill }
      : { fill: textPrimary, on: page },
    primary: family.primary,
    ...(identity.highlight ? { mark: { fill: highlight.fill, on: highlight.onFill } } : {}),
    buttons: (() => {
      // Home Assistant's own ramp steps (95 / 90 in light, 10 / 20 in dark), or the next pair when a palette's ramp
      // is too grey for them to stand off the dialog and answer the pointer
      const dialog = mode === 'light' ? card : cardElevated;
      const pairs: readonly (readonly [RampStep, RampStep])[] =
        mode === 'light'
          ? [
              ['95', '90'],
              ['90', '80'],
              ['80', '70'],
            ]
          : [
              ['10', '20'],
              ['20', '30'],
              ['30', '40'],
            ];
      const last: readonly [RampStep, RampStep] = mode === 'light' ? ['80', '70'] : ['30', '40'];
      const [restStep, pressStep] =
        pairs.find(
          ([r, p]) =>
            deltaE(accentRamp[r], dialog) >= GATES.feedback &&
            deltaE(accentRamp[p], dialog) >= GATES.feedback &&
            deltaE(accentRamp[r], accentRamp[p]) >= GATES.feedback &&
            // the primary colour on the resting plate (a hovered day's "today")
            contrastRatio(accentInk, accentRamp[r]) >= GATES.icon,
        ) ??
        pairs.find(([r]) => contrastRatio(accentInk, accentRamp[r]) >= GATES.icon) ??
        last;
      // a grey ramp (a monochrome palette) is too close to the dialog even there: its plates step off it
      const away = mode === 'light' ? -0.005 : 0.005;
      const standOff = (hex: Hex, ...from: readonly Hex[]): Hex => {
        let color = fromHex(hex);
        for (
          let i = 0;
          i < 40 && from.some((f) => deltaE(toHex(color), f) < GATES.feedback);
          i += 1
        )
          color = { ...color, l: color.l + away };
        return toHex(color);
      };
      const rest = standOff(accentRamp[restStep], dialog);
      const press = standOff(accentRamp[pressStep], dialog, rest);
      // the accent's text colour, a step deeper where the plates ask for it
      const direction = mode === 'light' ? 'darker' : 'lighter';
      const on = toHex(
        ensureContrast(
          ensureContrast(fromHex(accentText), press, GATES.text, direction),
          rest,
          GATES.text,
          direction,
        ),
      );
      return { rest, press, on };
    })(),
    character: identity.character,
    fillStyle,
    washBase,
    washShare,
    neutralRamp: buildRamp({ hue: identity.neutralHue, peakChroma: neutralPeak }),
    accentRamp,
    semantic,
    state,
    unavailable,
    graph,
  };
}

/** Hue anchors of the domain states, exposed so the report can gate their spacing. */
export const STATE_HUES: Readonly<Record<StateKey, number>> = Object.fromEntries(
  STATE_KEYS.map((key) => [key, STATE_TUNING[key].hue]),
) as Record<StateKey, number>;

/** The hue each status and domain state is tuned to in this palette: its anchor, moved by its character and seed. */
export function roleHues(seed: PaletteSeed): {
  readonly states: Readonly<Record<StateKey, number>>;
  readonly statuses: Readonly<Record<SemanticRole, number>>;
} {
  const identity = readIdentity(seed);
  return {
    states: Object.fromEntries(
      STATE_KEYS.map((key) => [key, identity.stateTuning[key].hue]),
    ) as Record<StateKey, number>,
    statuses: Object.fromEntries(
      SEMANTIC_ROLES.map((role) => [role, identity.statusTuning[role].hue]),
    ) as Record<SemanticRole, number>,
  };
}

/**
 * Seed → both modes.
 *
 * The seeded mode uses the designer's hexes as anchors, nudged along lightness only
 * where a gate demands it. The other mode is regenerated from the seed's hue and
 * chroma character through that mode's own profile — it is never a channel inversion,
 * which is why a dark mode derived from a warm light palette stays warm instead of
 * turning cyan.
 */
export function derivePalette(seed: PaletteSeed): Palette {
  const identity = readIdentity(seed);
  const [light, dark] = (['light', 'dark'] as const).map((mode) =>
    deriveMode(
      identity,
      mode,
      profileOf(seed, mode),
      seed.baseMode === mode ? seed : undefined,
      seed.fill ?? 'tint',
    ),
  ) as [ModeColors, ModeColors];
  // information is the accent only where it can never be read as a warning or a danger, in either mode
  const accent = apart(light) && apart(dark);
  const noticed = (colors: ModeColors): PaletteModeColors => ({
    ...colors,
    notice: accent ? accentNotice(colors) : colors.semantic.info,
  });
  return {
    name: seed.name,
    key: seed.key ?? seed.name,
    title: seed.title,
    description: seed.description,
    character: seed.character ?? 'soft',
    twins: identity.twins,
    light: noticed(light),
    dark: noticed(dark),
  };
}

type ModeColors = Omit<PaletteModeColors, 'notice'>;

/** The accent as information: its fill and on-fill, and its text colour as the ink (a count is read, at 4.5). */
const accentNotice = ({ accent }: ModeColors): RoleColors => ({
  ink: accent.text,
  fill: accent.fill,
  fillBorder: accent.fillBorder,
  onFill: accent.onFill,
});

/**
 * Whether the accent can carry information (`notice`, an alert of severity info): its fill and its ink stand
 * `fillSeparation` from the warning's and the danger's. A warm accent does not (Ember's peach is the warning's, Clay's
 * and Flamingo's sit on the danger's), and an update would read as urgent as a leak: there it is the status `info`.
 */
const apart = (colors: ModeColors): boolean => {
  const notice = accentNotice(colors);
  return [colors.semantic.warning, colors.semantic.danger].every(
    (alarm) =>
      deltaE(notice.fill, alarm.fill) >= GATES.fillSeparation &&
      deltaE(notice.ink, alarm.ink) >= GATES.fillSeparation,
  );
};
