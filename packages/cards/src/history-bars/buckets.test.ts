import { wallClock, type HomeAssistant } from '@fluvy/core';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  bucketSpans,
  bucketStarts,
  bucketsOf,
  clearBarsCache,
  defaultStat,
  fetchBars,
  unitsFor,
} from './buckets.js';

/** A house in Madrid whose profile reads the server's clock: the maths runs there whatever zone the runner is in. */
const madrid = {
  config: { time_zone: 'Europe/Madrid' },
  locale: { time_zone: 'server' },
} as unknown as HomeAssistant;

const wall = (ms: number) => wallClock(new Date(ms), 'Europe/Madrid');
const ymd = (ms: number): string => {
  const w = wall(ms);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')} ${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
};

describe('the buckets of a period, on the house’s calendar', () => {
  it('days: the finished ones oldest first, today, and tomorrow as its end', () => {
    const { finished, current, next } = bucketStarts(
      madrid,
      new Date('2026-10-10T10:00:00Z'),
      'day',
      7,
    );
    expect(finished.map(ymd)).toEqual([
      '2026-10-03 00:00',
      '2026-10-04 00:00',
      '2026-10-05 00:00',
      '2026-10-06 00:00',
      '2026-10-07 00:00',
      '2026-10-08 00:00',
      '2026-10-09 00:00',
    ]);
    expect(ymd(current)).toBe('2026-10-10 00:00');
    expect(ymd(next)).toBe('2026-10-11 00:00');
  });

  it('days across a clock change: every bucket still starts at midnight', () => {
    // the clocks went back on 25 October 2026 at 03:00 CEST: a 25-hour day
    const { finished } = bucketStarts(madrid, new Date('2026-11-01T11:00:00Z'), 'day', 10);
    expect(finished.map(ymd)).toEqual([
      '2026-10-22 00:00',
      '2026-10-23 00:00',
      '2026-10-24 00:00',
      '2026-10-25 00:00',
      '2026-10-26 00:00',
      '2026-10-27 00:00',
      '2026-10-28 00:00',
      '2026-10-29 00:00',
      '2026-10-30 00:00',
      '2026-10-31 00:00',
    ]);
    const spans = bucketSpans(madrid, new Date('2026-11-01T11:00:00Z'), 'day', 10).finished;
    expect((spans[3]!.end - spans[3]!.start) / 3_600_000).toBe(25);
    expect((spans[4]!.end - spans[4]!.start) / 3_600_000).toBe(24);
  });

  it('weeks start on Monday, the recorder’s own week', () => {
    // 10 October 2026 is a Saturday
    const { finished, current, next } = bucketStarts(
      madrid,
      new Date('2026-10-10T10:00:00Z'),
      'week',
      3,
    );
    expect(finished.map(ymd)).toEqual(['2026-09-14 00:00', '2026-09-21 00:00', '2026-09-28 00:00']);
    expect(ymd(current)).toBe('2026-10-05 00:00');
    expect(ymd(next)).toBe('2026-10-12 00:00');
  });

  it('months start on the first, each as long as it is', () => {
    const { finished, current, next } = bucketStarts(
      madrid,
      new Date('2026-10-10T10:00:00Z'),
      'month',
      3,
    );
    expect(finished.map(ymd)).toEqual(['2026-07-01 00:00', '2026-08-01 00:00', '2026-09-01 00:00']);
    expect(ymd(current)).toBe('2026-10-01 00:00');
    expect(ymd(next)).toBe('2026-11-01 00:00');
    const spans = bucketSpans(madrid, new Date('2026-10-10T10:00:00Z'), 'month', 3).finished;
    expect((spans[0]!.end - spans[0]!.start) / 86_400_000).toBe(31);
    expect((spans[2]!.end - spans[2]!.start) / 86_400_000).toBe(30);
  });

  it('is capped at a season of days, a year of weeks, two years of months', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    expect(bucketStarts(madrid, now, 'day', 200).finished.length).toBe(92);
    expect(bucketStarts(madrid, now, 'week', 60).finished.length).toBe(52);
    expect(bucketStarts(madrid, now, 'month', 30).finished.length).toBe(24);
    expect(bucketStarts(madrid, now, 'day', 0).finished.length).toBe(0);
  });
});

describe('rows filed into their buckets', () => {
  const spans = [
    { start: 0, end: 100 },
    { start: 100, end: 200 },
    { start: 200, end: 300 },
  ];

  it('go by their start, never their position; a bucket without a row gained nothing', () => {
    const rows = [
      { start: 210, change: 3 },
      { start: 10, change: 1.5 },
    ];
    expect(bucketsOf(rows, spans, 'change').map((b) => b.value)).toEqual([1.5, 0, 3]);
  });

  it('sum a change that came in two rows, and leave a measurement’s empty bucket null', () => {
    const rows = [
      { start: 10, change: 1, mean: 10, max: 12, min: 8 },
      { start: 50, change: 2, mean: 20, max: 30, min: 4 },
    ];
    expect(bucketsOf(rows, spans, 'change').map((b) => b.value)).toEqual([3, 0, 0]);
    expect(bucketsOf(rows, spans, 'mean').map((b) => b.value)).toEqual([15, null, null]);
    expect(bucketsOf(rows, spans, 'max').map((b) => b.value)).toEqual([30, null, null]);
    expect(bucketsOf(rows, spans, 'min').map((b) => b.value)).toEqual([4, null, null]);
  });

  it('ignore a row with no number in it', () => {
    const rows = [{ start: 10, change: null }, { start: 110 }];
    expect(bucketsOf(rows, spans, 'change').map((b) => b.value)).toEqual([0, 0, 0]);
    expect(bucketsOf(rows, spans, 'mean').map((b) => b.value)).toEqual([null, null, null]);
  });
});

describe('the statistic a sensor calls for, and the unit asked of the recorder', () => {
  it('is the change of a meter, the mean of a measurement', () => {
    expect(defaultStat('total_increasing')).toBe('change');
    expect(defaultStat('total')).toBe('change');
    expect(defaultStat('measurement')).toBe('mean');
    expect(defaultStat(undefined)).toBe('change');
  });

  it('converts energy and power, nothing else', () => {
    expect(unitsFor('kWh')).toEqual({ energy: 'kWh' });
    expect(unitsFor('W')).toEqual({ power: 'W' });
    expect(unitsFor('°C')).toBeUndefined();
    expect(unitsFor('')).toBeUndefined();
  });
});

describe('asking the recorder', () => {
  beforeEach(() => clearBarsCache());

  /** A recorder that answers from a table and remembers what it was asked. */
  const recorder = (table: Record<string, unknown> | (() => never)) => {
    const asked: Record<string, unknown>[] = [];
    const hass = {
      ...madrid,
      callWS: async (message: Record<string, unknown>) => {
        asked.push(message);
        if (typeof table === 'function') table();
        return table;
      },
    } as unknown as HomeAssistant;
    return { hass, asked };
  };
  const now = new Date('2026-10-10T10:00:00Z');
  const request = { id: 'sensor.solar', period: 'day' as const, count: 7, stat: 'change' as const };

  it('asks once from the oldest bucket, by day, for the one statistic, in the sensor’s unit', async () => {
    const oct3 = Date.parse('2026-10-02T22:00:00Z');
    const { hass, asked } = recorder({
      'sensor.solar': [
        { start: oct3, change: 35.4 },
        { start: oct3 + 6 * 86_400_000, change: 26.9 },
        { start: oct3 + 7 * 86_400_000, change: 4.2 },
      ],
    });
    const record = await fetchBars(hass, { ...request, unit: 'kWh', now });
    expect(asked).toEqual([
      {
        type: 'recorder/statistics_during_period',
        start_time: '2026-10-02T22:00:00.000Z',
        statistic_ids: ['sensor.solar'],
        period: 'day',
        types: ['change'],
        units: { energy: 'kWh' },
      },
    ]);
    expect(record?.buckets.map((b) => b.value)).toEqual([35.4, 0, 0, 0, 0, 0, 26.9]);
    expect(record?.current.value).toBe(4.2);
  });

  it('shares one answer between cards asking the same within the hour', async () => {
    const { hass, asked } = recorder({ 'sensor.solar': [{ start: 1, change: 1 }] });
    await Promise.all([
      fetchBars(hass, { ...request, unit: 'kWh', now }),
      fetchBars(hass, { ...request, unit: 'kWh', now }),
    ]);
    await fetchBars(hass, { ...request, unit: 'kWh', now: new Date(now.getTime() + 60_000) });
    expect(asked.length).toBe(1);
    await fetchBars(hass, { ...request, unit: 'kWh', now: new Date(now.getTime() + 3_600_000) });
    expect(asked.length).toBe(2);
  });

  it('answers null for a sensor the recorder knows nothing of, and for a recorder that cannot be read', async () => {
    expect(await fetchBars(recorder({}).hass, { ...request, unit: '°C', now })).toBeNull();
    clearBarsCache();
    expect(
      await fetchBars(recorder({ 'sensor.solar': [] }).hass, { ...request, unit: '°C', now }),
    ).toBeNull();
    clearBarsCache();
    const broken = recorder(() => {
      throw new Error('offline');
    });
    expect(await fetchBars(broken.hass, { ...request, unit: '°C', now })).toBeNull();
    expect(broken.asked[0]).not.toHaveProperty('units');
  });
});
