import {
  fetchHistory,
  formatNumber,
  isUsable,
  stateText,
  strings as words,
  toggleEntity,
  valueParts,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type Series,
} from '@fluvy/core';

import { head, listRow, readout, rulerLabels, sheetStyles, type Tone } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { HeadFit } from '../energy/head.js';

import { Card } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  iconField,
  numberField,
  textField,
} from '../shared/form.js';
import { Refresher } from '../shared/refresh.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { ROW } from '../shared/heights.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const strings = words('humidity');

export interface HumidityCardConfig extends FluvyCardConfig {
  subtitle?: string;
  /** Bottom of the comfort band (30 %). */
  low?: number;
  /** Top of the comfort band (60 %). */
  high?: number;
  /** Room temperature; with it the card can say the dew point. */
  temperature_entity?: string;
  /** Hours the Trend row looks back (6). */
  hours?: number;
  /** The Trend row (default). */
  show_trend?: boolean;
  /** A humidifier, dehumidifier or plain switch shown as a row with its switch. */
  humidifier_entity?: string;
}

/** The history cache in core lives five minutes; asking again sooner would only return the same window. */
/** The band opens this far outside the ticks that bound it, so neither tick is bitten by its edge. */
const BAND_MARGIN = 1; // the band ends on the 30 / 60 ticks; 1 px covers the tick stroke, no more

/** Magnus-Tetens, the formula Home Assistant's own dew-point helpers use. */
function dewPoint(celsius: number, humidity: number): number {
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * celsius) / (b + celsius) + Math.log(Math.max(0.01, humidity / 100));
  return (b * alpha) / (a - alpha);
}

const toCelsius = (value: number, unit: string): number =>
  unit === '°F' ? ((value - 32) * 5) / 9 : value;
const fromCelsius = (value: number, unit: string): number =>
  unit === '°F' ? (value * 9) / 5 + 32 : value;
const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

/**
 * A humidity sensor on the comfort ruler: the pastel band between the two thresholds drawn behind
 * the ticks, the reading as a read-only marker riding them, the state said once in the badge, and
 * underneath where it is heading and the humidifier that answers it.
 */
export class FluvyHumidityCard extends Card<HumidityCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: HumidityCardConfig): number {
    const trend = config.show_trend === false || config.hours === 0 ? 0 : 1;
    const rows = trend + (config.humidifier_entity ? 1 : 0);
    return 236 + (rows ? 16 + ROW * rows : 0);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      /* the sheet's rule reaches the ruler through its host: nothing to cut here, the band stays whole behind the marker */
      .so-band fluvy-ruler {
        display: block;
        position: relative;
        --knob-halo: transparent;
      }
    `,
  ];

  static override properties = { ...Card.properties, series_: { state: true } };

  /** The trend window: undefined while it loads, null when the recorder has nothing. */
  declare series_: Series | null | undefined;

  private readonly history = new Refresher<Series | null>();
  private readonly head = new HeadFit(this);

  constructor() {
    super();
    this.series_ = undefined;
  }

  static override keys = configKeys<HumidityCardConfig>()([
    'subtitle',
    'low',
    'high',
    'temperature_entity',
    'hours',
    'show_trend',
    'humidifier_entity',
  ]);
  /** `trend_hours` was the window's older name; `trend_hours: 0` still hides the row. */
  static override aliases: AliasSpec = { keys: [{ from: 'trend_hours', to: 'hours' }] };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ show_trend: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor', 'number', 'input_number']),
        fieldRow(textField('name'), textField('subtitle')),
        iconField(),
        ...colourFields(),
        fieldRow(numberField('low', 0, 100), numberField('high', 0, 100)),
        {
          name: 'temperature_entity',
          selector: { entity: { domain: ['sensor'], device_class: 'temperature' } },
        },
        {
          name: 'humidifier_entity',
          selector: { entity: { domain: ['humidifier', 'switch', 'fan', 'input_boolean'] } },
        },
        fieldRow(numberField('hours', 1, 48), boolField('show_trend')),
        actionFields(),
      ],
      ...editorLabels(
        strings,
        {
          low: 'low',
          high: 'high',
          temperature_entity: 'temperature_entity',
          humidifier_entity: 'humidifier_entity',
        },
        {},
      ),
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): HumidityCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    return {
      type: 'custom:fluvy-humidity-card',
      entity:
        sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'humidity') ??
        sensors.find((id) => /humid/.test(id)) ??
        sensors[0] ??
        '',
    };
  }

  protected override prepare(config: HumidityCardConfig): HumidityCardConfig {
    if (!config.entity) throw new Error('fluvy-humidity-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return 5 + (this.trendHours > 0 ? 1 : 0) + (this.config?.humidifier_entity ? 1 : 0);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [
      this.config?.entity ?? '',
      this.config?.temperature_entity ?? '',
      this.config?.humidifier_entity ?? '',
    ].filter(Boolean);
  }

  /** The Trend window; 0 when the row is not shown. */
  private get trendHours(): number {
    if (this.config?.show_trend === false) return 0;
    const hours = this.config?.hours;
    return typeof hours === 'number' && hours >= 0 ? Math.min(48, hours) : 6;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.loadTrend();
  }

  private loadTrend(): void {
    const hass = this.hass;
    const id = this.config?.entity;
    const hours = this.trendHours;
    if (!hass || !id || hours === 0) return;
    const key = `${id}|${hours}`;
    const previous = this.history.request(
      key,
      () => fetchHistory(hass, id, hours, 12),
      (series) => (this.series_ = series),
    );
    if (previous !== null && previous !== key) this.series_ = undefined;
  }

  /** "+3 %": where the reading stands against the start of the window. */
  private trendRow(value: number | null, unusable: boolean, onTap: () => void): TemplateResult {
    const first = this.series_?.values[0];
    const delta = value !== null && first !== undefined ? value - first : null;
    const size = delta === null ? 0 : Math.abs(delta);
    const text =
      delta === null
        ? '—'
        : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatNumber(this.hass, size, { digits: size < 10 ? 1 : 0 })} %`;
    return listRow({
      icon: delta !== null && delta < 0 ? 'trendDown' : 'trendUp',
      tone: unusable ? 'off' : 'neutral',
      title: strings(this.hass, 'trend'),
      sub: strings(this.hass, 'last_hours', {
        hours: formatNumber(this.hass, this.trendHours, { digits: 1 }),
      }),
      trailing: 'value',
      value: text,
      onTap,
    });
  }

  private humidifierRow(entityId: string): TemplateResult {
    const view = this.entity(entityId);
    const usable = view.status === 'ok' || view.status === 'unknown';
    const on = this.stateOf(view) === 'on';
    const target = view.attr<number | null>('humidity');
    const context = [
      view.areaName,
      typeof target === 'number' && Number.isFinite(target)
        ? `${formatNumber(this.hass, target, { digits: 0 })} %`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const room = this.head.rowRoom(this.contentWidth, '') - 56; // the 56 × 44 switch hit
    return listRow({
      icon: glyphFor(view),
      tone: !usable ? 'off' : on ? 'water' : 'neutral',
      title: view.name,
      name: true,
      sub: this.head.fitRowSub(usable ? context : stateText(this.hass, view), room),
      trailing: 'switch',
      on,
      unavailable: !usable,
      onTap: () => this.tap(view.id, { action: 'more-info' }),
      onToggle: (next) => {
        if (!this.hass) return;
        this.expect(view.id, next ? 'on' : 'off');
        void toggleEntity(this.hass, view.id);
      },
    });
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);

    const unusable = !isUsable(view);
    const value = view.number;
    const low = clampPercent(this.config?.low ?? 30);
    const high = Math.max(low, clampPercent(this.config?.high ?? 60));
    const dry = value !== null && value < low;
    const humid = value !== null && value > high;
    const markerTone: Tone = toneOf(this.config, 'water');
    const tone: Tone = unusable
      ? 'off'
      : value === null
        ? 'neutral'
        : dry || humid
          ? 'warning'
          : markerTone;
    const badgeText =
      value === null
        ? stateText(this.hass, view)
        : dry
          ? this.t('humidity.dry')
          : humid
            ? this.t('humidity.humid')
            : strings(this.hass, 'comfortable');

    // the band is placed from the very pixels the ruler puts its ticks on, whatever the column measures
    const width = this.contentWidth;
    const tick = (percent: number): number => Math.round((percent / 100) * width);
    const bandLeft = Math.max(0, tick(low) - BAND_MARGIN);
    const bandRight = Math.min(width, tick(high) + BAND_MARGIN);

    // a threshold too close to an end would print over "Dry" or "Humid": the band itself still says where it is
    const labels: Array<readonly [number, string]> = [[0, this.t('humidity.dry')]];
    if (tick(low) >= 56) labels.push([low / 100, formatNumber(this.hass, low, { digits: 0 })]);
    if (width - tick(high) >= 64 && tick(high) - tick(low) >= 40)
      labels.push([high / 100, formatNumber(this.hass, high, { digits: 0 })]);
    labels.push([1, this.t('humidity.humid')]);

    const temperature = this.config?.temperature_entity
      ? this.entity(this.config.temperature_entity)
      : null;
    let side: { label: string; value: string; unit: string } | null = null;
    if (temperature && temperature.number !== null) {
      const unit = temperature.unit || this.hass?.config.unit_system.temperature || '°C';
      side =
        value === null
          ? { label: strings(this.hass, 'temperature'), ...valueParts(this.hass, temperature) }
          : {
              label: strings(this.hass, 'dew_point'),
              value: formatNumber(
                this.hass,
                fromCelsius(dewPoint(toCelsius(temperature.number, unit), value), unit),
                { digits: 1 },
              ).replace(/^-/, '−'),
              unit,
            };
    }

    // `dark` on the ruler: its lit ticks glow in dark mode, and nothing else tells a control which mode it is in
    const parts = valueParts(this.hass, view);
    const openInfo = (): void => this.tap(view.id, { action: 'more-info' });
    const humidifier = this.config?.humidifier_entity;
    const fitted = this.head.fit({
      width,
      title: name,
      sub: this.config?.subtitle ?? view.areaName,
      badge: { text: badgeText, tone },
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
        tone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        onIconTap: () => this.tap(view.id),
        onHold: () => this.hold(view.id),
        iconLabel: name,
        name: true,
      })}
      <div class="so-top fv-value-row">
        ${readout({ label: strings(this.hass, 'relative'), value: parts.value, unit: value === null ? '' : parts.unit || '%', size: 'l' })}
        ${side ? html`<div class="so-top__side">${readout({ label: side.label, value: side.value, unit: side.unit, size: 's' })}</div>` : nothing}
      </div>
      <div class="so-band">
        <span
          class="so-band__zone"
          data-measure="value"
          style="left:${bandLeft}px;width:${bandRight - bandLeft}px"
        ></span>
        <fluvy-ruler
          marker
          ?dark=${this.dark}
          .value=${value ?? 0}
          .min=${0}
          .max=${100}
          .step=${1}
          .length=${width}
          .knob=${36}
          .tone=${unusable ? 'neutral' : markerTone}
          ?inactive=${value === null}
          unit="%"
          .label=${`${name} · ${strings(this.hass, 'relative')}`}
          .format=${(raw: number) => formatNumber(this.hass, raw, { digits: 0 })}
        ></fluvy-ruler>
      </div>
      ${rulerLabels(labels)}
      ${
        this.trendHours > 0 || humidifier
          ? html`<div class="so-rows">
              ${this.trendHours > 0 ? this.trendRow(value, unusable, openInfo) : nothing}
              ${humidifier ? this.humidifierRow(humidifier) : nothing}
            </div>`
          : nothing
      }
    </article>`;
  }
}
