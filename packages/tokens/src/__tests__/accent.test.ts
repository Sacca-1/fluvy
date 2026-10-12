import { describe, expect, it } from 'vitest';
import { accentFamily } from '../build/accent-family.js';
import { GATES } from '../build/derive.js';
import { derivePalettes } from '../build/palettes.js';
import { contrastRatio, minPairwiseDeltaE, toHex } from '../color/index.js';
import { PALETTE_MODES } from '../config.js';
import { accentFamilyVars, surfaceWash } from '../emit/vars.js';
import { HA_COLOR_NAMES, NAMED_COLORS } from '../ha/named.js';
import { seeds } from '../palettes/index.js';
import { RAMP_STEPS, type PaletteMode } from '../types.js';

/** Colours a card may be given that a palette has to survive: yellow on white, pure blue, grey, lime, near-black… */
const HARD_PICKS = [
  '#ffd400',
  '#0000ff',
  '#808080',
  '#c6ff00',
  '#111111',
  '#ff4a1a',
  '#00b894',
  '#ffffff',
];
/** …and a walk round the wheel: deep, mid, light and very pale; electric, dusty and nearly grey. */
const WHEEL = Array.from({ length: 12 }, (_, i) => i * 30).flatMap((h) =>
  [0.45, 0.65, 0.85, 0.92].flatMap((l) => [0.03, 0.1, 0.3].map((c) => toHex({ l, c, h }))),
);

const palettes = derivePalettes();

describe('a card’s own colour on every palette', () => {
  it('clears the gates the palette’s accent clears, whatever the pick', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card, page } = colors.surface;
        const picks = [
          ...HARD_PICKS,
          ...WHEEL,
          ...HA_COLOR_NAMES.map((name) => NAMED_COLORS[name](colors)),
        ];
        for (const pick of picks) {
          const label = `${palette.name}/${mode} ${pick}`;
          const family = accentFamily(seed, colors, pick);
          const at = (fg: string, bg: string, min: number, what: string): void =>
            expect(contrastRatio(fg, bg), `${label} ${what}`).toBeGreaterThanOrEqual(min);
          at(family.ink, card, GATES.icon, 'ink on card');
          at(family.ink, page, GATES.icon, 'ink on page');
          at(family.text, card, GATES.text, 'text on card');
          at(family.text, page, GATES.text, 'text on page');
          at(family.onFill, family.fill, GATES.onFill, 'ink on fill');
          at(family.fillBorder, family.fill, GATES.borderVsCard, 'fill border');
          at(family.onAccent, family.ink, GATES.text, 'ink on the solid accent');
          at(family.primary.on, family.primary.fill, GATES.text, 'primary');
          at(family.primary.on, family.primary.hover, GATES.text, 'primary hover');
          for (const [index, hex] of family.graph.entries())
            at(hex, card, GATES.icon, `graph ${index + 1} on card`);
          expect(
            minPairwiseDeltaE(family.graph),
            `${label} graph separation`,
          ).toBeGreaterThanOrEqual(GATES.graphSeparation);
          const ramp = RAMP_STEPS.map((step) => family.ramp[step]);
          expect(new Set(ramp).size, `${label} ramp`).toBe(RAMP_STEPS.length);
        }
      }
    }
  });

  it('is the same family every time', () => {
    const palette = palettes[0]!;
    const seed = seeds[palette.name as keyof typeof seeds];
    for (const mode of PALETTE_MODES as readonly PaletteMode[]) {
      const a = accentFamily(seed, palette[mode], '#ff4a1a');
      const b = accentFamily(seed, palette[mode], '#ff4a1a');
      expect(a).toEqual(b);
    }
  });

  it('washes an item’s colour at rest so its words read on it, and as far from the card as the words allow', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card } = colors.surface;
        for (const pick of [...HARD_PICKS, ...HA_COLOR_NAMES.map((n) => NAMED_COLORS[n](colors))]) {
          const vars = new Map(accentFamilyVars(accentFamily(seed, colors, pick), colors));
          const rest = vars.get('--fluvy-accent-rest')!;
          const fill = vars.get('--fluvy-accent-fill')!;
          const at = `${palette.name} ${mode} ${pick}`;
          // the words: the title and the state line, at 4.5
          expect(contrastRatio(colors.text.primary, rest), at).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text.secondary, rest), at).toBeGreaterThanOrEqual(4.5);
          // it is a wash of the fill, never louder than it, and visibly not the card where the fill is far from it
          expect(contrastRatio(rest, card), at).toBeLessThan(contrastRatio(fill, card) + 0.001);
          if (contrastRatio(fill, card) >= 1.6)
            expect(contrastRatio(rest, card), at).toBeGreaterThanOrEqual(1.18);
        }
      }
    }
  });

  it('washes a card’s own surface so its words and its hairline read on it, never louder than the fill', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card } = colors.surface;
        for (const pick of [
          ...HARD_PICKS,
          ...WHEEL,
          ...HA_COLOR_NAMES.map((n) => NAMED_COLORS[n](colors)),
        ]) {
          const family = accentFamily(seed, colors, pick);
          const wash = surfaceWash(family, colors);
          const at = `${palette.name} ${mode} ${pick}`;
          // the words on the card: the title and the state line, at 4.5
          expect(contrastRatio(colors.text.primary, wash), at).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text.secondary, wash), at).toBeGreaterThanOrEqual(4.5);
          // the card's edge and dividers, now the fill's hairline, still read on it (or the wash is the card itself)
          if (wash !== card)
            expect(contrastRatio(family.fillBorder, wash), at).toBeGreaterThanOrEqual(1.35);
          // a wash of the fill, never louder than it
          expect(contrastRatio(wash, card), at).toBeLessThan(
            contrastRatio(family.fill, card) + 0.001,
          );
          // the same every time
          expect(surfaceWash(family, colors), at).toBe(wash);
        }
      }
    }
  });

  it('writes what the accent owns and nothing else', () => {
    const linen = palettes.find((p) => p.name === 'linen')!;
    const volt = palettes.find((p) => p.name === 'volt')!;
    const names = (vars: readonly (readonly [string, string])[]): string[] =>
      vars.map(([name]) => name);
    const soft = names(
      accentFamilyVars(accentFamily(seeds.linen, linen.light, '#0000ff'), linen.light),
    );
    expect(soft).toContain('--fluvy-accent');
    expect(soft).toContain('--fluvy-text-on-accent');
    expect(soft).toContain('--fluvy-highlight'); // Linen has no highlight of its own: the colour is it
    expect(soft).toContain('--fluvy-graph-12');
    expect(soft).toContain('--fluvy-accent-95');
    expect(soft).toContain('--fluvy-state-light-active-fill');
    expect(soft).not.toContain('--fluvy-primary-edge'); // a tint's primary is its ink: no edge
    for (const name of soft) {
      expect(name.startsWith('--fluvy-'), name).toBe(true);
      expect(
        /--fluvy-(page|card|text$|text-secondary|neutral-|state-climate|warning|selected|mark|wash)/.test(
          name,
        ),
        name,
      ).toBe(false);
    }
    // Volt: a solid fill with a lime of its own
    const vivid = names(
      accentFamilyVars(accentFamily(seeds.volt, volt.light, '#0000ff'), volt.light),
    );
    expect(vivid).not.toContain('--fluvy-highlight'); // it keeps its own second colour
    expect(vivid).toContain('--fluvy-primary-edge'); // a solid primary draws its edge in light
    expect(
      names(accentFamilyVars(accentFamily(seeds.volt, volt.dark, '#0000ff'), volt.dark)),
    ).not.toContain('--fluvy-primary-edge');
    expect(soft.length).toBeGreaterThanOrEqual(38);
  });
});
