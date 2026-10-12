import { SANKEY_BODY, sankeyHeight } from '../energy-family.js';
import {
  strings,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { activateKey, emptyState, head, sheetStyles } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { fetchPrefs } from '../energy-model/house.js';
import { isEntityId as isEntity, meterOutage } from '../energy-model/outage.js';
import { fetchPeriod, PERIODS, type Period, type PeriodEnergy } from '../energy-model/period.js';
import {
  readPrefs,
  type EnergyPrefs,
  type HouseEnergy,
  type PrefSource,
} from '../energy-model/prefs.js';
import { HeadFit } from '../energy/head.js';
import { deviceName, scaled, scaleOf, type Scale } from '../energy/power.js';
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
  numberField,
  selectField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { BAR, layoutSankey, type LaidNode, type SankeyLayout } from './layout.js';
import { sankeyModel, type DeviceInput, type SankeyModel } from './model.js';

const s = strings('energy-sankey');
const flow = strings('energy-flow');

export interface EnergySankeyDevice {
  /** The device's energy meter. */
  entity: string;
  name?: string;
  /** Another device's meter: this device's energy is part of that one's (only top-level devices are drawn). */
  parent?: string;
}

export interface EnergySankeyCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** The span: today, the last 7 days, this month (default day). */
  period?: Period;
  /** Day · Week · Month chips (default true). */
  show_period?: boolean;
  /** The house's devices. Empty: the Energy dashboard's, with its "upstream device" as the parent. */
  devices?: ReadonlyArray<string | EnergySankeyDevice>;
  /** Devices drawn by name before the rest join one "Other devices" bar (default 4). */
  max_devices?: number;
  /** The tests' clock: "now" for the period. */
  _now?: string;
}

const DEFAULT_MAX = 4;

/** A device, resolved: its meter, its name, its parent's meter. */
interface Device {
  readonly id: string;
  readonly name: string;
  readonly parent: string | undefined;
}

interface Scene {
  readonly model: SankeyModel;
  readonly scale: Scale;
  /** Each node's words and what a tap on them opens. */
  readonly words: ReadonlyMap<
    string,
    { name: string; value: string; unit: string; entity?: string }
  >;
}

/**
 * Where a period's energy went, top to bottom, in true proportions: the sources (grid, battery, sun) over what they
 * fed (the house, the battery's charge, the export), and the house over its biggest devices and what no meter
 * accounts for. The figures are the Energy dashboard's: its meters, hour by hour, allocated the way it allocates.
 */
export class FluvyEnergySankeyCard extends Card<EnergySankeyCardConfig> {
  static override layoutHeight(config: EnergySankeyCardConfig): number {
    return sankeyHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    css`
      .en-card {
        width: 100%;
      }
      .en-sk-label {
        border-radius: 4px;
        outline-offset: 2px;
      }
      .en-sk-name {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
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
  ];
  static override keys = configKeys<EnergySankeyCardConfig>()([
    'title',
    'subtitle',
    'period',
    'show_period',
    'devices',
    'max_devices',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'devices',
      title: 'energy-sankey.editor_devices',
      domains: ['sensor'],
      keys: ['entity', 'name', 'parent'],
      schema: [
        entityField(['sensor']),
        textField('name'),
        entityField(['sensor'], 'parent', false),
      ],
      computeLabel: editorLabels(s, { parent: 'editor_parent' }).computeLabel,
    },
  ];
  static override defaults: EditorDefaults = () => ({
    period: 'day',
    show_period: true,
    max_devices: DEFAULT_MAX,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('period', PERIODS)),
        fieldRow(boolField('show_period'), numberField('max_devices', 1, 20)),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(
        s,
        { period: 'editor_period', max_devices: 'editor_max_devices' },
        { show_period: 'energy-flow.editor_show_period' },
      ),
    };
  }

  static getStubConfig(): EnergySankeyCardConfig {
    // the Energy dashboard's own meters and devices
    return { type: 'custom:fluvy-energy-sankey-card' };
  }

  private readonly head = new HeadFit(this);
  private ticker: number | undefined;
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  private chosen: Period | undefined;
  private data: PeriodEnergy | null | undefined;
  private dataKey = '';

  override getCardSize(): number {
    return Math.ceil(FluvyEnergySankeyCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private period(): Period {
    const own = this.config?.period;
    return this.chosen ?? (own && PERIODS.includes(own) ? own : 'day');
  }

  private house(): HouseEnergy {
    return readPrefs(this.prefs);
  }

  /** The meters the diagram reads: every source's that has one. */
  private sources(): PrefSource[] {
    return this.house().sources.filter((p) => p.energyIn.length || p.energyOut.length);
  }

  private devices(): Device[] {
    const own = (this.config?.devices ?? [])
      .map((d) => (typeof d === 'string' ? { entity: d } : d))
      .filter((d) => typeof d.entity === 'string' && d.entity !== '');
    if (own.length)
      return own.map((d) => ({
        id: d.entity,
        name: d.name ?? deviceName(this.entity(d.entity)),
        parent: d.parent || undefined,
      }));
    return this.house().devices.map((d) => ({
      id: d.stat,
      name: d.name ?? (isEntity(d.stat) ? deviceName(this.entity(d.stat)) : d.stat),
      parent: d.parent,
    }));
  }

  protected override watched(): readonly string[] {
    return [
      ...this.sources().flatMap((p) => [...p.energyIn, ...p.energyOut]),
      ...this.devices().map((d) => d.id),
    ].filter(isEntity);
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
    if (!this.hass || this.prefs === undefined) return;
    const sources = this.sources();
    if (!sources.length) return;
    const period = this.period();
    const now = this.now();
    const devices = this.devices().map((d) => d.id);
    const key = `${period}|${Math.floor(now.getTime() / 300_000)}|${devices.join(',')}`;
    if (key === this.dataKey) return;
    this.dataKey = key;
    void fetchPeriod(this.hass, sources, period, now, devices).then((data) => {
      if (this.dataKey !== key) return; // a newer question is on its way
      this.data = data;
      this.requestUpdate();
    });
  }

  /* ---------- the scene ---------- */

  private scene(data: PeriodEnergy): Scene {
    const sources = this.sources();
    const devices = this.devices();
    const inputs: DeviceInput[] = devices.map((d, index) => ({
      index,
      id: d.id,
      value: data.byStat.has(d.id) ? (data.byStat.get(d.id) ?? 0) : null,
      parent: d.parent,
    }));
    const model = sankeyModel(
      data.totals,
      data.allocation,
      inputs,
      this.config?.max_devices ?? DEFAULT_MAX,
    );
    const figures = [...model.sources, ...model.targets, ...model.kids].map((n) => n.value * 1000);
    const scale = scaleOf([...figures, model.total * 1000], 'Wh');
    const meter = (kind: PrefSource['kind'], side: 'energyIn' | 'energyOut'): string | undefined =>
      sources
        .filter((p) => p.kind === kind)
        .flatMap((p) => p[side])
        .find(isEntity);
    const entityOf: Record<string, string | undefined> = {
      grid: meter('grid', 'energyIn'),
      battery: meter('battery', 'energyIn'),
      solar: meter('solar', 'energyIn'),
      charged: meter('battery', 'energyOut'),
      exported: meter('grid', 'energyOut'),
    };
    const nameOf = (key: string): string => {
      if (key.startsWith('device:')) return devices[Number(key.slice(7))]?.name ?? '';
      switch (key) {
        case 'grid':
        case 'battery':
        case 'solar':
          return flow(this.hass, `kind_${key}`);
        case 'house':
          return flow(this.hass, 'house');
        case 'charged':
          return s(this.hass, 'charged');
        case 'exported':
          return s(this.hass, 'exported');
        case 'other':
          return s(this.hass, 'other_devices');
        default:
          return s(this.hass, 'not_measured');
      }
    };
    const words = new Map<string, { name: string; value: string; unit: string; entity?: string }>();
    for (const n of [...model.sources, ...model.targets, ...model.kids]) {
      const entity = n.key.startsWith('device:')
        ? devices[Number(n.key.slice(7))]?.id
        : entityOf[n.key];
      words.set(n.key, {
        name: nameOf(n.key),
        value: scaled(this.hass, n.value * 1000, scale),
        unit: scale.unit,
        ...(isEntity(entity) ? { entity } : {}),
      });
    }
    return { model, scale, words };
  }

  /** The words' box: its name or its figure, whichever is wider, measured in the classes that draw them. */
  private labelWidth(scene: Scene, key: string): number {
    const w = scene.words.get(key);
    if (!w) return 0;
    return Math.max(
      this.head.ruler.width('en-sk-name', w.name),
      this.head.ruler.width('en-sk-value', w.value, 'en-unit', w.unit),
    );
  }

  /** A meter (a source's, a device's) that cannot be read now: the head says so. */
  private outage(): string | undefined {
    return meterOutage(this.hass, [
      ...this.sources().flatMap((p) =>
        [...p.energyIn, ...p.energyOut].map((id) => ({
          id,
          name: p.name ?? flow(this.hass, `kind_${p.kind}`),
        })),
      ),
      ...this.devices().map((d) => ({ id: d.id, name: d.name })),
    ]);
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const w = this.contentWidth;
    const title = this.config?.title ?? s(this.hass, 'title');
    const period = this.period();
    const configured = this.prefs === undefined || this.sources().length > 0;
    const data = configured ? this.data : undefined;
    const scene = data ? this.scene(data) : undefined;
    const empty = data && scene ? !scene.model.sources.length : false;
    const total =
      scene && !empty
        ? `${scaled(this.hass, scene.model.total * 1000, scene.scale)} ${scene.scale.unit}`
        : '';
    const sub =
      this.config?.subtitle ??
      this.outage() ??
      [flow(this.hass, `period_${period}`), total].filter(Boolean).join(' · ');
    const fitted = this.head.fit({ width: w, title, sub, badge: null });
    let body: TemplateResult;
    if (!configured)
      body = this.head.empty(
        'bolt',
        flow(this.hass, 'no_period'),
        flow(this.hass, 'no_period_hint'),
        this.contentWidth,
      );
    else if (data === null)
      body = this.head.empty(
        'bolt',
        s(this.hass, 'no_statistics'),
        s(this.hass, 'no_statistics_hint'),
        this.contentWidth,
      );
    else if (!scene) body = html`<div class="en-sankey" style="height:${SANKEY_BODY}px"></div>`;
    else if (empty) body = emptyState('bolt', s(this.hass, 'nothing_yet'));
    else body = this.renderDiagram(scene, w);
    return html`<article class="fv-card en-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'swap') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        name: Boolean(this.config?.title),
        onIconTap: () => this.tap(),
        onHold: () => this.hold(),
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
      ${body}
    </article>`;
  }

  private renderDiagram(scene: Scene, w: number): TemplateResult {
    const g: SankeyLayout = layoutSankey(scene.model, w, (key) => this.labelWidth(scene, key));
    const bars = (row: readonly LaidNode[], y: number): TemplateResult[] =>
      row.map(
        (n) =>
          svg`<rect class="en-node-bar en-ink--${n.ink} ${n.dashed ? 'is-dashed' : ''}" data-key=${n.key} x=${n.x.toFixed(1)} y=${y} width=${Math.max(0, n.w).toFixed(1)} height=${BAR} rx=${Math.min(4, n.w / 2).toFixed(1)}></rect>`,
      );
    return html`<div class="en-sankey" style="height:${g.height}px">
      <svg
        width=${w}
        height=${g.height}
        viewBox="0 0 ${w} ${g.height}"
        aria-hidden="true"
        data-measure="drawn"
      >
        ${g.ribbons.map((r) => svg`<path class="en-ribbon en-ink--${r.ink}" data-key=${r.key} d=${r.d}></path>`)}
        ${g.stem ? svg`<rect class="en-node-bar en-ink--home is-stem" x=${g.stem.x.toFixed(1)} y=${g.stem.y} width=${g.stem.w.toFixed(1)} height="4" rx="2"></rect>` : nothing}
        ${bars(g.top, g.y0)}${bars(g.mid, g.y1)}${bars(g.kids, g.y2)}
      </svg>
      ${g.labels.map((l) => {
        const words = scene.words.get(l.key);
        if (!words) return nothing;
        const entity = words.entity;
        const open = entity ? () => this.tap(entity, { action: 'more-info' }) : undefined;
        return html`<span
          class="en-sk-label ${l.end ? 'is-end' : ''} ${open ? 'fv-row--tap' : ''}"
          data-key=${l.key}
          style="left:${l.x}px;top:${l.y}px;width:${l.w}px"
          role=${open ? 'button' : nothing}
          tabindex=${open ? '0' : nothing}
          @click=${open ?? nothing}
          @keydown=${open ? activateKey(open) : nothing}
          ><span class="en-sk-name" data-name>${words.name}</span
          ><span class="en-sk-value"
            >${words.value}<span class="en-unit">${words.unit}</span></span
          ></span
        >`;
      })}
    </div>`;
  }
}
