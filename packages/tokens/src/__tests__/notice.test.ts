import { describe, expect, it } from 'vitest';
import { derivePalette, GATES, SECONDARY_ON_FILL } from '../build/derive.js';
import { derivePalettes } from '../build/palettes.js';
import { composite, contrastRatio, deltaE } from '../color/index.js';
import { PALETTE_MODES } from '../config.js';
import { checkStructure } from '../emit/gates.js';
import { brandColorVars } from '../emit/vars.js';
import { COMMUNITY_PALETTES } from '../palettes/community/index.js';
import { CUSTOM_BASES, customSeed, type CustomPalette } from '../palettes/custom.js';
import type { Palette, RoleColors } from '../types.js';

/**
 * Every palette an alert can sit on: the presets, the community's, and custom ones of each character, base and fill —
 * a cool accent, a lime, and the warm ones that sit on the warning and the danger (an orange, a coral, a pink).
 */
const customs: CustomPalette[] = CUSTOM_BASES.flatMap((base) => [
  { character: 'soft', base, accent: '#3a7bd5' },
  { character: 'soft', base, accent: '#e07a3a' },
  { character: 'vivid', base, accent: '#3a7bd5', fill: 'tint' },
  { character: 'vivid', base, accent: '#ff4f7b', fill: 'tint' },
  { character: 'vivid', base, accent: '#e2ff3d', fill: 'solid' },
  { character: 'vivid', base, accent: '#ff5a2a', fill: 'solid' },
]);
const palettes: [string, Palette][] = [
  ...derivePalettes().map((palette): [string, Palette] => [palette.name, palette]),
  ...[...COMMUNITY_PALETTES.map((entry) => entry.palette), ...customs].map(
    (custom): [string, Palette] => {
      const seed = customSeed(custom);
      return [seed.key ?? seed.name, derivePalette(seed)];
    },
  ),
];

/** The accent as information would draw it: its text colour as the ink. */
const accentAsNotice = (palette: Palette, mode: 'light' | 'dark'): RoleColors => {
  const { text, fill, fillBorder, onFill } = palette[mode].accent;
  return { ink: text, fill, fillBorder, onFill };
};

describe('information as a tone (`notice`, an alert of severity info)', () => {
  for (const [name, palette] of palettes)
    for (const mode of PALETTE_MODES)
      it(`${name} ${mode}: never reads as a warning or a danger, and reads as a status`, () => {
        const colors = palette[mode];
        const { danger, warning } = colors.semantic;
        const notice = colors.notice;
        // information stands apart from the warning and the danger, fill from fill and ink from ink
        for (const [a, b, pair] of [
          [notice, warning, 'notice~warning'],
          [notice, danger, 'notice~danger'],
        ] as const) {
          expect(deltaE(a.fill, b.fill), `${pair} fill`).toBeGreaterThanOrEqual(
            GATES.fillSeparation,
          );
          expect(deltaE(a.ink, b.ink), `${pair} ink`).toBeGreaterThanOrEqual(GATES.fillSeparation);
        }
        // legible as a status: its ink as text on the card and the page, its words on its fill (the state line's 80 %)
        const { card, page } = colors.surface;
        expect(contrastRatio(notice.ink, card), 'ink on card').toBeGreaterThanOrEqual(GATES.text);
        expect(contrastRatio(notice.ink, page), 'ink on page').toBeGreaterThanOrEqual(GATES.text);
        expect(contrastRatio(notice.onFill, notice.fill), 'on fill').toBeGreaterThanOrEqual(
          GATES.onFill,
        );
        expect(
          contrastRatio(composite(notice.onFill, notice.fill, SECONDARY_ON_FILL), notice.fill),
          'secondary on fill',
        ).toBeGreaterThanOrEqual(GATES.text);
        expect(
          contrastRatio(notice.ink, composite(notice.fill, colors.washBase, colors.washShare)),
          'glyph on its resting circle',
        ).toBeGreaterThanOrEqual(GATES.icon);
        expect(contrastRatio(notice.fillBorder, notice.fill), 'hairline').toBeGreaterThanOrEqual(
          GATES.borderVsCard,
        );
        expect(
          checkStructure(palette, mode).find((r) => r.id === 'roles/notice-separation'),
        ).toMatchObject({ pass: true });
      });

  it('is the accent where the accent stands apart in both modes, else the status info, the same in both', () => {
    for (const [name, palette] of palettes) {
      const apart = PALETTE_MODES.every((mode) => {
        const accent = accentAsNotice(palette, mode);
        const { danger, warning } = palette[mode].semantic;
        return [warning, danger].every(
          (alarm) =>
            deltaE(accent.fill, alarm.fill) >= GATES.fillSeparation &&
            deltaE(accent.ink, alarm.ink) >= GATES.fillSeparation,
        );
      });
      for (const mode of PALETTE_MODES)
        expect(palette[mode].notice, `${name} ${mode}`).toEqual(
          apart ? accentAsNotice(palette, mode) : palette[mode].semantic.info,
        );
    }
  });

  it('takes the status info on the warm palettes, and the accent on the others (#48, B1)', () => {
    const presets = new Map(derivePalettes().map((palette) => [palette.name, palette]));
    const info = [...presets.values()]
      .filter((palette) => palette.light.notice === palette.light.semantic.info)
      .map((palette) => palette.name);
    expect(info).toEqual(['sand', 'clay', 'ember', 'blaze', 'flamingo']);
    expect(presets.get('linen')?.light.notice.fill).toBe(presets.get('linen')?.light.accent.fill);
  });

  it('is written as the statuses are: --fluvy-notice and its fill, hairline and on-fill', () => {
    const colors = derivePalettes().find((palette) => palette.name === 'ember')!.dark;
    const status = brandColorVars(colors).find((group) => group.title === 'Status');
    expect(Object.fromEntries(status?.declarations ?? [])).toMatchObject({
      '--fluvy-notice': colors.semantic.info.ink,
      '--fluvy-notice-fill': colors.semantic.info.fill,
      '--fluvy-notice-fill-border': colors.semantic.info.fillBorder,
      '--fluvy-notice-on-fill': colors.semantic.info.onFill,
    });
  });
});
