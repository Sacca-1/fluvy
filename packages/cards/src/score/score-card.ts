import { scoreHeight } from '../energy-family.js';
import {
  formatNumber,
  strings,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { activateKey, head, readout, sheetStyles } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { lowCarbon, scores, type Scores } from '../energy-model/allocate.js';
import { co2SignalOf, fetchFossil } from '../energy-model/fossil.js';
import { fetchPrefs } from '../energy-model/house.js';
import { isEntityId as isEntity, meterOutage } from '../energy-model/outage.js';
import { fetchPeriod, PERIODS, type Period, type PeriodEnergy } from '../energy-model/period.js';
import { readPrefs, type EnergyPrefs, type PrefSource } from '../energy-model/prefs.js';
import { HeadFit } from '../energy/head.js';
import { scaled, scaleOf } from '../energy/power.js';
import { Card, type BaseKey } from '../shared/base.js';
import { chipRow } from '../shared/chips.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  iconField,
  selectField,
  showIconField,
  titleFields,
} from '../shared/form.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import {
  arcDash,
  hasCo2Signal,
  netWay,
  RING,
  RING_COLUMN,
  RING_GAP,
  RING_SMALL,
  ringLayout,
  ringPercent,
  ringRadius,
  ringsOf,
  totalsLayout,
  type Ring,
} from './rings.js';

const s = strings('energy-score');
const flow = strings('energy-flow');

export interface EnergyScoreCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** The span: today, the last 7 days, this month (default day). */
  period?: Period;
  /** Day · Week · Month chips (default true). */
  show_period?: boolean;
  /** The grid's fossil share in % (a CO₂ signal sensor). Empty: the house's, as the Energy dashboard finds it. */
  co2?: string;
  /** The tests' clock: "now" for the period. */
  _now?: string;
}

/** Below this (kWh), a net reads "0" and has no direction. */
const ZERO = 0.005;

/**
 * How the house did over a period, as Home Assistant's own Energy gauges say it — how much of what it used did not
 * come from the grid, how much of the sun's energy it kept, how much of what it consumed was low-carbon — over the
 * grid's imported, exported and net energy. A ring the house cannot have is left out, and the others stay centred.
 */
export class FluvyEnergyScoreCard extends Card<EnergyScoreCardConfig> {
  static override layoutHeight(config: EnergyScoreCardConfig): number {
    return scoreHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    css`
      .en-card {
        width: 100%;
      }
      .en-scores {
        row-gap: ${RING_GAP}px;
      }
      /* fewer than three, or a column that wraps them: every row centred, the last one too */
      .en-scores.is-centred {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
      }
      .en-scores.is-centred > .en-score {
        flex: 0 0 var(--column);
      }
      /* a label takes its column (96, or a longer word's); a column narrower than it wraps the label */
      .en-scores .en-score__label {
        width: 100%;
      }
      /* the small ring of a column narrower than 88: its figure a step down, centred on it */
      .en-scores.is-small .en-score__value {
        top: 20px;
        font-size: 16px;
      }
      .en-score.fv-row--tap,
      .en-tap {
        border-radius: 12px;
        outline-offset: 2px;
      }
      .en-score-cols.is-columns {
        justify-content: space-between;
      }
      .en-score-cols.is-fluid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        column-gap: 8px;
      }
      .en-score-cols.is-stacked {
        grid-template-columns: minmax(0, 1fr);
      }
      .en-score-cols .fv-readout {
        min-width: 0;
      }
    `,
  ];

  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<EnergyScoreCardConfig>()([
    'title',
    'subtitle',
    'period',
    'show_period',
    'co2',
  ]);
  static override defaults: EditorDefaults = () => ({ period: 'day', show_period: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('period', PERIODS)),
        showIconField(),
        fieldRow(boolField('show_period'), entityField(['sensor'], 'co2', false)),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(
        s,
        { period: 'editor_period', co2: 'editor_co2' },
        { show_period: 'energy-flow.editor_show_period' },
      ),
    };
  }

  static getStubConfig(): EnergyScoreCardConfig {
    // the Energy dashboard's own meters and the house's CO₂ signal
    return { type: 'custom:fluvy-energy-score-card' };
  }

  private readonly head = new HeadFit(this);
  private ticker: number | undefined;
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  private chosen: Period | undefined;
  private data: PeriodEnergy | null | undefined;
  private fossil: number | null | undefined;
  private dataKey = '';

  override getCardSize(): number {
    return Math.ceil(FluvyEnergyScoreCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private period(): Period {
    const own = this.config?.period;
    return this.chosen ?? (own && PERIODS.includes(own) ? own : 'day');
  }

  private sources(): PrefSource[] {
    return readPrefs(this.prefs).sources.filter((p) => p.energyIn.length || p.energyOut.length);
  }

  private meters(kind: PrefSource['kind'], side: 'energyIn' | 'energyOut'): string[] {
    return this.sources()
      .filter((p) => p.kind === kind)
      .flatMap((p) => p[side]);
  }

  /** The CO₂ signal: the card's own, else the house's (the first `co2signal` sensor in %). */
  private co2(): string | undefined {
    return this.config?.co2 || co2SignalOf(this.hass);
  }

  protected override watched(): readonly string[] {
    return [...this.sources().flatMap((p) => [...p.energyIn, ...p.energyOut]), this.co2()].filter(
      isEntity,
    );
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    // a period's totals are asked for again when their five minutes run out
    this.ticker = window.setInterval(() => {
      if (this.config) this.requestUpdate();
    }, 60_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.config || !this.hass) return;
    if (!this.prefsAsked) {
      this.prefsAsked = true;
      void fetchPrefs(this.hass).then((prefs) => {
        this.prefs = prefs;
        this.requestUpdate();
      });
    }
    this.askPeriod();
  }

  private now(): Date {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return new Date(Number.isFinite(pinned) ? pinned : Date.now());
  }

  private askPeriod(): void {
    const hass = this.hass;
    if (!hass || this.prefs === undefined) return;
    const sources = this.sources();
    if (!sources.length) return;
    const period = this.period();
    const now = this.now();
    const co2 = this.lowCarbonShown() ? this.co2() : undefined;
    const key = `${period}|${Math.floor(now.getTime() / 300_000)}|${co2 ?? ''}`;
    if (key === this.dataKey) return;
    this.dataKey = key;
    void fetchPeriod(hass, sources, period, now).then((data) => {
      if (this.dataKey !== key) return;
      this.data = data;
      this.requestUpdate();
    });
    if (co2)
      void fetchFossil(hass, this.meters('grid', 'energyIn'), co2, period, now).then((fossil) => {
        if (this.dataKey !== key) return;
        this.fossil = fossil;
        this.requestUpdate();
      });
    else this.fossil = undefined;
  }

  /** Low-carbon needs the grid's import metered and a CO₂ signal, even one out of reach (`hasCo2Signal`). */
  private lowCarbonShown(): boolean {
    return (
      hasCo2Signal(this.co2(), this.hass?.entities) && this.meters('grid', 'energyIn').length > 0
    );
  }

  /* ---------- the figures ---------- */

  private rings(): Ring[] {
    const data = this.data;
    const exported = this.meters('grid', 'energyOut').length > 0;
    const score: Scores | null = data
      ? scores({
          totals: data.totals,
          buckets: data.buckets,
          battery: this.sources().some((p) => p.kind === 'battery'),
          exported,
        })
      : null;
    const carbon =
      data && typeof this.fossil === 'number' ? lowCarbon(data.totals, this.fossil) : null;
    return ringsOf(
      { solar: this.meters('solar', 'energyIn').length > 0, exported, co2: this.lowCarbonShown() },
      score,
      carbon,
    );
  }

  /** A meter (or the card's CO₂ signal) that cannot be read now: the head says so. */
  private outage(): string | undefined {
    const co2 = this.config?.co2;
    return meterOutage(this.hass, [
      ...this.sources().flatMap((p) =>
        [...p.energyIn, ...p.energyOut].map((id) => ({
          id,
          name: p.name ?? flow(this.hass, `kind_${p.kind}`),
        })),
      ),
      ...(co2 ? [{ id: co2, name: s(this.hass, 'low_carbon') }] : []),
    ]);
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const w = this.contentWidth;
    const period = this.period();
    const configured = this.prefs === undefined || this.sources().length > 0;
    const own = this.config?.subtitle ?? this.outage();
    const sub = own ?? flow(this.hass, `period_${period}`);
    // "Since midnight" is "Today" where a column cannot hold it (es "Desde medianoche" in half a column)
    const shorter = own === undefined && period === 'day' ? [this.t('common.today')] : [];
    const fit = (title: string) => this.head.fit({ width: w, title, sub, badge: null, shorter });
    let title = this.config?.title ?? s(this.hass, 'title');
    let fitted = fit(title);
    // the card's own title where it holds whole, else its short one (it's "Punteggio energetico" at 211); a typed
    // title is the person's
    if (this.config?.title === undefined && fitted.cut) {
      title = s(this.hass, 'title_short');
      fitted = fit(title);
    }
    return html`<article class="fv-card en-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'leaf') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        configured && this.config?.show_period !== false
          ? html`<div class="en-period">
              ${chipRow(
                PERIODS.map((p) => ({
                  key: p,
                  label: flow(this.hass, `chip_${p}`),
                  active: p === period,
                })),
                (key) => {
                  this.chosen = key as Period;
                  this.requestUpdate();
                },
                'full',
                { ruler: this.head.ruler, width: w },
              )}
            </div>`
          : nothing
      }
      ${configured ? this.renderScores(w) : this.head.empty('bolt', flow(this.hass, 'no_period'), flow(this.hass, 'no_period_hint'), this.contentWidth)}
    </article>`;
  }

  private renderScores(w: number): TemplateResult {
    const rings = this.rings();
    const widest = Math.max(
      0,
      ...rings.map((r) => this.head.ruler.width('en-score__label', s(this.hass, r.key))),
    );
    const lay = ringLayout(rings.length, w, widest);
    const size = lay.small ? RING_SMALL : RING;
    const c = size / 2;
    const co2 = this.co2();
    const ring = (r: Ring): TemplateResult => {
      const percent = ringPercent(r.value);
      const open =
        r.key === 'low_carbon' && isEntity(co2)
          ? () => this.tap(co2, { action: 'more-info' })
          : undefined;
      return html`<div
        class="en-score ${open ? 'fv-row--tap' : ''}"
        data-ring=${r.key}
        role=${open ? 'button' : nothing}
        tabindex=${open ? '0' : nothing}
        @click=${open ?? nothing}
        @keydown=${open ? activateKey(open) : nothing}
      >
        <svg width=${size} height=${size} viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle cx=${c} cy=${c} r=${ringRadius(size)} class="en-score__track"></circle>
          ${
            // nothing to draw for 0 %, or a figure not in: a round cap would still paint a dot
            percent
              ? svg`<circle cx=${c} cy=${c} r=${ringRadius(size)} class="en-score__arc" stroke-dasharray=${arcDash(r.value, size)} transform="rotate(-90 ${c} ${c})"></circle>`
              : nothing
          }
        </svg>
        <span class="en-score__value"
          >${percent === null ? '—' : formatNumber(this.hass, percent, { digits: 0 })}${
            percent === null ? nothing : html`<span class="en-unit">%</span>`
          }</span
        >
        <span class="en-score__label">${s(this.hass, r.key)}</span>
      </div>`;
    };
    // three rings in a full column spread over it (the approved row); fewer, or a narrower column, stay centred
    const style = lay.spread
      ? `grid-template-columns:repeat(3, ${lay.column}px)`
      : `--column:${lay.column}px;column-gap:${lay.gap}px`;
    return html`<div
        class="en-scores ${lay.spread ? '' : 'is-centred'} ${lay.small ? 'is-small' : ''}"
        style=${style}
      >
        ${rings.map(ring)}
      </div>
      ${this.renderTotals(w, lay.spread ? lay.column : RING_COLUMN)}`;
  }

  /**
   * Imported · Exported · Net, in one unit, in the rings' columns (`column`: under a spread row, the rings' own);
   * the net says its way in the unit's slot where it has the room.
   */
  private renderTotals(w: number, column: number): TemplateResult | typeof nothing {
    const imports = this.meters('grid', 'energyIn');
    const exports = this.meters('grid', 'energyOut');
    // a house off the grid has nothing to import or export: the row is left out, as a ring it cannot have is
    if (!imports.length && !exports.length) return nothing;
    const data = this.data;
    const imported = data && imports.length ? data.totals.fromGrid : null;
    const exported = data && exports.length ? data.totals.toGrid : null;
    const net = imported !== null && exported !== null ? imported - exported : null;
    const scale = scaleOf(
      [imported, exported, net].map((v) => (v === null ? null : Math.abs(v) * 1000)),
      'Wh',
    );
    const way = netWay(net, ZERO);
    const figure = (v: number | null, signed = false): { value: string; unit: string } =>
      v === null
        ? { value: '—', unit: '' }
        : {
            value: scaled(this.hass, (signed ? v : Math.abs(v)) * 1000, scale),
            unit: scale.unit,
          };
    const labels = [s(this.hass, 'imported'), s(this.hass, 'exported'), s(this.hass, 'net')];
    const withWay = way
      ? {
          ...figure(net),
          unit: `${scale.unit} ${flow(this.hass, way === 'in' ? 'way_in' : 'way_out')}`,
        }
      : figure(net);
    const signed = figure(net, true);
    const width = (parts: { value: string; unit: string }): number =>
      this.head.ruler.width(
        'fv-readout fv-readout--s > fv-readout__value',
        parts.value,
        'fv-unit',
        parts.unit,
      );
    const common = Math.max(
      ...labels.map((l) => this.head.ruler.width('fv-readout__label', l)),
      width(figure(imported)),
      width(figure(exported)),
    );
    const fit = totalsLayout(
      w,
      { way: Math.max(common, width(withWay)), plain: Math.max(common, width(signed)) },
      column,
    );
    const cell = (
      label: string,
      parts: { value: string; unit: string },
      entity?: string,
    ): TemplateResult => {
      const body = readout({ label, ...parts, size: 's' });
      if (!isEntity(entity)) return body;
      const open = (): void => this.tap(entity, { action: 'more-info' });
      return html`<div
        class="en-tap fv-row--tap"
        role="button"
        tabindex="0"
        @click=${open}
        @keydown=${activateKey(open)}
      >
        ${body}
      </div>`;
    };
    return html`<div
      class="fv-cols en-score-cols is-${fit.layout}"
      style=${fit.layout === 'columns' ? `grid-template-columns:repeat(3, ${column}px)` : ''}
      data-net=${fit.way ? 'way' : 'signed'}
    >
      ${cell(labels[0] as string, figure(imported), imports.find(isEntity))}
      ${cell(labels[1] as string, figure(exported), exports.find(isEntity))}
      ${cell(labels[2] as string, fit.way ? withWay : signed)}
    </div>`;
  }
}
