import { describe, expect, it } from 'vitest';

import {
  barGeometry,
  barPath,
  labelled,
  labelsApart,
  niceStep,
  niceTicks,
  thinStep,
  typical,
} from './scale.js';

describe('a nice step', () => {
  it('is 1, 2, 2.5 or 5 times a power of ten, the smallest that spans the range in four steps or fewer', () => {
    expect(niceStep(35.4)).toEqual({ step: 10, decimals: 0 });
    expect(niceStep(28.7)).toEqual({ step: 10, decimals: 0 });
    expect(niceStep(16.8)).toEqual({ step: 5, decimals: 0 });
    expect(niceStep(203)).toEqual({ step: 100, decimals: 0 });
    expect(niceStep(11)).toEqual({ step: 5, decimals: 0 });
    expect(niceStep(9)).toEqual({ step: 2.5, decimals: 1 });
    expect(niceStep(2.9)).toEqual({ step: 1, decimals: 0 });
    expect(niceStep(0.45)).toEqual({ step: 0.2, decimals: 1 });
    expect(niceStep(1200)).toEqual({ step: 500, decimals: 0 });
  });

  it('takes the intervals asked for, and answers 1 for nothing', () => {
    expect(niceStep(35.4, 4)).toEqual({ step: 10, decimals: 0 });
    expect(niceStep(35.4, 8)).toEqual({ step: 5, decimals: 0 });
    expect(niceStep(0)).toEqual({ step: 1, decimals: 0 });
    expect(niceStep(Number.NaN)).toEqual({ step: 1, decimals: 0 });
  });
});

describe('nice ticks', () => {
  it('run from zero to a tick above the highest bar', () => {
    expect(niceTicks(0, 35.4).ticks).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0, 16.8).ticks).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(0, 28.7).ticks).toEqual([0, 10, 20, 30]);
    expect(niceTicks(0, 0.45)).toEqual({
      min: 0,
      max: 0.6,
      step: 0.2,
      ticks: [0, 0.2, 0.4, 0.6],
      decimals: 1,
    });
  });

  it('always hold zero: a scale of positive readings starts there, a signed one crosses it on a tick', () => {
    expect(niceTicks(12, 24).ticks).toEqual([0, 10, 20, 30]);
    expect(niceTicks(-3.2, 8.1).ticks).toEqual([-5, 0, 5, 10]);
    expect(niceTicks(-40, 0).ticks).toEqual([-40, -30, -20, -10, 0]);
  });

  it('never run to more than four intervals: a signed scale widened to whole ticks takes the next step', () => {
    // by 2.5 these widen to five intervals (the flow sheet's hybrid inverter read −7.5 … 5.0)
    expect(niceTicks(-5.05, 2.55).ticks).toEqual([-10, -5, 0, 5]);
    expect(niceTicks(-2.55, 5.05).ticks).toEqual([-5, 0, 5, 10]);
    expect(niceTicks(-0.01, 7.56).ticks).toEqual([-5, 0, 5, 10]);
    expect(niceTicks(-7.56, 0.01).ticks).toEqual([-10, -5, 0, 5]);
    expect(niceTicks(-0.01, 0.77)).toMatchObject({ ticks: [-0.5, 0, 0.5, 1], decimals: 1 });
    // a scale that holds four by its first step keeps it
    expect(niceTicks(-3.2, 8.1, 3).ticks).toEqual([-5, 0, 5, 10]);
  });

  it('hold both ends and zero in the intervals asked for, over any extent either side of zero', () => {
    const wrong: string[] = [];
    for (let lo = 0; lo >= -30; lo -= 0.11)
      for (let hi = 0; hi <= 30; hi += 0.13)
        for (const intervals of [3, 4]) {
          const { ticks, min, max } = niceTicks(lo, hi, intervals);
          if (
            ticks.length - 1 > intervals ||
            min > lo + 1e-9 ||
            max < hi - 1e-9 ||
            !ticks.includes(0)
          )
            wrong.push(`${lo.toFixed(2)} … ${hi.toFixed(2)} in ${intervals}: ${ticks.join(' ')}`);
        }
    expect(wrong).toEqual([]);
  });

  it('is the one tick, zero, for a set with nothing in it', () => {
    expect(niceTicks(0, 0)).toEqual({ min: 0, max: 0, step: 0, ticks: [0], decimals: 0 });
    expect(niceTicks(Number.NaN, Number.NaN).ticks).toEqual([0]);
  });
});

describe('a typical bar', () => {
  it('is the middle one by size, so a spike reads in the unit of the rest', () => {
    // a lifetime meter after a restart, as Home Assistant counts it: 18,257.3 kWh counted again on one day
    expect(typical([24.1, 31.5, 28.2, 26.4, 18_280.2, 30.8, 27.5])).toBe(28.2);
    expect(typical([35_400, 34_400, 28_600, 26_500])).toBe(34_400);
  });

  it('counts a bar below zero by its size, and leaves out the bars with nothing in them', () => {
    expect(typical([5.2, -3.1, 7.8, -6.4, 2.2])).toBe(5.2);
    expect(typical([null, 0, 0, 12_400, 0, null])).toBe(12_400);
    expect(typical([null, 0])).toBe(0);
    expect(typical([])).toBe(0);
  });
});

describe('date labels', () => {
  it('thin to every n-th bar so neighbours keep 12 px, and never under every bar', () => {
    expect(thinStep(38, 276 / 7)).toBe(2); // "Oct 03" at 39 a slot: 50 over 39.4 → every second day
    expect(thinStep(20, 276 / 7)).toBe(1);
    expect(thinStep(38, 276 / 30)).toBe(6);
    expect(thinStep(38, 0)).toBe(1);
  });

  it('stand apart once placed: a label kept inside the plot at an end may crowd its neighbour', () => {
    expect(
      labelsApart([
        { x: 20, width: 40 },
        { x: 80, width: 40 },
      ]),
    ).toBe(true); // 40 … 60: 20 apart
    expect(
      labelsApart([
        { x: 20, width: 40 },
        { x: 70, width: 40 },
      ]),
    ).toBe(false); // 40 … 50: 10 apart
    expect(labelsApart([{ x: 20, width: 40 }])).toBe(true);
    expect(labelsApart([])).toBe(true);
  });

  it('keep the last bar labelled, counting back from it', () => {
    expect(labelled(7, 1)).toEqual([true, true, true, true, true, true, true]);
    expect(labelled(7, 2)).toEqual([true, false, true, false, true, false, true]);
    expect(labelled(30, 6).filter(Boolean).length).toBe(5);
    expect(labelled(30, 6)[29]).toBe(true);
    expect(labelled(30, 6)[0]).toBe(false);
  });
});

describe('a bar in its slot', () => {
  it('takes 40 % of the slot on whole pixels, between 2 and 40, its corners 4 at most', () => {
    expect(barGeometry(7, 276)).toEqual({ slot: 276 / 7, bar: 16, radius: 4 });
    expect(barGeometry(92, 276).bar).toBe(2);
    expect(barGeometry(92, 276).radius).toBe(1);
    expect(barGeometry(3, 700).bar).toBe(40);
    expect(barGeometry(0, 276).bar).toBe(40);
  });
});

describe('a bar as a path', () => {
  it('is rounded at the top and flat on the zero line, or the other way round for a bar that hangs', () => {
    expect(barPath(10, 20, 16, 40, 4, 'top')).toBe('M10,24a4,4 0 0 1 4,-4h8a4,4 0 0 1 4,4v36h-16z');
    expect(barPath(10, 20, 16, 40, 4, 'bottom')).toBe(
      'M10,20h16v36a4,4 0 0 1 -4,4h-8a4,4 0 0 1 -4,-4z',
    );
  });

  it('never rounds more than half the bar, however short or thin', () => {
    expect(barPath(0, 0, 16, 2, 4, 'top')).toBe('M0,1a1,1 0 0 1 1,-1h14a1,1 0 0 1 1,1v1h-16z');
    expect(barPath(0, 0, 2, 40, 4, 'top')).toBe('M0,1a1,1 0 0 1 1,-1h0a1,1 0 0 1 1,1v39h-2z');
    expect(barPath(0.25, 3.33, 16, 40, 4, 'top').startsWith('M0.3,7.3a4,4')).toBe(true);
  });
});
