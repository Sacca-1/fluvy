import {
  clock12,
  dayPeriods,
  formatTime,
  houseZone,
  localize,
  strings,
  wallClock,
  type HomeAssistant,
} from '@fluvy/core';
import type { ChipItem } from '@fluvy/ui';
import '@fluvy/ui/time-field';
import type { TimeFieldDetail } from '@fluvy/ui/time-field';
import { html, type TemplateResult } from 'lit';
import { chipRow, type ChipFit } from '../../shared/chips.js';
import { momentText, weekdayShort } from '../format.js';
import { WEEKDAYS, type Moment, type RunEnv, type SunEvent, type Weekday } from '../schedule.js';

/**
 * A moment as the sheet edits it: three chips (At a time · Sunrise · Sunset), then the time field or the sun
 * offset's line; an end's quick spans (15 min · 30 min · 1 h · 2 h after the start). Pure templates and words; the
 * sheet keeps the moment.
 */

const s = strings('automations');

export type MomentMode = 'time' | SunEvent;

/** The furthest a sun offset goes either way, in minutes. */
export const OFFSET_LIMIT = 180;

export const modeOf = (moment: Moment): MomentMode =>
  moment.kind === 'time' ? 'time' : moment.event;

/** The minutes since midnight of 'HH:MM'. */
export const minutesOf = (at: string): number => {
  const [hours = 0, minutes = 0] = at.split(':').map(Number);
  return hours * 60 + minutes;
};

/** Minutes since midnight as 'HH:MM' (the day's end, 1440, is 23:59: a clock moment lies within its day). */
export const clockOf = (minutes: number): string => {
  const whole = Math.min(24 * 60 - 1, Math.max(0, Math.round(minutes)));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * The moment of that mode: the clock keeps its time, the sun keeps its offset, a mode just chosen starts plain — the
 * clock at `at`, the time it last had.
 */
export function momentOf(mode: MomentMode, previous: Moment, at = '08:00'): Moment {
  if (mode === 'time') return previous.kind === 'time' ? previous : { kind: 'time', at };
  return { kind: 'sun', event: mode, offset: previous.kind === 'sun' ? previous.offset : 0 };
}

/** A moment `minutes` later: a time on the clock round the day (23:30 and an hour is 00:30), a sun event's offset within its limit. */
export function later(moment: Moment, minutes: number): Moment {
  if (moment.kind === 'time')
    return { kind: 'time', at: clockOf((minutesOf(moment.at) + minutes) % (24 * 60)) };
  const offset = Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, moment.offset + minutes));
  return { ...moment, offset };
}

const sameMoment = (a: Moment, b: Moment): boolean =>
  a.kind === 'time'
    ? b.kind === 'time' && a.at === b.at
    : b.kind === 'sun' && a.event === b.event && a.offset === b.offset;

/** The chips that choose a moment's kind, filling their row (three, or two and one where three would cut a word). */
export function modeChips(
  hass: HomeAssistant | undefined,
  moment: Moment,
  onMode: (mode: MomentMode) => void,
  fit: ChipFit,
): TemplateResult {
  const mode = modeOf(moment);
  const items: ChipItem[] = [
    { key: 'time', label: s(hass, 'at_time'), active: mode === 'time' },
    { key: 'sunrise', label: s(hass, 'sunrise'), active: mode === 'sunrise' },
    { key: 'sunset', label: s(hass, 'sunset'), active: mode === 'sunset' },
  ];
  return chipRow(items, (key) => onMode(key as MomentMode), 'full', fit);
}

/** How long a window may run, one tap each: the quick ends. */
export const SPANS: readonly number[] = [15, 30, 60, 120];

/**
 * The quick ends: an end 15 min, 30 min, 1 h or 2 h after the start, filling their row (two and two where four would
 * not hold); the one the end is now is pressed, and one a sun start's offset could not reach (past ±3 h) is disabled.
 */
export function quickEnds(
  hass: HomeAssistant | undefined,
  start: Moment,
  end: Moment,
  onSpan: (minutes: number) => void,
  fit: ChipFit,
): TemplateResult {
  const items: ChipItem[] = SPANS.map((minutes) => ({
    key: String(minutes),
    label:
      minutes < 60
        ? `${minutes} ${localize(hass, 'time.unit_min')}`
        : `${minutes / 60} ${localize(hass, 'time.unit_h')}`,
    active: sameMoment(end, later(start, minutes)),
    disabled: start.kind === 'sun' && start.offset + minutes > OFFSET_LIMIT,
  }));
  return html`<div class="ss-spans">
    ${chipRow(items, (key) => onSpan(Number(key)), 'full', fit)}
  </div>`;
}

/** The time field for a clock moment: the house's clock, ↑ ↓ by the step. */
export function timeField(
  hass: HomeAssistant | undefined,
  at: string,
  step: number,
  label: string,
  onChange: (at: string) => void,
): TemplateResult {
  return html`<fluvy-time-field
    class="ss-time"
    .value=${minutesOf(at)}
    .step=${step}
    .hour12=${clock12(hass)}
    .periods=${dayPeriods(hass)}
    .label=${label}
    .hoursLabel=${localize(hass, 'page.hours')}
    .minutesLabel=${localize(hass, 'page.minutes')}
    @fluvy-time=${(event: CustomEvent<TimeFieldDetail>) => onChange(clockOf(event.detail.value))}
  ></fluvy-time-field>`;
}

/** The instant a sun moment next comes round, from `sun.sun`'s next events; nothing without the sky. */
export function sunInstant(moment: Moment, sun: RunEnv['sun']): Date | undefined {
  if (moment.kind !== 'sun' || !sun) return undefined;
  const base = moment.event === 'sunrise' ? sun.rising : sun.setting;
  return new Date(base.getTime() + moment.offset * 60_000);
}

/** When a sun moment next comes round, in words: "Today 19:11", else the day and its time ("Fri 07:52"). */
export function sunWhen(hass: HomeAssistant | undefined, at: Date, now: Date): string {
  const zone = houseZone(hass);
  const today = wallClock(now, zone);
  const then = wallClock(at, zone);
  const time = formatTime(hass, at);
  if (today.year === then.year && today.month === then.month && today.day === then.day)
    return s(hass, 'today_at', { time });
  const day = new Date(Date.UTC(then.year, then.month - 1, then.day)).getUTCDay();
  return `${weekdayShort(hass, WEEKDAYS[(day + 6) % 7] as Weekday)} ${time}`;
}

/** The sun offset's line: "Sunset −30 min · Today 19:11" (the moment alone without the sky). */
export function sunOffsetLine(
  hass: HomeAssistant | undefined,
  moment: Moment,
  sun: RunEnv['sun'],
  now: Date,
): string {
  const at = sunInstant(moment, sun);
  const words = momentText(hass, moment);
  return at ? `${words} · ${sunWhen(hass, at, now)}` : words;
}
