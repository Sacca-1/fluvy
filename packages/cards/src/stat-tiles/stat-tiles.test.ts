// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { statTileColumns } from './stat-tiles-card.js';

/** Four tiles' labels, 40 wide; a figure's width per tile (null: it cannot be read). */
const labels = [40, 40, 40, 40];

describe('stat tiles a row', () => {
  it('measures what is asked automatically: three while every word holds its cell, four as two by two', () => {
    const three = [40, 40, 40];
    expect(statTileColumns('auto', 320, three, [40, 40, 40], 70)).toBe(3);
    expect(statTileColumns('auto', 320, three, [90, 40, 40], 70)).toBe(2);
    expect(statTileColumns('auto', 320, labels, [40, 40, 40, 40], 70)).toBe(2);
  });

  it('never wraps a figure: fewer than asked, down to one a row, where the widest would not hold its cell', () => {
    // a 211 card: a cell of two holds 57 px of words
    expect(statTileColumns(2, 171, labels, [60, 50, 58, 40], 70)).toBe(1);
    expect(statTileColumns(2, 171, labels, [50, 50, 50, 40], 70)).toBe(2);
    expect(statTileColumns(3, 320, labels, [90, 40, 40, 40], 70)).toBe(2);
  });

  it('keeps its rows while a sensor is away: a figure that cannot be read takes the widest of the others', () => {
    const live = statTileColumns('auto', 171, labels, [60, 50, 58, 40], 70);
    expect(statTileColumns('auto', 171, labels, [null, 50, 58, null], 70)).toBe(1);
    expect(statTileColumns('auto', 171, labels, [60, null, null, null], 70)).toBe(live);
  });

  it('lays out a set that cannot be read at all for the stand-in figure', () => {
    expect(statTileColumns(2, 171, labels, [null, null, null, null], 70)).toBe(1);
    expect(statTileColumns(2, 226, labels, [null, null, null, null], 70)).toBe(2);
  });
});
