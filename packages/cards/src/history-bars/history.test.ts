import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { bucketSpans } from './buckets.js';
import { extremesAt, historyBars, meansAt, pointsOf, readingsAt } from './history.js';

/** A house in Madrid on the server's clock. */
const madrid = {
  config: { time_zone: 'Europe/Madrid' },
  locale: { time_zone: 'server' },
} as unknown as HomeAssistant;

const at = (iso: string): number => Date.parse(iso);
/** A state as the history sends it: its value and its instant in seconds. */
const state = (s: string, iso: string) => ({ s, lu: at(iso) / 1000 });

describe('the history’s states', () => {
  it('are points in the unit asked, oldest first; a state with no number in it is a hole', () => {
    const points = pointsOf(
      [
        state('12.0', '2026-10-10T08:00:00+02:00'),
        state('unavailable', '2026-10-10T09:00:00+02:00'),
        state('', '2026-10-10T09:30:00+02:00'),
        state('3.5', '2026-10-10T07:00:00+02:00'),
      ],
      'mm',
      'in',
    );
    expect(points.map((p) => p.t)).toEqual([
      at('2026-10-10T07:00:00+02:00'),
      at('2026-10-10T08:00:00+02:00'),
    ]);
    expect(points[1]!.v).toBeCloseTo(12 / 25.4, 6);
  });
});

describe('the history reduced', () => {
  const points = pointsOf(
    [
      state('10', '2026-10-09T20:00:00+02:00'),
      state('20', '2026-10-10T06:00:00+02:00'),
      state('5', '2026-10-10T18:00:00+02:00'),
      state('8', '2026-10-11T12:00:00+02:00'),
    ],
    'W',
    'W',
  );
  const days = [
    { start: at('2026-10-08T00:00:00+02:00'), end: at('2026-10-09T00:00:00+02:00') },
    { start: at('2026-10-09T00:00:00+02:00'), end: at('2026-10-10T00:00:00+02:00') },
    { start: at('2026-10-10T00:00:00+02:00'), end: at('2026-10-11T00:00:00+02:00') },
    { start: at('2026-10-11T00:00:00+02:00'), end: at('2026-10-12T00:00:00+02:00') },
  ];
  const now = at('2026-10-11T18:00:00+02:00');

  it('a reading at the end of each step: the last value before it; none before the first state', () => {
    const readings = readingsAt(madrid, points, 'day', days[0]!.start, now);
    expect(readings.map((r) => [new Date(r.start).toISOString(), r.value])).toEqual([
      ['2026-10-08T22:00:00.000Z', 10],
      ['2026-10-09T22:00:00.000Z', 5],
      ['2026-10-10T22:00:00.000Z', 8],
    ]);
  });

  it('a bucket’s highest and lowest take in the value carried into it; null before the first state', () => {
    expect(extremesAt(points, days, 'max')).toEqual([null, 10, 20, 8]);
    expect(extremesAt(points, days, 'min')).toEqual([null, 10, 5, 5]);
  });

  it('a bucket’s mean is weighted by how long each value held, over the part of it that is known', () => {
    const means = meansAt(points, days, now);
    expect(means[0]).toBeNull();
    // 9 October: 10 from 20:00 to midnight
    expect(means[1]).toBe(10);
    // 10 October: 10 for 6 h, 20 for 12 h, 5 for 6 h
    expect(means[2]).toBeCloseTo((10 * 6 + 20 * 12 + 5 * 6) / 24, 6);
    // 11 October, up to 18:00: 5 for 12 h, 8 for 6 h
    expect(means[3]).toBeCloseTo((5 * 12 + 8 * 6) / 18, 6);
  });
});

describe('a sensor’s bars from its history', () => {
  it('asks once, from one step before the window, every state and no attributes', async () => {
    const asked: Record<string, unknown>[] = [];
    const hass = {
      ...madrid,
      callWS: async (message: Record<string, unknown>) => {
        asked.push(message);
        return {
          'sensor.tank': [
            state('400', '2026-10-07T00:00:00+02:00'),
            state('380', '2026-10-08T12:00:00+02:00'),
            state('360', '2026-10-09T12:00:00+02:00'),
          ],
        };
      },
    } as unknown as HomeAssistant;
    const now = new Date('2026-10-10T12:00:00+02:00');
    const record = await historyBars(
      hass,
      {
        id: 'sensor.tank',
        period: 'day',
        count: 4,
        stat: 'state',
        reset: 'auto',
        source: 'auto',
        kind: 'none',
        unit: 'L',
        own: 'L',
        now,
      },
      'day',
      bucketSpans(hass, now, 'day', 4),
    );
    expect(asked).toEqual([
      {
        type: 'history/history_during_period',
        start_time: new Date(at('2026-10-05T00:00:00+02:00')).toISOString(),
        end_time: now.toISOString(),
        entity_ids: ['sensor.tank'],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      },
    ]);
    // 6 October: before the first state; 7–9 October: each day's last; today: the latest so far, live from here
    expect(record?.buckets.map((b) => b.value)).toEqual([null, 400, 380, 360]);
    expect(record?.current.value).toBe(360);
    expect(record?.live).toEqual({ rule: 'state' });
  });

  it('is none when the history has no number for the sensor', async () => {
    const hass = {
      ...madrid,
      callWS: async () => ({ 'sensor.tank': [state('unknown', '2026-10-09T12:00:00+02:00')] }),
    } as unknown as HomeAssistant;
    const now = new Date('2026-10-10T12:00:00+02:00');
    const record = await historyBars(
      hass,
      {
        id: 'sensor.tank',
        period: 'day',
        count: 2,
        stat: 'state',
        reset: 'auto',
        source: 'auto',
        kind: 'none',
        unit: 'L',
        own: 'L',
        now,
      },
      'day',
      bucketSpans(hass, now, 'day', 2),
    );
    expect(record).toBeNull();
  });
});
