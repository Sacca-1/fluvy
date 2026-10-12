import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { baseStyles } from '../styles/index.js';

/** A time picked in the field, in minutes since midnight (1440: the end of the day). */
export interface TimeFieldDetail {
  readonly value: number;
}

const END = 24 * 60;
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The time field: the language's text field (`.fv-field`: 44, radius 12, page fill, hairline; a 2 px accent ring in use)
 * holding the house's clock as segments — hours and minutes, and the day's half on a 12-hour clock. Each segment
 * takes digits (a phone's number pad), steps with ↑ ↓ and moves on by itself once it is whole; ← → go between them.
 * With `end-of-day`, the day's end reads "24:00" (a period's last day, whole). No native indicator, no system picker.
 * `step` is what ↑ ↓ move the minutes by (a schedule's five): to the next multiple of it, while typing stays free.
 *
 * `value` is minutes since midnight. Event: `fluvy-time` (`TimeFieldDetail`) when a segment changes it.
 */
export class FluvyTimeField extends LitElement {
  static override styles = [
    ...baseStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      /* the language's field (.fv-field), its segments 28 wide on 8 px sides */
      .tf {
        gap: 0;
        padding: 0 8px;
        color: var(--fluvy-text);
        font: 500 15px/20px var(--fluvy-font-sans);
        font-variant-numeric: tabular-nums;
      }
      .tf__seg {
        width: 28px;
        height: 28px;
        box-sizing: border-box;
        padding: 0;
        border: 0;
        border-radius: 8px;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: center;
        caret-color: transparent;
        transition:
          background-color 120ms var(--fv-ease, ease),
          color 120ms var(--fv-ease, ease);
      }
      .tf__seg::selection {
        background: transparent;
      }
      .tf__seg:focus {
        background: var(--fluvy-accent-fill);
        color: var(--fluvy-accent-on-fill);
      }
      .tf__colon {
        width: 8px;
        text-align: center;
        color: var(--fluvy-text-secondary);
      }
      .tf__period {
        width: 44px;
        margin-left: 4px;
        font-weight: 600;
        cursor: pointer;
      }
    `,
  ];

  static override properties = {
    value: { type: Number },
    step: { type: Number },
    hour12: { type: Boolean },
    endOfDay: { type: Boolean, attribute: 'end-of-day' },
    label: { type: String },
    hoursLabel: { type: String, attribute: 'hours-label' },
    minutesLabel: { type: String, attribute: 'minutes-label' },
    periods: { attribute: false },
    invalid: { type: Boolean, reflect: true },
  };

  declare value: number;
  /** What ↑ ↓ move the minutes by: to the next multiple of it (1 by default). */
  declare step: number;
  /** A 12-hour clock: hours 1–12 and the day's half. */
  declare hour12: boolean;
  /** The day's end may be picked: 24:00. */
  declare endOfDay: boolean;
  /** The field's accessible name (its visible label is outside, over it). */
  declare label: string;
  declare hoursLabel: string;
  declare minutesLabel: string;
  /** The day's two halves as the house writes them ("AM", "PM"). */
  declare periods: readonly [string, string];
  declare invalid: boolean;

  /** What has been typed into a segment so far (a first digit waits for the second). */
  private typed = '';

  constructor() {
    super();
    this.value = 0;
    this.step = 1;
    this.hour12 = false;
    this.endOfDay = false;
    this.label = '';
    this.hoursLabel = 'Hours';
    this.minutesLabel = 'Minutes';
    this.periods = ['AM', 'PM'];
    this.invalid = false;
  }

  private get hours(): number {
    return Math.floor(this.value / 60);
  }

  private get minutes(): number {
    return this.value % 60;
  }

  private set(value: number): void {
    const next = Math.max(0, Math.min(this.endOfDay ? END : END - 1, value));
    if (next === this.value) return;
    this.value = next;
    this.dispatchEvent(
      new CustomEvent<TimeFieldDetail>('fluvy-time', {
        detail: { value: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Hours: 0–23 (24 at the end of the day, its minutes then 00); on a 12-hour clock, 1–12 within the day's half. */
  private setHours(hours: number): void {
    const top = this.endOfDay ? 24 : 23;
    const wrapped = ((hours % (top + 1)) + top + 1) % (top + 1);
    this.set(wrapped * 60 + (wrapped === 24 ? 0 : this.minutes));
  }

  private setMinutes(minutes: number): void {
    if (this.hours === 24) return;
    this.set(this.hours * 60 + (((minutes % 60) + 60) % 60));
  }

  private segments(): HTMLInputElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLInputElement>('.tf__seg')];
  }

  private moveFocus(from: EventTarget | null, by: 1 | -1): void {
    const list = this.segments();
    const index = list.indexOf(from as HTMLInputElement);
    list[index + by]?.focus();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const input = event.target as HTMLInputElement;
    const which = input.dataset['seg'];
    const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (step) {
      event.preventDefault();
      this.typed = '';
      if (which === 'h') this.setHours(this.hours + step);
      else if (which === 'm') this.setMinutes(this.steppedMinutes(step));
      else this.flip();
      input.select();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.typed = '';
      this.moveFocus(input, event.key === 'ArrowRight' ? 1 : -1);
    } else if (which === 'p' && /^[ap]$/i.test(event.key)) {
      event.preventDefault();
      const pm = event.key.toLowerCase() === 'p';
      if (pm !== this.hours >= 12) this.flip();
    } else if (which === 'p' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.flip();
    }
  };

  /** Digits typed into a segment: a whole one moves on to the next segment. */
  private readonly onInput = (event: InputEvent): void => {
    const input = event.target as HTMLInputElement;
    const which = input.dataset['seg'];
    const digit = input.value.replace(/\D/g, '').slice(-1);
    input.value = which === 'h' ? this.hourText() : pad(this.minutes);
    if (!digit) return;
    this.typed = (this.typed + digit).slice(-2);
    const n = Number(this.typed);
    if (which === 'h') {
      const top = this.hour12 ? 12 : this.endOfDay ? 24 : 23;
      const hours = this.hour12 ? (n % 12) + (this.hours >= 12 ? 12 : 0) : n;
      if (n <= top) this.setHours(hours);
      // a first digit that cannot start two (a 3 on a 24-hour clock) is the whole hour: on to the minutes, which
      // select themselves as they take the focus (selecting this one now would take the focus back)
      if (this.typed.length === 2 || n * 10 > top) {
        this.typed = '';
        this.moveFocus(input, 1);
        return;
      }
    } else {
      if (n < 60) this.setMinutes(n);
      if ((this.typed.length === 2 || n > 5) && this.hour12) {
        this.typed = '';
        this.moveFocus(input, 1);
        return;
      }
      if (this.typed.length === 2) this.typed = '';
    }
    input.select();
  };

  /** The minutes a step away: the next multiple of `step` in that direction (the minute itself when `step` is 1). */
  private steppedMinutes(direction: 1 | -1): number {
    const step = Number.isInteger(this.step) && this.step > 0 && this.step < 60 ? this.step : 1;
    const minutes = this.minutes;
    return direction > 0
      ? Math.floor(minutes / step) * step + step
      : Math.ceil(minutes / step) * step - step;
  }

  private flip(): void {
    if (this.value === END) return;
    this.set((this.value + 12 * 60) % END);
  }

  private hourText(): string {
    if (!this.hour12) return pad(this.hours);
    const twelve = this.hours % 12 || 12;
    return pad(twelve);
  }

  protected override updated(changed: PropertyValues<this>): void {
    // a segment on screen shows the value even while it is being typed over
    if (changed.has('value') || changed.has('hour12'))
      for (const input of this.segments()) {
        const which = input.dataset['seg'];
        if (which === 'h') input.value = this.hourText();
        else if (which === 'm') input.value = pad(this.minutes);
      }
  }

  private segment(
    which: 'h' | 'm',
    label: string,
    now: number,
    min: number,
    max: number,
  ): TemplateResult {
    return html`<input
      class="tf__seg"
      data-seg=${which}
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      maxlength="3"
      role="spinbutton"
      aria-label=${label}
      aria-valuemin=${min}
      aria-valuemax=${max}
      aria-valuenow=${now}
      .value=${which === 'h' ? this.hourText() : pad(this.minutes)}
      @keydown=${this.onKey}
      @input=${this.onInput}
      @focus=${(event: FocusEvent) => {
        this.typed = '';
        (event.target as HTMLInputElement).select();
      }}
      @blur=${() => {
        this.typed = '';
      }}
    />`;
  }

  protected override render(): TemplateResult {
    const [am, pm] = this.periods;
    return html`<div
      class="fv-field tf ${this.invalid ? 'is-invalid' : ''}"
      role="group"
      aria-label=${this.label}
      @click=${(event: MouseEvent) => {
        if (event.target === event.currentTarget) this.segments()[0]?.focus();
      }}
    >
      ${this.segment('h', this.hoursLabel, this.hour12 ? this.hours % 12 || 12 : this.hours, this.hour12 ? 1 : 0, this.hour12 ? 12 : this.endOfDay ? 24 : 23)}<span
        class="tf__colon"
        aria-hidden="true"
        >:</span
      >${this.segment('m', this.minutesLabel, this.minutes, 0, 59)}
      ${
        this.hour12
          ? html`<button
              class="tf__seg tf__period"
              data-seg="p"
              type="button"
              aria-label=${this.hours >= 12 && this.value !== END ? pm : am}
              @keydown=${this.onKey}
              @click=${() => this.flip()}
            >
              ${this.hours >= 12 && this.value !== END ? pm : am}
            </button>`
          : nothing
      }
    </div>`;
  }
}

if (!customElements.get('fluvy-time-field'))
  customElements.define('fluvy-time-field', FluvyTimeField);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-time-field': FluvyTimeField;
  }
}
