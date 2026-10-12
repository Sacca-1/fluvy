import { houseZone, wallClock, type HomeAssistant } from '@fluvy/core';
import { houseMidnight, type Period } from '../energy-model/period.js';

/**
 * A sensor's history as bars: one bucket per finished day, week or month from Home Assistant's long-term
 * statistics, on the house's clock — a day begins at the midnight Home Assistant shows, a week on its Monday, a
 * month on its first. The recorder is asked once per sensor, period, count, statistic and hour (cards of the same
 * sensor share the answer); a row belongs to the bucket its `start` falls in, never to its position in the list, so
 * a day the recorder skipped (an inverter asleep) stays empty rather than shifting its neighbours.
 */

export type { Period };

/** What a bar says of its bucket: what a meter gained in it, or the mean, the highest or the lowest reading. */
export type Stat = 'change' | 'mean' | 'max' | 'min';
export const STATS: readonly Stat[] = ['change', 'mean', 'max', 'min'];

/** How many buckets a period may show: a season of days, a year of weeks, two years of months. */
export const CAPS: Readonly<Record<Period, number>> = { day: 92, week: 52, month: 24 };

/** A bucket's instants: from its first moment to the next bucket's. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Bucket extends Span {
  /** The statistic over the bucket; null where the recorder has no row for it (0 for a change: nothing was gained). */
  readonly value: number | null;
}

export interface BarsRecord {
  /** The finished buckets, oldest first. */
  readonly buckets: readonly Bucket[];
  /** The bucket in progress (today, this week, this month), drawn only when asked. */
  readonly current: Bucket;
}

/** The recorder's row for a bucket, as `statistics_during_period` returns it (ms instants). */
interface Row {
  readonly start: number;
  readonly change?: number | null;
  readonly mean?: number | null;
  readonly max?: number | null;
  readonly min?: number | null;
}

const DAY = 86_400_000;

const finite = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

/** The weekday (0 Sunday … 6 Saturday) of an instant on the house's calendar. */
const houseWeekday = (hass: HomeAssistant | undefined, at: Date): number => {
  const wall = wallClock(at, houseZone(hass));
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
};

/**
 * The house's midnight of the day `at` falls in, exactly. `houseMidnight` takes the wall clock's elapsed time off
 * the instant, which on the day the clocks go back (a 25-hour day) is an hour short once past the change: the
 * result is read back on the wall clock and moved onto 00:00 when it is not there.
 */
const midnightOf = (hass: HomeAssistant | undefined, at: Date): Date => {
  const zone = houseZone(hass);
  const midnight = houseMidnight(hass, at);
  const wall = wallClock(midnight, zone);
  const off = (wall.hour * 60 + wall.minute) * 60_000;
  if (off === 0) return midnight;
  return new Date(midnight.getTime() - (wall.hour < 12 ? off : off - DAY));
};

/**
 * The house's midnight `days` before the day `at` falls in, counted on the calendar: `houseMidnight` steps back by
 * whole 24-hour days, so a clock change on the way would land an hour off; stepping to the middle of the day wanted
 * and taking its own midnight lands on it whatever the clock did.
 */
const daysBack = (hass: HomeAssistant | undefined, at: Date, days: number): Date => {
  const midnight = midnightOf(hass, at);
  return days === 0
    ? midnight
    : midnightOf(hass, new Date(midnight.getTime() - days * DAY + DAY / 2));
};

/** The first day of the month an instant falls in, at the house's midnight. */
const monthStart = (hass: HomeAssistant | undefined, at: Date): Date =>
  daysBack(hass, at, wallClock(at, houseZone(hass)).day - 1);

/**
 * The starts of the buckets to draw: `count` finished ones (oldest first) and the one in progress, each a house
 * midnight. Weeks start on Monday (the recorder's own week); months on the first. Counted on the house's calendar,
 * so a 25-hour day or a 31-day month is one bucket, as it should be.
 */
export function bucketStarts(
  hass: HomeAssistant | undefined,
  now: Date,
  period: Period,
  count: number,
): { readonly finished: readonly number[]; readonly current: number; readonly next: number } {
  const n = Math.max(0, Math.min(CAPS[period], Math.floor(count)));
  if (period === 'month') {
    const current = monthStart(hass, now);
    const next = monthStart(hass, new Date(current.getTime() + 32 * DAY)).getTime();
    const finished: number[] = [];
    let first = current;
    for (let i = 0; i < n; i++) {
      first = monthStart(hass, new Date(first.getTime() - DAY / 2));
      finished.unshift(first.getTime());
    }
    return { finished, current: current.getTime(), next };
  }
  const length = period === 'week' ? 7 : 1;
  const back = period === 'week' ? (houseWeekday(hass, now) + 6) % 7 : 0;
  const starts = Array.from({ length: n + 1 }, (_unused, i) =>
    daysBack(hass, now, back + (n - i) * length).getTime(),
  );
  const current = starts[n] as number;
  // the next bucket's start: the middle of the day after the current bucket's last, then its own midnight
  const next = midnightOf(hass, new Date(current + length * DAY + DAY / 2)).getTime();
  return { finished: starts.slice(0, n), current, next };
}

/** The spans of the buckets, each ending where the next begins. */
export function bucketSpans(
  hass: HomeAssistant | undefined,
  now: Date,
  period: Period,
  count: number,
): { readonly finished: readonly Span[]; readonly current: Span } {
  const { finished, current, next } = bucketStarts(hass, now, period, count);
  const all = [...finished, current, next];
  return {
    finished: finished.map((start, i) => ({ start, end: all[i + 1] as number })),
    current: { start: current, end: next },
  };
}

/**
 * The rows filed into their buckets by `start`: a change is summed (two rows in one bucket, a clock that went back),
 * a mean averaged, a maximum and a minimum kept; a bucket with no row is 0 for a change and null for the rest.
 */
export function bucketsOf(rows: readonly Row[], spans: readonly Span[], stat: Stat): Bucket[] {
  return spans.map((span) => {
    const inside = rows.filter((row) => {
      const start = finite(row.start);
      return start !== null && start >= span.start && start < span.end;
    });
    const values = inside.map((row) => finite(row[stat])).filter((v): v is number => v !== null);
    if (!values.length) return { ...span, value: stat === 'change' ? 0 : null };
    const total = values.reduce((sum, v) => sum + v, 0);
    const value =
      stat === 'change'
        ? total
        : stat === 'mean'
          ? total / values.length
          : stat === 'max'
            ? Math.max(...values)
            : Math.min(...values);
    return { ...span, value };
  });
}

/** The statistic a sensor's state class calls for: what a meter gained, or the mean of a measurement. */
export const defaultStat = (stateClass: string | undefined): Stat =>
  stateClass === 'measurement' ? 'mean' : 'change';

const ENERGY_UNITS = new Set(['Wh', 'kWh', 'MWh', 'GJ']);
const POWER_UNITS = new Set(['W', 'kW', 'MW']);

/** The unit the recorder is asked to answer in, where it can convert (energy and power); nothing otherwise. */
export const unitsFor = (unit: string): Record<string, string> | undefined =>
  ENERGY_UNITS.has(unit) ? { energy: unit } : POWER_UNITS.has(unit) ? { power: unit } : undefined;

export interface BarsRequest {
  readonly id: string;
  readonly period: Period;
  readonly count: number;
  readonly stat: Stat;
  /** The unit asked of the recorder (the sensor's own, or the card's). */
  readonly unit: string;
  readonly now: Date;
}

const cache = new Map<string, { at: number; promise: Promise<BarsRecord | null> }>();
const TTL = 5 * 60_000;

/**
 * The sensor's bars: one question to the recorder per sensor, period, count, statistic, unit and hour, kept five
 * minutes so cards of the same sensor share it. Resolves null when the recorder knows nothing of the sensor (no
 * statistics at all) or cannot be read.
 */
export function fetchBars(hass: HomeAssistant, request: BarsRequest): Promise<BarsRecord | null> {
  const { id, period, count, stat, unit, now } = request;
  const hour = Math.floor(now.getTime() / 3_600_000);
  const key = `${id}|${period}|${count}|${stat}|${unit}|${hour}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const spans = bucketSpans(hass, now, period, count);
  const from = spans.finished[0]?.start ?? spans.current.start;
  const units = unitsFor(unit);
  const promise = hass
    .callWS<Record<string, Row[]>>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(from).toISOString(),
      statistic_ids: [id],
      period,
      types: [stat],
      ...(units ? { units } : {}),
    })
    .then((result): BarsRecord | null => {
      const rows = result?.[id];
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return {
        buckets: bucketsOf(rows, spans.finished, stat),
        current: bucketsOf(rows, [spans.current], stat)[0] as Bucket,
      };
    })
    .catch(() => null);
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

export const clearBarsCache = (): void => cache.clear();
