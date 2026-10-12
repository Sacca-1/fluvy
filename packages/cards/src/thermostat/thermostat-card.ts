import {
  formatNumber,
  isUsable,
  readText,
  stateText,
  writeText,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';

import {
  clamp,
  decimalsOf,
  head,
  label,
  options,
  readout,
  rulerLabels,
  sheetStyles,
  stepper,
  textWidth,
  type DialArc,
  type DialChangeDetail,
  type GlyphName,
  type OptionItem,
  type RulerChangeDetail,
  type Tone,
} from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { Card } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorWord,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  whenOffField,
} from '../shared/form.js';

import { HeadFit } from '../energy/head.js';
import { optionCell, optionColumnsFor, optionsHold, valuesHeld } from '../shared/options.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import { configKeys, type WhenOff } from '../shared/config.js';
import { chipRow } from '../shared/chips.js';

export type ThermostatVariant = 'dial' | 'compact' | 'ruler';
export type RowStyle = 'chips' | 'full';

export interface ThermostatCardConfig extends FluvyCardConfig {
  show_presets?: boolean;
  show_fan?: boolean;
  /** `dial` (default): the ring. `compact`: the target as a readout with its stepper, no dial. `ruler`: the readout, the stepper and a horizontal ruler. */
  variant?: ThermostatVariant;
  /** The modes to show, in this order (`['off', 'heat', 'cool']`). Default: every mode the entity offers. */
  modes?: readonly string[];
  /** Modes as option tiles (default), as content-sized chips, or as chips filling the row. */
  modes_style?: 'tiles' | RowStyle;
  /** Presets and fan speeds as content-sized chips (default) or as chips filling the row. */
  preset_style?: RowStyle;
  fan_style?: RowStyle;
  /** While the device is off: everything (default), or `essentials` — the head, the value and the modes; presets and fan speeds wait for a mode. */
  when_off?: WhenOff;
}

interface Model {
  readonly kind: 'climate' | 'water_heater' | 'humidifier';
  readonly tone: Tone;
  readonly off: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly target: number | undefined;
  readonly low: number | undefined;
  readonly high: number | undefined;
  readonly current: number | undefined;
  readonly arc: DialArc;
  readonly badgeText: string;
  readonly modes: readonly OptionItem[];
  readonly presets: readonly string[];
  readonly preset: string | undefined;
  readonly fans: readonly string[];
  readonly fan: string | undefined;
}

const MODE_GLYPH: Record<string, GlyphName> = {
  heat: 'flame',
  cool: 'snow',
  heat_cool: 'auto',
  auto: 'auto',
  dry: 'humid',
  fan_only: 'fan',
  off: 'power',
  eco: 'leaf',
  boost: 'bolt',
  performance: 'bolt',
  electric: 'bolt',
  gas: 'flame',
  heat_pump: 'heater',
  high_demand: 'bolt',
  sleep: 'moon',
  normal: 'auto',
  away: 'away',
  comfort: 'home',
  baby: 'person',
  home: 'home',
};
const MODE_TONE: Record<string, Tone> = {
  heat: 'heat',
  cool: 'cool',
  heat_cool: 'accent',
  auto: 'accent',
  dry: 'dry',
  fan_only: 'fan',
  off: 'neutral',
};
const MODE_ORDER = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];

const pretty = (raw: string): string => {
  const t = raw.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Thermostat, water heater and humidifier on one card: the dial with its knob on the ring (two for a
 * heat/cool range), the measured value as a dot outside it, the stepper, then the modes as option
 * tiles and presets / fan speeds as chips. Every null the integrations send is survived.
 */
export class FluvyThermostatCard extends Card<ThermostatCardConfig> {
  /**
   * The card's height at a 360 column, for the automatic dashboard's columns. Read from the config alone: a card
   * that keeps to the essentials while off is reserved its height when on.
   */
  static override layoutHeight(config: ThermostatCardConfig): number {
    return config.variant === 'compact' ? 292 : config.variant === 'ruler' ? 356 : 484;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.climate,
    css`
      .fv-options {
        row-gap: 4px;
      }
      /* a column under 292 cannot hold a 16/600 option value ("Standby" is 65 px in 60): the value drops to 14 before it would ever be cut */
      .is-narrow .fv-option__value {
        font-size: 14px;
        letter-spacing: -0.01em;
      }
    `,
  ];

  static override defaults: EditorDefaults = (config, hass) => ({
    variant: 'dial',
    modes_style: 'tiles',
    preset_style: 'full',
    fan_style: 'full',
    show_presets: true,
    show_fan: true,
    when_off: 'all',
    ...(typeof config['entity'] === 'string' &&
    Array.isArray(hass?.states[config['entity']]?.attributes['hvac_modes'])
      ? { modes: hass?.states[config['entity']]?.attributes['hvac_modes'] }
      : {}),
  });
  static override keys = configKeys<ThermostatCardConfig>()([
    'show_presets',
    'show_fan',
    'variant',
    'modes',
    'modes_style',
    'preset_style',
    'fan_style',
    'when_off',
  ]);
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['climate', 'water_heater', 'humidifier']),
        nameIconFields(),
        fieldRow(
          selectField('variant', ['dial', 'compact', 'ruler']),
          selectField('modes_style', ['tiles', 'chips', 'full']),
        ),
        {
          name: 'modes',
          selector: {
            select: {
              multiple: true,
              mode: 'list',
              options: MODE_ORDER.map((value) => ({
                value,
                label: editorWord(`climate.mode.${value}` as MessageKey),
              })),
            },
          },
        },
        fieldRow(boolField('show_presets'), selectField('preset_style', ['full', 'chips'])),
        fieldRow(boolField('show_fan'), selectField('fan_style', ['full', 'chips'])),
        whenOffField(),
        ...colourFields(),
        actionFields(),
      ],
      ...formLabels({
        modes: 'editor.modes',
        modes_style: 'editor.modes_style',
        show_presets: 'climate.preset',
        preset_style: 'editor.preset_style',
        show_fan: 'climate.fan',
        fan_style: 'editor.fan_style',
      }),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): ThermostatCardConfig {
    return {
      type: 'custom:fluvy-thermostat-card',
      entity: entities.find((id) => /^(climate|water_heater|humidifier)\./.test(id)) ?? '',
    };
  }

  protected override prepare(config: ThermostatCardConfig): ThermostatCardConfig {
    if (!config.entity) throw new Error('fluvy-thermostat-card: "entity" is required');
    // defaults are written into the config so the visual editor shows the switches as they behave
    return {
      ...config,
      show_presets: config.show_presets ?? true,
      show_fan: config.show_fan ?? true,
    };
  }

  override getCardSize(): number {
    return { dial: 7, ruler: 6, compact: 4 }[this.variant()];
  }
  /** The dial needs its width; the ruler card half a section; the compact one a quarter. */
  override getGridOptions(): LovelaceGridOptions {
    switch (this.variant()) {
      case 'compact':
        return { columns: 6, rows: 'auto', min_columns: 4 };
      case 'ruler':
        return { columns: 12, rows: 'auto', min_columns: 6 };
      default:
        return { columns: 12, rows: 'auto', min_columns: 8 };
    }
  }

  /* The setpoint each mode was last used at, so an inactive mode tile can say "Cool · 24°". */
  private remember(entityId: string, mode: string, value: string): void {
    writeText(`fluvy:setpoint:${entityId}:${mode}`, value);
  }

  private recall(entityId: string, mode: string): string {
    return readText(`fluvy:setpoint:${entityId}:${mode}`);
  }

  private degrees(value: number | undefined, step: number): string {
    if (value === undefined) return '';
    const digits = step < 1 ? 1 : 0;
    return `${formatNumber(this.hass, value, { digits, minDigits: digits })}°`;
  }

  private model(view: EntityView): Model {
    const num = (key: string): number | undefined => {
      const v = view.attr<number | null>(key);
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    };
    const state = this.stateOf(view);
    if (view.domain === 'humidifier') {
      const off = state !== 'on';
      const available = view.attr<string[]>('available_modes') ?? [];
      const mode = view.attr<string>('mode');
      const target = num('humidity');
      return {
        kind: 'humidifier',
        tone: 'water',
        off,
        min: num('min_humidity') ?? 0,
        max: num('max_humidity') ?? 100,
        step: 1,
        unit: '%',
        target,
        low: undefined,
        high: undefined,
        current: num('current_humidity'),
        arc: 'to-target',
        badgeText: stateText(this.hass, view),
        modes: [
          {
            key: '__off',
            label: this.t('climate.mode.off'),
            value: off ? this.t('climate.standby') : '',
            glyph: 'power',
            tone: 'neutral',
            active: off,
          },
          ...available.slice(0, 5).map((m): OptionItem => ({
            key: m,
            label: pretty(m),
            value:
              !off && m === mode && target !== undefined
                ? `${formatNumber(this.hass, target, { digits: 0 })} %`
                : '',
            glyph: MODE_GLYPH[m] ?? 'humid',
            tone: 'water',
            active: !off && m === mode,
          })),
        ],
        presets: [],
        preset: undefined,
        fans: [],
        fan: undefined,
      };
    }
    // the house's unit: Home Assistant gives a climate's and a water heater's temperatures in it; where an entity says
    // no range or step of its own, its defaults are Home Assistant's, in that unit
    const unit = this.hass?.config.unit_system.temperature ?? '°C';
    const fahrenheit = unit === '°F';
    if (view.domain === 'water_heater') {
      const list = view.attr<string[]>('operation_list') ?? [];
      const off = state === 'off';
      const target = num('temperature');
      return {
        kind: 'water_heater',
        tone: 'heat',
        off,
        min: num('min_temp') ?? (fahrenheit ? 110 : 43),
        max: num('max_temp') ?? (fahrenheit ? 140 : 60),
        step: num('target_temp_step') ?? 1,
        unit,
        target,
        low: undefined,
        high: undefined,
        current: num('current_temperature'),
        arc: 'to-target',
        badgeText: stateText(this.hass, view),
        modes: list.slice(0, 6).map((m): OptionItem => ({
          key: m,
          label: pretty(m),
          value:
            m === state
              ? m === 'off'
                ? this.t('climate.standby')
                : this.degrees(target, 1)
              : this.recall(view.id, m),
          glyph: MODE_GLYPH[m] ?? 'heater',
          tone: m === 'off' ? 'neutral' : 'heat',
          active: m === state,
        })),
        presets: [],
        preset: undefined,
        fans: [],
        fan: undefined,
      };
    }
    // a whole degree in Fahrenheit, a half in Celsius, as Home Assistant's own thermostat steps
    const step = num('target_temp_step') ?? (fahrenheit ? 1 : 0.5);
    const off = state === 'off';
    const action = view.attr<string>('hvac_action');
    const low = num('target_temp_low');
    const high = num('target_temp_high');
    const isRange =
      (state === 'heat_cool' || state === 'auto') && low !== undefined && high !== undefined;
    const tone: Tone = off
      ? 'neutral'
      : action === 'cooling' || state === 'cool'
        ? 'cool'
        : state === 'dry'
          ? 'dry'
          : state === 'fan_only'
            ? 'fan'
            : isRange
              ? 'accent'
              : 'heat';
    const target = num('temperature');
    const hvacModes = [...(view.attr<string[]>('hvac_modes') ?? [])].sort(
      (a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b),
    );
    const setpoint = isRange
      ? `${this.degrees(low, 1).replace('°', '')}–${this.degrees(high, 1)}`
      : this.degrees(target, step);
    if (!off && view.status === 'ok') this.remember(view.id, state, setpoint);
    const actionKey = `climate.action.${action ?? (off ? 'off' : 'idle')}` as MessageKey;
    return {
      kind: 'climate',
      tone,
      off,
      min: num('min_temp') ?? (fahrenheit ? 45 : 7),
      max: num('max_temp') ?? (fahrenheit ? 95 : 35),
      step,
      unit,
      target: isRange ? undefined : target,
      low: isRange ? low : undefined,
      high: isRange ? high : undefined,
      current: num('current_temperature'),
      arc: isRange
        ? 'range'
        : tone === 'cool'
          ? 'from-target'
          : state === 'fan_only' || state === 'dry'
            ? 'none'
            : 'to-target',
      badgeText:
        action && ['heating', 'cooling', 'drying', 'fan', 'idle', 'off'].includes(action)
          ? this.t(actionKey)
          : off
            ? this.t('climate.mode.off')
            : stateText(this.hass, view),
      modes: hvacModes.map((m): OptionItem => ({
        key: m,
        label:
          (`climate.mode.${m}` as MessageKey) in
          {
            'climate.mode.heat': 1,
            'climate.mode.cool': 1,
            'climate.mode.heat_cool': 1,
            'climate.mode.auto': 1,
            'climate.mode.dry': 1,
            'climate.mode.fan_only': 1,
            'climate.mode.off': 1,
          }
            ? this.t(`climate.mode.${m}` as MessageKey)
            : pretty(m),
        value:
          m === state
            ? m === 'off'
              ? this.t('climate.standby')
              : setpoint
            : m === 'off'
              ? ''
              : this.recall(view.id, m),
        glyph: MODE_GLYPH[m] ?? 'thermo',
        tone: MODE_TONE[m] ?? 'accent',
        active: m === state,
      })),
      presets: view.attr<string[]>('preset_modes') ?? [],
      preset: view.attr<string>('preset_mode'),
      fans: view.attr<string[]>('fan_modes') ?? [],
      fan: view.attr<string>('fan_mode'),
    };
  }

  private setTarget(view: EntityView, m: Model, detail: DialChangeDetail): void {
    if (m.kind === 'humidifier' && detail.value !== undefined)
      this.call('humidifier', 'set_humidity', { humidity: detail.value });
    else if (m.kind === 'water_heater' && detail.value !== undefined)
      this.call('water_heater', 'set_temperature', { temperature: detail.value });
    else if (detail.low !== undefined && detail.high !== undefined)
      this.call('climate', 'set_temperature', {
        target_temp_low: detail.low,
        target_temp_high: detail.high,
      });
    else if (detail.value !== undefined)
      this.call('climate', 'set_temperature', { temperature: detail.value });
    void view;
  }

  private setMode(view: EntityView, m: Model, key: string): void {
    if (m.kind === 'humidifier') {
      if (key === '__off') {
        this.expect(view.id, 'off');
        this.call('humidifier', 'turn_off');
        return;
      }
      if (m.off) {
        this.expect(view.id, 'on');
        this.call('humidifier', 'turn_on');
      }
      this.call('humidifier', 'set_mode', { mode: key });
      return;
    }
    this.expect(view.id, key);
    if (m.kind === 'water_heater')
      this.call('water_heater', 'set_operation_mode', { operation_mode: key });
    else this.call('climate', 'set_hvac_mode', { hvac_mode: key });
  }

  private readonly head = new HeadFit(this);

  /** The target the value row shows while a stepped change is on its way (5 s at most; released as soon as the entity reports it). */
  private held: { value: number } | null = null;
  private heldTimer = 0;
  private sendTimer = 0;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.heldTimer);
    clearTimeout(this.sendTimer);
  }

  /** One step of the target from the value row's stepper: shown at once, sent after the taps settle (650 ms, like the light card). */
  private nudge(view: EntityView, m: Model, direction: 1 | -1): void {
    const base = this.held?.value ?? m.target;
    if (base === undefined) return;
    const digits = decimalsOf(m.step);
    const next = clamp(
      Number((Math.round((base + direction * m.step) / m.step) * m.step).toFixed(digits)),
      m.min,
      m.max,
    );
    this.held = { value: next };
    clearTimeout(this.heldTimer);
    this.heldTimer = window.setTimeout(() => {
      this.held = null;
      this.requestUpdate();
    }, 5000);
    clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => this.setTarget(view, m, { value: next }), 650);
    this.requestUpdate();
  }

  private variant(): ThermostatVariant {
    const v = this.config?.variant;
    return v === 'compact' || v === 'ruler' ? v : 'dial';
  }

  /** The value row of the compact and ruler variants: the target as a large readout (with "Now …" in its label) and the stepper; the ruler variant adds the ruler(s). */
  private renderValueRow(
    view: EntityView,
    m: Model,
    name: string,
    unusable: boolean,
    figure: (v: number) => string,
    edge: (v: number) => string,
    now: string,
  ): TemplateResult {
    const range = m.target === undefined && m.low !== undefined && m.high !== undefined;
    if (this.held && m.target === this.held.value) this.held = null;
    const shown = this.held?.value ?? m.target;
    const idle = unusable || m.off;
    const text = unusable
      ? '—'
      : m.off
        ? this.t('climate.mode.off')
        : range
          ? `${figure(m.low as number)} – ${figure(m.high as number)}`
          : shown === undefined
            ? '—'
            : figure(shown);
    const unit = idle || (shown === undefined && !range) ? '' : m.unit;
    const w = this.contentWidth;
    const tone: Tone = idle ? 'neutral' : m.tone;
    const nav = {
      decrease: `${name} · ${this.t('common.decrease')}`,
      increase: `${name} · ${this.t('common.increase')}`,
    };
    const ruler = (value: number, ariaLabel: string, commit: (v: number) => void): TemplateResult =>
      html`<fluvy-ruler
          .value=${value}
          .min=${m.min}
          .max=${m.max}
          .step=${m.step}
          .length=${w}
          .tone=${tone}
          ?disabled=${idle}
          ?inactive=${m.off}
          .unit=${m.unit}
          .label=${ariaLabel}
          .format=${figure}
          @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => commit(e.detail.value)}
        ></fluvy-ruler
        >${rulerLabels([
          [0, edge(m.min)],
          [1, edge(m.max)],
        ])}`;
    // "Target · Now 20.8°" beside the stepper when it fits on its one line (11/600 caps, 0.06em apart), else "Target"
    const target = this.t('climate.target');
    const beside = idle || range || shown === undefined ? 0 : 96 + 12; // the stepper and the gap before it
    const room = w - beside - 2;
    const caps = (text: string): number =>
      textWidth(text.toUpperCase(), `600 11px ${getComputedStyle(this).fontFamily}`) +
      text.length * 0.66;
    const heading = now && caps(`${target} · ${now}`) <= room ? `${target} · ${now}` : target;
    // the large figure ("21.5 °C", a range's "18 – 22 °C") beside its stepper: one size down where the row cannot hold it
    const size =
      this.head.ruler.width(
        'fv-readout fv-readout--l > fv-readout__value',
        text,
        'fv-unit',
        unit,
      ) <=
      w - beside
        ? 'l'
        : 'm';
    return html`<div class="cl-value fv-value-row">
        ${readout({ label: heading, value: text, unit, size })}
        ${idle || range || shown === undefined ? nothing : stepper((direction) => this.nudge(view, m, direction), nav)}
      </div>
      ${
        this.variant() === 'ruler'
          ? range
            ? html`<div class="cl-range">
                ${label(this.t('climate.low'))}${ruler(m.low as number, `${name} · ${this.t('climate.low')}`, (v) => this.setTarget(view, m, { low: v, high: Math.max(v, m.high as number) }))}
                ${label(this.t('climate.high'))}${ruler(m.high as number, `${name} · ${this.t('climate.high')}`, (v) => this.setTarget(view, m, { low: Math.min(v, m.low as number), high: v }))}
              </div>`
            : html`<div class="cl-bubble-row"></div>
                ${ruler(shown ?? m.min, `${name} · ${this.t('climate.target')}`, (v) => {
                  this.held = { value: v };
                  this.setTarget(view, m, { value: v });
                })}`
          : nothing
      }`;
  }

  /** The modes the config asks for, in its order — every mode the entity offers by default. */
  private shownModes(m: Model): readonly OptionItem[] {
    const wanted = this.config?.modes;
    if (!wanted?.length) return m.modes;
    return wanted
      .map((key) => m.modes.find((o) => o.key === key))
      .filter((o): o is OptionItem => o !== undefined);
  }

  private renderModes(view: EntityView, m: Model, modes: readonly OptionItem[]): TemplateResult {
    const style = this.config?.modes_style ?? 'tiles';
    const select = (key: string): void => this.setMode(view, m, key);
    // tiles only while every mode's word holds its cell (a water heater's "Performance" in a 211 column does not):
    // else the chips, which give way in their order and never cut a word
    const measure = (text: string): number => this.head.ruler.width('fv-option__label', text);
    const tiled =
      style === 'tiles' &&
      optionsHold(
        modes.map((o) => o.label),
        this.contentWidth,
        4,
        measure,
      );
    if (tiled) {
      const columns = optionColumnsFor(
        modes.map((o) => o.label),
        this.contentWidth,
        4,
        measure,
      );
      // a value's word the cell cannot hold (de's "Bereitschaft" under Off in a 211 column) is dropped, never cut
      const held = valuesHeld(modes, optionCell(this.contentWidth, 4, columns), (text) =>
        this.head.ruler.width('fv-option__value', text),
      );
      return options(held, select, 4, 84, columns);
    }
    return chipRow(
      modes.map((o) => ({
        key: o.key,
        label: o.label,
        active: o.active ?? false,
        ...(o.glyph ? { glyph: o.glyph } : {}),
      })),
      select,
      style === 'tiles' ? 'full' : style,
      { ruler: this.head.ruler, width: this.contentWidth },
    );
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);
    const unusable = !isUsable(view);
    const m = this.model(view);
    const tone: Tone = unusable ? 'off' : m.tone;
    const humidity = view.attr<number | null>('current_humidity');
    const subParts = [
      view.areaName,
      m.kind === 'climate' && typeof humidity === 'number'
        ? `${formatNumber(this.hass, humidity, { digits: 0 })} % RH`
        : '',
    ].filter(Boolean);
    const isPct = m.unit === '%';
    const figure = (v: number): string =>
      formatNumber(this.hass, v, { digits: m.step < 1 ? 1 : 0, minDigits: m.step < 1 ? 1 : 0 });
    const now =
      m.current !== undefined
        ? this.t('climate.current', {
            value: isPct
              ? `${formatNumber(this.hass, m.current, { digits: 0 })} %`
              : `${formatNumber(this.hass, m.current, { digits: 1 })}°`,
          })
        : '';
    const edge = (v: number): string =>
      isPct
        ? `${formatNumber(this.hass, v, { digits: 0 })} %`
        : `${formatNumber(this.hass, v, { digits: 0 })}°`;

    const fitted = this.head.fit({
      width: this.contentWidth,
      title: name,
      sub: subParts.join(' · '),
      badge: { text: unusable ? stateText(this.hass, view) : m.badgeText, tone },
    });
    const modes = this.shownModes(m);
    // the essentials while off: the head, the value and the modes stay; presets and fan speeds wait for a mode
    const essentials = m.off && this.config?.when_off === 'essentials';
    return html`<article
      class="fv-card cl-card ${unusable ? 'is-unavailable' : ''} ${this.contentWidth < 292 ? 'is-narrow' : ''}"
      data-card
    >
      ${head({ icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null, tone, title: name, sub: fitted.sub, trailing: fitted.badge, onIconTap: () => this.tap(view.id), onHold: () => this.hold(view.id), iconLabel: name, name: true })}
      ${
        this.variant() !== 'dial'
          ? this.renderValueRow(view, m, name, unusable, figure, edge, now)
          : html`<div class="cl-dial-row">
              <fluvy-dial
                .radius=${84}
                .tick=${10}
                .large=${false}
                .tone=${m.off || unusable ? 'neutral' : m.tone}
                .min=${m.min}
                .max=${m.max}
                .step=${m.step}
                .arc=${m.arc}
                .value=${m.target}
                .low=${m.low}
                .high=${m.high}
                .current=${m.current}
                .unit=${m.unit}
                .sub=${now}
                .text=${unusable ? '—' : m.off ? this.t('climate.mode.off') : m.target === undefined && m.low === undefined ? '—' : undefined}
                min-label=${edge(m.min)}
                max-label=${edge(m.max)}
                ?disabled=${m.off || unusable || (m.target === undefined && m.low === undefined)}
                .format=${figure}
                @fluvy-change=${(e: CustomEvent<DialChangeDetail>) => this.setTarget(view, m, e.detail)}
              ></fluvy-dial>
            </div>`
      }
      ${modes.length ? html`${label(this.t('climate.mode'))}${this.renderModes(view, m, modes)}` : nothing}
      ${
        m.presets.length && !essentials && this.config?.show_presets !== false
          ? html`${label(this.t('climate.preset'))}${chipRow(
              m.presets.map((p) => ({ key: p, label: pretty(p), active: p === m.preset })),
              (key) => this.call('climate', 'set_preset_mode', { preset_mode: key }),
              this.config?.preset_style,
              { ruler: this.head.ruler, width: this.contentWidth },
            )}`
          : nothing
      }
      ${
        m.fans.length && !essentials && this.config?.show_fan !== false
          ? html`${label(this.t('climate.fan'))}${chipRow(
              m.fans.map((f) => ({ key: f, label: pretty(f), active: f === m.fan })),
              (key) => this.call('climate', 'set_fan_mode', { fan_mode: key }),
              this.config?.fan_style,
              { ruler: this.head.ruler, width: this.contentWidth },
            )}`
          : nothing
      }
    </article>`;
  }
}
