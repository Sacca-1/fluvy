import type { HomeAssistant } from '@fluvy/core';
import {
  bucketSpans,
  type BarsRecord,
  type BarsRequest,
  type Bucket,
  type Span,
  type Step,
} from './buckets.js';
import {
  endsOf,
  gainsOf,
  liveBaseOf,
  nextCycle,
  stepBefore,
  stepEnd,
  stepStart,
  unclear,
  type GainContext,
  type Reading,
} from './readings.js';
import { convert } from './units.js';

/**
 * The bars of a sensor the statistics cannot answer — one with no state class, a measurement's reading or change, or
 * any sensor asked `source: history` — from the recorder's history: every state since one step before the window,
 * reduced at once to what the bars need (readings at each step's end, a bucket's extremes with the value carried
 * into it, a time-weighted mean) and dropped. Home Assistant keeps the history for its last days (ten by default),
 * so the buckets before the oldest state are empty. Loaded with the readings.
 */

/** A state as `history/history_during_period` sends it with `minimal_response` (`lu` in seconds). */
interface RawState {
  readonly s: string;
  readonly lu: number;
}

/** A numeric state and its instant (ms). */
export interface Point {
  readonly t: number;
  readonly v: number;
}

/** The history's states as points, oldest first, in `unit`: a state with no number in it is a hole, not a zero. */
export function pointsOf(rows: readonly RawState[], own: string, unit: string): Point[] {
  return rows
    .map((row) => ({
      t: row.lu * 1000,
      // `Number('')` is 0: an empty or unavailable state is a hole, not a zero
      v: /\d/.test(row.s) ? convert(Number(row.s), own, unit) : NaN,
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

/**
 * The readings at the end of each step from the one that holds `from` up to now: the last value before the step's
 * end (the running step's: the latest). A step before the first state has none.
 */
export function readingsAt(
  hass: HomeAssistant | undefined,
  points: readonly Point[],
  step: Step,
  from: number,
  now: number,
): Reading[] {
  const out: Reading[] = [];
  let index = 0;
  let last: number | null = null;
  for (let start = stepStart(hass, step, from); start < now;) {
    const end = stepEnd(hass, step, start);
    const until = Math.min(end, now + 1);
    while (index < points.length && (points[index] as Point).t < until) {
      last = (points[index] as Point).v;
      index++;
    }
    if (last !== null) out.push({ start, end, value: last });
    start = end;
  }
  return out;
}

/** Each bucket's highest or lowest: the value carried into it and every state in it; null before the first state. */
export function extremesAt(
  points: readonly Point[],
  spans: readonly Span[],
  stat: 'max' | 'min',
): Array<number | null> {
  const pick = stat === 'max' ? Math.max : Math.min;
  let index = 0;
  let carried: number | null = null;
  return spans.map((span) => {
    // one pass: the value carried to the bucket's start, then the states in it
    while (index < points.length && (points[index] as Point).t <= span.start)
      carried = (points[index++] as Point).v;
    let value = carried;
    for (let j = index; j < points.length && (points[j] as Point).t < span.end; j++) {
      const v = (points[j] as Point).v;
      value = value === null ? v : pick(value, v);
    }
    return value;
  });
}

/**
 * Each bucket's mean, weighted by how long each value held over the part of it that is known (from its first state,
 * or the one carried in, to its end or now); null before the first state.
 */
export function meansAt(
  points: readonly Point[],
  spans: readonly Span[],
  now: number,
): Array<number | null> {
  const area = spans.map(() => 0);
  const known = spans.map(() => 0);
  let first = 0;
  // one pass: each value held until the next state (the last until now), shared by the buckets it spans
  points.forEach((point, i) => {
    const to = Math.min(points[i + 1]?.t ?? now, now);
    while (first < spans.length && (spans[first] as Span).end <= point.t) first++;
    for (let k = first; k < spans.length && (spans[k] as Span).start < to; k++) {
      const span = spans[k] as Span;
      const held = Math.min(to, span.end) - Math.max(point.t, span.start);
      if (held <= 0) continue;
      area[k] = (area[k] as number) + point.v * held;
      known[k] = (known[k] as number) + held;
    }
  });
  return spans.map((_span, k) => {
    const time = known[k] as number;
    return time > 0 ? (area[k] as number) / time : null;
  });
}

/**
 * The steps a cycle's boundary opened where the reading rose, in which the counter started again: the first state
 * after the boundary is below the reading before it.
 */
function restartsIn(
  points: readonly Point[],
  readings: readonly Reading[],
  context: GainContext,
): ReadonlySet<number> {
  const reset = context.reset;
  if (reset === 'auto' || reset === 'never') return new Set();
  const out = new Set<number>();
  for (const reading of unclear(readings, context)) {
    const before = readings[readings.indexOf(reading) - 1] as Reading;
    const boundary = nextCycle(context.hass, reset, before.end);
    const after = points.find((p) => p.t >= boundary && p.t < reading.end);
    if (after && after.v < before.value) out.add(reading.start);
  }
  return out;
}

/** The sensor's bars from its history: one question from one step before the window to now. */
export async function historyBars(
  hass: HomeAssistant,
  request: BarsRequest,
  step: Step,
  spans: ReturnType<typeof bucketSpans>,
): Promise<BarsRecord | null> {
  const now = request.now.getTime();
  const first = spans.finished[0]?.start ?? spans.current.start;
  const from = stepBefore(hass, step, first);
  const result = await hass.callWS<Record<string, RawState[]>>({
    type: 'history/history_during_period',
    start_time: new Date(from).toISOString(),
    end_time: request.now.toISOString(),
    entity_ids: [request.id],
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
  const points = pointsOf(result?.[request.id] ?? [], request.own, request.unit);
  if (!points.length) return null;
  const all = [...spans.finished, spans.current];
  const stat = request.stat;
  const readings =
    stat === 'change' || stat === 'state' ? readingsAt(hass, points, step, from, now) : [];
  const base: GainContext = { hass, reset: request.reset, step };
  const context: GainContext =
    stat === 'change' ? { ...base, restarted: restartsIn(points, readings, base) } : base;
  const values =
    stat === 'change'
      ? gainsOf(readings, all, context)
      : stat === 'state'
        ? endsOf(readings, all)
        : stat === 'mean'
          ? meansAt(points, all, now)
          : extremesAt(points, all, stat);
  const live = liveBaseOf(readings, stat, context, now);
  return {
    buckets: spans.finished.map((span, i) => ({ ...span, value: values[i] ?? null })),
    current: { ...spans.current, value: values[spans.finished.length] ?? null } as Bucket,
    ...(live ? { live } : {}),
  };
}
