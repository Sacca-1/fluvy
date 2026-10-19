import { clock12, dateFormat, houseZone, type WallClock } from '@fluvy/core';
import type { HomeAssistant } from '@fluvy/core';

/**
 * Time for a clock: the instant comes from the browser, the wall clock from `Intl` in the zone that
 * was asked for. Nothing here keeps state, so every function can be tested with a fixed `Date`.
 */

export type { WallClock };

/** The pieces of a displayed time: "9:47", ":12", "PM" — the last two ride the baseline as the unit. */
export interface ClockParts {
  readonly time: string;
  readonly seconds: string;
  readonly period: string;
}

export interface ClockFormat {
  readonly language: string;
  readonly hour12: boolean;
  readonly timeZone: string | undefined;
}

/** `time_zone` of the card, else Home Assistant's zone when the profile says "server", else the browser's. */
export function resolveTimeZone(
  hass: HomeAssistant | undefined,
  configured: string | undefined,
): string | undefined {
  return configured || houseZone(hass);
}

/** The card's `hour12`, else the profile's 12 / 24, else what the language ("language") or the browser ("system") writes. */
export function resolveHour12(
  hass: HomeAssistant | undefined,
  configured: boolean | undefined,
): boolean {
  return configured ?? clock12(hass);
}

/**
 * The locale that writes the date. Every language formats itself; bare "en" says nothing about the
 * order, so the profile's DMY / MDY decides, and without one a 24 h household reads day-first
 * ("Thursday 17 September") and a 12 h one month-first ("Thursday, September 17").
 */
export function dateLocale(hass: HomeAssistant | undefined, hour12: boolean): string {
  const language = hass?.locale?.language ?? hass?.language ?? 'en';
  if (language !== 'en') return language;
  const order = hass?.locale?.date_format;
  if (order === 'DMY') return 'en-GB';
  if (order === 'MDY') return 'en-US';
  return hour12 ? 'en-US' : 'en-GB';
}

/**
 * `clockFace` reads the LOCAL fields of a Date, so another zone reaches it as a Date whose local
 * fields are that zone's wall clock. Only the time of day matters to a face: it is set on a fixed
 * winter day, where no browser zone has a missing hour to shift it.
 */
export const faceDate = (wall: WallClock, milliseconds: number): Date =>
  new Date(2001, 0, 1, wall.hour, wall.minute, wall.second, milliseconds);

/** The wall clock's calendar day at local noon — what `isoWeek` needs, clear of any midnight change. */
export const calendarDate = (wall: WallClock): Date =>
  new Date(wall.year, wall.month - 1, wall.day, 12);

function timeParts(date: Date, format: ClockFormat, seconds: boolean): Intl.DateTimeFormatPart[] {
  const options: Intl.DateTimeFormatOptions = {
    hour: format.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    ...(format.hour12 ? { hour12: true } : { hourCycle: 'h23' }),
  };
  return dateFormat(format.language, {
    ...options,
    ...(format.timeZone ? { timeZone: format.timeZone } : {}),
  }).formatToParts(date);
}

/** A time of day in the clock's zone and hour cycle, split the way the sheet sets it. */
export function clockParts(date: Date, format: ClockFormat, seconds = false): ClockParts {
  const parts = timeParts(date, format, seconds);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hourAt = parts.findIndex((part) => part.type === 'hour');
  const separator =
    parts[hourAt + 1]?.type === 'literal' ? parts[hourAt + 1]?.value.trim() || ':' : ':'; // "21:47", "21.47" in Finnish
  return {
    time: `${value('hour')}${separator}${value('minute')}`,
    seconds: seconds ? `${separator}${value('second')}` : '',
    period: value('dayPeriod').replace(/\s/g, ''), // "p. m." is one unit on the baseline: "p.m."
  };
}

/**
 * "Thursday 17 September" (full), "Thu 17 Sep" (short) or "17 Sep" (tiny: the day alone, where not even the short
 * one holds), in the clock's zone. `locale` writes the order; when it is a regional stand-in for `language` (en-GB
 * for a day-first "en"), the month keeps the language's own abbreviation — "Sep", which the rest of that user's Home
 * Assistant shows, not "Sept".
 */
export function dateText(
  date: Date,
  format: {
    readonly language: string;
    readonly locale: string;
    readonly timeZone: string | undefined;
  },
  style: 'full' | 'short' | 'tiny',
): string {
  const length = style === 'full' ? 'long' : 'short';
  const zone = format.timeZone ? { timeZone: format.timeZone } : {};
  const parts = dateFormat(format.locale, {
    ...(style === 'tiny' ? {} : { weekday: length }),
    day: 'numeric',
    month: length,
    ...zone,
  }).formatToParts(date);
  const month =
    format.locale === format.language
      ? undefined
      : dateFormat(format.language, { month: length, ...zone }).format(date);
  return parts.map((part) => (part.type === 'month' && month ? month : part.value)).join('');
}

/** Milliseconds to the next whole second or minute — what one aligned timer waits for. */
export const untilNext = (period: number, now: number = Date.now()): number =>
  period - (now % period);
