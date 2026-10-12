import { energyHeight } from '../energy-family.js';
import {
  clock12,
  dateFormat,
  fetchHistory,
  formatNumber,
  formatTime,
  houseZone,
  isUsable,
  stateText,
  strings,
  wallClock,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type Series,
} from '@fluvy/core';

import {
  axis,
  chartBubble,
  curve,
  emptyState,
  head,
  readout,
  round,
  sampleAt,
  scrub,
  ScrubController,
  sheetStyles,
  type Tone,
} from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type SVGTemplateResult,
  type TemplateResult,
} from 'lit';

import { Card } from '../shared/base.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  numberField,
  selectField,
  textField,
} from '../shared/form.js';

import { HeadFit } from './head.js';
import { axisHolds } from '../shared/axis.js';

import { legendReadouts } from './legend.js';

import { costParts, readoutParts, scaled, scaleOf } from './power.js';
import { fetchPrefs } from '../energy-model/house.js';
import { fetchPeriod, houseMidnight, type PeriodEnergy } from '../energy-model/period.js';
import { allocate } from '../energy-model/allocate.js';
import { fetchPowerDay, liveTotals, powerBuckets, powered } from '../energy-model/power-day.js';
import { measureIds, readPrefs, type EnergyPrefs, type PrefSource } from '../energy-model/prefs.js';
import {
  chargedBatteries,
  chargeNow,
  chargePoints,
  fetchChargeDay,
} from '../energy-model/soc-day.js';
import {
  aggregate,
  chargeLine,
  crosses,
  flowShape,
  flowsOf,
  integrate,
  integrateFlows,
  LAYERS,
  meterBlock,
  OUTFLOWS,
  stackOf,
  stackShape,
  type Bucket,
  type ChargePoint,
  type FlowDay,
  type FlowPoint,
  type Layer,
  type Outflow,
  type StackPoint,
} from './stack.js';
import { energyLegend, type LegendEntry } from './legend-row.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';

const s = strings('energy');

export interface EnergyLegendItem {
  entity: string;
  name?: string;
}

export interface EnergyCardConfig extends FluvyCardConfig {
  subtitle?: string;
  /** Window of the curve. 24 (the default) draws today on a 00:00 … 24:00 axis; anything else rolls. */
  hours?: number;
  /** A price or running-cost sensor shown beside the big value (€/h, €/kWh, …). */
  cost_entity?: string;
  show_cost?: boolean;
  /** Up to three sensors under the chart (grid / solar / house energy today). */
  legend?: ReadonlyArray<string | EnergyLegendItem>;
  /**
   * `full` (default): the reading, the chart, its axis and the legend. `compact`: the head, the chart and its axis.
   * `sources`: the house's power today by where it came from, stacked, and what went to the grid below the line
   * (the Energy dashboard's meters; the entity, when given, is the reading at the top). `overview`: the whole house
   * today — every source's power above the line (the sun's whole production), the battery's charge and the export
   * below it, the house's use as a line and the batteries' state of charge on its own scale.
   */
  variant?: 'full' | 'compact' | 'sources' | 'overview';
  /** `overview`: the batteries' state of charge as a dashed line (on when the Energy dashboard names one). */
  show_soc?: boolean;
  /** `overview`: the house's use as a line over the sources. */
  show_house?: boolean;
  /** Test hook, as in the clock and calendar cards: an ISO instant the card takes for "now". */
  _now?: string;
}

const CHART_HEIGHT = 120;
/** The stacked chart of the `sources` variant: 160, the zero line where the day's use and export divide it. */
const SOURCES_CHART = 160;
/** The `overview` chart: 184, its tag's line (16) and 12 above the tallest stack and the charge's 100 %. */
const OVERVIEW_CHART = 184;
const OVERVIEW_TOP = 28;
/** The cursor starts under the chart's tag row (16) and 4 more, so it never runs into a tag's words. */
const CURSOR_TOP = 20;

/** A tag in a stacked chart: its words (or a figure, untracked), its box (16 tall), and the side it sits on. */
interface ChartTag {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly end: boolean;
  readonly figure: boolean;
}

/** A tag's classes: its side, and a figure's untracked set. */
const tagClass = (end: boolean, figure: boolean): string =>
  `en-chart__tag${end ? ' en-chart__tag--end' : ''}${figure ? ' en-chart__tag--figure' : ''}`;

/** The mask the lines and the cursor give way through, round each tag's box (4 round); the areas pass under them. */
const tagMask = (tags: readonly ChartTag[], w: number, h: number): SVGTemplateResult =>
  svg`<defs><mask id="en-tags" maskUnits="userSpaceOnUse" x="0" y="0" width=${w} height=${h}><rect width=${w} height=${h} fill="white"></rect>${tags.map((t) => svg`<rect x=${t.x - 4} y=${t.y - 4} width=${t.w + 8} height="24" rx="4" fill="black"></rect>`)}</mask></defs>`;

const tagSpan = (tag: ChartTag): TemplateResult =>
  html`<span class=${tagClass(tag.end, tag.figure)} style="top:${tag.y}px">${tag.text}</span>`;

/** The cursor's dots, drawn over the chart and its tags: a dot is never under a tag's words. */
const dotsOver = (w: number, h: number, dots: SVGTemplateResult | typeof nothing): TemplateResult =>
  html`<svg
    class="en-chart__dots"
    width=${w}
    height=${h}
    viewBox="0 0 ${w} ${h}"
    aria-hidden="true"
    data-measure="drawn"
  >
    ${dots}
  </svg>`;
/** Narrower than this, three legend readouts would cut their words: they stack, one a line. */
const STACK_BELOW = 240;
const HEADROOM = 44; // the bubble's room: the chart rule in design/language.md
const POINTS = 48; // a full window: one point per half hour of a day
const REFRESH = 5 * 60_000; // how long the shared history cache keeps an answer
const DAY_MINUTES = 24 * 60;
const DAY_FROM = 3; // hours into the day from which "24 h" means the calendar day (40 px of curve in a 320 column)

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** The point nearest `at` within one bucket (`step`), or none: nothing is read across a gap. */
function nearest<P extends { readonly at: number }>(
  points: readonly P[],
  at: number,
  step: number,
): P | undefined {
  const near = points.reduce<P | undefined>(
    (best, p) => (!best || Math.abs(p.at - at) < Math.abs(best.at - at) ? p : best),
    undefined,
  );
  return near && Math.abs(near.at - at) <= step ? near : undefined;
}

/** Minutes into the day on the clock Home Assistant shows (the server's zone when the user chose it). */
function minutesIntoDay(hass: HomeAssistant | undefined, now: Date): number {
  const wall = wallClock(now, houseZone(hass));
  return wall.hour * 60 + wall.minute + wall.second / 60;
}

/**
 * Today's buckets for the `sources` and `overview` variants: the power sensors' five-minute means (kW) or the meters'
 * blocks (kWh), one bucket's length, the house's midnight, and — from the meters — the hours as the Energy dashboard
 * allocates them, which the legend quotes so its figures match the dashboard's.
 */
interface SourcesDay {
  readonly buckets: readonly Bucket[];
  readonly minutes: number;
  readonly unit: 'kW' | 'kWh';
  readonly midnight: number;
  readonly hours: PeriodEnergy | null;
}

/** The by-source day's energy by origin (kWh): what its legend says. */
interface UsedDay {
  readonly used: Readonly<Record<Layer, number>>;
  readonly charged: number;
  readonly exported: number;
}

interface ChartWindow {
  /** The axis is the calendar day and the series covers midnight → now. */
  readonly day: boolean;
  /** Hours of history to ask for. */
  readonly hours: number;
  readonly points: number;
  /** Fraction of the axis the series covers. */
  readonly extent: number;
}

/**
 * Power now and today's curve: the big tabular figure with its running cost, the power sensor drawn
 * up to "now" with the value bubble on the cursor, the axis, and up to three totals as a legend row.
 *
 * On a 24 h card the axis IS the day: the series covers midnight → now and the curve stops at the
 * true fraction of the day elapsed (before 03:00 there is no day to draw yet, and the last 24 h roll).
 * Any other window rolls: the series spans the full width and the axis counts back in hours.
 */
export class FluvyEnergyCard extends Card<EnergyCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: EnergyCardConfig): number {
    return energyHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    css`
      .ef-card {
        width: 100%;
      } /* the sheet fixes 360; a card takes the column it is given */
      .ef-cols {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      /* three totals in a column too narrow for three words: one a line */
      .ef-cols--stack {
        grid-template-columns: minmax(0, 1fr);
      }
      .ef-cols .fv-readout {
        min-width: 0;
      }
      .ef-cols .fv-readout__label {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      } /* names may ellipsize, values never */
      .ef-chart .fv-skeleton {
        height: ${CHART_HEIGHT}px;
      }
      .ef-chart .fv-curve {
        display: block;
        overflow: visible;
      } /* the dot at "now" stays whole when now is the edge of the axis */
      .is-unavailable .fv-curve .curve-dot,
      .is-unavailable .fv-curve .curve-cursor {
        display: none;
      } /* the history is real; a reading at "now" is not */
      .fv-axis span {
        white-space: nowrap;
      } /* "12 AM" on a 12-hour clock is one label */
      /* the bubble arrives with the dot it belongs to, after the line has drawn itself */
      .ef-chart .fv-bubble {
        animation: fv-fade 500ms var(--fv-ease) both;
        animation-delay: calc(var(--fv-enter-delay, 0ms) + 620ms);
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    series_: { state: true },
    loaded_: { state: true },
    day_: { state: true },
    charge_: { state: true },
  };

  declare series_: Series | null;
  declare loaded_: boolean;
  /**
   * The `sources` and `overview` variants: today's buckets (from the power sensors' five-minute means when the Energy
   * dashboard names them, else from its meters in fifteen-minute blocks). Shaped when drawn, so a variant changed in
   * the editor draws from the same day at once.
   */
  declare day_: SourcesDay | null;
  /** `overview`: the batteries' state of charge through today (null: none stated, or not readable). */
  declare charge_: ChargePoint[] | null;
  /** Each day's shapes, made once per day fetched. */
  private readonly shaped = new WeakMap<
    SourcesDay,
    { stack?: StackPoint[]; flows?: FlowPoint[] }
  >();
  /** The charge request already made. */
  private askedCharge = '';
  private prefs: EnergyPrefs | null | undefined;
  /** Where the chart is being read (a fraction of its width); null: it shows now. */
  private readonly scrubber = new ScrubController(this);

  /** The request already made, so a re-render does not repeat it. */
  private asked = '';
  private readonly head = new HeadFit(this);

  constructor() {
    super();
    this.series_ = null;
    this.loaded_ = false;
    this.day_ = null;
    this.charge_ = null;
  }

  static override keys = configKeys<EnergyCardConfig>()([
    'subtitle',
    'hours',
    'cost_entity',
    'show_cost',
    'legend',
    'variant',
    'show_soc',
    'show_house',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'legend',
      title: 'editor.rows',
      domains: ['sensor'],
      keys: ['entity', 'name'],
      schema: [entityField(['sensor']), textField('name')],
    },
  ];
  /** The card's head is its sensor's name (`title` was the older word for it); a legend item's `label` is its name. */
  static override aliases: AliasSpec = {
    keys: [{ from: 'title', to: 'name' }],
    items: { legend: ITEM_ALIASES },
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'full',
    show_cost: true,
    show_soc: true,
    show_house: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['sensor']),
        fieldRow(textField('name'), textField('subtitle')),
        iconField(),
        ...colourFields(),
        fieldRow(
          numberField('hours', 1, 168),
          selectField('variant', ['full', 'compact', 'sources', 'overview']),
        ),
        fieldRow(boolField('show_soc'), boolField('show_house')),
        fieldRow(entityField(['sensor'], 'cost_entity', false), boolField('show_cost')),
        entitiesField('legend', ['sensor']),
        actionFields(),
      ],
      ...editorLabels(s, { cost_entity: 'cost', legend: 'editor_legend' }, {}),
    };
  }

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): EnergyCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    const entity =
      sensors.find((id) => hass?.states[id]?.attributes.device_class === 'power') ??
      sensors[0] ??
      '';
    return { type: 'custom:fluvy-energy-card', entity };
  }

  protected override prepare(config: EnergyCardConfig): EnergyCardConfig {
    if (!config.entity && config.variant !== 'sources' && config.variant !== 'overview')
      throw new Error('fluvy-energy-card: "entity" is required');
    return config;
  }

  private get bySource(): boolean {
    return this.config?.variant === 'sources';
  }

  private get wholeHouse(): boolean {
    return this.config?.variant === 'overview';
  }

  /** Drawn from the Energy dashboard's sources (by source, or the whole house). */
  private get fromSources(): boolean {
    return this.bySource || this.wholeHouse;
  }

  private get compact(): boolean {
    return this.config?.variant === 'compact';
  }

  override getCardSize(): number {
    return this.compact ? 4 : this.legend().length ? 7 : 6;
  }
  /** The full card takes a section, the compact one half of it: a chart still reads in a half. */
  override getGridOptions(): LovelaceGridOptions {
    return this.compact
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    const ids = this.legend().map((item) => item.entity);
    if (this.config?.entity) ids.push(this.config.entity);
    if (this.config?.cost_entity) ids.push(this.config.cost_entity);
    // by source, "right now" is the house's own use: every source's power sensor
    if (this.fromSources) ids.push(...this.prefSources().flatMap((p) => measureIds(p.measure)));
    // the whole house quotes its batteries' charge now
    if (this.wholeHouse) ids.push(...chargedBatteries(this.prefSources()).map((b) => b.soc ?? ''));
    return ids;
  }

  /** The Energy dashboard's sources (known once the preferences have been read). */
  private prefSources(): readonly PrefSource[] {
    return this.prefs ? readPrefs(this.prefs).sources : [];
  }

  private legend(): EnergyLegendItem[] {
    return (this.config?.legend ?? [])
      .slice(0, 3)
      .map((item) => (typeof item === 'string' ? { entity: item } : item));
  }

  /* ---------- history ---------- */

  private now(): Date {
    const frozen = this.config?._now ? new Date(this.config._now) : undefined;
    return frozen && !Number.isNaN(frozen.getTime()) ? frozen : new Date();
  }

  private chartWindow(now: Date = this.now()): ChartWindow {
    const asked = clamp(Math.round(Number(this.config?.hours ?? 24)) || 24, 1, 168);
    const minutes = minutesIntoDay(this.hass, now);
    // the first hours of a day are a few pixels of curve blown up to full height: until there is a day to draw, the last 24 h roll
    if (asked !== 24 || minutes < DAY_FROM * 60)
      return { day: false, hours: asked, points: POINTS, extent: 1 };
    // asked in five-minute steps, so cards opened within the same beat share one cached answer
    const hours = Math.floor(minutes / 5) / 12;
    return {
      day: true,
      hours,
      points: clamp(Math.round(hours * 2), 2, POINTS),
      extent: clamp(minutes / DAY_MINUTES, 0, 1),
    };
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const previous = changed.get('config') as EnergyCardConfig | undefined;
    if (
      previous &&
      (previous.entity !== this.config?.entity || previous.hours !== this.config?.hours)
    ) {
      this.series_ = null; // another sensor or window: its curve is loading, the old one is not shown in its place
      this.loaded_ = false;
      this.asked = '';
    }
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.wholeHouse) void this.loadCharge();
    if (this.fromSources) return this.loadSources();
    const id = this.config?.entity;
    const hass = this.hass;
    if (!id || !hass?.states[id]) return;
    const { hours, points } = this.chartWindow();
    const key = `${id}|${hours}|${points}|${Math.floor(this.now().getTime() / REFRESH)}`;
    if (key === this.asked) return;
    this.asked = key;
    const series = await fetchHistory(hass, id, hours, points);
    if (key !== this.asked) return; // a newer request owns the chart
    this.series_ = series;
    this.loaded_ = true;
  }

  /**
   * Today's buckets. With the power sensors the Energy dashboard names for every source, they are their five-minute
   * means — what Home Assistant's own "Power sources" graph draws — and the legend their integral. Without them, the
   * meters: their five-minute changes summed into fifteen-minute blocks (coarse meters even out), and the legend the
   * hours as the dashboard allocates them.
   */
  private async loadSources(): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const now = this.now();
    const key = `sources|${Math.floor(now.getTime() / 300_000)}`;
    if (key === this.asked) return;
    this.asked = key;
    this.prefs ??= await fetchPrefs(hass);
    const all = readPrefs(this.prefs).sources;
    const midnight = houseMidnight(hass, now).getTime();
    if (powered(all)) {
      const rows = await fetchPowerDay(hass, all, now);
      if (key !== this.asked) return;
      const buckets = rows ? powerBuckets(rows, all) : [];
      if (buckets.length) {
        this.day_ = { buckets, minutes: 5, unit: 'kW', midnight, hours: null };
        this.loaded_ = true;
        return;
      }
    }
    const metered = all.filter((p) => p.energyIn.length || p.energyOut.length);
    if (!metered.length) {
      this.day_ = null;
      this.loaded_ = true;
      return;
    }
    const [fine, hours] = await Promise.all([
      fetchPeriod(hass, metered, 'day', now, [], '5minute'),
      fetchPeriod(hass, metered, 'day', now),
    ]);
    if (key !== this.asked) return;
    // a block over which the meters' own step does not show (15 minutes for a precise meter)
    const minutes = fine ? meterBlock(fine.buckets) : 15;
    this.day_ = fine
      ? {
          buckets: aggregate(fine.buckets, midnight, minutes),
          minutes,
          unit: 'kWh',
          midnight,
          hours,
        }
      : null;
    this.loaded_ = true;
  }

  /** The batteries' state of charge through today (`overview`). */
  private async loadCharge(): Promise<void> {
    const hass = this.hass;
    if (!hass || this.config?.show_soc === false) return;
    const now = this.now();
    const key = `charge|${Math.floor(now.getTime() / 300_000)}`;
    if (key === this.askedCharge) return;
    this.askedCharge = key;
    this.prefs ??= await fetchPrefs(hass);
    const batteries = chargedBatteries(readPrefs(this.prefs).sources);
    const rows = batteries.length ? await fetchChargeDay(hass, batteries, now) : null;
    if (key !== this.askedCharge) return;
    this.charge_ = rows ? chargePoints(rows, batteries, houseMidnight(hass, now).getTime()) : null;
  }

  /** Today's points by origin (`sources`), shaped once per day fetched. */
  private stackPoints(day: SourcesDay): StackPoint[] {
    const cached = this.shaped.get(day) ?? {};
    cached.stack ??= stackOf(day.buckets, day.midnight, day.minutes, day.unit);
    this.shaped.set(day, cached);
    return cached.stack;
  }

  /** Today's flows (`overview`), shaped once per day fetched. */
  private flowPoints(day: SourcesDay): FlowPoint[] {
    const cached = this.shaped.get(day) ?? {};
    cached.flows ??= flowsOf(day.buckets, day.midnight, day.minutes, day.unit);
    this.shaped.set(day, cached);
    return cached.flows;
  }

  /** The by-source legend's day: the power's integral, or the meters' hours as the dashboard allocates them. */
  private usedDay(day: SourcesDay, points: readonly StackPoint[]): UsedDay | null {
    if (day.unit === 'kW') return integrate(points, day.minutes);
    const a = day.hours?.allocation;
    return a
      ? {
          used: {
            solar: a.usedSolar,
            battery: a.usedBattery,
            gas: a.usedGenerator,
            vehicle: a.usedVehicle,
            grid: a.usedGrid,
          },
          charged: a.solarToBattery + a.gridToBattery,
          exported: a.solarToGrid + a.batteryToGrid,
        }
      : null;
  }

  /** The whole house's legend: the power's integral, or the meters' hours (their sums, the house as allocated). */
  private flowDay(day: SourcesDay, points: readonly FlowPoint[]): FlowDay | null {
    if (day.unit === 'kW') return integrateFlows(points, day.minutes);
    const h = day.hours;
    if (!h) return null;
    const t = h.totals;
    return {
      into: {
        solar: t.solar,
        battery: t.fromBattery,
        gas: t.generator ?? 0,
        vehicle: t.fromVehicle ?? 0,
        grid: t.fromGrid,
      },
      out: { battery: t.toBattery, vehicle: t.toVehicle ?? 0, grid: t.toGrid },
      house: h.allocation.usedTotal,
    };
  }

  /** A tag at `y`, at the chart's start or its end, measured as it is set. */
  private chartTag(text: string, y: number, end: boolean, width: number, figure = false): ChartTag {
    const w = this.head.ruler.width(tagClass(end, figure), text);
    return { text, x: end ? width - w : 0, y, w, end, figure };
  }

  /**
   * What the house uses right now, in watts: every source's live power allocated as the flow card does. `null` when the
   * sources do not say their power, or one cannot be read.
   */
  private houseNow(): number | null {
    const sources = this.prefSources();
    if (!powered(sources)) return null;
    const totals = liveTotals(sources, (id) => this.entity(id));
    return totals ? allocate(totals).usedTotal : null;
  }

  /* ---------- pieces ---------- */

  /** A power in watts as the readouts write it (W or kW, the house's precision). */
  private power(watts: number): { value: string; unit: string } {
    const scale = scaleOf([watts], 'W');
    return { value: scaled(this.hass, watts, scale), unit: scale.unit };
  }

  /** A day's energy as the legend writes it: one decimal, none from 100. */
  private kwh(v: number): string {
    return formatNumber(this.hass, v, { digits: v >= 100 ? 0 : 1, minDigits: v >= 100 ? 0 : 1 });
  }

  private dayAxis(): ReadonlyArray<readonly [number, string]> {
    const five = this.dayMarks([0, 6, 12, 18, 24]);
    // five labels that cannot keep 12 apart in the chart's width (a narrow card) read as three: midnight, noon, midnight
    // (the first sits on the start, the next centred a quarter in: a quarter less one and a half labels is their gap)
    const room = (this.contentWidth / 4 - 12) / 1.5;
    const fits = five.every(([, text]) => this.head.ruler.width('fv-axis', text) <= room);
    return fits ? five : this.dayMarks([0, 12, 24]);
  }

  /** The card's own title where it fits its head (with its circle and what trails it), else a shorter one. */
  private houseTitle(trailing: number): string {
    const room = this.contentWidth - 56 - (trailing ? trailing + 12 : 0);
    const long = s(this.hass, 'house_power');
    return this.head.ruler.width('fv-card__title', long) <= room
      ? long
      : s(this.hass, 'house_power_short');
  }

  /** The hours of the day axis, written as the house's clock writes them. */
  private dayMarks(marks: readonly number[]): ReadonlyArray<readonly [number, string]> {
    if (!clock12(this.hass))
      return marks.map((h) => [h / 24, `${String(h).padStart(2, '0')}:00`] as const);
    // "12 AM … 6 PM": the hour and a compact day period, which is all a 40 px label holds
    const clock = dateFormat(this.hass?.language ?? 'en', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'UTC',
    });
    return marks.map((h) => {
      const parts = clock.formatToParts(new Date(Date.UTC(2026, 0, 1, h % 24)));
      const hour = parts.find((p) => p.type === 'hour')?.value ?? String(h % 12 || 12);
      const period = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').replace(/[.\s]/g, '');
      return [h / 24, period ? `${hour} ${period}` : hour] as const;
    });
  }

  private rollingAxis(hours: number): ReadonlyArray<readonly [number, string]> {
    const days = hours >= 48;
    const back = (h: number): string =>
      s(this.hass, days ? 'days_ago' : 'hours_ago', {
        count: formatNumber(this.hass, days ? h / 24 : h, { digits: 1 }),
      });
    // three where they stand apart, else the two ends (fr's "Maintenant" on a narrow column)
    const three = [
      [0, back(hours)],
      [0.5, back(hours / 2)],
      [1, this.t('common.now')],
    ] as const;
    return axisHolds(this.head.ruler, this.contentWidth, three) ? three : [three[0], three[2]];
  }

  /** The point under the pointer: where the cursor goes, what it reads and when that was. */
  private scrubbed(
    values: readonly number[],
    view: EntityView,
    extent: number,
    day: boolean,
    hours: number,
  ): { cursor: number; parts: { value: string; unit: string }; time: string } | null {
    const fraction = this.scrubber.value;
    if (fraction === null || values.length < 2 || !(extent > 0)) return null;
    const cursor = Math.min(fraction, extent);
    const point = sampleAt(values, cursor / extent);
    if (point === null) return null;
    const now = this.now();
    const at = day
      ? new Date(new Date(now).setHours(0, 0, 0, 0) + cursor * DAY_MINUTES * 60_000)
      : new Date(now.getTime() - hours * 3_600_000 * (1 - cursor));
    return { cursor, parts: readoutParts(this.hass, view, point), time: formatTime(this.hass, at) };
  }

  private renderChart(
    extent: number,
    live: number | null,
    value: string,
    unit: string,
    at: { cursor: number; parts: { value: string; unit: string }; time: string } | null,
    tone: Tone,
  ): TemplateResult {
    if (!this.loaded_) return html`<div class="ef-chart"><div class="fv-skeleton"></div></div>`;
    const values = [...(this.series_?.values ?? [])];
    if (values.length < 2) {
      return html`<div class="ef-chart">${emptyState('bolt', s(this.hass, 'no_history'))}</div>`;
    }
    // history is up to five minutes old; the curve ends on the reading the bubble quotes
    if (live !== null) values[values.length - 1] = live;
    const w = this.contentWidth;
    const family = getComputedStyle(this).fontFamily;
    // the chart wears the card's tone: its curve is drawn in the same ink as the head
    return html`<div class="ef-chart fv-tone--${tone}" ${scrub(this.scrubber)}>
      ${curve(values, { w, h: CHART_HEIGHT, padTop: HEADROOM, extent, cursor: at?.cursor })}
      ${
        at
          ? chartBubble({
              x: at.cursor * w,
              width: w,
              value: at.parts.value,
              unit: at.parts.unit,
              time: at.time,
              family,
            })
          : live !== null
            ? chartBubble({ x: extent * w, width: w, value, unit, family })
            : nothing
      }
    </div>`;
  }

  protected renderCard(): TemplateResult {
    if (this.bySource) return this.renderSources();
    if (this.wholeHouse) return this.renderOverview();
    const view = this.entity();
    const title =
      this.config?.name ?? (view.status === 'missing' ? s(this.hass, 'title') : view.name);
    if (view.status === 'missing')
      return this.renderEmpty(`${title} · ${stateText(this.hass, view)}`);

    const off = !isUsable(view);
    const compact = this.compact;
    const tone: Tone = off ? 'off' : toneOf(this.config, 'solar');
    const live = view.status === 'ok' ? view.number : null;
    const { day, hours, extent } = this.chartWindow();
    const parts = readoutParts(this.hass, view);
    const sub =
      this.config?.subtitle ??
      (day
        ? `${view.areaName || this.t('energy.home')} · ${this.t('common.today').toLowerCase()}`
        : s(this.hass, 'last_hours', { hours: formatNumber(this.hass, hours, { digits: 0 }) }));
    const cost =
      this.config?.cost_entity && this.config.show_cost !== false
        ? costParts(this.hass, this.entity(this.config.cost_entity))
        : null;
    const legend = this.legend();
    const fitted = this.head.fit({ width: this.contentWidth, title, sub, trailing: 44 });
    const curveValues = [...(this.series_?.values ?? [])];
    if (live !== null && curveValues.length) curveValues[curveValues.length - 1] = live;
    const at = this.loaded_ ? this.scrubbed(curveValues, view, extent, day, hours) : null;

    return html`<article class="fv-card ef-card ${off ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'bolt') : null,
        tone,
        title,
        sub: fitted.sub,
        trailing: round('dots', 'quiet', this.t('common.more'), () =>
          this.tap(view.id, { action: 'more-info' }),
        ),
        onIconTap: () => this.tap(view.id),
        onHold: () => this.hold(view.id),
        iconLabel: title,
        name: true,
      })}
      ${
        compact
          ? nothing
          : html`<div class="ef-top fv-value-row">
              ${readout({ label: at ? at.time : s(this.hass, 'right_now'), value: at ? at.parts.value : parts.value, unit: at ? at.parts.unit : parts.unit, size: live === null && view.status === 'ok' ? 'm' : 'l' })}
              ${cost ? html`<div class="ef-top__side">${readout({ label: s(this.hass, 'cost'), value: cost.value, unit: cost.unit, size: 's' })}</div>` : nothing}
            </div>`
      }
      ${this.renderChart(extent, live, parts.value, parts.unit, at, off ? 'neutral' : tone)}
      ${axis(day ? this.dayAxis() : this.rollingAxis(hours))}
      ${
        legend.length && !compact
          ? html`<div
              class="ef-cols fv-cols ${this.contentWidth < STACK_BELOW ? 'ef-cols--stack' : ''}"
            >
              ${legendReadouts(this.hass, legend, (id) => this.entity(id))}
            </div>`
          : nothing
      }
    </article>`;
  }

  /* ---------- by source ---------- */

  private layerName(key: Layer): string {
    const flow = strings('energy-flow');
    return key === 'gas'
      ? flow(this.hass, 'kind_generator')
      : key === 'vehicle'
        ? flow(this.hass, 'kind_vehicle')
        : flow(this.hass, `kind_${key}`);
  }

  /**
   * The house's power today by where it came from: stacked areas of its use, under the line what went into the battery
   * and out to the grid, the day's legend; "right now" is the house's own use.
   */
  private renderSources(): TemplateResult {
    const id = this.config?.entity;
    const view = id ? this.entity(id) : undefined;
    const title = this.config?.name ?? this.houseTitle(view ? 44 : 0);
    const sub = this.config?.subtitle ?? s(this.hass, 'by_source');
    const fitted = this.head.fit({ width: this.contentWidth, title, sub, trailing: view ? 44 : 0 });
    const tone: Tone = toneOf(this.config, 'accent');
    const sourcesDay = this.day_;
    const step = (sourcesDay?.minutes ?? 5) / DAY_MINUTES;
    const now = this.now();
    const nowAt = minutesIntoDay(this.hass, now) / DAY_MINUTES;
    // meters only, as the whole house: the chart ends on the last bucket whose meters have closed, and reads it at rest
    const house = this.houseNow();
    const liveW = view && view.status === 'ok' ? readoutParts(this.hass, view) : null;
    const metersOnly = house === null && !liveW;
    const all = sourcesDay ? this.stackPoints(sourcesDay) : [];
    // a point sits at its bucket's middle: the bucket has closed half a step after it
    const closedOnly = metersOnly ? all.filter((p) => p.at + step / 2 <= nowAt + 1e-9) : all;
    const points = closedOnly.length ? closedOnly : all;
    const closed = metersOnly ? points[points.length - 1] : undefined;
    const end = closed?.at ?? nowAt;
    const w = this.contentWidth;
    const H = SOURCES_CHART;
    const shape = points.length ? stackShape(points, w, H, HEADROOM, step) : null;
    // the cursor: where the pointer reads, on the bucket it reads, never past the chart's end; nothing across a gap
    const fraction = this.scrubber.value;
    const asked = fraction !== null ? Math.min(fraction, end) : end;
    const cursorPoint =
      fraction !== null ? nearest(points, asked, step) : points[points.length - 1];
    const cursorAt = fraction !== null && cursorPoint ? cursorPoint.at : asked;
    const used = (p: StackPoint | undefined): number | null =>
      p ? LAYERS.reduce((sum, k) => sum + p.used[k], 0) : null;
    const power = (watts: number): { value: string; unit: string } => this.power(watts);
    const at = (moment: number): string =>
      formatTime(
        this.hass,
        new Date(houseMidnight(this.hass, now).getTime() + moment * 86_400_000),
      );
    const reading =
      fraction !== null
        ? {
            label: at(cursorAt),
            ...(cursorPoint ? power((used(cursorPoint) ?? 0) * 1000) : { value: '—', unit: '' }),
          }
        : house !== null
          ? { label: s(this.hass, 'right_now'), ...power(house) }
          : liveW
            ? { label: s(this.hass, 'right_now'), ...liveW }
            : closed
              ? { label: at(closed.at), ...power((used(closed) ?? 0) * 1000) }
              : null;
    const day = sourcesDay ? this.usedDay(sourcesDay, points) : null;
    const kwh = (v: number): string => this.kwh(v);
    const below = new Set(shape?.below.map((b) => b.key) ?? []);
    // the origins above the line; below it, where the energy went: the battery's ink and the grid's, at 60 %
    const legend: { ink: string; name: string; value: number; out?: boolean }[] = day
      ? [
          ...LAYERS.filter((k) => shape?.layers.some((l) => l.key === k)).map((k) => ({
            ink: `en-ink--${k}`,
            name: this.layerName(k),
            value: day.used[k],
          })),
          ...(below.has('charged')
            ? [
                {
                  ink: 'en-ink--battery',
                  name: s(this.hass, 'charged'),
                  value: day.charged,
                  out: true,
                },
              ]
            : []),
          ...(below.has('exported')
            ? [
                {
                  ink: 'en-ink--grid',
                  name: s(this.hass, 'exported'),
                  value: day.exported,
                  out: true,
                },
              ]
            : []),
        ]
      : [];
    const BELOW_INK = { charged: 'battery', exported: 'grid' } as const;
    const belowTag =
      below.has('charged') && below.has('exported')
        ? s(this.hass, 'charged_exported')
        : below.has('charged')
          ? s(this.hass, 'charged')
          : s(this.hass, 'exported');
    const top = used(cursorPoint);
    const tags: ChartTag[] = shape
      ? [
          this.chartTag(s(this.hass, 'used'), 0, false, w),
          ...(shape.below.length
            ? [this.chartTag(belowTag, Math.round(shape.zero + 12), false, w)]
            : []),
        ]
      : [];
    return html`<article class="fv-card ef-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'home') : null,
        tone,
        title,
        sub: fitted.sub,
        trailing: view
          ? round('dots', 'quiet', this.t('common.more'), () =>
              this.tap(view.id, { action: 'more-info' }),
            )
          : nothing,
        onIconTap: () => this.tap(id),
        onHold: () => this.hold(id),
        name: Boolean(this.config?.name),
      })}
      ${
        reading
          ? html`<div class="ef-top fv-value-row">
              ${readout({ label: reading.label, value: reading.value, unit: reading.unit, size: 'l' })}
            </div>`
          : nothing
      }
      ${
        !this.loaded_
          ? html`<div class="en-chart"><div class="fv-skeleton" style="height:${H}px"></div></div>`
          : !shape
            ? html`<div class="en-chart">
                ${
                  this.day_ === null
                    ? this.head.empty(
                        'bolt',
                        strings('energy-flow')(this.hass, 'no_period'),
                        strings('energy-flow')(this.hass, 'no_period_hint'),
                        this.contentWidth,
                      )
                    : emptyState('bolt', s(this.hass, 'no_history'))
                }
              </div>`
            : html`<div class="en-chart" ${scrub(this.scrubber)}>
                <svg
                  width=${w}
                  height=${H}
                  viewBox="0 0 ${w} ${H}"
                  aria-hidden="true"
                  data-measure="drawn"
                >
                  ${[...shape.layers]
                    .reverse()
                    .map(
                      (l) =>
                        svg`<path class="en-area en-ink--${l.key}" d=${l.area}></path><path class="en-area-line en-ink--${l.key}" d=${l.line}></path>`,
                    )}
                  ${shape.below.map(
                    (b) =>
                      svg`<path class="en-area en-ink--${BELOW_INK[b.key]} is-out" data-below=${b.key} d=${b.area}></path><path class="en-area-line en-ink--${BELOW_INK[b.key]} is-out" d=${b.line}></path>`,
                  )}
                  ${shape.below.length ? svg`<line class="en-zero" x1="0" x2=${w} y1=${shape.zero} y2=${shape.zero}></line>` : nothing}
                  ${tagMask(tags, w, H)}
                  <line
                    class="en-cursor"
                    mask="url(#en-tags)"
                    x1=${shape.x(cursorAt)}
                    x2=${shape.x(cursorAt)}
                    y1=${CURSOR_TOP}
                    y2=${H}
                  ></line>
                </svg>
                ${tags.map(tagSpan)}
                ${dotsOver(w, H, top !== null ? svg`<circle class="en-cursor-dot" r="5" cx=${shape.x(cursorAt)} cy=${shape.y(top)}></circle>` : nothing)}
              </div>`
      }
      ${axis(this.dayAxis())}
      ${energyLegend(
        legend.map((item) => ({
          ink: item.ink,
          name: item.name,
          value: kwh(item.value),
          unit: 'kWh',
          ...(item.out ? { square: 'out' as const } : {}),
        })),
        w,
        this.head.ruler,
      )}
    </article>`;
  }

  /* ---------- the whole house ---------- */

  /** The name of what left the house's sources, under the line: the battery's charge, a car's, the export. */
  private outName(key: Outflow): string {
    return key === 'battery'
      ? s(this.hass, 'charged')
      : key === 'grid'
        ? s(this.hass, 'exported')
        : this.layerName('vehicle');
  }

  /**
   * The whole house today, Home Assistant's "Power sources" convention: every source's power stacked above the line
   * (the sun's whole production first, the grid last), what went into the battery and out to the grid below it, the
   * house's use as a line over them and the batteries' charge as a dashed line on its own scale (100 % on the tag's
   * line, 0 % at the foot). Scrubbed, the readouts and the legend say that moment; at rest, now and the day.
   */
  private renderOverview(): TemplateResult {
    const id = this.config?.entity;
    const view = id ? this.entity(id) : undefined;
    const title = this.config?.name ?? this.houseTitle(view ? 44 : 0);
    const sub = this.config?.subtitle ?? s(this.hass, 'whole_house');
    const fitted = this.head.fit({ width: this.contentWidth, title, sub, trailing: view ? 44 : 0 });
    const tone: Tone = toneOf(this.config, 'accent');
    const day = this.day_;
    const step = (day?.minutes ?? 5) / DAY_MINUTES;
    const now = this.now();
    const nowAt = minutesIntoDay(this.hass, now) / DAY_MINUTES;
    // no live power for the house (meters only): a bucket whose meters have not closed reads low, so the chart ends
    // on the last one that has, and that is the moment the top row and the cursor read at rest
    const house = this.houseNow();
    const liveW = view && view.status === 'ok' ? readoutParts(this.hass, view) : null;
    const metersOnly = house === null && !liveW;
    const all = day ? this.flowPoints(day) : [];
    // a point sits at its bucket's middle: the bucket has closed half a step after it
    const closedOnly = metersOnly ? all.filter((p) => p.at + step / 2 <= nowAt + 1e-9) : all;
    const points = closedOnly.length ? closedOnly : all;
    const closed = metersOnly ? points[points.length - 1] : undefined;
    const restAt = closed?.at ?? nowAt;
    const w = this.contentWidth;
    const H = OVERVIEW_CHART;
    const shape = points.length ? flowShape(points, w, H, OVERVIEW_TOP, step) : null;
    const showHouse = this.config?.show_house !== false;

    // the batteries' charge: through today from the recorder, ending on the live reading
    const batteries = this.config?.show_soc === false ? [] : chargedBatteries(this.prefSources());
    const levelNow = batteries.length
      ? chargeNow(batteries, (soc) => {
          const v = this.entity(soc);
          return v.status === 'ok' ? v.number : null;
        })
      : null;
    const charge: ChargePoint[] = batteries.length
      ? [
          // the recorder's last five minutes may sit past now (their middle): the live reading takes their place
          ...(this.charge_ ?? []).filter((p) => levelNow === null || p.at < nowAt),
          ...(levelNow !== null ? [{ at: nowAt, level: levelNow }] : []),
        ]
      : [];
    // the recorder's last five minutes arrive late: a reading up to a quarter of an hour from the next is joined.
    // The charge keeps to the positive half: 100 % on the tag's line, 0 % on the kW zero line (the foot when nothing
    // left the house), so a low battery never reads as an outflow (issue #28)
    const chargeStep = 10 / DAY_MINUTES;
    const soc =
      shape && charge.length > 1
        ? chargeLine(charge, w, OVERVIEW_TOP, shape.zero, chargeStep)
        : null;

    // the cursor: where the pointer reads, else now; nothing is read across a gap
    const fraction = this.scrubber.value;
    const scrubbing = fraction !== null;
    // the cursor: never past the chart's end (the last closed bucket on meters only), on the bucket it reads
    const asked = scrubbing ? Math.min(fraction, restAt) : restAt;
    const cursorPoint = scrubbing ? nearest(points, asked, step) : points[points.length - 1];
    const cursorAt = scrubbing && cursorPoint ? cursorPoint.at : asked;
    // the charge at the moment the row reads: now, or the closed bucket's time on meters only
    const cursorLevel =
      scrubbing || closed
        ? (nearest(charge, cursorAt, chargeStep)?.level ?? null)
        : (levelNow ?? charge[charge.length - 1]?.level ?? null);

    const at = (fraction: number): string =>
      formatTime(
        this.hass,
        new Date(houseMidnight(this.hass, now).getTime() + fraction * 86_400_000),
      );
    const reading = scrubbing
      ? {
          label: at(cursorAt),
          ...(cursorPoint ? this.power(cursorPoint.house * 1000) : { value: '—', unit: '' }),
        }
      : house !== null
        ? { label: s(this.hass, 'right_now'), ...this.power(house) }
        : liveW
          ? { label: s(this.hass, 'right_now'), ...liveW }
          : closed
            ? { label: at(closed.at), ...this.power(closed.house * 1000) }
            : null;
    const level = batteries.length
      ? {
          label: s(this.hass, 'battery'),
          value: cursorLevel === null ? '—' : formatNumber(this.hass, cursorLevel, { digits: 0 }),
          unit: cursorLevel === null ? '' : '%',
        }
      : null;

    // the legend: a square for each area drawn, the day's energy at rest and the power under the cursor while read —
    // one unit and one precision for the whole row ("1.3 kW" beside "0.9 kW", never "907 W")
    const total = day ? this.flowDay(day, points) : null;
    const read = cursorPoint
      ? [...LAYERS.map((k) => cursorPoint.into[k]), ...OUTFLOWS.map((k) => cursorPoint.out[k])]
      : [];
    const rowScale = scaleOf(
      read.map((kw) => kw * 1000),
      'W',
    );
    const figure = (
      kw: number | undefined,
      kwhs: number | undefined,
    ): { value: string; unit: string } =>
      scrubbing
        ? kw === undefined
          ? { value: '—', unit: '' }
          : {
              value: formatNumber(this.hass, (kw * 1000) / rowScale.divisor, {
                digits: rowScale.divisor === 1 ? 0 : 1,
                minDigits: rowScale.divisor === 1 ? 0 : 1,
              }),
              unit: rowScale.unit,
            }
        : { value: this.kwh(kwhs ?? 0), unit: 'kWh' };
    const legend: LegendEntry[] =
      shape && (total || scrubbing)
        ? [
            ...shape.above.map((a) => ({
              ink: `en-ink--${a.key}`,
              name: this.layerName(a.key),
              ...figure(cursorPoint?.into[a.key], total?.into[a.key]),
            })),
            ...shape.below.map((b) => ({
              ink: `en-ink--${b.key}`,
              name: this.outName(b.key),
              square: 'out' as const,
              ...figure(cursorPoint?.out[b.key], total?.out[b.key]),
            })),
          ]
        : [];
    const belowKeys = new Set(shape?.below.map((b) => b.key) ?? []);
    const belowTag =
      belowKeys.has('battery') && belowKeys.has('grid')
        ? s(this.hass, 'charged_exported')
        : belowKeys.has('battery')
          ? s(this.hass, 'charged')
          : belowKeys.has('grid')
            ? s(this.hass, 'exported')
            : this.layerName('vehicle');
    const dotAt = cursorPoint
      ? showHouse
        ? cursorPoint.house
        : LAYERS.reduce((sum, k) => sum + cursorPoint.into[k], 0)
      : null;
    const stacked = this.contentWidth < STACK_BELOW;
    // the tags: the lines and the cursor give way round them, the dots sit above them; the one under the line goes
    // to the side the charge does not cross, and where it crosses both, the legend names the areas alone
    const tags: ChartTag[] = [];
    if (shape) {
      tags.push(this.chartTag(s(this.hass, 'sources_tag'), 0, false, w));
      if (soc) tags.push(this.chartTag('100 %', 0, true, w, true));
      if (shape.below.length) {
        const y = Math.round(shape.zero + 12);
        const free = (tag: ChartTag): boolean =>
          !soc || !crosses(soc.runs, { x: tag.x - 6, y: tag.y - 6, w: tag.w + 12, h: 28 });
        const side = [
          this.chartTag(belowTag, y, false, w),
          this.chartTag(belowTag, y, true, w),
        ].find(free);
        if (side) tags.push(side);
      }
    }
    return html`<article class="fv-card ef-card ef-card--overview" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'home') : null,
        tone,
        title,
        sub: fitted.sub,
        trailing: view
          ? round('dots', 'quiet', this.t('common.more'), () =>
              this.tap(view.id, { action: 'more-info' }),
            )
          : nothing,
        onIconTap: () => this.tap(id),
        onHold: () => this.hold(id),
        name: Boolean(this.config?.name),
      })}
      ${
        reading || level
          ? html`<div class="ef-top fv-value-row ${stacked ? 'is-stacked' : ''}">
              ${reading ? html`<div class="ef-key ${showHouse && shape ? 'ef-key--house' : ''}">${readout({ label: reading.label, value: reading.value, unit: reading.unit, size: 'l' })}</div>` : nothing}
              ${level ? html`<div class="${reading ? 'ef-top__side' : ''} ef-key ${soc ? 'ef-key--soc' : ''} en-ink--battery">${readout({ label: level.label, value: level.value, unit: level.unit, size: 's' })}</div>` : nothing}
            </div>`
          : nothing
      }
      ${
        !this.loaded_
          ? html`<div class="en-chart"><div class="fv-skeleton" style="height:${H}px"></div></div>`
          : !shape
            ? html`<div class="en-chart">
                ${
                  this.day_ === null
                    ? this.head.empty(
                        'bolt',
                        strings('energy-flow')(this.hass, 'no_period'),
                        strings('energy-flow')(this.hass, 'no_period_hint'),
                        this.contentWidth,
                      )
                    : emptyState('bolt', s(this.hass, 'no_history'))
                }
              </div>`
            : html`<div class="en-chart" ${scrub(this.scrubber)}>
                <svg
                  width=${w}
                  height=${H}
                  viewBox="0 0 ${w} ${H}"
                  aria-hidden="true"
                  data-measure="drawn"
                >
                  ${[...shape.above]
                    .reverse()
                    .map(
                      (a) =>
                        svg`<path class="en-area en-ink--${a.key}" data-above=${a.key} d=${a.area}></path><path class="en-area-line en-ink--${a.key}" d=${a.line}></path>`,
                    )}
                  ${shape.below.map(
                    (b) =>
                      svg`<path class="en-area en-ink--${b.key} is-out" data-below=${b.key} d=${b.area}></path><path class="en-area-line en-ink--${b.key} is-out" d=${b.line}></path>`,
                  )}
                  ${shape.below.length ? svg`<line class="en-zero" x1="0" x2=${w} y1=${shape.zero} y2=${shape.zero}></line>` : nothing}
                  ${tagMask(tags, w, H)}
                  <g mask="url(#en-tags)">
                    ${showHouse ? svg`<path class="en-house" d=${shape.house}></path>` : nothing}
                    ${soc ? svg`<path class="en-soc-halo" d=${soc.line}></path>${soc.runs.map((run) => svg`<path class="en-soc en-ink--battery" d=${run.d} pathLength=${run.dashes}></path>`)}` : nothing}
                    <line
                      class="en-cursor"
                      x1=${shape.x(cursorAt)}
                      x2=${shape.x(cursorAt)}
                      y1=${CURSOR_TOP}
                      y2=${H}
                    ></line>
                  </g>
                </svg>
                ${tags.map(tagSpan)}
                ${dotsOver(
                  w,
                  H,
                  svg`${dotAt !== null ? svg`<circle class="en-cursor-dot" r="5" cx=${shape.x(cursorAt)} cy=${shape.y(dotAt)}></circle>` : nothing}${soc && cursorLevel !== null ? svg`<circle class="en-soc-dot en-ink--battery" r="3.75" cx=${shape.x(cursorAt)} cy=${soc.y(cursorLevel)}></circle>` : nothing}`,
                )}
              </div>`
      }
      ${axis(this.dayAxis())} ${energyLegend(legend, w, this.head.ruler)}
    </article>`;
  }
}
