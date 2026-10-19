import type { HomeAssistant } from '@fluvy/core';
import { COMPILED, finite, type Bucket, type LiveBase, type Row } from './buckets.js';
import { countedStep, stepGain } from './gain.js';
import { unitsFor } from './units.js';

/**
 * The bucket in progress, live. Home Assistant compiles a sensor's statistics every five minutes and an hour ten
 * seconds into the next, so what it has counted of today is minutes old; the card carries it on to the sensor's
 * reading now with one step of the same rules, on every state change, without asking the recorder again. As Home
 * Assistant counts it (`reset: auto`) the bucket so far is its own `statistic_during_period` (five minutes old at
 * most) and the step starts at its newest five-minute reading; read by its readings, the step starts at the last
 * compiled reading. A reading that is not a number keeps the compiled value; a test's frozen clock has no live.
 */

/** What Home Assistant has counted of the bucket in progress, and the reading it counted up to. */
export interface Counted {
  /** Its change since the bucket began, through its newest five minutes; null while it has none. */
  readonly change: number | null;
  /** The reading at the end of those five minutes, in the asked unit; null without one. */
  readonly from: number | null;
  /** That reading's `last_reset` (ms), for a `total` that starts again when it changes. */
  readonly lastReset: number | null;
}

const FIVE = 300_000;
const cache = new Map<string, { at: number; promise: Promise<Counted> }>();

/** The key a count is kept by: the sensor, the unit, the bucket, and the five minutes compiled a minute ago. */
export const countedKey = (id: string, unit: string, start: number, now: Date): string =>
  `${id}|${unit}|${start}|${Math.floor((now.getTime() - COMPILED) / FIVE)}`;

/**
 * Asks Home Assistant what it has counted of the bucket that began at `start`, and its newest five-minute reading:
 * once every five minutes per sensor, a minute after each is compiled; a question that failed is asked again.
 */
export function fetchCounted(
  hass: HomeAssistant,
  id: string,
  unit: string,
  start: number,
  now: Date,
  withReset: boolean,
): Promise<Counted> {
  const key = countedKey(id, unit, start, now);
  const hit = cache.get(key);
  if (hit) return hit.promise;
  const units = unitsFor(unit);
  const promise = Promise.all([
    hass.callWS<{ change?: number | null }>({
      type: 'recorder/statistic_during_period',
      statistic_id: id,
      fixed_period: { start_time: new Date(start).toISOString() },
      types: ['change'],
      ...(units ? { units } : {}),
    }),
    // the newest of the last two hours' five-minute rows (two dozen at most): a recorder behind still has one
    hass.callWS<Record<string, Row[]>>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(now.getTime() - 24 * FIVE).toISOString(),
      statistic_ids: [id],
      period: '5minute',
      types: withReset ? ['state', 'last_reset'] : ['state'],
      ...(units ? { units } : {}),
    }),
  ]).then(([counted, rows]): Counted => {
    const newest = rows?.[id]?.reduce<Row | undefined>(
      (last, row) => (!last || row.start > last.start ? row : last),
      undefined,
    );
    return {
      change: finite(counted?.change),
      from: finite(newest?.state),
      lastReset: finite(newest?.last_reset),
    };
  });
  for (const [k, v] of cache) if (v.at < Date.now() - 2 * FIVE) cache.delete(k);
  const entry = { at: Date.now(), promise };
  cache.set(key, entry);
  promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

/** The reading now, as the bucket in progress needs it: in the asked unit, with its own `last_reset` (ms). */
export interface Reading {
  readonly value: number;
  readonly lastReset?: number | null;
}

/**
 * The bucket in progress with the reading now: HA's count carried on by a counted step (`counted`), a counter's
 * compiled gain carried on by a step of its rules, the reading itself, or an extreme that takes it in. No reading
 * (a sensor unavailable now, a frozen clock) or a window that has rolled past keeps the compiled value.
 */
export function withLive(
  current: Bucket,
  base: LiveBase | undefined,
  reading: Reading | null,
  now: number,
  counted?: { readonly counted: Counted; readonly stateClass: string | undefined },
): number | null {
  if (now < current.start || now >= current.end) return current.value;
  if (counted) {
    const { change, from, lastReset } = counted.counted;
    if (change === null && from === null) return current.value;
    if (from === null || !reading) return change ?? current.value;
    const resetChanged =
      lastReset !== null &&
      reading.lastReset !== undefined &&
      reading.lastReset !== null &&
      Math.abs(reading.lastReset - lastReset) > 1000;
    return (change ?? 0) + countedStep(counted.stateClass, from, reading.value, resetChanged);
  }
  if (!base || !reading) return current.value;
  const r = reading.value;
  switch (base.rule) {
    case 'state':
      return r;
    case 'max':
      return current.value === null ? r : Math.max(current.value, r);
    case 'min':
      return current.value === null ? r : Math.min(current.value, r);
    case 'gain':
      if (base.from === undefined) return current.value;
      return (
        (current.value ?? 0) +
        stepGain(base.from, r, {
          ...(base.never ? { never: true } : {}),
          boundary: base.fresh !== undefined && now >= base.fresh,
        })
      );
  }
}

export const clearLiveCache = (): void => cache.clear();
