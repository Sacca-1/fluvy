import { describe, expect, it } from 'vitest';
import { accentFamily, ladderPosition } from '../build/accent-family.js';
import { derivePalette, GATES, SECONDARY_ON_FILL } from '../build/derive.js';
import { LIMITS } from '../build/derive/limits.js';
import { derivePalettes } from '../build/palettes.js';
import { composite, contrastRatio, deltaE, fromHex, hueDistance } from '../color/index.js';
import { PALETTE_MODES } from '../config.js';
import { accentFamilyVars } from '../emit/vars.js';
import { NAMED_COLORS, NEUTRAL_RUNGS } from '../ha/named.js';
import { COMMUNITY_PALETTES } from '../palettes/community/index.js';
import { CUSTOM_BASES, customSeed, type CustomPalette } from '../palettes/custom.js';
import { seeds } from '../palettes/index.js';
import type { Palette, PaletteSeed } from '../types.js';

/** Every palette a card can sit on: the presets, the community's, and a custom one of each character, base and fill. */
const customs: CustomPalette[] = CUSTOM_BASES.flatMap((base) => [
  { character: 'soft', base, accent: '#3a7bd5' },
  { character: 'vivid', base, accent: '#3a7bd5', fill: 'tint' },
  { character: 'vivid', base, accent: '#e2ff3d', fill: 'solid' },
]);
const palettes: [string, PaletteSeed, Palette][] = [
  ...derivePalettes().map((palette): [string, PaletteSeed, Palette] => [
    palette.name,
    seeds[palette.name as keyof typeof seeds],
    palette,
  ]),
  ...[...COMMUNITY_PALETTES.map((entry) => entry.palette), ...customs].map(
    (custom): [string, PaletteSeed, Palette] => {
      const seed = customSeed(custom);
      return [seed.key ?? seed.name, seed, derivePalette(seed)];
    },
  ),
];

const NAMES = NEUTRAL_RUNGS.map(([name]) => name);
/** The least chroma a colour has: a soft palette's accent band starts here. */
const COLOUR = LIMITS.soft.accentChroma[0];

describe('the grey ladder (#40)', () => {
  it('puts each name on its own rung, and a typed grey between them by its lightness', () => {
    expect(NAMES).toEqual(['black', 'dark-grey', 'blue-grey', 'grey', 'light-grey', 'white']);
    expect(ladderPosition(0)).toBe(0);
    expect(ladderPosition(1)).toBe(1);
    const linen = derivePalettes().find((p) => p.name === 'linen')!.light;
    NAMES.forEach((name, i) =>
      expect(ladderPosition(fromHex(NAMED_COLORS[name](linen)).l), name).toBeCloseTo(i / 5, 2),
    );
    expect(ladderPosition(fromHex('#333333').l)).toBeGreaterThan(0);
    expect(ladderPosition(fromHex('#333333').l)).toBeLessThan(0.2);
    expect(ladderPosition(fromHex('#808080').l)).toBeGreaterThan(0.4);
    expect(ladderPosition(fromHex('#808080').l)).toBeLessThan(0.6);
  });

  for (const [name, seed, palette] of palettes)
    for (const mode of PALETTE_MODES)
      it(`${name} ${mode}: six distinct, ordered, never chromatic rungs that clear every gate`, () => {
        const colors = palette[mode];
        const { card, page } = colors.surface;
        const wash = (fill: string): string => composite(fill, colors.washBase, colors.washShare);
        const rungs = NAMES.map((n) => accentFamily(seed, colors, NAMED_COLORS[n](colors)));
        rungs.forEach((family, i) => {
          const at = `${NAMES[i]}`;
          // never a colour: a grey's ink and plate stay under the softest colour's chroma (the palette's own greys')
          expect(fromHex(family.ink).c, `${at} ink chroma`).toBeLessThan(COLOUR);
          expect(fromHex(family.fill).c, `${at} fill chroma`).toBeLessThan(COLOUR);
          // the glyph reads on the card, on the page and on its resting circle; the hairline closes its plate
          expect(contrastRatio(family.ink, card), `${at} ink on card`).toBeGreaterThanOrEqual(
            GATES.icon,
          );
          expect(contrastRatio(family.ink, page), `${at} ink on page`).toBeGreaterThanOrEqual(
            GATES.icon,
          );
          expect(
            contrastRatio(family.ink, wash(family.fill)),
            `${at} glyph`,
          ).toBeGreaterThanOrEqual(GATES.icon);
          expect(
            contrastRatio(family.fillBorder, family.fill),
            `${at} hairline`,
          ).toBeGreaterThanOrEqual(GATES.borderVsCard);
          // its words on the "on" plate, and the state line at 80 %
          expect(contrastRatio(family.onFill, family.fill), `${at} on fill`).toBeGreaterThanOrEqual(
            GATES.onFill,
          );
          expect(
            contrastRatio(composite(family.onFill, family.fill, SECONDARY_ON_FILL), family.fill),
            `${at} state line`,
          ).toBeGreaterThanOrEqual(GATES.text);
          // on is never off: the plate stands off the card as any colour's does (or is as deep as there is)
          if (family.fill !== '#000000')
            expect(deltaE(family.fill, card), `${at} on vs off`).toBeGreaterThanOrEqual(
              GATES.fillSeparation,
            );
          // a lit light in this colour is this rung (the accent's twin)
          const vars = new Map(accentFamilyVars(family, colors));
          expect(vars.get('--fluvy-state-light-active-fill'), `${at} lit`).toBe(family.fill);
          expect(vars.get('--fluvy-state-light-active-on-fill'), `${at} lit`).toBe(family.onFill);
          if (i === 0) return;
          const below = rungs[i - 1]!;
          // ordered: each plate and each glyph lighter than the rung below
          expect(fromHex(family.fill).l, `${at} plate order`).toBeGreaterThan(
            fromHex(below.fill).l,
          );
          expect(fromHex(family.ink).l, `${at} glyph order`).toBeGreaterThan(fromHex(below.ink).l);
          // distinct from its neighbour: the plate and the glyph together
          expect(
            Math.hypot(deltaE(family.fill, below.fill), deltaE(family.ink, below.ink)),
            `${at} vs ${NAMES[i - 1]}`,
          ).toBeGreaterThanOrEqual(GATES.fillSeparation);
        });
        // black is a black glyph in light, and in dark the deepest plate, under the card: it never turns white
        const [black, , blueGrey, , , white] = rungs;
        if (mode === 'light')
          expect(fromHex(black!.ink).l).toBeCloseTo(fromHex(colors.text.primary).l, 2);
        else expect(fromHex(black!.fill).l).toBeLessThan(fromHex(card).l);
        expect(fromHex(white!.ink).l).toBeGreaterThan(fromHex(black!.ink).l);
        // blue-grey keeps its whisper of cool, whatever the palette's own greys lean to
        expect(hueDistance(fromHex(blueGrey!.ink).h, 229)).toBeLessThan(30);
        // white on a white card is an outlined disc, its hairline seen on the card; no other rung is outlined
        if (mode === 'light') {
          expect(white!.ring).toBe(white!.fillBorder);
          expect(contrastRatio(white!.ring!, card)).toBeGreaterThanOrEqual(GATES.borderVsCard);
        } else expect(white!.ring).toBeUndefined();
        expect(rungs.slice(0, -1).every((family) => family.ring === undefined)).toBe(true);
      });

  it('takes a typed grey onto the ladder: #000 is black, #fff white, #333 and #808080 between their names', () => {
    for (const [name, seed, palette] of palettes)
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const rung = (n: (typeof NAMES)[number]) =>
          accentFamily(seed, colors, NAMED_COLORS[n](colors));
        const typed = (hex: string) => accentFamily(seed, colors, hex);
        const at = `${name} ${mode}`;
        expect(deltaE(typed('#000000').fill, rung('black').fill), `${at} #000`).toBeLessThan(1);
        expect(deltaE(typed('#ffffff').fill, rung('white').fill), `${at} #fff`).toBeLessThan(1);
        expect(deltaE(typed('#ffffff').ink, rung('white').ink), `${at} #fff`).toBeLessThan(1);
        const between = (
          hex: string,
          low: (typeof NAMES)[number],
          high: (typeof NAMES)[number],
        ) => {
          const l = fromHex(typed(hex).ink).l;
          expect(l, `${at} ${hex}`).toBeGreaterThanOrEqual(fromHex(rung(low).ink).l - 0.005);
          expect(l, `${at} ${hex}`).toBeLessThanOrEqual(fromHex(rung(high).ink).l + 0.005);
        };
        between('#333333', 'black', 'dark-grey');
        between('#808080', 'blue-grey', 'grey');
        expect(contrastRatio(typed('#333333').ink, colors.surface.card)).toBeGreaterThanOrEqual(
          GATES.icon,
        );
      }
  });

  it('keeps blue-grey a grey on the electric palettes (never violet, blue or green)', () => {
    for (const name of ['iris', 'volt', 'mint'] as const)
      for (const mode of PALETTE_MODES) {
        const colors = derivePalettes().find((p) => p.name === name)![mode];
        const family = accentFamily(seeds[name], colors, NAMED_COLORS['blue-grey'](colors));
        expect(fromHex(family.ink).c, `${name} ${mode}`).toBeLessThan(COLOUR);
        expect(fromHex(family.fill).c, `${name} ${mode}`).toBeLessThan(COLOUR);
      }
  });
});
