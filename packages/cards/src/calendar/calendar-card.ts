import { stateText, strings, type LovelaceConfigForm, type LovelaceGridOptions } from '@fluvy/core';
import { forgetTextWidths, sheetStyles } from '@fluvy/ui';
import { nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit';
import { Card, type BaseKey } from '../shared/base.js';
import { FontsSettled } from '../shared/fonts.js';
import {
  accentField,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  numberField,
  selectField,
  textField,
  toneField,
} from '../shared/form.js';
import {
  calendarsOf,
  daysOf,
  idsOf,
  toneOf,
  viewOf,
  VIEWS,
  type CalendarCardConfig,
  type CalendarItem,
  type CalendarView,
} from './config.js';
import {
  WEEKDAYS,
  addDays,
  addMonths,
  firstWeekday,
  monthWeeks,
  sameDay,
  sameMonth,
  startOfDay,
  weekStart,
} from '../shared/dates.js';
import { fetchEvents, stampOf, type Fetched } from './events.js';
import { useFamily } from './fit.js';
import { Agenda } from './model.js';
import { calendarStyles } from './styles.js';
import { agendaView } from './views/agenda.js';
import type { Status, ViewContext } from './views/context.js';
import { monthView } from './views/month.js';
import { timelineView } from './views/timeline.js';
import { NEXT_DAYS, tileView } from './views/tile.js';
import { upcomingView } from './views/upcoming.js';
import { weekView } from './views/week.js';
import { Words } from './words.js';
import { configKeys } from '../shared/config.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';

const s = strings('calendar');

export type { CalendarCardConfig, CalendarView } from './config.js';

const REFRESH = 15 * 60_000; // while visible, a window is read again this often
const RETRY = 60_000; // a calendar that failed is asked again after a minute, then ever more patiently (up to REFRESH)
const IDLE = 10 * 60_000; // a day someone picked gives way to today again after this long

const EDITOR_LABELS = {
  tile: 'editor_tile',
  first_weekday: 'editor_first_weekday',
  start_hour: 'editor_start_hour',
  end_hour: 'editor_end_hour',
} as const;

/**
 * Every calendar of the approved sheet on one card, chosen with `view`: the day's agenda, the month,
 * the week strip, month + day, the day's timeline, the upcoming list and the two tiles.
 *
 * This element owns what changes — the window that was read, the selected day, the visible month, the
 * minute — and hands the views one `Agenda` built from it. The views (`./views/*`) are functions of
 * that one table, which is why a dot, a count and a row can never tell different stories.
 */
export class FluvyCalendarCard extends Card<CalendarCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: CalendarCardConfig): number {
    const heights = {
      agenda: 416,
      month: 360,
      week: 428,
      'month-day': 644,
      timeline: 476,
      upcoming: 340,
      tile: 168,
    };
    return heights[viewOf(config)];
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.calendar,
    calendarStyles,
  ];

  static override properties = {
    ...Card.properties,
    loaded: { state: true },
    picked: { state: true },
    month: { state: true },
    focused: { state: true },
    clock: { state: true },
  };

  /** The last window that was read, with the calendars that failed in it. */
  declare private loaded: Fetched | undefined;
  /** The day the user picked; `null` follows today. */
  declare private picked: Date | null;
  /** First day of the month the user turned to; `null` follows the selected day. */
  declare private month: Date | null;
  /** The day the keys moved the month grid's tab stop to; `null` leaves it on the selected day. */
  declare private focused: Date | null;
  /** The running instant, advanced on the minute. `_now` in the config overrides it. */
  declare private clock: Date;

  private requested = '';
  private request = 0;
  private generation = 0;
  private readAt = 0;
  private retryIn = RETRY;
  private table:
    | { readonly loaded: Fetched | undefined; readonly minute: number; readonly agenda: Agenda }
    | undefined;
  private touchedAt = 0;
  private turn: -1 | 0 | 1 = 0;
  private timer: number | undefined;

  constructor() {
    super();
    // wording is fitted by measuring it: what was measured before a face arrived is measured again once it is in use
    new FontsSettled(this, () => {
      forgetTextWidths();
      this.requestUpdate();
    });
    this.loaded = undefined;
    this.picked = null;
    this.month = null;
    this.focused = null;
    this.clock = new Date();
  }

  /* ---------- Lovelace ---------- */

  /** A calendar card has no entity of its own: its calendars are its list, its colour the accent (today, the selection). */
  static override base: readonly BaseKey[] = ['entities', 'color', 'card_color'];
  static override keys = configKeys<CalendarCardConfig>()([
    'calendars',
    'variant',
    'tile',
    'title',
    'first_weekday',
    'days',
    'start_hour',
    'end_hour',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'calendars',
      alias: 'entities',
      title: 'editor.rows',
      domains: ['calendar'],
      keys: ['entity', 'name', 'tone', 'color'],
      schema: [entityField(['calendar']), textField('name'), fieldRow(toneField(), accentField())],
    },
  ];
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'agenda',
    tile: 'date',
    first_weekday: 'language',
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entitiesField('entities', ['calendar'], true),
        fieldRow(selectField('variant', VIEWS), textField('title')),
        fieldRow(
          selectField('tile', ['date', 'next']),
          selectField('first_weekday', ['language', ...WEEKDAYS]),
        ),
        fieldRow(numberField('days', 1, 31), numberField('start_hour', 0, 23)),
        fieldRow(
          numberField('end_hour', 1, 24),
          accentField(),
          accentField('card_color', { none: true }),
        ),
      ],
      ...editorLabels(s, EDITOR_LABELS, { days: 'editor.days' }),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): CalendarCardConfig {
    return {
      type: 'custom:fluvy-calendar-card',
      entities: entities.filter((id) => id.startsWith('calendar.')).slice(0, 3),
      view: 'month-day',
    };
  }

  /** No calendar yet is not an error (the card says "Choose a calendar"); something that is not a calendar is. */
  protected override prepare(config: CalendarCardConfig): CalendarCardConfig {
    if (config._picked) {
      const picked = new Date(config._picked);
      if (!Number.isNaN(picked.getTime())) {
        this.picked = startOfDay(picked);
        this.touchedAt = Date.now(); // held like a tap: the idle beat lets it go after ten minutes
      }
    }
    // `calendars` (ids or items); else the older `entities` with their `tones`; else one `entity`
    const older = config as CalendarCardConfig & { entities?: unknown; tones?: unknown };
    const listed: readonly unknown[] = Array.isArray(config.calendars)
      ? config.calendars
      : Array.isArray(older.entities)
        ? older.entities
        : config.entity
          ? [config.entity]
          : [];
    const tones: Record<string, unknown> =
      older.tones && typeof older.tones === 'object'
        ? (older.tones as Record<string, unknown>)
        : {};
    const seen = new Set<string>();
    const calendars: CalendarItem[] = [];
    for (const raw of listed) {
      const item: CalendarItem | null =
        typeof raw === 'string'
          ? { entity: raw }
          : raw && typeof raw === 'object'
            ? (raw as CalendarItem)
            : null;
      if (!item || typeof item.entity !== 'string' || !item.entity || seen.has(item.entity))
        continue;
      if (!item.entity.startsWith('calendar.'))
        throw new Error(`fluvy-calendar-card: "${item.entity}" is not a calendar entity`);
      seen.add(item.entity);
      const tone = tones[item.entity];
      calendars.push(
        item.tone === undefined && typeof tone === 'string' ? { ...item, tone } : item,
      );
    }
    const out = { ...older, calendars };
    delete out.entities;
    delete out.tones;
    return out;
  }

  override getCardSize(): number {
    return (
      {
        agenda: 7,
        month: 7,
        week: 9,
        'month-day': 13,
        timeline: 10,
        upcoming: 7,
        tile: 3,
      } satisfies Record<CalendarView, number>
    )[this.view];
  }

  override getGridOptions(): LovelaceGridOptions {
    return this.view === 'tile'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    useFamily(getComputedStyle(this).fontFamily);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.tick();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.request++; // an answer still in flight is no longer ours
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden) this.tick();
  };

  /**
   * The card's one timer, aligned to the minute: the now-line moves, "1 left" and "In 13 min" stay
   * true, midnight turns the day. The same beat re-reads the window every 15 minutes (only while the
   * page is visible), retries a calendar that failed, and lets a day someone picked go back to today.
   */
  private tick(): void {
    window.clearTimeout(this.timer);
    const now = Date.now();
    if (!document.hidden) {
      this.clock = new Date(now);
      if (now - this.readAt >= (this.loaded?.failed.length ? this.retryIn : REFRESH))
        this.generation++;
      if ((this.picked || this.month) && now - this.touchedAt >= IDLE) {
        this.picked = null;
        this.month = null;
        this.focused = null;
        this.turn = 0;
      }
    }
    this.timer = window.setTimeout(() => this.tick(), 60_000 - (now % 60_000) + 50);
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.read();
  }

  /**
   * Reads the window the view shows — when the window, the calendars or one of their state objects
   * changed, or the 15-minute beat says so. Never because `hass` was merely replaced: the key below
   * does not move, and the base class does not even get here unless a watched calendar changed.
   */
  private read(): void {
    const hass = this.hass;
    if (!hass || !this.config) return;
    const ids = this.usable();
    if (!ids.length) return;
    const { start, end } = this.window();
    const key = `${ids.map((id) => `${id}@${stampOf(hass, id)}`).join('|')}|${start.getTime()}|${end.getTime()}|${this.generation}`;
    if (key === this.requested) return;
    this.requested = key;
    this.readAt = Date.now();
    const request = ++this.request;
    void fetchEvents(hass, ids, start, end).then((answer) => {
      if (request !== this.request) return;
      this.retryIn = answer.failed.length ? Math.min(REFRESH, this.retryIn * 2) : RETRY;
      this.loaded = answer;
    });
  }

  /** The one table every view reads, rebuilt only when the data or the minute changes. */
  private agenda(): Agenda {
    const minute = Math.floor(this.now.getTime() / 60_000);
    if (!this.table || this.table.loaded !== this.loaded || this.table.minute !== minute) {
      this.table = { loaded: this.loaded, minute, agenda: new Agenda(this.loaded, this.now) };
    }
    return this.table.agenda;
  }

  /* ---------- what is shown ---------- */

  private get view(): CalendarView {
    return viewOf(this.config);
  }

  private get now(): Date {
    const frozen = this.config?._now;
    const date = typeof frozen === 'string' ? new Date(frozen) : null;
    return date && !Number.isNaN(date.getTime()) ? date : this.clock;
  }

  private get first(): number {
    return firstWeekday(this.hass, this.config?.first_weekday);
  }

  /** The selected day. A view only keeps a pick it can show: the agenda today or tomorrow, the week its own seven days. */
  private get day(): Date {
    const today = startOfDay(this.now);
    const picked = this.picked;
    if (!picked) return today;
    switch (this.view) {
      case 'agenda':
        return sameDay(picked, addDays(today, 1)) ? picked : today;
      case 'week':
        return sameDay(weekStart(picked, this.first), weekStart(today, this.first))
          ? picked
          : today;
      case 'month':
      case 'month-day':
        return picked;
      default:
        return today;
    }
  }

  private get shownMonth(): Date {
    const base = this.month ?? this.day;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }

  /** One window that covers what the view shows. */
  private window(): { start: Date; end: Date } {
    const today = startOfDay(this.now);
    switch (this.view) {
      case 'month':
      case 'month-day':
        return monthWeeks(this.shownMonth, this.first);
      case 'week': {
        const start = weekStart(today, this.first);
        return { start, end: addDays(start, 7) };
      }
      case 'timeline':
        return { start: today, end: addDays(today, 1) };
      case 'upcoming':
        return { start: today, end: addDays(today, daysOf(this.config) + 1) };
      case 'tile':
        return { start: today, end: addDays(today, this.config?.tile === 'next' ? NEXT_DAYS : 1) };
      default:
        return { start: today, end: addDays(today, 2) }; // the agenda names tomorrow too
    }
  }

  /** Calendars that can be read right now. */
  private usable(): string[] {
    return idsOf(this.config).filter((id) => {
      const status = this.entity(id).status;
      return status === 'ok' || status === 'unknown';
    });
  }

  private status(): Status {
    const usable = this.usable();
    if (!usable.length) return 'unavailable';
    if (!this.loaded) return 'loading';
    return usable.every((id) => this.loaded?.failed.includes(id)) ? 'failed' : 'ok';
  }

  /** Some calendars are readable and some are not: the list is true but not whole, and says so. */
  private notice(): string {
    const ids = idsOf(this.config);
    const usable = this.usable();
    const out = ids.filter((id) => !usable.includes(id) || this.loaded?.failed.includes(id));
    if (!out.length || out.length === ids.length) return '';
    return out.length === 1
      ? s(this.hass, 'one_unavailable', { name: this.entity(out[0]).name })
      : s(this.hass, 'some_unavailable', { count: out.length });
  }

  /* ---------- what the views may do ---------- */

  private select(day: Date): void {
    this.touchedAt = Date.now();
    this.picked = sameDay(day, startOfDay(this.now)) ? null : startOfDay(day);
    this.focused = null;
  }

  /** The keys moved the grid's tab stop: the month follows it, the selection stays. */
  private moveFocus(day: Date): void {
    const shown = this.shownMonth;
    this.touchedAt = Date.now();
    if (!sameMonth(day, shown)) {
      this.turn = day > shown ? 1 : -1;
      this.month = sameMonth(day, this.day) ? null : addMonths(day, 0);
    }
    this.focused = startOfDay(day);
  }

  /** Turning the month selects today when the month holds it, otherwise its first day. */
  private stepMonth(direction: 1 | -1): void {
    const today = startOfDay(this.now);
    const next = addMonths(this.shownMonth, direction);
    const home = sameMonth(next, today);
    this.touchedAt = Date.now();
    this.turn = direction;
    this.month = home ? null : next;
    this.picked = home ? null : next;
    this.focused = null;
  }

  protected renderCard(): TemplateResult | typeof nothing {
    const config = this.config;
    if (!config || !this.hass) return nothing;
    const ids = idsOf(config);
    if (!ids.length) return this.renderEmpty(s(this.hass, 'no_calendar'));
    if (ids.every((id) => this.entity(id).status === 'missing')) {
      const first = this.entity(ids[0] as string);
      return this.renderEmpty(`${first.name} · ${stateText(this.hass, first)}`);
    }
    const view = this.view;
    const ctx: ViewContext = {
      hass: this.hass,
      config,
      agenda: this.agenda(),
      words: new Words(this.hass),
      status: this.status(),
      notice: this.notice(),
      width: view === 'tile' ? Math.max(80, this.width - 32) : this.contentWidth,
      day: this.day,
      month: this.shownMonth,
      first: this.first,
      turn: this.turn,
      focus: this.focused ?? this.day,
      host: this,
      toneOf: (id) => toneOf(config, id),
      accentOf: (id) =>
        this.accents.item(calendarsOf(config).find((item) => item.entity === id)?.color),
      nameOf: (id) =>
        calendarsOf(config).find((item) => item.entity === id)?.name ?? this.entity(id).name,
      select: (day) => this.select(day),
      stepMonth: (direction) => this.stepMonth(direction),
      moveFocus: (day) => this.moveFocus(day),
      open: (id) => this.tap(id ?? ids[0], { action: 'more-info' }),
    };
    switch (view) {
      case 'month':
        return monthView(ctx, false);
      case 'month-day':
        return monthView(ctx, true);
      case 'week':
        return weekView(ctx);
      case 'timeline':
        return timelineView(ctx);
      case 'upcoming':
        return upcomingView(ctx);
      case 'tile':
        return tileView(ctx);
      default:
        return agendaView(ctx);
    }
  }
}
