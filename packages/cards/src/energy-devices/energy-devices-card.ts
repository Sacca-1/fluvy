import { devicesHeight } from '../energy-family.js';
import {
  stateText,
  strings,
  valueParts,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { barRow, head, listRow, sheetStyles, type Tone } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { Card, type BaseKey } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import {
  accentField,
  actionField,
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  numberField,
  showIconField,
  titleFields,
  toneField,
} from '../shared/form.js';

import { fetchPrefs } from '../energy-model/house.js';
import { fetchPeriod, type PeriodEnergy } from '../energy-model/period.js';
import { readPrefs, type EnergyPrefs } from '../energy-model/prefs.js';
import { HeadFit } from '../energy/head.js';

import {
  baseValue,
  costParts,
  family,
  scaled,
  scaleOf,
  shortName,
  type Family,
  type Scale,
} from '../energy/power.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import type { Segment } from '../shared/fit.js';
import {
  barOf,
  deviceTree,
  percentOf,
  type DeviceItem,
  type DeviceNode,
  type DeviceTree,
} from './tree.js';

const s = strings('energy-devices');
/** Below this a row's name needs its circle's room: the rows go bare (the flow's list does the same). */
const BARE = 280;
/** Below this even a bare row cannot hold a name beside its figure: the figure leads the second line. */
const STACK = 200;
/** A level of the tree is indented by this much (the spine centred on its parent's circle), bare by 12. */
const INDENT = 40;
const INDENT_BARE = 12;
const flow = strings('energy-flow');

export interface DeviceRowConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** Another row's sensor this device is part of: it is drawn under that row, and its share is of that row. */
  parent?: string;
  /** A monetary sensor for this device, quoted after its share on the row's second line. */
  cost_entity?: string;
  tone?: Tone;
  color?: string;
  tap_action?: ActionConfig;
}

export interface EnergyDevicesCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** The devices. Empty: the Energy dashboard's own (their meters over today, nested as it nests them). */
  rows?: ReadonlyArray<string | DeviceRowConfig>;
  /** The house's own meter, of the rows' kind: every bar on its scale, and what the devices leave unmeasured. */
  total?: string;
  /** `false` keeps the configured order; by default the biggest consumer leads. */
  sort?: boolean;
  /** Top-level rows shown at most (the biggest, when sorted); a row's devices follow it. */
  max_rows?: number;
  /** The tests' clock: "now" for today's midnight. */
  _now?: string;
}

interface DeviceRow extends DeviceItem {
  readonly config: DeviceRowConfig;
  readonly view: EntityView;
  readonly label: string;
  readonly glyph: string;
}

/** The bar colours the language defines; any other tone draws its bar in the accent. */
const BAR_TONES: ReadonlySet<Tone> = new Set<Tone>([
  'accent',
  'solar',
  'water',
  'grid',
  'heat',
  'media',
  'warning',
  'neutral',
  'cool',
]);

/**
 * Where the energy goes: one 76 px bar row per device — its circle, its name, its share, a bar in ink and its figure
 * — every bar on ONE scale (the house's meter, else the biggest device), so a glance compares them all. A device may
 * be part of another (`parent`): it is drawn under it, on a spine from its parent's circle, and its share is of that
 * parent; a parent that reads more than its devices shows the rest as "Not measured", and the house's meter (`total`)
 * what no device accounts for, with how much of the house is measured in the badge. Without rows the Energy
 * dashboard's devices are read, over today, nested as it nests them. A sensor of another kind (a water meter among
 * energy meters) is a plain row with its own figure: no share, no bar.
 */
export class FluvyEnergyDevicesCard extends Card<EnergyDevicesCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: EnergyDevicesCardConfig): number {
    return devicesHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    css`
      .ef-card {
        width: 100%;
      } /* the sheet fixes 360; a card takes the column it is given */
    `,
  ];

  private readonly head = new HeadFit(this);
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  private period: PeriodEnergy | null | undefined;
  private periodKey = '';
  private ticker: number | undefined;

  /** A list of many sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
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
  static override keys = configKeys<EnergyDevicesCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'total',
    'sort',
    'max_rows',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'rows',
      alias: 'entities',
      title: 'editor.rows',
      domains: ['sensor'],
      keys: ['entity', 'name', 'icon', 'parent', 'cost_entity', 'tone', 'color', 'tap_action'],
      schema: [
        entityField(['sensor']),
        nameIconFields(),
        fieldRow(
          entityField(['sensor'], 'parent', false),
          entityField(['sensor'], 'cost_entity', false),
        ),
        fieldRow(toneField(), accentField()),
        actionField(),
      ],
      computeLabel: formLabels({
        cost_entity: 'energy.cost',
        parent: 'energy-devices.editor_parent',
      }).computeLabel,
    },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ sort: true });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), showIconField()),
        ...colourFields(),
        entitiesField('entities', ['sensor']),
        entityField(['sensor'], 'total', false),
        fieldRow(boolField('sort'), numberField('max_rows', 1, 20)),
        actionFields(),
      ],
      ...editorLabels(
        s,
        { sort: 'editor_sort', total: 'editor_total' },
        { max_rows: 'editor.max_rows' },
      ),
    };
  }

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): EnergyDevicesCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    const energy = sensors.filter((id) => hass?.states[id]?.attributes.device_class === 'energy');
    return {
      type: 'custom:fluvy-energy-devices-card',
      entities: (energy.length ? energy : sensors).slice(0, 4),
    };
  }

  override getCardSize(): number {
    return Math.ceil(FluvyEnergyDevicesCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private own(): DeviceRowConfig[] {
    const source = this.config?.rows ?? this.config?.entities ?? [];
    return source
      .map((row) => (typeof row === 'string' ? { entity: row } : row))
      .filter((row) => typeof row.entity === 'string' && row.entity !== '');
  }

  /** With no rows of its own, the card is the Energy dashboard's devices over today. */
  private get fromPrefs(): boolean {
    return this.own().length === 0;
  }

  private configured(): DeviceRowConfig[] {
    if (!this.fromPrefs) return this.own();
    return readPrefs(this.prefs).devices.map((d) => ({
      entity: d.stat,
      ...(d.name ? { name: d.name } : {}),
      ...(d.parent ? { parent: d.parent } : {}),
    }));
  }

  protected override watched(): readonly string[] {
    return [
      ...this.configured().flatMap((row) =>
        row.cost_entity ? [row.entity, row.cost_entity] : [row.entity],
      ),
      this.config?.total,
    ].filter((id): id is string => !!id);
  }

  private now(): Date {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return new Date(Number.isFinite(pinned) ? pinned : Date.now());
  }

  /* ---------- the Energy dashboard's devices ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.config && this.fromPrefs) this.tick();
  }

  /** A day's statistics grow every hour and the day turns at midnight: read again every five minutes. */
  private tick(): void {
    this.ticker ??= window.setInterval(() => this.requestUpdate(), 300_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const hass = this.hass;
    if (!this.config || !hass || !this.fromPrefs) return;
    if (this.isConnected) this.tick();
    if (!this.prefsAsked) {
      this.prefsAsked = true;
      void fetchPrefs(hass).then((prefs) => {
        this.prefs = prefs;
        this.requestUpdate();
      });
    }
    if (this.prefs === undefined) return;
    // today's change of every device meter (and the house's own, when given), the Energy dashboard's arithmetic
    const now = this.now();
    const house = readPrefs(this.prefs);
    const extra = [...house.devices.map((d) => d.stat), this.config.total].filter(
      (id): id is string => !!id,
    );
    const key = `${Math.floor(now.getTime() / 300_000)}|${extra.join(',')}`;
    if (key === this.periodKey) return;
    this.periodKey = key;
    void fetchPeriod(hass, house.sources, 'day', now, extra).then((data) => {
      if (this.periodKey !== key) return;
      this.period = data;
      this.requestUpdate();
    });
  }

  /* ---------- the rows ---------- */

  /** The card is either "energy today" or "power now": the first sensor that says which decides for all. */
  private kind(views: readonly EntityView[]): Family {
    if (this.fromPrefs) return 'energy';
    return views.map(family).find((kind) => kind !== null) ?? 'energy';
  }

  /** A row's reading in the card's base unit: its sensor's (or, from the Energy dashboard, today's change). */
  private readingOf(id: string, view: EntityView, kind: Family): number | null {
    if (this.fromPrefs) {
      const kwh = this.period?.byStat.get(id);
      return kwh === undefined ? null : kwh * 1000;
    }
    return family(view) === kind ? baseValue(view) : null;
  }

  /** The house's meter: its sensor's reading, its change today, or what the Energy dashboard's sources add up to. */
  private houseTotal(kind: Family): number | null {
    const id = this.config?.total;
    if (id) return this.readingOf(id, this.entity(id), kind);
    if (!this.fromPrefs || !this.period) return null;
    const sources = readPrefs(this.prefs).sources;
    return sources.some((p) => p.energyIn.length) ? this.period.allocation.usedTotal * 1000 : null;
  }

  protected renderCard(): TemplateResult {
    const configs = this.configured();
    const views = configs.map((c) => this.entity(c.entity));
    const kind = this.kind(views);
    const rows: DeviceRow[] = configs.map((config, index) => {
      const view = views[index] as EntityView;
      return {
        key: `${config.entity}#${index}`,
        id: config.entity,
        parent: config.parent,
        config,
        view,
        label: config.name ?? (this.fromPrefs ? shortName(view) : view.name),
        glyph: config.icon ?? (this.fromPrefs ? 'plug' : glyphFor(view)),
        value: this.readingOf(config.entity, view, kind),
      };
    });
    // a sensor of another kind is its own plain row, outside the tree and its sums
    const other = (row: DeviceRow): boolean =>
      !this.fromPrefs && row.view.status === 'ok' && family(row.view) !== kind;
    const total = this.houseTotal(kind);
    const tree = deviceTree(
      rows.filter((row) => !other(row)),
      {
        total,
        sort: this.config?.sort !== false,
        ...(typeof this.config?.max_rows === 'number' ? { limit: this.config.max_rows } : {}),
      },
    );
    const plain = rows.filter(other);

    const values = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
    const scale = scaleOf([...values, total, tree.sum], kind === 'power' ? 'W' : 'Wh');
    const figure = (v: number | null): string =>
      v === null ? '—' : `${scaled(this.hass, v, scale)} ${scale.unit}`;
    const house = total ?? tree.sum;

    const tone: Tone = toneOf(this.config, 'accent');
    const waiting = this.fromPrefs && this.prefs === undefined;
    const empty = this.fromPrefs && !waiting && !rows.length;
    const none = !this.fromPrefs && values.length === 0;
    const first = rows[0]?.view;
    const width = this.contentWidth;
    const title = this.config?.title ?? s(this.hass, 'title');
    const when = this.t(kind === 'power' ? 'energy.drawing_now' : 'common.today');
    const fitted = this.head.fit({
      width,
      title,
      sub:
        none && first
          ? stateText(this.hass, first)
          : [this.config?.subtitle ?? when, house === null ? '' : figure(house)]
              .filter(Boolean)
              .join(' · '),
      // a share measured says something only when there are devices to measure it by
      badge:
        tree.measured === null || none || tree.measured <= 0
          ? null
          : {
              text: s(this.hass, 'measured', { percent: Math.round(tree.measured * 100) }),
              tone: 'neutral',
            },
    });

    const context: Context = {
      tree,
      total,
      scale,
      figure,
      width,
      tone,
      bare: width < BARE,
      stack: width < STACK,
    };
    return html`<article class="fv-card ef-card ${none ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'plug') : null,
        tone: none ? 'off' : tone,
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        empty
          ? this.head.empty(
              'plug',
              s(this.hass, 'no_devices'),
              s(this.hass, 'no_devices_hint'),
              this.contentWidth,
            )
          : html`<div
              class="ef-rows en-tree ${context.bare ? 'ef-rows--bare' : ''} ${context.stack ? 'ef-rows--stack' : ''}"
            >
              ${tree.roots.map((node) => this.renderNode(node, null, 0, context))}
              ${plain.map((row) => this.renderPlain(row, context))}
              ${
                tree.rest !== null
                  ? this.renderRest(
                      tree.rest,
                      s(this.hass, 'rest_of_house', { percent: percentOf(tree.rest, total) ?? 0 })
                        .split(' · ')
                        .map((text, index) => ({ text, optional: index > 0 })),
                      0,
                      context,
                    )
                  : nothing
              }
            </div>`
      }
    </article>`;
  }

  /** A device, and under it (on the spine from its circle) its own devices and what they leave unmeasured. */
  private renderNode(
    node: DeviceNode<DeviceRow>,
    parent: DeviceRow | null,
    depth: number,
    c: Context,
  ): TemplateResult {
    const row = node.item;
    const kids = node.children.length || node.rest !== null;
    const rest = node.rest === null ? 0 : (percentOf(node.rest, row.value) ?? 0);
    return html`${this.renderDevice(row, parent, node.children.length, depth, c)}
    ${
      kids
        ? html`<div class="en-tree__kids">
            ${node.children.map((child) => this.renderNode(child, row, depth + 1, c))}
            ${
              node.rest !== null
                ? this.renderRest(
                    node.rest,
                    [
                      c.stack
                        ? { text: s(this.hass, 'share', { percent: rest }) }
                        : this.shareOf(rest, row.label),
                    ],
                    depth + 1,
                    c,
                  )
                : nothing
            }
          </div>`
        : nothing
    }`;
  }

  private renderDevice(
    row: DeviceRow,
    parent: DeviceRow | null,
    devices: number,
    depth: number,
    c: Context,
  ): TemplateResult {
    // a device of the Energy dashboard is read from its statistics, whatever its sensor says now
    const usable = this.fromPrefs || row.view.status === 'ok';
    // an item's own tone or colour paints its circle and bar; by default a destination is ink
    const own = row.config.tone !== undefined || !!row.config.color;
    const rowTone = toneOf(row.config, c.tone);
    return this.bar(c, depth, {
      icon: row.glyph,
      tone: !usable ? 'off' : own && row.value !== null && row.value > 0 ? rowTone : 'neutral',
      title: row.label,
      accent: this.accents.item(row.config.color),
      segments: this.secondary(row, parent, devices, c),
      value: c.figure(row.value),
      fraction: barOf(row.value, c.tree.scale),
      barTone: row.config.color ? 'accent' : own && BAR_TONES.has(rowTone) ? rowTone : 'ink',
      onTap: (): void => this.tap(row.view.id, row.config.tap_action),
    });
  }

  /**
   * A bar row at its depth of the tree, its second line fitted to what the row leaves it: the indent of its level,
   * its figure — and, bare, the circle's room too. Stacked (half a column), the figure leads the second line.
   */
  private bar(
    c: Context,
    depth: number,
    o: {
      readonly icon: string;
      readonly tone: Tone;
      readonly title: string;
      readonly accent?: string | undefined;
      readonly segments: readonly Segment[];
      readonly value: string;
      readonly fraction: number;
      readonly barTone: Tone | 'ink';
      readonly onTap?: () => void;
    },
  ): TemplateResult {
    const width = c.width - depth * (c.bare ? INDENT_BARE : INDENT);
    const value = c.stack ? '' : o.value;
    const segments: readonly Segment[] = c.stack
      ? [{ text: o.value }, ...o.segments.map((segment) => ({ ...segment, optional: true }))]
      : o.segments;
    return barRow({
      icon: o.icon,
      tone: o.tone,
      title: o.title,
      // "Not measured" stands where a device's name stands, and gives way like one in a narrow column
      name: true,
      accent: o.accent,
      sub: this.head.fitRowSegments(
        segments,
        this.head.rowRoom(width, value) + (c.bare ? 56 : 0) + (c.stack ? 12 : 0),
      ),
      value,
      fraction: o.fraction,
      barTone: o.barTone,
      ...(o.onTap ? { onTap: o.onTap } : {}),
    });
  }

  /**
   * Second line: its state when it has no figure; otherwise its share — of its parent, of the house, or of the
   * devices' sum — then how many devices it holds, then what it cost (the last two go first when narrow).
   */
  private secondary(
    row: DeviceRow,
    parent: DeviceRow | null,
    devices: number,
    c: Context,
  ): Segment[] {
    if (!this.fromPrefs && row.view.status !== 'ok')
      return [{ text: stateText(this.hass, row.view) }];
    if (row.value === null) return [];
    const segments: Segment[] = [];
    const share = parent
      ? percentOf(row.value, parent.value)
      : percentOf(row.value, c.total ?? c.tree.sum);
    // stacked (half a column) the figure leads the line and every row says its share alike: "5.1 kWh · 38 %"; a share
    // of a parent is the share alone where the parent's name would leave the figure cut (tr "Kitchen içinde %43")
    if (share !== null)
      segments.push(
        c.stack || (devices && !parent)
          ? { text: s(this.hass, 'share', { percent: share }) }
          : parent
            ? this.shareOf(share, parent.label)
            : {
                text:
                  c.total !== null
                    ? flow(this.hass, 'share_of_house', { percent: share })
                    : s(this.hass, 'share_of_total', { percent: share }),
              },
      );
    if (devices)
      segments.push({
        text:
          devices === 1 ? this.t('common.device') : this.t('common.devices', { count: devices }),
        optional: segments.length > 0,
      });
    const cost = row.config.cost_entity
      ? costParts(this.hass, this.entity(row.config.cost_entity))
      : null;
    if (cost && cost.value !== '—')
      segments.push({
        text: [cost.value, cost.unit].filter(Boolean).join(' '),
        optional: segments.length > 0,
      });
    return segments;
  }

  /** "43 % of Kitchen", the share alone where the line cannot hold the parent's name with it. */
  private shareOf(percent: number, name: string): Segment {
    return {
      text: s(this.hass, 'share_of', { percent, name }),
      short: s(this.hass, 'share', { percent }),
    };
  }

  /** What is not measured: a parent's rest among its devices, or the house's after every device. */
  private renderRest(
    value: number,
    segments: readonly Segment[],
    depth: number,
    c: Context,
  ): TemplateResult {
    return this.bar(c, depth, {
      icon: 'dots',
      tone: 'neutral',
      title: s(this.hass, 'not_measured'),
      segments,
      value: c.figure(value),
      fraction: barOf(value, c.tree.scale),
      barTone: 'ink',
    });
  }

  /** A sensor of another kind: its own figure, no share, no bar. */
  private renderPlain(row: DeviceRow, c: Context): TemplateResult {
    const own = valueParts(this.hass, row.view);
    const value = [own.value, own.unit].filter(Boolean).join(' ');
    return listRow({
      icon: row.glyph,
      tone: 'neutral',
      title: row.label,
      name: true,
      accent: this.accents.item(row.config.color),
      sub: this.head.fitRowSub(
        row.view.areaName,
        this.head.rowRoom(c.width, value) + (c.bare ? 56 : 0),
      ),
      trailing: 'value',
      value,
      onTap: () => this.tap(row.view.id, row.config.tap_action),
    });
  }
}

interface Context {
  readonly tree: DeviceTree<DeviceRow>;
  readonly total: number | null;
  readonly scale: Scale;
  readonly figure: (v: number | null) => string;
  readonly width: number;
  readonly tone: Tone;
  /** The rows have no circles (a narrow column). */
  readonly bare: boolean;
  /** The figure leads the second line (half a column). */
  readonly stack: boolean;
}
