import {
  stateText,
  strings as words,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { head, listRow, sheetStyles, type IconRef, type Tone } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { repeat } from 'lit/directives/repeat.js';

import { HeadFit } from '../energy/head.js';
import type { Segment } from '../shared/fit.js';

import { baseOf, figureText, scaleFor } from '../gauge/units.js';

import { Card, type BaseKey } from '../shared/base.js';

import {
  accentField,
  actionFields,
  colourFields,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  idsOnly,
  numberField,
  selectField,
  showIconField,
  textField,
  titleFields,
  toneField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { glyphFor } from '../shared/domain.js';
import { EMPTY, entryCount, HEAD, ROW } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';

const strings = words('distribution');

export interface DistributionEntityConfig {
  entity: string;
  name?: string;
  tone?: Tone;
  color?: string;
}

/** `entities` holds the power sensors: ids, or `{ entity, name, tone }` objects where YAML wants a name or a tone per segment. */
export interface DistributionCardConfig extends FluvyCardConfig, EmptyList {
  title?: string;
  subtitle?: string;
  /** Rows the legend shows; when there are more, the smallest are summed into one neutral "Other". */
  max_rows?: number;
  /** `stack` (default): one bar of shares and a legend. `rows`: a 60 px row per source, its share under its name. */
  variant?: 'stack' | 'rows';
  /** The whole's own meter (the house's): what the sources do not account for is shown as "Not measured". */
  total?: string;
}

interface Part {
  readonly key: string;
  readonly label: string;
  /** Base-unit value; null when the entity has no usable number. */
  readonly value: number | null;
  readonly tone: Tone;
  /** The source's own colour, as `AccentSheet` reads it; none for "Other". */
  readonly accent: string | undefined;
  readonly glyph: IconRef | string;
  /** The source's entity; \"Other\" has none. */
  readonly entity?: string;
}

/** The order segments take their tone in when the config does not name one. */
const CYCLE: readonly Tone[] = ['heat', 'accent', 'media', 'water', 'grid'];
/** A segment thinner than this share of the bar would be a sliver between two gaps: the legend still lists it. */
const SLIVER = 0.005;

/**
 * What is drawing right now as one stacked bar and its legend: a segment per entity in the order
 * they are configured, the smallest gathered into "Other" when there are too many. Every figure is
 * set in the same unit, so the legend reads as one column.
 */
export class FluvyDistributionCard extends Card<DistributionCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: DistributionCardConfig): number {
    const n = Math.min(entryCount(config, ['entities']), 5);
    if (!n) return HEAD + EMPTY;
    // what the total leaves unmeasured is one more legend row
    const rest = config.total ? 1 : 0;
    return config.variant === 'rows' ? HEAD + ROW * (n + rest) : 124 + 36 * (n + rest);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      /* nothing is drawing (or nothing can be read): the bar stays as a quiet empty track instead of vanishing */
      .fv-stack.is-empty {
        background: var(--fluvy-page-alt);
      }
      /* a long name gives way, the value never does */
      .fv-legend__name {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .fv-legend__value {
        flex: 0 0 auto;
        white-space: nowrap;
      }
    `,
  ];

  private readonly head = new HeadFit(this);

  /** A share of many sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<DistributionCardConfig>()([
    'title',
    'subtitle',
    'max_rows',
    'variant',
    'total',
    ...EMPTY_KEYS,
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'entities',
      title: 'editor.entities',
      domains: ['sensor'],
      keys: ['entity', 'name', 'tone', 'color'],
      schema: [entityField(['sensor']), textField('name'), fieldRow(toneField(), accentField())],
    },
  ];
  static override aliases: AliasSpec = { items: { entities: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'stack' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), showIconField()),
        ...colourFields(),
        entitiesField('entities', ['sensor'], true),
        fieldRow(numberField('max_rows', 2, 10), selectField('variant', ['stack', 'rows'])),
        entityField(['sensor'], 'total', false),
        emptyFields(),
        actionFields(),
      ],
      ...idsOnly('entities'),
      ...editorLabels(strings, { max_rows: 'max_rows', total: 'editor_total' }, {}),
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): DistributionCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    const power = sensors.filter((id) => hass?.states?.[id]?.attributes.device_class === 'power');
    return {
      type: 'custom:fluvy-distribution-card',
      entities: (power.length ? power : sensors).slice(0, 4),
    };
  }

  private sources(): DistributionEntityConfig[] {
    return itemsOf(this.config?.entities);
  }

  private get limit(): number {
    const rows = this.config?.max_rows;
    return typeof rows === 'number' && rows >= 2 ? Math.floor(rows) : 5;
  }

  protected override prepare(config: DistributionCardConfig): DistributionCardConfig {
    listOf(config, 'entities');
    return config;
  }

  override getCardSize(): number {
    return 2 + Math.min(this.sources().length, this.limit);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    const total = this.config?.total;
    return [...this.sources().map((row) => row.entity), ...(total ? [total] : [])];
  }

  /** The legend's rows: everything when it fits, otherwise the largest in their configured order and one "Other". */
  private parts(
    sources: readonly DistributionEntityConfig[],
    views: readonly EntityView[],
    unit: string,
  ): Part[] {
    const values = views.map((view) => {
      const quantity = view.status === 'ok' ? baseOf(view) : null;
      return quantity && quantity.unit === unit ? Math.max(0, quantity.value) : null;
    });
    const limit = this.limit;
    const kept = new Set(
      sources.length > limit
        ? values
            .map((value, index) => ({ value: value ?? -1, index }))
            .sort((a, b) => b.value - a.value || a.index - b.index)
            .slice(0, limit - 1)
            .map((entry) => entry.index)
        : values.keys(),
    );

    const parts: Part[] = [];
    let cursor = 0;
    sources.forEach((source, index) => {
      if (!kept.has(index)) return;
      const next = sources
        .slice(index + 1)
        .find((_later, offset) => kept.has(index + 1 + offset))?.tone;
      let tone = source.tone ?? (source.color ? 'accent' : undefined);
      while (!tone) {
        // never two equal neighbours, whatever the config pinned on either side
        const candidate = CYCLE[cursor++ % CYCLE.length] as Tone;
        if (candidate !== parts[parts.length - 1]?.tone && candidate !== next) tone = candidate;
      }
      parts.push({
        key: source.entity,
        label: source.name ?? (views[index] as EntityView).name,
        value: values[index] ?? null,
        tone,
        accent: this.accents.item(source.color),
        glyph: glyphFor(views[index] as EntityView),
        entity: source.entity,
      });
    });
    // the whole's own meter: what no source accounts for, when every source reads and it is more than a sliver
    const whole = this.config?.total ? this.entity(this.config.total) : undefined;
    const wholeValue = whole?.status === 'ok' ? baseOf(whole) : null;
    let unmeasured: Part | undefined;
    if (wholeValue && wholeValue.unit === unit && values.every((value) => value !== null)) {
      const rest = wholeValue.value - values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      if (rest > wholeValue.value * SLIVER)
        unmeasured = {
          key: '__unmeasured',
          label: strings(this.hass, 'not_measured'),
          value: rest,
          tone: 'neutral',
          accent: undefined,
          glyph: 'dots',
        };
    }
    if (kept.size < sources.length) {
      const rest = values.filter((_value, index) => !kept.has(index));
      parts.push({
        key: '__other',
        label: strings(this.hass, 'other'),
        value: rest.some((value) => value !== null)
          ? rest.reduce<number>((total, value) => total + (value ?? 0), 0)
          : null,
        tone: 'neutral',
        accent: undefined,
        glyph: 'plug',
      });
    }
    if (unmeasured) parts.push(unmeasured);
    return parts;
  }

  protected renderCard(): TemplateResult {
    const sources = this.sources();
    const views = sources.map((row) => this.entity(row.entity));
    const unit = views
      .map((view) => (view.status === 'ok' ? baseOf(view)?.unit : undefined))
      .find((found) => found !== undefined);
    const panel = emptyPanel(this, !sources.length, 'plug', 'common.no_sensors');
    // nothing that reads is a card gone; nothing listed is only an empty one, its panel where the rows would be
    const dead = !panel && unit === undefined;
    const tone: Tone = dead ? 'off' : toneOf(this.config, 'accent');
    const asRows = Boolean(panel) || this.config?.variant === 'rows';

    const parts = panel ? [] : this.parts(sources, views, unit ?? '');
    const total = parts.reduce((count, part) => count + (part.value ?? 0), 0);
    const scale = scaleFor(total, unit ?? '');
    const text = (value: number | null): string =>
      value === null ? '—' : figureText(this.hass, value, scale);
    const segments = parts.filter(
      (part) => part.value !== null && total > 0 && part.value / total >= SLIVER,
    );
    const title = this.config?.title ?? strings(this.hass, 'distribution');
    // a row's share: "36 % of total", or "36 %" alone where the words would be cut beside its figure
    const share = (part: Part): Segment | null => {
      if (part.value === null || total <= 0) return null;
      const percent = Math.round((part.value / total) * 100);
      return {
        text: strings(this.hass, 'share_of_total', { percent }),
        short: strings(this.hass, 'share', { percent }),
      };
    };
    // a column too narrow for a name and its share beside its figure gives every row's circle to the words, as every
    // list does
    const keep =
      !asRows ||
      this.head.rowsKeepIcon(
        this.contentWidth,
        parts.map((part) => ({
          title: part.label,
          value: text(part.value),
          sub: share(part)?.short ?? '',
        })),
      );
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub: this.config?.subtitle ?? this.t('energy.drawing_now'),
      badge: panel
        ? null
        : { text: dead ? stateText(this.hass, views[0] as EntityView) : text(total), tone },
    });

    return html`<article class="fv-card so-card ${dead ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'plug') : null,
        tone,
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        asRows
          ? html`<div class="so-rows">
              ${panel}
              ${repeat(
                parts,
                (part) => part.key,
                (part) => {
                  const segment = share(part);
                  const room = this.head.rowRoom(this.contentWidth, text(part.value), {
                    icon: keep,
                  });
                  return listRow({
                    icon: keep ? part.glyph : null,
                    tone: part.value === null ? 'off' : part.tone,
                    accent: part.accent,
                    title: part.label,
                    name: true,
                    sub: segment ? this.head.fitRowSegments([segment], room) : '',
                    trailing: 'value',
                    value: text(part.value),
                    unavailable: part.value === null,
                    ...(part.entity ? { onTap: () => this.tap(part.entity) } : {}),
                  });
                },
              )}
            </div>`
          : html`<div class="fv-stack ${segments.length ? '' : 'is-empty'}">
                ${repeat(
                  segments,
                  (part) => part.key,
                  (part) =>
                    html`<span
                      class="fv-stack__seg fv-bar--${part.tone}"
                      data-accent=${part.accent ?? nothing}
                      data-measure="value"
                      style="width:${(((part.value ?? 0) / total) * 100).toFixed(2)}%"
                    ></span>`,
                )}
              </div>
              <div class="fv-legend">
                ${repeat(
                  parts,
                  (part) => part.key,
                  (part) =>
                    html`<div class="fv-legend__row" data-accent=${part.accent ?? nothing}>
                      <i class="fv-swatch fv-bar--${part.tone}"></i
                      ><span class="fv-legend__name">${part.label}</span
                      ><span class="fv-legend__value">${text(part.value)}</span>
                    </div>`,
                )}
              </div>`
      }
    </article>`;
  }
}
