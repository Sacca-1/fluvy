import { houseZone, wallClock, type HomeAssistant } from '@fluvy/core';
import { houseMidnight, type Period } from '../energy-model/period.js';
import { unitsFor } from './units.js';

/**
 * A sensor's history as bars: one bucket per finished day, week or month on the house's clock — a day begins at the
 * midnight Home Assistant shows, a week on its Monday, a month on its first — and the one in progress. What fills
 * them is asked by what the sensor is and what a bar shows (`questionFor`): Home Assistant's own long-term rows
 * where they answer it (a meter's change as it counts it, a measurement's mean, highest and lowest), a counter's
 * readings at a step where it starts again on a cycle or a bar is its reading (the readings, a chunk of their own),
 * and the recorder's history for a sensor with no statistics. One question per sensor, window, way of reading and
 * hour, shared by the cards of that sensor; a question that failed is never kept, so it is asked again.
 */

export type { Period };

/** What a bar says of its bucket: what a meter gained in it, its reading at the end, or the mean, the highest or the lowest reading. */
export type Stat = 'change' | 'state' | 'mean' | 'max' | 'min';
export const STATS: readonly Stat[] = ['change', 'state', 'mean', 'max', 'min'];

/**
 * When a counter starts again from zero: as Home Assistant counts it (`auto`, its sum — the Energy dashboard's
 * numbers), never (a lifetime meter), or on a cycle of the house's calendar (a day counter, a monthly rain gauge),
 * which reads the bars from its readings so a reset or a restart is never counted twice.
 */
export type Reset = 'auto' | 'never' | 'day' | 'week' | 'month' | 'year';
export const RESETS: readonly Reset[] = ['auto', 'never', 'day', 'week', 'month', 'year'];
/** A counter's cycle on the house's calendar. */
export type Cycle = Exclude<Reset, 'auto' | 'never'>;

/** Where the bars are read from: statistics where they can answer, else the history; or the history always. */
export type Source = 'auto' | 'history';
export const SOURCES: readonly Source[] = ['auto', 'history'];

/** What a sensor is to the recorder, by its state class: a counter (a sum), a measurement (a mean), or neither. */
export type SensorKind = 'counter' | 'measurement' | 'none';

/** The length of a reading's step, as the recorder names its periods. */
export type Step = '5minute' | 'hour' | 'day' | 'week' | 'month';

/** How many buckets a period may show: a season of days, a year of weeks, two years of months. */
export const CAPS: Readonly<Record<Period, number>> = { day: 92, week: 52, month: 24 };

/** A bucket's instants: from its first moment to the next bucket's. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Bucket extends Span {
  /** The statistic over the bucket; null before the sensor's first reading and where a measurement has none. */
  readonly value: number | null;
}

/**
 * How a reading now carries the bucket in progress on, past the last one the recorder compiled: a counter's gain
 * from that reading (`gain`, by the step rules), the reading itself (`state`), or an extreme that takes it in.
 */
export interface LiveBase {
  readonly rule: 'gain' | 'state' | 'max' | 'min';
  /** The last compiled reading, in the asked unit (a gain's start). */
  readonly from?: number;
  /** The first boundary of the counter's cycle at or after that reading: from it on, any fall is a fresh start. */
  readonly fresh?: number;
  /** A lifetime meter: a fall is a fall. */
  readonly never?: boolean;
}

export interface BarsRecord {
  /** The finished buckets, oldest first. */
  readonly buckets: readonly Bucket[];
  /** The bucket in progress (today, this week, this month), as compiled: drawn only when asked. */
  readonly current: Bucket;
  /** How the reading now moves the bucket in progress; none where it does not (a mean) or is asked apart (HA's count). */
  readonly live?: LiveBase;
}

/** The recorder's row for a bucket, as `statistics_during_period` returns it (ms instants). */
export interface Row {
  readonly start: number;
  readonly end?: number;
  readonly change?: number | null;
  readonly state?: number | null;
  readonly mean?: number | null;
  readonly max?: number | null;
  readonly min?: number | null;
  readonly last_reset?: number | null;
}

const DAY = 86_400_000;

export const finite = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

/** The weekday (0 Sunday … 6 Saturday) of an instant on the house's calendar. */
export const houseWeekday = (hass: HomeAssistant | undefined, at: Date): number => {
  const wall = wallClock(at, houseZone(hass));
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
};

/**
 * The house's midnight of the day `at` falls in, exactly. `houseMidnight` takes the wall clock's elapsed time off
 * the instant, which on the day the clocks go back (a 25-hour day) is an hour short once past the change: the
 * result is read back on the wall clock and moved onto 00:00 when it is not there.
 */
export const midnightOf = (hass: HomeAssistant | undefined, at: Date): Date => {
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
export const daysBack = (hass: HomeAssistant | undefined, at: Date, days: number): Date => {
  const midnight = midnightOf(hass, at);
  return days === 0
    ? midnight
    : midnightOf(hass, new Date(midnight.getTime() - days * DAY + DAY / 2));
};

/** The first day of the month an instant falls in, at the house's midnight. */
export const monthStart = (hass: HomeAssistant | undefined, at: Date): Date =>
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

/** The bucket an instant falls in, by index; -1 outside them. */
export const spanAt = (spans: readonly Span[], at: number): number =>
  spans.findIndex((span) => at >= span.start && at < span.end);

/**
 * Home Assistant's rows filed into their buckets by `start`: a change is summed (two rows in one bucket, a clock that
 * went back), a mean averaged, a maximum and a minimum kept. A bucket before the first row is null — the sensor was
 * not there yet — and so is a measurement's without a row; a meter's bucket after it with no row gained nothing.
 */
export function bucketsOf(
  rows: readonly Row[],
  spans: readonly Span[],
  stat: 'change' | 'mean' | 'max' | 'min',
): Bucket[] {
  const starts = rows.map((row) => finite(row.start)).filter((s): s is number => s !== null);
  const first = starts.length ? Math.min(...starts) : Infinity;
  return spans.map((span) => {
    const inside = rows.filter((row) => {
      const start = finite(row.start);
      return start !== null && start >= span.start && start < span.end;
    });
    const values = inside.map((row) => finite(row[stat])).filter((v): v is number => v !== null);
    if (!values.length) return { ...span, value: stat === 'change' && span.end > first ? 0 : null };
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

/* ---------- what to ask ---------- */

/** What a sensor is to the recorder, by its state class. */
export const kindOf = (stateClass: string | undefined): SensorKind =>
  stateClass === 'total' || stateClass === 'total_increasing'
    ? 'counter'
    : stateClass === 'measurement'
      ? 'measurement'
      : 'none';

/** The statistic a sensor's state class calls for: what a meter gained, a measurement's mean, else its reading. */
export const defaultStat = (stateClass: string | undefined): Stat => {
  const kind = kindOf(stateClass);
  return kind === 'counter' ? 'change' : kind === 'measurement' ? 'mean' : 'state';
};

/**
 * The cycle a utility meter starts again on, from its `last_reset` and `next_reset`: a day, a week, a month or a year
 * that begins where the house's does, the editor's word under "When it resets" (the card counts as Home Assistant
 * does until a reset is chosen). A cycle of another length, or one offset from the house's calendar (a month from the
 * 15th), is none of them.
 */
export function meterCycle(
  hass: HomeAssistant | undefined,
  attributes: Readonly<Record<string, unknown>>,
): Cycle | undefined {
  const last = Date.parse(String(attributes['last_reset'] ?? ''));
  const next = Date.parse(String(attributes['next_reset'] ?? ''));
  if (!Number.isFinite(last) || !(next > last)) return undefined;
  const days = (next - last) / DAY;
  const wall = wallClock(new Date(last), houseZone(hass));
  if (wall.hour !== 0 || wall.minute !== 0) return undefined;
  // a clock change makes a day 23 or 25 hours long, a week a few minutes past seven days
  if (Math.abs(days - 1) < 0.1) return 'day';
  if (Math.abs(days - 7) < 0.1 && houseWeekday(hass, new Date(last)) === 1) return 'week';
  if (wall.day !== 1) return undefined;
  if (days > 27.9 && days < 31.1) return 'month';
  if (wall.month === 1 && days > 364.9 && days < 366.1) return 'year';
  return undefined;
}

/**
 * Whether the bars add up: each is its bucket's own count — what a meter gained, or a reading taken where the counter
 * starts again (a monthly gauge's reading at each month's end) — so a total, money and the equivalents mean something.
 */
export const additive = (stat: Stat, reset: Reset, period: Period): boolean =>
  stat === 'change' || (stat === 'state' && reset === period);

/** How the bars are read: Home Assistant's rows, a counter's readings at a step, or the history reduced at a step. */
export type Plan =
  | { readonly from: 'rows'; readonly stat: 'change' | 'mean' | 'max' | 'min' }
  | { readonly from: 'readings' | 'history'; readonly step: Step };

/**
 * The step a counter is read at: one where every reset stays visible. Its cycle's own length where a bar is a whole
 * cycle (a day counter as weeks: each day read at its close is its own count); an hour for a day counter's days and
 * a counter's extremes by day; a day otherwise; the bars' period for a lifetime meter and for a reading at the end.
 */
export function stepOf(stat: Stat, reset: Reset, period: Period): Step {
  if (stat === 'state' || (stat === 'change' && reset === 'never')) return period;
  if (stat !== 'change' || reset === 'auto') return period === 'day' ? 'hour' : 'day';
  if (reset === 'day') return period === 'day' ? 'hour' : 'day';
  if (reset === period || (reset === 'year' && period === 'month')) return period;
  return 'day';
}

/**
 * How a sensor's bars are read, by what it is and what a bar shows. A counter's change as Home Assistant counts it
 * and a measurement's mean, highest and lowest are its rows; a counter that starts again on a cycle, a reading at the
 * end, or a counter's extremes come from its readings; a measurement's change or reading, a sensor with no state
 * class, or `source: history`, from the history.
 */
export function questionFor(
  kind: SensorKind,
  stat: Stat,
  reset: Reset,
  period: Period,
  source: Source,
): Plan {
  const step = stepOf(stat, reset, period);
  if (source === 'history' || kind === 'none') return { from: 'history', step };
  if (kind === 'measurement')
    return stat === 'mean' || stat === 'max' || stat === 'min'
      ? { from: 'rows', stat }
      : { from: 'history', step };
  return stat === 'change' && reset === 'auto'
    ? { from: 'rows', stat: 'change' }
    : { from: 'readings', step };
}

/* ---------- asking ---------- */

export interface BarsRequest {
  readonly id: string;
  readonly period: Period;
  readonly count: number;
  readonly stat: Stat;
  readonly reset: Reset;
  readonly source: Source;
  readonly kind: SensorKind;
  /** The unit asked of the recorder (the sensor's own, or the card's where it converts). */
  readonly unit: string;
  /** The sensor's own unit: its history is in it. */
  readonly own: string;
  readonly now: Date;
}

const cache = new Map<string, { at: number; promise: Promise<BarsRecord | null> }>();
const TTL = 5 * 60_000;
const HOUR = 3_600_000;
/** How long after the hour turns it is asked for again: Home Assistant compiles an hour ten seconds into the next. */
export const COMPILED = 60_000;

/**
 * The key a request is kept by: the sensor, the window, the way it is read and the unit, the bucket in progress and
 * the hour that ended a minute ago — so the window rolls at midnight and an hour is asked for once it is compiled.
 */
export function barsKey(hass: HomeAssistant | undefined, request: BarsRequest): string {
  const { id, period, count, stat, reset, source, unit, now } = request;
  const current = bucketStarts(hass, now, period, 0).current;
  const hour = Math.floor((now.getTime() - COMPILED) / HOUR);
  return `${id}|${period}|${count}|${stat}|${reset}|${source}|${unit}|${current}|${hour}`;
}

/** Remembers a question for five minutes — unless it fails: a recorder that could not be read is asked again. */
function remember(key: string, promise: Promise<BarsRecord | null>): Promise<BarsRecord | null> {
  const entry = { at: Date.now(), promise };
  if (cache.size >= 200) for (const [k, v] of cache) if (entry.at - v.at >= TTL) cache.delete(k);
  cache.set(key, entry);
  promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

/**
 * The sensor's bars, asked as `questionFor` says, shared by the cards that ask the same within five minutes. Resolves
 * null when the recorder knows nothing of the sensor; rejects when it cannot be read (never kept: asked again).
 */
export function fetchBars(hass: HomeAssistant, request: BarsRequest): Promise<BarsRecord | null> {
  const key = barsKey(hass, request);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const plan = questionFor(
    request.kind,
    request.stat,
    request.reset,
    request.period,
    request.source,
  );
  const spans = bucketSpans(hass, request.now, request.period, request.count);
  const promise =
    plan.from === 'rows'
      ? fetchRows(hass, request, plan.stat, spans)
      : plan.from === 'readings'
        ? import('./readings.js').then((m) => m.readBars(hass, request, plan.step, spans))
        : import('./history.js').then((m) => m.historyBars(hass, request, plan.step, spans));
  return remember(key, promise);
}

/** Home Assistant's own rows at the bars' period, from the oldest bucket: a meter's change, a measurement's mean or extreme. */
async function fetchRows(
  hass: HomeAssistant,
  request: BarsRequest,
  stat: 'change' | 'mean' | 'max' | 'min',
  spans: ReturnType<typeof bucketSpans>,
): Promise<BarsRecord | null> {
  const from = spans.finished[0]?.start ?? spans.current.start;
  const units = unitsFor(request.unit);
  const result = await hass.callWS<Record<string, Row[]>>({
    type: 'recorder/statistics_during_period',
    start_time: new Date(from).toISOString(),
    statistic_ids: [request.id],
    period: request.period,
    types: [stat],
    ...(units ? { units } : {}),
  });
  const rows = result?.[request.id];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const [current] = bucketsOf(rows, [spans.current], stat);
  return {
    buckets: bucketsOf(rows, spans.finished, stat),
    current: current as Bucket,
    ...(stat === 'max' || stat === 'min' ? { live: { rule: stat } } : {}),
  };
}

export const clearBarsCache = (): void => cache.clear();
