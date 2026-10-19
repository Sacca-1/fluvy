import {
  fetchHistory,
  formatNumber,
  isUsable,
  strings as words,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
  type Series,
} from '@fluvy/core';

import { head, readout, rulerLabels, sheetStyles, type Tone } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { HeadFit } from '../energy/head.js';

import { Card, HEAD_BASE } from '../shared/base.js';

import { glyphFor, stateWord } from '../shared/domain.js';
import {
  actionFields,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  iconField,
  numberField,
  selectField,
  showIconField,
  textField,
} from '../shared/form.js';
import { statsRow } from '../shared/readouts.js';
import { Refresher } from '../shared/refresh.js';

import { baseOf, ceilingFor, figure, scaleFor, toBase, type Scale } from './units.js';
import {
  fractionOf,
  labelRoom,
  signedGeometry,
  ticksOf,
  valueBox,
  valueRoom,
  type ValueSize,
} from './signed.js';
import { configKeys } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const strings = words('gauge');
const ways = words('energy-flow');

export type GaugeVariant = 'ring' | 'bar' | 'signed';
export const GAUGE_VARIANTS: readonly GaugeVariant[] = ['ring', 'bar', 'signed'];

export interface GaugeCardConfig extends FluvyCardConfig {
  subtitle?: string;
  /**
   * `ring` (default): the dial. `bar`: the reading over a level bar, for a half column. `signed`: a value that can
   * be negative (a grid meter) on a ring with zero at the top, lit from zero to the value; a power meter says its
   * direction in the unit ("1.8 kW out").
   */
  variant?: GaugeVariant;
  /** Bottom of the ring, in the sensor's unit (signed: the left end, `-max` by default). */
  min?: number;
  /** Top of the ring, in the sensor's unit. Without it: the entity's `max` attribute, `max_entity`, or the window's peak rounded up. */
  max?: number;
  /** An entity that carries the ceiling (an inverter's rated power, a tank's capacity), in any unit of the same family. */
  max_entity?: string;
  /** The word in the open centre of the ring. Defaults to the device class ("Power"). */
  label?: string;
  /** Window the Min / Max / Average row summarises. */
  hours?: number;
  /** Head badge. Defaults to "Producing" / "Idle", read from the value. */
  badge?: string;
}

/** The sheet's ring: R 96 with 12 px ticks needs a 240 box, which a 300 px card still holds. */
const RADIUS = 96;
const TICK = 12;
/** The history cache in core lives five minutes; asking again sooner would only return the same window. */
/** Below this share of the range the source is resting: the badge says so and the head goes neutral. */
const IDLE = 0.02;

type LabelKey =
  'energy' | 'temperature' | 'pressure' | 'speed' | 'illuminance' | 'current' | 'voltage';

const CLASS_LABEL: Record<string, LabelKey> = {
  energy: 'energy',
  temperature: 'temperature',
  pressure: 'pressure',
  atmospheric_pressure: 'pressure',
  speed: 'speed',
  wind_speed: 'speed',
  illuminance: 'illuminance',
  current: 'current',
  voltage: 'voltage',
};

const SHARED_LABEL: Record<string, MessageKey> = {
  power: 'energy.power',
  humidity: 'climate.humidity',
  battery: 'energy.battery',
};

const PRODUCES = new Set(['power', 'energy', 'current']);

/**
 * A numeric sensor as the read-only ring gauge: the tick ring lit to its fraction, the figure in the
 * open centre under an uppercase label, the range under the ring, and Min / Max / Average of the
 * window below — centred in their columns, so the row mirrors the ring above it.
 */
export class FluvyGaugeCard extends Card<GaugeCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: GaugeCardConfig): number {
    return config.variant === 'bar' ? 256 : config.variant === 'signed' ? 372 : 384;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    sheetStyles.energy,
    css`
      /* the signed ring: its size fitted to the column, its lit ticks in the card's tone (the grid's by default) */
      .en-gauge .en-tick.is-lit {
        stroke: var(--tone-ink);
      }
      .en-gauge__zero,
      .en-gauge__label,
      .en-gauge__value {
        left: 0;
        width: 100%;
        text-align: center;
        white-space: nowrap;
      }
      .en-gauge__value--m {
        font-size: 24px;
        line-height: 28px;
      }
      .en-gauge__unit {
        margin-left: 3px;
        font-size: 16px;
        color: var(--fluvy-text-secondary);
      }
      .en-gauge__value--m .en-gauge__unit {
        font-size: 12px;
      }
      .en-gauge__end {
        white-space: nowrap;
      }
      /* a label longer than the ring's opening is a name: it ends in an ellipsis inside it */
      .en-gauge__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* the ring is placed on a whole pixel (its ticks stay crisp in an odd column) instead of centred on a half */
      .so-gauge {
        justify-content: flex-start;
      }
      fluvy-dial {
        flex: 0 0 auto;
      }
      .so-cols .fv-readout__label {
        white-space: nowrap;
      } /* a label never drops onto its value */
    `,
  ];

  static override properties = { ...Card.properties, series_: { state: true } };

  /** The window in the sensor's own unit: undefined while it loads, null when the recorder has nothing. */
  declare series_: Series | null | undefined;

  private readonly history = new Refresher<Series | null>();
  private readonly head = new HeadFit(this);

  constructor() {
    super();
    this.series_ = undefined;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<GaugeCardConfig>()([
    'subtitle',
    'variant',
    'min',
    'max',
    'max_entity',
    'label',
    'hours',
    'badge',
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'ring' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor', 'number', 'input_number', 'counter']),
        fieldRow(textField('name'), textField('subtitle')),
        fieldRow(iconField(), selectField('variant', GAUGE_VARIANTS)),
        showIconField(),
        ...colourFields(),
        fieldRow(
          numberField('min', -1_000_000, 1_000_000, 0.1),
          numberField('max', -1_000_000, 1_000_000, 0.1),
        ),
        {
          name: 'max_entity',
          selector: { entity: { domain: ['sensor', 'number', 'input_number'] } },
        },
        fieldRow(textField('label'), textField('badge')),
        numberField('hours', 1, 168),
        actionFields(),
      ],
      ...editorLabels(strings, { max_entity: 'max_entity', label: 'label', badge: 'badge' }, {}),
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): GaugeCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    const entity =
      sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'power') ??
      sensors[0] ??
      entities[0] ??
      '';
    return { type: 'custom:fluvy-gauge-card', entity };
  }

  protected override prepare(config: GaugeCardConfig): GaugeCardConfig {
    if (!config.entity) throw new Error('fluvy-gauge-card: "entity" is required');
    if (typeof config.max === 'number' && config.max <= (config.min ?? 0))
      throw new Error('fluvy-gauge-card: "max" must be greater than "min"');
    if (config.variant === 'signed' && typeof config.min === 'number' && config.min >= 0)
      throw new Error('fluvy-gauge-card: a signed gauge’s "min" is below 0 (or left out: −max)');
    if (config.variant === 'signed' && typeof config.max === 'number' && config.max <= 0)
      throw new Error('fluvy-gauge-card: a signed gauge’s "max" is above 0');
    return config;
  }

  private get bar(): boolean {
    return this.config?.variant === 'bar';
  }

  private get signed(): boolean {
    return this.config?.variant === 'signed';
  }

  override getCardSize(): number {
    return this.bar ? 5 : 8;
  }
  /** The ring takes a section; the bar half of one (in a third its readouts ran into each other). */
  override getGridOptions(): LovelaceGridOptions {
    return this.bar
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [this.config?.entity ?? '', this.config?.max_entity ?? ''].filter(Boolean);
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.loadSeries();
  }

  private get hours(): number {
    const hours = this.config?.hours;
    return typeof hours === 'number' && hours > 0 ? Math.min(168, hours) : 24;
  }

  /** One history read per entity and window (core shares it between cards), asked again once it has gone stale. */
  private loadSeries(): void {
    const hass = this.hass;
    const id = this.config?.entity;
    if (!hass || !id) return;
    const key = `${id}|${this.hours}`;
    const hours = this.hours;
    const previous = this.history.request(
      key,
      () => fetchHistory(hass, id, hours),
      (series) => (this.series_ = series),
    );
    // a refresh keeps the figures on screen until the new ones arrive
    if (previous !== null && previous !== key) this.series_ = undefined;
  }

  /**
   * Top of the ring in the base unit: the config, the entity's own `max`, a companion entity, or the
   * window's peak rounded up. Null while that window is still loading — the ring waits unlit rather
   * than fill against a ceiling that is about to move.
   */
  private ceiling(view: EntityView, min: number, factor: number): number | null {
    const configured = this.config?.max;
    if (typeof configured === 'number' && Number.isFinite(configured)) return configured * factor;
    const own = view.attr<number | null>('max');
    if (typeof own === 'number' && Number.isFinite(own) && own * factor > min) return own * factor;
    const rated = this.config?.max_entity ? baseOf(this.entity(this.config.max_entity)) : null;
    if (rated && rated.value > min) return rated.value;
    if (this.series_ === undefined) return null;
    const peak = Math.max(this.series_?.max ?? -Infinity, view.number ?? -Infinity) * factor;
    return peak > min ? min + ceilingFor(peak - min) : null;
  }

  private innerLabel(view: EntityView): string {
    const configured = this.config?.label;
    if (configured !== undefined) return configured;
    const deviceClass = view.deviceClass;
    if (!deviceClass) return strings(this.hass, 'value');
    const key = `component.sensor.entity_component.${deviceClass}.name`;
    const native = this.hass?.localize(key);
    if (native && native !== key) return native;
    const shared = SHARED_LABEL[deviceClass];
    if (shared) return this.t(shared);
    const local = CLASS_LABEL[deviceClass];
    if (local) return strings(this.hass, local);
    const words = deviceClass.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /**
   * Unavailable, unknown or missing, the gauge is the live one in the off skin (the owner's rule, 1.9): its ring or
   * bar, its range, its label and its row of the window, the value "—"; the window is history and stays.
   */
  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (this.signed) return this.renderSigned(view, name);

    const unusable = !isUsable(view);
    const base = toBase(1, view.unit);
    const value = view.number === null ? null : view.number * base.value;
    const min = (this.config?.min ?? 0) * base.value;
    const max = this.ceiling(view, min, base.value);
    const series = this.series_;

    const scale = scaleFor(
      Math.max(
        Math.abs(min),
        Math.abs(max ?? 0),
        Math.abs(value ?? 0),
        Math.abs((series?.max ?? 0) * base.value),
      ),
      base.unit,
    );
    const precision =
      scale.divisor === 1 ? this.hass?.entities?.[view.id]?.display_precision : undefined;
    const shown = (raw: number): string => figure(this.hass, raw, scale, precision);
    const edgeDigits =
      Number.isInteger(min / scale.divisor) &&
      (max === null || Number.isInteger(max / scale.divisor))
        ? 0
        : 1; // "0.0 · 5.4", but "0 · 120"
    const edge = (raw: number): string =>
      formatNumber(this.hass, raw / scale.divisor, { digits: edgeDigits, minDigits: edgeDigits });

    const active = value !== null && value > min + (max === null ? 0 : (max - min) * IDLE);
    const tone: Tone = toneOf(this.config, 'solar');
    const headTone: Tone = unusable ? 'off' : active ? tone : 'neutral';
    const badgeText =
      unusable || value === null
        ? stateWord(this.hass, view)
        : (this.config?.badge ??
          (!active
            ? this.t('energy.idle')
            : PRODUCES.has(view.deviceClass)
              ? this.t('energy.producing')
              : strings(this.hass, 'active')));

    const width = this.contentWidth;
    const radius = Math.min(RADIUS, Math.max(48, Math.floor((width / 2 - TICK - 12) / 4) * 4));
    const box = Math.ceil((radius + TICK + 12) / 4) * 8; // the dial's own box: twice its half, which sits on the 4 grid
    const inset = Math.max(0, Math.floor((width - box) / 2));

    const stats = (
      [
        ['common.min', series?.min],
        ['common.max', series?.max],
        ['common.average', series?.average],
      ] as const
    ).map(([label, raw]) => ({
      label: this.t(label),
      value: raw === undefined ? '—' : shown(raw * base.value),
      unit: raw === undefined ? '' : scale.unit,
    }));
    const row = statsRow(this.head.ruler, width, stats);
    const fitted = this.head.fit({
      width,
      title: name,
      sub: this.config?.subtitle ?? view.areaName,
      badge: { text: badgeText, tone: headTone },
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
        tone: headTone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
        name: true,
      })}
      ${
        this.bar
          ? html`<div class="so-top fv-value-row">
                ${readout({ label: this.innerLabel(view), value: value === null ? '—' : shown(value), unit: value === null ? '' : scale.unit, size: 'l' })}
              </div>
              <div class="so-level">
                <span class="fv-bar"
                  ><span
                    class="fv-bar__fill fv-bar--${unusable || !active ? 'neutral' : tone}"
                    data-measure="value"
                    style="width:${value === null || max === null ? 0 : Math.round(Math.min(1, Math.max(0, (value - min) / (max - min))) * 100)}%"
                  ></span
                ></span>
              </div>
              ${rulerLabels([
                [0, edge(min)],
                [1, max === null ? '—' : edge(max)],
              ])}`
          : html`<div class="so-gauge">
              <fluvy-dial
                gauge
                style="margin-left:${inset}px"
                .radius=${radius}
                .tick=${TICK}
                .large=${true}
                .stepper=${false}
                .tone=${unusable ? 'neutral' : tone}
                .min=${min}
                .max=${max ?? min + 1}
                .fill=${value === null || max === null ? 0 : (value - min) / (max - min)}
                .value=${value ?? undefined}
                .unit=${value === null ? '' : scale.unit}
                .label=${this.innerLabel(view)}
                .text=${value === null ? '—' : undefined}
                .minLabel=${edge(min)}
                .maxLabel=${max === null ? '—' : edge(max)}
                ?disabled=${value === null}
                .format=${shown}
              ></fluvy-dial>
            </div>`
      }
      <div
        class="so-cols fv-cols so-cols--center ${row.odd ? 'fv-cols--odd' : ''}"
        style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
        data-align="center"
      >
        ${stats.map((stat) => readout({ ...stat, size: row.size }))}
      </div>
    </article>`;
  }

  /* ---------- signed ---------- */

  /**
   * The signed ring's ends in the base unit: `max` from the config, the entity's own, a companion entity, or the
   * window's largest swing either way rounded up; `min` from the config, else `-max`. Null while that window loads.
   */
  private extent(
    view: EntityView,
    factor: number,
    value: number | null,
  ): { min: number; max: number } | null {
    const positive = (v: unknown): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0;
    const configured = this.config?.max;
    const own = view.attr<number | null>('max');
    const rated = this.config?.max_entity ? baseOf(this.entity(this.config.max_entity)) : null;
    let max: number | null = positive(configured)
      ? configured * factor
      : positive(own)
        ? own * factor
        : rated && positive(rated.value)
          ? rated.value
          : null;
    if (max === null) {
      if (this.series_ === undefined) return null;
      const swing = Math.max(
        Math.abs((this.series_?.min ?? 0) * factor),
        Math.abs((this.series_?.max ?? 0) * factor),
        Math.abs(value ?? 0),
      );
      if (!(swing > 0)) return null;
      max = ceilingFor(swing);
    }
    const min = this.config?.min;
    return { min: typeof min === 'number' && min < 0 ? min * factor : -max, max };
  }

  /**
   * A value that can be negative, on a ring with zero at the top: lit from zero to the value in the card's tone (the
   * grid's by default: a meter cannot know where its energy came from); a power meter says its direction in the unit
   * slot ("1.8 kW out"), any other unit its sign.
   */
  private renderSigned(view: EntityView, name: string): TemplateResult {
    const unusable = !isUsable(view);
    const base = toBase(1, view.unit);
    const value = view.number === null || unusable ? null : view.number * base.value;
    // a meter that is not there has no unit to say what it is: it is laid out as the grid meter this gauge is for
    const power = base.unit === 'W' || view.status === 'missing';
    const ends = this.extent(view, base.value, value);
    const series = this.series_;
    const scale: Scale = scaleFor(
      Math.max(
        Math.abs(ends?.min ?? 0),
        Math.abs(ends?.max ?? 0),
        Math.abs(value ?? 0),
        Math.abs((series?.min ?? 0) * base.value),
        Math.abs((series?.max ?? 0) * base.value),
      ),
      base.unit,
    );
    const precision =
      scale.divisor === 1 ? this.hass?.entities?.[view.id]?.display_precision : undefined;
    const way = (v: number): string =>
      v > 0 ? ways(this.hass, 'way_in') : v < 0 ? ways(this.hass, 'way_out') : '';
    // one precision for the value and its min / max / average — the entity's own, else the largest figure's — so
    // "1.0 kW out" stands beside "2.2 kW out" and "−0.9 °C" beside "−4.2 °C"
    const largest = Math.max(
      0,
      ...[
        value,
        ...[series?.min, series?.max, series?.average].map((v) =>
          typeof v === 'number' ? v * base.value : null,
        ),
      ]
        .filter((v): v is number => typeof v === 'number')
        .map((v) => Math.abs(v) / scale.divisor),
    );
    const digits = precision ?? (largest >= 100 ? 0 : largest >= 1 ? 1 : 2);
    // a power meter: the magnitude, its direction after the unit (`ways`); anything else: the signed figure
    const said = (v: number | null, ways: boolean): { value: string; unit: string } => {
      if (v === null) return { value: '—', unit: '' };
      if (!ways) return { value: figure(this.hass, v, scale, digits), unit: scale.unit };
      const direction = way(v);
      return {
        value: figure(this.hass, Math.abs(v), scale, digits),
        unit: direction ? `${scale.unit} ${direction}` : scale.unit,
      };
    };
    const edgeDigits =
      ends &&
      Number.isInteger(ends.min / scale.divisor) &&
      Number.isInteger(ends.max / scale.divisor)
        ? 0
        : 1;
    const edge = (v: number, ways: boolean): string => {
      const shown = formatNumber(this.hass, (ways ? Math.abs(v) : v) / scale.divisor, {
        digits: edgeDigits,
        minDigits: edgeDigits,
      }).replace(/^-/, '−');
      return [shown, scale.unit, ways ? way(v) : ''].filter(Boolean).join(' ');
    };

    const fraction = value === null || !ends ? null : fractionOf(value, ends.min, ends.max);
    const active = fraction !== null && Math.abs(fraction) > IDLE;
    const tone: Tone = toneOf(this.config, 'grid');
    const headTone: Tone = unusable ? 'off' : active ? tone : 'neutral';
    // "Importing" / "Exporting" say a power's way; any other signed value (a temperature) has no state to name:
    // only a badge the card is given shows
    const badgeText =
      unusable || value === null
        ? stateWord(this.hass, view)
        : (this.config?.badge ??
          (!power
            ? ''
            : !active
              ? this.t('energy.idle')
              : value > 0
                ? this.t('energy.importing')
                : this.t('energy.exporting')));

    const width = this.contentWidth;
    const r = this.head.ruler;
    const statWidth = (stat: { value: string; unit: string }): number =>
      r.width('fv-readout fv-readout--xs > fv-readout__value', stat.value, 'fv-unit', stat.unit);
    // the gauge with its power's directions in words, or signed: everything in one way, the needle saying which
    const lay = (ways: boolean) => {
      const [left, right] = ends ? [edge(ends.min, ways), edge(ends.max, ways)] : ['—', '—'];
      // a range nobody can name (the meter away, its window not read yet) reads "—" at its ends, and the ring is laid
      // out for a household's, a 5 kW connection ("5 kW out", its wider end): it keeps its size while the meter is away
      const leftW = r.width('en-gauge__end', ends ? left : `5 kW ${way(-1)}`);
      const rightW = r.width('en-gauge__end', right);
      const g = signedGeometry(width, Math.max(leftW, rightW));
      const shown = said(value, ways);
      const fits = (size: ValueSize): boolean =>
        r.width(
          size === 'l' ? 'en-gauge__value' : 'en-gauge__value en-gauge__value--m',
          shown.value,
          'en-gauge__unit',
          shown.unit,
        ) <= valueRoom(g, size);
      const stats = (
        [
          ['common.min', series?.min],
          ['common.max', series?.max],
          ['common.average', series?.average],
        ] as const
      ).map(([name, raw]) => ({
        label: this.t(name),
        ...said(raw === undefined ? null : raw * base.value, ways),
      }));
      // the words hold while the value fits its ring, the two ends their line and every statistic the column
      const holds =
        fits('m') && leftW + 8 + rightW <= width && stats.every((stat) => statWidth(stat) <= width);
      return { left, right, g, shown, size: (fits('l') ? 'l' : 'm') as ValueSize, stats, holds };
    };
    const worded = lay(power);
    const { left, right, g, shown, size, stats } = worded.holds ? worded : lay(false);
    const box = valueBox(g, size);
    const label = this.innerLabel(view);
    const room = labelRoom(g, size);
    const labelFits = r.width('en-gauge__label', label) <= room;

    // the directions make the figures long: as many columns as hold them and their labels, two and one before one a line
    const row = statsRow(this.head.ruler, width, stats);
    const fitted = this.head.fit({
      width,
      title: name,
      sub: this.config?.subtitle ?? view.areaName,
      badge: badgeText ? { text: badgeText, tone: headTone } : null,
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
        tone: headTone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
        name: true,
      })}
      <div class="en-gauge fv-tone--${tone}" style="height:${g.height}px">
        <svg
          width=${width}
          height=${g.height}
          viewBox="0 0 ${width} ${g.height}"
          aria-hidden="true"
        >
          ${ticksOf(g, unusable ? null : fraction).map(
            (t) =>
              svg`<line x1=${t.x1.toFixed(1)} y1=${t.y1.toFixed(1)} x2=${t.x2.toFixed(1)} y2=${t.y2.toFixed(1)} class="en-tick ${t.lit ? 'is-lit' : ''}"></line>`,
          )}
        </svg>
        <span class="en-gauge__zero" data-align="center" style="top:0">0</span>
        ${
          // a label someone wrote is a name and may end in an ellipsis; Home Assistant's own word ("Temperature") is
          // never cut: it leaves the ring when it does not fit
          labelFits || this.config?.label !== undefined
            ? html`<span
                class="en-gauge__label"
                data-align="center"
                data-name=${labelFits ? nothing : ''}
                style=${labelFits ? `top:${box.label}px` : `top:${box.label}px;left:${g.cx - room / 2}px;width:${room}px`}
                >${label}</span
              >`
            : nothing
        }
        <span
          class="en-gauge__value ${size === 'm' ? 'en-gauge__value--m' : ''}"
          data-align="center"
          style="top:${box.value}px"
          >${shown.value}${shown.unit ? html`<span class="en-gauge__unit">${shown.unit}</span>` : nothing}</span
        >
        <span class="en-gauge__end" style="left:${g.endsLeft}px;top:${g.endsTop}px">${left}</span>
        <span class="en-gauge__end" style="right:${g.endsRight}px;top:${g.endsTop}px"
          >${right}</span
        >
      </div>
      <div
        class="so-cols fv-cols so-cols--center ${row.odd ? 'fv-cols--odd' : ''}"
        style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
        data-align="center"
      >
        ${stats.map((stat) => readout({ ...stat, size: row.size }))}
      </div>
    </article>`;
  }
}
