import { isTimeZone, wallClock } from '@fluvy/core';

/*
 * The alerts' time: a span as a config writes it (`for`, `unchanged_for`, an escalation, a snooze), and the instants
 * a wall clock in the house's zone shows (a time window's edges, "tomorrow at eight"). Pure: the caller hands `now`.
 */

/**
 * A span as Home Assistant's own configs write it: seconds, "HH:MM" or "HH:MM:SS" (the hours may run past 23), or an
 * object of `days`, `hours`, `minutes`, `seconds` and `milliseconds`.
 */
export type DurationConfig =
  | number
  | string
  | {
      readonly days?: number;
      readonly hours?: number;
      readonly minutes?: number;
      readonly seconds?: number;
      readonly milliseconds?: number;
    };

const UNITS: Readonly<Record<string, number>> = {
  days: 86_400_000,
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1000,
  milliseconds: 1,
};

const CLOCK = /^(\d+):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/;

/** A span in ms, or undefined when the value is not one (a negative span is not one either). */
export function durationMs(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value * 1000 : undefined;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text) * 1000;
    const clock = CLOCK.exec(text);
    if (!clock) return undefined;
    const [, hours = '0', minutes = '0', seconds = '0'] = clock;
    return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.length) return undefined;
  let total = 0;
  for (const [unit, amount] of entries) {
    const size = UNITS[unit];
    if (size === undefined || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)
      return undefined;
    total += amount * size;
  }
  return total;
}

/** A time of day as Home Assistant's conditions write it ("HH:MM" or "HH:MM:SS"), in seconds; undefined when it is not one. */
export function clockSeconds(text: unknown): number | undefined {
  if (typeof text !== 'string') return undefined;
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every((part) => /^\d+$/.test(part)))
    return undefined;
  const [hours = 0, minutes = 0, seconds = 0] = parts.map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  return (hours * 60 + minutes) * 60 + seconds;
}

/** Home Assistant's short weekdays, Sunday first as `Date.getDay()` counts them. */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A calendar date on a wall. */
export interface WallDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** What a wall clock in that zone shows at `now` (the browser's own clock without a zone): its date, weekday and second of the day. */
export function wallNow(
  now: number,
  zone: string | undefined,
): WallDate & { readonly weekday: Weekday; readonly second: number } {
  const wall = wallClock(new Date(now), zone);
  const weekday = WEEKDAYS[new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay()];
  return {
    year: wall.year,
    month: wall.month,
    day: wall.day,
    weekday: weekday ?? 'sun',
    second: (wall.hour * 60 + wall.minute) * 60 + wall.second,
  };
}

/** The calendar date `offset` days after that one. */
export function plusDays(date: WallDate, offset: number): WallDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + offset));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/**
 * The instant a wall clock in that zone shows that date at that second of the day, found in two passes around the
 * zone's offset (the schedule's `instantOf` does the same); the browser's own clock without a zone.
 */
export function instantAt(date: WallDate, second: number, zone: string | undefined): number {
  if (!zone || !isTimeZone(zone))
    return new Date(date.year, date.month - 1, date.day, 0, 0, second, 0).getTime();
  const want = Date.UTC(date.year, date.month - 1, date.day, 0, 0, second);
  let guess = want;
  for (let pass = 0; pass < 2; pass++) {
    const wall = wallClock(new Date(guess), zone);
    const shown = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    );
    if (shown === want) break;
    guess += want - shown;
  }
  return guess;
}
