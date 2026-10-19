import { GATES, derivePalette, roleHues } from '../build/derive.js';
import { accentDistance, hueNeighbours, stateHues } from '../build/separation.js';
import { deltaE } from '../color/delta-e.js';
import { fromHex, maxChroma, normalizeHue, toHex, type Oklch } from '../color/oklch.js';
import { PALETTE_MODES } from '../config.js';
import { paletteKey } from './key.js';
import {
  SEMANTIC_ROLES,
  STATE_KEYS,
  type FillStyle,
  type Hex,
  type Palette,
  type PaletteCharacter,
  type PaletteSeed,
  type RoleColors,
  type SemanticRole,
  type StateKey,
} from '../types.js';

/** The ground a custom palette sits on. */
export type CustomBase = 'warm' | 'neutral' | 'cool';
export const CUSTOM_BASES: readonly CustomBase[] = ['warm', 'neutral', 'cool'];

/** A palette made from a handful of choices instead of a preset. */
export interface CustomPalette {
  readonly character: PaletteCharacter;
  readonly base: CustomBase;
  /** Any colour; a soft palette tames it, a vivid one keeps it. */
  readonly accent: Hex;
  /** Vivid only. */
  readonly fill?: FillStyle;
  /** Vivid only: a second brand colour (the greeting, today). */
  readonly highlight?: Hex;
}

const HEX = /^#[0-9a-f]{6}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

/** A well-formed custom palette out of anything (stored settings, a shared file); anything else is undefined. */
export function parseCustomPalette(value: unknown): CustomPalette | undefined {
  if (!isRecord(value)) return undefined;
  const { character, base, accent, fill, highlight } = value;
  if (!oneOf(character, ['soft', 'vivid'] as const)) return undefined;
  if (!oneOf(base, CUSTOM_BASES) || typeof accent !== 'string' || !HEX.test(accent))
    return undefined;
  return {
    character,
    base,
    accent: accent.toLowerCase() as Hex,
    ...(character === 'vivid' && oneOf(fill, ['tint', 'solid'] as const) ? { fill } : {}),
    ...(character === 'vivid' && typeof highlight === 'string' && HEX.test(highlight)
      ? { highlight: highlight.toLowerCase() as Hex }
      : {}),
  };
}

/** Page greys per character and base: the soft ones carry a tint, the vivid ones are nearly neutral. */
export const PAGES: Readonly<Record<PaletteCharacter, Readonly<Record<CustomBase, Hex>>>> = {
  soft: { warm: '#f5f2ec', neutral: '#f2f2f0', cool: '#eef1f4' },
  vivid: { warm: '#f3f2f0', neutral: '#f1f2f4', cool: '#eef1f6' },
};

/**
 * The seed a custom palette stands for: its greys, a tint or solid fill and its ink from the accent. An electric
 * one also makes room for its accent, as the presets were tuned by hand to: the accent keeps its share of the
 * gamut, and the status and device colours step aside from it (see `makeRoom`).
 */
export function customSeed(custom: CustomPalette): PaletteSeed {
  const key = paletteKey(custom);
  const known = remembered.get(key);
  if (known) return known;
  const seed = {
    ...(custom.character === 'vivid' ? makeRoom(keepShare(plainSeed(custom))) : plainSeed(custom)),
    key,
  };
  remembered.set(key, seed);
  // the panel asks again for every colour a picker passes through: keep the last few
  if (remembered.size > REMEMBERED) remembered.delete(remembered.keys().next().value as string);
  return seed;
}

const REMEMBERED = 24;
const remembered = new Map<string, PaletteSeed>();

/**
 * A pick this close to grey is a grey: its whisper of a hue would be raised to the palette's chroma floor and read
 * as a colour nobody chose (a pale lilac turned into the grid's blue). It becomes a monochrome palette, as Noir's
 * lines are.
 */
export const GREY_CHROMA = 0.03;

/** What a picked colour gives an accent to start from: its ink, its fill and the ink on that fill (in OKLCH). */
export interface AccentAnchors {
  readonly ink: Oklch;
  readonly fill: Oklch;
  readonly onFill: Oklch;
}

/**
 * The starting points a picked colour gives an accent — the derivation fits every one of them to its gate: a soft
 * ink no lighter than mid, a vivid one as picked; a tint's fill pale and its ink deep, a solid's fill the colour
 * itself with near-black on it. A pick this close to grey is a grey (see `GREY_CHROMA`).
 */
export function accentAnchors(
  pick: Oklch,
  character: PaletteCharacter,
  fillStyle: FillStyle = 'tint',
): AccentAnchors {
  const accent = pick.c < GREY_CHROMA ? { ...pick, c: 0 } : pick;
  const vivid = character === 'vivid';
  const solid = vivid && fillStyle === 'solid';
  return {
    ink: vivid ? accent : { ...accent, l: Math.min(accent.l, 0.5) },
    fill: solid
      ? { l: 0.84, c: Math.min(accent.c, 0.16), h: accent.h }
      : { l: 0.93, c: Math.min(accent.c * 0.25, 0.05), h: accent.h },
    onFill: solid ? { l: 0.2, c: 0.02, h: accent.h } : { l: 0.33, c: accent.c * 0.6, h: accent.h },
  };
}

function plainSeed(custom: CustomPalette): PaletteSeed {
  const vivid = custom.character === 'vivid';
  const anchors = accentAnchors(fromHex(custom.accent), custom.character, custom.fill);
  return {
    name: 'custom',
    title: 'Custom',
    description: '',
    baseMode: 'light',
    character: custom.character,
    ...(vivid ? { fill: custom.fill ?? 'tint' } : {}),
    ...(vivid && custom.highlight ? { highlight: custom.highlight } : {}),
    page: PAGES[custom.character][custom.base],
    card: '#ffffff',
    accentInk: toHex(anchors.ink),
    accentFill: toHex(anchors.fill),
    accentOnFill: toHex(anchors.onFill),
  };
}

/** A colour's share of the chroma sRGB can hold at its lightness and hue. */
function share(color: Oklch): number {
  const most = maxChroma(color.l, color.h);
  return most > 0 ? color.c / most : 0;
}

/**
 * An electric pick keeps its share of the gamut when its line has to go deeper to be seen: a pastel pink becomes
 * a hot pink on white, not a dusty one.
 */
function keepShare(seed: PaletteSeed): PaletteSeed {
  const pick = fromHex(seed.accentInk);
  const ink = fromHex(derivePalette(seed).light.accent.ink);
  if (pick.c < 0.012 || share(ink) >= share(pick) - 0.01) return seed;
  return {
    ...seed,
    accentInk: toHex({ l: ink.l, c: share(pick) * maxChroma(ink.l, pick.h), h: pick.h }),
  };
}

type RoleRef = readonly ['states', StateKey] | readonly ['statuses', SemanticRole];

/** A status or device colour too close to something it must not be mistaken for: the hue it steps away from. */
interface Crowded {
  readonly ref: RoleRef;
  readonly from: number;
}

/**
 * Everything the release gates would find too close, in both modes: a status or device colour on the accent,
 * two of them on each other (by ink, and by fill where fills are solid), two domain states a hair apart round
 * the wheel.
 */
function crowding(palette: Palette): readonly Crowded[] {
  const found: Crowded[] = [];
  for (const mode of PALETTE_MODES) {
    const colors = palette[mode];
    const roles: { readonly ref: RoleRef; readonly colors: RoleColors }[] = [
      ...SEMANTIC_ROLES.map((key) => ({
        ref: ['statuses', key] as const,
        colors: colors.semantic[key],
      })),
      ...STATE_KEYS.filter((key) => !palette.twins.includes(key)).map((key) => ({
        ref: ['states', key] as const,
        colors: colors.state[key],
      })),
    ];
    const hueOf = (hex: Hex): number => fromHex(hex).h;
    const accentHue = hueOf(colors.accent.ink);
    roles.forEach((role, i) => {
      if (accentDistance(colors, role.colors) < GATES.accentSeparation)
        found.push({ ref: role.ref, from: accentHue });
      for (const other of roles.slice(i + 1)) {
        // a solid fill is the colour itself: two fills alike say the same thing, even with their inks apart
        const inks = deltaE(role.colors.ink, other.colors.ink) < GATES.roleSeparation;
        const fills =
          colors.fillStyle === 'solid' &&
          deltaE(role.colors.fill, other.colors.fill) < GATES.fillSeparation;
        if (!inks && !fills) continue;
        found.push({ ref: role.ref, from: hueOf(other.colors.ink) });
        found.push({ ref: other.ref, from: hueOf(role.colors.ink) });
      }
    });
    for (const { a, b, gap } of hueNeighbours(stateHues(colors, palette.twins))) {
      if (gap >= GATES.stateHueGap) continue;
      found.push({ ref: ['states', a.key], from: b.hue });
      found.push({ ref: ['states', b.key], from: a.hue });
    }
  }
  return found;
}

/** Degrees a crowded colour turns per round, and how far from its own hue it may end up (a warning stays amber). */
const STEP = 4;
const REACH = { states: 32, statuses: 24 } as const;
const ROUNDS = 40;

/** Signed angle from `from` to `to`, in (-180, 180]. */
function turn(from: number, to: number): number {
  const delta = normalizeHue(to - from);
  return delta > 180 ? delta - 360 : delta;
}

/** Turns every crowded colour one step away from what crowds it, within its reach; nothing when none could move. */
function stepAside(
  seed: PaletteSeed,
  crowded: readonly Crowded[],
  anchors: ReturnType<typeof roleHues>,
): PaletteSeed | undefined {
  const current = roleHues(seed);
  const hueOf = ([kind, key]: RoleRef): number =>
    kind === 'states' ? current.states[key] : current.statuses[key];
  const everyHue = [...Object.values(current.states), ...Object.values(current.statuses)];
  // straight on top of what crowds it: the colour turns towards the wider gap on the wheel
  const roomier = (hue: number): number => {
    const ahead = Math.min(
      ...everyHue.map((other) => normalizeHue(other - hue)).filter((d) => d > 0.5),
    );
    const behind = Math.min(
      ...everyHue.map((other) => normalizeHue(hue - other)).filter((d) => d > 0.5),
    );
    return ahead >= behind ? 1 : -1;
  };

  // each push counts more the closer it comes from
  const pushes = new Map<string, { ref: RoleRef; sum: number }>();
  for (const { ref, from } of crowded) {
    const away = turn(from, hueOf(ref));
    const entry = pushes.get(ref.join('/')) ?? { ref, sum: 0 };
    entry.sum += Math.abs(away) < 1 ? 0 : Math.sign(away) / Math.abs(away);
    pushes.set(ref.join('/'), entry);
  }

  const states = { ...seed.states };
  const statuses = { ...seed.statuses };
  let moved = false;
  for (const { ref, sum } of pushes.values()) {
    const [kind, key] = ref;
    const hue = hueOf(ref);
    const anchor = kind === 'states' ? anchors.states[key] : anchors.statuses[key];
    const direction = sum === 0 ? roomier(hue) : Math.sign(sum);
    const offset = Math.max(
      -REACH[kind],
      Math.min(REACH[kind], turn(anchor, hue) + direction * STEP),
    );
    const next = normalizeHue(anchor + offset);
    if (Math.abs(turn(hue, next)) < 0.5) continue;
    moved = true;
    if (kind === 'states') states[key] = { ...states[key], hue: next };
    else statuses[key] = { ...statuses[key], hue: next };
  }
  return moved ? { ...seed, states, statuses } : undefined;
}

/** Steps crowded colours aside until nothing is too close; the least crowded seed seen when that cannot be done. */
function settle(seed: PaletteSeed): { readonly seed: PaletteSeed; readonly crowded: number } {
  const anchors = roleHues(seed);
  let current = seed;
  let best = { seed, crowded: Number.POSITIVE_INFINITY };
  for (let round = 0; round < ROUNDS; round += 1) {
    const crowded = crowding(derivePalette(current));
    if (crowded.length < best.crowded) best = { seed: current, crowded: crowded.length };
    if (crowded.length === 0) break;
    const next = stepAside(current, crowded, anchors);
    if (!next) break;
    current = next;
  }
  return best;
}

/** Closer than this the accent is the device colour it lands on, rather than a neighbour of it (CIEDE2000). */
const SAME_COLOUR = 4;

/**
 * Makes room for an electric accent. It lands somewhere on the wheel of device colours: on one of them, that one
 * becomes its twin (Mint's "home" is its green); near one, the neighbours step aside, a few degrees at a time and
 * never far from their own hue. Whichever settles clean wins; the twin is tried first when the accent is on it.
 */
function makeRoom(seed: PaletteSeed): PaletteSeed {
  const palette = derivePalette(seed);
  let nearest: { key: StateKey; distance: number } | undefined;
  for (const mode of PALETTE_MODES)
    for (const key of STATE_KEYS.filter((state) => !palette.twins.includes(state))) {
      const distance = accentDistance(palette[mode], palette[mode].state[key]);
      if (!nearest || distance < nearest.distance) nearest = { key, distance };
    }
  const twinned =
    nearest && nearest.distance < GATES.accentSeparation
      ? { ...seed, twin: nearest.key }
      : undefined;
  const tries = twinned
    ? nearest && nearest.distance < SAME_COLOUR
      ? [twinned, seed]
      : [seed, twinned]
    : [seed];
  let best: { seed: PaletteSeed; crowded: number } | undefined;
  for (const start of tries) {
    const settled = settle(start);
    if (settled.crowded === 0) return settled.seed;
    if (!best || settled.crowded < best.crowded) best = settled;
  }
  return best?.seed ?? seed;
}
