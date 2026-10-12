import { describe, expect, it } from 'vitest';

import {
  barGeometry,
  barPath,
  labelled,
  labelsApart,
  niceStep,
  niceTicks,
  thinStep,
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

  it('is the one tick, zero, for a set with nothing in it', () => {
    expect(niceTicks(0, 0)).toEqual({ min: 0, max: 0, step: 0, ticks: [0], decimals: 0 });
    expect(niceTicks(Number.NaN, Number.NaN).ticks).toEqual([0]);
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
