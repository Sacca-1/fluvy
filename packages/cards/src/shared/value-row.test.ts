import { describe, expect, it } from 'vitest';
import type { TextRuler } from './fit.js';
import {
  fitValueRow,
  sideStacked,
  STEPPER,
  STEPPER_HALVES,
  valueRowClass,
  type ValueRowSpec,
} from './value-row.js';

/**
 * A stand-in for the card's ruler, near what Inter measures in the real classes: a figure's characters (its unit's
 * too, with the space before it) at the size's pace — "19,5 °C" is 108 at l, 72 at m, 62 at s, 52 at xs — and a
 * label's at 6.6 ("ZIEL · JETZT 20,6°" 119, "ZIEL" 26).
 */
const PACE = { l: 15.5, m: 10.3, s: 8.8, xs: 7.5 } as const;
const ruler = {
  width(cls: string, text: string, _unitCls?: string, unit = ''): number {
    const size = /fv-readout--(l|m|s|xs)/.exec(cls)?.[1] as keyof typeof PACE | undefined;
    if (!size) return text.length * 6.6;
    return (text.length + (unit ? unit.length + 1 : 0)) * PACE[size];
  },
} as unknown as TextRuler;

/** The #46 thermostat: a 5–30.5 °C target, "Ziel · Jetzt 20,6°" or "Ziel" over it, and its stepper. */
const thermostat = (width: number, more: Partial<ValueRowSpec> = {}): ValueRowSpec => ({
  width,
  control: STEPPER,
  narrow: STEPPER_HALVES,
  labels: ['Ziel · Jetzt 20,6°', 'Ziel'],
  figures: [
    { value: '5,0', unit: '°C' },
    { value: '30,5', unit: '°C' },
  ],
  ...more,
});

describe('fitValueRow', () => {
  it('keeps the readout beside its stepper at l, then at m', () => {
    expect(fitValueRow(ruler, thermostat(320))).toEqual({
      size: 'l',
      layout: 'beside',
      label: 'Ziel · Jetzt 20,6°',
    });
    // 192 leaves 84 beside the stepper: the figure at m (72), the label's short form
    expect(fitValueRow(ruler, thermostat(192))).toEqual({
      size: 'm',
      layout: 'beside',
      label: 'Ziel',
    });
  });

  it('stacks under it where neither fits beside it: the reporter’s 157 holds the figure at l', () => {
    expect(fitValueRow(ruler, thermostat(157))).toEqual({
      size: 'l',
      layout: 'stack',
      label: 'Ziel · Jetzt 20,6°',
    });
    expect(fitValueRow(ruler, thermostat(100))).toEqual({
      size: 'm',
      layout: 'stack',
      label: 'Ziel',
    });
  });

  it('takes the stepper’s halves under its width, and lets the stepper go under theirs', () => {
    expect(fitValueRow(ruler, thermostat(90)).layout).toBe('halves');
    expect(fitValueRow(ruler, thermostat(80))).toEqual({
      size: 'm',
      layout: 'alone',
      label: 'Ziel',
    });
  });

  it('is laid out for the widest figure the row can show, never for the one it shows now', () => {
    // 9,5 alone would stand at l beside the stepper at 210; the target's 30,5 does not, so stepping never moves it
    const nine = fitValueRow(ruler, thermostat(210, { figures: [{ value: '9,5', unit: '°C' }] }));
    expect(nine.size).toBe('l');
    expect(fitValueRow(ruler, thermostat(210)).size).toBe('m');
    // a device that can hold a range lays out for the range, at whatever size the column holds it
    const range = thermostat(112, {
      figures: [
        { value: '5,0', unit: '°C' },
        { value: '30,5', unit: '°C' },
        { value: '20,0 – 24,0', unit: '°C' },
      ],
    });
    expect(fitValueRow(ruler, range)).toMatchObject({ size: 'xs', layout: 'stack' });
    // the word for off counts as a figure too
    const off = thermostat(280, {
      figures: [{ value: '30,5', unit: '°C' }, { value: 'Ausgeschaltet' }],
    });
    expect(fitValueRow(ruler, off)).toMatchObject({ size: 'm', layout: 'beside' });
  });

  it('gives the label the longest form its room holds, else the shortest', () => {
    // beside: the room is the width less the stepper and the 12 before it
    expect(fitValueRow(ruler, thermostat(240)).label).toBe('Ziel · Jetzt 20,6°');
    expect(fitValueRow(ruler, thermostat(220)).label).toBe('Ziel');
    expect(fitValueRow(ruler, thermostat(80, { labels: ['A long label here'] })).label).toBe(
      'A long label here',
    );
  });

  it('keeps a readout to the sizes it may take (a side column’s are m and under)', () => {
    // 230 holds "30,5 °C" at l beside the stepper; a side column's readout stays at m
    expect(fitValueRow(ruler, thermostat(230)).size).toBe('l');
    expect(fitValueRow(ruler, thermostat(230, { sizes: ['m', 's', 'xs'] }))).toMatchObject({
      size: 'm',
      layout: 'beside',
    });
    expect(fitValueRow(ruler, thermostat(157, { sizes: ['m', 's', 'xs'] }))).toMatchObject({
      size: 'm',
      layout: 'stack',
    });
  });

  it('lays a row without a control out as the readout alone, at the largest size it holds', () => {
    expect(fitValueRow(ruler, thermostat(157, { control: 0 }))).toEqual({
      size: 'l',
      layout: 'alone',
      label: 'Ziel · Jetzt 20,6°',
    });
    expect(fitValueRow(ruler, thermostat(60, { control: 0 })).size).toBe('xs');
  });
});

describe('valueRowClass', () => {
  it('names the stack and its narrow stepper', () => {
    expect(valueRowClass('beside')).toBe('fv-value-row');
    expect(valueRowClass('alone')).toBe('fv-value-row');
    expect(valueRowClass('stack')).toBe('fv-value-row fv-value-row--stack');
    expect(valueRowClass('halves')).toBe('fv-value-row fv-value-row--stack fv-value-row--halves');
  });
});

describe('sideStacked', () => {
  const charge = { label: 'Car', value: '80', unit: '%' };
  const due = { label: 'Ready by', value: '06:30', unit: '' };

  it('puts the side readout under the reading where the two and 16 between do not fit', () => {
    // 80 % at l is 62, 06:30 at s is 44: 122 with the gap
    expect(sideStacked(ruler, 140, [charge], [due])).toBe(false);
    expect(sideStacked(ruler, 120, [charge], [due])).toBe(true);
    expect(sideStacked(ruler, 120, [charge], [])).toBe(false);
  });

  it('measures each readout in all its forms, its label’s mark included', () => {
    const read = { label: '12:00', value: '100', unit: '%' };
    expect(sideStacked(ruler, 140, [charge, read], [due])).toBe(true);
    // "Ready by" is 53 at 6.6 a letter: a 20 key beside it makes the side readout 73
    expect(sideStacked(ruler, 140, [charge], [{ ...due, mark: 20 }])).toBe(true);
  });
});
