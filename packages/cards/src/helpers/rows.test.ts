import { describe, expect, it } from 'vitest';
import type { TextRuler } from '../shared/fit.js';
import { rowsKeepIcon, rowStacks } from './rows.js';

/** A ruler that lays every glyph 8 px wide; a pill adds its sides on the 4 grid, as `fitPills` does. */
const ruler = {
  width: (_cls: string, text: string) => text.length * 8,
  pill: (_cls: string, text: string, sides: number) => Math.ceil((text.length * 8 + sides) / 4) * 4,
} as unknown as TextRuler;

describe('a helpers or updates row whose end is never cut', () => {
  it('gives its circle first, then puts its end under its name (de "Installieren" at 211)', () => {
    // 171 − 68 − 128 ("Installieren" and its 32) leaves no room: the circles go; bare, 171 − 12 − 128 leaves 31,
    // under "Vacuum" (48): Install goes under the name
    const install = { name: 'Vacuum', button: 'Installieren' };
    expect(rowsKeepIcon(ruler, 171, [install])).toBe(false);
    expect(rowStacks(ruler, 171, install)).toBe(true);
    // "Run" (56) leaves 103 beside it: the row keeps its line
    expect(rowStacks(ruler, 171, { name: 'Vacuum', button: 'Run' })).toBe(false);
  });

  it('reads the line under the name too: a state in words goes under a sub it would squeeze', () => {
    // "Above horizon" (104) leaves 55 bare: "Sun" (24) holds, "Sets at 20:12" (104, held to 96) does not
    const sun = { name: 'Sun', end: 104 };
    expect(rowStacks(ruler, 171, sun)).toBe(false);
    expect(rowStacks(ruler, 171, { ...sun, sub: 'Sets at 20:12 · rises 07:48' })).toBe(true);
  });
});
