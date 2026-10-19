import {
  formatNumber,
  isUsable,
  stateText,
  valueParts,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head, readout, sheetStyles } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { HeadFit } from '../energy/head.js';
import { Card, HEAD_BASE } from '../shared/base.js';
import { glyphFor } from '../shared/domain.js';
import {
  actionFields,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  numberField,
  showIconField,
  textField,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import {
  fraction,
  placeLabels,
  validateScale,
  type SensorBand,
  type SensorReference,
} from './model.js';

export interface SensorBandCardConfig extends FluvyCardConfig {
  subtitle?: string;
  /** Optional label above the current reading. */
  label?: string;
  /** Fixed scale, in the entity's displayed unit (0–100 by default). */
  min?: number;
  max?: number;
  /** Ordered non-overlapping ranges, using Fluvy's palette tones. */
  bands?: readonly SensorBand[];
  /** Exact numeric markers with optional captions. These are visual references, not alarms. */
  references?: readonly SensorReference[];
}

/** A live numeric reading on Fluvy's native ruler, with reusable reference bands and captions. */
export class FluvySensorBandCard extends Card<SensorBandCardConfig> {
  static override base = HEAD_BASE;
  static override keys = configKeys<SensorBandCardConfig>()([
    'subtitle',
    'label',
    'min',
    'max',
    'bands',
    'references',
  ]);
  private readonly head = new HeadFit(this);

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      .so-band fluvy-ruler {
        display: block;
        position: relative;
        --knob-halo: transparent;
      }
      .so-band__zone {
        background: var(--tone-fill);
        box-shadow: inset 0 0 0 1px var(--tone-border);
      }
      .sb-reference {
        position: absolute;
        top: 2px;
        height: 40px;
        width: 0;
        border-left: 1px dashed var(--fluvy-text-secondary);
        pointer-events: none;
      }
      .sb-labels {
        position: relative;
        margin-top: 4px;
        color: var(--fluvy-text-secondary);
        font-size: 12px;
        line-height: 16px;
        direction: ltr;
      }
      .sb-labels span {
        position: absolute;
        overflow-wrap: anywhere;
      }
    `,
  ];

  static override layoutHeight(): number {
    return 236;
  }
  static override getConfigForm(): LovelaceConfigForm {
    const shared = formLabels();
    const labels: Record<string, string> = {
      label: 'Reading label',
      bands: 'Colour bands (from, to, tone)',
      references: 'Reference markers (value, label)',
    };
    return {
      schema: [
        entityField(['sensor', 'number', 'input_number', 'counter']),
        fieldRow(textField('name'), textField('subtitle')),
        fieldRow(iconField(), showIconField()),
        ...colourFields(),
        textField('label'),
        fieldRow(numberField('min', -1e9, 1e9, 0.01), numberField('max', -1e9, 1e9, 0.01)),
        { name: 'bands', selector: { object: {} } },
        { name: 'references', selector: { object: {} } },
        actionFields(),
      ],
      computeLabel: (field, localize) => labels[field.name] ?? shared.computeLabel(field, localize),
    };
  }
  static getStubConfig(_hass: unknown, entities: readonly string[]): SensorBandCardConfig {
    return {
      type: 'custom:fluvy-sensor-band-card',
      entity: entities.find((id) => id.startsWith('sensor.')) ?? '',
      min: 0,
      max: 100,
    };
  }
  protected override prepare(config: SensorBandCardConfig): SensorBandCardConfig {
    if (!config.entity) throw new Error('fluvy-sensor-band-card: "entity" is required');
    validateScale(config);
    return config;
  }
  override getCardSize(): number {
    return 5;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }
  protected override watched(): readonly string[] {
    return [this.config?.entity ?? ''];
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const config = this.config!;
    const name = config.name ?? view.name;
    const value = isUsable(view) ? view.number : null;
    const min = config.min ?? 0;
    const max = config.max ?? 100;
    const width = this.contentWidth;
    const bands = config.bands ?? [];
    const refs = config.references ?? [];
    const active =
      value === null
        ? undefined
        : bands.find(
            (band, index) =>
              value >= band.from &&
              (value < band.to || (index === bands.length - 1 && value === band.to)),
          );
    const tone = value === null ? 'neutral' : toneOf(config, active?.tone ?? 'water');
    const fitted = this.head.fit({
      width,
      title: name,
      sub: config.subtitle ?? view.areaName,
      badge: value === null ? { text: stateText(this.hass, view), tone: 'off' } : null,
    });
    const parts = valueParts(this.hass, view);
    const format = (raw: number): string => formatNumber(this.hass, raw, { digits: 2 });
    const items = [
      ...(refs.some((ref) => ref.value === min) ? [] : [{ value: min, label: format(min) }]),
      ...refs,
      ...(refs.some((ref) => ref.value === max) ? [] : [{ value: max, label: format(max) }]),
    ];
    const labels = placeLabels(
      items.map((item) => {
        const text = item.label ?? format(item.value);
        return {
          fraction: fraction(item.value, min, max),
          text,
          width: Math.max(text.length * 6, this.head.ruler.width('fv-ruler-labels', text)) + 4,
        };
      }),
      width,
    );
    const height =
      16 * (1 + Math.max(0, ...labels.map((item) => item.lane))) +
      Math.max(
        0,
        ...labels.map((item) => Math.ceil((item.text.length * 6) / Math.max(1, item.width)) - 1),
      ) *
        16;
    return html`<article
      class="fv-card so-card ${value === null ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({ icon: fitted.icon ? (config.icon ?? glyphFor(view)) : null, tone, title: name, sub: fitted.sub, trailing: fitted.badge, cut: fitted.cut, ...this.headActions(view.id), name: true })}
      <div class="so-top fv-value-row">
        ${readout({ label: config.label ?? '', value: value === null ? '—' : parts.value, unit: value === null ? '' : parts.unit, size: 'l' })}
      </div>
      <div class="so-band">
        ${bands.map((band) => html`<span class="so-band__zone fv-tone--${band.tone}" aria-hidden="true" style="left:${fraction(band.from, min, max) * width}px;width:${(fraction(band.to, min, max) - fraction(band.from, min, max)) * width}px"></span>`)}
        <fluvy-ruler
          marker
          ?dark=${this.dark}
          .value=${value ?? min}
          .min=${min}
          .max=${max}
          .step=${(max - min) / 1000}
          .length=${width}
          .knob=${36}
          .tone=${tone}
          ?inactive=${value === null}
          aria-hidden=${value === null ? 'true' : nothing}
          unit=${view.unit}
          .label=${name}
          .format=${format}
        ></fluvy-ruler>
        ${refs.map((ref) => html`<span class="sb-reference" aria-hidden="true" style="left:${fraction(ref.value, min, max) * width}px"></span>`)}
      </div>
      <div class="sb-labels" style="height:${height}px">
        ${labels.map((item) => html`<span style="left:${item.left}px;top:${item.lane * 16}px;width:${item.width}px">${item.text}</span>`)}
      </div>
    </article>`;
  }
}
