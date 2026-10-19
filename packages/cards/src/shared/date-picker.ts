import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { clock12, dateFormat, dayPeriods, type HomeAssistant, type KeyOf } from '@fluvy/core';
import { baseStyles, glyph } from '@fluvy/ui';
import '@fluvy/ui/time-field';
import type { TimeFieldDetail } from '@fluvy/ui/time-field';
import {
  addDays,
  addMonths,
  daysInMonth,
  firstWeekday,
  sameDay,
  sameMonth,
  startOfDay,
} from './dates.js';
import { monthGrid } from './days.js';
import { dayRange, sameRange, shiftRange, type ActivityRange } from './range.js';

/**
 * What the picker says: the pages' shared words only, so every page that opens it (the Activity page, the History
 * page — each passes its own `t`, its words and then the page's) has every one of them.
 */
export type PickerString = KeyOf<'page'>;

/** A period picked: where to go, and which way that is from where the page is. */
export interface DatesDetail {
  readonly range: ActivityRange;
}

/** The end of a day, in minutes: the time fields read it "24:00". */
const DAY_END = 24 * 60;

/** A moment's time of day, in minutes. */
const minutesOf = (ms: number): number => {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
};
/** A time of day on a day, in ms (24:00 is the next day's start, whatever the clocks do). */
const at = (day: Date, minutes: number): number => {
  if (minutes >= DAY_END) return addDays(day, 1).getTime();
  const date = new Date(day);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getTime();
};

/**
 * The period picker of the Activity and History pages: Today · Yesterday over Last 7 days, the month (the language's
 * calendar, `monthGrid` choosing a period: the chosen days one band, today marked; days to come are not offered; the
 * arrows walk it, turning the month), the hours of the first and the last day in our time fields (the house's clock;
 * the last day whole reads 24:00), and Show — kept back, with the reason under it, while the end is not after the
 * start. A first tap picks one day; a second tap on another day makes the band. (Week presets are left to the grid: a
 * week is two taps, and the presets stay one short row.)
 */
export class FluvyDates extends LitElement {
  static override styles = [
    ...baseStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .ad-presets {
        display: flex;
        flex-direction: column;
      }
      .ad-row {
        display: grid;
        grid-template-columns: repeat(
          var(--n),
          round(down, calc((100% - (var(--n) - 1) * 8px) / var(--n) + 0.01px), 1px)
        );
        column-gap: 8px;
      }
      .ad-row .fv-chip {
        width: auto;
        min-width: 0;
      }
      .ad-row .fv-chip__pill {
        background: var(--fluvy-page);
      }
      .ad-month {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ad-month__name {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        font-size: 15px;
        line-height: 20px;
        font-weight: 600;
        text-align: center;
      }
      .ad-times {
        display: grid;
        grid-template-columns: repeat(2, round(down, calc((100% - 8px) / 2 + 0.01px), 1px));
        column-gap: 8px;
      }
      /* a field's label over its box: the fields' 13/500 */
      .ad-time {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        font-size: 13px;
        line-height: 20px;
        font-weight: 500;
        color: var(--fluvy-text-secondary);
      }
      .ad-apply {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ad-why {
        margin: 0;
        font-size: 13px;
        line-height: 20px;
        font-weight: 500;
        color: var(--fluvy-danger);
        text-align: center;
      }
      .fv-btn {
        width: 100%;
      }
    `,
  ];

  static override properties = {
    hass: { attribute: false },
    range: { attribute: false },
    now: { type: Number },
    language: { type: String },
    t: { attribute: false },
    month: { state: true },
    from: { state: true },
    to: { state: true },
    fromTime: { state: true },
    toTime: { state: true },
    focusDay: { state: true },
    turn: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare range: ActivityRange;
  declare now: number;
  declare language: string;
  declare t: (key: PickerString, values?: Record<string, string | number>) => string;
  /** The month on show (its first day). */
  declare month: Date;
  declare from: Date;
  declare to: Date;
  /** The first day's and the last day's time, in minutes (the last day whole: 24:00). */
  declare fromTime: number;
  declare toTime: number;
  declare turn: 0 | 1 | -1;
  /** The day the arrows walk from (the grid's one tab stop). */
  declare focusDay: Date;

  /** Opened on the period on screen: the first tap starts a new pick (one whole day) instead of extending it. */
  private opened = true;
  /** The reader changed the hours: a new pick keeps them. */
  private timesTouched = false;

  constructor() {
    super();
    this.range = dayRange(new Date());
    this.now = Date.now();
    this.language = 'en';
    this.t = (key) => key;
    this.month = new Date();
    this.from = new Date();
    this.to = new Date();
    this.fromTime = 0;
    this.toTime = DAY_END;
    this.turn = 0;
    this.focusDay = new Date();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('range')) return;
    // opened on the period on screen: its days, its hours, its month
    const { start, end } = this.range;
    this.from = startOfDay(new Date(start));
    this.to = startOfDay(new Date(end - 1));
    this.fromTime = minutesOf(start);
    const whole = new Date(end).getHours() === 0 && new Date(end).getMinutes() === 0;
    this.toTime = whole ? this.dayEnd : minutesOf(end);
    this.month = new Date(this.to.getFullYear(), this.to.getMonth(), 1);
    this.focusDay = this.to;
    this.opened = true;
    this.timesTouched = false;
  }

  private emit(range: ActivityRange): void {
    this.dispatchEvent(
      new CustomEvent<DatesDetail>('fluvy-dates', {
        detail: { range },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private preset(which: 'today' | 'yesterday' | 'week'): void {
    const today = dayRange(new Date(this.now));
    if (which === 'today') this.emit(today);
    else if (which === 'yesterday') this.emit(shiftRange(today, -1));
    else {
      // a week back from today, day by day (a clock change keeps midnight)
      const start = new Date(today.start);
      start.setDate(start.getDate() - 6);
      this.emit({ start: start.getTime(), end: today.end });
    }
  }

  private pick(day: Date): void {
    // the first tap after opening starts afresh: that one day, whole (unless the reader set the hours)
    if (this.opened) {
      this.opened = false;
      this.from = day;
      this.to = day;
      if (!this.timesTouched) {
        this.fromTime = 0;
        this.toTime = this.dayEnd;
      }
      return;
    }
    // a first tap is one day; a second, on another day, makes the band (in either order)
    if (!sameDay(this.from, this.to) || sameDay(day, this.from)) {
      this.from = day;
      this.to = day;
    } else if (day < this.from) this.from = day;
    else this.to = day;
  }

  private stepMonth(direction: 1 | -1): void {
    this.turn = direction;
    this.month = addMonths(this.month, direction);
  }

  /**
   * How a whole last day reads in the house's clock: 24:00 on a 24-hour one; 11:59 PM on a 12-hour one (its "12:00
   * AM" would read as the day's start). Its last minute stands for the whole of it.
   */
  private get dayEnd(): number {
    return clock12(this.hass) ? DAY_END - 1 : DAY_END;
  }

  /** The period the fields describe (its end no later than today's). */
  private chosen(): ActivityRange {
    const start = at(this.from, this.fromTime);
    const last = at(this.to, this.toTime >= DAY_END - 1 ? DAY_END : this.toTime);
    return { start, end: Math.min(last, dayRange(new Date(this.now)).end) };
  }

  private apply(): void {
    const range = this.chosen();
    if (range.end > range.start) this.emit(range);
  }

  /** The keys moved the grid's tab stop: never past today; the month turns when the stop leaves it. */
  private moveFocus(day: Date): void {
    const today = startOfDay(new Date(this.now));
    const target = day > today ? today : day;
    if (!sameMonth(target, this.month)) {
      this.turn = target > this.month ? 1 : -1;
      this.month = new Date(target.getFullYear(), target.getMonth(), 1);
    }
    this.focusDay = target;
  }

  private format(options: Intl.DateTimeFormatOptions, date: Date): string {
    return dateFormat(this.language, options).format(date);
  }

  private renderPresets(): TemplateResult {
    const today = dayRange(new Date(this.now));
    const week = new Date(today.start);
    week.setDate(week.getDate() - 6);
    const chip = (
      which: 'today' | 'yesterday' | 'week',
      key: PickerString,
      active: boolean,
    ): TemplateResult =>
      html`<button
        class="fv-chip ${active ? 'is-active' : ''}"
        aria-pressed=${String(active)}
        @click=${() => this.preset(which)}
      >
        <span class="fv-chip__pill">${this.t(key)}</span>
      </button>`;
    return html`<div class="ad-presets">
      <div class="ad-row fv-chips--fill" style="--n:2" data-fill-row>
        ${chip('today', 'preset.today', sameRange(this.range, today))}
        ${chip('yesterday', 'preset.yesterday', sameRange(this.range, shiftRange(today, -1)))}
      </div>
      <div class="ad-row fv-chips--fill" style="--n:1" data-fill-row>
        ${chip(
          'week',
          'preset.week',
          this.range.start === week.getTime() && this.range.end === today.end,
        )}
      </div>
    </div>`;
  }

  private renderMonth(): TemplateResult {
    const first = firstWeekday(this.hass, undefined);
    const today = startOfDay(new Date(this.now));
    const lastMonth = sameMonth(this.month, today);
    const low = this.from < this.to ? this.from : this.to;
    const high = this.from < this.to ? this.to : this.from;
    const monthName = this.format({ month: 'long', year: 'numeric' }, this.month);
    return html`<div class="ad-month">
        <button
          class="fv-round fv-round--quiet"
          aria-label=${this.t('month_prev')}
          @click=${() => this.stepMonth(-1)}
        >
          ${glyph('chevronLeft')}
        </button>
        <p class="ad-month__name">${monthName}</p>
        <button
          class="fv-round fv-round--quiet"
          aria-label=${this.t('month_next')}
          ?disabled=${lastMonth}
          @click=${() => this.stepMonth(1)}
        >
          ${glyph('chevron')}
        </button>
      </div>
      <div>
        ${monthGrid({
          month: this.month,
          first,
          focus: this.focusDay,
          label: monthName,
          weekday: (date) => this.format({ weekday: 'narrow' }, date),
          turn: this.turn,
          mode: 'range',
          day: (date) => {
            const inside = date >= low && date <= high;
            const column = (date.getDay() - first + 7) % 7;
            return {
              selected: sameDay(date, low) || sameDay(date, high),
              // the band's ends: its first and last day, and where a week row starts or ends inside it
              ...(inside
                ? {
                    band: {
                      first: sameDay(date, low) || column === 0 || date.getDate() === 1,
                      last:
                        sameDay(date, high) || column === 6 || date.getDate() === daysInMonth(date),
                    },
                  }
                : {}),
              today: sameDay(date, today),
              disabled: date > today,
              label: this.format({ weekday: 'long', day: 'numeric', month: 'long' }, date),
            };
          },
          onPick: (date) => {
            this.focusDay = date;
            this.pick(date);
          },
          onMove: (date) => this.moveFocus(date),
          host: this,
        })}
      </div>`;
  }

  protected override render(): TemplateResult {
    const range = this.chosen();
    const valid = range.end > range.start;
    const field = (
      which: 'from' | 'to',
      value: number,
      set: (value: number) => void,
    ): TemplateResult =>
      html`<div class="ad-time">
        <span id="ad-${which}" aria-hidden="true">${this.t(which)}</span>
        <fluvy-time-field
          ?reduced-motion=${this.hasAttribute('reduced-motion')}
          .value=${value}
          .hour12=${clock12(this.hass)}
          .periods=${dayPeriods(this.hass)}
          .endOfDay=${which === 'to' && !clock12(this.hass)}
          .label=${this.t(which)}
          .hoursLabel=${this.t('hours')}
          .minutesLabel=${this.t('minutes')}
          .invalid=${which === 'to' && !valid}
          @fluvy-time=${(event: CustomEvent<TimeFieldDetail>) => set(event.detail.value)}
        ></fluvy-time-field>
      </div>`;
    return html`${this.renderPresets()} ${this.renderMonth()}
      <div class="ad-times">
        ${field('from', this.fromTime, (value) => {
          this.timesTouched = true;
          this.fromTime = value;
        })}
        ${field('to', this.toTime, (value) => {
          this.timesTouched = true;
          this.toTime = value;
        })}
      </div>
      <div class="ad-apply">
        <button
          class="fv-btn fv-btn--accent"
          ?disabled=${!valid}
          aria-describedby=${valid ? nothing : 'ad-why'}
          @click=${() => this.apply()}
        >
          ${this.t('apply')}
        </button>
        ${valid ? nothing : html`<p class="ad-why" id="ad-why">${this.t('end_before_start')}</p>`}
      </div>`;
  }
}

if (!customElements.get('fluvy-date-picker'))
  customElements.define('fluvy-date-picker', FluvyDates);
