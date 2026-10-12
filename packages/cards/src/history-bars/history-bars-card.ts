import { historyBarsHeight } from '../energy-family.js';
import {
  dateFormat,
  formatNumber,
  houseZone,
  isUsable,
  stateText,
  strings as words,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';

import {
  bars,
  head,
  ico,
  icon,
  readout,
  scrub,
  ScrubController,
  sheetStyles,
  type IconRef,
  type Tone,
} from '@fluvy/ui';

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
import { currencySymbol } from '../energy-model/costs.js';
import { PERIODS, type Period } from '../energy-model/period.js';
import { scaleFor, toBase, type Scale } from '../gauge/units.js';
import { Card } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  editorWord,
  entityField,
  fieldRow,
  iconField,
  numberField,
  selectField,
  textField,
  type FormLabeler,
} from '../shared/form.js';
import { TextRuler } from '../shared/fit.js';
import { statsColumns, statsSize, type StatText } from '../shared/readouts.js';
import { Refresher } from '../shared/refresh.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { TemplateTexts } from '../shared/templates.js';
import {
  CAPS,
  defaultStat,
  fetchBars,
  STATS,
  type BarsRecord,
  type Bucket,
  type Stat,
} from './buckets.js';
import {
  DEFAULT_FACTS,
  defaultHead,
  FACT_FIELDS,
  FACT_ICONS,
  FACT_KEYS,
  FACTORS,
  factFigure,
  factSchema,
  factsOf,
  KIND_PICKER,
  READOUT_FIELDS,
  READOUT_KEYS,
  readoutSchema,
  summarise,
  type FactContext,
  type FactItem,
  type FactKind,
  type Summary,
} from './facts.js';
import {
  barGeometry,
  barPath,
  labelled,
  labelsApart,
  niceTicks,
  thinStep,
  type Placed,
} from './scale.js';

const strings = words('history-bars');

export type DateStyle = 'date' | 'weekday' | 'short';
export type BarsVariant = 'full' | 'compact' | 'mini';

export interface HistoryBarsCardConfig extends FluvyCardConfig {
  /** Under the name; empty, "Last 7 days". */
  subtitle?: string;
  /** How many bars (days, weeks or months by `period`): 1–92, 7 by default. */
  days?: number;
  /** What a bar is: a day (default), a week or a month. */
  period?: Period;
  /** What a bar shows: what the meter gained (`change`, a meter's default), the mean (a measurement's), the highest or the lowest reading. */
  stat?: Stat;
  /** The bucket in progress (today, this week, this month) as the last bar; off by default, so the bars are finished ones. */
  include_today?: boolean;
  /** Decimals of the figures, 1 by default. */
  decimals?: number;
  /** The unit asked of the recorder and shown (energy and power convert; anything else is the sensor's own). */
  unit?: string;
  /** `full` (default): the head, its readouts, the chart and the facts. `compact`: the head, its readouts and the bars with their dates. `mini`: the head and one row of readouts and a sparkline. */
  variant?: BarsVariant;
  show_head?: boolean;
  show_values?: boolean;
  show_axis?: boolean;
  show_grid?: boolean;
  show_dates?: boolean;
  show_facts?: boolean;
  /** How a bar's date reads: "Oct 03", "Fri", or "3". */
  date_format?: DateStyle;
  /** The readouts beside the title, in order; empty, the total and the average (a measurement's average and highest). */
  head?: ReadonlyArray<FactKind | FactItem>;
  /** The facts under the chart, in order; empty, the highest, the lowest and the average. */
  facts?: ReadonlyArray<FactKind | FactItem>;
  /** kg of CO₂ a kWh of grid power costs, 0.4 by default: what the CO₂ and the trees are worked out with. */
  co2_factor?: number;
  /** The price per unit: what the money is worked out with. */
  price?: number;
  /** Test hook, as in the clock cards: an ISO instant the card takes for "now". */
  _now?: string;
}

/* the chart's geometry: the plot, the room above it for the values (or a headroom alone), the dates under it */
const PLOT = 120;
const PLOT_COMPACT = 80;
const VALUES = 20;
const HEADROOM = 4;
const DATES = 24;
/** The rotated unit's column beside the scale, and the gap between the tick labels and the plot. */
const UNIT_COLUMN = 16;
const AXIS_GAP = 8;
/** Between the head's readouts: a 1 px divider with 16 each side. */
const DIVIDER = 33;
/** The strip's padding, the gap between its cells (a divider in the middle of it) and between its rows. */
const STRIP_PAD = 16;
const CELL_GAP = 24;
/** A fact's circle and the gap after it; the glyph alone and its gap, in the one-column fallback. */
const CIRCLE = 44 + 12;
const GLYPH = 20 + 12;
/** The least content width at which the readouts may sit in the head beside the title (narrower, they take their own row). */
const READOUTS_IN_HEAD = 440;
/** The mini row's sparkline: at least this wide, else a readout gives way, then the sparkline itself. */
const SPARK_MIN = 80;
const HOUR = 3_600_000;
const SCALABLE = /^(m|k|M|G)?(Wh|W|VA)$/;

/** A fact as the card says it: its words and figure, its circle, what a tap does. */
interface FactCell extends StatText {
  readonly item: FactItem;
  readonly icon: IconRef | string;
  readonly tone: Tone;
  readonly accent: string | undefined;
  readonly entity: string | undefined;
}

/** What the render laid the bars out with, for the pointer's snapping. */
interface Plot {
  readonly inset: number;
  readonly slot: number;
  readonly count: number;
}

let gradients = 0;

/** The words of a fact's own fields; the shared item words name the rest. */
const OWN_LABELS: Readonly<Record<string, MessageKey>> = {
  kind: 'history-bars.editor_kind',
  unit: 'history-bars.editor_unit',
  decimals: 'history-bars.editor_decimals',
  factor: 'history-bars.editor_factor',
  of: 'history-bars.editor_of',
  template: 'history-bars.editor_template',
};
const listLabels: FormLabeler = (schema) => {
  const key = OWN_LABELS[schema.name];
  return key ? editorWord(key) : undefined;
};

/** What is said under a fact's factor, and under its template. */
const listHelpers: FormLabeler = (schema) =>
  schema.name === 'factor'
    ? editorWord('history-bars.editor_factor_help')
    : schema.name === 'template'
      ? editorWord('editor.template_helper')
      : undefined;

/**
 * A sensor's history as bars: its last days, weeks or months from Home Assistant's long-term statistics, each bar
 * with its value above it on a nice scale, the total and the average in the head, and a strip of facts under the
 * chart — the honest numbers of the bars, or what they come to in CO₂, trees, kilometres and money when asked.
 * Every part is the person's: the readouts and the facts are lists composed in order, each with its own name, icon,
 * colour, unit and tap; the values, the scale, the gridlines, the dates and the strip each switch off.
 */
export class FluvyHistoryBarsCard extends Card<HistoryBarsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: HistoryBarsCardConfig): number {
    return historyBarsHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    css`
      /* the readouts: beside the title (right-aligned, a divider between them), or on their own row under the head */
      .hb-readouts {
        display: flex;
        align-items: flex-start;
        flex: 0 0 auto;
        min-width: 0;
      }
      .hb-readouts--head {
        text-align: right;
      }
      .hb-readouts--head .fv-readout__value {
        justify-content: flex-end;
      }
      /* on their own row the readouts share it in equal columns, each centred in its cell (the readout rows' rule),
         the divider on the cells' edge */
      .hb-readouts--row,
      .hb-readouts--first {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        text-align: center;
        height: 44px;
      }
      .hb-readouts--row {
        margin-top: 16px;
      }
      .hb-readouts--row .fv-readout__value,
      .hb-readouts--first .fv-readout__value {
        justify-content: center;
      }
      .hb-readouts--row > .hb-readout + .hb-readout,
      .hb-readouts--first > .hb-readout + .hb-readout {
        margin-left: 0;
        padding-left: 0;
      }
      /* the divider between readouts is drawn, not a box of its own: a hairline down the gap */
      .hb-readouts > .hb-readout + .hb-readout {
        margin-left: 16px;
        padding-left: 16px;
      }
      .hb-readouts > .hb-readout + .hb-readout::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 1px;
        background: var(--fluvy-border);
      }
      .hb-readout {
        position: relative;
        min-width: 0;
      }
      .hb-readout .fv-readout__label,
      .hb-readout .fv-readout__value {
        white-space: nowrap;
      }
      .hb-readout--tap {
        cursor: pointer;
        border-radius: var(--fluvy-radius-md);
      }
      .hb-readout--tap:active {
        opacity: 0.7;
      }
      /* the readouts folded into equal columns where even their own row would not hold them in a line */
      .hb-cols {
        display: grid;
        column-gap: 16px;
        margin-top: 16px;
      }
      .hb-cols .fv-readout__label {
        white-space: nowrap;
      }
      .hb-cols--odd > :last-child {
        grid-column: 1 / -1;
      }
      /* the chart: the card's tone is the bars' ink */
      .hb-chart {
        --ink: var(--tone-ink, var(--fluvy-accent));
        position: relative;
        margin-top: 20px;
        touch-action: pan-y;
        outline: none;
      }
      .hb-chart:focus-visible {
        border-radius: var(--fluvy-radius-md);
        box-shadow: 0 0 0 2px var(--fluvy-accent);
      }
      .hb-chart > svg {
        display: block;
        overflow: visible;
      }
      .hb-bar {
        fill: var(--hb-fill);
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: fv-grow-y 560ms var(--fv-ease-out) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + var(--bar-delay, 0ms));
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .hb-bar.is-negative {
        transform-origin: 50% 0;
      }
      .hb-bar.is-empty {
        fill: var(--ink);
        opacity: 0.25;
        animation: none;
      }
      .hb-chart.is-scrub .hb-bar:not(.is-hover) {
        opacity: 0.4;
      }
      .hb-chart.is-scrub .hb-bar.is-empty:not(.is-hover) {
        opacity: 0.1;
      }
      .hb-grid {
        stroke: var(--fluvy-border);
        stroke-width: 1;
        stroke-dasharray: 3 3;
      }
      .hb-tick,
      .hb-unit {
        font-size: 11px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text-disabled);
        color: var(--fluvy-text-disabled);
        font-variant-numeric: tabular-nums;
      }
      .hb-date {
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text-secondary);
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .hb-value {
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        fill: var(--fluvy-text);
        color: var(--fluvy-text);
        font-variant-numeric: tabular-nums;
      }
      .hb-skeleton {
        margin-top: 20px;
      }
      .hb-empty {
        margin-top: 20px;
      }
      /* a chart with nothing above it (no head, no readouts) starts at the card's padding */
      .fv-card > .hb-chart:first-child,
      .fv-card > .hb-skeleton:first-child,
      .fv-card > .hb-empty:first-child {
        margin-top: 0;
      }
      /* the facts strip: a page-filled panel, its cells in equal columns with a divider in the gap between them */
      .hb-facts {
        display: grid;
        column-gap: 24px;
        row-gap: 12px;
        margin-top: 24px;
        padding: 16px;
        border-radius: var(--fluvy-radius-lg);
        background: var(--fluvy-page);
      }
      .hb-fact {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        height: 44px;
        border-radius: var(--fluvy-radius-md);
      }
      /* a neutral circle on the page's surface is the card's own disc with a hairline (a wash of the page would
         vanish into it); a coloured fact's circle keeps its tone's wash */
      .hb-fact > .fv-ico--neutral {
        background: var(--fluvy-card);
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
      }
      /* the one-column fallback: the glyph alone before the words, where a circle would leave them no room */
      .hb-fact__glyph {
        display: inline-flex;
        flex: 0 0 20px;
        width: 20px;
        height: 20px;
        color: var(--fluvy-text-secondary);
      }
      .hb-fact__glyph svg {
        width: 20px;
        height: 20px;
      }
      .hb-facts--odd > :last-child {
        grid-column: 1 / -1;
      }
      .hb-fact.has-divider::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: -12px;
        width: 1px;
        background: var(--fluvy-border);
      }
      .hb-fact--tap {
        cursor: pointer;
      }
      .hb-fact--tap:active {
        opacity: 0.7;
      }
      .hb-fact .fv-readout {
        min-width: 0;
      }
      .hb-fact .fv-readout__label,
      .hb-fact .fv-readout__value {
        white-space: nowrap;
      }
      /* a fact's label is a name (the kind's word, or the person's own): in a column too narrow even without the
         circle it may end in an ellipsis, as names do */
      .hb-fact .fv-readout__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* the mini layout's one row: the readouts and a sparkline that takes the rest */
      .hb-mini {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 48px;
        margin-top: 16px;
      }
      .hb-mini .hb-readouts {
        flex: 0 0 auto;
      }
      .hb-spark {
        --ink: var(--tone-ink, var(--fluvy-accent));
        flex: 1 1 auto;
        min-width: 0;
        height: 48px;
      }
      .hb-spark svg {
        display: block;
      }
      .fv-card.is-off .hb-chart,
      .fv-card.is-off .hb-spark {
        --ink: var(--fluvy-text-disabled);
        --tone-ink: var(--fluvy-text-disabled);
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    record_: { state: true },
    shares_: { state: true },
  };

  /** undefined while the bars load, null when the recorder knows nothing of the sensor. */
  declare record_: BarsRecord | null | undefined;
  /** The sensors a share is of, by id: their bars (the same), undefined while they load. */
  declare shares_: Readonly<Record<string, BarsRecord | null | undefined>>;

  /** The bar under the pointer (its index); null: the whole period. */
  private readonly scrubber = new ScrubController(this, (fraction) => this.barAt(fraction));
  private readonly history = new Refresher<BarsRecord | null>(HOUR);
  private readonly shareHistory = new Map<string, Refresher<BarsRecord | null>>();
  private readonly head = new HeadFit(this);
  private readonly texts = new TemplateTexts(this);
  private readonly ruler: TextRuler;
  private plot: Plot = { inset: 0, slot: 1, count: 0 };
  private readonly gradient = `hb-g${++gradients}`;

  constructor() {
    super();
    this.record_ = undefined;
    this.shares_ = {};
    this.ruler = this.head.ruler;
  }

  static override keys = configKeys<HistoryBarsCardConfig>()([
    'subtitle',
    'days',
    'period',
    'stat',
    'include_today',
    'decimals',
    'unit',
    'variant',
    'show_head',
    'show_values',
    'show_axis',
    'show_grid',
    'show_dates',
    'show_facts',
    'date_format',
    'head',
    'facts',
    'co2_factor',
    'price',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'head',
      title: 'history-bars.editor_head',
      idKey: 'kind',
      picker: KIND_PICKER,
      keys: READOUT_KEYS,
      schema: READOUT_FIELDS,
      schemaOf: readoutSchema,
      computeLabel: listLabels,
      computeHelper: listHelpers,
    },
    {
      key: 'facts',
      title: 'history-bars.editor_facts',
      idKey: 'kind',
      picker: KIND_PICKER,
      keys: FACT_KEYS,
      schema: FACT_FIELDS,
      schemaOf: factSchema,
      computeLabel: listLabels,
      computeHelper: listHelpers,
    },
  ];
  /** The card's head is its sensor's name (`title` is the older word for it). */
  static override aliases: AliasSpec = { keys: [{ from: 'title', to: 'name' }] };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = (config, hass) => {
    const entity = typeof config['entity'] === 'string' ? config['entity'] : '';
    const stateClass = hass?.states?.[entity]?.attributes['state_class'];
    const stat = defaultStat(typeof stateClass === 'string' ? stateClass : undefined);
    return {
      variant: 'full',
      period: 'day',
      days: 7,
      stat,
      include_today: false,
      decimals: 1,
      date_format: 'date',
      show_head: true,
      show_values: true,
      show_axis: true,
      show_grid: true,
      show_dates: true,
      show_facts: true,
      co2_factor: FACTORS.co2,
      head: defaultHead(stat),
      facts: [...DEFAULT_FACTS],
    };
  };
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor']),
        fieldRow(textField('name'), textField('subtitle')),
        fieldRow(iconField(), selectField('variant', ['full', 'compact', 'mini'])),
        ...colourFields(),
        fieldRow(numberField('days', 1, 92), selectField('period', PERIODS)),
        fieldRow(
          selectField('stat', STATS),
          selectField('date_format', ['date', 'weekday', 'short']),
        ),
        fieldRow(numberField('decimals', 0, 3), textField('unit')),
        fieldRow(boolField('include_today'), boolField('show_head')),
        fieldRow(boolField('show_values'), boolField('show_axis')),
        fieldRow(boolField('show_grid'), boolField('show_dates')),
        boolField('show_facts'),
        // the two lists are edited item by item (the rows editor takes these fields out of the form)
        { name: 'head', selector: { object: {} } },
        { name: 'facts', selector: { object: {} } },
        fieldRow(numberField('co2_factor', 0, 2, 0.01), numberField('price', 0, 100, 0.001)),
        actionFields(),
      ],
      ...editorLabels(
        strings,
        {
          head: 'editor_head',
          facts: 'editor_facts',
          days: 'editor_days',
          period: 'editor_period',
          stat: 'editor_stat',
          include_today: 'editor_include_today',
          decimals: 'editor_decimals',
          unit: 'editor_unit',
          show_head: 'editor_show_head',
          show_values: 'editor_show_values',
          show_axis: 'editor_show_axis',
          show_grid: 'editor_show_grid',
          show_dates: 'editor_show_dates',
          show_facts: 'editor_show_facts',
          date_format: 'editor_date_format',
          co2_factor: 'editor_co2_factor',
          price: 'editor_price',
        },
        {},
      ),
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): HistoryBarsCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    return {
      type: 'custom:fluvy-history-bars-card',
      entity:
        sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'energy') ??
        sensors[0] ??
        '',
    };
  }

  protected override prepare(config: HistoryBarsCardConfig): HistoryBarsCardConfig {
    if (!config.entity) throw new Error('fluvy-history-bars-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return Math.ceil(FluvyHistoryBarsCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'full'
      ? { columns: 12, rows: 'auto', min_columns: 6 }
      : { columns: 6, rows: 'auto', min_columns: 6 };
  }

  /* ---------- what the config says ---------- */

  private get variant(): BarsVariant {
    const v = this.config?.variant;
    return v === 'compact' || v === 'mini' ? v : 'full';
  }
  private get period(): Period {
    const p = this.config?.period;
    return p === 'week' || p === 'month' ? p : 'day';
  }
  private get count(): number {
    const asked = Number(this.config?.days ?? 7);
    return Math.max(1, Math.min(CAPS[this.period], Number.isFinite(asked) ? Math.round(asked) : 7));
  }
  private statOf(view: EntityView): Stat {
    const s = this.config?.stat;
    return s && STATS.includes(s) ? s : defaultStat(view.attr<string>('state_class'));
  }
  private get decimals(): number {
    const d = Number(this.config?.decimals ?? 1);
    return Number.isFinite(d) ? Math.max(0, Math.min(3, Math.round(d))) : 1;
  }
  private get dateStyle(): DateStyle {
    const s = this.config?.date_format;
    return s === 'weekday' || s === 'short' ? s : 'date';
  }
  private shows(
    key: 'show_head' | 'show_values' | 'show_axis' | 'show_grid' | 'show_dates' | 'show_facts',
  ): boolean {
    return this.config?.[key] !== false;
  }
  private headItems(stat: Stat): FactItem[] {
    const own = this.config?.head;
    return own === undefined ? defaultHead(stat).map((kind) => ({ kind })) : factsOf(own);
  }
  private factItems(): FactItem[] {
    const own = this.config?.facts;
    return own === undefined ? DEFAULT_FACTS.map((kind) => ({ kind })) : factsOf(own);
  }
  /** The sensors a share is of. */
  private shareIds(stat: Stat): string[] {
    return [
      ...new Set(
        [...this.headItems(stat), ...this.factItems()]
          .filter((item) => item.kind === 'share' && typeof item.of === 'string' && item.of)
          .map((item) => item.of as string),
      ),
    ];
  }

  protected override watched(): readonly string[] {
    const view = this.entity();
    return [view.id, ...this.shareIds(this.statOf(view))].filter(Boolean);
  }

  private now(): Date {
    const frozen = this.config?._now;
    if (frozen) {
      const date = new Date(frozen);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
  }

  /* ---------- the recorder ---------- */

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.loadBars();
  }

  /** The unit the recorder is asked for: the card's own, else the sensor's. */
  private askedUnit(view: EntityView): string {
    return this.config?.unit ?? view.unit;
  }

  /** Once per sensor, window and hour, and again when the hour turns; the bars on screen stay until the new ones arrive. */
  private loadBars(): void {
    const hass = this.hass;
    const view = this.entity();
    if (!hass || view.status === 'missing') return;
    const now = this.now();
    const stat = this.statOf(view);
    const hour = Math.floor(now.getTime() / HOUR);
    const unit = this.askedUnit(view);
    const window = `${view.id}|${this.period}|${this.count}|${stat}|${unit}`;
    const previous = this.history.request(
      `${window}|${hour}`,
      () =>
        fetchBars(hass, { id: view.id, period: this.period, count: this.count, stat, unit, now }),
      (record) => (this.record_ = record),
    );
    if (previous !== null && !previous.startsWith(`${window}|`)) this.record_ = undefined;
    for (const id of this.shareIds(stat)) {
      let refresher = this.shareHistory.get(id);
      if (!refresher) {
        refresher = new Refresher<BarsRecord | null>(HOUR);
        this.shareHistory.set(id, refresher);
      }
      refresher.request(
        `${id}|${this.period}|${this.count}|${stat}|${unit}|${hour}`,
        () => fetchBars(hass, { id, period: this.period, count: this.count, stat, unit, now }),
        (record) => (this.shares_ = { ...this.shares_, [id]: record }),
      );
    }
  }

  /* ---------- words and figures ---------- */

  private figure(value: number | null, decimals = this.decimals): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return formatNumber(this.hass, value, { digits: decimals, minDigits: decimals }).replace(
      /^-/,
      '−',
    );
  }

  /** The bucket's date as a bar says it: "Oct 03", "Fri" or "3"; a month "Oct". */
  private dateLabel(start: number, style: DateStyle = this.dateStyle): string {
    const period = this.period;
    const opts: Intl.DateTimeFormatOptions =
      period === 'month'
        ? style === 'short'
          ? { month: 'narrow' }
          : { month: 'short' }
        : style === 'weekday' && period === 'day'
          ? { weekday: 'short' }
          : style === 'short'
            ? { day: 'numeric' }
            : { day: '2-digit', month: 'short' };
    const zone = houseZone(this.hass);
    if (zone) opts.timeZone = zone;
    // the middle of the bucket's first day: the same date whatever a clock change did to the midnight
    return dateFormat(this.hass?.language ?? 'en', opts).format(new Date(start + 12 * HOUR));
  }

  /** The default sub: "Last 7 days", "Last week", and "· Today" when the bucket in progress is drawn. */
  private periodLine(): string {
    const n = this.count;
    const period = this.period;
    const key =
      n === 1
        ? period === 'day'
          ? 'last_day'
          : period === 'week'
            ? 'last_week'
            : 'last_month'
        : period === 'day'
          ? 'last_days'
          : period === 'week'
            ? 'last_weeks'
            : 'last_months';
    const line = strings(this.hass, key, { count: n });
    return this.config?.include_today ? `${line} · ${this.currentWord()}` : line;
  }

  /** "Today", "This week", "This month". */
  private currentWord(): string {
    const period = this.period;
    return period === 'day'
      ? this.t('common.today')
      : strings(this.hass, period === 'week' ? 'this_week' : 'this_month');
  }

  /** A fact's label: its own name, else its kind's word. */
  private factLabel(item: FactItem, shareName: string): string {
    if (item.name) return item.name;
    switch (item.kind) {
      case 'total':
        return strings(this.hass, 'kind_total');
      case 'average':
        return strings(
          this.hass,
          this.period === 'day' ? 'avg_day' : this.period === 'week' ? 'avg_week' : 'avg_month',
        );
      case 'highest':
        return strings(this.hass, 'kind_highest');
      case 'lowest':
        return strings(this.hass, 'kind_lowest');
      case 'today':
        return this.currentWord();
      case 'co2':
        return strings(this.hass, 'kind_co2');
      case 'trees':
      case 'km':
        return strings(this.hass, 'equivalent');
      case 'share':
        return strings(this.hass, 'share_of', { name: shareName });
      case 'money':
        return strings(this.hass, 'money_est');
      case 'template':
        return '';
    }
  }

  /** The total of the sensor a share is of, in the card's unit: null when it cannot be read, undefined while it loads. */
  private shareTotal(item: FactItem, drawn: boolean, scale: Scale): number | null | undefined {
    if (!item.of) return null;
    const record = this.shares_[item.of];
    if (record === undefined) return undefined;
    if (record === null) return null;
    const values = [...record.buckets, ...(drawn ? [record.current] : [])].map((b) => b.value);
    const total = summarise(values, null).total;
    return total === null ? null : this.scaled(total, scale);
  }

  /** A raw statistic in the shown unit (a Wh series read in kWh). */
  private scaled(raw: number, scale: Scale): number {
    return raw / scale.divisor;
  }

  /** A fact as text: its label, its figure in its unit, its circle and its tap. */
  private factText(
    item: FactItem,
    summary: Summary,
    context: Omit<FactContext, 'shareOf'>,
    scale: Scale,
    drawn: boolean,
  ): FactCell {
    const of = item.kind === 'share' && item.of ? this.entity(item.of) : null;
    const figure = factFigure(item, summary, {
      ...context,
      shareOf: item.kind === 'share' ? this.shareTotal(item, drawn, scale) : null,
    });
    const text =
      item.kind === 'template'
        ? this.texts.resolve(item.template ?? '', this.config?.entity)
        : this.figure(figure.value, figure.decimals);
    const value = text === '—' || text === '' ? '—' : text;
    return {
      item,
      label: this.factLabel(item, of?.name ?? ''),
      value,
      unit: value === '—' ? '' : figure.unit,
      icon: item.icon ?? FACT_ICONS[item.kind],
      tone: toneOf({ color: item.color }, 'neutral'),
      accent: this.accents.item(item.color),
      entity: of?.id ?? this.config?.entity,
    };
  }

  /* ---------- the render ---------- */

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (view.status === 'missing')
      return this.renderEmpty(`${name} · ${stateText(this.hass, view)}`);

    const unusable = !isUsable(view);
    const tone: Tone = unusable ? 'off' : toneOf(this.config, 'accent');
    const stat = this.statOf(view);
    const variant = this.variant;
    const width = this.contentWidth;
    const record = this.record_;
    const loading = record === undefined;
    const drawn = Boolean(this.config?.include_today);

    // the buckets drawn, in the unit shown: a Wh series reads in kWh when its figures ask for it
    const buckets: readonly Bucket[] = record
      ? [...record.buckets, ...(drawn ? [record.current] : [])]
      : [];
    const asked = this.askedUnit(view);
    const scale = this.scaleOf(buckets, asked);
    const values = buckets.map((b) => (b.value === null ? null : this.scaled(b.value, scale)));
    const current = record
      ? record.current.value === null
        ? null
        : this.scaled(record.current.value, scale)
      : null;
    const summary = summarise(values, current);
    const unit = scale.unit;

    const context: Omit<FactContext, 'shareOf'> = {
      unit,
      decimals: this.decimals,
      kwh: this.kwhOf(summary.total, scale),
      price: typeof this.config?.price === 'number' ? this.config.price : undefined,
      co2Factor: typeof this.config?.co2_factor === 'number' ? this.config.co2_factor : FACTORS.co2,
      currency: currencySymbol(this.hass),
      trees: strings(this.hass, 'unit_trees'),
    };
    const readouts = this.headItems(stat).map((item) =>
      this.factText(item, summary, context, scale, drawn),
    );
    const facts =
      variant === 'full' && this.shows('show_facts')
        ? this.factItems().map((item) => this.factText(item, summary, context, scale, drawn))
        : [];

    // the readout under the pointer: the bar's day and its value, in place of the row
    const hovered = record && buckets.length ? this.scrubber.value : null;
    const hoveredBucket = hovered === null ? undefined : buckets[hovered];
    const hoveredValue = hovered === null ? null : (values[hovered] ?? null);
    const shownReadouts: StatText[] = hoveredBucket
      ? [
          {
            label: this.dateLabel(hoveredBucket.start, 'date'),
            value: this.figure(hoveredValue),
            unit: hoveredValue === null ? '' : unit,
          },
        ]
      : readouts;

    // a sensor that cannot be read now opens its line with the state (the history stays): the first segment never
    // gives way, where a badge in a narrow head would
    const period = this.config?.subtitle ?? this.periodLine();
    const sub = unusable ? `${stateText(this.hass, view)} · ${period}` : period;
    const showHead = this.shows('show_head');
    // the readouts sit beside the title only on a wide card where nothing of the head gives way for them
    const tryHead =
      showHead && variant !== 'mini' && readouts.length > 0 && width >= READOUTS_IN_HEAD;
    let fitted = this.head.fit({
      width,
      title: name,
      sub,
      ...(tryHead ? { trailing: this.readoutsWidth(readouts) } : {}),
    });
    const inHead = tryHead && fitted.icon && fitted.sub === sub;
    if (tryHead && !inHead) fitted = this.head.fit({ width, title: name, sub });

    const chart =
      variant === 'mini'
        ? nothing
        : loading
          ? html`<div
              class="fv-skeleton hb-skeleton"
              style="height:${this.chartHeight(variant)}px"
            ></div>`
          : record === null
            ? html`<div class="hb-empty">
                ${this.head.empty('chart', strings(this.hass, 'no_stats'), strings(this.hass, 'no_stats_hint'), width)}
              </div>`
            : this.renderChart(buckets, values, unit, tone, unusable, hovered, name, variant);

    return html`<article class="fv-card ${unusable ? 'is-unavailable is-off' : ''}" data-card>
      ${
        showHead
          ? head({
              icon: fitted.icon ? (this.config?.icon ?? 'chart') : null,
              tone,
              title: name,
              sub: fitted.sub,
              trailing: inHead
                ? this.renderReadouts(shownReadouts, readouts, 'head')
                : fitted.badge,
              onIconTap: () => this.tap(view.id),
              onHold: () => this.hold(view.id),
              iconLabel: name,
              name: true,
            })
          : nothing
      }
      ${
        variant === 'mini'
          ? this.renderMini(shownReadouts, readouts, values, tone, loading, record === null)
          : inHead || !readouts.length
            ? nothing
            : this.renderReadouts(shownReadouts, readouts, showHead ? 'row' : 'first')
      }
      ${chart} ${facts.length && record ? this.renderFacts(facts) : nothing}
    </article>`;
  }

  /**
   * The unit the figures read in: the recorder's answer as asked, or a scalable unit brought up to the size its
   * largest figure asks for (a Wh meter's days read in kWh); never down — a kWh meter's small days stay in kWh.
   */
  private scaleOf(buckets: readonly Bucket[], asked: string): Scale {
    if (this.config?.unit || !SCALABLE.test(asked)) return { unit: asked, divisor: 1 };
    const base = toBase(1, asked);
    const peak = Math.max(0, ...buckets.map((b) => Math.abs(b.value ?? 0) * base.value));
    const scale = scaleFor(peak, base.unit);
    // the recorder answered in the asked unit: the divisor brings that unit to the one chosen
    const divisor = scale.divisor / base.value;
    return divisor > 1 ? { unit: scale.unit, divisor } : { unit: asked, divisor: 1 };
  }

  /** The total in kWh when the figures are energy, for the equivalents; null otherwise. */
  private kwhOf(total: number | null, scale: Scale): number | null {
    if (total === null) return null;
    const base = toBase(total, scale.unit);
    return base.unit === 'Wh' ? base.value / 1000 : null;
  }

  private chartHeight(variant: BarsVariant): number {
    return (
      (variant === 'compact' ? PLOT_COMPACT : PLOT) +
      (variant === 'full' && this.shows('show_values') ? VALUES : HEADROOM) +
      (this.shows('show_dates') ? DATES : 0)
    );
  }

  /** The room a row of readouts takes beside the title: each at its widest line, a divider between them. */
  /** The widest of the readouts: what an equal cell must hold. */
  private readoutsWidest(items: readonly StatText[]): number {
    return Math.max(
      0,
      ...items.map((item) =>
        Math.max(
          this.ruler.width('fv-readout__label', item.label),
          this.ruler.width(
            'fv-readout fv-readout--s > fv-readout__value',
            item.value,
            'fv-unit',
            item.unit ?? '',
          ),
        ),
      ),
    );
  }

  private readoutsWidth(items: readonly StatText[]): number {
    return items.reduce(
      (sum, item, i) =>
        sum +
        Math.max(
          this.ruler.width('fv-readout__label', item.label),
          this.ruler.width(
            'fv-readout fv-readout--s > fv-readout__value',
            item.value,
            'fv-unit',
            item.unit ?? '',
          ),
        ) +
        (i ? DIVIDER : 0),
      0,
    );
  }

  /**
   * The readouts: beside the title (`head`), on their own row under it (`row`), or first on the card when the head
   * is off (`first`) — in one line with dividers while it holds them, else folded into equal columns.
   */
  private renderReadouts(
    shown: readonly StatText[],
    resting: readonly FactCell[],
    place: 'head' | 'row' | 'first',
  ): TemplateResult {
    const width = this.contentWidth;
    // beside the title the readouts take their natural widths; on their own row they share it in equal columns, so
    // the line holds only while the widest fits a cell
    const line =
      place === 'head' ||
      this.readoutsWidest(resting) * resting.length + DIVIDER * (resting.length - 1) <= width;
    const columns = line ? resting.length : statsColumns(this.ruler, width, resting);
    // folded into columns, the readouts take the size the widest figure fits at (the sensor card's rule)
    const size = line ? 's' : statsSize(this.ruler, width, resting, columns);
    const cells = shown.map((text, i) => {
      const item = resting[i]?.item;
      const tap = item?.tap_action
        ? (): void => this.tap(resting[i]?.entity, item.tap_action)
        : null;
      const key = (event: KeyboardEvent): void => {
        if (tap && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          tap();
        }
      };
      return html`<div
        class="hb-readout ${tap ? 'hb-readout--tap' : ''}"
        role=${tap ? 'button' : nothing}
        tabindex=${tap ? '0' : nothing}
        data-target=${tap ? '' : nothing}
        @click=${tap ?? nothing}
        @keydown=${tap ? key : nothing}
      >
        ${readout({ label: text.label, value: text.value, unit: text.unit ?? '', size })}
      </div>`;
    });
    if (line)
      return html`<div
        class="hb-readouts ${place === 'head' ? 'hb-readouts--head' : place === 'row' ? 'hb-readouts--row' : 'hb-readouts--first'}"
      >
        ${cells}
      </div>`;
    return html`<div
      class="hb-cols fv-cols ${resting.length % columns ? 'hb-cols--odd' : ''}"
      style="grid-template-columns:repeat(${columns}, minmax(0, 1fr))${place === 'first' ? ';margin-top:0' : ''}"
    >
      ${cells}
    </div>`;
  }

  /** The mini row: the readouts that fit beside a sparkline of the bars, the sparkline alone giving way last. */
  private renderMini(
    shown: readonly StatText[],
    resting: readonly FactCell[],
    values: ReadonlyArray<number | null>,
    tone: Tone,
    loading: boolean,
    none: boolean,
  ): TemplateResult {
    const width = this.contentWidth;
    let kept = resting.length;
    while (kept > 1 && this.readoutsWidth(resting.slice(0, kept)) + 12 + SPARK_MIN > width)
      kept -= 1;
    const sparkWidth = width - (kept ? this.readoutsWidth(resting.slice(0, kept)) + 12 : 0);
    const spark = sparkWidth >= SPARK_MIN && !none;
    const data = values.map((v) => ({ value: v === null ? 0 : Math.max(0, v) }));
    return html`<div class="hb-mini">
      ${kept ? this.renderReadouts(shown.slice(0, shown.length === 1 ? 1 : kept), resting.slice(0, kept), 'head') : nothing}
      ${
        spark
          ? loading
            ? html`<div class="fv-skeleton hb-spark"></div>`
            : html`<div class="hb-spark fv-tone--${tone}">
                ${bars(data, { w: Math.floor(sparkWidth / 4) * 4, h: 48, gap: 4 })}
              </div>`
          : nothing
      }
    </div>`;
  }

  /** The bar a pointer at `fraction` of the chart's width is over (the scale's column counts as the first bar's). */
  private barAt(fraction: number): number {
    const { inset, slot, count } = this.plot;
    if (!count) return 0;
    const x = fraction * this.contentWidth - inset;
    return Math.max(0, Math.min(count - 1, Math.floor(x / slot)));
  }

  /** The keys that read the chart without a pointer: ← → a bar, Home and End its ends, Escape lets go. */
  private readonly onKey = (event: KeyboardEvent): void => {
    const count = this.plot.count;
    if (!count) return;
    const from = this.scrubber.value ?? count;
    let next: number | null;
    switch (event.key) {
      case 'ArrowLeft':
        next = Math.max(0, from - 1);
        break;
      case 'ArrowRight':
        next = Math.min(count - 1, from + 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      case 'Escape':
        if (this.scrubber.value === null) return;
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next === this.scrubber.value) return;
    this.scrubber.value = next;
    this.requestUpdate();
  };

  /**
   * The chart: the bars in the card's ink with a soft gradient, their values above them (all or none), a nice scale
   * with its unit rotated beside it and dashed gridlines across, the dates under them thinned to what the row holds.
   */
  private renderChart(
    buckets: readonly Bucket[],
    values: ReadonlyArray<number | null>,
    unit: string,
    tone: Tone,
    unusable: boolean,
    hovered: number | null,
    name: string,
    variant: BarsVariant,
  ): TemplateResult {
    const width = this.contentWidth;
    const full = variant === 'full';
    const showValues = full && this.shows('show_values');
    const showAxis = full && this.shows('show_axis');
    const showGrid = full && this.shows('show_grid');
    const showDates = this.shows('show_dates');
    const plotHeight = full ? PLOT : PLOT_COMPACT;
    const top = showValues ? VALUES : HEADROOM;
    const height = top + plotHeight + (showDates ? DATES : 0);
    const known = values.filter((v): v is number => v !== null);
    const ticks = niceTicks(Math.min(0, ...known), Math.max(0, ...known));
    const tickTexts = ticks.ticks.map((t) => this.figure(t, ticks.decimals));
    const tickWidth = showAxis
      ? Math.max(0, ...tickTexts.map((t) => this.ruler.width('hb-tick', t)))
      : 0;
    const inset = showAxis ? (unit ? UNIT_COLUMN : 0) + tickWidth + AXIS_GAP : 0;
    const plotWidth = Math.max(1, width - inset);
    const count = buckets.length;
    const { slot, bar, radius } = barGeometry(count, plotWidth);
    this.plot = { inset, slot, count };
    const span = ticks.max - ticks.min;
    const y = (v: number): number =>
      span > 0 ? top + plotHeight - ((v - ticks.min) / span) * plotHeight : top + plotHeight;
    const zero = y(0);

    // the values over the bars: all of them, or none where one would not hold its slot
    const valueTexts = values.map((v) => (v === null ? '' : this.figure(v)));
    const valuesHold =
      showValues &&
      Math.max(0, ...valueTexts.map((t) => this.ruler.width('hb-value', t))) <= slot - 2;
    // the dates thinned to what the row holds, the last bar always read: every n-th by the widest label, and one
    // more where a label kept inside the plot at an end would crowd its neighbour
    const dateTexts = buckets.map((b) => this.dateLabel(b.start));
    const dateWidths = dateTexts.map((t) => this.ruler.width('hb-date', t));
    let dateStep = thinStep(Math.max(0, ...dateWidths), slot);
    let dated = labelled(count, dateStep);
    const placedDates = (): Placed[] =>
      dated.flatMap((on, i) =>
        on
          ? [
              {
                x: Number(
                  this.clampedX(inset + i * slot + slot / 2, dateWidths[i] ?? 0, inset, width),
                ),
                width: dateWidths[i] ?? 0,
              },
            ]
          : [],
      );
    while (dateStep < count && !labelsApart(placedDates())) dated = labelled(count, ++dateStep);
    const dateY = top + plotHeight + 8 + 12;

    const drawn = buckets.map((_bucket, i) => {
      const v = values[i] ?? null;
      const cx = inset + i * slot + slot / 2;
      const x = (cx - bar / 2).toFixed(1);
      const empty = v === null || v === 0 || span === 0;
      const negative = v !== null && v < 0;
      const hover = hovered === i ? 'is-hover' : '';
      // a bar is at least 2 px tall, rounded at its far end and flat on the zero line; a bucket with nothing in it
      // is a quiet 2 px stub on the line
      const tall = empty ? 0 : Math.max(2, Math.round(Math.abs(y(v) - zero)));
      const rect = empty
        ? svg`<rect class="hb-bar is-empty ${hover}" x=${x} y=${(zero - 2).toFixed(1)} width=${bar} height="2" rx=${Math.min(1, radius)}></rect>`
        : svg`<path class="hb-bar ${negative ? 'is-negative' : ''} ${hover}" d=${barPath(cx - bar / 2, negative ? zero : zero - tall, bar, tall, radius, negative ? 'bottom' : 'top')} style="--bar-delay:${i * 18}ms"></path>`;
      const label =
        valuesHold && !empty
          ? svg`<text class="hb-value" x=${this.clampedX(cx, this.ruler.width('hb-value', valueTexts[i] ?? ''), inset, width)} y=${negative ? zero + tall + 13 : zero - tall - 4} text-anchor="middle">${valueTexts[i]}</text>`
          : nothing;
      const date =
        showDates && dated[i]
          ? svg`<text class="hb-date" x=${this.clampedX(cx, this.ruler.width('hb-date', dateTexts[i] ?? ''), inset, width)} y=${dateY} text-anchor="middle">${dateTexts[i]}</text>`
          : nothing;
      return svg`${rect}${label}${date}`;
    });

    const grid = showGrid
      ? ticks.ticks.map((t) => {
          const yy = Math.round(y(t)) + 0.5;
          return svg`<line class="hb-grid" x1=${inset} x2=${width} y1=${yy} y2=${yy}></line>`;
        })
      : nothing;
    const axis = showAxis
      ? svg`${ticks.ticks.map((t, i) => svg`<text class="hb-tick" x=${inset - AXIS_GAP} y=${Math.round(y(t)) + 4} text-anchor="end">${tickTexts[i]}</text>`)}${
          unit
            ? svg`<text class="hb-unit" transform="rotate(-90)" x=${-(top + plotHeight / 2)} y="11" text-anchor="middle">${unit}</text>`
            : nothing
        }`
      : nothing;

    const reading =
      hovered !== null && buckets[hovered]
        ? `${this.dateLabel(buckets[hovered].start, 'date')} · ${this.figure(values[hovered] ?? null)}${values[hovered] === null ? '' : ` ${unit}`}`
        : name;
    return html`<div
      class="hb-chart fv-tone--${unusable ? 'neutral' : tone} ${hovered !== null ? 'is-scrub' : ''}"
      role="img"
      aria-label=${reading}
      tabindex="0"
      @keydown=${this.onKey}
      ${scrub(this.scrubber)}
    >
      <svg width=${width} height=${height} viewBox="0 0 ${width} ${height}" data-measure="drawn">
        <defs>
          <linearGradient id=${this.gradient} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style="stop-color:color-mix(in srgb, var(--ink) 60%, var(--fluvy-card))"
            ></stop>
            <stop
              offset="1"
              style="stop-color:color-mix(in srgb, var(--ink) 48%, var(--fluvy-card))"
            ></stop>
          </linearGradient>
        </defs>
        <g style="--hb-fill:url(#${this.gradient})">${grid}${axis}${drawn}</g>
      </svg>
    </div>`;
  }

  /** A label centred on its bar, kept inside the plot at the ends. */
  private clampedX(cx: number, textWidth: number, inset: number, width: number): string {
    const half = textWidth / 2;
    return Math.max(inset + half, Math.min(width - half, cx)).toFixed(1);
  }

  /**
   * The facts strip: cells of a circle, a label and a figure in equal columns — three, two or one, each with or
   * without its circle, the first fit by measure — with a divider in the gap between cells on a row.
   */
  private renderFacts(facts: readonly FactCell[]): TemplateResult {
    const width = this.contentWidth;
    const widest = Math.max(
      0,
      ...facts.map((f) =>
        Math.max(
          this.ruler.width('fv-readout__label', f.label),
          this.ruler.width(
            'fv-readout fv-readout--s > fv-readout__value',
            f.value,
            'fv-unit',
            f.unit ?? '',
          ),
        ),
      ),
    );
    // the circles first: as many columns as hold a circle with its words, else one column with the glyph alone
    let columns = 1;
    let circles = false;
    for (const n of [3, 2, 1]) {
      if (n > facts.length) continue;
      if (widest + CIRCLE <= (width - 2 * STRIP_PAD - CELL_GAP * (n - 1)) / n) {
        columns = n;
        circles = true;
        break;
      }
    }
    // a last cell alone on its row takes the whole row
    const odd = columns > 1 && facts.length % columns === 1;
    // the one-column fallback keeps the glyph alone before the words; a figure is never cut, so it takes the
    // extra-small size where the small one would not hold, and the glyph goes where even that would not
    const cell = (width - 2 * STRIP_PAD - CELL_GAP * (columns - 1)) / columns;
    const figures = (size: 's' | 'xs'): number =>
      Math.max(
        0,
        ...facts.map((f) =>
          this.ruler.width(
            `fv-readout fv-readout--${size} > fv-readout__value`,
            f.value,
            'fv-unit',
            f.unit ?? '',
          ),
        ),
      );
    let glyphs = !circles;
    let size: 's' | 'xs' = circles || figures('s') <= cell - GLYPH ? 's' : 'xs';
    if (glyphs && size === 'xs' && figures('xs') > cell - GLYPH) {
      glyphs = false;
      size = figures('s') <= cell ? 's' : 'xs';
    }
    return html`<div
      class="hb-facts ${odd ? 'hb-facts--odd' : ''}"
      style="grid-template-columns:repeat(${columns}, minmax(0, 1fr))"
    >
      ${facts.map((fact, i) => {
        const tap = (): void => this.tap(fact.entity, fact.item.tap_action);
        const key = (event: KeyboardEvent): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            tap();
          }
        };
        return html`<div
          class="hb-fact hb-fact--tap ${i % columns ? 'has-divider' : ''}"
          role="button"
          tabindex="0"
          data-target
          data-accent=${fact.accent ?? nothing}
          aria-label=${`${fact.label}: ${fact.value}${fact.unit ? ` ${fact.unit}` : ''}`}
          @click=${tap}
          @keydown=${key}
        >
          ${
            circles
              ? ico(fact.icon, fact.tone)
              : glyphs
                ? html`<span class="hb-fact__glyph" aria-hidden="true">${icon(fact.icon)}</span>`
                : nothing
          }
          ${readout({ label: fact.label, value: fact.value, unit: fact.unit ?? '', size, name: true })}
        </div>`;
      })}
    </div>`;
  }
}
