/**
 * The release gates as pure arithmetic (no Node, no report): every contrast pair and structural rule a palette ×
 * mode has to pass. The build's report (`contrast.ts`), the tests and the browser (a card's own colour checked
 * against the same bars) all read this one list.
 */
import {
  composite,
  contrastRatio,
  fromHex,
  hueDistance,
  deltaE,
  isHex,
  maxChroma,
  minPairwiseDeltaE,
  roundRatio,
} from '../color/index.js';
import { GATES, SECONDARY_ON_FILL } from '../build/derive.js';
import { accentDistance, hueNeighbours, stateHues } from '../build/separation.js';
import {
  RAMP_STEPS,
  SEMANTIC_ROLES,
  STATE_KEYS,
  type Hex,
  type Palette,
  type PaletteMode,
  type PaletteModeColors,
  type StateKey,
} from '../types.js';

export interface ContrastGate {
  readonly id: string;
  readonly foreground: Hex;
  readonly background: Hex;
  readonly min: number;
  readonly note?: string | undefined;
}

export interface ContrastResult extends ContrastGate {
  readonly ratio: number;
  readonly pass: boolean;
}

export interface StructuralResult {
  readonly id: string;
  readonly detail: string;
  readonly pass: boolean;
  /** Why the rule does not apply to this palette (it passes by definition, and the report says so). */
  readonly notApplicable?: string;
}

/** Every colour a mode ships, flattened for the format and uniqueness checks. */
export function collectHexValues(colors: PaletteModeColors): readonly (readonly [string, Hex])[] {
  const entries: (readonly [string, Hex])[] = [
    ['surface.page', colors.surface.page],
    ['surface.pageAlt', colors.surface.pageAlt],
    ['surface.card', colors.surface.card],
    ['surface.cardElevated', colors.surface.cardElevated],
    ['surface.border', colors.surface.border],
    ['surface.borderStrong', colors.surface.borderStrong],
    ['text.primary', colors.text.primary],
    ['text.secondary', colors.text.secondary],
    ['text.disabled', colors.text.disabled],
    ['text.onAccent', colors.text.onAccent],
    ['accent.ink', colors.accent.ink],
    ['accent.hover', colors.accent.hover],
    ['accent.text', colors.accent.text],
    ['accent.wash', colors.accent.wash],
    ['accent.fill', colors.accent.fill],
    ['accent.fillBorder', colors.accent.fillBorder],
    ['accent.onFill', colors.accent.onFill],
    ['highlight.ink', colors.highlight.ink],
    ['highlight.fill', colors.highlight.fill],
    ['highlight.fillBorder', colors.highlight.fillBorder],
    ['highlight.onFill', colors.highlight.onFill],
    ['selected.fill', colors.selected.fill],
    ['selected.on', colors.selected.on],
    ['unavailable.ink', colors.unavailable.ink],
    ['unavailable.border', colors.unavailable.border],
  ];
  for (const step of RAMP_STEPS) {
    entries.push([`neutralRamp.${step}`, colors.neutralRamp[step]]);
    entries.push([`accentRamp.${step}`, colors.accentRamp[step]]);
  }
  for (const [role, value] of [
    ...SEMANTIC_ROLES.map((role) => [`semantic.${role}`, colors.semantic[role]] as const),
    ['notice', colors.notice] as const,
  ]) {
    entries.push([`${role}.ink`, value.ink]);
    entries.push([`${role}.fill`, value.fill]);
    entries.push([`${role}.fillBorder`, value.fillBorder]);
    entries.push([`${role}.onFill`, value.onFill]);
  }
  for (const key of STATE_KEYS) {
    const value = colors.state[key];
    entries.push([`state.${key}.ink`, value.ink]);
    entries.push([`state.${key}.fill`, value.fill]);
    entries.push([`state.${key}.fillBorder`, value.fillBorder]);
    entries.push([`state.${key}.onFill`, value.onFill]);
  }
  colors.graph.forEach((hex, index) => entries.push([`graph.${index + 1}`, hex]));
  return entries;
}

/**
 * Every gated pair for one palette × mode.
 *
 * Text and value inks are checked against *both* card and page, because a dashboard
 * puts the same ink on both. Inks that only ever appear inside a card (graph series)
 * are checked against the card only.
 */
export function contrastGates(colors: PaletteModeColors): readonly ContrastGate[] {
  const { surface, text, accent } = colors;
  const card = surface.card;
  const page = surface.page;
  const isLight = colors.mode === 'light';
  /** Home Assistant's dialogs and bottom sheets (`ha/groups.ts`): the card in light, the lifted card in dark. */
  const dialog = isLight ? surface.card : surface.cardElevated;

  const gates: ContrastGate[] = [
    {
      id: 'surface/card-on-page',
      foreground: card,
      background: page,
      min: isLight ? GATES.cardVsPage : 1,
      note: isLight ? undefined : 'dark mode separates by the 4–6pp lift below, not by ratio',
    },
    {
      id: 'surface/border-on-card',
      foreground: surface.border,
      background: card,
      min: GATES.borderVsCard,
    },
    { id: 'text/primary-on-card', foreground: text.primary, background: card, min: GATES.text },
    { id: 'text/primary-on-page', foreground: text.primary, background: page, min: GATES.text },
    { id: 'text/secondary-on-card', foreground: text.secondary, background: card, min: GATES.text },
    { id: 'text/secondary-on-page', foreground: text.secondary, background: page, min: GATES.text },
    {
      id: 'text/disabled-on-card',
      foreground: text.disabled,
      background: card,
      min: GATES.icon,
      note: 'already composited at 70%',
    },
    // the ink is a graphic colour (a vivid one is not text); its text form carries links and labels
    { id: 'accent/ink-on-card', foreground: accent.ink, background: card, min: GATES.icon },
    { id: 'accent/ink-on-page', foreground: accent.ink, background: page, min: GATES.icon },
    { id: 'accent/text-on-card', foreground: accent.text, background: card, min: GATES.text },
    { id: 'accent/text-on-page', foreground: accent.text, background: page, min: GATES.text },
    { id: 'accent/on-fill', foreground: accent.onFill, background: accent.fill, min: GATES.onFill },
    {
      id: 'highlight/ink-on-card',
      foreground: colors.highlight.ink,
      background: card,
      min: GATES.icon,
    },
    {
      id: 'primary/on-primary',
      foreground: colors.primary.on,
      background: colors.primary.fill,
      min: GATES.text,
    },
    {
      id: 'primary/on-primary-hover',
      foreground: colors.primary.on,
      background: colors.primary.hover,
      min: GATES.text,
    },
    // Home Assistant's lesser buttons and quiet surfaces, as it draws them: the ink on both plates and on the
    // dialog, the page's text and the primary colour on the resting plate (a hovered day, an autofilled field)
    ...(
      [
        ['buttons/on-rest', colors.buttons.on, colors.buttons.rest, GATES.text],
        ['buttons/on-press', colors.buttons.on, colors.buttons.press, GATES.text],
        ['buttons/on-dialog', colors.buttons.on, dialog, GATES.text],
        ['buttons/text-on-rest', text.primary, colors.buttons.rest, GATES.text],
        ['buttons/primary-on-rest', accent.ink, colors.buttons.rest, GATES.icon],
      ] as const
    ).map(([id, foreground, background, min]) => ({ id, foreground, background, min })),
    ...(colors.mark
      ? [
          {
            id: 'mark/on-mark',
            foreground: colors.mark.on,
            background: colors.mark.fill,
            min: GATES.text,
          },
        ]
      : []),
    {
      id: 'selected/on-selected',
      foreground: colors.selected.on,
      background: colors.selected.fill,
      min: GATES.text,
    },
    {
      id: 'highlight/on-fill',
      foreground: colors.highlight.onFill,
      background: colors.highlight.fill,
      min: GATES.onFill,
    },
    {
      id: 'accent/fill-border',
      foreground: accent.fillBorder,
      background: accent.fill,
      min: GATES.borderVsCard,
    },
    {
      id: 'accent/text-on-accent',
      foreground: text.onAccent,
      background: accent.ink,
      min: GATES.text,
    },
    {
      // --primary-color maps to --ha-color-primary-40 in light and the theme leans on the
      // upper half of the ramp in dark; whichever step carries links has to clear AA.
      id: isLight ? 'ramp/accent-40-on-card' : 'ramp/accent-80-on-card',
      foreground: isLight ? colors.accentRamp['40'] : colors.accentRamp['80'],
      background: card,
      min: GATES.text,
    },
    {
      id: 'unavailable/ink-on-card',
      foreground: colors.unavailable.ink,
      background: card,
      min: GATES.icon,
    },
  ];

  // a resting icon circle: the role's ink on its fill (tint) or on a wash of it over its ground (solid);
  // an "on" surface: what sits on it (a switch, a ruler, an icon) in the fill's own ink, and its secondary
  // text (the on-fill ink at 80 %: a tile's state line on its on-fill, read at 4.5 in every palette)
  const solid = colors.fillStyle === 'solid';
  const wash = (fill: Hex): Hex => composite(fill, colors.washBase, colors.washShare);
  for (const [id, value] of [
    ['accent', colors.accent] as const,
    ...SEMANTIC_ROLES.map((role) => [`status/${role}`, colors.semantic[role]] as const),
    ['notice', colors.notice] as const,
    ...STATE_KEYS.map((key) => [`state/${key}`, colors.state[key]] as const),
  ]) {
    gates.push({
      id: `${id}-ink-on-wash`,
      foreground: value.ink,
      background: wash(value.fill),
      min: GATES.icon,
    });
    gates.push({
      id: `${id}-secondary-on-fill`,
      foreground: composite(value.onFill, value.fill, SECONDARY_ON_FILL),
      background: value.fill,
      min: GATES.text,
    });
    // the electric line's rules (round 1 of its review); the approved soft line keeps its values — a pass of
    // its own would raise the few plates that sit at 4.4 here
    if (colors.character !== 'vivid') continue;
    gates.push({
      id: `${id}-fill-ink-on-fill`,
      foreground: solid ? value.onFill : value.ink,
      background: value.fill,
      min: GATES.icon,
    });
  }

  // information (`notice`) is read as a status is: its ink as text (a count), its on-fill ink on its fill
  for (const [id, value] of [
    ...SEMANTIC_ROLES.map((role) => [`status/${role}`, colors.semantic[role]] as const),
    ['notice', colors.notice] as const,
  ]) {
    gates.push({
      id: `${id}-ink-on-card`,
      foreground: value.ink,
      background: card,
      min: GATES.text,
    });
    gates.push({
      id: `${id}-ink-on-page`,
      foreground: value.ink,
      background: page,
      min: GATES.text,
    });
    gates.push({
      id: `${id}-on-fill`,
      foreground: value.onFill,
      background: value.fill,
      min: GATES.onFill,
    });
  }

  for (const key of STATE_KEYS) {
    const value = colors.state[key];
    gates.push({
      id: `state/${key}-ink-on-card`,
      foreground: value.ink,
      background: card,
      min: GATES.icon,
    });
    gates.push({
      id: `state/${key}-ink-on-page`,
      foreground: value.ink,
      background: page,
      min: GATES.icon,
    });
    gates.push({
      id: `state/${key}-on-fill`,
      foreground: value.onFill,
      background: value.fill,
      min: GATES.onFill,
    });
  }

  colors.graph.forEach((hex, index) => {
    gates.push({
      id: `graph/${index + 1}-on-card`,
      foreground: hex,
      background: card,
      min: GATES.icon,
    });
  });

  return gates;
}

/** Runs the gates. Used by the build, the report and the test suite alike. */
export function checkContrast(colors: PaletteModeColors): readonly ContrastResult[] {
  return contrastGates(colors).map((gate) => {
    const ratio = roundRatio(contrastRatio(gate.foreground, gate.background));
    return { ...gate, ratio, pass: ratio >= gate.min };
  });
}

/** Smallest gap between two neighbouring domain-state hues around the full circle. */
function minStateHueGap(colors: PaletteModeColors, twins: readonly StateKey[]): number {
  return Math.min(360, ...hueNeighbours(stateHues(colors, twins)).map(({ gap }) => gap));
}

/** The palette's brand colour: its accent, or its fill where the accent's lines are the neutral ink (Noir in light). */
export function brandColour(colors: PaletteModeColors): Hex {
  return fromHex(colors.accent.ink).c < 0.02 ? colors.accent.fill : colors.accent.ink;
}

/** Rules that are not contrast ratios but still block a release. */
export function checkStructure(palette: Palette, mode: PaletteMode): readonly StructuralResult[] {
  const colors = palette[mode];
  const values = collectHexValues(colors);

  const malformed = values.filter(([, hex]) => !isHex(hex));
  const separation = minPairwiseDeltaE(colors.graph);
  const harmonySeparation = minPairwiseDeltaE(colors.graph.slice(0, 6));
  // Status and domain-state inks share one chroma band, so they are checked as one set:
  // a warning must not be mistakable for "solar", nor "battery" for "success".
  // (the twins are the accent itself: on the electric line it counts once among them — its distance from every
  // other role is asked, as `roles/accent-separation` asks it; a soft accent leans on its states on purpose)
  const roles = [
    ...SEMANTIC_ROLES.map((role) => colors.semantic[role]),
    ...STATE_KEYS.filter((key) => !palette.twins.includes(key)).map((key) => colors.state[key]),
    ...(palette.twins.length && palette.character === 'vivid' ? [colors.accent] : []),
  ];
  const roleInks = roles.map((role) => role.ink);
  const roleSeparation = minPairwiseDeltaE(roleInks);
  const fillSeparation = minPairwiseDeltaE(roles.map((role) => role.fill));
  const stateGap = minStateHueGap(colors, palette.twins);
  // the accent must not be mistaken for a device colour (a declared twin is the accent on purpose)
  const others = [
    ...SEMANTIC_ROLES.map((role) => [`status/${role}`, colors.semantic[role]] as const),
    ...STATE_KEYS.filter((key) => !palette.twins.includes(key)).map(
      (key) => [`state/${key}`, colors.state[key]] as const,
    ),
  ];
  const nearest = others
    .map(([id, value]) => ({ id, distance: accentDistance(colors, value) }))
    .sort((a, b) => a.distance - b.distance)[0];

  const results: StructuralResult[] = [
    {
      id: 'format/plain-hex',
      detail:
        malformed.length === 0
          ? `${values.length} values, all #rrggbb`
          : malformed.map(([id]) => id).join(', '),
      pass: malformed.length === 0,
    },
    {
      id: 'graph/harmony-separation',
      detail: `series 1-6: min ΔE2000 ${harmonySeparation.toFixed(1)} (>= ${GATES.graphSeparation})`,
      pass: harmonySeparation >= GATES.graphSeparation,
    },
    {
      id: 'graph/delta-e-separation',
      detail: `all 12: min ΔE2000 ${separation.toFixed(1)} (>= ${GATES.graphSeparation})`,
      pass: separation >= GATES.graphSeparation,
    },
    {
      id: 'roles/ink-separation',
      detail: `${roleInks.length} status + state inks: min ΔE2000 ${roleSeparation.toFixed(1)} (>= ${GATES.roleSeparation})`,
      pass: roleSeparation >= GATES.roleSeparation,
    },
    // a solid fill is the colour itself: the fills have to tell the roles apart as the inks do
    {
      id: 'roles/fill-separation',
      detail: `${roleInks.length} status + state fills: min ΔE2000 ${fillSeparation.toFixed(1)} (>= ${GATES.fillSeparation})`,
      pass: colors.fillStyle !== 'solid' || fillSeparation >= GATES.fillSeparation,
      ...(colors.fillStyle === 'solid' ? {} : { notApplicable: 'tint' }),
    },
    // an electric accent is loud enough to be mistaken for a device colour; a soft one leans on its states on purpose
    {
      id: 'roles/accent-separation',
      detail: nearest
        ? `nearest ${nearest.id}: ΔE2000 ${nearest.distance.toFixed(1)} (>= ${GATES.accentSeparation})`
        : 'no roles',
      pass: palette.character !== 'vivid' || !nearest || nearest.distance >= GATES.accentSeparation,
      ...(palette.character === 'vivid' ? {} : { notApplicable: 'soft' }),
    },
    // information (an alert of severity info) never reads as a warning or a danger: fill from fill, ink from ink
    ((): StructuralResult => {
      const { notice } = colors;
      const apart = Math.min(
        ...[colors.semantic.warning, colors.semantic.danger].flatMap((alarm) => [
          deltaE(notice.fill, alarm.fill),
          deltaE(notice.ink, alarm.ink),
        ]),
      );
      return {
        id: 'roles/notice-separation',
        detail: `notice from warning and danger, fills and inks: min ΔE2000 ${apart.toFixed(1)} (>= ${GATES.fillSeparation})`,
        pass: apart >= GATES.fillSeparation,
      };
    })(),
    // a lesser button answers the pointer, and its plates stand off the dialog they sit in
    ((): StructuralResult => {
      const dialog = mode === 'light' ? colors.surface.card : colors.surface.cardElevated;
      const step = deltaE(colors.buttons.rest, colors.buttons.press);
      const off = Math.min(
        deltaE(colors.buttons.rest, dialog),
        deltaE(colors.buttons.press, dialog),
      );
      return {
        id: 'buttons/feedback',
        detail: `rest → press ΔE2000 ${step.toFixed(1)}, plates off the dialog ${off.toFixed(1)} (>= ${GATES.feedback})`,
        pass: step >= GATES.feedback && off >= GATES.feedback,
      };
    })(),
    {
      id: 'roles/state-hue-spacing',
      detail: `min ${stateGap.toFixed(0)}° between domain states (>= ${GATES.stateHueGap}°)`,
      pass: stateGap >= GATES.stateHueGap,
    },
  ];

  if (mode === 'dark') {
    const lift = fromHex(colors.surface.card).l - fromHex(colors.surface.page).l;
    results.push({
      id: 'dark/card-lift',
      detail: `${(lift * 100).toFixed(1)}pp (${GATES.darkCardLift.min * 100}–${GATES.darkCardLift.max * 100})`,
      pass: lift >= GATES.darkCardLift.min - 0.002 && lift <= GATES.darkCardLift.max + 0.002,
    });
    results.push({
      id: 'dark/page-not-black',
      detail: colors.surface.page,
      pass: colors.surface.page !== '#000000' && fromHex(colors.surface.page).l > 0.1,
    });

    // Derived, not inverted: an inversion would flip the hue by roughly 180°.
    const lightAccent = fromHex(brandColour(palette.light));
    const darkAccent = fromHex(brandColour(colors));
    const drift = hueDistance(lightAccent.h, darkAccent.h);
    results.push({
      id: 'dark/accent-hue-preserved',
      detail: `${drift.toFixed(1)}° from light accent (< 25°)`,
      pass: drift < 25,
    });
    // a soft dark accent gives up chroma (a tinted surface vibrates on a dark ground); an electric one is the
    // palette, and keeps it
    if (palette.character === 'soft')
      results.push({
        id: 'dark/accent-desaturated',
        detail: `chroma ${darkAccent.c.toFixed(4)} vs light ${lightAccent.c.toFixed(4)}`,
        // a monochrome accent (a grey) has no chroma to give up
        pass: darkAccent.c < lightAccent.c || lightAccent.c < 0.012,
      });
  }

  if (palette.character === 'vivid') {
    const accent = fromHex(brandColour(colors));
    const share = accent.c / maxChroma(accent.l, accent.h);
    results.push({
      id: 'vivid/accent-chroma',
      detail: `accent at ${(share * 100).toFixed(0)} % of the gamut's chroma (>= ${GATES.vividAccentGamut * 100} %)`,
      pass: share >= GATES.vividAccentGamut,
    });
  }

  return results;
}
