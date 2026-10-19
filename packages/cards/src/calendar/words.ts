import {
  clock12,
  dateFormat,
  formatDate,
  localize,
  strings,
  type HomeAssistant,
  type MessageKey,
} from '@fluvy/core';
import { isoWeek } from '@fluvy/ui';
import { dateLocale, dateText } from '../clock/time.js';
import { addDays, sameDay } from '../shared/dates.js';

const s = strings('calendar');

/**
 * The card's wording: times, weekday and month names, date lines, counts. Everything is rendered in
 * the browser's time zone — the same zone the day arithmetic runs in — so a row's time and the day it
 * is listed under can never contradict each other. Dates are written the way the clock card writes
 * them (`dateLocale`): "Thursday 17 September" for a day-first household, "Thursday, September 17"
 * for a month-first one — two cards on one dashboard never disagree.
 */

const formatter = (language: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  dateFormat(language, options);

export const capitalize = (text: string): string =>
  text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;

/** "sept." → "sept": an abbreviation's dot reads as a full stop when the word stands alone. */
const bare = (text: string): string => text.replace(/\.$/, '');

export class Words {
  private readonly language: string;
  /** The locale that orders a date; the month keeps `language`'s own name (see `dateText`). */
  private readonly dates_: {
    readonly language: string;
    readonly locale: string;
    readonly timeZone: undefined;
  };

  constructor(private readonly hass: HomeAssistant | undefined) {
    this.language = hass?.locale?.language ?? hass?.language ?? 'en';
    this.dates_ = {
      language: this.language,
      locale: dateLocale(hass, this.hour12),
      timeZone: undefined,
    };
  }

  t(key: MessageKey, values?: Record<string, string | number>): string {
    return localize(this.hass, key, values);
  }

  /** Whether the user reads a 12-hour clock: the profile first, then the language's own habit. */
  get hour12(): boolean {
    return clock12(this.hass);
  }

  /** "09:30" · "9:30 AM" */
  time(date: Date): string {
    return formatter(
      this.language,
      this.hour12
        ? { hour: 'numeric', minute: '2-digit', hour12: true }
        : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    ).format(date);
  }

  /** The timeline's gutter: "08:00" · "8 AM". */
  hour(hour: number): string {
    const date = new Date(2000, 0, 1, hour % 24);
    return this.hour12
      ? formatter(this.language, { hour: 'numeric', hour12: true }).format(date)
      : this.time(date);
  }

  weekday(date: Date, style: 'long' | 'short' | 'narrow'): string {
    const name = formatter(this.language, { weekday: style }).format(date);
    return style === 'long' ? capitalize(name) : bare(name);
  }

  /** "September" */
  month(date: Date): string {
    return capitalize(formatDate(this.hass, date, 'month'));
  }

  /** "Sep" */
  monthShort(date: Date): string {
    return capitalize(bare(formatter(this.language, { month: 'short' }).format(date)));
  }

  /** The head's date line, longest first: "Thursday 17 September" · "Thu 17 Sep". */
  dates(date: Date): readonly string[] {
    return [
      capitalize(dateText(date, this.dates_, 'full')),
      capitalize(dateText(date, this.dates_, 'short')),
    ];
  }

  /** "14 – 20 September", then with the month abbreviated. The dash is always set with spaces, like the sheet's. */
  ranges(from: Date, to: Date): readonly string[] {
    return (['long', 'short'] as const).map((month) => {
      const format = formatter(this.dates_.locale, { day: 'numeric', month });
      // the month in the language's own spelling ("Sep", not en-GB's "Sept"), as `dateText` writes it
      const own = this.dates_.locale === this.language ? null : formatter(this.language, { month });
      const range =
        typeof format.formatRangeToParts === 'function'
          ? format
              .formatRangeToParts(from, to)
              .map((part) =>
                part.type === 'month' && own
                  ? own.format(part.source === 'endRange' ? to : from)
                  : part.value,
              )
              .join('')
          : `${format.format(from)} – ${format.format(to)}`;
      return range.replace(/\s*[–-]\s*/u, ' – ');
    });
  }

  /** "2026 · week 38", then "Week 38", then "Wk 38" ("KW 38", "Sem. 38"): a week's number is never cut. */
  weeks(date: Date, year: number): readonly string[] {
    const week = { week: isoWeek(date) };
    const long = this.t('calendar.week', week);
    return [`${year} · ${long}`, capitalize(long), this.t('calendar.week_short', week)];
  }

  /** "Today" · "Tomorrow" · "Saturday" */
  dayName(date: Date, today: Date): string {
    if (sameDay(date, today)) return this.t('common.today');
    if (sameDay(date, addDays(today, 1))) return this.t('common.tomorrow');
    return this.weekday(date, 'long');
  }

  /** "4 events" · "1 event" · "No events" */
  events(count: number): string {
    return count === 0
      ? this.t('common.no_events')
      : count === 1
        ? this.t('common.event')
        : this.t('common.events', { count });
  }

  /** "Thursday 17 · 4 events" — the label over a selected day's list. */
  dayLabel(date: Date, count: number | null): string {
    const day = s(this.hass, 'day_label', {
      weekday: this.weekday(date, 'long'),
      day: date.getDate(),
    });
    return count === null ? day : `${day} · ${this.events(count).toLocaleLowerCase(this.language)}`;
  }

  /** What a screen reader hears for a day cell: "Thursday 17 September · 4 events". */
  dayAria(date: Date, count: number | null): string {
    const day = capitalize(dateText(date, this.dates_, 'full'));
    return count === null ? day : `${day} · ${this.events(count)}`;
  }

  /** How long until `start`: "In 13 min", "In 2 h 30 min" today, then the day's name, then its date. */
  until(start: Date, now: Date, today: Date): string {
    const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
    if (sameDay(start, today)) {
      if (minutes < 60) return s(this.hass, 'in_minutes', { minutes: Math.max(1, minutes) });
      const rest = minutes % 60;
      return s(this.hass, rest ? 'in_hours_minutes' : 'in_hours', {
        hours: Math.floor(minutes / 60),
        minutes: rest,
      });
    }
    if (start.getTime() < addDays(today, 7).getTime()) return this.dayName(start, today);
    return capitalize(dateText(start, this.dates_, 'short'));
  }
}
