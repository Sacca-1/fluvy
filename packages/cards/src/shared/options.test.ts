import { describe, expect, it } from 'vitest';
import { optionCell, optionColumnsFor, valuesHeld, valuesHold } from './options.js';

/** A stand-in for the laid-out width: 6 px a letter, as the tile's 12/500 label runs. */
const measure = (label: string): number => label.length * 6;

describe('optionColumnsFor', () => {
  it('keeps the count-based columns while the longest label fits a cell', () => {
    // 320: 3 × 104 with two 4 px gaps, 80 of content per cell
    expect(optionColumnsFor(['Off', 'Heat', 'Cool'], 320, 4, measure)).toBe(3);
    expect(optionColumnsFor(['Eco', 'Performance', 'Heat pump'], 320, 4, measure)).toBe(3);
  });

  it('takes a column away when a label would be cut', () => {
    // 224: 3 columns leave 48 of content per cell; "Performance" is 66
    expect(optionColumnsFor(['Eco', 'Performance', 'Heat pump'], 224, 4, measure)).toBe(2);
  });

  it('never goes under two columns', () => {
    expect(optionColumnsFor(['Disarmed', 'Vacation', 'Away'], 120, 4, measure)).toBe(2);
  });

  it('lays a gap that depends on the column count', () => {
    const gap = (columns: number): number => (columns === 3 ? 12 : 4);
    // 3 columns with 12 px gaps: 4 of content each — "Away" (24) does not fit; 2 columns with 4 px: 22 each
    expect(optionColumnsFor(['Home', 'Away', 'Night'], 100, gap, measure)).toBe(2);
  });

  it('starts from the count: four tiles are two by two, five wrap in threes', () => {
    expect(optionColumnsFor(['A', 'B', 'C', 'D'], 320, 4, measure)).toBe(2);
    expect(optionColumnsFor(['A', 'B', 'C', 'D', 'E'], 320, 4, measure)).toBe(3);
  });
});

describe('option tile values', () => {
  const measure = (text: string): number => text.length * 8;
  it('drops a value whose longest word the cell cannot hold, keeps one that wraps and a label-less tile’s word', () => {
    const items = [
      { key: 'off', label: 'Off', value: 'Bereitschaft' },
      { key: 'heat', label: 'Heat', value: '21.5 °C' },
      { key: 'eco', label: '', value: 'Economical' },
    ];
    expect(valuesHeld(items, 60, measure).map((i) => i.value)).toEqual([
      '',
      '21.5 °C',
      'Economical',
    ]);
    expect(valuesHold(['Bereitschaft', 'Standby'], 60, measure)).toBe(false);
    expect(valuesHold(['Standby', 'All on'], 60, measure)).toBe(true);
    expect(optionCell(211, 4, 3)).toBeCloseTo((211 - 8) / 3 - 24);
    expect(optionCell(320, (n) => n * 2, 2)).toBeCloseTo((320 - 4) / 2 - 24);
  });
});
