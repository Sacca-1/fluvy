import { batteriesHeight } from '../energy-family.js';
import {
  formatNumber,
  strings,
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

import { fetchPrefs } from '../energy-model/house.js';
import type { EnergyPrefs } from '../energy-model/prefs.js';
import { readMeasure } from '../energy-model/reading.js';
import { measureOfSource, sourceIds } from '../energy-model/sources.js';
import { HeadFit } from '../energy/head.js';
import { durationFigure, durationReadout } from '../energy/duration.js';
import { MARK_LABEL, markedRuler } from '../energy/marked-ruler.js';
import { modeRow } from '../energy/mode-row.js';
import { valueRow, type Figure } from '../shared/value-row.js';
import { deviceName, scaled, scaleOf, type Scale } from '../energy/power.js';
import { Card, type BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import {
  accentField,
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  iconField,
  numberField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { RowsListSpec } from '../shared/rows-editor.js';
import {
  BATTERY_KEYS,
  hasPower,
  netCharge,
  prefBatteries,
  stateOfCharge,
  timeLeft,
  totalCapacity,
  wayOf,
  type BatteryConfig,
  type Cell,
} from './pack.js';

const s = strings('batteries', 'energy-flow');

export interface BatteriesCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** The batteries, each read as a source is. Empty: the Energy dashboard's (their power, state of charge, capacity). */
  batteries?: readonly BatteryConfig[];
  /** The state of charge kept back (%): the ruler's "Reserve" mark, and what "empty in" counts down to. */
  reserve?: number;
  /** A `select` / `input_select` of the batteries' mode. */
  mode?: string;
}

/** One battery, read and named. */
interface Battery {
  readonly config: BatteryConfig;
  readonly cell: Cell;
  readonly name: string;
  /** A name of its own (the config's, the Energy dashboard's), not one made from its sensor. */
  readonly named: boolean;
  /** What a tap on it opens: its state of charge, else its power. */
  readonly entity: string | undefined;
  readonly accent: string | undefined;
}

/** Under this column (half a phone's) a row's circle would leave its name a letter or two: the rows go without it. */
const BARE_BELOW = 200;
/** A battery's charge as its row says it: "72 %", "—" when it cannot be read, nothing when it has none. */
const levelText = (hass: HomeAssistant | undefined, level: number | null | undefined): string =>
  level === undefined ? '' : level === null ? '—' : `${formatNumber(hass, level, { digits: 0 })} %`;

const kwh = (hass: HomeAssistant | undefined, value: number): string =>
  `${formatNumber(hass, value, { digits: 1 })} kWh`;

/**
 * The house's batteries as one: their state of charge on a read-only ruler (weighted by capacity when every battery
 * states one), when they will be full or down to the reserve at the power of now, a row per battery when there are
 * several, and their mode. With no batteries given, the Energy dashboard's are read. A charge or a power that cannot
 * be read is "—", and what depends on it is not drawn: nothing is estimated.
 */
export class FluvyBatteriesCard extends Card<BatteriesCardConfig> {
  static override layoutHeight(config: BatteriesCardConfig, hass?: HomeAssistant): number {
    return batteriesHeight(config, hass);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.energy,
    css`
      .ef-card {
        width: 100%;
      }
    `,
  ];

  /** A group of batteries has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<BatteriesCardConfig>()([
    'title',
    'subtitle',
    'batteries',
    'reserve',
    'mode',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'batteries',
      title: 'batteries.editor_batteries',
      idKey: 'power',
      also: ['phases', 'import', 'export', 'level'],
      picker: entityField(['sensor'], 'power', false),
      keys: BATTERY_KEYS,
      schema: [
        entityField(['sensor'], 'power', false),
        { name: 'phases', selector: { entity: { domain: ['sensor'], multiple: true } } },
        fieldRow(
          entityField(['sensor'], 'import', false),
          entityField(['sensor'], 'export', false),
        ),
        boolField('invert'),
        fieldRow(entityField(['sensor'], 'level', false), numberField('capacity', 0, 1000, 0.1)),
        fieldRow(textField('name'), iconField()),
        accentField(),
      ],
      computeLabel: editorLabels(s, {
        power: 'editor_power',
        phases: 'editor_phases',
        import: 'editor_import',
        export: 'editor_export',
        invert: 'editor_invert',
        level: 'editor_level',
        capacity: 'editor_capacity',
      }).computeLabel,
    },
  ];
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), numberField('reserve', 0, 100, 1)),
        showIconField(),
        entityField(['select', 'input_select'], 'mode', false),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(s, { reserve: 'editor_reserve', mode: 'editor_mode' }),
    };
  }

  static getStubConfig(): BatteriesCardConfig {
    // the Energy dashboard's own batteries
    return { type: 'custom:fluvy-batteries-card' };
  }

  private readonly head = new HeadFit(this);
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  /** What the charge's row last showed beside it while it could be read: the time's label, none (null), or not yet. */
  private side: string | null | undefined;

  override getCardSize(): number {
    return Math.ceil(FluvyBatteriesCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private own(): BatteryConfig[] {
    return (this.config?.batteries ?? []).filter(
      (b): b is BatteryConfig =>
        typeof b === 'object' && b !== null && (hasPower(b) || Boolean(b.level)),
    );
  }

  private list(): BatteryConfig[] {
    const own = this.own();
    return own.length ? own : prefBatteries(this.prefs);
  }

  private reserve(): number {
    const raw = Number(this.config?.reserve);
    return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  }

  protected override watched(): readonly string[] {
    return [
      ...this.list().flatMap((b) => sourceIds({ type: 'battery', ...b })),
      this.config?.mode,
    ].filter((id): id is string => !!id);
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.config || this.prefsAsked || !this.hass || this.own().length) return;
    this.prefsAsked = true;
    void fetchPrefs(this.hass).then((prefs) => {
      this.prefs = prefs;
      this.requestUpdate();
    });
  }

  /* ---------- reading ---------- */

  private read(): Battery[] {
    const list = this.list();
    return list.map((b, i): Battery => {
      const measure = measureOfSource({ type: 'battery', ...b });
      // + toward the house is a discharge: what goes into the battery is its charge
      const flow = measure ? readMeasure(measure, (id) => this.entity(id)) : null;
      const charge =
        flow === null
          ? undefined
          : flow.in === null || flow.out === null
            ? null
            : flow.out - flow.in;
      const levelView = b.level ? this.entity(b.level) : undefined;
      const level =
        levelView === undefined
          ? undefined
          : levelView.status === 'ok' && levelView.number !== null
            ? Math.min(100, Math.max(0, levelView.number))
            : null;
      const capacity = Number(b.capacity);
      const first = b.power ?? b.phases?.[0] ?? b.import ?? b.export;
      const from = first ?? b.level;
      return {
        config: b,
        cell: { level, capacity: capacity > 0 ? capacity : undefined, charge },
        name:
          b.name ??
          (from ? deviceName(this.entity(from)) : `${s(this.hass, 'title_one')} ${i + 1}`),
        named: Boolean(b.name),
        entity: b.level ?? first,
        accent: b.color !== undefined && b.color !== '' ? this.accents.item(b.color) : undefined,
      };
    });
  }

  /** "charging 0.4 kW", "idle", "unavailable": a battery's power in the words of a row. */
  private powerWords(charge: number | null | undefined, scale: Scale): string {
    if (charge === undefined) return '';
    if (charge === null) return s(this.hass, 'unavailable');
    const way = wayOf(charge);
    if (way === 'idle') return s(this.hass, 'idle');
    const power = `${scaled(this.hass, Math.abs(charge), scale)} ${scale.unit}`;
    return s(this.hass, way === 'charging' ? 'charging_at' : 'discharging_at', { power });
  }

  /** The head's badge: which way the group goes. Two batteries can do both at once: the net decides. */
  private badge(cells: readonly Cell[], net: number | null | undefined, tone: Tone) {
    if (net === null) return { text: this.t('state.unavailable'), tone: 'warning' as Tone };
    if (net === undefined) return null;
    const way = wayOf(net);
    if (way !== 'idle')
      return { text: s(this.hass, way === 'charging' ? 'charging' : 'discharging'), tone };
    // resting as a whole while one charges another is not idle: nothing is said
    return cells.every((c) => typeof c.charge !== 'number' || wayOf(c.charge) === 'idle')
      ? { text: this.t('energy.idle'), tone: 'neutral' as Tone }
      : null;
  }

  /** The head's second line: how many and how much; for one battery, its name and what it does. */
  private sub(all: readonly Battery[], net: number | null | undefined, scale: Scale): string {
    if (this.config?.subtitle !== undefined) return this.config.subtitle;
    const capacity = totalCapacity(all.map((b) => b.cell));
    if (all.length > 1)
      return [
        s(this.hass, 'count', { count: all.length }),
        capacity !== undefined ? kwh(this.hass, capacity) : '',
      ]
        .filter(Boolean)
        .join(' · ');
    const one = all[0];
    if (!one) return '';
    // the badge says which way: the sub gives the figure
    const power =
      typeof net === 'number' && wayOf(net) !== 'idle'
        ? `${scaled(this.hass, Math.abs(net), scale)} ${scale.unit}`
        : '';
    return [
      one.named ? one.name : '',
      capacity !== undefined ? kwh(this.hass, capacity) : '',
      power,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const w = this.contentWidth;
    const all = this.read();
    const cells = all.map((b) => b.cell);
    const tone = toneOf(this.config, 'battery');
    const title = this.config?.title ?? s(this.hass, all.length > 1 ? 'title' : 'title_one');
    const net = netCharge(cells);
    // every power of the card in one unit, the largest deciding ("0.4 kW" beside "2.2 kW", never "400 W")
    const scale = scaleOf(
      [...cells.map((c) => c.charge ?? null), net ?? null].map((v) =>
        v === null ? null : Math.abs(v),
      ),
      'W',
    );
    const active = typeof net === 'number' && wayOf(net) !== 'idle';
    const badge = all.length ? this.badge(cells, net, tone) : null;
    const fitted = this.head.fit({ width: w, title, sub: this.sub(all, net, scale), badge });
    const first = all[0]?.entity;
    const waiting = !this.own().length && this.prefs === undefined;
    return html`<article class="fv-card ef-card en-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'battery') : null,
        tone: active ? tone : 'neutral',
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(first),
      })}
      ${
        all.length
          ? this.renderBody(all, net, scale, tone, title, w)
          : waiting
            ? nothing
            : this.head.empty(
                'battery',
                s(this.hass, 'no_batteries'),
                s(this.hass, 'no_batteries_hint'),
                this.contentWidth,
              )
      }
      ${this.renderMode(tone, w)}
    </article>`;
  }

  private renderBody(
    all: readonly Battery[],
    net: number | null | undefined,
    scale: Scale,
    tone: Tone,
    title: string,
    w: number,
  ): TemplateResult {
    const cells = all.map((b) => b.cell);
    const soc = stateOfCharge(cells);
    const reserve = this.reserve();
    const left = timeLeft(cells, reserve);
    const way = typeof net === 'number' ? wayOf(net) : null;
    // the group's charge ("State of charge" on one line: a column too narrow for it says "Charge"), or — when no
    // battery says its charge — its power, the way in the unit's slot
    const full = s(this.hass, 'state_of_charge');
    const main: Figure =
      soc !== undefined
        ? {
            label:
              this.head.ruler.width('fv-readout__label', full) <= w ? full : s(this.hass, 'charge'),
            value: soc === null ? '—' : formatNumber(this.hass, soc, { digits: 0 }),
            unit: soc === null ? '' : '%',
          }
        : typeof net === 'number'
          ? {
              label: this.t('energy.power'),
              value: scaled(this.hass, Math.abs(net), scale),
              unit:
                way === 'idle'
                  ? scale.unit
                  : `${scale.unit} ${s(this.hass, way === 'charging' ? 'way_charging' : 'way_discharging')}`,
            }
          : { label: this.t('energy.power'), value: '—', unit: '' };
    const sideLabel = s(this.hass, way === 'charging' ? 'full_in' : 'empty_in');
    // out of reach (a charge or a power that cannot be read), the row keeps the time it last showed beside the charge,
    // "—" in it, or "Full in —" when the card opens so: it keeps its second figure while the batteries are away (1.9)
    const away = cells.some((c) => c.charge === null || c.level === null);
    if (!away) this.side = left === null ? null : sideLabel;
    const kept = away ? (this.side === undefined ? s(this.hass, 'full_in') : this.side) : null;
    return html`${valueRow(
      this.head.ruler,
      w,
      main,
      left !== null
        ? {
            figure: durationFigure(this.hass, sideLabel, left),
            drawn: durationReadout(this.hass, sideLabel, left),
          }
        : kept
          ? { figure: { label: kept, value: '—', unit: '' } }
          : null,
    )}
    ${
      soc !== undefined
        ? markedRuler({
            hass: this.hass,
            width: w,
            value: soc,
            tone,
            mark:
              reserve > 0 && reserve < 100
                ? { percent: reserve, text: s(this.hass, 'reserve') }
                : null,
            label: `${title} · ${s(this.hass, 'state_of_charge')}`,
            measure: (text) => this.head.ruler.width(MARK_LABEL, text),
          })
        : nothing
    }
    ${all.length > 1 ? this.renderRows(all, scale, tone, w) : nothing}`;
  }

  /** A row a battery; in a column too narrow for their circles, bare: the words take the row. */
  private renderRows(all: readonly Battery[], scale: Scale, tone: Tone, w: number): TemplateResult {
    // bare in a narrow column, or where a row's first words (its capacity, else its power: "descargando 500 W") would
    // be cut beside its charge: the rows give their circles together, the charge leading the second line
    const bare =
      w < BARE_BELOW ||
      !this.head.rowsKeepIcon(
        w,
        all.map((b) => ({
          title: b.name,
          value: levelText(this.hass, b.cell.level),
          sub: this.rowTexts(b, scale, false)[0] ?? '',
        })),
      );
    return html`<div class="ef-rows ${bare ? 'is-bare' : ''}">
      ${all.map((b) => this.renderRow(b, scale, tone, w, bare))}
    </div>`;
  }

  /** A battery row's second line, in order: its charge where the row is bare, its capacity, its power. */
  private rowTexts(b: Battery, scale: Scale, bare: boolean): string[] {
    const c = b.cell;
    const texts = [
      bare ? levelText(this.hass, c.level) : '',
      c.capacity !== undefined ? kwh(this.hass, c.capacity) : '',
      this.powerWords(c.charge, scale),
    ].filter(Boolean);
    // a state opens the line capitalised ("Unavailable"), and follows a "·" in lower case
    if (texts[0] === s(this.hass, 'unavailable')) texts[0] = this.t('state.unavailable');
    return texts;
  }

  /**
   * A battery: its charge as a bar under its name and as the figure beside it, its capacity and power as the second
   * line. Bare, the name takes the whole row and the charge leads the second line, where it never gives way.
   */
  private renderRow(
    b: Battery,
    scale: Scale,
    tone: Tone,
    w: number,
    bare: boolean,
  ): TemplateResult {
    const c = b.cell;
    const own = toneOf(b.config, tone);
    const moving = typeof c.charge === 'number' && wayOf(c.charge) !== 'idle';
    // nothing of it can be read: the unavailable idiom (the dashed ring, "Unavailable"), as a device's row draws it
    const dead =
      (c.level === null || c.charge === null) &&
      typeof c.level !== 'number' &&
      typeof c.charge !== 'number';
    const value = bare ? '' : levelText(this.hass, c.level);
    // the segments after the first leave from the end before anything is cut
    const sub = this.head.fitRowSegments(
      this.rowTexts(b, scale, bare).map((text, index) => ({ text, optional: index > 0 })),
      bare ? w : this.head.rowRoom(w, value),
    );
    const onTap = b.entity ? () => this.tap(b.entity, { action: 'more-info' }) : undefined;
    const row = {
      icon: b.config.icon ?? 'battery',
      tone: dead ? ('off' as Tone) : moving ? own : ('neutral' as Tone),
      title: b.name,
      name: true,
      accent: b.accent,
      ...(sub ? { sub } : {}),
      onTap,
    };
    return c.level === undefined
      ? listRow({ ...row, trailing: 'none' })
      : barRow({
          ...row,
          value,
          fraction: (c.level ?? 0) / 100,
          barTone: c.level === null ? 'neutral' : own,
        });
  }

  /** The batteries' mode, when the card is given one. */
  private renderMode(tone: Tone, w: number): TemplateResult | typeof nothing {
    const id = this.config?.mode;
    if (!id) return nothing;
    const view = this.entity(id);
    if (view.status === 'missing') return nothing;
    return modeRow({
      hass: this.hass,
      view,
      state: this.stateOf(view),
      heading: s(this.hass, 'mode'),
      width: w,
      ruler: this.head.ruler,
      glyph: 'battery',
      tone,
      // a battery's modes have no meaning to write under their names ("Self use", "Backup"): a chip row says them
      tilesUpTo: 0,
      onSelect: (option) => {
        this.expect(view.id, option);
        this.call(view.domain, 'select_option', { option }, view.id);
      },
    });
  }
}
