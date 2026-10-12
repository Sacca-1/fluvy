import {
  digitsOf,
  fetchHistory,
  formatNumber,
  formatDate,
  formatTime,
  isUsable,
  scaleUnit,
  stateText,
  strings,
  valueParts,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type Series,
} from '@fluvy/core';

import {
  areaUnder,
  axis,
  chartBubble,
  clickPress,
  curve,
  firstFit,
  glyph,
  head,
  ico,
  plotScale,
  preventMenu,
  readout,
  round,
  sampleAt,
  scrub,
  ScrubController,
  seriesPath,
  seriesY,
  sheetStyles,
  startPress,
  type PlotOptions,
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
import { Card } from '../shared/base.js';

import { toneOf } from '../shared/colour.js';
import { TextRuler } from '../shared/fit.js';
import { statsColumns, statsSize } from '../shared/readouts.js';
import { FontsSettled } from '../shared/fonts.js';
import { glyphFor } from '../shared/domain.js';
import {
  accentField,
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
} from '../shared/form.js';
import { Refresher } from '../shared/refresh.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import type { BaseKey } from '../shared/base.js';
import { axisHolds } from '../shared/axis.js';
import { labelOf, normaliseExtras, type SensorItem } from './series.js';

const s = strings('sensor');

export type SensorVariant = 'chart' | 'tile';

/** A sensor drawn beside the card's own (`entities`): its id, and the name, icon and colour it is shown with. */
export interface SensorCardConfig extends FluvyCardConfig {
  /** Context in the sub line, before the window ("Temperature · last 24 h"). Defaults to the device class, as Home Assistant names it. */
  subtitle?: string;
  /**
   * The card's own sensor's name under its readout when other sensors share the chart. Empty: its measure's word
   * ("Temperature") when no other sensor on the chart measures the same, else its name beyond the title.
   */
  label?: string;
  /** Rolling window of history in hours (default 24), ending at "now". */
  hours?: number;
  show_stats?: boolean;
  /** `chart` = the wide card; `tile` = the sheet's sensor tile (readout, trend arrow, spark). */
  variant?: SensorVariant;
  /*
   * `entities`: up to two more sensors on the chart (a temperature and its humidity): a readout each beside the card's
   * own, a curve each on its own scale. `string | SensorItem` (the base config's list; read as entries here).
   */
  /** Test hook: an ISO date that freezes "now" (the day's axis). Undocumented. */
  _now?: string;
}

const POINTS = 48;
/** The chart of several curves: the single chart's band (76) and 12 above it, no bubble's headroom. */
const SEVERAL_CHART = 88;
/** The tones a second and third curve take when their measure would repeat the first's. */
const SPARE_TONES: readonly Tone[] = ['accent', 'water', 'solar', 'grid', 'heat'];
const CHART_HEIGHT = 120;
const HEADROOM = 44; // the bubble's room above the curve (design/language.md)
const HOUR_MS = 3_600_000;

const down4 = (n: number): number => Math.max(4, Math.floor(n / 4) * 4);
const capitalise = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** What a measurement is coloured by when the config does not say (the sheet paints heat and water). */
function sensorTone(view: EntityView): Tone {
  switch (view.deviceClass) {
    case 'temperature':
      return 'heat';
    case 'humidity':
    case 'moisture':
    case 'water':
    case 'precipitation':
    case 'precipitation_intensity':
      return 'water';
    case 'power':
    case 'energy':
    case 'illuminance':
    case 'irradiance':
      return 'solar';
    case 'current':
    case 'voltage':
    case 'pressure':
    case 'atmospheric_pressure':
      return 'grid';
    default:
      return 'accent';
  }
}

/** The largest readout size a text state fits in: a word is a value too, and a value never ellipsizes. */
function sizeFor(
  text: string,
  width: number,
  sizes: ReadonlyArray<readonly ['l' | 'm' | 's' | 'xs', number]>,
): 'l' | 'm' | 's' | 'xs' {
  for (const [size, perCharacter] of sizes) if (text.length * perCharacter <= width) return size;
  return 'xs';
}

/**
 * One measurement over time. `chart` is the sheet's wide card — head, the curve with its value
 * bubble on the cursor at "now", the axis, min / max / average. `tile` is the sheet's sensor tile —
 * readout, a trend arrow (the latest value against the mean of the window's first quarter) and a spark.
 *
 * A sensor that does not report a number keeps its state, set big, and no chart. History is asked
 * of `@fluvy/core` (one cached WebSocket call per entity and window) and asked again, at most every
 * five minutes, when the sensor itself changes — no timer.
 */
export class FluvySensorCard extends Card<SensorCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: SensorCardConfig): number {
    if (config.variant === 'tile') return 168;
    // several sensors: their readout row (16 + 48) takes the statistics' place, and the chart no bubble's 32; three in
    // a phone's column read a line each (3 × 32 + 2 × 12 in place of the row's 48)
    const extra = normaliseExtras(config['entities']).length;
    if (extra) return extra === 2 ? 348 : 276;
    return config.show_stats === false ? 244 : 304;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.ambient,
    css`
      /* the lab fixes the sheet at 360; a dashboard column decides here */
      .am-card {
        width: 100%;
      }
      .am-cols {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      /* fewer columns than statistics: the last one, alone on its row, takes the whole row */
      .am-cols--odd > :last-child {
        grid-column: 1 / -1;
      }
      /* the sheet scopes this under its lab frame (.am-sensors); here the tile is the card itself */
      .fv-tile .fv-readout {
        margin-top: 12px;
      }
      /* the language's unavailable surface (fluvy.css draws it for cards; tiles here keep their 168) */
      .fv-tile.is-off {
        background: var(--fluvy-page);
        box-shadow: none;
        outline: 1px dashed var(--fluvy-unavailable-border);
        outline-offset: -1px;
      }
      .fv-tile.is-off .fv-readout__label,
      .fv-tile.is-off .fv-readout__value {
        color: var(--fluvy-unavailable);
      }
      .fv-tile .fv-readout__label {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      } /* a name may ellipsize */
      .am-spark {
        padding: 0 4px;
      } /* the lab insets the spark so the end dot stays whole */
      .am-spark .fv-curve {
        overflow: visible;
      }
      .am-spark .fv-skeleton {
        height: 24px;
      }
      .am-chart--several {
        height: ${SEVERAL_CHART}px;
      }
      .am-chart .fv-skeleton {
        height: ${CHART_HEIGHT}px;
        border-radius: var(--fluvy-radius-control);
      }
      .am-chart .fv-curve {
        overflow: visible;
      } /* a rolling window ends at the edge: the dot at "now" stays whole */
      /* the bubble arrives with the dot it belongs to, once the line has drawn itself */
      .am-chart .fv-bubble {
        animation: fv-fade 500ms var(--fv-ease) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + 620ms);
      }
      .am-state {
        margin-top: 16px;
      }
      /* empty state: a 44 ring on the card fill and one line, centred in a 120 page panel (design language) */
      .am-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: ${CHART_HEIGHT}px;
        margin-top: 16px;
        border-radius: var(--fluvy-radius-control);
        background: var(--fluvy-page);
      }
      .am-empty .fv-ico {
        background: var(--fluvy-card);
      }
      /* words on two lines (a long language): the ring 12 from the top, so it stays on the 4 grid */
      .am-empty.is-two {
        justify-content: flex-start;
        padding: 12px 16px 0;
        text-align: center;
      }
      .am-empty .fv-empty {
        color: var(--fluvy-text-secondary);
      }
      /* several sensors: a readout each in equal columns, 32 apart with a 36 hairline in the middle of the gap */
      .am-pair {
        display: grid;
        grid-template-columns: repeat(var(--am-pair, 2), minmax(0, 1fr));
        column-gap: var(--am-gap, 32px);
        margin-top: 16px;
      }
      /* each readout centred in its column, its circle and its words as one (the language's readout rows) */
      .am-pair__item {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-width: 0;
        min-height: 44px;
      }
      .am-pair__item + .am-pair__item::before {
        content: '';
        position: absolute;
        top: 50%;
        height: 36px;
        translate: 0 -50%;
        inset-inline-start: calc(var(--am-gap, 32px) / -2);
        width: 1px;
        background: var(--fluvy-border);
      }
      /* without its circle a readout keeps the key of its curve beside its name: a 12 × 2 line in the curve's ink, its
         own part, so a name that ends in an ellipsis never takes its key with it */
      .am-key {
        flex: none;
        width: 12px;
        height: 2px;
        margin-inline-start: 8px;
        border-radius: 1px;
        background: var(--tone-ink, var(--fluvy-accent));
      }
      /* where columns would cut a name, a line a readout: its name and key at the start, its value at the end on the
         name's baseline, the hairline across between them */
      .am-pair--column {
        row-gap: 12px;
      }
      .am-pair--column .am-pair__item {
        min-height: 32px;
      }
      .am-pair--column .fv-readout {
        display: flex;
        flex: 1;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
      }
      .am-pair--column .fv-readout__value {
        flex: none;
        margin-top: 0;
      }
      .am-pair--column .am-pair__item + .am-pair__item::before {
        top: -6px;
        translate: none;
        inset-inline: 0;
        width: auto;
        height: 1px;
      }
      .am-pair .fv-readout {
        min-width: 0;
      }
      .am-pair .fv-readout__label {
        display: flex;
        align-items: center;
        min-width: 0;
      }
      .am-name {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      } /* a sensor's name may ellipsize; its key and its value never */
      .am-pair .fv-readout__value {
        white-space: nowrap;
      }
      /* two or three curves share the plot: lighter fills, so neither hides the other */
      .am-multi .curve-fill-a {
        stop-opacity: 0.16;
      }
      /* the axis row carries the time while the chart is read: a pill in the bubble's colours over the hours under the cursor */
      .am-axis {
        position: relative;
        height: 20px;
        margin-top: 4px;
      }
      .am-axis > .fv-axis {
        position: absolute;
        inset-inline: 0;
        top: 2px;
        margin-top: 0;
        transition: opacity var(--fluvy-duration-fast, 120ms) ease;
      }
      /* while read, the hours give way to the one the cursor is at */
      .am-axis.is-reading > .fv-axis {
        opacity: 0;
      }
      .am-when {
        position: absolute;
        top: 0;
        z-index: 1;
        height: 20px;
        border-radius: 10px;
        background: var(--fluvy-text);
        color: var(--fluvy-page);
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
        text-align: center;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        pointer-events: none;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    series_: { state: true },
    extras_: { state: true },
  };

  /** The other sensors' series by id, as the main one's (`undefined` while asked, `null` when there is none). */
  declare extras_: Readonly<Record<string, Series | null | undefined>>;
  private readonly extraHistory = new Map<string, Refresher<Series | null>>();

  /** `undefined` while the recorder has not answered; `null` when it has nothing for this window. */
  declare series_: Series | null | undefined;
  /** Where the chart is being read (a fraction of its width); null: it shows now. */
  private readonly scrubber = new ScrubController(this);

  private readonly history = new Refresher<Series | null>();
  /** The window (hours) the series on screen was asked for: the curve and its axis stay one picture while a newer one loads. */
  private drawn: number | null = null;

  /** The card's own sensor and, in `entities`, up to two more drawn beside it. */
  static override base: readonly BaseKey[] = [
    'entity',
    'entities',
    'name',
    'icon',
    'tap_action',
    'hold_action',
    'tone',
    'color',
    'card_color',
  ];
  static override keys = configKeys<SensorCardConfig>()([
    'subtitle',
    'label',
    'hours',
    'show_stats',
    'variant',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'entities',
      title: 'editor.also_sensors',
      domains: ['sensor', 'number', 'input_number', 'counter'],
      keys: ['entity', 'name', 'icon', 'color'],
      schema: [
        entityField(['sensor', 'number', 'input_number', 'counter']),
        fieldRow(textField('name'), iconField()),
        accentField(),
      ],
      computeHelper: (schema) =>
        schema.name === 'name' ? editorWord('editor.extra_name_helper') : undefined,
    },
  ];
  static override aliases: AliasSpec = { items: { entities: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'chart', show_stats: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor', 'number', 'input_number', 'counter']),
        fieldRow(textField('name'), textField('subtitle')),
        iconField(),
        ...colourFields(),
        fieldRow(selectField('variant', ['chart', 'tile']), numberField('hours', 1, 168)),
        boolField('show_stats'),
        textField('label'),
        actionFields(),
      ],
      ...editorLabels(s, { show_stats: 'editor.show_stats' }, { label: 'editor.chart_label' }),
      computeHelper: (schema) =>
        schema.name === 'label' ? editorWord('editor.chart_label_helper') : undefined,
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): SensorCardConfig {
    return {
      type: 'custom:fluvy-sensor-card',
      entity: entities.find((id) => id.startsWith('sensor.')) ?? '',
    };
  }

  protected override prepare(config: SensorCardConfig): SensorCardConfig {
    if (!config.entity) throw new Error('fluvy-sensor-card: "entity" is required');
    return config;
  }

  /** The other sensors on the chart, as entries (a bare id, or its name, icon and colour), two at most. */
  private extras(): SensorItem[] {
    return normaliseExtras((this.config as { entities?: unknown } | undefined)?.entities);
  }

  /** Watched: the card's own sensor and the others on its chart. */
  protected override watched(): readonly string[] {
    return [this.config?.entity ?? '', ...this.extras().map((item) => item.entity)].filter(Boolean);
  }

  override getCardSize(): number {
    return this.variant === 'tile' ? 3 : (this.config?.show_stats ?? true) ? 6 : 5;
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'tile'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private get variant(): SensorVariant {
    return this.config?.variant === 'tile' ? 'tile' : 'chart';
  }

  /**
   * "Last N hours" is a rolling window: the series always fills the width and ends at "now". At one
   * in the morning a calendar-day axis would show an almost empty card, which is not what a sensor
   * card is for (the energy card keeps the day axis: "today" is its subject).
   */
  private get hours(): number {
    return Math.min(168, Math.max(1, Math.round(this.config?.hours ?? 24)));
  }

  /* ---------- history ---------- */

  /** Runs before every render — state set here belongs to this render, never to a second one. */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const hass = this.hass;
    const view = this.entity();
    if (!hass || view.number === null) return; // nothing to chart (text, unavailable, missing): what was loaded stays for when it returns
    const hours = this.hours;
    this.loadExtras(hass, hours);
    const previous = this.history.request(
      `${view.id}|${hours}`,
      () => fetchHistory(hass, view.id, hours, POINTS),
      (series) => {
        this.drawn = hours;
        this.series_ = series;
      },
    );
    // another entity: back to the skeleton
    if (previous !== null && !previous.startsWith(`${view.id}|`)) {
      this.series_ = undefined;
      this.drawn = null;
    }
  }

  /** The other sensors' histories, each asked as the main one is (cached, again at most every five minutes). */
  private loadExtras(hass: NonNullable<typeof this.hass>, hours: number): void {
    const wanted = new Set(this.extras().map((item) => item.entity));
    for (const id of [...this.extraHistory.keys()])
      if (!wanted.has(id)) this.extraHistory.delete(id);
    for (const id of wanted) {
      if (this.entity(id).number === null) continue;
      const refresher = this.extraHistory.get(id) ?? new Refresher<Series | null>();
      this.extraHistory.set(id, refresher);
      refresher.request(
        `${id}|${hours}`,
        () => fetchHistory(hass, id, hours, POINTS),
        (series) => {
          this.extras_ = { ...this.extras_, [id]: series };
        },
      );
    }
  }

  /* ---------- pieces ---------- */

  /** The card's tone: the one asked for, the accent where a colour of its own was given, else the measure's. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);
  /** The head's fitting (what gives way, in its order), as every card's head. */
  private readonly headFit = new HeadFit(this);

  constructor() {
    super();
    this.extras_ = {};
    // a web font landing after the first render changes what fits: measure again
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  private toneOf(view: EntityView): Tone {
    if (!isUsable(view)) return 'off';
    return toneOf(this.config, sensorTone(view));
  }

  /** Decimals of the statistics: the entity's display precision, else what the state itself carries. */
  private precision(view: EntityView): number {
    const configured = this.hass?.entities?.[view.id]?.display_precision;
    if (typeof configured === 'number') return configured;
    return Math.min(3, view.state.split('.')[1]?.length ?? 0);
  }

  /** A statistic as the row says it: its number in the entity's precision (a scaled unit's own), and its unit. */
  private statText(value: number | null, view: EntityView): { value: string; unit: string } {
    if (value === null) return { value: '—', unit: '' };
    const scaled = scaleUnit(value, view.unit);
    const magnitude = Math.abs(scaled.value);
    const digits =
      scaled.unit === view.unit
        ? this.precision(view)
        : magnitude >= 100
          ? 0
          : magnitude >= 10
            ? 1
            : 2;
    return {
      value: formatNumber(this.hass, scaled.value, { digits, minDigits: digits }),
      unit: scaled.unit,
    };
  }

  /** The three statistics share the content width in equal columns, at the readout size they fit (`statsSize`). */
  private statsRow(series: Series | null | undefined, view: EntityView): TemplateResult {
    const stats = [
      [this.t('common.min'), series?.min ?? null],
      [this.t('common.max'), series?.max ?? null],
      [this.t('common.average'), series?.average ?? null],
    ] as const;
    const texts = stats.map(([label, value]) => ({ label, ...this.statText(value, view) }));
    // as many columns as hold the widest label and figure (fr's "MOYENNE" on a 200 column takes two and one), at
    // the size the figures fit
    const columns = statsColumns(this.ruler, this.contentWidth, texts);
    const size = statsSize(this.ruler, this.contentWidth, texts, columns);
    return html`<div
      class="am-cols fv-cols ${texts.length % columns ? 'am-cols--odd' : ''}"
      style="grid-template-columns:repeat(${columns}, minmax(0, 1fr))"
    >
      ${texts.map(({ label, value, unit }) => readout({ label, value, unit, size }))}
    </div>`;
  }

  /** History is up to five minutes old: the curve ends on the reading the card quotes, and the extremes count it. */
  private live(view: EntityView): Series | null | undefined {
    return this.liveOf(view, this.series_);
  }

  /** Latest against the mean of the first quarter of the window: the shape of the day, not its noise. */
  private trend(series: Series | null | undefined): 'up' | 'down' | null {
    if (!series || series.values.length < 4) return null;
    const quarter = Math.max(1, Math.floor(series.values.length / 4));
    let sum = 0;
    for (let i = 0; i < quarter; i++) sum += series.values[i] ?? 0;
    const start = sum / quarter;
    const latest = series.values[series.values.length - 1] ?? start;
    const threshold = Math.max((series.max - series.min) * 0.05, 1e-6);
    return latest - start > threshold ? 'up' : start - latest > threshold ? 'down' : null;
  }

  /** The word of a sensor's measure in Home Assistant's own words ("Temperature"), '' where it has none. */
  private measureWord(view: EntityView): string {
    if (!view.deviceClass) return '';
    const key = `component.${view.domain}.entity_component.${view.deviceClass}.name`;
    const named = this.hass?.localize(key) ?? '';
    return named && named !== key ? named : '';
  }

  /** "Temperature · last 24 h": the context (config, else the device class in Home Assistant's words) and the window. */
  private subLine(view: EntityView, title: string): string {
    const days = this.hours > 24 && this.hours % 24 === 0;
    const window = s(this.hass, days ? 'window_days' : 'window_hours', {
      count: days ? this.hours / 24 : this.hours,
    });
    let context = this.config?.subtitle ?? '';
    if (this.config?.subtitle === undefined) {
      const named = this.measureWord(view);
      if (named && !title.toLocaleLowerCase().includes(named.toLocaleLowerCase())) context = named;
    }
    if (!context) return capitalise(window);
    // the head: 44 circle + 12, the titles, 12 + the 44 round; the window is what this card is about, the context the part that may go
    return firstFit(
      [`${context} · ${window}`, capitalise(window)],
      this.contentWidth - 112 - 4,
      `500 13px ${getComputedStyle(this).fontFamily}`,
    );
  }

  /**
   * The window is labelled with the clock times at its quarters, ending in "Now" — as many as keep 12 apart (a 12 h
   * clock or a long "Now" may leave three, or the ends); days once it is two or more.
   */
  private axisItems(hours: number): ReadonlyArray<readonly [number, string]> {
    const now = this.now();
    if (hours >= 48) {
      const back = (h: number): string =>
        s(this.hass, 'days_ago', { count: formatNumber(this.hass, h / 24, { digits: 1 }) });
      const days: Array<readonly [number, string]> = [
        [0, back(hours)],
        [0.5, back(hours / 2)],
        [1, this.t('common.now')],
      ];
      // as the hours: three where they keep 12 apart, else the two ends
      return this.axisHolds(days) ? days : [days[0]!, days[2]!];
    }
    const at = (fraction: number): string =>
      formatTime(this.hass, new Date(now.getTime() - (1 - fraction) * hours * HOUR_MS));
    const five: Array<readonly [number, string]> = [
      [0, at(0)],
      [0.25, at(0.25)],
      [0.5, at(0.5)],
      [0.75, at(0.75)],
      [1, this.t('common.now')],
    ];
    // as many as keep 12 between every two, measured as the axis sets them (a language's long "Now" takes the room
    // of a quarter): five, else three, else the two ends
    return [five, [five[0]!, five[2]!, five[4]!], [five[0]!, five[4]!]].find((items) =>
      this.axisHolds(items),
    )!;
  }

  /**
   * Whether an axis's labels keep 12 between every two at the content width: the first sits on the start, the last
   * ends on the end, the others are centred on their fraction (`.fv-axis`).
   */
  private axisHolds(items: ReadonlyArray<readonly [number, string]>): boolean {
    return axisHolds(this.headFit.ruler, this.contentWidth, items);
  }

  /* ---------- variants ---------- */

  private renderTile(view: EntityView): TemplateResult {
    const open = (): void => this.tap(view.id);
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    };
    const name = this.config?.name ?? view.name;
    const tone = this.toneOf(view);
    const parts = valueParts(this.hass, view);
    const numeric = view.number !== null;
    const series = this.live(view);
    const trend = numeric ? this.trend(series) : null;
    const inner = this.width - 32;
    const values = series?.values ?? [];
    // unavailable keeps the tile's own anatomy (the 76 "off" tile cannot hold a name in a half column): dashed outline, page fill, dashed ring, "—"
    return html`<article
      class="fv-tile fv-tile--tap ${isUsable(view) ? '' : 'is-unavailable is-off'}"
      data-card
      role="button"
      tabindex="0"
      .fvTap=${open}
      .fvHold=${() => this.hold(view.id)}
      @pointerdown=${startPress}
      @contextmenu=${preventMenu}
      @click=${clickPress}
      @keydown=${key}
    >
      <div class="fv-tile__head">
        ${ico(this.config?.icon ?? glyphFor(view), tone)}
        ${trend ? html`<span class="fv-trend ${trend === 'down' ? 'fv-trend--down' : ''} am-tile__trend">${glyph(trend === 'down' ? 'trendDown' : 'trendUp')}</span>` : nothing}
      </div>
      ${readout({
        label: name,
        value: parts.value,
        unit: parts.unit,
        size: numeric
          ? 'm'
          : sizeFor(parts.value, inner, [
              ['m', 14],
              ['s', 12],
            ]),
      })}
      ${
        !numeric || series === null
          ? nothing
          : html`<div class="am-spark fv-tone--${tone}">
              ${values.length > 1 ? curve(values, { w: down4(inner - 8), h: 24, pad: 4 }) : html`<div class="fv-skeleton"></div>`}
            </div>`
      }
    </article>`;
  }

  private renderChart(view: EntityView): TemplateResult {
    const tone = this.toneOf(view);
    const title = this.config?.name ?? view.name;
    const usable = isUsable(view);
    // "Unavailable" is said once, here; a sensor that is a word has no window to speak of
    const sub =
      view.status !== 'ok'
        ? stateText(this.hass, view)
        : view.number === null
          ? (this.config?.subtitle ?? view.areaName)
          : this.subLine(view, title);
    // what gives way has the head's order: the sub's last parts, then the circle, before the name is cut
    const fitted = this.headFit.fit({ width: this.contentWidth, title, sub, trailing: 44 });
    const header = head({
      icon: fitted.icon ? (this.config?.icon ?? glyphFor(view)) : null,
      tone,
      title,
      name: true, // the entity's name, or one typed for it: a name may end in an ellipsis
      onIconTap: () => this.tap(view.id),
      onHold: () => this.hold(view.id),
      iconLabel: title,
      sub: fitted.sub,
      trailing: round('dots', 'quiet', this.t('common.more'), () =>
        this.tap(view.id, { action: 'more-info' }),
      ),
    });

    if (view.number === null) {
      const text = view.status === 'ok' ? stateText(this.hass, view) : '—';
      return html`<article class="fv-card am-card ${usable ? '' : 'is-off'}" data-card>
        ${header}
        <div class="am-state">
          ${readout({
            label: s(this.hass, 'state'),
            value: text,
            size: sizeFor(text, this.contentWidth, [
              ['l', 24],
              ['m', 15],
              ['s', 12],
            ]),
          })}
        </div>
      </article>`;
    }

    const series = this.live(view);
    const values = series?.values ?? [];
    const hours = this.drawn ?? this.hours;
    const width = down4(this.contentWidth);
    const family = getComputedStyle(this).fontFamily;
    const parts = valueParts(this.hass, view);
    const stats = this.config?.show_stats ?? true;

    if (series !== undefined && values.length < 2) {
      return html`<article class="fv-card am-card" data-card>
        ${header}
        <div
          class="am-empty ${
            this.ruler.width('fv-empty', s(this.hass, 'no_history')) > this.contentWidth - 32
              ? 'is-two'
              : ''
          }"
          data-align="center"
        >
          ${ico(glyphFor(view), 'neutral')}
          <p class="fv-empty">${s(this.hass, 'no_history')}</p>
        </div>
      </article>`;
    }

    const fraction = this.scrubber.value;
    const point = series && fraction !== null ? sampleAt(values, fraction) : null;
    const at =
      point === null
        ? null
        : {
            cursor: fraction as number,
            ...valueParts(
              this.hass,
              { ...view, number: point },
              { digits: digitsOf(this.hass, view, point) },
            ),
            time: this.momentAt(fraction as number, hours),
          };
    return html`<article class="fv-card am-card" data-card>
      ${header}
      <div class="am-chart fv-tone--${tone}" style="width:${width}px" ${scrub(this.scrubber)}>
        ${
          series
            ? html`${curve(values, { w: width, h: CHART_HEIGHT, padTop: HEADROOM, cursor: at?.cursor })}${chartBubble(
                at
                  ? {
                      x: at.cursor * width,
                      width,
                      value: at.value,
                      unit: at.unit,
                      time: at.time,
                      family,
                    }
                  : { x: width, width, value: parts.value, unit: parts.unit, family },
              )}`
            : html`<div class="fv-skeleton"></div>`
        }
      </div>
      ${axis(this.axisItems(hours))} ${stats ? this.statsRow(series, view) : nothing}
    </article>`;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    if (view.status === 'missing')
      return this.renderEmpty(
        this.config?.entity
          ? `${this.config.name ?? view.name} · ${stateText(this.hass, view)}`
          : undefined,
      );
    if (this.variant === 'tile') return this.renderTile(view);
    return this.extras().length ? this.renderSeveral(view) : this.renderChart(view);
  }

  /* ---------- several sensors ---------- */

  /**
   * How the row of readouts fits, in the order things give way: the circles while every name reads whole and every
   * value keeps the small size beside one; then the circles go (a key beside each name says which curve is whose); then
   * the gap closes to 16; then one readout a line. A name never ends in an ellipsis before the row has stacked, and a
   * value never shrinks past the extra-small size.
   */
  private pairFit(texts: ReadonlyArray<{ label: string; value: string; unit: string }>): {
    size: 'm' | 's' | 'xs';
    circles: boolean;
    gap: 32 | 16 | 0;
  } {
    const count = texts.length;
    const across = (gap: number): number => (this.contentWidth - gap * (count - 1)) / count;
    const fits = (size: 'm' | 's' | 'xs', room: number): boolean =>
      texts.every(
        ({ value, unit }) =>
          this.ruler.width(
            `fv-readout fv-readout--${size} > fv-readout__value`,
            value,
            'fv-unit',
            unit,
          ) <= room,
      );
    // a name with its key (12 + 8) when the circles have gone
    const named = (room: number, key: boolean): boolean =>
      texts.every(
        ({ label }) =>
          this.ruler.width('fv-readout > fv-readout__label', label) + (key ? 20 : 0) <= room,
      );
    const wide = across(32);
    if (named(wide - 56, false))
      for (const size of ['m', 's'] as const)
        if (fits(size, wide - 56)) return { size, circles: true, gap: 32 };
    if (named(wide, true))
      for (const size of ['m', 's', 'xs'] as const)
        if (fits(size, wide)) return { size, circles: false, gap: 32 };
    const tight = across(16);
    if (named(tight, true))
      for (const size of ['s', 'xs'] as const)
        if (fits(size, tight)) return { size, circles: false, gap: 16 };
    // a line each: the value at the end, beside its name
    return { size: fits('s', this.contentWidth / 2) ? 's' : 'xs', circles: false, gap: 0 };
  }

  /**
   * Several sensors on one card (a room's temperature and humidity): the head, then a readout each — its circle in
   * the measure's tone, its name, its value — in equal columns with a hairline between them, then one chart where each
   * curve keeps its own scale (units differ: a line is read against its own readout, never against another's), and
   * the axis. Scrubbed, every readout says that moment and the bubble says when (one bubble per chart: the time is
   * the one thing it can say for every curve). The statistics are one sensor's: they stay out.
   */
  private renderSeveral(view: EntityView): TemplateResult {
    const title = this.config?.name ?? (view.areaName || view.name);
    const items: SensorItem[] = [
      {
        entity: view.id,
        ...(this.config?.label ? { name: this.config.label } : {}),
        ...(this.config?.icon ? { icon: this.config.icon } : {}),
        ...(this.config?.color ? { color: this.config.color } : {}),
      },
      ...this.extras(),
    ];
    // each sensor its measure's tone; a tone the row already shows passes to the next spare one — unless the sensor
    // has a colour of its own (`data-accent`), which it wears whatever the others show
    const used = new Set<Tone>();
    const rows = items.map((item, index) => {
      const sensor = this.entity(item.entity);
      const accent = index > 0 && isUsable(sensor) ? this.accents.item(item.color) : undefined;
      const wanted =
        index === 0
          ? this.toneOf(sensor)
          : isUsable(sensor)
            ? toneOf(item, sensorTone(sensor))
            : 'off';
      const tone =
        wanted !== 'off' && !accent && used.has(wanted)
          ? (SPARE_TONES.find((t) => !used.has(t)) ?? wanted)
          : wanted;
      if (!accent) used.add(tone);
      const series =
        index === 0 ? this.live(sensor) : this.liveOf(sensor, this.extras_[item.entity]);
      return { item, sensor, tone, accent, series };
    });
    // what each readout is called: its own name, else its measure's word where it alone measures it, else its name
    const measures = rows.map(({ sensor }) => sensor.deviceClass);
    const hours = this.drawn ?? this.hours;
    const width = down4(this.contentWidth);
    // no bubble over the plot (the time goes on the axis row), so no headroom: the curves keep the single chart's band
    const H = SEVERAL_CHART;
    const fraction = this.scrubber.value;
    const loaded = rows.every((row) => row.series !== undefined || row.sensor.number === null);
    const texts = rows.map(({ item, sensor, series }) => {
      const label = labelOf(item, sensor, title, this.measureWord(sensor), measures);
      if (sensor.number === null)
        return {
          label,
          value: sensor.status === 'ok' ? stateText(this.hass, sensor) : '—',
          unit: '',
        };
      if (fraction !== null) {
        const point = series ? sampleAt(series.values, fraction) : null;
        // the moment read is written as the reading now is (its precision): the figure never grows under the finger
        return point === null
          ? { label, value: '—', unit: '' }
          : {
              label,
              ...valueParts(
                this.hass,
                { ...sensor, number: point },
                { digits: digitsOf(this.hass, sensor, point) },
              ),
            };
      }
      return { label, ...valueParts(this.hass, sensor) };
    });
    const fit = this.pairFit(texts);
    const plots = rows.map(({ series }) => {
      const values = series?.values ?? [];
      const scale = plotScale([values]);
      const o: PlotOptions = { w: width, h: H, padTop: 12, min: scale.min, max: scale.max };
      return { values, o };
    });
    const at = fraction === null ? width : fraction * width;
    // each curve's dot at the cursor; the cursor hangs from the highest of them, under them
    const dots = plots.map(({ values, o }) => seriesY(values, o, at));
    const top = Math.min(H, ...dots.filter((y): y is number => y !== null));
    const time = fraction !== null ? this.momentAt(fraction, hours) : null;
    // the head is the set's (the room, a chart's glyph): each sensor's own glyph and tone are on its readout
    const fitted = this.headFit.fit({
      width: this.contentWidth,
      title,
      sub: this.subLine(view, title),
      trailing: 44,
    });
    return html`<article class="fv-card am-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'trendUp') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        name: true,
        onIconTap: () => this.tap(view.id),
        onHold: () => this.hold(view.id),
        iconLabel: title,
        sub: fitted.sub,
        trailing: round('dots', 'quiet', this.t('common.more'), () =>
          this.tap(view.id, { action: 'more-info' }),
        ),
      })}
      <div
        class="am-pair ${fit.gap === 0 ? 'am-pair--column' : ''}"
        style="--am-pair:${fit.gap === 0 ? 1 : rows.length};--am-gap:${fit.gap}px"
      >
        ${rows.map(({ item, sensor, tone, accent, series }, index) => {
          // a key only where there is a curve to key (a word or a sensor gone draws none); the name gives way, never it
          const key = !fit.circles && (series?.values.length ?? 0) > 1;
          return html`<div class="am-pair__item fv-tone--${tone}" data-accent=${accent ?? nothing}>
            ${fit.circles ? ico(item.icon ?? glyphFor(sensor), tone) : nothing}
            ${readout({
              label: html`<span class="am-name">${texts[index]?.label ?? sensor.name}</span>${
                  key ? html`<i class="am-key" data-measure="skip"></i>` : nothing
                }`,
              value: texts[index]?.value ?? '—',
              unit: texts[index]?.unit ?? '',
              size: fit.size,
              name: true,
            })}
          </div>`;
        })}
      </div>
      <div class="am-chart am-chart--several" style="width:${width}px" ${scrub(this.scrubber)}>
        ${
          loaded
            ? html`<svg
                class="fv-curve am-multi"
                width=${width}
                height=${H}
                viewBox="0 0 ${width} ${H}"
                aria-hidden="true"
              >
                <line
                  class="curve-cursor"
                  x1=${at.toFixed(2)}
                  y1=${top.toFixed(2)}
                  x2=${at.toFixed(2)}
                  y2=${H}
                />
                ${rows.map(({ tone, accent }, index) => {
                  const { values, o } = plots[index] as {
                    values: readonly number[];
                    o: PlotOptions;
                  };
                  const line = seriesPath(values, o);
                  if (!line) return nothing;
                  const dot = dots[index] ?? null;
                  const id = `am-fill-${index}`;
                  return svg`<g class="fv-tone--${tone}" data-accent=${accent ?? nothing}>
                      <defs><linearGradient id=${id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="curve-fill-a" /><stop offset="1" class="curve-fill-b" /></linearGradient></defs>
                      <path class="curve-area" d=${areaUnder(line, o)} fill="url(#${id})" stroke="none" />
                      <path class="curve-line" d=${line} pathLength="1" />
                      ${dot === null ? nothing : svg`<circle class="curve-dot" cx=${at.toFixed(2)} cy=${dot.toFixed(2)} r="5" />`}
                    </g>`;
                })}
              </svg>`
            : html`<div class="fv-skeleton" style="height:${H}px"></div>`
        }
      </div>
      <div class="am-axis ${time ? 'is-reading' : ''}">
        ${axis(this.axisItems(hours))} ${time ? this.whenPill(time, at) : nothing}
      </div>
    </article>`;
  }

  /**
   * While a chart of several curves is read, when that is: a pill on the axis row (the bubble's colours) under the cursor, kept inside
   * the column, over the hours it covers (one bubble in the plot would say a value no curve but one has).
   */
  private whenPill(time: string, at: number): TemplateResult {
    const pill = this.ruler.pill('am-when', time, 16);
    const left = Math.min(Math.max(at - pill / 2, 0), this.contentWidth - pill);
    return html`<span
      class="am-when"
      data-measure="value"
      style="left:${left.toFixed(2)}px;width:${pill}px"
      >${time}</span
    >`;
  }

  /** When a chart's moment was: its time, with its weekday on a window longer than a day ("Tue 09:47"). */
  private momentAt(fraction: number, hours: number): string {
    const when = new Date(this.now().getTime() - hours * HOUR_MS * (1 - fraction));
    const time = formatTime(this.hass, when);
    return hours > 24 ? `${formatDate(this.hass, when, 'weekday')} ${time}` : time;
  }

  /** "Now": the frozen moment of a test, else the clock. */
  private now(): Date {
    const frozen = this.config?._now ? new Date(this.config._now) : null;
    return frozen && !Number.isNaN(frozen.getTime()) ? frozen : new Date();
  }

  /** Another sensor's history ending on its reading now, as the card's own (`live`). */
  private liveOf(view: EntityView, series: Series | null | undefined): Series | null | undefined {
    const value = view.number;
    if (!series || value === null || series.values.length < 2) return series;
    return {
      values: [...series.values.slice(0, -1), value],
      min: Math.min(series.min, value),
      max: Math.max(series.max, value),
      average: series.average,
    };
  }
}
