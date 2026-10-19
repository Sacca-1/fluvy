import { describe, expect, it } from 'vitest';
import type { TextRuler } from './fit.js';
import { statsRow, type StatText } from './readouts.js';

/** A stand-in for the card's ruler: a label's letters at 7, a figure's (and its unit's) at 11 at s and 9 at xs. */
const ruler = {
  width(cls: string, text: string, _unitCls?: string, unit = ''): number {
    if (cls.includes('fv-readout__label')) return text.length * 7;
    const pace = cls.includes('fv-readout--xs') ? 9 : 11;
    return (text.length + unit.length) * pace;
  },
} as unknown as TextRuler;

/** The EV charger's three, in German: "Von der Sonne" is the widest at 91. */
const SESSION: StatText[] = [
  { label: 'Geladen', value: '12,4', unit: 'kWh' },
  { label: 'Seit', value: '1 h 5', unit: 'min' },
  { label: 'Von der Sonne', value: '96', unit: '%' },
];

describe('statsRow', () => {
  it('gives every statistic its column while the widest holds in it', () => {
    // 320: three columns of 96
    expect(statsRow(ruler, 320, SESSION)).toEqual({ columns: 3, size: 's', odd: false });
  });

  it('takes fewer columns, the last row taking the whole row, before a word wraps onto its figure', () => {
    // 284: three columns of 84 do not hold "Von der Sonne" (91); two of 134 do — two and one
    expect(statsRow(ruler, 284, SESSION)).toEqual({ columns: 2, size: 's', odd: true });
    expect(statsRow(ruler, 284, SESSION.slice(0, 2))).toEqual({
      columns: 2,
      size: 's',
      odd: false,
    });
  });

  it('holds a shorter last row’s one readout to the whole row: two and one before one a line', () => {
    // a gauge's three in half a column (112): "Average" (49) is wider than a half (48), but it is the one that takes
    // the whole row; the two above it hold their halves at xs (45)
    const gauge: StatText[] = [
      { label: 'Min', value: '0.4', unit: 'kW' },
      { label: 'Max', value: '4.1', unit: 'kW' },
      { label: 'Average', value: '1.4', unit: 'kW' },
    ];
    expect(statsRow(ruler, 112, gauge)).toEqual({ columns: 2, size: 'xs', odd: true });
    // one of the two above it would not: one a line
    const wider = gauge.map((stat) => (stat.label === 'Max' ? { ...stat, value: '14.1' } : stat));
    expect(statsRow(ruler, 112, wider)).toEqual({ columns: 1, size: 's', odd: false });
  });

  it('stands one a line where not even two hold', () => {
    expect(statsRow(ruler, 150, SESSION)).toEqual({ columns: 1, size: 's', odd: false });
  });

  it('takes the size the widest figure fits its column at', () => {
    // "2 h 10" with its unit is 99 at s: three columns of 96 hold it at xs (81)
    const longer = SESSION.map((stat) =>
      stat.label === 'Seit' ? { ...stat, value: '2 h 10' } : stat,
    );
    expect(statsRow(ruler, 320, longer)).toEqual({ columns: 3, size: 'xs', odd: false });
  });
});
