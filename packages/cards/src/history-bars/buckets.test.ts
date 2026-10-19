import { wallClock, type HomeAssistant } from '@fluvy/core';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  additive,
  barsKey,
  bucketSpans,
  bucketStarts,
  bucketsOf,
  clearBarsCache,
  defaultStat,
  fetchBars,
  kindOf,
  meterCycle,
  questionFor,
  type BarsRequest,
  type Period,
  type Plan,
  type Reset,
  type SensorKind,
  type Source,
  type Stat,
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

describe('rows before the sensor was there', () => {
  const spans = [
    { start: 0, end: 100 },
    { start: 100, end: 200 },
    { start: 200, end: 300 },
  ];

  it('a bucket before the first row is null; one after it with no row gained nothing', () => {
    const rows = [
      { start: 110, change: 17 },
      { start: 290, change: 51.2 },
    ];
    expect(bucketsOf(rows, spans, 'change').map((b) => b.value)).toEqual([null, 17, 51.2]);
    expect(bucketsOf([{ start: 110, change: 17 }], spans, 'change').map((b) => b.value)).toEqual([
      null,
      17,
      0,
    ]);
  });
});

describe('the statistic a sensor calls for, and how it is read', () => {
  it('is the change of a meter, the mean of a measurement, the reading of a sensor with no state class', () => {
    expect(defaultStat('total_increasing')).toBe('change');
    expect(defaultStat('total')).toBe('change');
    expect(defaultStat('measurement')).toBe('mean');
    // 1.9: a sensor with no state class has no statistics: its bars are its readings, from the history
    expect(defaultStat(undefined)).toBe('state');
    expect(kindOf('total')).toBe('counter');
    expect(kindOf('measurement')).toBe('measurement');
    expect(kindOf(undefined)).toBe('none');
  });

  it('asks Home Assistant’s rows where they answer, a counter’s readings or the history where they do not', () => {
    const table: Array<[SensorKind, Stat, Reset, Period, Source, Plan]> = [
      // a meter's change as HA counts it, a measurement's mean, highest and lowest: its own rows, as in 1.8
      ['counter', 'change', 'auto', 'day', 'auto', { from: 'rows', stat: 'change' }],
      ['measurement', 'mean', 'auto', 'day', 'auto', { from: 'rows', stat: 'mean' }],
      ['measurement', 'max', 'auto', 'week', 'auto', { from: 'rows', stat: 'max' }],
      // a day counter's days by the hour; its weeks and months by the day, each day read at its close
      ['counter', 'change', 'day', 'day', 'auto', { from: 'readings', step: 'hour' }],
      ['counter', 'change', 'day', 'week', 'auto', { from: 'readings', step: 'day' }],
      ['counter', 'change', 'day', 'month', 'auto', { from: 'readings', step: 'day' }],
      // a monthly counter by the day, its months by the month
      ['counter', 'change', 'month', 'day', 'auto', { from: 'readings', step: 'day' }],
      ['counter', 'change', 'month', 'month', 'auto', { from: 'readings', step: 'month' }],
      ['counter', 'change', 'week', 'week', 'auto', { from: 'readings', step: 'week' }],
      ['counter', 'change', 'year', 'month', 'auto', { from: 'readings', step: 'month' }],
      // a lifetime meter, and a reading at the end, by the bars' own period
      ['counter', 'change', 'never', 'week', 'auto', { from: 'readings', step: 'week' }],
      ['counter', 'state', 'auto', 'month', 'auto', { from: 'readings', step: 'month' }],
      // a counter's extremes by the hour for days, by the day otherwise
      ['counter', 'max', 'auto', 'day', 'auto', { from: 'readings', step: 'hour' }],
      ['counter', 'mean', 'auto', 'week', 'auto', { from: 'readings', step: 'day' }],
      // the history: a measurement's change or reading, a sensor with no state class, or when asked
      ['measurement', 'state', 'auto', 'day', 'auto', { from: 'history', step: 'day' }],
      ['measurement', 'change', 'auto', 'day', 'auto', { from: 'history', step: 'hour' }],
      ['none', 'state', 'auto', 'day', 'auto', { from: 'history', step: 'day' }],
      ['counter', 'change', 'day', 'day', 'history', { from: 'history', step: 'hour' }],
    ];
    for (const [kind, stat, reset, period, source, plan] of table)
      expect(
        questionFor(kind, stat, reset, period, source),
        `${kind} ${stat} ${reset} ${period}`,
      ).toEqual(plan);
  });

  it('adds up a change, and a reading where the counter starts again with each bar', () => {
    expect(additive('change', 'auto', 'day')).toBe(true);
    expect(additive('state', 'month', 'month')).toBe(true);
    expect(additive('state', 'auto', 'month')).toBe(false);
    expect(additive('mean', 'auto', 'day')).toBe(false);
  });
});

describe('a utility meter’s cycle', () => {
  const meter = (last: string, next: string) => ({ last_reset: last, next_reset: next });

  it('is read from its last and next reset, where the house’s calendar starts one', () => {
    expect(meterCycle(madrid, meter('2026-10-09T22:00:00Z', '2026-10-10T22:00:00Z'))).toBe('day');
    // the clocks go back on 25 October: a 25-hour day is still a day
    expect(meterCycle(madrid, meter('2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'))).toBe('day');
    expect(meterCycle(madrid, meter('2026-10-04T22:00:00Z', '2026-10-11T22:00:00Z'))).toBe('week');
    expect(meterCycle(madrid, meter('2026-09-30T22:00:00Z', '2026-10-31T23:00:00Z'))).toBe('month');
    expect(meterCycle(madrid, meter('2025-12-31T23:00:00Z', '2026-12-31T23:00:00Z'))).toBe('year');
  });

  it('is none for a cycle offset from the house’s, an hourly one, or a sensor that is no utility meter', () => {
    // a month from the 15th, a week from a Wednesday, a meter reset at 06:00
    expect(
      meterCycle(madrid, meter('2026-10-14T22:00:00Z', '2026-11-14T23:00:00Z')),
    ).toBeUndefined();
    expect(
      meterCycle(madrid, meter('2026-10-06T22:00:00Z', '2026-10-13T22:00:00Z')),
    ).toBeUndefined();
    expect(
      meterCycle(madrid, meter('2026-10-10T04:00:00Z', '2026-10-11T04:00:00Z')),
    ).toBeUndefined();
    expect(
      meterCycle(madrid, meter('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z')),
    ).toBeUndefined();
    expect(meterCycle(madrid, { last_reset: '2026-10-09T22:00:00Z' })).toBeUndefined();
    expect(meterCycle(madrid, {})).toBeUndefined();
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
  const request: Omit<BarsRequest, 'unit' | 'now'> = {
    id: 'sensor.solar',
    period: 'day',
    count: 7,
    stat: 'change',
    reset: 'auto',
    source: 'auto',
    kind: 'counter',
    own: 'kWh',
  };

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

  it('shares one answer between cards asking the same within the hour, and asks again a minute past it', async () => {
    const { hass, asked } = recorder({ 'sensor.solar': [{ start: 1, change: 1 }] });
    const half = new Date('2026-10-10T10:30:00Z');
    await Promise.all([
      fetchBars(hass, { ...request, unit: 'kWh', now: half }),
      fetchBars(hass, { ...request, unit: 'kWh', now: half }),
    ]);
    await fetchBars(hass, { ...request, unit: 'kWh', now: new Date(half.getTime() + 60_000) });
    expect(asked.length).toBe(1);
    // Home Assistant compiles an hour ten seconds into the next: at 13:00:30 the hour is not asked for again yet,
    // at 13:01 it is
    const hour = Date.parse('2026-10-10T11:00:00Z');
    await fetchBars(hass, { ...request, unit: 'kWh', now: new Date(hour + 30_000) });
    expect(asked.length).toBe(1);
    await fetchBars(hass, { ...request, unit: 'kWh', now: new Date(hour + 60_000) });
    expect(asked.length).toBe(2);
  });

  it('asks again at midnight: the window rolls with the day', () => {
    const before = new Date('2026-10-10T21:59:50Z');
    const after = new Date('2026-10-10T22:00:05Z');
    expect(barsKey(madrid, { ...request, unit: 'kWh', now: before })).not.toBe(
      barsKey(madrid, { ...request, unit: 'kWh', now: after }),
    );
  });

  it('answers null for a sensor the recorder knows nothing of', async () => {
    expect(await fetchBars(recorder({}).hass, { ...request, unit: '°C', now })).toBeNull();
    clearBarsCache();
    expect(
      await fetchBars(recorder({ 'sensor.solar': [] }).hass, { ...request, unit: '°C', now }),
    ).toBeNull();
  });

  it('tells a recorder that cannot be read from one that knows nothing, and never keeps the failure', async () => {
    const broken = recorder(() => {
      throw new Error('offline');
    });
    await expect(fetchBars(broken.hass, { ...request, unit: '°C', now })).rejects.toThrow(
      'offline',
    );
    expect(broken.asked[0]).not.toHaveProperty('units');
    await expect(fetchBars(broken.hass, { ...request, unit: '°C', now })).rejects.toThrow(
      'offline',
    );
    expect(broken.asked.length).toBe(2);
  });
});
