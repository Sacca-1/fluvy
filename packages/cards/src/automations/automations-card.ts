import {
  areaOf,
  haptic,
  houseZone,
  isUsable,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type MessageKey,
} from '@fluvy/core';
import { head, listRow, options, round, type OptionItem, type Tone } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { AUTOMATIONS_MAX_ROWS, automationsHeight } from '../automations-family.js';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import { Card, type BaseKey } from '../shared/base.js';
import { chipRow } from '../shared/chips.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import { firstFit } from '../shared/fit.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  editorWord,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  numberField,
  orderedField,
  selectField,
  titleFields,
} from '../shared/form.js';
import { optionCell, valuesHold } from '../shared/options.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import { lastText, nextText, scheduleLines } from './format.js';
import {
  buildAutomation,
  nextRun,
  parseAutomation,
  type AutomationConfig,
  type RunEnv,
  type Schedule,
} from './schedule.js';
import type {
  DetailsRequest,
  FluvyScheduleSheet,
  ScheduleRequest,
} from './sheet/schedule-sheet.js';
import { AutomationStore, workdaySensor } from './store.js';

const s = strings('automations');

export const AUTOMATIONS_VARIANTS = ['rows', 'compact', 'tiles'] as const;
export const AUTOMATIONS_SHOW = ['all', 'schedules'] as const;
export const AUTOMATIONS_SORT = ['name', 'next', 'last'] as const;
/** What a schedule may target when the config says nothing. */
export const DEFAULT_DOMAINS: readonly string[] = [
  'light',
  'switch',
  'input_boolean',
  'fan',
  'cover',
  'climate',
  'scene',
  'script',
];
/** The domains the editor offers, each with a word of its own. */
const DOMAIN_CHOICES = [...DEFAULT_DOMAINS, 'valve', 'media_player'] as const;
/** The minutes a time field's arrows and the sun offset's stepper move by, when the config says nothing. */
export const DEFAULT_TIME_STEP = 5;
/** What the filter chips narrow the list to. */
type Filter = 'all' | 'schedules' | 'on';

export interface AutomationsCardConfig extends FluvyCardConfig {
  title?: string;
  /** The head's second line; by default "{on} of {count} on". */
  subtitle?: string;
  /** Only the automations of this area, and the schedules with a target in it. */
  area?: string;
  /** Every automation of the house, or Fluvy's schedules alone. */
  show?: (typeof AUTOMATIONS_SHOW)[number];
  /** `rows` (60, the days and times under each name), `compact` (48, the name and its switch), `tiles` (two a row). */
  variant?: (typeof AUTOMATIONS_VARIANTS)[number];
  /** The `+` in the head (administrators only, whatever this says). */
  show_add?: boolean;
  show_switch?: boolean;
  show_last?: boolean;
  show_next?: boolean;
  /** The chips All · Schedules · On under the head. */
  show_filters?: boolean;
  /** By name (the order of `entities` when they are listed), by the next run, or by the last. */
  sort?: (typeof AUTOMATIONS_SORT)[number];
  /** Rows before the "{count} more" row takes over (default 6). */
  max_rows?: number;
  /** What a schedule may target; `DEFAULT_DOMAINS` when unsaid. */
  domains?: readonly string[];
  /** The house's workday binary sensor; found by itself when the workday integration has one. */
  workday?: string;
  /** Minutes the time field's arrows and the sun offset move by (default 5). */
  time_step?: number;
  /** Test hook: an ISO date that freezes "now" (the next and last runs). Undocumented. */
  _now?: string;
}

/** One automation as the card lists it. */
interface Row {
  readonly id: string;
  readonly view: EntityView;
  readonly alias: string;
  readonly on: boolean;
  readonly usable: boolean;
  /** The config's id (`attributes.id`); a YAML automation without one has none. */
  readonly configId: string | undefined;
  readonly schedule: Schedule | undefined;
  readonly next: Date | undefined;
  readonly last: Date | undefined;
}

/** The automation entities of a house, once per `hass.states` object. */
const universes = new WeakMap<object, readonly string[]>();
function automationIds(hass: HomeAssistant | undefined): readonly string[] {
  if (!hass) return [];
  let ids = universes.get(hass.states);
  if (!ids) {
    ids = Object.keys(hass.states).filter((id) => id.startsWith('automation.'));
    universes.set(hass.states, ids);
  }
  return ids;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** A config read strictly as a schedule, once per config object. */
const parsed = new WeakMap<AutomationConfig, Schedule | undefined>();
function scheduleOf(config: AutomationConfig | undefined): Schedule | undefined {
  if (!config) return undefined;
  if (!parsed.has(config)) parsed.set(config, parseAutomation(config));
  return parsed.get(config);
}

/** The sun's next rising and setting as `sun.sun` reports them, for the next run of a sun schedule. */
export function sunOf(hass: HomeAssistant | undefined): RunEnv['sun'] {
  const attrs = hass?.states['sun.sun']?.attributes;
  if (!attrs) return undefined;
  const rising = new Date(String(attrs['next_rising'] ?? ''));
  const setting = new Date(String(attrs['next_setting'] ?? ''));
  return Number.isFinite(rising.getTime()) && Number.isFinite(setting.getTime())
    ? { rising, setting }
    : undefined;
}

const lastRunOf = (view: EntityView): Date | undefined => {
  const raw = view.attr<unknown>('last_triggered');
  if (typeof raw !== 'string' || !raw) return undefined;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

/**
 * The house's automations on one card: a row each with its switch, when it last ran and, for a Fluvy schedule, its
 * days, its times and its next run; filters, a fold for long lists, tiles or compact rows. A tap opens the
 * schedule sheet (the editor for a schedule, the details for the rest), fetched the first time it is needed; the
 * head's `+` adds a schedule. Only an administrator reads configs or sees the `+`: anyone else gets plain rows,
 * the switch, and Home Assistant's own dialog on tap.
 */
export class FluvyAutomationsCard extends Card<AutomationsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns (the family file's, which every page has). */
  static override layoutHeight(config: AutomationsCardConfig): number {
    return automationsHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    css`
      .au-filters {
        margin-top: 16px;
      }
      .au-filters .fv-chips {
        margin-top: 0;
      }
      .au-rows,
      .au-tiles,
      .au-empty {
        margin-top: 16px;
      }
      /* the least a schedule's line says ("Every day · Sunrise") takes a second line where a column cannot hold it
         beside the switch, and the row grows with it: a segment gives way, and is never cut */
      /* the add row under the list (a column too narrow for the + beside the title): its words take a second line
         rather than an ellipsis — "Aggiungi una programmazione" in a 176 column */
      .au-add .fv-row {
        height: auto;
        min-height: 48px;
        padding-block: 6px;
      }
      .au-add .fv-row__title {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        line-height: 18px;
      }
      .au-rows .fv-row:not(.fv-row--compact) {
        height: auto;
        min-height: 60px;
        padding: 8px 0;
      }
      .au-rows .fv-row:not(.fv-row--compact) .fv-row__sub {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .au-tiles .fv-options {
        margin-top: 0;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    expanded_: { state: true },
    filter_: { state: true },
    sheetReady_: { state: true },
  };

  /** The head's fitting and the rows' (what gives way, in its order), its words measured as the card sets them. */
  private readonly headFit = new HeadFit(this);

  declare expanded_: boolean;
  declare filter_: Filter;
  /** The schedule sheet's chunk has landed: the sheet element is in the card. */
  declare sheetReady_: boolean;

  private store: AutomationStore | undefined;
  private unsubscribe: (() => void) | undefined;
  private ticker = 0;

  constructor() {
    super();
    this.expanded_ = false;
    this.filter_ = 'all';
    this.sheetReady_ = false;
  }

  /** A card of many automations has no entity of its own: the head's icon, tone and colour, its tap ("…") and its hold. */
  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<AutomationsCardConfig>()([
    'title',
    'subtitle',
    'area',
    'show',
    'variant',
    'show_add',
    'show_switch',
    'show_last',
    'show_next',
    'show_filters',
    'sort',
    'max_rows',
    'domains',
    'workday',
    'time_step',
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = (_config, hass) => ({
    show: 'all',
    variant: 'rows',
    sort: 'name',
    show_add: true,
    show_switch: true,
    show_last: true,
    show_next: true,
    show_filters: false,
    max_rows: AUTOMATIONS_MAX_ROWS,
    domains: DEFAULT_DOMAINS,
    time_step: DEFAULT_TIME_STEP,
    ...(hass?.states ? { workday: workdaySensor(hass) } : {}),
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('variant', AUTOMATIONS_VARIANTS)),
        fieldRow(selectField('show', AUTOMATIONS_SHOW), selectField('sort', AUTOMATIONS_SORT)),
        fieldRow(boolField('show_add'), boolField('show_switch')),
        fieldRow(boolField('show_last'), boolField('show_next')),
        fieldRow(boolField('show_filters'), numberField('max_rows', 1, 30)),
        entitiesField('entities', ['automation']),
        { name: 'area', selector: { area: {} } },
        fieldRow(entityField(['binary_sensor'], 'workday', false), numberField('time_step', 1, 60)),
        orderedField(
          'domains',
          DOMAIN_CHOICES.map((domain) => ({
            value: domain,
            label: editorWord(`automations.domain_${domain}` as MessageKey),
          })),
        ),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(
        s,
        {
          show: 'editor.show',
          sort: 'editor.sort',
          show_switch: 'editor.show_switch',
          show_last: 'editor.show_last',
          show_next: 'editor.show_next',
          show_filters: 'editor.show_filters',
          domains: 'editor.domains',
          workday: 'editor.workday',
          time_step: 'editor.time_step',
        },
        {},
      ),
      computeHelper: (schema) =>
        schema.name === 'workday'
          ? editorWord('automations.editor.workday_help' as MessageKey)
          : undefined,
    };
  }

  /** Up to six of the house's automations; an empty house is the empty state, never an error. */
  static getStubConfig(_hass: unknown, entities: readonly string[]): AutomationsCardConfig {
    const automations = entities.filter((id) => id.startsWith('automation.')).slice(0, 6);
    return {
      type: 'custom:fluvy-automations-card',
      ...(automations.length ? { entities: automations } : {}),
    };
  }

  override getCardSize(): number {
    return 2 + Math.min(this.universe().length || 1, this.maxRows() + 1);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- the house, the store, the clock ---------- */

  /** The automations the card is about: the ones listed, else every one of the house. */
  private universe(): readonly string[] {
    const listed = this.config?.entities;
    if (listed) return listed.filter((id) => id.startsWith('automation.'));
    return automationIds(this.hass);
  }

  private get admin(): boolean {
    return this.store?.admin === true;
  }

  private maxRows(): number {
    const asked = Math.round(Number(this.config?.max_rows));
    return Number.isFinite(asked) ? Math.min(30, Math.max(1, asked)) : AUTOMATIONS_MAX_ROWS;
  }

  private timeStep(): number {
    const asked = Math.round(Number(this.config?.time_step));
    return Number.isFinite(asked) && asked >= 1 && asked <= 60 ? asked : DEFAULT_TIME_STEP;
  }

  private workday(): string | undefined {
    return this.config?.workday ?? workdaySensor(this.hass as HomeAssistant);
  }

  private now(): Date {
    const frozen = this.config?._now ? new Date(this.config._now) : null;
    return frozen && Number.isFinite(frozen.getTime()) ? frozen : new Date();
  }

  protected override watched(): readonly string[] {
    return [...this.universe(), 'sun.sun', ...(this.workday() ? [this.workday() as string] : [])];
  }

  /** The house gained or lost an automation (a schedule saved or deleted): the list changes with it. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (super.shouldUpdate(changed)) return true;
    if (this.config?.entities) return false;
    const previous = changed.get('hass') as HomeAssistant | undefined;
    return !sameList(automationIds(previous), automationIds(this.hass));
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!changed.has('hass') || !this.hass) return;
    const store = AutomationStore.for(this.hass);
    if (store !== this.store) {
      this.unsubscribe?.();
      this.store = store;
      if (this.isConnected) this.unsubscribe = store.subscribe(() => this.requestUpdate());
    }
    // the configs of the schedules listed, read once and again after a reload (nothing for anyone but an administrator)
    const hass = this.hass;
    void store.load(
      this.universe().flatMap((id) => {
        const configId = hass.states[id]?.attributes['id'];
        return typeof configId === 'string' ? [configId] : [];
      }),
    );
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.store && !this.unsubscribe)
      this.unsubscribe = this.store.subscribe(() => this.requestUpdate());
    // "Next in 2 h" and "Ran 07:00" move with the clock, once a minute; a frozen clock has nothing to move
    if (!this.config?._now) this.ticker = window.setInterval(() => this.requestUpdate(), 60_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearInterval(this.ticker);
    this.ticker = 0;
  }

  /* ---------- the rows ---------- */

  private env(schedule: Schedule): RunEnv {
    const hass = this.hass;
    const sensor =
      (schedule.days.kind === 'workdays' || schedule.days.kind === 'weekend') &&
      schedule.days.sensor
        ? schedule.days.sensor
        : undefined;
    const state = sensor ? hass?.states[sensor]?.state : undefined;
    const sun = sunOf(hass);
    const zone = houseZone(hass);
    return {
      ...(sun ? { sun } : {}),
      ...(zone ? { zone } : {}),
      ...(state === 'on' || state === 'off' ? { workday: state === 'on' } : {}),
    };
  }

  private row(id: string, now: Date): Row {
    const view = this.entity(id);
    const configId = view.attr<unknown>('id');
    const schedule =
      typeof configId === 'string' && this.admin
        ? scheduleOf(this.store?.config(configId))
        : undefined;
    return {
      id,
      view,
      alias: view.name,
      on: this.stateOf(view) === 'on',
      usable: isUsable(view),
      configId: typeof configId === 'string' && configId ? configId : undefined,
      schedule,
      next: schedule ? nextRun(schedule, now, this.env(schedule)) : undefined,
      last: lastRunOf(view),
    };
  }

  /** The automations in the area: their own, or a schedule's by any of its targets. */
  private inArea(row: Row, area: string): boolean {
    if (areaOf(this.hass, row.id) === area) return true;
    return row.schedule?.targets.some((target) => areaOf(this.hass, target) === area) ?? false;
  }

  private sorted(rows: readonly Row[], listed: boolean): Row[] {
    const language = this.hass?.language;
    const byName = (a: Row, b: Row): number => a.alias.localeCompare(b.alias, language);
    const sort = this.config?.sort ?? 'name';
    if (sort === 'name') return listed ? [...rows] : [...rows].sort(byName);
    const key = sort === 'next' ? 'next' : 'last';
    return [...rows].sort((a, b) => {
      const at = a[key];
      const bt = b[key];
      if (at && bt)
        return sort === 'next' ? at.getTime() - bt.getTime() : bt.getTime() - at.getTime();
      if (at) return -1;
      if (bt) return 1;
      return byName(a, b);
    });
  }

  /* ---------- acting ---------- */

  private toggle(id: string, next: boolean): void {
    haptic(this, 'selection');
    this.expect(id, next ? 'on' : 'off');
    this.call('automation', next ? 'turn_on' : 'turn_off', {}, id);
  }

  private run(id: string): void {
    haptic(this, 'light');
    this.call('automation', 'trigger', { skip_condition: true }, id);
  }

  /** The sheet, its chunk fetched the first time: a dashboard that only lists never pays for it. */
  private async sheet(): Promise<FluvyScheduleSheet | undefined> {
    if (!this.sheetReady_) {
      await import('./sheet/schedule-sheet.js');
      this.sheetReady_ = true;
    }
    await this.updateComplete;
    return this.renderRoot.querySelector<FluvyScheduleSheet>('fluvy-schedule-sheet') ?? undefined;
  }

  private async openSheet(request: ScheduleRequest | DetailsRequest): Promise<void> {
    const openedBy = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    const sheet = await this.sheet();
    sheet?.open(request, openedBy ?? this);
  }

  private scheduleRequest(schedule: Schedule | undefined, row?: Row): ScheduleRequest {
    const store = this.store as AutomationStore;
    const workday = this.workday();
    return {
      ...(schedule ? { schedule } : {}),
      domains: this.config?.domains?.length ? this.config.domains : DEFAULT_DOMAINS,
      ...(this.config?.area ? { area: this.config.area } : {}),
      ...(workday ? { workday } : {}),
      timeStep: this.timeStep(),
      sun: sunOf(this.hass),
      ...(row ? { entity: row.id, toggle: (next: boolean) => this.toggle(row.id, next) } : {}),
      save: (next) => store.save(next.id, buildAutomation(next, workday)),
      ...(schedule ? { remove: () => store.remove(schedule.id) } : {}),
    };
  }

  private detailsRequest(row: Row): DetailsRequest {
    return {
      entity: row.id,
      alias: row.alias,
      ...(row.configId ? { configId: row.configId } : {}),
      run: () => this.run(row.id),
      toggle: (next) => this.toggle(row.id, next),
    };
  }

  /** A tap on a row: the sheet for an administrator (the editor for a schedule, the details for the rest), more-info for anyone else. */
  private open(row: Row): void {
    if (!this.admin) {
      this.tap(row.id, { action: 'more-info' });
      return;
    }
    void this.openSheet(
      row.schedule ? this.scheduleRequest(row.schedule, row) : this.detailsRequest(row),
    );
  }

  private add(): void {
    if (!this.admin) return;
    void this.openSheet(this.scheduleRequest(undefined));
  }

  /* ---------- render ---------- */

  /**
   * A schedule's line, the fullest of its forms that holds the room (`scheduleLines`: the next run gives way first,
   * then the sun's offsets, then the end, then a long list of days; the days' word and the start never go).
   */
  private scheduleSub(row: Row, schedule: Schedule, room: number, now: Date): string {
    const next = this.config?.show_next !== false ? row.next : undefined;
    return (
      firstFit(
        scheduleLines(this.hass, schedule, next, now),
        (line) => this.headFit.ruler.width('fv-row__sub', line) <= room,
      ) ?? ''
    );
  }

  /** A plain automation's line: when it last ran, else where it is. */
  private plainSub(row: Row, now: Date): string {
    if (!row.usable) return stateText(this.hass, row.view);
    if (this.config?.show_last !== false) return lastText(this.hass, row.last, now);
    return row.view.areaName;
  }

  private renderRow(
    row: Row,
    tone: Tone,
    compact: boolean,
    keep: boolean,
    now: Date,
  ): TemplateResult {
    const switchable = this.config?.show_switch !== false;
    const room = this.headFit.rowRoom(this.contentWidth, '', {
      compact,
      icon: keep,
      end: switchable ? SWITCH_SLOT : 44,
    });
    const sub = compact
      ? ''
      : row.schedule
        ? row.usable
          ? this.scheduleSub(row, row.schedule, room, now)
          : stateText(this.hass, row.view)
        : this.plainSub(row, now);
    return listRow({
      icon: keep ? (row.schedule ? 'clock' : 'automation') : null,
      tone: !row.usable ? 'off' : row.on ? tone : 'neutral',
      title: row.alias,
      name: true,
      compact,
      sub,
      trailing: switchable ? 'switch' : 'chevron',
      on: row.on,
      switchTone: tone,
      unavailable: !row.usable,
      ...(!row.usable ? { label: `${row.alias} · ${stateText(this.hass, row.view)}` } : {}),
      onTap: () => this.open(row),
      onHold: () => this.hold(row.id, { action: 'more-info' }),
      onToggle: (next) => this.toggle(row.id, next),
    });
  }

  /** The tiles: two a row, a name and its next or last run; one a row where a line would be cut. */
  private renderTiles(rows: readonly Row[], tone: Tone, now: Date): TemplateResult {
    const hass = this.hass;
    const items: OptionItem[] = rows.map((row) => ({
      key: row.id,
      label: row.alias,
      name: true,
      glyph: row.schedule ? 'clock' : 'automation',
      value: !row.usable
        ? stateText(hass, row.view)
        : row.schedule && this.config?.show_next !== false && row.next
          ? nextText(hass, row.next, now)
          : this.config?.show_last !== false
            ? lastText(hass, row.last, now)
            : '',
      tone,
      active: row.on && row.usable,
      unavailable: !row.usable,
    }));
    const cell = optionCell(this.contentWidth, 8, 2);
    const measure = (text: string): number =>
      this.headFit.ruler.width('fv-option > fv-option__value', text);
    const columns = valuesHold(
      items.map((item) => item.value ?? ''),
      cell,
      measure,
    )
      ? 2
      : 1;
    return html`<div class="au-tiles">
      ${options(
        items,
        (key) => {
          const row = rows.find((r) => r.id === key);
          if (row) this.open(row);
        },
        8,
        84,
        columns,
      )}
    </div>`;
  }

  /** The row that unfolds the rest ("4 more"), and folds it again ("Show less"). */
  private renderMore(more: number, compact: boolean, keep: boolean): TemplateResult {
    const open = this.expanded_;
    return listRow({
      icon: keep ? 'list' : null,
      tone: 'neutral',
      title: open ? s(this.hass, 'less') : s(this.hass, 'more', { count: more }),
      trailing: 'chevron',
      compact,
      open,
      onTap: () => {
        this.expanded_ = !this.expanded_;
      },
    });
  }

  private renderFilters(): TemplateResult {
    const items = [
      { key: 'all', label: this.t('option.all'), active: this.filter_ === 'all' },
      { key: 'schedules', label: s(this.hass, 'schedules'), active: this.filter_ === 'schedules' },
      { key: 'on', label: this.t('common.on'), active: this.filter_ === 'on' },
    ];
    return html`<div class="au-filters">
      ${chipRow(
        items,
        (key) => {
          this.filter_ = key as Filter;
          this.expanded_ = false;
        },
        'full',
        { ruler: this.headFit.ruler, width: this.contentWidth },
      )}
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const now = this.now();
    const admin = this.admin;
    const listed = Boolean(this.config?.entities);
    const universe = this.universe().map((id) => this.row(id, now));
    const area = this.config?.area;
    const shownKind = this.config?.show ?? 'all';
    const listedRows = universe.filter(
      (row) =>
        (!area || this.inArea(row, area)) &&
        (shownKind !== 'schedules' || row.schedule !== undefined),
    );
    const filtered = this.sorted(
      listedRows.filter((row) =>
        this.filter_ === 'schedules'
          ? row.schedule !== undefined
          : this.filter_ === 'on'
            ? row.on && row.usable
            : true,
      ),
      listed,
    );
    const onCount = listedRows.filter((row) => row.on && row.usable).length;
    const tone = toneOf(this.config, 'accent');
    const variant = this.config?.variant ?? 'rows';
    const compact = variant === 'compact' || variant === 'tiles';
    const max = this.maxRows();
    const collapsible = filtered.length > max + 1;
    const shown = collapsible && !this.expanded_ ? filtered.slice(0, max) : filtered;

    // one trailing element: the `+` for an administrator, else the card's "…" where it has somewhere to go; a column
    // too narrow for the title beside a round (under the 211 floor) keeps the title whole and puts the `+` in a row
    // under the list
    const action = this.config?.tap_action;
    const addable = admin && this.config?.show_add !== false;
    const title = this.config?.title ?? s(this.hass, 'title');
    const roundFits = this.headFit.ruler.width('fv-card__title', title) <= this.contentWidth - 56;
    const addRow = addable && !roundFits;
    const trailing =
      addable && roundFits
        ? round('plus', 'quiet', s(this.hass, 'add'), () => this.add())
        : !addable && action && action.action !== 'none' && roundFits
          ? round('dots', 'quiet', this.t('common.more'), () => this.tap(undefined, action))
          : nothing;
    const fitted = this.headFit.fit({
      width: this.contentWidth,
      title,
      sub:
        this.config?.subtitle ?? this.t('common.on_of', { on: onCount, count: listedRows.length }),
      trailing: trailing === nothing ? 0 : 44,
    });
    const switchable = this.config?.show_switch !== false;
    const keep = this.headFit.rowsKeepIcon(
      this.contentWidth,
      [
        ...shown.map((row) => ({
          title: row.alias,
          value: '',
          end: switchable ? SWITCH_SLOT : 44,
        })),
        ...(collapsible ? [{ title: s(this.hass, 'more', { count: 9 }), value: '', end: 44 }] : []),
        ...(addRow ? [{ title: s(this.hass, 'add'), value: '', end: 0 }] : []),
      ],
      compact,
    );

    return html`<article class="fv-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'automation') : null,
        tone: onCount > 0 ? tone : 'neutral',
        title,
        name: this.config?.title !== undefined,
        sub: fitted.sub,
        trailing,
        onIconTap: () => this.tap(),
        onHold: () => this.hold(),
      })}
      ${this.config?.show_filters ? this.renderFilters() : nothing}
      ${
        listedRows.length === 0
          ? html`<div class="au-empty">
              ${this.headFit.empty('automation', s(this.hass, 'empty'), admin ? s(this.hass, 'empty_hint') : '', this.contentWidth)}
            </div>`
          : filtered.length === 0
            ? html`<div class="au-empty">
                ${this.headFit.empty('automation', s(this.hass, 'no_match'), '', this.contentWidth)}
              </div>`
            : html`${variant === 'tiles' ? this.renderTiles(shown, tone, now) : nothing}
              ${
                variant !== 'tiles' || collapsible
                  ? html`<div class="au-rows">
                      ${variant === 'tiles' ? nothing : shown.map((row) => this.renderRow(row, tone, compact, keep, now))}
                      ${collapsible ? this.renderMore(filtered.length - max, compact, variant === 'tiles' || keep) : nothing}
                    </div>`
                  : nothing
              }`
      }
      ${
        addRow
          ? html`<div class="au-rows au-add">
              ${listRow({
                icon: keep ? 'plus' : null,
                tone: 'neutral',
                title: s(this.hass, 'add'),
                compact: true,
                trailing: 'none',
                onTap: () => this.add(),
              })}
            </div>`
          : nothing
      }
      ${this.sheetReady_ ? html`<fluvy-schedule-sheet .hass=${this.hass}></fluvy-schedule-sheet>` : nothing}
    </article>`;
  }
}
