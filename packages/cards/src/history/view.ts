/**
 * Fluvy's History page (`/history`): what a house measured and what its things did, over a window of time — one chart
 * per measure, the state lines under them, and one cursor that reads every one of them at the same instant.
 */
// the page's words first: they are here before anything in its chunk says them
import './english.js';
import {
  countTargets,
  dateFormat,
  formatTime,
  languageOf,
  navigate,
  onWords,
  readStored,
  sourceEntities,
  strings,
  targetFromSearch,
  writeStored,
  type HomeAssistant,
  type KeyOf,
  type SourceFilters,
  type SourceTarget,
} from '@fluvy/core';
import {
  buildWindow,
  fetchWindowStatistics,
  fractionOf,
  periodFor,
  subscribeHistory,
  timeAt,
  type HistoryPeriod,
  type HistoryWindow,
  type RawHistory,
  type Statistics,
} from '@fluvy/core/history';
import {
  baseStyles,
  forgetTextWidths,
  motionPreference,
  pillWidth,
  reducedMotion,
  ScrubController,
  sheetStyles,
  textWidth,
  zoomOf,
} from '@fluvy/ui';
import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';

import { FontsSettled } from '../shared/fonts.js';
import { Layers } from '../shared/layers.js';
import { downloadCsv } from '../shared/csv.js';
import { dayMonth } from '../shared/period.js';
import { sameRange, type ActivityRange } from '../shared/range.js';
import '../shared/date-picker.js';
import type { DatesDetail } from '../shared/date-picker.js';

import { cardWidth, spokenOf } from './chart.js';
import { shownOf, type Shown } from './model.js';
import { renderBar, renderBody, renderHead } from './parts.js';
import { renderDates, renderSources } from './layers.js';
import { spokenStates } from './states.js';
import { historyStyles } from './styles.js';

type HistoryString = KeyOf<'history' | 'page'>;
const s = strings('history', 'page');

/** Where Home Assistant's own History page keeps what was picked: our page reads and writes the same. */
const PICKED = 'historyPickedValue';
const FILTERS = 'historySourceFilters';

const COMPACT = 720;
/** Under this the controls fill their row; above it they sit together (a tablet is not a phone). */
const PHONE = 480;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The window a page opens on: the last day, up to this minute — never half a day of blank waiting to be filled. */
const lastDay = (now = Date.now()): ActivityRange => ({ start: now - DAY, end: now });

/** How far either side of a following window the recorder is asked, so its subscription changes once an hour. */
const SLACK = HOUR;

export type HistoryLayer = 'picking' | 'sourcing';

export class FluvyHistory extends LitElement {
  static override styles = [...baseStyles, sheetStyles.page, historyStyles];

  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    phone: { type: Boolean, reflect: true },
    range: { state: true },
    states: { state: true },
    statistics: { state: true },
    loading: { state: true },
    search: { state: true },
    target: { state: true },
    sourceFilters: { state: true },
    entitySources: { state: true },
    back: { state: true },
    now: { state: true },
    mainWidth: { state: true },
    expanded: { state: true },
    allLines: { state: true },
    fontEpoch: { state: true },
    following: { state: true },
    reading: { state: true },
    reduced: { type: Boolean, reflect: true, attribute: 'reduced-motion' },
  };

  declare hass: HomeAssistant | undefined;
  declare narrow: boolean;
  declare compact: boolean;
  declare phone: boolean;
  /** The window shown, in ms. */
  declare range: ActivityRange;
  /** What the recorder has sent so far, by entity. */
  declare states: RawHistory;
  /** The long-term statistics, for a window too wide to read state by state. */
  declare statistics: Statistics | undefined;
  declare loading: boolean;
  declare search: string;
  declare target: SourceTarget;
  declare sourceFilters: SourceFilters;
  declare entitySources: Record<string, unknown> | undefined;
  declare back: boolean;
  declare now: number;
  /** The content column's width: how many points a curve draws. */
  declare mainWidth: number;
  /** The charts whose legend was opened: they draw every series they have. */
  declare expanded: readonly string[];
  /** Whether the state card was opened: it then draws every line the window holds. */
  declare allLines: boolean;
  /** Bumped when a web font arrives: what was measured is measured again. */
  declare fontEpoch: number;
  /** The window keeps ending at now: the last day follows the clock instead of ageing into a pair of timestamps. */
  declare following: boolean;
  declare reduced: boolean;

  readonly layers = new Layers<HistoryLayer>(this);
  /** Pointing at any chart reads every one of them at that instant. */
  readonly scrubber = new ScrubController(this);
  stop: (() => void) | undefined;
  subscribed = '';
  statsKey = '';
  resize: ResizeObserver | undefined;
  tick = 0;
  /** The window built from what has arrived, kept until the data or the search changes. */
  windowMemo: { key: string; window: HistoryWindow } | undefined;
  shownMemo: { key: string; shown: Shown } | undefined;
  family = '';

  constructor() {
    super();
    new FontsSettled(this, () => {
      this.family = '';
      forgetTextWidths();
      this.fontEpoch += 1;
    });
    this.narrow = false;
    this.compact = false;
    this.phone = false;
    this.range = lastDay();
    this.states = {};
    this.statistics = undefined;
    this.loading = true;
    this.search = '';
    this.target = {};
    this.sourceFilters = {};
    this.entitySources = undefined;
    this.back = false;
    this.now = Date.now();
    this.mainWidth = 0;
    this.expanded = [];
    this.allLines = false;
    this.fontEpoch = 0;
    this.following = true;
    this.reading = '';
    this.reduced = reducedMotion();
  }

  get language(): string {
    return languageOf(this.hass);
  }

  readonly t = (key: HistoryString, values?: Record<string, string | number>): string =>
    s({ language: this.language }, key, values);

  /** A time of day as the house writes it ("12:44", "12:44 PM"). */
  time(ms: number): string {
    return formatTime(this.hass, new Date(ms));
  }

  /** The weekday alone ("Sat"), for an axis end that would otherwise repeat the other one. */
  weekday(ms: number): string {
    return dateFormat(this.language, { weekday: 'short' }).format(ms);
  }

  /**
   * An instant as the window can tell it apart: the clock through a day, the day and the hour through a week, the
   * day alone through a month — whose readings are a day's average, and naming one of them by the minute is a lie.
   */
  moment(ms: number): string {
    const span = this.range.end - this.range.start;
    // the same words the axis under it uses: one card never names one day two ways
    if (span > 8 * DAY) return this.date(ms);
    if (span > 2 * DAY) return `${this.day(ms)}, ${this.time(ms)}`;
    return this.time(ms);
  }

  /**
   * A day as an axis says it through a week ("Mon 15", "lun 15"). Built from its two parts on purpose: asked for
   * both at once, `en` resolves to `en-US` and answers "15 Mon", which reads as a bug in an English house.
   */
  day(ms: number): string {
    return `${this.weekday(ms)} ${dateFormat(this.language, { day: 'numeric' }).format(ms)}`;
  }

  /** A day as an axis says it through a month ("15 Sep"): past a week its weekday says nothing. */
  date(ms: number): string {
    return dayMonth(this.language, ms, 'short', this.now);
  }

  /** A day with its year ("15 Sep 2026"), for the two ends of a window long enough to come back to itself. */
  dateYear(ms: number): string {
    return dateFormat(this.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);
  }

  /** How the window is read: its own states, the hour's statistics, or the day's. */
  get period(): HistoryPeriod {
    return periodFor(this.range.start, this.range.end);
  }

  /** How wide a state line's stretches are drawn: a card's content column, exactly as a chart's plot is. */
  get linesWidth(): number {
    return cardWidth(this.mainWidth);
  }

  /** The card a reader has their hand or their focus on: what the page's one spoken line reads out. */
  declare reading: string;

  /** A card takes the hand or the focus: the page's one spoken line follows that card from then on. */
  readonly reads = (key: string): void => {
    if (key !== this.reading) this.reading = key;
  };

  /** What that card says right now — read again at every move, never frozen at the instant the hand arrived. */
  get spoken(): string {
    if (!this.reading) return '';
    if (this.reading === 'states') return spokenStates(this);
    const chart = this.shown.charts.find((one) => one.key === this.reading);
    return chart ? spokenOf(this, chart) : '';
  }

  /** A chart's legend was opened: it draws every series it has. */
  expandChart(key: string): void {
    if (!this.expanded.includes(key)) this.expanded = [...this.expanded, key];
  }

  /** The state card was opened: it draws every line the window holds. */
  expandLines(): void {
    this.allLines = true;
  }

  /* ---------- lifecycle ---------- */

  private offWords: (() => void) | undefined;
  override connectedCallback(): void {
    super.connectedCallback();
    // a language's words arriving (fetched after the first paint) re-render the page in them
    this.offWords = onWords(() => this.requestUpdate());
    this.readAddress(true);
    this.resubscribe();
    this.tick = window.setInterval(() => this.beat(), 30_000);
    window.addEventListener('location-changed', this.onLocation);
    window.addEventListener('popstate', this.onLocation);
    this.addEventListener('keydown', this.layers.onKey);
    void this.readSources();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.offWords?.();
    this.offWords = undefined;
    this.stop?.();
    this.stop = undefined;
    this.subscribed = '';
    clearInterval(this.tick);
    this.resize?.disconnect();
    this.resize = undefined;
    window.removeEventListener('location-changed', this.onLocation);
    window.removeEventListener('popstate', this.onLocation);
    this.removeEventListener('keydown', this.layers.onKey);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('hass') && this.hass) {
      this.reduced = motionPreference() === 'reduced' || reducedMotion();
      if (!this.entitySources) void this.readSources();
    }
    // whoever moves the window — a link, a button, the panel around us — the readings follow it
    if (
      changed.has('hass') ||
      changed.has('range') ||
      changed.has('target') ||
      changed.has('sourceFilters')
    )
      this.resubscribe();
  }

  protected override updated(): void {
    const main = this.renderRoot.querySelector<HTMLElement>('.hs-main');
    if (main && !this.resize) {
      // only in the observer: setting a reactive property from `updated()` schedules a second render of the page
      this.resize = new ResizeObserver(() => this.measure(main));
      this.resize.observe(main);
    }
  }

  /** What the page's own width decides: the column a chart is drawn into, and which shape its head takes. */
  private measure(main: HTMLElement): void {
    const width = Math.round(main.getBoundingClientRect().width / zoomOf(main)); // the chart's column, in its own pixels
    if (width && width !== this.mainWidth) this.mainWidth = width;
    const own = this.offsetWidth;
    if (own > 0) {
      this.compact = own < COMPACT;
      this.phone = own < PHONE;
    }
  }

  /** The window that ends at now follows it: its end, its cursor and its curves move with the clock. */
  private beat(): void {
    if (document.hidden) return;
    this.now = Date.now();
    if (this.following) {
      const length = this.range.end - this.range.start;
      this.range = { start: this.now - length, end: this.now };
    } else if (this.range.end >= this.now - HOUR) this.requestUpdate();
  }

  /* ---------- the address (Home Assistant's own links open the same window) ---------- */

  readonly onLocation = (): void => {
    if (location.pathname.startsWith('/history')) this.readAddress(false);
  };

  readAddress(first: boolean): void {
    const params = new URLSearchParams(location.search);
    const linked = targetFromSearch(location.search);
    const picked = readStored<SourceTarget>(PICKED);
    if (countTargets(linked)) {
      if (JSON.stringify(linked) !== JSON.stringify(this.target)) {
        const same = picked && JSON.stringify(picked) === JSON.stringify(linked);
        this.target = linked;
        this.sourceFilters = same ? (readStored<SourceFilters>(FILTERS) ?? {}) : {};
      }
    } else if (first) {
      this.target = picked ?? {};
      this.sourceFilters = readStored<SourceFilters>(FILTERS) ?? {};
    }
    const start = params.get('start_date');
    const end = params.get('end_date');
    if (start || end) {
      const from = start ? Date.parse(start) : this.range.start;
      const to = end ? Date.parse(end) : Math.max(from + HOUR, Date.now());
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
        const range = { start: from, end: to };
        if (!sameRange(range, this.range)) {
          this.following = false;
          this.range = range;
        }
      }
    }
    if (first && params.get('back') === '1' && history.length > 1) {
      this.back = true;
      params.delete('back');
      const rest = params.toString();
      navigate(`${location.pathname}${rest ? `?${rest}` : ''}`, true);
    }
    if (!first) this.resubscribe();
  }

  /** The page's address follows what is shown, in the stock panel's format (a shared link opens the same). */
  writeAddress(): void {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(this.target)) {
      const list = typeof value === 'string' ? [value] : (value as readonly string[] | undefined);
      if (list?.length) params.set(key, list.join(','));
    }
    if (!this.following) {
      params.set('start_date', new Date(this.range.start).toISOString());
      params.set('end_date', new Date(this.range.end).toISOString());
    }
    const query = params.toString();
    navigate(`/history${query ? `?${query}` : ''}`, true);
  }

  /* ---------- data ---------- */

  /** The entities the page reads: whatever the sources cover. Nothing is read until something is picked. */
  get entityIds(): readonly string[] {
    const hass = this.hass;
    if (!hass) return [];
    return sourceEntities(hass, this.target, this.sourceFilters, () => undefined) ?? [];
  }

  /**
   * The window actually asked of the recorder. A window that follows the clock is asked for an hour either side of
   * itself, anchored to the hour: the reading slides twice a minute, the subscription changes once an hour.
   */
  private get asked(): ActivityRange {
    if (!this.following) return this.range;
    const length = this.range.end - this.range.start;
    const anchor = Math.ceil(this.now / SLACK) * SLACK;
    return { start: anchor - length - SLACK, end: anchor + SLACK };
  }

  resubscribe(): void {
    const hass = this.hass;
    if (!hass || !this.isConnected) return;
    const ids = this.entityIds;
    const asked = this.asked;
    const key = `${asked.start}|${asked.end}|${ids.join(',')}`;
    if (key === this.subscribed) return;
    this.stop?.();
    this.subscribed = key;
    this.expanded = [];
    this.allLines = false;
    this.states = {};
    this.statistics = undefined;
    this.windowMemo = undefined;
    if (!ids.length) {
      this.loading = false;
      this.stop = undefined;
      return;
    }
    this.loading = true;
    this.stop = subscribeHistory(
      hass,
      { start: new Date(asked.start), end: new Date(asked.end), entityIds: ids },
      (states, loading) => {
        this.states = states;
        this.loading = loading;
        this.windowMemo = undefined;
      },
    );
    void this.readStatistics(ids, key);
  }

  /** A window wider than a couple of days is drawn from the recorder's statistics, not its states. */
  private async readStatistics(ids: readonly string[], key: string): Promise<void> {
    const period = this.period;
    if (period === 'raw' || !this.hass) {
      this.statistics = undefined;
      return;
    }
    this.statsKey = key;
    const asked = this.asked;
    const statistics = await fetchWindowStatistics(
      this.hass,
      ids,
      new Date(asked.start),
      new Date(asked.end),
      period,
    );
    if (this.statsKey !== key) return; // another window was asked for meanwhile
    this.statistics = statistics;
    this.windowMemo = undefined;
  }

  private async readSources(): Promise<void> {
    const hass = this.hass;
    if (!hass || this.entitySources) return;
    try {
      this.entitySources = await hass.callWS<Record<string, unknown>>({
        type: 'entity/source',
      });
    } catch {
      this.entitySources = {}; // without it the picker simply offers no integrations
    }
  }

  /** What the page draws, built once per set of readings. */
  get window(): HistoryWindow {
    const ids = this.entityIds;
    const key = `${this.subscribed}|${this.range.start}|${this.drawnEnd}|${Object.keys(this.states).length}|${this.statistics ? 'stats' : ''}|${this.loading}`;
    if (this.windowMemo?.key === key) return this.windowMemo.window;
    const window = buildWindow(this.hass, this.states, {
      start: this.range.start,
      end: this.drawnEnd,
      entityIds: ids,
      ...(this.statistics ? { statistics: this.statistics } : {}),
    });
    this.windowMemo = { key, window };
    return window;
  }

  /** What the page draws, worked out once: the head counts exactly what the body has. */
  get shown(): Shown {
    const window = this.window;
    const key = `${this.windowMemo?.key ?? ''}|${this.search}|${this.expanded.join(',')}|${this.allLines}`;
    if (this.shownMemo?.key === key) return this.shownMemo.shown;
    const shown = shownOf(this.hass, this.t, window, {
      search: this.search,
      expanded: this.expanded,
      ...(this.allLines ? { lineLimit: Number.MAX_SAFE_INTEGER } : {}),
    });
    this.shownMemo = { key, shown };
    return shown;
  }

  /* ---------- what the page does ---------- */

  goTo(range: ActivityRange, following = false): void {
    if (sameRange(range, this.range)) return;
    this.following = following;
    this.range = range;
    this.writeAddress();
    this.resubscribe();
  }

  /** Whether there is a window after this one to walk into: one that does not end in the future. */
  get canGoLater(): boolean {
    const length = this.range.end - this.range.start;
    return this.range.end + length <= Date.now() + MINUTE;
  }

  shift(direction: 1 | -1): void {
    const length = this.range.end - this.range.start;
    if (direction === 1 && !this.canGoLater) return;
    const start = this.range.start + direction * length;
    this.goTo({ start, end: start + length });
  }

  today(): void {
    // today, as the page opened on it: the last day up to this minute, following the clock
    this.goTo(lastDay(Date.now()), true);
  }

  readonly onDates = (event: CustomEvent<DatesDetail>): void => {
    this.layers.dismiss('picking');
    this.goTo(event.detail.range);
  };

  setTarget(target: SourceTarget): void {
    this.target = target;
    writeStored(PICKED, target);
    this.writeAddress();
    this.resubscribe();
  }

  setFilters(filters: SourceFilters): void {
    this.sourceFilters = filters;
    writeStored(FILTERS, filters);
    this.resubscribe();
  }

  clearSources(): void {
    this.setFilters({});
    this.setTarget({});
  }

  /** Something is being pointed at: the charts read that instant instead of the window's end. */
  get scrubbed(): boolean {
    return this.scrubber.value !== null;
  }

  /**
   * The last instant the page has anything to draw: a window that runs into the future keeps its room, but nothing
   * is read past now — the charts and the state lines agree about where the record stops.
   */
  get drawnEnd(): number {
    return Math.min(this.range.end, Math.max(this.now, this.range.start + 1));
  }

  /** The instant the page is read at: what is pointed at, never past what has happened. */
  get at(): number {
    const fraction = this.scrubber.value;
    const at =
      fraction === null ? this.drawnEnd : timeAt(fraction, this.range.start, this.range.end);
    return Math.min(at, this.drawnEnd);
  }

  /** Where an instant sits in the window, 0 … 1 (a cursor's x). */
  fraction(at: number): number {
    return fractionOf(at, this.range.start, this.range.end);
  }

  /** Whether anything has been read yet (what tells a skeleton from an empty window). */
  get ready(): boolean {
    return Object.keys(this.states).length > 0 || !!this.statistics;
  }

  /** A pill sized by its words, as the language sizes them (the Today button). */
  pill(text: string): number {
    this.family ||= getComputedStyle(this).fontFamily || 'Inter, sans-serif';
    return pillWidth([text], { size: 14, weight: 600, family: this.family }, 36);
  }

  /** A button sized by its words, on the 4 grid — what the language asks of a single action. */
  button(text: string): number {
    this.family ||= getComputedStyle(this).fontFamily || 'Inter, sans-serif';
    return pillWidth([text], { size: 15, weight: 600, family: this.family }, 40);
  }

  /** What an axis label takes in the page's own face: how many of them a chart has room for. */
  labelWidth(text: string): number {
    this.family ||= getComputedStyle(this).fontFamily || 'Inter, sans-serif';
    return textWidth(text, { size: 11, weight: 500, tabular: true, family: this.family });
  }

  pickDates(): void {
    if (this.layers.is('picking')) this.layers.dismiss('picking');
    else this.layers.show('picking');
  }

  /** The window as a file: a row per reading and per state change, as Home Assistant's own page writes it. */
  download(): void {
    const window = this.window;
    const rows: (readonly unknown[])[] = [];
    for (const group of window.groups)
      for (const track of group.tracks)
        for (const point of track.points)
          rows.push([new Date(point.t).toISOString(), track.entityId, point.v, track.unit]);
    for (const line of window.lines)
      for (const span of line.spans)
        rows.push([new Date(span.from).toISOString(), line.entityId, span.state, '']);
    if (!rows.length) return;
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    downloadCsv('history.csv', ['time', 'entity_id', 'state', 'unit'], rows);
  }

  /* ---------- render ---------- */

  protected override render(): TemplateResult {
    return html`${renderBar(this)}
      <div class="hs-scroll">
        <div class="hs-page">
          <div class="hs-main">${renderHead(this)}${renderBody(this)}</div>
        </div>
      </div>
      <p class="fv-sr" aria-live="polite">${this.scrubbed ? this.spoken : ''}</p>
      ${this.layers.is('picking') && this.compact ? renderDates(this) : nothing}
      ${this.layers.is('sourcing') ? renderSources(this) : nothing}`;
  }
}

if (!customElements.get('fluvy-history')) customElements.define('fluvy-history', FluvyHistory);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-history': FluvyHistory;
  }
}
