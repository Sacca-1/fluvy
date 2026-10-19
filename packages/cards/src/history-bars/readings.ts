import { houseZone, wallClock, type HomeAssistant } from '@fluvy/core';
import {
  bucketSpans,
  daysBack,
  finite,
  houseWeekday,
  midnightOf,
  monthStart,
  spanAt,
  type BarsRecord,
  type BarsRequest,
  type Bucket,
  type Cycle,
  type LiveBase,
  type Reset,
  type Row,
  type Span,
  type Stat,
  type Step,
} from './buckets.js';
import { stepGain } from './gain.js';
import { unitsFor } from './units.js';

/**
 * A counter read by its readings — its value at the end of each step — rather than by Home Assistant's sum: the bars
 * of a counter that starts again on a cycle (a day counter, a monthly rain gauge), a reading at the end of each
 * period, and a counter's mean, highest and lowest. The step keeps every reset in sight (`stepOf`), and the gain of
 * a step follows Home Assistant's 10 % rule plus what the cycle says (`stepGain`): at its boundary any fall is a
 * fresh start. Readings are end values, so a restart's glitch or two counters that reset a moment apart never land
 * on one — the double count Home Assistant's sum makes of them never happens here. Loaded by the first card that
 * reads this way.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A reading: the value at the end of its step (the recorder's row `[start, end)`), in the asked unit. */
export interface Reading {
  readonly start: number;
  readonly end: number;
  readonly value: number;
}

/** The start of the cycle an instant falls in, on the house's calendar: its midnight, its Monday, its first, its New Year. */
export function cycleStart(hass: HomeAssistant | undefined, cycle: Cycle, at: number): number {
  const date = new Date(at);
  switch (cycle) {
    case 'day':
      return midnightOf(hass, date).getTime();
    case 'week':
      return daysBack(hass, date, (houseWeekday(hass, date) + 6) % 7).getTime();
    case 'month':
      return monthStart(hass, date).getTime();
    case 'year': {
      // back to the first of January: the first of each month before this one's, one at a time
      let start = monthStart(hass, date).getTime();
      for (let month = wallClock(date, houseZone(hass)).month; month > 1; month--)
        start = monthStart(hass, new Date(start - DAY / 2)).getTime();
      return start;
    }
  }
}

/** The first boundary of a cycle at or after an instant. */
export function nextCycle(hass: HomeAssistant | undefined, cycle: Cycle, at: number): number {
  const start = cycleStart(hass, cycle, at);
  if (start === at) return at;
  // the middle of the cycle's last day is still in it; a day and a half on is past its end, whatever its length
  const span =
    cycle === 'day' ? DAY : cycle === 'week' ? 7 * DAY : cycle === 'month' ? 32 * DAY : 366 * DAY;
  return cycleStart(hass, cycle, start + span + DAY / 2);
}

/** Where a step that holds `at` starts, on the house's calendar (an hour and five minutes by the clock). */
export function stepStart(hass: HomeAssistant | undefined, step: Step, at: number): number {
  switch (step) {
    case '5minute':
      return Math.floor(at / 300_000) * 300_000;
    case 'hour':
      return Math.floor(at / HOUR) * HOUR;
    case 'day':
      return cycleStart(hass, 'day', at);
    case 'week':
      return cycleStart(hass, 'week', at);
    case 'month':
      return cycleStart(hass, 'month', at);
  }
}

/** The step before the one that starts at `start`. */
export const stepBefore = (hass: HomeAssistant | undefined, step: Step, start: number): number =>
  stepStart(hass, step, start - 1);

/** The end of the step that starts at `start`. */
export function stepEnd(hass: HomeAssistant | undefined, step: Step, start: number): number {
  if (step === '5minute') return start + 300_000;
  if (step === 'hour') return start + HOUR;
  const length = step === 'day' ? DAY : step === 'week' ? 7 * DAY : 32 * DAY;
  return stepStart(hass, step, start + length + DAY / 2);
}

/** The cycle a reset names; none for Home Assistant's rule alone or a lifetime meter. */
const cycleOf = (reset: Reset): Cycle | undefined =>
  reset === 'auto' || reset === 'never' ? undefined : reset;

/** Whether a cycle's boundary lies in `[from, to)`. */
const crosses = (
  hass: HomeAssistant | undefined,
  cycle: Cycle | undefined,
  from: number,
  to: number,
): boolean => cycle !== undefined && to > from && cycleStart(hass, cycle, to - 1) >= from;

/** What the gains of a counter's readings need beyond them: the house's calendar, the reset, the step. */
export interface GainContext {
  readonly hass: HomeAssistant | undefined;
  readonly reset: Reset;
  readonly step: Step;
  /**
   * The steps (by their start) where the counter started again at its boundary and climbed past its last reading
   * inside the step — seen in finer readings around the boundary: their gain is the reading itself, not the rise.
   */
  readonly restarted?: ReadonlySet<number>;
}

/** Whether a step is the counter's whole cycle: its reading is the cycle's count. */
const wholeStep = (reset: Reset, step: Step): boolean =>
  (reset === 'day' || reset === 'week' || reset === 'month') && reset === step;

/**
 * The steps a boundary of the cycle opens where the reading rose (`r > p > 0`): the counter may have started again
 * and climbed past what it read (a dry month, then 5 mm on the first), which the two readings alone cannot tell.
 */
export function unclear(readings: readonly Reading[], context: GainContext): Reading[] {
  const cycle = cycleOf(context.reset);
  if (!cycle || wholeStep(context.reset, context.step)) return [];
  return readings.filter((reading, i) => {
    const before = readings[i - 1];
    return (
      before !== undefined &&
      reading.value > before.value &&
      before.value > 0 &&
      crosses(context.hass, cycle, before.end, reading.end)
    );
  });
}

/**
 * What each bucket gained, from the readings in step order. A step's gain (`stepGain`) is filed in the bucket its
 * start falls in. The sensor's first reading counts from zero where its whole cycle lies in its bucket (a day counter
 * first read in the evening gained its reading that day); otherwise it is where counting starts. A bucket before the
 * first reading is null; one after it that no step reached gained nothing.
 */
export function gainsOf(
  readings: readonly Reading[],
  spans: readonly Span[],
  context: GainContext,
): Array<number | null> {
  const { hass, reset, step, restarted } = context;
  const cycle = cycleOf(reset);
  const out: Array<number | null> = spans.map(() => null);
  const file = (at: number, gain: number): void => {
    const i = spanAt(spans, at);
    if (i >= 0) out[i] = (out[i] ?? 0) + gain;
  };
  readings.forEach((reading, i) => {
    const before = readings[i - 1];
    if (!before) {
      const bucket = spans[spanAt(spans, reading.start)];
      if (bucket)
        file(
          reading.start,
          cycle && cycleStart(hass, cycle, reading.start) >= bucket.start ? reading.value : 0,
        );
      return;
    }
    const boundary = crosses(hass, cycle, before.end, reading.end);
    file(
      reading.start,
      boundary && restarted?.has(reading.start)
        ? reading.value
        : stepGain(before.value, reading.value, {
            never: reset === 'never',
            whole: wholeStep(reset, step),
            boundary,
          }),
    );
  });
  const first = readings[0]?.start ?? Infinity;
  return out.map((v, i) => (v === null && (spans[i]?.end ?? 0) > first ? 0 : v));
}

/** Each bucket's reading at its end: the last reading in it; null where it has none. */
export function endsOf(readings: readonly Reading[], spans: readonly Span[]): Array<number | null> {
  const out: Array<number | null> = spans.map(() => null);
  for (const reading of readings) {
    const i = spanAt(spans, reading.start);
    if (i >= 0) out[i] = reading.value;
  }
  return out;
}

/** Each bucket's mean, highest or lowest reading; null where it has none. */
export function extremesOf(
  readings: readonly Reading[],
  spans: readonly Span[],
  stat: 'mean' | 'max' | 'min',
): Array<number | null> {
  return spans.map((span) => {
    const values = readings
      .filter((reading) => reading.start >= span.start && reading.start < span.end)
      .map((reading) => reading.value);
    if (!values.length) return null;
    if (stat === 'max') return Math.max(...values);
    if (stat === 'min') return Math.min(...values);
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  });
}

/** How the reading now carries the bucket in progress on, from the last reading. */
export function liveBaseOf(
  readings: readonly Reading[],
  stat: Stat,
  context: GainContext,
  now: number,
): LiveBase | undefined {
  if (stat === 'mean') return undefined;
  if (stat === 'state' || stat === 'max' || stat === 'min') return { rule: stat };
  const last = readings[readings.length - 1];
  if (!last) return undefined;
  const cycle = cycleOf(context.reset);
  // a compiled reading's instant: its step's end, or now for the step still running
  const at = Math.min(last.end, now);
  return {
    rule: 'gain',
    from: last.value,
    ...(context.reset === 'never' ? { never: true } : {}),
    ...(cycle ? { fresh: nextCycle(context.hass, cycle, at) } : {}),
  };
}

/** The buckets as the stat reads them from the readings: the record a card draws. */
export function recordOf(
  readings: readonly Reading[],
  spans: { readonly finished: readonly Span[]; readonly current: Span },
  stat: Stat,
  context: GainContext,
  now: number,
): BarsRecord | null {
  if (!readings.length) return null;
  const all = [...spans.finished, spans.current];
  const values =
    stat === 'change'
      ? gainsOf(readings, all, context)
      : stat === 'state'
        ? endsOf(readings, all)
        : extremesOf(readings, all, stat);
  const live = liveBaseOf(readings, stat, context, now);
  return {
    buckets: spans.finished.map((span, i) => ({ ...span, value: values[i] ?? null })),
    current: { ...spans.current, value: values[spans.finished.length] ?? null } as Bucket,
    ...(live ? { live } : {}),
  };
}

/* ---------- the recorder ---------- */

/** A finer step than one, to look inside it: five minutes in an hour, an hour in anything longer. */
const finer = (step: Step): Step => (step === 'hour' ? '5minute' : 'hour');

/**
 * At most this many such steps are asked about: a counter whose reading rose at more of its cycle's boundaries than
 * that does not start again on the cycle at all (a lifetime meter read as a day counter), and keeps its rises.
 */
const UNCLEAR = 4;

/** What the finer reading said of a boundary, by sensor, unit and boundary: a step gone by never changes. */
const restarts = new Map<string, Promise<boolean>>();

/**
 * Asks the steps a boundary opened where the reading rose whether the counter started again in them: the finer
 * reading just after the boundary falls below the one before it if it did. One small question each, once; such steps
 * are rare (a dry month, then rain on the first), and one that cannot be read keeps its rise.
 */
async function restartsOf(
  hass: HomeAssistant,
  request: BarsRequest,
  readings: readonly Reading[],
  context: GainContext,
): Promise<ReadonlySet<number>> {
  const cycle = cycleOf(context.reset);
  const steps = unclear(readings, context);
  if (!cycle || !steps.length || steps.length > UNCLEAR) return new Set();
  const units = unitsFor(request.unit);
  const fine = finer(context.step);
  const answers = await Promise.all(
    steps.map(async (reading) => {
      const before = readings[readings.indexOf(reading) - 1] as Reading;
      const boundary = nextCycle(context.hass, cycle, before.end);
      const key = `${request.id}|${request.unit}|${boundary}`;
      let known = restarts.get(key);
      if (!known) {
        known = hass
          .callWS<Record<string, Row[]>>({
            type: 'recorder/statistics_during_period',
            start_time: new Date(boundary).toISOString(),
            end_time: new Date(stepEnd(context.hass, fine, boundary)).toISOString(),
            statistic_ids: [request.id],
            period: fine,
            types: ['state'],
            ...(units ? { units } : {}),
          })
          .then((result) => {
            const first = finite(result?.[request.id]?.[0]?.state);
            return first !== null && first < before.value;
          });
        restarts.set(key, known);
        known.catch(() => restarts.delete(key));
      }
      return (await known.catch(() => false)) ? reading.start : null;
    }),
  );
  return new Set(answers.filter((start): start is number => start !== null));
}

export const clearRestarts = (): void => restarts.clear();

/**
 * A counter's readings at its step, from the recorder's `state` rows — asked from one step before the window, so the
 * first bucket's baseline is known — and the buckets they give.
 */
export async function readBars(
  hass: HomeAssistant,
  request: BarsRequest,
  step: Step,
  spans: ReturnType<typeof bucketSpans>,
): Promise<BarsRecord | null> {
  const first = spans.finished[0]?.start ?? spans.current.start;
  const units = unitsFor(request.unit);
  const result = await hass.callWS<Record<string, Row[]>>({
    type: 'recorder/statistics_during_period',
    start_time: new Date(stepBefore(hass, step, first)).toISOString(),
    statistic_ids: [request.id],
    period: step,
    types: ['state'],
    ...(units ? { units } : {}),
  });
  const readings = readingsOf(hass, result?.[request.id] ?? [], step);
  const base: GainContext = { hass, reset: request.reset, step };
  const restarted =
    request.stat === 'change' ? await restartsOf(hass, request, readings, base) : undefined;
  return recordOf(
    readings,
    spans,
    request.stat,
    restarted?.size ? { ...base, restarted } : base,
    request.now.getTime(),
  );
}

/** The recorder's rows as readings, oldest first: each its `state` at its end. */
export function readingsOf(
  hass: HomeAssistant | undefined,
  rows: readonly Row[],
  step: Step,
): Reading[] {
  return rows
    .flatMap((row): Reading[] => {
      const start = finite(row.start);
      const value = finite(row.state);
      if (start === null || value === null) return [];
      return [{ start, end: finite(row.end) ?? stepEnd(hass, step, start), value }];
    })
    .sort((a, b) => a.start - b.start);
}
