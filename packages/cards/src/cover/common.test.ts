// @vitest-environment happy-dom
import { actions } from '@fluvy/ui';
import { render } from 'lit';
import { describe, expect, it } from 'vitest';
import { actionGap, sharedGap } from './common.js';

/** The narrowest cell of a row laid out so. */
const narrowest = (width: number, gap: number, columns: number): number =>
  (width - gap * (columns - 1)) / columns;

describe('an action row', () => {
  it('keeps the design’s 16 where the cells land on the 4 grid, else the gap that makes them whole', () => {
    expect(actionGap(320, 3)).toEqual({ gap: 16, columns: 3 });
    expect(actionGap(320, 4)).toEqual({ gap: 16, columns: 4 });
    // three 44 cells in a half-section card, 4 apart
    expect(actionGap(140, 3)).toEqual({ gap: 4, columns: 3 });
  });

  it('wraps into two full rows where one would leave a cell under 44', () => {
    // the vacuum's four at 171 were 36.75 wide, 8 apart: two and two of 78
    expect(actionGap(171, 4)).toEqual({ gap: 15, columns: 2 });
    // five at 179: three and two
    expect(actionGap(179, 5)).toEqual({ gap: 16, columns: 3 });
    // three that cannot stand 44 apart in one row: two and one
    expect(actionGap(130, 3).columns).toBe(2);
  });

  it('never gives a cell under a finger’s 44', () => {
    for (let width = 92; width <= 400; width++)
      for (let count = 1; count <= 5; count++) {
        const { gap, columns } = actionGap(width, count);
        expect(narrowest(width, gap, columns), `${count} at ${width}`).toBeGreaterThanOrEqual(44);
      }
  });

  it('says the design’s 16 when no gap of a caller’s own range lands the cells whole', () => {
    // the printer's trays hold only at 8, where three buttons in 320 would be 101.33: it then tries 4 (104)
    expect(sharedGap(320, [3], [8]).gap).toBe(16);
    expect(sharedGap(320, [3], [4]).gap).toBe(4);
    // where 16 would leave them under 44 it is the narrowest, still a finger's (three at 141: 44.33)
    expect(actionGap(141, 3)).toEqual({ gap: 4, columns: 3 });
  });

  it('shares one gap among rows that stand one over another, each row its own columns', () => {
    expect(sharedGap(320, [3, 2])).toEqual({ gap: 16, columns: [3, 2] });
    // trays of five over two buttons at 179: the trays wrap, the buttons keep their row
    const { gap, columns } = sharedGap(179, [5, 2]);
    expect(columns).toEqual([3, 2]);
    expect(Number.isInteger(narrowest(179, gap, 3))).toBe(true);
  });

  it('draws its cells in the columns it is given, a shorter last row splitting the row', () => {
    const host = document.createElement('div');
    const items = ['start', 'pause', 'stop', 'dock', 'locate'].map((key) => ({
      key,
      glyph: key,
      label: key,
    }));
    render(
      actions(items, () => undefined, 3),
      host,
    );
    const row = host.querySelector<HTMLElement>('.fv-actions');
    // three and two: six tracks, the first row's cells two each, the last row's three
    expect(row?.style.gridTemplateColumns).toBe('repeat(6, minmax(0, 1fr))');
    expect(
      [...host.querySelectorAll<HTMLElement>('.fv-action')].map((cell) => cell.style.gridColumn),
    ).toEqual(['span 2', 'span 2', 'span 2', 'span 3', 'span 3']);
    render(
      actions(items.slice(0, 4), () => undefined),
      host,
    );
    expect(host.querySelector<HTMLElement>('.fv-actions')?.style.gridTemplateColumns).toBe(
      'repeat(4, minmax(0, 1fr))',
    );
  });
});
