import {
  clock12,
  dateFormat,
  formatTime,
  houseZone,
  localize,
  relativeTime,
  strings,
  wallClock,
  type HomeAssistant,
} from '@fluvy/core';
import {
  sanitiseAlias,
  WEEKDAYS,
  type Days,
  type Moment,
  type Schedule,
  type Verb,
  type Weekday,
} from './schedule.js';

/**
 * A schedule in words, as the rows and the sheet say it: the days as people say them ("Every day", "Mon–Fri",
 * "Mon, Wed, Fri"), a moment on the clock in the house's own clock or by the sun with its offset ("Sunset −30 min"),
 * a window ("09:00–11:00", "Sunrise +15 min until 23:00"), the next run ("Next in 2 h", "Next Mon 09:00") and a
 * target's next change ("Turns on in 9 h"), the last one ("Ran 07:00", "3 days ago", "Never run") and the name a new
 * schedule suggests for itself. Pure: words in,
 * words out, the house's language and clock read from `hass`.
 */

const s = strings('automations');

type Hass = HomeAssistant;

const sentence = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** A Monday (1 January 2024): the week's days are formatted from it, at noon in UTC, so no zone moves the day. */
const MONDAY = Date.UTC(2024, 0, 1, 12);
const DAY_MS = 86_400_000;

/** A weekday's short word in the house's language ("Mon", "Mo", "lun"), without the full stop some languages add. */
export function weekdayShort(hass: Hass | undefined, day: Weekday): string {
  return dateFormat(hass?.language ?? 'en', { weekday: 'short', timeZone: 'UTC' })
    .format(MONDAY + WEEKDAYS.indexOf(day) * DAY_MS)
    .replace(/\.$/, '');
}

/**
 * A list of days as people say it: runs of three or more as a span with an en dash ("Mon–Fri", "Fri–Mon" across
 * the week's end), the rest one by one ("Mon, Wed, Fri"), each run starting from the first of its days.
 */
function dayList(hass: Hass | undefined, chosen: readonly Weekday[]): string {
  const has = (index: number): boolean =>
    chosen.includes(WEEKDAYS[((index % 7) + 7) % 7] as Weekday);
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (!has(i) || has(i - 1)) continue; // a day in the middle of a run is said by its run
    let length = 1;
    while (length < 7 && has(i + length)) length += 1;
    const first = weekdayShort(hass, WEEKDAYS[i] as Weekday);
    if (length >= 3) {
      parts.push(`${first}–${weekdayShort(hass, WEEKDAYS[(i + length - 1) % 7] as Weekday)}`);
    } else {
      parts.push(first);
      if (length === 2) parts.push(weekdayShort(hass, WEEKDAYS[(i + 1) % 7] as Weekday));
    }
  }
  return parts.join(', ');
}

/** The days a schedule runs, in words: "Every day", "Workdays", "Weekends", "Mon–Fri", "Mon, Wed, Fri". */
export function daysText(hass: Hass | undefined, days: Days): string {
  switch (days.kind) {
    case 'every':
      return s(hass, 'every_day');
    case 'workdays':
      return s(hass, 'workdays');
    case 'weekend':
      return s(hass, 'weekend');
    case 'custom':
      return dayList(hass, days.days);
  }
}

/** The days in fewer words where a row is narrow: a list of four days or more is "4 days"; the rest as `daysText`. */
export function daysShort(hass: Hass | undefined, days: Days): string {
  return days.kind === 'custom' && days.days.length >= 4
    ? s(hass, 'days_count', { count: days.days.length })
    : daysText(hass, days);
}

/** A time of the day ('HH:MM') as the house reads its clock: "09:00", or "09:00 AM" on a 12-hour clock. */
export function clockText(hass: Hass | undefined, at: string): string {
  const [hours = 0, minutes = 0] = at.split(':').map(Number);
  return dateFormat(hass?.language ?? 'en', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: clock12(hass) ? 'h12' : 'h23',
    timeZone: 'UTC',
  }).format(Date.UTC(1970, 0, 1, hours, minutes));
}

/** A sun offset in words, signed: "+15 min", "−30 min", "+1 h 15 min", "−2 h". */
export function offsetWords(hass: Hass | undefined, minutes: number): string {
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} ${localize(hass, 'time.unit_h')}`);
  if (rest || !hours) parts.push(`${rest} ${localize(hass, 'time.unit_min')}`);
  return `${minutes < 0 ? '−' : '+'}${parts.join(' ')}`;
}

/** A moment in words: the time on the house's clock, or the sun's event with its offset ("Sunset −30 min"). */
export function momentText(hass: Hass | undefined, moment: Moment): string {
  if (moment.kind === 'time') return clockText(hass, moment.at);
  const event = s(hass, moment.event);
  return moment.offset === 0 ? event : `${event} ${offsetWords(hass, moment.offset)}`;
}

/** A moment without its offset: the time, or the sun's word alone ("Sunrise"). */
export function momentBare(hass: Hass | undefined, moment: Moment): string {
  return moment.kind === 'time' ? clockText(hass, moment.at) : s(hass, moment.event);
}

/** A schedule's span: the start and the end with an en dash ("09:00–11:00", "Sunrise +15 min–Sunset −30 min"); a lone moment as itself. */
export function spanText(hass: Hass | undefined, start: Moment, end?: Moment): string {
  return end ? `${momentText(hass, start)}–${momentText(hass, end)}` : momentText(hass, start);
}

/** The span without the sun's offsets ("Sunrise–Sunset"); a clock span is itself. */
export function spanBare(hass: Hass | undefined, start: Moment, end?: Moment): string {
  return end ? `${momentBare(hass, start)}–${momentBare(hass, end)}` : momentBare(hass, start);
}

/** The weekday of an instant as the house's clock shows it. */
function weekdayOf(hass: Hass | undefined, at: Date): Weekday {
  const wall = wallClock(at, houseZone(hass));
  const day = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  return WEEKDAYS[(day + 6) % 7] as Weekday;
}

/** When a schedule next runs: "Next in 2 h" within the day, "Next Mon 09:00" beyond it. */
export function nextText(hass: Hass | undefined, next: Date, now: Date): string {
  const ms = next.getTime() - now.getTime();
  const clock = formatTime(hass, next);
  if (ms < 60_000) return s(hass, 'next', { when: clock });
  if (ms < DAY_MS) return s(hass, 'next', { when: relativeTime(hass, next, now) });
  return s(hass, 'next', { when: `${weekdayShort(hass, weekdayOf(hass, next))} ${clock}` });
}

/** When a moment comes, as a sentence goes on: "in 2 h" within the day, "Mon 09:00" beyond it, its time when it is now. */
export function whenShort(hass: Hass | undefined, at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime();
  const clock = formatTime(hass, at);
  if (ms < 60_000) return clock;
  if (ms < DAY_MS) return relativeTime(hass, at, now);
  return `${weekdayShort(hass, weekdayOf(hass, at))} ${clock}`;
}

/** The next run in fewer words, after the window a row already says: "In 2 h", "Mon 09:00". */
export const nextShort = (hass: Hass | undefined, next: Date, now: Date): string =>
  sentence(whenShort(hass, next, now));

/** What a target does next and when: "Turns on in 9 h", "Closes Mon 07:15", "Runs in 35 min". */
export const changeText = (hass: Hass | undefined, verb: Verb, at: Date, now: Date): string =>
  s(hass, `next_${verb}`, { when: whenShort(hass, at, now) });

/**
 * A schedule's line in every length it may take, the fullest first, each whole — a segment gives way, never cut:
 * the next run in full ("Next in 10 h"), then in fewer words ("In 10 h"), then gone; the sun's offsets gone
 * ("Sunrise–Sunset"); the end gone; a long list of days as its count ("4 days"). The days' word and the start never
 * go: the last line is the least the schedule says.
 */
export function scheduleLines(
  hass: Hass | undefined,
  schedule: Schedule,
  next: Date | undefined,
  now: Date,
): string[] {
  const days = daysText(hass, schedule.days);
  const full = spanText(hass, schedule.start, schedule.end);
  const bare = spanBare(hass, schedule.start, schedule.end);
  const start = momentBare(hass, schedule.start);
  const join = (...parts: string[]): string => parts.filter(Boolean).join(' · ');
  const lines = [
    ...(next
      ? [join(days, full, nextText(hass, next, now)), join(days, full, nextShort(hass, next, now))]
      : []),
    join(days, full),
    join(days, bare),
    join(days, start),
    join(daysShort(hass, schedule.days), start),
  ];
  return lines.filter((line, index) => lines.indexOf(line) === index);
}

/** When an automation last ran: "Ran 07:00" today, "3 days ago" before that, "Never run" when it never has. */
export function lastText(hass: Hass | undefined, last: Date | undefined, now: Date): string {
  if (!last || !Number.isFinite(last.getTime())) return localize(hass, 'scenes.never');
  if (now.getTime() - last.getTime() < DAY_MS)
    return sentence(localize(hass, 'actions.ran', { time: formatTime(hass, last) }));
  return sentence(relativeTime(hass, last, now));
}

/**
 * The name a schedule suggests for itself from what it does: the first target's name ("Kitchen lamp +1" with
 * more), its days and its span — "Kitchen lamp · Mon–Fri 09:00–11:00" — fit to write.
 */
export function suggestAlias(
  hass: Hass | undefined,
  names: readonly string[],
  days: Days,
  start: Moment,
  end?: Moment,
): string {
  const [first = '', ...rest] = names;
  const who = rest.length ? s(hass, 'and_more', { name: first, count: rest.length }) : first;
  const when = `${daysText(hass, days)} ${spanText(hass, start, end)}`;
  // nothing chosen yet: the days and the time alone, never a separator with nothing before it
  return sanitiseAlias(who ? `${who} · ${when}` : when);
}
