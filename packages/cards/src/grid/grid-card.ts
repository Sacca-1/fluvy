import { gridHeight } from '../energy-family.js';
import {
  formatNumber,
  strings,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head, listRow, readout, sheetStyles, type Tone } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import {
  costStats,
  currencySymbol,
  fetchInfo,
  fetchMoney,
  moneyOf,
  type EnergyInfo,
} from '../energy-model/costs.js';
import { fetchPrefs } from '../energy-model/house.js';
import { downLine } from '../energy-model/outage.js';
import { fetchPeriod, type PeriodEnergy } from '../energy-model/period.js';
import { readPrefs, type EnergyPrefs, type PrefSource } from '../energy-model/prefs.js';
import { net, readMeasure, type Directed } from '../energy-model/reading.js';
import {
  bothWays,
  measureOfSource,
  prefSourceConfig,
  sourceIds,
  type SourceConfig,
} from '../energy-model/sources.js';
import {
  bucketOf,
  isStale,
  LIVE_TICK,
  liveWords,
  newestReport,
  staleShorter,
} from '../energy/freshness.js';
import { HeadFit } from '../energy/head.js';
import { legendStats } from '../energy/legend.js';
import { phaseBlock, phaseStyles, phaseWatts } from '../energy/phases.js';
import { costParts, scaled, scaleOf, type Scale } from '../energy/power.js';
import { MEASURE_WORDS, measureFields, PHASES_ALIAS } from '../energy/sources-editor.js';
import { statsCols, statsStyles, type Stat } from '../energy/stats.js';
import { Card, type BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import {
  actionFields,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import { statsSize } from '../shared/readouts.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { Ticker } from '../shared/ticker.js';
import { connectionOf, gridWay, meanOf, type GridWay } from './grid.js';

const g = strings('grid');
const f = strings('energy-flow');

export interface GridReadout {
  entity: string;
  name?: string;
}

export interface GridCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** The grid read the way a source is: one signed sensor (+ import) … */
  power?: string;
  /** … one per phase (each signed, summed per sign) … */
  phases?: readonly string[];
  /** … or two, both positive. None of them: the Energy dashboard's first grid connection. */
  import?: string;
  export?: string;
  /** The sensors count export as positive. */
  invert?: boolean;
  /** A voltage sensor per phase, in the phases' order. */
  voltages?: readonly string[];
  /** A sensor of the price right now. */
  price?: string;
  /** Up to three totals under it. None: today's imported, exported and net cost from the Energy dashboard. */
  readouts?: ReadonlyArray<string | GridReadout>;
  /** The tests' clock. */
  _now?: string;
}

/* the value row (fluvy.css): a 16 gap between the reading and In / Out; In / Out's 12 between word and figure */
const ROW_GAP = 16;
const INOUT_GAP = 12;

interface Model {
  /** How the grid is read (its own sensors, or the Energy dashboard's connection's); null: nothing to read. */
  readonly source: SourceConfig | null;
  /** The Energy dashboard's connection it is (its meters and money). */
  readonly connection: PrefSource | undefined;
  readonly reading: Directed;
  readonly net: number | null;
  readonly phases: readonly (number | null)[] | null;
  readonly volts: readonly (number | null)[];
  readonly way: GridWay | null;
  readonly dead: boolean;
  readonly stale: boolean;
  readonly scale: Scale;
}

/**
 * The grid: the net import or export right now in large, what comes in and goes out beside it when the meter can
 * tell them apart (read per phase, or by two sensors), each phase centred on zero with its voltage, the price now,
 * and today's totals — from the grid's own sensors, or from the Energy dashboard's first grid connection.
 */
export class FluvyGridCard extends Card<GridCardConfig> {
  static override layoutHeight(config: GridCardConfig, hass?: HomeAssistant): number {
    return gridHeight(config, hass);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    phaseStyles,
    statsStyles,
    css`
      .ef-card {
        width: 100%;
      }
      .ef-top > .fv-readout {
        min-width: 0;
      }
      /* too narrow for In / Out beside the reading: they go under it, on the column's start */
      .en-inout--below {
        justify-content: start;
        justify-items: start;
        grid-auto-rows: 20px;
        margin-top: 8px;
      }
      /* the word's line box closes on its ink, so each baseline-aligned pair stays inside its 20 row */
      .en-inout--below span {
        line-height: 16px;
      }
      /* too narrow even for a word beside its figure ("Einspeisung 0,4 kW" in half a column): each word over its figure */
      .en-inout--column {
        grid-template-columns: minmax(0, 1fr);
      }
    `,
  ];

  /** A meter of several sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<GridCardConfig>()([
    'title',
    'subtitle',
    'power',
    'phases',
    'import',
    'export',
    'invert',
    'voltages',
    'price',
    'readouts',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'readouts',
      title: 'editor.rows',
      domains: ['sensor'],
      keys: ['entity', 'name'],
      schema: [entityField(['sensor']), textField('name')],
    },
  ];
  static override aliases: AliasSpec = {
    keys: [PHASES_ALIAS],
    items: { readouts: ITEM_ALIASES },
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ invert: false });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        ...measureFields(),
        entitiesField('voltages', ['sensor']),
        fieldRow(entityField(['sensor'], 'price', false), iconField()),
        showIconField(),
        entitiesField('readouts', ['sensor']),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(
        g,
        { voltages: 'editor_voltages', price: 'editor_price', readouts: 'editor_readouts' },
        Object.fromEntries(
          Object.entries(MEASURE_WORDS).map(([key, word]) => [key, `energy-flow.${word}` as const]),
        ),
      ),
    };
  }

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): GridCardConfig {
    const power = entities.find(
      (id) =>
        id.startsWith('sensor.') &&
        hass?.states[id]?.attributes.device_class === 'power' &&
        /grid|mains|meter|net/i.test(id),
    );
    // nothing recognisable: the Energy dashboard's first grid connection
    return { type: 'custom:fluvy-grid-card', ...(power ? { power } : {}) };
  }

  private readonly head = new HeadFit(this);
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  private info: EnergyInfo | null | undefined;
  private infoAsked = false;
  private today: PeriodEnergy | null | undefined;
  private todayKey = '';
  /** The five minutes today's totals were last asked for in. */
  private asked = 0;
  private money: Map<string, number> | null | undefined;
  private moneyKey = '';
  private shownSub = '';
  private model: Model | undefined;

  constructor() {
    super();
    // "Live · 5 s ago" is a claim about the clock; today's totals are asked for again when their cache runs out
    new Ticker(
      this,
      () =>
        !!this.config &&
        ((!this.readouts().length && bucketOf(this.now()) !== this.asked) ||
          (this.config.subtitle === undefined && this.subNow() !== this.shownSub)),
      LIVE_TICK,
    );
  }

  override getCardSize(): number {
    return Math.ceil(FluvyGridCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  /** The grid as the card's own sensors read it; null when it names none. */
  private own(): SourceConfig | null {
    const c = this.config;
    if (!c) return null;
    const own: SourceConfig = {
      type: 'grid',
      ...(c.power ? { power: c.power } : {}),
      ...(c.phases?.length ? { phases: c.phases } : {}),
      ...(c.import ? { import: c.import } : {}),
      ...(c.export ? { export: c.export } : {}),
      ...(c.invert ? { invert: true } : {}),
    };
    return measureOfSource(own) ? own : null;
  }

  private readouts(): GridReadout[] {
    return (this.config?.readouts ?? [])
      .slice(0, 3)
      .map((r) => (typeof r === 'string' ? { entity: r } : r))
      .filter((r) => typeof r.entity === 'string' && r.entity !== '');
  }

  protected override watched(): readonly string[] {
    const source = this.model?.source ?? this.own();
    return [
      ...(source ? sourceIds(source) : []),
      ...(this.config?.voltages ?? []),
      this.config?.price,
      ...this.readouts().map((r) => r.entity),
    ].filter((id): id is string => !!id);
  }

  private now(): number {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(pinned) ? pinned : Date.now();
  }

  /* ---------- lifecycle ---------- */

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.config || !this.hass) return;
    this.ask(this.hass);
    this.model = this.build();
  }

  /** The Energy dashboard: the grid when the card names no sensor, and today's totals when it names no readouts. */
  private ask(hass: HomeAssistant): void {
    const totals = !this.readouts().length;
    if (!this.prefsAsked && (!this.own() || totals)) {
      this.prefsAsked = true;
      void fetchPrefs(hass).then((prefs) => {
        this.prefs = prefs;
        this.requestUpdate();
      });
    }
    if (!totals || this.prefs === undefined) return;
    if (!this.infoAsked) {
      this.infoAsked = true;
      void fetchInfo(hass).then((info) => {
        this.info = info;
        this.requestUpdate();
      });
    }
    const now = new Date(this.now());
    this.asked = bucketOf(now.getTime());
    const connection = this.connection();
    if (!connection) return;
    const bucket = String(this.asked);
    const key = `${bucket}|${[...connection.energyIn, ...connection.energyOut].join(',')}`;
    if (key !== this.todayKey && (connection.energyIn.length || connection.energyOut.length)) {
      this.todayKey = key;
      void fetchPeriod(hass, [connection], 'day', now).then((data) => {
        this.today = data;
        this.requestUpdate();
      });
    }
    if (this.info === undefined) return;
    const stats = costStats([connection], this.info);
    const moneyKey = `${bucket}|${[...stats.cost, ...stats.compensation].join(',')}`;
    if (moneyKey === this.moneyKey) return;
    this.moneyKey = moneyKey;
    void fetchMoney(hass, stats, 'day', now).then((money) => {
      this.money = money;
      this.requestUpdate();
    });
  }

  /** The Energy dashboard's connection this card is. */
  private connection(): PrefSource | undefined {
    const own = this.own();
    return connectionOf(readPrefs(this.prefs).sources, own ? sourceIds(own) : []);
  }

  /* ---------- the model ---------- */

  private build(): Model {
    const connection = this.connection();
    const own = this.own();
    const source = own ?? (connection ? prefSourceConfig(connection) : null);
    const measure = source ? measureOfSource(source) : null;
    const reading: Directed = measure
      ? readMeasure(measure, (id) => this.entity(id))
      : { in: null, out: null };
    const phases =
      source && (source.phases?.length ?? 0) > 1
        ? phaseWatts(source.phases ?? [], source.invert ?? false, (id) => this.entity(id))
        : null;
    const volts = (this.config?.voltages ?? []).map((id) => {
      const view = this.entity(id);
      return view.status === 'ok' ? view.number : null;
    });
    const value = net(reading);
    return {
      source,
      connection,
      reading,
      net: value,
      phases,
      volts,
      way: gridWay(reading),
      dead: !!measure && (reading.in === null || reading.out === null),
      stale: !!measure && isStale(this.newest(source), this.now()),
      scale: scaleOf([reading.in, reading.out, value, ...(phases ?? [])], 'W'),
    };
  }

  private newest(source: SourceConfig | null): number {
    return newestReport(this.hass, source ? sourceIds(source) : []);
  }

  private volt(v: number | null): string {
    return v === null ? '—' : `${formatNumber(this.hass, v, { digits: 0 })} V`;
  }

  /** "3 phases · 231 V": what the meter is, when the card knows it. */
  private meterWords(m: Model): string {
    const count = m.phases?.length ?? 0;
    const mean = meanOf(m.volts);
    return [
      count > 1 ? g(this.hass, 'phases', { count }) : '',
      mean === null ? '' : this.volt(mean),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** The head's second line: the card's own, the grid unreadable and since when, stale, the meter, or how fresh. */
  private subNow(m: Model | undefined = this.model): string {
    if (!m?.source) return ''; // nothing read: nothing to be fresh about
    if (m.dead)
      return downLine(
        this.hass,
        this.config?.title ?? g(this.hass, 'title'),
        sourceIds(m.source).find((i) => this.entity(i).status !== 'ok'),
      );
    const live = liveWords(this.hass, this.newest(m.source), this.now());
    if (m.stale) return live;
    return this.meterWords(m) || live;
  }

  private badge(m: Model): { text: string; tone: Tone } | null {
    if (m.dead) return { text: this.t('state.unavailable'), tone: 'warning' };
    if (m.stale || !m.source) return null;
    if (m.way === 'both') return { text: f(this.hass, 'import_export'), tone: 'grid' };
    if (m.way === 'in') return { text: this.t('energy.importing'), tone: 'grid' };
    if (m.way === 'out') return { text: this.t('energy.exporting'), tone: 'grid' };
    return null;
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const m = this.model ?? this.build();
    const w = this.contentWidth;
    const title = this.config?.title ?? g(this.hass, 'title');
    const sub = this.config?.subtitle ?? this.subNow(m);
    this.shownSub = this.config?.subtitle === undefined ? sub : '';
    const fitted = this.head.fit({
      width: w,
      title,
      sub,
      badge: this.badge(m),
      // stale, "Updated 32 days ago" says its age alone where the column cannot hold it
      shorter:
        this.shownSub && m.stale && !m.dead
          ? staleShorter(this.hass, this.newest(m.source), this.now())
          : [],
    });
    const first = m.source ? sourceIds(m.source)[0] : undefined;
    const empty = !m.source && (!!this.own() || this.prefs !== undefined);
    return html`<article class="fv-card ef-card en-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'tower') : null,
        tone: m.dead || !m.way ? 'neutral' : toneOf(this.config, 'grid'),
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: true,
        cut: fitted.cut,
        ...this.headActions(first),
      })}
      ${
        empty
          ? this.head.empty(
              'tower',
              g(this.hass, 'no_grid'),
              g(this.hass, 'no_grid_hint'),
              this.contentWidth,
              // de's "Noch kein Netzsensor" in half a column: "Keine Sensoren", under the grid's own glyph
              this.t('common.no_sensors'),
            )
          : html`${this.renderTop(m, w)}${this.renderPhases(m, w)}${this.renderPrice(w)}${this.renderTotals(m, w)}`
      }
    </article>`;
  }

  /** The net in large; In / Out beside it (or under it) when the meter tells them apart. */
  private renderTop(m: Model, w: number): TemplateResult {
    const fig = (v: number | null): { value: string; unit: string } =>
      v === null
        ? { value: '—', unit: '' }
        : { value: scaled(this.hass, v, m.scale), unit: m.scale.unit };
    const r = this.head.ruler;
    const out = m.net !== null && m.net < 0;
    const long =
      m.net === null ? g(this.hass, 'net') : g(this.hass, out ? 'net_export' : 'net_import');
    // "Net import" where it holds one line, else the way alone ("Importación"): a label never wraps onto its figure
    const label =
      m.net !== null && r.width('fv-readout__label', long) > w
        ? g(this.hass, out ? 'net_export_short' : 'net_import_short')
        : long;
    const big = fig(m.net === null ? null : Math.abs(m.net));
    const both = !!m.source && bothWays(m.source);
    const sides = both
      ? [
          { word: g(this.hass, 'in'), ...fig(m.reading.in) },
          { word: g(this.hass, 'out'), ...fig(m.reading.out) },
        ]
      : [];
    const bigW = Math.max(
      r.width('fv-readout__label', label),
      r.width('fv-readout fv-readout--l > fv-readout__value', big.value, 'fv-unit', big.unit),
    );
    const inoutW = sides.length
      ? Math.max(...sides.map((x) => r.width('fv-card__sub', x.word))) +
        INOUT_GAP +
        Math.max(...sides.map((x) => r.width('en-phase__value', x.value, 'en-unit', x.unit)))
      : 0;
    const beside = !sides.length || bigW + ROW_GAP + inoutW <= w;
    const size = beside || bigW <= w ? 'l' : 'm';
    const column = !beside && inoutW > w;
    const inout = sides.length
      ? html`<div
          class="en-inout ${beside ? '' : 'en-inout--below'} ${column ? 'en-inout--column' : ''}"
        >
          ${sides.map(
            (x) =>
              html`<span>${x.word}</span
                ><b
                  >${x.value}${x.unit ? html`<span class="en-unit">${x.unit}</span>` : nothing}</b
                >`,
          )}
        </div>`
      : nothing;
    return html`<div class="ef-top fv-value-row ${beside ? 'en-top--end' : ''}">
        ${readout({ label, value: big.value, unit: big.unit, size })} ${beside ? inout : nothing}
      </div>
      ${beside ? nothing : inout}`;
  }

  private renderPhases(m: Model, w: number): TemplateResult | typeof nothing {
    if (!m.phases) return nothing;
    return html`<div class="en-block">
      ${phaseBlock({
        hass: this.hass,
        rows: m.phases.map((value, i) => ({
          label: g(this.hass, 'phase', { n: i + 1 }),
          sub: i < m.volts.length ? this.volt(m.volts[i] ?? null) : undefined,
          value,
        })),
        scale: m.scale,
        ways: { in: f(this.hass, 'way_in'), out: f(this.hass, 'way_out') },
        width: w,
        ruler: this.head.ruler,
      })}
    </div>`;
  }

  /** The price now: its figure in its own unit, and the sensor's own name under the words. */
  private renderPrice(w: number): TemplateResult | typeof nothing {
    const id = this.config?.price;
    if (!id) return nothing;
    const view = this.entity(id);
    const parts = costParts(this.hass, view);
    const known = view.status === 'ok' && view.number !== null;
    const value = known ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}` : '—';
    const title = g(this.hass, 'price_now');
    const titleW = this.head.ruler.width('fv-row__title', title);
    // a column too narrow for the words beside the figure gives the circle to the words, as every list does
    const keep = this.head.rowsKeepIcon(w, [{ title, value }]);
    const layout = { icon: keep };
    // below the row's own minimum (its words, and its circle where it keeps it): the price as a readout
    if (this.head.rowRoom(w, '', layout) < titleW)
      return html`<div class="ef-rows">
        ${readout({
          label: title,
          value: known ? parts.value : '—',
          unit: known ? parts.unit : '',
          size: statsSize(this.head.ruler, w, [{ label: title, ...parts }], 1),
          name: true,
        })}
      </div>`;
    // too narrow for the words beside the figure even so: the figure takes the second line
    const narrow = this.head.rowRoom(w, value, layout) < titleW && known;
    const down = view.status === 'unavailable' || view.status === 'missing';
    return html`<div class="ef-rows">
      ${listRow({
        icon: keep ? 'clock' : null,
        tone: down ? 'off' : 'neutral',
        title,
        // a price that cannot be read says so where its sensor's name stood
        sub: narrow ? value : down ? this.t('state.unavailable') : view.name,
        trailing: narrow ? 'none' : 'value',
        value,
        onTap: () => this.tap(id, { action: 'more-info' }),
      })}
    </div>`;
  }

  /**
   * The readouts asked for, or today's imported, exported and net cost from the Energy dashboard: as many columns as
   * hold the widest label and figure (tr's "Net maliyet" on half a column takes two and one).
   */
  private renderTotals(m: Model, w: number): TemplateResult | typeof nothing {
    const own = this.readouts();
    const stats = own.length
      ? legendStats(this.hass, own, (id) => this.entity(id))
      : this.todayStats(m);
    return stats.length ? statsCols(this.head.ruler, w, stats) : nothing;
  }

  /** Today on the Energy dashboard's meters of this connection, and its money when it has money statistics. */
  private todayStats(m: Model): Stat[] {
    const c = m.connection;
    if (!c) return [];
    const data = this.today;
    const kwh = (ids: readonly string[]): number | null =>
      data ? ids.reduce((sum, id) => sum + (data.byStat.get(id) ?? 0), 0) * 1000 : null;
    const imported = c.energyIn.length ? kwh(c.energyIn) : undefined;
    const exported = c.energyOut.length ? kwh(c.energyOut) : undefined;
    const scale = scaleOf([imported ?? null, exported ?? null], 'Wh');
    const energy = (label: string, v: number | null): Stat =>
      v === null
        ? { label, value: '—', unit: '' }
        : { label, value: scaled(this.hass, v, scale), unit: scale.unit };
    const out: Stat[] = [];
    if (imported !== undefined) out.push(energy(g(this.hass, 'imported'), imported));
    if (exported !== undefined) out.push(energy(g(this.hass, 'exported'), exported));
    const stats = costStats([c], this.info);
    if (stats.cost.length || stats.compensation.length) {
      const money = this.money ? moneyOf(stats, this.money) : null;
      out.push(
        money
          ? {
              label: g(this.hass, 'net_cost'),
              value: formatNumber(this.hass, money.net, { digits: 2, minDigits: 2 }).replace(
                /^-/,
                '−',
              ),
              unit: currencySymbol(this.hass),
            }
          : { label: g(this.hass, 'net_cost'), value: '—', unit: '' },
      );
    }
    return out;
  }
}
