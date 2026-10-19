import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMeterCache,
  fetchToday,
  fetchWeek,
  fractionOf,
  kindOf,
  meterFigure,
  statUnits,
  todayOf,
  typicalOf,
} from './today.js';

const HOUR = 3_600_000;
/** Midnight in the house (Madrid, summer time) on 17 September 2026. */
const MIDNIGHT = Date.parse('2026-09-16T22:00:00Z');

/** The recorder's hourly rows from 23:00 the evening before: the reading `opening`, then each hour's change. */
const rows = (opening: number, changes: readonly number[]) => {
  let state = opening;
  return [
    { start: MIDNIGHT - HOUR, change: 0.4, state },
    ...changes.map((change, i) => {
      state += change;
      return { start: MIDNIGHT + i * HOUR, change, state };
    }),
  ];
};

describe('todayOf', () => {
  it('adds the finished hours since midnight and what the meter gained since the last of them', () => {
    // 80 L over 21 compiled hours, the meter 4 L on: 84 L — the hour before midnight is yesterday's
    const hours = [0, 0, 0, 0, 0, 0, 4, 18, 9, 3, 2, 1, 6, 5, 2, 1, 2, 3, 6, 11, 7];
    expect(todayOf(rows(48_126, hours), MIDNIGHT, 48_210)).toBe(84);
  });

  it('reads the start of the day from the hour before midnight when no hour of today is compiled yet', () => {
    expect(todayOf(rows(1529.7, []), MIDNIGHT, 1529.9)).toBeCloseTo(0.2);
  });

  it('counts a meter that was reset from zero', () => {
    expect(todayOf(rows(900, [5, 5]), MIDNIGHT, 3)).toBe(13);
  });

  it('reads a small dip as a dip, as Home Assistant does: only a fall below 90 % is a reset', () => {
    // 910 at the last hour, 905 now: 5 less, not 905 more
    expect(todayOf(rows(900, [5, 5]), MIDNIGHT, 905)).toBe(5);
  });

  it('says nothing it cannot know: no statistics, or no reading now', () => {
    expect(todayOf([], MIDNIGHT, 10)).toBeNull();
    expect(todayOf(rows(100, [1, 2]), MIDNIGHT, null)).toBeNull();
    expect(todayOf([{ start: MIDNIGHT, change: 3 }], MIDNIGHT, 10)).toBeNull(); // no reading to start the hour from
  });
});

describe('typicalOf and fractionOf', () => {
  it('takes the mean of the full days there are', () => {
    const days = [140, 165, 150, 138, 160, 147, 150].map((change, i) => ({ start: i, change }));
    expect(typicalOf(days)).toBe(150);
    expect(
      typicalOf([
        { start: 0, change: 0.3 },
        { start: 1, change: 0.9 },
      ]),
    ).toBeCloseTo(0.6);
    expect(typicalOf([])).toBeNull();
    expect(typicalOf([{ start: 0, change: null }])).toBeNull();
  });

  it('fills today against the typical day, from 0 to 1', () => {
    expect(fractionOf(84, 150)).toBeCloseTo(0.56);
    expect(fractionOf(2.7, 3)).toBeCloseTo(0.9);
    expect(fractionOf(200, 150)).toBe(1);
    expect(fractionOf(null, 150)).toBe(0);
    expect(fractionOf(4, null)).toBe(0);
    expect(fractionOf(4, 0)).toBe(1);
  });
});

describe('units and kinds', () => {
  it('asks the statistics in the meter’s own unit, when Home Assistant can convert it', () => {
    expect(statUnits('L')).toEqual({ volume: 'L' });
    expect(statUnits('m³')).toEqual({ volume: 'm³' });
    expect(statUnits('CCF')).toEqual({ volume: 'CCF' });
    expect(statUnits('kWh')).toEqual({ energy: 'kWh' });
    expect(statUnits('m3')).toBeUndefined();
  });

  it('knows a meter by its device class, a gas meter in kWh by its unit, else water', () => {
    expect(kindOf('gas', 'm³')).toBe('gas');
    expect(kindOf('water', 'L')).toBe('water');
    expect(kindOf('', 'kWh')).toBe('gas');
    expect(kindOf('', 'm³')).toBe('water');
    expect(kindOf('', 'm³', 'gas')).toBe('gas');
  });

  it('writes a figure with the decimal it needs, and keeps it', () => {
    expect(meterFigure(undefined, 84)).toBe('84');
    expect(meterFigure(undefined, 2.7)).toBe('2.7');
    expect(meterFigure(undefined, 3)).toBe('3.0');
    expect(meterFigure(undefined, 0.04)).toBe('0.04');
    expect(meterFigure(undefined, 0)).toBe('0');
  });
});

describe('the statistics a meter asks for', () => {
  afterEach(clearMeterCache);

  /** A house in a zone no test runner is in (UTC+14), the user reading the server's time. */
  const house = (asked: Record<string, unknown>[]) =>
    ({
      config: { time_zone: 'Pacific/Kiritimati' },
      locale: { time_zone: 'server' },
      callWS: async (message: Record<string, unknown>) => {
        asked.push(message);
        return { 'sensor.water': [] };
      },
    }) as unknown as HomeAssistant;

  it('asks from the hour before the house’s midnight, in the meter’s unit, and the seven days before it', async () => {
    const asked: Record<string, unknown>[] = [];
    const hass = house(asked);
    // 10:00 in Kiritimati on the 18th is 20:00 UTC on the 17th: the house's day began at 10:00 UTC
    const now = new Date('2026-09-17T20:00:00Z');
    await fetchToday(hass, 'sensor.water', 'L', now);
    await fetchWeek(hass, 'sensor.water', 'L', now);
    expect(asked[0]).toMatchObject({
      type: 'recorder/statistics_during_period',
      start_time: '2026-09-17T09:00:00.000Z',
      period: 'hour',
      types: ['change', 'state'],
      units: { volume: 'L' },
    });
    expect(asked[1]).toMatchObject({
      start_time: '2026-09-10T10:00:00.000Z',
      end_time: '2026-09-17T10:00:00.000Z',
      period: 'day',
      types: ['change'],
    });
  });

  it('asks once an hour: a second card on the view reads the same answer', async () => {
    const asked: Record<string, unknown>[] = [];
    const hass = house(asked);
    const now = new Date('2026-09-17T20:00:00Z');
    await fetchToday(hass, 'sensor.water', 'L', now);
    await fetchToday(hass, 'sensor.water', 'L', new Date(now.getTime() + 60_000));
    expect(asked).toHaveLength(1);
  });
});
