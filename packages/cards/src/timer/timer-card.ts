import {
  formatDuration,
  formatTime,
  isUsable,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { head, label, readout, round, sheetStyles, type Tone } from '@fluvy/ui';

import { html, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit';

import { Card, HEAD_BASE } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  nameIconFields,
  showIconField,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { HeadFit } from '../energy/head.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import { fitValueRow, valueRowClass } from '../shared/value-row.js';

const s = strings('timer');

/** A running timer's two rounds (44 each) and the 8 between them: the commands' widest. */
const COMMANDS = 96;

export interface TimerCardConfig extends FluvyCardConfig {
  /** The elapsed gauge under the readout (on by default, as the sheet draws it). */
  show_gauge?: boolean;
  /** The start, pause and cancel buttons beside the readout (on by default). */
  show_actions?: boolean;
}

/** Below this content width the state badge gives its place to the name and the state joins the sub line. */
const NARROW = 300;

/** "H:MM:SS" (how Home Assistant sends `duration` and `remaining`) → seconds. */
function parseDuration(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string' || !raw) return null;
  const parts = raw.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part)))
    return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * The kitchen timer: "Remaining" counts down in the 40 px readout, the commands sit beside it as rounds,
 * and the elapsed gauge is the ruler in its read-only marker form.
 *
 * The countdown is computed from `finishes_at`, never accumulated, and is driven by ONE timeout that is
 * re-armed on the boundary of the next second of the remaining time — so the digits change exactly when
 * they should, a throttled background tab cannot make them drift, and nothing runs while the timer is
 * idle, paused, at zero, or while the card is off the page.
 */
export class FluvyTimerCard extends Card<TimerCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: TimerCardConfig): number {
    return config.show_gauge === false ? 164 : 252;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.inputs,
  ];

  static override properties = { ...Card.properties, tick_: { state: true } };

  /** Bumped by the timeout: its only job is to draw the next second. */
  declare tick_: number;

  private tick = 0;
  /** Seconds left when Pause was tapped: shown until Home Assistant reports its own `remaining`. */
  private held: number | null = null;
  /** The head and the value row, measured in the card's own classes: in half a section the circle gives way to the name. */
  private readonly head = new HeadFit(this);

  constructor() {
    super();
    this.tick_ = 0;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<TimerCardConfig>()(['show_gauge', 'show_actions']);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ show_gauge: true, show_actions: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['timer']),
        nameIconFields(),
        showIconField(),
        ...colourFields(),
        fieldRow(boolField('show_gauge'), boolField('show_actions')),
        actionFields(),
      ],
      ...editorLabels(s, { show_gauge: 'elapsed' }, {}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): TimerCardConfig {
    return {
      type: 'custom:fluvy-timer-card',
      entity: entities.find((id) => id.startsWith('timer.')) ?? '',
    };
  }

  protected override prepare(config: TimerCardConfig): TimerCardConfig {
    if (!config.entity) throw new Error('fluvy-timer-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return this.config?.show_gauge === false ? 3 : 4;
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- the second hand ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    this.tick_ += 1; // back on the page, perhaps minutes later: draw the present and arm the timeout again
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disarm();
  }

  private disarm(): void {
    clearTimeout(this.tick);
    this.tick = 0;
  }

  /** Arms the one timeout for the moment the remaining time crosses its next whole second. */
  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.disarm();
    const view = this.entity();
    if (!this.isConnected || view.state !== 'active') return;
    const end = this.finishesAt(view);
    if (end === null) return;
    const left = end - Date.now();
    if (left <= 0) return; // at zero: Home Assistant's `idle` is the next thing to happen
    this.tick = window.setTimeout(
      () => {
        this.tick_ += 1;
      },
      (left % 1000) + 1,
    );
  }

  /* ---------- the numbers ---------- */

  /** When a running timer ends, in ms. An integration without `finishes_at` still says what was left when it (re)started. */
  private finishesAt(view: EntityView): number | null {
    const finishes = view.attr<unknown>('finishes_at');
    const end =
      typeof finishes === 'string' && finishes ? new Date(finishes).getTime() : Number.NaN;
    if (Number.isFinite(end)) return end;
    const left = parseDuration(view.attr('remaining')) ?? parseDuration(view.attr('duration'));
    const since = view.stateObj ? new Date(view.stateObj.last_changed).getTime() : Number.NaN;
    return left !== null && Number.isFinite(since) ? since + left * 1000 : null;
  }

  /** Whole seconds left, rounded up: a countdown shows 0:01 until it is over. `state` is the one on screen (a tap is ahead of the report). */
  private remaining(view: EntityView, state: string): number | null {
    const duration = parseDuration(view.attr('duration'));
    const reported = parseDuration(view.attr('remaining')) ?? duration;
    if (state === 'paused') return view.state === 'paused' ? reported : (this.held ?? reported); // Pause was just tapped: the digits stop where they were
    if (state !== 'active') return duration;
    if (view.state !== 'active') return view.state === 'paused' ? reported : duration; // Start was just tapped: the count begins with the report
    const end = this.finishesAt(view);
    return end === null ? reported : Math.max(0, Math.ceil((end - Date.now()) / 1000));
  }

  private command(
    view: EntityView,
    service: 'start' | 'pause' | 'cancel',
    expected: string,
    left: number | null,
  ): void {
    this.held = service === 'pause' ? left : null;
    this.expect(view.id, expected);
    this.call('timer', service, {}, view.id);
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    // out of reach (unavailable, missing) it keeps its anatomy and its size, its controls disabled: only the colours
    // change (1.9)
    const unusable = !isUsable(view);
    const state = this.stateOf(view);
    const active = !unusable && state === 'active';
    const paused = !unusable && state === 'paused';
    const tone: Tone = unusable
      ? 'off'
      : active || paused
        ? toneOf(this.config, 'accent')
        : 'neutral';

    const duration = parseDuration(view.attr('duration'));
    const left = unusable ? null : this.remaining(view, state);
    const end = view.state === 'active' && active ? this.finishesAt(view) : null;
    const status = unusable
      ? stateText(this.hass, view)
      : active
        ? s(this.hass, 'running')
        : paused
          ? s(this.hass, 'paused')
          : this.t('timer.idle');
    const context =
      end !== null
        ? s(this.hass, 'ends', { time: formatTime(this.hass, new Date(end)) })
        : !unusable && duration !== null && duration > 0
          ? s(this.hass, 'set_for', { duration: formatDuration(duration) })
          : view.areaName;
    const narrow = this.contentWidth < NARROW;
    const sub = !narrow
      ? context
      : unusable || !context
        ? status
        : `${status} · ${context.charAt(0).toLocaleLowerCase()}${context.slice(1)}`;

    // the marker moves a pixel at a time: a finer value would only wake the ruler's spring every second for nothing
    const timed = duration !== null && duration > 0;
    const elapsed =
      timed && left !== null ? Math.min(duration, Math.max(0, duration - left)) : null;
    const grain = timed ? Math.max(1, duration / this.contentWidth) : 1;
    // the gauge keeps its place while the timer cannot be read or has no length yet, at rest
    const gauge = this.config?.show_gauge !== false;

    // the time left beside its commands, laid out for the whole length (it only counts down) and the two rounds a
    // running timer shows, never for the one it shows now: else the rounds centred under it, and in a column too
    // narrow for them the readout alone, the card's tap
    const remaining = this.t('timer.remaining');
    const value = left === null ? '—' : formatDuration(left);
    const fit = fitValueRow(this.head.ruler, {
      width: this.contentWidth,
      control: this.config?.show_actions === false ? 0 : COMMANDS,
      labels: [remaining],
      figures: [{ value: formatDuration(duration ?? 0) }],
    });

    const fitted = this.head.fit({
      width: this.contentWidth,
      title: name,
      sub,
      badge: narrow ? null : { text: status, tone },
    });

    return html`<article class="fv-card ${unusable ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
        tone,
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
      })}
      <div class="in-timer ${valueRowClass(fit.layout)}">
        ${readout({ label: remaining, value, size: fit.size })}
        ${
          fit.layout === 'alone'
            ? this.readoutTap(view.id, `${name} · ${remaining} ${value}`)
            : html`<div class="in-timer__cmds">
                ${
                  active
                    ? round(
                        'pause',
                        'accent',
                        `${name} · ${s(this.hass, 'pause')}`,
                        () => this.command(view, 'pause', 'paused', left),
                        unusable,
                      )
                    : round(
                        'play',
                        'accent',
                        `${name} · ${s(this.hass, paused ? 'resume' : 'start')}`,
                        () => this.command(view, 'start', 'active', left),
                        unusable,
                      )
                }
                ${active || paused ? round('stop', 'quiet', `${name} · ${s(this.hass, 'cancel')}`, () => this.command(view, 'cancel', 'idle', left)) : nothing}
              </div>`
        }
      </div>
      ${
        gauge
          ? html`${label(s(this.hass, 'elapsed'))}
              <div class="in-gauge">
                <fluvy-ruler
                  .value=${Math.round((elapsed ?? 0) / grain) * grain}
                  .min=${0}
                  .max=${timed ? duration : 1}
                  .step=${1}
                  .length=${this.contentWidth}
                  .tone=${active || paused ? 'accent' : 'neutral'}
                  ?disabled=${unusable || !timed}
                  marker
                  .label=${`${name} · ${s(this.hass, 'elapsed')}`}
                  .format=${(value: number) => formatDuration(value)}
                ></fluvy-ruler>
              </div>`
          : nothing
      }
    </article>`;
  }
}
