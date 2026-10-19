import { LitElement, css, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { glyph } from '../glyphs.js';
import { Pending, spring, type SpringHandle } from '../motion.js';
import { baseStyles } from '../styles/index.js';
import {
  clamp,
  keyValue,
  saneRange,
  snap,
  startStepRepeat,
  stepOf,
  stopStepRepeat,
  trackDrag,
} from './pointer.js';
import { haptic as buzz } from '../haptics.js';
import { textWidth } from '../text.js';

export interface DialChangeDetail {
  /** Single-target dials. */
  readonly value?: number;
  /** Range dials. */
  readonly low?: number;
  readonly high?: number;
}

/** How the lit arc relates to the target: heating fills up to it, cooling fills down from the top to it. */
export type DialArc = 'to-target' | 'from-target' | 'range' | 'none';

const START = 135;
const SWEEP = 270;
const STEPS = 54;

/**
 * The fluvy dial: a circular ruler. Ticks radiate outward from radius R across a 270° sweep, a soft
 * disc carries the value, and the one knob rides the ring (two knobs for a heat/cool range). With
 * `gauge` it is a read-only meter: no disc, no knob, an uppercase label over the figure.
 *
 * Events: `fluvy-input` while a knob moves, `fluvy-change` when a value is settled (release, key,
 * or the stepper — steps are coalesced so five quick taps make one service call).
 */
export class FluvyDial extends LitElement {
  static override styles = [
    ...baseStyles,
    css`
      :host {
        display: block;
      }
      .fv-knob {
        left: 0;
        top: 0;
        touch-action: none;
      }
      .fv-dial {
        touch-action: pan-y;
      }
      .fv-dial__value {
        white-space: nowrap;
      }
      .fv-dial__value.is-long {
        font-size: 28px;
        letter-spacing: -0.02em;
      }
    `,
  ];

  static override properties = {
    value: { type: Number },
    low: { type: Number },
    high: { type: Number },
    current: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    radius: { type: Number },
    tick: { type: Number },
    tone: { type: String },
    arc: { type: String },
    fill: { type: Number },
    unit: { type: String },
    sub: { type: String },
    label: { type: String },
    text: { type: String },
    minLabel: { type: String, attribute: 'min-label' },
    maxLabel: { type: String, attribute: 'max-label' },
    name: { type: String },
    decreaseLabel: { type: String, attribute: 'decrease-label' },
    increaseLabel: { type: String, attribute: 'increase-label' },
    gauge: { type: Boolean },
    large: { type: Boolean },
    stepper: { type: Boolean },
    disabled: { type: Boolean },
    format: { attribute: false },
    shown: { state: true },
    dragIndex: { state: true },
  };

  declare value: number | undefined;
  declare low: number | undefined;
  declare high: number | undefined;
  /** Measured value, drawn as a small dot outside the ring. */
  declare current: number | undefined;
  declare min: number;
  declare max: number;
  declare step: number;
  declare radius: number;
  declare tick: number;
  declare tone: string;
  declare arc: DialArc;
  /** Gauge mode: lit fraction of the sweep, 0..1. */
  declare fill: number | undefined;
  declare unit: string;
  declare sub: string;
  declare label: string;
  /** Overrides the figure in the disc (e.g. "Off", "—"). */
  declare text: string | undefined;
  declare minLabel: string;
  declare maxLabel: string;
  /** Accessible name of the control: what a screen reader calls the knob(s) ("Living room · Target"). */
  declare name: string;
  /** Accessible names of the stepper halves (a card passes its translated words). */
  declare decreaseLabel: string;
  declare increaseLabel: string;
  declare gauge: boolean;
  declare large: boolean;
  declare stepper: boolean;
  declare disabled: boolean;
  declare format: ((value: number) => string) | undefined;
  /** Drawn values [target] or [low, high]; follow the props on springs, follow the finger in a drag. */
  declare shown: readonly number[];
  declare dragIndex: number;

  private springs: SpringHandle[] = [];
  private gaugeSpring: SpringHandle | undefined;
  private gaugeShown = 0;
  private release: (() => void) | undefined;
  private grabOffset = 0;
  private lastTouched = 0;
  private stepTimer = 0;
  private readonly pending = [new Pending(() => this.sync()), new Pending(() => this.sync())];

  constructor() {
    super();
    this.min = 0;
    this.max = 1;
    this.step = 0.5;
    this.radius = 120;
    this.tick = 12;
    this.tone = 'accent';
    this.arc = 'to-target';
    this.unit = '';
    this.sub = '';
    this.label = '';
    this.minLabel = '';
    this.maxLabel = '';
    this.name = '';
    this.decreaseLabel = 'Decrease';
    this.increaseLabel = 'Increase';
    this.gauge = false;
    this.large = true;
    this.stepper = true;
    this.disabled = false;
    this.shown = [];
    this.dragIndex = -1;
  }

  /* The range the card asked for, made safe: NaN falls back, a reversed pair is swapped. */
  private get range(): readonly [number, number] {
    return saneRange(this.min, this.max, 0, 1);
  }
  private get rangeMin(): number {
    return this.range[0];
  }
  private get rangeMax(): number {
    return this.range[1];
  }
  /** The step, or a hundredth of the range when the card passed none (0, NaN, negative). */
  private get inc(): number {
    return stepOf(this.step, this.rangeMin, this.rangeMax);
  }

  /** A range dial needs both ends as real numbers; anything else is a single target (or none). */
  private get isRange(): boolean {
    return Number.isFinite(this.low) && Number.isFinite(this.high);
  }

  private targets(): number[] {
    if (this.isRange) return [this.low as number, this.high as number];
    return Number.isFinite(this.value) ? [this.value as number] : [];
  }

  private norm(value: number): number {
    const [min, max] = this.range;
    return max > min && Number.isFinite(value) ? clamp((value - min) / (max - min), 0, 1) : 0;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Home Assistant moves cards in the DOM (edit mode, reordering): the drag is re-armed on every connect.
    if (this.hasUpdated) {
      this.bind();
      this.sync();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.springs.forEach((s) => s.stop());
    this.springs = [];
    this.gaugeSpring?.stop();
    this.gaugeSpring = undefined;
    this.release?.();
    this.release = undefined;
    this.pending.forEach((p) => p.clear());
    clearTimeout(this.stepTimer);
    this.stepTimer = 0;
    stopStepRepeat();
    this.dragIndex = -1;
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('fill') && this.fill !== undefined) {
      if (!this.gaugeSpring) {
        this.gaugeShown = 0;
        this.gaugeSpring = spring(
          0,
          (v) => {
            this.gaugeShown = v;
            this.requestUpdate();
          },
          { stiffness: 120, damping: 1 },
        );
      }
      this.gaugeSpring.set(Number.isFinite(this.fill) ? clamp(this.fill, 0, 1) : 0);
    }
    if (
      changed.has('value') ||
      changed.has('low') ||
      changed.has('high') ||
      changed.has('min') ||
      changed.has('max')
    )
      this.sync();
  }

  /**
   * Points the springs at what should be drawn: the confirmed values, or the ones the user just chose
   * while Home Assistant has not confirmed them yet. Called on every prop change and when a pending
   * value expires, so the dial always ends on the real state.
   */
  private sync(): void {
    const targets = this.targets().map((t, i) => this.pending[i]!.resolve(t, this.inc / 2));
    if (this.dragIndex !== -1) return;
    if (this.springs.length !== targets.length) {
      this.springs.forEach((s) => s.stop());
      this.shown = targets;
      this.springs = targets.map((t, i) =>
        spring(
          t,
          (v) => {
            const next = [...this.shown];
            next[i] = v;
            this.shown = next;
          },
          { stiffness: 300, damping: 0.9, precision: 0.001 },
        ),
      );
    } else targets.forEach((t, i) => this.springs[i]!.set(t));
  }

  protected override firstUpdated(): void {
    this.bind();
  }

  private bind(): void {
    this.release?.();
    this.release = undefined;
    const root = this.renderRoot.querySelector<HTMLElement>('.fv-dial');
    if (!root) return;
    this.release = trackDrag(root, {
      start: (s) => {
        const knob = (s.event.target as HTMLElement).closest<HTMLElement>('[data-knob]');
        if (!knob || this.disabled || this.gauge) return false;
        const index = Number(knob.dataset['knob']);
        if (!(index === 0 || index === 1) || this.shown[index] === undefined) return false;
        // a stepper burst still waiting to be sent goes out now: one gesture, one settle
        if (this.stepTimer) {
          clearTimeout(this.stepTimer);
          this.stepTimer = 0;
          this.settle();
        }
        this.lastTouched = index;
        const pointer = this.fractionAt(root, s.x, s.y);
        this.grabOffset = this.norm(this.shown[index] ?? 0) - pointer; // grabbing never jumps
        this.springs[index]?.stop();
        this.dragIndex = index;
        return true;
      },
      move: (s) => {
        const index = this.dragIndex;
        if (index === -1) return;
        const f = clamp(this.fractionAt(root, s.x, s.y) + this.grabOffset, 0, 1);
        const [min, max] = this.range;
        this.place(index, snap(min + f * (max - min), min, max, this.step), 'selection');
      },
      end: (_s, moved) => {
        const index = this.dragIndex;
        if (index === -1) return;
        this.dragIndex = -1;
        // a tap only selects the knob (range dials): nothing changed, nothing is sent
        if (moved) this.settle();
        else this.springs[index]?.jump(this.shown[index] as number);
      },
    });
  }

  /** Pointer position → fraction of the sweep; the 90° gap at the bottom snaps to the nearer end. */
  private fractionAt(root: HTMLElement, x: number, y: number): number {
    const rect = root.getBoundingClientRect();
    const half = rect.width / 2;
    if (!(half > 0)) return 0;
    const deg = (Math.atan2(y - (rect.top + half), x - (rect.left + half)) * 180) / Math.PI;
    const turned = (deg - START + 360) % 360;
    if (turned <= SWEEP) return turned / SWEEP;
    return turned - SWEEP < (360 - SWEEP) / 2 ? 1 : 0;
  }

  /** Draws knob `index` at `value` (kept inside the range and, for a range dial, one step off the other knob). */
  private place(index: number, value: number, haptic: 'selection' | 'light'): boolean {
    const [min, max] = this.range;
    let next = clamp(value, min, max);
    if (this.isRange)
      next =
        index === 0
          ? Math.min(next, (this.shown[1] ?? max) - this.inc)
          : Math.max(next, (this.shown[0] ?? min) + this.inc);
    next = clamp(next, min, max);
    if (!Number.isFinite(next) || next === this.shown[index]) return false;
    const shown = [...this.shown];
    shown[index] = next;
    this.shown = shown;
    buzz(this, haptic);
    this.emit('fluvy-input');
    return true;
  }

  private emit(type: 'fluvy-input' | 'fluvy-change'): void {
    const detail: DialChangeDetail = this.isRange
      ? { low: this.shown[0] as number, high: this.shown[1] as number }
      : { value: this.shown[0] as number };
    this.dispatchEvent(
      new CustomEvent<DialChangeDetail>(type, { detail, bubbles: true, composed: true }),
    );
  }

  private settle(): void {
    this.stepTimer = 0;
    this.shown.forEach((v, i) => {
      this.pending[i]!.hold(v);
      this.springs[i]?.jump(v);
    });
    this.emit('fluvy-change');
  }

  /** Moves the knob `index` (the last one touched on a range dial) to `value` and coalesces the change. */
  private moveTo(index: number, value: number): void {
    if (this.disabled || this.gauge || this.shown[index] === undefined) return;
    const [min, max] = this.range;
    if (!this.place(index, snap(value, min, max, this.step), 'light')) return;
    this.springs[index]?.jump(this.shown[index] as number);
    this.pending[index]!.hold(this.shown[index] as number);
    clearTimeout(this.stepTimer);
    this.stepTimer = window.setTimeout(() => this.settle(), 650); // five quick taps, one service call
  }

  private nudge(direction: 1 | -1): void {
    if (this.shown.length === 0) return;
    const index = this.isRange ? this.lastTouched : 0;
    this.moveTo(index, (this.shown[index] ?? this.rangeMin) + direction * this.inc);
  }

  /** The knobs answer the whole slider vocabulary: arrows step, Shift × 5, Page = a tenth, Home / End = the ends. */
  private onKnobKey(event: KeyboardEvent, index: number): void {
    const [min, max] = this.range;
    const next = keyValue(event, this.shown[index] ?? min, min, max, this.inc);
    if (next === undefined) return;
    event.preventDefault();
    this.lastTouched = index;
    this.moveTo(index, next);
  }

  /** Tapping a knob of a range dial selects it for the stepper (the focus halo marks it). */
  private selectKnob(index: number): void {
    if (this.lastTouched !== index) {
      this.lastTouched = index;
      this.requestUpdate();
    }
  }

  /** The stepper halves share the template stepper's repeat (`startStepRepeat`); keyboard activation arrives as a click with `detail` 0. */
  private readonly stepFn = (direction: 1 | -1): void => this.nudge(direction);
  private readonly stepKeyMinus = (event: MouseEvent): void => {
    if (event.detail === 0) this.nudge(-1);
  };
  private readonly stepKeyPlus = (event: MouseEvent): void => {
    if (event.detail === 0) this.nudge(1);
  };
  private readonly stepDownMinus = (event: PointerEvent): void => startStepRepeat(event, -1);
  private readonly stepDownPlus = (event: PointerEvent): void => startStepRepeat(event, 1);

  private figure(value: number | undefined): string {
    if (this.text !== undefined) return this.text;
    if (value === undefined || !Number.isFinite(value)) return '—';
    return this.format ? this.format(value) : String(value);
  }

  private stepperHalf(direction: 1 | -1): TemplateResult {
    const inert = this.disabled || this.shown.length === 0;
    return html`<button
      class="fv-stepper__half"
      data-target
      aria-label=${direction < 0 ? this.decreaseLabel : this.increaseLabel}
      ?disabled=${inert}
      .fvStep=${this.stepFn}
      @pointerdown=${direction < 0 ? this.stepDownMinus : this.stepDownPlus}
      @pointerup=${stopStepRepeat}
      @pointerleave=${stopStepRepeat}
      @pointercancel=${stopStepRepeat}
      @click=${direction < 0 ? this.stepKeyMinus : this.stepKeyPlus}
    >
      ${glyph(direction < 0 ? 'minus' : 'plus')}
    </button>`;
  }

  protected override render(): TemplateResult {
    const R = Number.isFinite(this.radius) && this.radius >= 24 ? this.radius : 120;
    const tick = Number.isFinite(this.tick) && this.tick > 0 ? this.tick : 12;
    const half = Math.ceil((R + tick + 12) / 4) * 4; // half-size on the 4 grid so the box centres on it
    const w = half * 2;
    const cx = half;
    const cy = half;
    const endY = cy + (R + tick) * Math.SQRT1_2;
    const labelTop = Math.ceil((endY + 8) / 4) * 4;
    const stepTop = labelTop + 16 + 12;
    const showStepper = this.stepper && !this.gauge;
    const h = showStepper ? stepTop + 44 : labelTop + 16;
    const ang = (f: number): number => ((START + f * SWEEP) * Math.PI) / 180;

    const fractions = this.shown.map((v) => this.norm(v));
    let from = 0;
    let to = 0;
    if (this.gauge) {
      to = this.gaugeShown;
    } else if (this.isRange && fractions.length === 2) {
      from = fractions[0] as number;
      to = fractions[1] as number;
    } else if (fractions.length === 1) {
      if (this.arc === 'from-target') {
        from = fractions[0] as number;
        to = 1;
      } else if (this.arc === 'to-target') {
        to = fractions[0] as number;
      }
    }
    const lit = !this.disabled && this.arc !== 'none';

    const lines: TemplateResult[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;
      const a = ang(f);
      const len = i % 9 === 0 ? tick : tick * 0.6;
      const on = lit && f >= from - 1e-6 && f <= to + 1e-6 && to > from;
      lines.push(
        svg`<line x1=${(cx + R * Math.cos(a)).toFixed(2)} y1=${(cy + R * Math.sin(a)).toFixed(2)} x2=${(cx + (R + len) * Math.cos(a)).toFixed(2)} y2=${(cy + (R + len) * Math.sin(a)).toFixed(2)} class=${on ? 'tk-on' : 'tk-off'} />`,
      );
    }

    let marker: TemplateResult | typeof nothing = nothing;
    if (this.current !== undefined && Number.isFinite(this.current)) {
      const a = ang(this.norm(this.current));
      marker = svg`<circle cx=${(cx + (R + tick + 6) * Math.cos(a)).toFixed(2)} cy=${(cy + (R + tick + 6) * Math.sin(a)).toFixed(2)} r="3" class="dl-current" />`;
    }

    const knobSize = this.large ? 36 : 28;
    const knobs = this.gauge || this.disabled ? [] : fractions;
    const selected = this.isRange && this.dragIndex === -1 ? this.lastTouched : -1; // the range knob the stepper drives
    const [min, max] = this.range;
    const discR = Math.floor((R - 10) / 4) * 4;
    const focusValue =
      this.dragIndex !== -1 ? this.shown[this.dragIndex] : this.isRange ? undefined : this.shown[0];
    // a range reads "20 – 24": whole numbers lose their ".0" so both ends fit the disc on one line
    const lean = (v: number | undefined): string => this.figure(v).replace(/[.,]0$/, '');
    const both = `${lean(this.shown[0])} – ${lean(this.shown[1])}`;
    const figure =
      this.isRange && this.dragIndex === -1 && this.text === undefined
        ? both
        : this.figure(this.gauge ? this.value : focusValue);
    const long = figure.length > 7;
    // the figure at its size where the disc holds it with its unit, else the largest size that does (a range's two
    // ends in a small dial) — measured on what the dial says at rest, so a knob under the finger never resizes it
    const unit = this.unit && this.text === undefined ? this.unit : '';
    const room =
      discR * 2 -
      16 -
      (unit ? 4 + textWidth(unit, { size: this.large ? 18 : 14, weight: 600 }) : 0);
    const holds = (size: number): boolean =>
      textWidth(this.isRange && this.text === undefined ? both : figure, {
        size,
        weight: 600,
        tracking: -0.02,
        tabular: true,
      }) <= room;
    const own = long ? 28 : this.large ? 48 : 32;
    const size = holds(own) ? own : ([24, 20, 16].find(holds) ?? 16);

    return html`<div
      class="fv-dial fv-dial--${this.tone} ${this.large ? 'fv-dial--l' : 'fv-dial--s'}${this.disabled ? ' is-off' : ''}${this.gauge ? ' fv-dial--gauge' : ''}${this.dragIndex !== -1 ? ' is-dragging' : ''}"
      style="width:${w}px;height:${h}px"
    >
      <svg width=${w} height=${h} viewBox="0 0 ${w} ${h}" aria-hidden="true">${lines}${marker}</svg>
      <div
        class="fv-dial__disc${this.gauge ? ' fv-dial__disc--bare' : ''}"
        style="left:${cx - discR}px;top:${cy - discR}px;width:${discR * 2}px;height:${discR * 2}px"
      >
        ${this.label ? html`<p class="fv-dial__label-in">${this.label}</p>` : nothing}
        <p
          class="fv-dial__value${this.disabled ? ' is-off' : ''}${long ? ' is-long' : ''}"
          style=${size === own ? nothing : `font-size:${size}px`}
        >
          <span>${figure}</span>${unit ? html`<span class="fv-unit">${unit}</span>` : nothing}
        </p>
        ${this.sub ? html`<p class="fv-dial__sub">${this.sub}</p>` : nothing}
      </div>
      ${knobs.map((f, i) => {
        const a = ang(f);
        const x = cx + R * Math.cos(a) - knobSize / 2;
        const y = cy + R * Math.sin(a) - knobSize / 2;
        const moving = this.dragIndex === i;
        const px = (n: number): number => (moving ? n : Math.round(n * 2) / 2); // half pixels: crisp at 2×/3×, never 0.56 px off the ring
        const value = this.shown[i] as number;
        const knobName = this.isRange
          ? `${this.name ? `${this.name} · ` : ''}${i === 0 ? this.minLabel || 'min' : this.maxLabel || 'max'}`
          : this.name;
        return html`<span
          class="fv-knob fv-knob--${this.tone}${moving ? ' is-dragging' : ''}${selected === i ? ' is-focus' : ''}"
          data-knob=${i}
          data-measure="value"
          role="slider"
          tabindex="0"
          aria-label=${knobName || nothing}
          aria-valuemin=${min}
          aria-valuemax=${max}
          aria-valuenow=${value}
          aria-valuetext="${this.figure(value)}${this.unit ? ` ${this.unit}` : ''}"
          @keydown=${(e: KeyboardEvent) => this.onKnobKey(e, i)}
          @focus=${() => this.selectKnob(i)}
          style="translate:${px(x)}px ${px(y)}px;width:${knobSize}px;height:${knobSize}px"
        ></span>`;
      })}
      ${this.minLabel ? html`<span class="fv-dial__label fv-dial__label--min" style="top:${labelTop}px;left:${Math.round(cx - (R + tick) * Math.SQRT1_2 - 8)}px">${this.minLabel}</span>` : nothing}
      ${this.maxLabel ? html`<span class="fv-dial__label fv-dial__label--max" style="top:${labelTop}px;left:${Math.round(cx + (R + tick) * Math.SQRT1_2 - 32)}px">${this.maxLabel}</span>` : nothing}
      ${
        showStepper
          ? html`<div
              class="fv-stepper fv-dial__stepper"
              data-control
              style="left:${cx - 48}px;top:${stepTop}px"
            >
              ${this.stepperHalf(-1)}${this.stepperHalf(1)}
            </div>`
          : nothing
      }
    </div>`;
  }
}
