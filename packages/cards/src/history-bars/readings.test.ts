import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { bucketSpans, type Reset, type Span } from './buckets.js';
import { countedStep, stepGain } from './gain.js';
import { withLive } from './live.js';
import {
  cycleStart,
  extremesOf,
  endsOf,
  gainsOf,
  liveBaseOf,
  nextCycle,
  readBars,
  recordOf,
  stepEnd,
  unclear,
  type Reading,
} from './readings.js';

/** The reporter's house, in Germany, on the server's clock: the maths runs there whatever zone the runner is in. */
const berlin = {
  config: { time_zone: 'Europe/Berlin' },
  locale: { time_zone: 'server' },
} as unknown as HomeAssistant;

const HOUR = 3_600_000;
const at = (iso: string): number => Date.parse(iso);

/** Hourly readings from a local hour on: each the value at its hour's end. */
const hourly = (from: string, values: readonly number[]): Reading[] =>
  values.map((value, i) => ({ start: at(from) + i * HOUR, end: at(from) + (i + 1) * HOUR, value }));

/** Daily readings from a house midnight on: each the value at its day's close. */
const daily = (from: string, values: readonly number[]): Reading[] => {
  const out: Reading[] = [];
  let start = at(from);
  for (const value of values) {
    const end = stepEnd(berlin, 'day', start);
    out.push({ start, end, value });
    start = end;
  }
  return out;
};

const all = (spans: { finished: readonly Span[]; current: Span }): Span[] => [
  ...spans.finished,
  spans.current,
];
const round = (values: ReadonlyArray<number | null>): Array<number | null> =>
  values.map((v) => (v === null ? null : Math.round(v * 100) / 100));

describe('the gain of a step', () => {
  it('a lifetime meter’s fall is a fall: a restart to 0 on an hour’s end nets out on the recovery', () => {
    const rules = { never: true };
    expect(stepGain(100, 0, rules)).toBe(-100);
    expect(stepGain(0, 100.4, rules)).toBe(100.4);
  });

  it('a fall below 90 % is a fresh start, a smaller dip is a dip — Home Assistant’s own rule', () => {
    expect(stepGain(10, 8.9)).toBe(8.9);
    expect(stepGain(10, 9.5)).toBeCloseTo(-0.5);
    expect(stepGain(10, 12)).toBe(2);
  });

  it('at the cycle’s boundary any fall is a fresh start; a whole cycle is its reading', () => {
    expect(stepGain(0.3, 0.28, { boundary: true })).toBe(0.28);
    expect(stepGain(0.3, 0.28)).toBeCloseTo(-0.02);
    expect(stepGain(17, 33.3, { whole: true })).toBe(33.3);
  });

  it('as Home Assistant counts the live step: by the state class, a total by its last reset', () => {
    expect(countedStep('total_increasing', 31.9, 33.3)).toBeCloseTo(1.4);
    expect(countedStep('total_increasing', 35.6, 0.2)).toBe(0.2);
    expect(countedStep('total', 51.1, 0.4)).toBeCloseTo(-50.7);
    expect(countedStep('total', 51.1, 0.4, true)).toBe(0.4);
  });
});

describe('the cycles on the house’s calendar', () => {
  it('start at its midnight, Monday, first and New Year', () => {
    const t = at('2026-10-14T16:30:00+02:00');
    expect(cycleStart(berlin, 'day', t)).toBe(at('2026-10-14T00:00:00+02:00'));
    expect(cycleStart(berlin, 'week', t)).toBe(at('2026-10-12T00:00:00+02:00'));
    expect(cycleStart(berlin, 'month', t)).toBe(at('2026-10-01T00:00:00+02:00'));
    expect(cycleStart(berlin, 'year', t)).toBe(at('2026-01-01T00:00:00+01:00'));
    expect(nextCycle(berlin, 'day', t)).toBe(at('2026-10-15T00:00:00+02:00'));
    expect(nextCycle(berlin, 'month', t)).toBe(at('2026-11-01T00:00:00+01:00'));
    expect(nextCycle(berlin, 'day', at('2026-10-15T00:00:00+02:00'))).toBe(
      at('2026-10-15T00:00:00+02:00'),
    );
  });
});

describe('a counter’s gains from its readings', () => {
  it('#45 exactly: a day counter first read that evening, then from zero at midnight, read by the hour', () => {
    const now = new Date('2026-10-14T16:30:00+02:00');
    const spans = bucketSpans(berlin, now, 'day', 6);
    const readings = hourly(
      '2026-10-13T21:00:00+02:00',
      [35.6, 35.6, 35.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1.2, 4.6, 9.4, 15.2, 21.3, 27.4, 33.3],
    );
    const day = gainsOf(readings, all(spans), { hass: berlin, reset: 'day', step: 'hour' });
    // the days before the sensor are not zero days; its first evening is the day's whole count
    expect(round(day)).toEqual([null, null, null, null, null, 35.6, 33.3]);
    // read as a lifetime meter, a day counter's midnight is a fall: why it needs `reset: day`
    const never = gainsOf(readings, all(spans), { hass: berlin, reset: 'never', step: 'hour' });
    expect(round(never)).toEqual([null, null, null, null, null, 0, -2.3]);
  });

  it('#44 exactly: a monthly rain gauge, read by the day', () => {
    const now = new Date('2026-10-13T22:00:00+02:00');
    const spans = bucketSpans(berlin, now, 'day', 28);
    // 47.6 on 14 September, +0.3 / +2.6 / +0.4 on 16–18, +0.2 on 27 → 51.1; 0.0 on 1 October, then +0.9 (3),
    // +0.6 (5), +4.5 (9), +10.9 (10) → 16.9, still 16.9 on 12 October
    const gains: Record<number, number> = {
      2: 0.3,
      3: 2.6,
      4: 0.4,
      13: 0.2,
      19: 0.9,
      21: 0.6,
      25: 4.5,
      26: 10.9,
    };
    const values: number[] = [];
    let v = 47.6;
    for (let day = 0; day < 29; day++) {
      if (day === 17) v = 0; // 1 October
      v = Math.round((v + (gains[day] ?? 0)) * 10) / 10;
      values.push(v);
    }
    const readings = daily('2026-09-14T00:00:00+02:00', values);
    const month = gainsOf(readings, all(spans), { hass: berlin, reset: 'month', step: 'day' });
    const finished = month.slice(0, 28) as number[];
    expect(round([finished[16] ?? null])).toEqual([0]); // 1 October: no bar below zero
    expect(Math.round(finished.reduce((a, b) => a + b, 0) * 10) / 10).toBe(20.4);
    expect(Math.min(...finished)).toBe(0);
    expect(Math.round(Math.max(...finished) * 10) / 10).toBe(10.9);
    const never = gainsOf(readings, all(spans), { hass: berlin, reset: 'never', step: 'day' });
    expect(round([never[16] ?? null])).toEqual([-51.1]);
  });

  it('at its own boundary any fall is a fresh start: 0.30 at midnight, 0.28 at one reads 0.28', () => {
    const spans = [
      { start: at('2026-10-13T00:00:00+02:00'), end: at('2026-10-14T00:00:00+02:00') },
      { start: at('2026-10-14T00:00:00+02:00'), end: at('2026-10-15T00:00:00+02:00') },
    ];
    // the 23:00 hour is the sensor's first reading: its day's whole count so far
    const readings = hourly('2026-10-13T23:00:00+02:00', [0.3, 0.28]);
    expect(round(gainsOf(readings, spans, { hass: berlin, reset: 'day', step: 'hour' }))).toEqual([
      0.3, 0.28,
    ]);
  });

  it('a day counter as weeks: each day read at its close is its own count', () => {
    const now = new Date('2026-10-16T12:00:00+02:00');
    const spans = bucketSpans(berlin, now, 'week', 1);
    // Sunday 11 October (last week's last day), then Monday and Tuesday of this one
    const readings = daily('2026-10-11T00:00:00+02:00', [12, 17, 33.3]);
    expect(
      round(gainsOf(readings, all(spans), { hass: berlin, reset: 'day', step: 'day' })),
    ).toEqual([12, 50.3]);
  });

  it('an inverter that resets at sunrise, and one that resets a minute early, read by the hour', () => {
    const spans = [
      { start: at('2026-10-13T00:00:00+02:00'), end: at('2026-10-14T00:00:00+02:00') },
      { start: at('2026-10-14T00:00:00+02:00'), end: at('2026-10-15T00:00:00+02:00') },
    ];
    const context = { hass: berlin, reset: 'day' as Reset, step: 'hour' as const };
    // held at 35.6 until 07:00, then 0.1 … 33.3
    const sunrise = hourly(
      '2026-10-13T22:00:00+02:00',
      [35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 0.1, 9.4, 33.3],
    );
    // yesterday 35.6 (first read at 23:00, the day's count), today 33.3: midnight is no fall, sunrise is
    expect(round(gainsOf(sunrise, spans, context))).toEqual([35.6, 33.3]);
    // the 23:00 hour ends at 0.0: yesterday keeps its count, today starts from zero
    const early = hourly('2026-10-13T22:00:00+02:00', [35.6, 0, 0, 1.2, 4.6]);
    expect(round(gainsOf(early, spans, context))).toEqual([35.6, 4.6]);
  });

  it('a sunrise inverter under the highest reading or a reading at the end: why a day counter needs its reset', () => {
    const spans = [
      { start: at('2026-10-13T00:00:00+02:00'), end: at('2026-10-14T00:00:00+02:00') },
      { start: at('2026-10-14T00:00:00+02:00'), end: at('2026-10-15T00:00:00+02:00') },
    ];
    const sunrise = hourly(
      '2026-10-13T22:00:00+02:00',
      [35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 35.6, 0.1, 9.4, 33.3],
    );
    // the highest reading of today is yesterday's total, held until sunrise
    expect(extremesOf(sunrise, spans, 'max')).toEqual([35.6, 35.6]);
    // a reading at each day's close: right for a counter that resets at midnight, 0 for one a minute early
    expect(endsOf(daily('2026-10-13T00:00:00+02:00', [35.6]), spans)).toEqual([35.6, null]);
    expect(endsOf(daily('2026-10-13T00:00:00+02:00', [0]), spans)).toEqual([0, null]);
  });

  it('the first reading: a whole cycle in its bucket counts from zero; mid-cycle, or a lifetime meter, it is where counting starts', () => {
    const spans = [
      { start: at('2026-10-13T00:00:00+02:00'), end: at('2026-10-14T00:00:00+02:00') },
      { start: at('2026-10-14T00:00:00+02:00'), end: at('2026-10-15T00:00:00+02:00') },
    ];
    const first = hourly('2026-10-13T21:00:00+02:00', [35.6]);
    expect(gainsOf(first, spans, { hass: berlin, reset: 'day', step: 'hour' })).toEqual([35.6, 0]);
    expect(gainsOf(first, spans, { hass: berlin, reset: 'never', step: 'hour' })).toEqual([0, 0]);
    const gauge = daily('2026-10-13T00:00:00+02:00', [40]);
    expect(gainsOf(gauge, spans, { hass: berlin, reset: 'month', step: 'day' })).toEqual([0, 0]);
  });

  it('across a clock change: the 25-hour day is one bucket, and the next midnight a boundary', () => {
    const now = new Date('2026-10-26T12:00:00+01:00');
    const spans = bucketSpans(berlin, now, 'day', 1);
    // a day counter that gains 1 an hour from midnight on 25 October (CEST until 03:00, then CET)
    const readings = Array.from({ length: 26 }, (_, i) => ({
      start: at('2026-10-25T00:00:00+02:00') + i * HOUR,
      end: at('2026-10-25T00:00:00+02:00') + (i + 1) * HOUR,
      value: i < 25 ? i + 1 : 1,
    }));
    expect((spans.finished[0]!.end - spans.finished[0]!.start) / HOUR).toBe(25);
    expect(gainsOf(readings, all(spans), { hass: berlin, reset: 'day', step: 'hour' })).toEqual([
      25, 1,
    ]);
  });
});

describe('a counter that starts again and climbs past its last reading inside the boundary step', () => {
  const spans = [
    { start: at('2026-09-30T00:00:00+02:00'), end: at('2026-10-01T00:00:00+02:00') },
    { start: at('2026-10-01T00:00:00+02:00'), end: at('2026-10-02T00:00:00+02:00') },
  ];
  // a dry September ends at 0.4 mm; on the 1st it rains 5.0 mm
  const readings = daily('2026-09-30T00:00:00+02:00', [0.4, 5]);
  const context = { hass: berlin, reset: 'month' as Reset, step: 'day' as const };

  it('is unclear from the two readings, and read from the finer ones around the boundary: p ≤ r reads r', () => {
    // 30 September is the sensor's first reading, mid-month: where counting starts
    expect(unclear(readings, context).map((r) => r.start)).toEqual([spans[1]!.start]);
    expect(round(gainsOf(readings, spans, context))).toEqual([0, 4.6]);
    expect(gainsOf(readings, spans, { ...context, restarted: new Set([spans[1]!.start]) })).toEqual(
      [0, 5],
    );
  });

  it('asks the recorder for the first hour after the boundary, and reads 5.0 on the 1st when it fell', async () => {
    const asked: Record<string, unknown>[] = [];
    const hass = {
      ...berlin,
      callWS: async (message: Record<string, unknown>) => {
        asked.push(message);
        if (message['period'] === 'hour')
          return {
            'sensor.rain': [{ start: spans[1]!.start, end: spans[1]!.start + HOUR, state: 0 }],
          };
        return {
          'sensor.rain': readings.map((r) => ({ start: r.start, end: r.end, state: r.value })),
        };
      },
    } as unknown as HomeAssistant;
    const now = new Date('2026-10-02T09:00:00+02:00');
    const record = await readBars(
      hass,
      {
        id: 'sensor.rain',
        period: 'day',
        count: 2,
        stat: 'change',
        reset: 'month',
        source: 'auto',
        kind: 'counter',
        unit: 'mm',
        own: 'mm',
        now,
      },
      'day',
      bucketSpans(hass, now, 'day', 2),
    );
    expect(record?.buckets.map((b) => b.value)).toEqual([0, 5]);
    expect(asked[0]).toMatchObject({ period: 'day', types: ['state'], units: { distance: 'mm' } });
    expect(asked[1]).toMatchObject({
      period: 'hour',
      start_time: new Date(spans[1]!.start).toISOString(),
      end_time: new Date(spans[1]!.start + HOUR).toISOString(),
      types: ['state'],
    });
    // a boundary gone by is asked about once: the next hour's read of the bars asks only for them
    await readBars(
      hass,
      {
        id: 'sensor.rain',
        period: 'day',
        count: 2,
        stat: 'change',
        reset: 'month',
        source: 'auto',
        kind: 'counter',
        unit: 'mm',
        own: 'mm',
        now: new Date(now.getTime() + HOUR),
      },
      'day',
      bucketSpans(hass, now, 'day', 2),
    );
    expect(asked.map((m) => m['period'])).toEqual(['day', 'hour', 'day']);
  });

  it('asks nothing of a counter that rose at every boundary: it does not start again on that cycle', async () => {
    const asked: Record<string, unknown>[] = [];
    // a lifetime meter read as a day counter: 24 kWh a day, every midnight a rise
    const lifetime = hourly(
      '2026-10-08T00:00:00+02:00',
      Array.from({ length: 7 * 24 }, (_, i) => 18_000 + i),
    );
    const hass = {
      ...berlin,
      callWS: async (message: Record<string, unknown>) => {
        asked.push(message);
        return {
          'sensor.meter': lifetime.map((r) => ({ start: r.start, end: r.end, state: r.value })),
        };
      },
    } as unknown as HomeAssistant;
    const now = new Date('2026-10-15T09:00:00+02:00');
    await readBars(
      hass,
      {
        id: 'sensor.meter',
        period: 'day',
        count: 6,
        stat: 'change',
        reset: 'day',
        source: 'auto',
        kind: 'counter',
        unit: 'kWh',
        own: 'kWh',
        now,
      },
      'hour',
      bucketSpans(hass, now, 'day', 6),
    );
    expect(asked.map((m) => m['period'])).toEqual(['hour']);
  });
});

describe('the bucket in progress, live', () => {
  it('a day counter at 16:30 carries on from the 15:00 hour: 31.9 then 33.3 now reads +1.4', () => {
    const now = at('2026-10-14T16:30:00+02:00');
    const spans = bucketSpans(berlin, new Date(now), 'day', 1);
    const readings = hourly('2026-10-14T13:00:00+02:00', [27.4, 31.9]);
    const context = { hass: berlin, reset: 'day' as Reset, step: 'hour' as const };
    const record = recordOf(readings, spans, 'change', context, now)!;
    expect(record.current.value).toBeCloseTo(31.9);
    expect(withLive(record.current, record.live, { value: 33.3 }, now)).toBeCloseTo(33.3);
  });

  it('at 00:00:05, before Home Assistant compiled the 23:00 hour: today reads 0.0, yesterday is as it was', () => {
    const now = at('2026-10-15T00:00:05+02:00');
    const spans = bucketSpans(berlin, new Date(now), 'day', 1);
    // compiled up to the 22:00 hour (its end, 23:00): 33.3
    const readings = hourly('2026-10-14T21:00:00+02:00', [33.3, 33.3]);
    const context = { hass: berlin, reset: 'day' as Reset, step: 'hour' as const };
    const record = recordOf(readings, spans, 'change', context, now)!;
    expect(record.buckets.map((b) => b.value)).toEqual([33.3]);
    expect(withLive(record.current, record.live, { value: 0 }, now)).toBe(0);
  });

  it('keeps the compiled value while the sensor cannot be read, and once the window has rolled past', () => {
    const now = at('2026-10-14T16:30:00+02:00');
    const spans = bucketSpans(berlin, new Date(now), 'day', 1);
    const readings = hourly('2026-10-14T13:00:00+02:00', [27.4, 31.9]);
    const context = { hass: berlin, reset: 'day' as Reset, step: 'hour' as const };
    const record = recordOf(readings, spans, 'change', context, now)!;
    expect(withLive(record.current, record.live, null, now)).toBe(record.current.value);
    expect(withLive(record.current, record.live, { value: 40 }, record.current.end + 1)).toBe(
      record.current.value,
    );
  });

  it('as Home Assistant counts it: its count of the bucket, then a counted step from its newest five minutes', () => {
    const now = at('2026-10-14T16:30:00+02:00');
    const current = {
      start: at('2026-10-14T00:00:00+02:00'),
      end: at('2026-10-15T00:00:00+02:00'),
      value: 32.6,
    };
    const counted = { change: 33, from: 33, lastReset: null };
    expect(
      withLive(current, undefined, { value: 33.3 }, now, {
        counted,
        stateClass: 'total_increasing',
      }),
    ).toBeCloseTo(33.3);
    // without a reading now, its count alone
    expect(
      withLive(current, undefined, null, now, { counted, stateClass: 'total_increasing' }),
    ).toBe(33);
  });

  it('a reading at the end is the reading now; an extreme takes it in', () => {
    const now = at('2026-10-14T16:30:00+02:00');
    const current = {
      start: at('2026-10-14T00:00:00+02:00'),
      end: at('2026-10-15T00:00:00+02:00'),
      value: 12,
    };
    expect(withLive(current, { rule: 'state' }, { value: 16.9 }, now)).toBe(16.9);
    expect(withLive(current, { rule: 'max' }, { value: 16.9 }, now)).toBe(16.9);
    expect(withLive(current, { rule: 'min' }, { value: 16.9 }, now)).toBe(12);
  });

  it('the live base follows the reset: a cycle’s next boundary, or a lifetime meter', () => {
    const readings = hourly('2026-10-14T13:00:00+02:00', [27.4, 31.9]);
    const now = at('2026-10-14T16:30:00+02:00');
    expect(
      liveBaseOf(readings, 'change', { hass: berlin, reset: 'day', step: 'hour' }, now),
    ).toEqual({
      rule: 'gain',
      from: 31.9,
      fresh: at('2026-10-15T00:00:00+02:00'),
    });
    expect(
      liveBaseOf(readings, 'change', { hass: berlin, reset: 'never', step: 'hour' }, now),
    ).toEqual({
      rule: 'gain',
      from: 31.9,
      never: true,
    });
    expect(
      liveBaseOf(readings, 'mean', { hass: berlin, reset: 'auto', step: 'hour' }, now),
    ).toBeUndefined();
  });
});
