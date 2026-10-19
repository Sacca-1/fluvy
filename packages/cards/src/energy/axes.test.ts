import { describe, expect, it } from 'vitest';

import { powerScale, tickText } from './axes.js';

describe('a stacked energy chart’s power scale (issue #49)', () => {
  it('is the history bars’ scale: nice steps, four intervals at most, zero a tick', () => {
    // the reporter's day: 9.8 kW at noon, 3 kW out at night
    expect(powerScale(9.8, 3, false)).toEqual({
      ticks: [-5, 0, 5, 10],
      unit: 'kW',
      decimals: 0,
      above: 2,
    });
    expect(powerScale(1.5, 0.95, false).ticks).toEqual([-1, 0, 1, 2]);
    expect(powerScale(13.5, 0, false).ticks).toEqual([0, 5, 10, 15]);
  });

  it('reads in watts below a kilowatt, the ticks still in kW', () => {
    const scale = powerScale(0.8, 0, false);
    expect(scale.unit).toBe('W');
    expect(scale.ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(scale.decimals).toBe(0);
  });

  it('under the charge’s scale, gives a positive half of three a fourth, so the charge falls on quarters', () => {
    // 0 · 5 · 10 · 15 would read 0 · 33 · 67 · 100 %: 20 on top reads 0 · 25 · 50 · 75 · 100 %
    expect(powerScale(13.5, 0, true)).toMatchObject({ ticks: [0, 5, 10, 15, 20], above: 4 });
    // two and four above zero already fall on halves and quarters: unchanged
    expect(powerScale(9.8, 3, true)).toMatchObject({ ticks: [-5, 0, 5, 10], above: 2 });
    expect(powerScale(9.8, 0, true)).toMatchObject({ ticks: [0, 2.5, 5, 7.5, 10], above: 4 });
  });

  it('counts the charge’s fourth among the four: a tick below zero leaves it no room, so the step grows', () => {
    // −5 … 15 and 20 on top would be five intervals: by 10, 0 · 50 · 100 % on two lines
    expect(powerScale(13.5, 4, true)).toMatchObject({ ticks: [-10, 0, 10, 20], above: 2 });
    expect(powerScale(13.5, 4, false)).toMatchObject({ ticks: [-5, 0, 5, 10, 15], above: 3 });
    expect(powerScale(0.7, 0.2, true)).toMatchObject({ ticks: [-0.5, 0, 0.5, 1], unit: 'W' });
  });

  it('never draws more than four intervals, with the charge or without, over any day', () => {
    const wrong: string[] = [];
    for (let down = 0; down <= 15; down += 0.05)
      for (let up = 0.05; up <= 30; up += 0.35)
        for (const charge of [false, true]) {
          const { ticks, above } = powerScale(up, down, charge);
          if (
            ticks.length - 1 > 4 ||
            ticks[0]! > -down + 1e-9 ||
            ticks.at(-1)! < up - 1e-9 ||
            !ticks.includes(0) ||
            (charge && ![1, 2, 4].includes(above))
          )
            wrong.push(`${up.toFixed(2)} up, ${down.toFixed(2)} down, charge ${charge}: ${ticks}`);
        }
    expect(wrong).toEqual([]);
  });

  it('writes a negative tick with a true minus', () => {
    expect(tickText(undefined, -5, 0)).toBe('−5');
    expect(tickText(undefined, 2.5, 1)).toBe('2.5');
    expect(tickText(undefined, 1, 1)).toBe('1.0');
  });
});
