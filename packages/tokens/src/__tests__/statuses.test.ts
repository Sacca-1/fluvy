import { describe, expect, it } from 'vitest';
import { derivePalette, GATES, SECONDARY_ON_FILL } from '../build/derive.js';
import { derivePalettes } from '../build/palettes.js';
import {
  parseStatuses,
  splitStatuses,
  STATUS_NAMES,
  statusesKey,
  statusFamily,
  withStatuses,
  type StatusName,
} from '../build/statuses.js';
import { composite, contrastRatio, deltaE } from '../color/index.js';
import { fromHex, hueDistance } from '../color/oklch.js';
import { PALETTE_MODES } from '../config.js';
import { brandColorVars } from '../emit/vars.js';
import { haModeVars } from '../ha/groups.js';
import { NAMED_COLORS, resolveAccent } from '../ha/named.js';
import { COMMUNITY_PALETTES } from '../palettes/community/index.js';
import { CUSTOM_BASES, customSeed, type CustomPalette } from '../palettes/custom.js';
import { seeds } from '../palettes/index.js';
import { lookDeclarations } from '../runtime.js';
import type { Palette, PaletteModeColors, PaletteSeed, RoleColors } from '../types.js';

/**
 * Every palette a status can sit on: the presets, the community's, and custom ones of each character, base and fill —
 * #47's comparison palette (`#3b5bdb`, vivid, cool) among them.
 */
const customs: CustomPalette[] = CUSTOM_BASES.flatMap((base) => [
  { character: 'soft', base, accent: '#3a7bd5' },
  { character: 'soft', base, accent: '#e07a3a' },
  { character: 'vivid', base, accent: '#3b5bdb', fill: 'tint' },
  { character: 'vivid', base, accent: '#ff4f7b', fill: 'tint' },
  { character: 'vivid', base, accent: '#e2ff3d', fill: 'solid' },
  { character: 'vivid', base, accent: '#ff5a2a', fill: 'solid' },
]);
const palettes: [string, PaletteSeed, Palette][] = [
  ...Object.values(seeds).map((seed): [string, PaletteSeed, Palette] => [
    seed.name,
    seed,
    derivePalette(seed),
  ]),
  ...[...COMMUNITY_PALETTES.map((entry) => entry.palette), ...customs].map(
    (custom): [string, PaletteSeed, Palette] => {
      const seed = customSeed(custom);
      return [seed.key ?? seed.name, seed, derivePalette(seed)];
    },
  ),
];

/** The colours a house picks: #47's orange, a yellow, a red, a green, a grey, a blue that nears the accent. */
const PICKS = {
  orange: '#dc630b',
  yellow: '#fab005',
  red: '#e03131',
  green: '#2f9e44',
  grey: '#808080',
  blue: '#3b5bdb',
} as const;

const statusOf = (colors: PaletteModeColors, name: StatusName): RoleColors =>
  name === 'notice' ? colors.notice : colors.semantic[name];

/** Every gate a palette's own status holds (`emit/gates.ts`, `notice.test.ts`). */
function expectReadable(colors: PaletteModeColors, role: RoleColors, label: string): void {
  const { card, page } = colors.surface;
  expect(contrastRatio(role.ink, card), `${label} ink on card`).toBeGreaterThanOrEqual(GATES.text);
  expect(contrastRatio(role.ink, page), `${label} ink on page`).toBeGreaterThanOrEqual(GATES.text);
  expect(
    contrastRatio(role.ink, composite(role.fill, colors.washBase, colors.washShare)),
    `${label} glyph on its resting circle`,
  ).toBeGreaterThanOrEqual(GATES.icon);
  expect(contrastRatio(role.onFill, role.fill), `${label} on fill`).toBeGreaterThanOrEqual(
    GATES.onFill,
  );
  expect(
    contrastRatio(composite(role.onFill, role.fill, SECONDARY_ON_FILL), role.fill),
    `${label} state line on fill`,
  ).toBeGreaterThanOrEqual(GATES.text);
  expect(contrastRatio(role.fillBorder, role.fill), `${label} hairline`).toBeGreaterThanOrEqual(
    GATES.borderVsCard,
  );
  if (colors.character === 'vivid')
    expect(
      contrastRatio(colors.fillStyle === 'solid' ? role.onFill : role.ink, role.fill),
      `${label} fill's ink on its fill`,
    ).toBeGreaterThanOrEqual(GATES.icon);
}

describe("the house's status colours (1.9)", () => {
  for (const [name, seed, palette] of palettes)
    it(`${name}: every status in every pick reads as the palette's own do, in its own hue, in both modes`, () => {
      const picks = [...Object.entries(PICKS), ['accent', palette.light.accent.ink] as const];
      for (const status of STATUS_NAMES)
        for (const [label, pick] of picks) {
          const chosen = withStatuses(seed, palette, { [status]: pick });
          for (const mode of PALETTE_MODES) {
            const role = statusOf(chosen[mode], status);
            expectReadable(chosen[mode], role, `${status} ${label} ${mode}`);
            // the hue the house chose: only lightness (and the chroma sRGB cannot hold there) moved
            const asked = fromHex(pick);
            if (asked.c > 0.08)
              expect(
                hueDistance(fromHex(role.ink).h, asked.h),
                `${status} ${label} ${mode} ink's hue`,
              ).toBeLessThanOrEqual(6);
            // the others stay the palette's
            for (const other of STATUS_NAMES.filter((each) => each !== status))
              expect(statusOf(chosen[mode], other), `${status} ${label} ${mode}: ${other}`).toBe(
                statusOf(palette[mode], other),
              );
          }
        }
    });

  it('moves the ink only as far as the gates ask: #47’s orange is itself where it reads, a step deeper where not', () => {
    for (const [name, seed, palette] of palettes)
      for (const mode of PALETTE_MODES) {
        const colors = withStatuses(seed, palette, { warning: PICKS.orange })[mode];
        const { ink } = colors.semantic.warning;
        const { card, page } = colors.surface;
        const ground = mode === 'light' ? page : card;
        if (
          contrastRatio(PICKS.orange, card) >= GATES.text &&
          contrastRatio(PICKS.orange, page) >= GATES.text
        )
          expect(ink, `${name} ${mode}`).toBe(PICKS.orange);
        else
          // at the text gate, not past it (a solid palette's resting circle may ask a little more of it)
          expect(contrastRatio(ink, ground), `${name} ${mode}`).toBeLessThan(
            colors.fillStyle === 'solid' ? 6.2 : GATES.text + 0.35,
          );
      }
    // Linen: an orange that reads orange (it was a deep amber at 8.9:1, nearly the text's own ink)
    const linen = derivePalette(seeds.linen);
    const ours = withStatuses(seeds.linen, linen, { warning: PICKS.orange });
    expect(ours.light.semantic.warning.ink).toBe('#b04c00');
    expect(
      contrastRatio(linen.light.semantic.warning.ink, linen.light.surface.card),
    ).toBeGreaterThan(8);
    expect(ours.dark.semantic.warning.ink).toBe(PICKS.orange);
  });

  it('keeps warning, danger and notice apart (ΔE2000 5.5, fill from fill and ink from ink) where only lightness and chroma can', () => {
    // each status in its own colour family, as a house would pick them
    const natural = { warning: PICKS.orange, danger: PICKS.red, notice: '#1c7ed6' } as const;
    for (const [name, seed, palette] of palettes)
      for (const [status, pick] of Object.entries(natural) as [StatusName, string][]) {
        const chosen = withStatuses(seed, palette, { [status]: pick });
        for (const mode of PALETTE_MODES) {
          const role = statusOf(chosen[mode], status);
          for (const other of (['warning', 'danger', 'notice'] as const).filter(
            (each) => each !== status,
          )) {
            const them = statusOf(chosen[mode], other);
            // a blue notice beside a blue accent's own notice, or a red beside a red palette's danger, may share a hue:
            // that is the panel's to say, never a hue turned aside here
            if (hueDistance(fromHex(role.ink).h, fromHex(them.ink).h) < 25) continue;
            expect(
              deltaE(role.fill, them.fill),
              `${name} ${mode} ${status}~${other} fill`,
            ).toBeGreaterThanOrEqual(GATES.fillSeparation);
            expect(
              deltaE(role.ink, them.ink),
              `${name} ${mode} ${status}~${other} ink`,
            ).toBeGreaterThanOrEqual(GATES.fillSeparation);
          }
        }
      }
  });

  it('takes more of the pick only where it stands too close: the palette’s plate where it is apart already', () => {
    const iris = derivePalette(seeds.iris);
    // #47's orange on an electric tint: its first plate sits 5.4 from the danger's in light, so it takes more chroma
    const light = withStatuses(seeds.iris, iris, { warning: PICKS.orange }).light;
    expect(deltaE(light.semantic.warning.fill, light.semantic.danger.fill)).toBeGreaterThanOrEqual(
      GATES.fillSeparation,
    );
    expect(light.semantic.warning).not.toEqual(statusFamily(seeds.iris, iris.light, PICKS.orange));
    // a green is far from every other status: its family is the recipe's first, as if it stood alone
    const green = withStatuses(seeds.iris, iris, { success: PICKS.green });
    for (const mode of PALETTE_MODES)
      expect(green[mode].semantic.success).toEqual(
        statusFamily(seeds.iris, iris[mode], PICKS.green),
      );
  });

  it('writes the family where the palette writes its own: the brand layer, Home Assistant’s status names and ramps', () => {
    const linen = derivePalette(seeds.linen);
    const ours = withStatuses(seeds.linen, linen, {
      warning: PICKS.orange,
      danger: '#c2255c',
      notice: '#1c7ed6',
    });
    const colors = ours.light;
    const brand = Object.fromEntries(brandColorVars(colors).flatMap((group) => group.declarations));
    expect(brand).toMatchObject({
      '--fluvy-warning': colors.semantic.warning.ink,
      '--fluvy-warning-fill': colors.semantic.warning.fill,
      '--fluvy-warning-fill-border': colors.semantic.warning.fillBorder,
      '--fluvy-warning-on-fill': colors.semantic.warning.onFill,
      '--fluvy-danger': colors.semantic.danger.ink,
      '--fluvy-notice': colors.notice.ink,
      '--fluvy-notice-on-fill': colors.notice.onFill,
      // success was left to the palette
      '--fluvy-success': linen.light.semantic.success.ink,
    });
    const ha = Object.fromEntries(haModeVars(colors).flatMap((group) => group.declarations));
    const own = Object.fromEntries(haModeVars(linen.light).flatMap((group) => group.declarations));
    expect(ha['--warning-color']).toBe(colors.semantic.warning.ink);
    expect(ha['--error-color']).toBe(colors.semantic.danger.ink);
    expect(ha['--ha-color-fill-warning-quiet-resting']).toBe(colors.semantic.warning.fill);
    expect(ha['--ha-color-orange-50']).not.toBe(own['--ha-color-orange-50']);
    // a colour name is a colour: red, orange and green stay the palette's, in the theme and in a card's `color`
    for (const name of ['red', 'orange', 'green'] as const) {
      expect(ha[`--${name}-color`], name).toBe(own[`--${name}-color`]);
      expect(NAMED_COLORS[name](colors), name).toBe(NAMED_COLORS[name](linen.light));
      expect(resolveAccent(name, colors), name).toBe(resolveAccent(name, linen.light));
    }
  });

  it('says which palette and statuses it is: the key carries the picks, and reads back', () => {
    const volt = derivePalette(seeds.volt);
    const ours = withStatuses(seeds.volt, volt, { notice: '#1c7ed6', warning: '#dc630b' });
    expect(ours.key).toBe('volt|warning=#dc630b|notice=#1c7ed6');
    expect(lookDeclarations(ours, 'dark')).toContainEqual(['--fluvy-palette', ours.key]);
    expect(splitStatuses(ours.key)).toEqual({
      palette: 'volt',
      statuses: { warning: '#dc630b', notice: '#1c7ed6' },
    });
    const custom = customSeed({
      character: 'vivid',
      base: 'cool',
      accent: '#3b5bdb',
      fill: 'tint',
    });
    expect(splitStatuses(`${custom.key}|danger=#e03131`)).toEqual({
      palette: custom.key,
      statuses: { danger: '#e03131' },
    });
    expect(splitStatuses('linen')).toEqual({ palette: 'linen', statuses: {} });
    // Auto everywhere is the palette itself, untouched
    expect(withStatuses(seeds.volt, volt, {})).toBe(volt);
    expect(statusesKey({})).toBe('');
  });

  it('parses what is stored: a hex per status, in their order, anything else Auto', () => {
    expect(
      parseStatuses({
        notice: '#1C7ED6',
        warning: '#dc630b',
        danger: 'red',
        success: '#12345',
        info: '#000000',
      }),
    ).toEqual({ warning: '#dc630b', notice: '#1c7ed6' });
    expect(Object.keys(parseStatuses({ notice: '#111111', warning: '#222222' }))).toEqual([
      'warning',
      'notice',
    ]);
    for (const broken of [undefined, null, 'orange', 42, ['#dc630b']])
      expect(parseStatuses(broken)).toEqual({});
  });

  it('leaves the presets as they ship (the theme file is unchanged)', () => {
    for (const palette of derivePalettes())
      for (const mode of PALETTE_MODES) expect(palette[mode].named).toBeUndefined();
  });
});
