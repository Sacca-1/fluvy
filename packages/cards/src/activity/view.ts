// the page's words first: they are here before anything in its chunk says them
import './english.js';
import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import {
  ACTIVITY_CARD,
  countTargets,
  formatDate,
  formatTime,
  languageOf,
  navigate,
  PREFERENCES_EVENT,
  readStored,
  sourceEntities,
  strings,
  targetFromSearch,
  type HomeAssistant,
  type KeyOf,
  type SourceFilters,
  type SourceTarget,
} from '@fluvy/core';
import {
  type ActivityEvent,
  type ActivityFilter,
  type ActivitySection,
  eventKey,
  peopleByUser,
  subscribeActivity,
} from '@fluvy/core/activity';
import {
  baseStyles,
  fitPills,
  forgetTextWidths,
  motionPreference,
  pillWidth,
  reducedMotion,
  sheetStyles,
  zoomOf,
  type SpringHandle,
} from '@fluvy/ui';
import type { FluvyTimeRail, TimeRailDetail } from '@fluvy/ui/time-rail';
import { FontsSettled } from '../shared/fonts.js';
import { renderFilters, renderTools, showFilter, wireStrip } from './filters.js';
import { markLineStarts, renderBar, renderDay, renderPickerSheet } from './header.js';
import {
  ActivityIndex,
  type ActivityModel,
  type ActivityRange,
  bucketOf,
  buildModel,
  dayRange,
  sameRange,
  shiftRange,
} from './model.js';
import type { DatesDetail } from '../shared/date-picker.js';
import {
  glide,
  gliding,
  histogram,
  isCurrent,
  listTop,
  markStuck,
  rowAt,
  settleOn,
  sizeFoot,
  timeAt,
  topTime,
} from './rail.js';
import { renderFresh, renderList } from './rows.js';
import { type Anchor, COMPACT, EXIT, FILTERS, HOUR, HOUR_HEAD, PICKED, ROW } from './shared.js';
import { renderNarrowed, renderSources } from './sources.js';
import { activityStyles } from './styles/index.js';
import '@fluvy/ui/time-rail';
import '../shared/date-picker.js';

type ActivityString = KeyOf<'activity' | 'page'>;
const s = strings('activity', 'page');

/**
 * Fluvy's Activity: a day of the house, legible. A bar, the day (‹ Today › and any dates), search, the sources and a
 * filter per kind of thing; then the timeline by the hour — who did what, restarts, bursts and repeats folded, a tap
 * for the detail — beside a time rail that is the page's scrollbar (the part of the day on screen lit, how busy each
 * stretch was beside it). Live: a new entry opens a place for itself on top (or waits behind "N new" while you read
 * further down).
 */
export class FluvyActivity extends LitElement {
  static override styles = [...baseStyles, sheetStyles.page, ...activityStyles];

  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    card: { type: Boolean, reflect: true },
    range: { state: true },
    events: { state: true },
    loading: { state: true },
    filter: { state: true },
    search: { state: true },
    target: { state: true },
    sourceFilters: { state: true },
    open: { state: true },
    closing: { state: true },
    full: { state: true },
    fresh: { state: true },
    freshCount: { state: true },
    entering: { state: true },
    exiting: { state: true },
    direction: { state: true },
    scrolled: { state: true },
    picking: { state: true },
    sourcing: { state: true },
    leaving: { state: true },
    back: { state: true },
    now: { state: true },
    entitySources: { state: true },
    mainWidth: { state: true },
    fontEpoch: { state: true },
    reduced: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare narrow: boolean;
  declare compact: boolean;
  /** The timeline on a card (this person's preference), or on the page. */
  declare card: boolean;
  declare range: ActivityRange;
  declare events: readonly ActivityEvent[];
  declare loading: boolean;
  declare filter: ActivityFilter;
  declare search: string;
  declare target: SourceTarget;
  declare sourceFilters: SourceFilters;
  /** Rows showing their detail (and bursts / repeats unfolded). */
  declare open: ReadonlySet<string>;
  /** Rows folding away (their detail animates out before it goes). */
  declare closing: ReadonlySet<string>;
  /** Bursts showing all of their entries. */
  declare full: ReadonlySet<string>;
  /** Entries that just happened (they open a place for themselves, with a ring). */
  declare fresh: ReadonlySet<string>;
  /** New entries that arrived while the timeline was read further down. */
  declare freshCount: number;
  declare entering: '' | 'load' | 'filter';
  /** The list leaving for another period, the way the page goes. */
  declare exiting: '' | 'next' | 'prev';
  /** Which way the last period change went (the day's title turns that way). */
  declare direction: 'next' | 'prev' | 'load';
  /** The day's title has scrolled away: the bar says which day it is. */
  declare scrolled: boolean;
  declare picking: boolean;
  declare sourcing: boolean;
  /** A floating layer on its way out (it animates before it goes). */
  declare leaving: '' | 'picking' | 'sourcing';
  declare back: boolean;
  declare now: number;
  declare entitySources: Record<string, unknown> | undefined;
  /** The column's width: how the filters share it. */
  declare mainWidth: number;
  /** Bumped when the web font arrives: the pills are measured again. */
  declare fontEpoch: number;
  /** Fluvy's "Reduce motion": reflected onto the rail and the dates, whose shadow roots follow it too. */
  declare reduced: boolean;

  readonly index = new ActivityIndex(() => this.hass!);
  stop: (() => void) | undefined;
  subscribed = '';
  baseline: Set<string> | undefined;
  /** A new period or new sources were asked for: its first entries rise in. */
  arriving: 'load' | undefined;
  /** What the stream sent while the list was leaving (shown once it has gone). */
  buffered: { events: readonly ActivityEvent[]; loading: boolean } | undefined;
  modelMemo:
    | {
        events: readonly ActivityEvent[];
        filter: ActivityFilter;
        search: string;
        range: ActivityRange;
        model: ActivityModel;
      }
    | undefined;
  sections: readonly ActivitySection[] = [];
  anchors: Anchor[] | undefined;
  frame = 0;
  scrubbing = false;
  /** The knob's moment after a scrub, a tap or a key, held until the reader scrolls by hand. */
  pin: number | undefined;
  glider: SpringHandle | undefined;
  glideTarget = Number.NaN;
  resize: ResizeObserver | undefined;
  stopStrip: (() => void) | undefined;
  tick = 0;
  timers = new Set<number>();
  timeWidth = 52;
  people = new Map<string, string>();
  family = '';
  stuck: HTMLElement | undefined;
  opener: HTMLElement | null = null;
  /** What "Only this" narrowed from: its Back restores it (a quick narrowing is never remembered). */
  quick: { target: SourceTarget; sourceFilters: SourceFilters; filter: ActivityFilter } | undefined;
  /** The column the measured layouts are sized from (its width is `mainWidth`). */
  observed: HTMLElement | undefined;
  /** The one hour a settle has laid out by hand (at most one at a time: a long day does not pile them up). */
  forced: HTMLElement | undefined;
  /** A row's laid-out height (hours not laid out yet are estimated with it). */
  pitch = ROW;
  /** The row a settle is gliding to: measured again each frame, as the hours it passes are laid out. */
  chase: { node: HTMLElement; left: number } | undefined;
  /** The histogram shown while the next period loads (the old one holds its place, then gives way). */
  held: { density: readonly number[]; key: string } | undefined;

  constructor() {
    super();
    // what was measured before a web font arrived is measured again once it is in use (not at `fonts.ready`,
    // which can resolve before the face has even been asked for)
    new FontsSettled(this, () => {
      this.family = '';
      forgetTextWidths();
      this.fontEpoch += 1;
    });
    this.narrow = false;
    this.compact = false;
    this.card = false;
    this.range = dayRange(new Date());
    this.events = [];
    this.loading = true;
    this.filter = 'highlights';
    this.search = '';
    this.target = {};
    this.sourceFilters = {};
    this.open = new Set();
    this.closing = new Set();
    this.full = new Set();
    this.fresh = new Set();
    this.freshCount = 0;
    this.entering = '';
    this.exiting = '';
    this.direction = 'load';
    this.scrolled = false;
    this.picking = false;
    this.sourcing = false;
    this.leaving = '';
    this.back = false;
    this.now = Date.now();
    this.entitySources = undefined;
    this.mainWidth = 0;
    this.fontEpoch = 0;
    this.reduced = false;
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    this.onPreferences();
    this.readAddress(true);
    window.addEventListener('location-changed', this.onLocation);
    window.addEventListener(PREFERENCES_EVENT, this.onPreferences);
    this.addEventListener('keydown', this.onKey);
    // the page's width picks the layout; the column's own width (observed once it is drawn) sizes what is measured
    this.resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this) {
          const compact = entry.contentRect.width < COMPACT;
          if (compact !== this.compact) this.compact = compact;
        } else {
          const width = (entry.target as HTMLElement).clientWidth;
          if (width && width !== this.mainWidth) this.mainWidth = width;
        }
      }
      this.anchors = undefined;
      markLineStarts(this);
      this.onScroll();
    });
    this.resize.observe(this);
    this.observed = undefined;
    this.tick = window.setInterval(() => this.onTick(), 30_000);
    this.subscribed = '';
    this.resubscribe();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('location-changed', this.onLocation);
    window.removeEventListener(PREFERENCES_EVENT, this.onPreferences);
    this.removeEventListener('keydown', this.onKey);
    this.resize?.disconnect();
    this.stopStrip?.();
    this.stopStrip = undefined;
    window.clearInterval(this.tick);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.glider?.stop();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.stop?.();
    this.stop = undefined;
    this.subscribed = '';
  }

  /** The person's language and motion, followed live (Fluvy's preferences changed on this or another screen). */
  readonly onPreferences = (): void => {
    this.reduced = motionPreference() === 'reduced';
    this.toggleAttribute('reduced-motion', this.reduced);
    this.card = document.documentElement.hasAttribute(ACTIVITY_CARD);
    this.requestUpdate();
  };

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('hass') && this.hass && !changed.get('hass')) {
      this.timeWidth = this.measureTime();
      this.resubscribe();
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.anchors = undefined;
    const main = this.renderRoot.querySelector<HTMLElement>('.av-main');
    if (main && main !== this.observed) {
      if (this.observed) this.resize?.unobserve(this.observed);
      this.observed = main;
      this.resize?.observe(main);
    }
    // the hours not laid out yet are estimated with a real row's height
    const row = this.renderRoot.querySelector<HTMLElement>('.av-row');
    if (row?.offsetHeight) this.pitch = row.offsetHeight;
    this.moveFocus(changed);
    wireStrip(this);
    // the phone's filter pills are their text plus the 14 px sides, on the 4 grid (measured once laid out)
    fitPills(this.renderRoot, changed.has('fontEpoch'));
    markLineStarts(this);
    // the chosen filter is always in full view in its row
    if (changed.has('filter') || changed.has('mainWidth') || changed.has('compact'))
      showFilter(this, changed.has('filter') && changed.get('filter') !== undefined);
    if (changed.has('open'))
      this.revealOpened(changed.get('open') as ReadonlySet<string> | undefined);
    if (
      changed.has('events') ||
      changed.has('open') ||
      changed.has('full') ||
      changed.has('compact') ||
      changed.has('filter') ||
      changed.has('search') ||
      changed.has('exiting')
    )
      this.onScroll();
  }

  later(run: () => void, ms: number): void {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }

  onTick(): void {
    const now = Date.now();
    // "Today" moves on at midnight
    if (sameRange(this.range, dayRange(new Date(this.now))) && now >= this.range.end)
      this.goTo(dayRange(new Date(now)), 'next');
    this.now = now;
  }

  /* ---------- the address: dates and sources, as Home Assistant links them ---------- */

  readonly onLocation = (): void => {
    if (location.pathname.startsWith('/logbook')) this.readAddress(false);
  };

  readAddress(first: boolean): void {
    const params = new URLSearchParams(location.search);
    const linked = targetFromSearch(location.search);
    const picked = readStored<SourceTarget>(PICKED);
    if (countTargets(linked)) {
      if (JSON.stringify(linked) !== JSON.stringify(this.target)) {
        // a target linked from another page is not narrowed by the remembered filters
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
        if (!sameRange(range, this.range)) this.range = range;
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

  /** The page's address follows what is shown (the stock panel's format: a reload or a shared link opens the same). */
  writeAddress(): void {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(this.target)) {
      const list = typeof value === 'string' ? [value] : (value as readonly string[] | undefined);
      if (list?.length) params.set(key, list.join(','));
    }
    if (!sameRange(this.range, dayRange(new Date()))) {
      params.set('start_date', new Date(this.range.start).toISOString());
      params.set('end_date', new Date(this.range.end).toISOString());
    }
    const query = params.toString();
    navigate(`/logbook${query ? `?${query}` : ''}`, true);
  }

  /* ---------- data ---------- */

  resubscribe(): void {
    const hass = this.hass;
    if (!hass || !this.isConnected) return;
    const ids = sourceEntities(hass, this.target, this.sourceFilters);
    const key = `${this.range.start}|${this.range.end}|${ids?.join(',') ?? '*'}`;
    if (key === this.subscribed) return;
    this.stop?.();
    this.subscribed = key;
    this.baseline = undefined;
    this.people = peopleByUser(hass);
    this.arriving = 'load';
    this.stop = subscribeActivity(
      hass,
      {
        start: new Date(this.range.start),
        end: new Date(this.range.end),
        ...(ids ? { entityIds: ids } : {}),
      },
      (events, loading) => this.receive(events, loading),
    );
  }

  receive(events: readonly ActivityEvent[], loading: boolean): void {
    // the list is leaving for another period: what arrives meanwhile is shown once it has gone
    if (this.exiting) {
      this.buffered = { events, loading };
      return;
    }
    // new sources: the entries on screen stay until the new ones have something to show (no flash)
    if (this.arriving && loading && !events.length) {
      if (!this.events.length) this.loading = true;
      return;
    }
    if (this.arriving) {
      this.arriving = undefined;
      this.fresh = new Set();
      this.freshCount = 0;
      this.enter('load');
    }
    if (!loading && !this.baseline) {
      this.baseline = new Set(events.map(eventKey));
    } else if (this.baseline && !loading) {
      const fresh: string[] = [];
      let shown = 0;
      for (const event of events) {
        const key = eventKey(event);
        if (this.baseline.has(key)) continue;
        this.baseline.add(key);
        fresh.push(key);
        if (this.keeps(event)) shown += 1;
      }
      if (fresh.length) this.welcome(fresh, shown);
    }
    this.events = events;
    this.loading = loading;
  }

  /** New entries: they open a place on top, or are counted while the reader is further down. */
  welcome(keys: readonly string[], shown: number): void {
    const scroller = this.scroller;
    this.now = Date.now();
    if (!scroller || scroller.scrollTop < 120) {
      this.fresh = new Set([...this.fresh, ...keys]);
      this.later(() => {
        const next = new Set(this.fresh);
        for (const key of keys) next.delete(key);
        this.fresh = next;
      }, 1600);
      if (scroller && scroller.scrollTop > 0) glide(this, 0);
    } else if (shown) this.freshCount += shown;
  }

  keeps(event: ActivityEvent): boolean {
    const meta = this.index.of(event);
    return this.filter === 'all'
      ? true
      : this.filter === 'highlights'
        ? !meta.quiet
        : meta.category === this.filter;
  }

  model(): ActivityModel {
    const memo = this.modelMemo;
    if (
      memo &&
      memo.events === this.events &&
      memo.filter === this.filter &&
      memo.search === this.search &&
      memo.range === this.range
    )
      return memo.model;
    const model = buildModel(this.events, this.index, this.filter, this.search, this.range);
    this.modelMemo = {
      events: this.events,
      filter: this.filter,
      search: this.search,
      range: this.range,
      model,
    };
    return model;
  }

  /* ---------- words ---------- */

  get language(): string {
    return languageOf(this.hass);
  }

  readonly t = (key: ActivityString, values?: Record<string, string | number>): string =>
    s({ language: this.language }, key, values);

  count(key: 'changes' | 'automations' | 'restarts', n: number): string {
    return this.t(n === 1 ? `${key}_one` : key, { n: this.number(n) });
  }

  number(n: number): string {
    try {
      return new Intl.NumberFormat(this.language).format(n);
    } catch {
      return String(n);
    }
  }

  /** A figure that rolls up to its new value (a counter that changes live). */
  num(text: string): TemplateResult {
    return html`${keyed(text, html`<span class="av-num">${text}</span>`)}`;
  }

  /** Home Assistant's translation of one of its keys, else ours. */
  ha(key: string, fallback: ActivityString): string {
    const text = this.hass?.localize?.(key);
    return text && text !== key ? text : this.t(fallback);
  }

  time(ms: number, seconds = false): string {
    return formatTime(this.hass, new Date(ms), seconds);
  }

  /** The time column fits the house's clock ("12:44" or "12:44 PM"). */
  measureTime(): number {
    const sample = formatTime(this.hass, new Date(2020, 0, 1, 22, 58));
    return sample.length > 5 ? 72 : 52;
  }

  /**
   * A pill's width: its text in the page's face at 600 (digits as tabular zeros) plus its sides, on the 4 grid, so a
   * pill sits on whole pixels with its text in the middle. `@fluvy/ui`'s measurer lays it out as the page does.
   */
  pill(texts: readonly string[], size: number, sides: number, gap = 0): number {
    this.family ||= getComputedStyle(this).fontFamily || 'Inter, sans-serif';
    const parts = texts.map((part) => part.replace(/\d/g, '0'));
    return pillWidth(parts, { size, weight: 600, family: this.family }, sides, gap);
  }

  /* ---------- what an entry is ---------- */

  /* ---------- actions ---------- */

  toggle(key: string): void {
    if (this.open.has(key)) {
      if (reducedMotion()) {
        this.forget(key);
        return;
      }
      this.closing = new Set([...this.closing, key]);
      // whatever happens to the animation, the fold goes
      this.later(() => {
        if (this.closing.has(key)) this.forget(key);
      }, 400);
    } else {
      const closing = new Set(this.closing);
      closing.delete(key);
      this.closing = closing;
      this.open = new Set([...this.open, key]);
    }
  }

  forget(key: string): void {
    const open = new Set(this.open);
    open.delete(key);
    const closing = new Set(this.closing);
    closing.delete(key);
    const full = new Set(this.full);
    full.delete(key);
    this.open = open;
    this.closing = closing;
    this.full = full;
  }

  readonly onFolded = (event: AnimationEvent): void => {
    const key = (event.currentTarget as HTMLElement).dataset['key'];
    if (event.target === event.currentTarget && key && this.closing.has(key)) this.forget(key);
  };

  showAll(key: string): void {
    this.full = new Set([...this.full, key]);
  }

  setFilter(filter: ActivityFilter): void {
    if (filter === this.filter) return;
    this.filter = filter;
    this.freshCount = 0;
    this.enter('filter');
    // what the new filter shows starts where the list does
    const scroller = this.scroller;
    if (scroller && scroller.scrollTop > listTop(this)) glide(this, listTop(this));
  }

  enter(kind: 'load' | 'filter'): void {
    if (reducedMotion()) return;
    this.entering = kind;
    this.later(
      () => {
        if (this.entering === kind) this.entering = '';
      },
      kind === 'load' ? 700 : 240,
    );
  }

  /**
   * Another period: its title turns in at once; the list on screen leaves the way the page goes, a skeleton holds its
   * place, and the new entries rise in when they arrive.
   */
  goTo(range: ActivityRange, direction: 'next' | 'prev'): void {
    if (sameRange(range, this.range)) return;
    this.range = range;
    this.direction = direction;
    this.dismiss('picking');
    this.open = new Set();
    this.closing = new Set();
    this.full = new Set();
    this.pin = undefined;
    const leave = (): void => {
      this.exiting = '';
      this.events = [];
      this.loading = true;
      this.scroller?.scrollTo({ top: 0 });
      const buffered = this.buffered;
      this.buffered = undefined;
      if (buffered) this.receive(buffered.events, buffered.loading);
    };
    if (this.events.length && !reducedMotion()) {
      this.exiting = direction;
      this.later(leave, EXIT);
    } else leave();
    this.writeAddress();
    this.resubscribe();
  }

  shift(direction: 1 | -1): void {
    const range = shiftRange(this.range, direction);
    if (direction === 1 && range.start > Date.now()) return;
    this.goTo(range, direction === 1 ? 'next' : 'prev');
  }

  today(): void {
    const today = dayRange(new Date());
    this.goTo(today, today.start > this.range.start ? 'next' : 'prev');
  }

  readonly onDates = (event: CustomEvent<DatesDetail>): void => {
    const { range } = event.detail;
    this.goTo(range, range.start < this.range.start ? 'prev' : 'next');
  };

  readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.sourcing) this.dismiss('sourcing');
    else if (this.picking) this.dismiss('picking');
    else return;
    event.stopPropagation();
  };

  /** A floating layer leaves as it came (it slides and fades), then goes; with reduced motion at once. */
  dismiss(which: 'picking' | 'sourcing'): void {
    if (!this[which] || this.leaving === which) return;
    if (reducedMotion()) {
      this[which] = false;
      return;
    }
    this.leaving = which;
    // whatever happens to the animation (a tab in the background, a style that overrides it), the layer goes
    this.later(() => this.gone(which), 400);
  }

  gone(which: 'picking' | 'sourcing'): void {
    if (this.leaving !== which) return;
    this[which] = false;
    this.leaving = '';
  }

  readonly onLeft = (event: AnimationEvent): void => {
    if (event.target !== event.currentTarget || !this.leaving) return;
    this.gone(this.leaving);
  };

  /** A layer that opens takes the focus (Escape and Tab then work inside it); one that goes gives it back. */
  moveFocus(changed: PropertyValues<this>): void {
    for (const which of ['sourcing', 'picking'] as const) {
      if (!changed.has(which)) continue;
      if (this[which]) {
        const active = this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null;
        this.opener = (active as HTMLElement | null) ?? null;
        this.renderRoot
          .querySelector<HTMLElement>(`[data-autofocus="${which}"]`)
          ?.focus({ preventScroll: true });
      } else if (changed.get(which)) {
        this.opener?.focus({ preventScroll: true });
        this.opener = null;
      }
    }
  }

  /** A row opened near the foot of the screen: the page glides so its detail is in view (the row stays). */
  revealOpened(before: ReadonlySet<string> | undefined): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const added = [...this.open].filter((key) => !before?.has(key));
    const key = added[added.length - 1];
    if (!key) return;
    const detail = this.renderRoot.querySelector<HTMLElement>(
      `.av-detail[data-key="${CSS.escape(key)}"]`,
    );
    if (!detail) return;
    // measured once it has opened (it grows for 300 ms)
    this.later(
      () => {
        // in the scroller's own pixels (what it scrolls by)
        const zoom = zoomOf(scroller);
        const box = scroller.getBoundingClientRect();
        const rect = detail.getBoundingClientRect();
        const row = detail.previousElementSibling as HTMLElement | null;
        const over = (rect.bottom - box.bottom) / zoom + 16;
        if (over <= 0) return;
        const room = row
          ? (row.getBoundingClientRect().top - box.top) / zoom - HOUR_HEAD - 8
          : over;
        glide(this, scroller.scrollTop + Math.min(over, Math.max(0, room)));
      },
      reducedMotion() ? 0 : 320,
    );
  }

  /* ---------- the rail and the scroll ---------- */

  get scroller(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.av-scroll') ?? null;
  }

  get rail(): FluvyTimeRail | null {
    return this.renderRoot?.querySelector<FluvyTimeRail>('fluvy-time-rail') ?? null;
  }

  readonly onScroll = (): void => {
    if (!this.frame) this.frame = requestAnimationFrame(this.sync);
  };

  /** The rail follows the timeline: the knob at the moment under the hour header, the lit stretch over the screen. */
  readonly sync = (): void => {
    this.frame = 0;
    const scroller = this.scroller;
    const rail = this.rail;
    if (!scroller) return;
    const top = scroller.scrollTop;
    // a scroll that is not ours (the wheel, a finger, the keyboard) lets go of the pinned moment
    if (Math.abs(top - this.glideTarget) > 1 && !gliding(this)) this.pin = undefined;
    if (rail) {
      if (!this.scrubbing) rail.value = this.pin ?? timeAt(this, top);
      rail.valueEnd = timeAt(this, top + Math.max(0, scroller.clientHeight - HOUR_HEAD - 56));
    }
    const title = this.renderRoot.querySelector<HTMLElement>('.av-day__date');
    const scrolled = !!title && top > title.offsetTop + title.offsetHeight;
    if (scrolled !== this.scrolled) this.scrolled = scrolled;
    if (top < 120 && this.freshCount) this.freshCount = 0;
    markStuck(this, scroller);
    sizeFoot(this);
  };

  readonly onManual = (): void => {
    this.glider?.stop();
    this.glider = undefined;
    this.glideTarget = Number.NaN;
    this.chase = undefined;
    this.pin = undefined;
  };

  readonly onScrub = (event: CustomEvent<TimeRailDetail>): void => {
    const { value, done, via, key } = event.detail;
    const rail = this.rail;
    this.scrubbing = !done && !!rail?.scrubbing;
    const newest = this.sections[0];
    // above the first hour: the top of the page, the knob at the newest moment
    const aboveList = !newest || value > Math.min(newest.start + HOUR, topTime(this));
    if (!done) {
      this.pin = undefined;
      glide(this, aboveList ? 0 : (rowAt(this, value)?.s ?? 0));
      return;
    }
    if (via === 'key' && (key === 'Home' || aboveList)) {
      this.pin = key === 'Home' ? topTime(this) : Math.min(value, topTime(this));
      glide(this, 0);
    } else if (via === 'key' && key === 'End') {
      // the oldest row, under the oldest hour: the end of the scroll
      const rows = this.renderRoot.querySelectorAll<HTMLElement>('.av-row[data-t]');
      const oldest = rows[rows.length - 1];
      const settled = oldest ? settleOn(this, Number(oldest.dataset['t'])) : undefined;
      this.pin = settled?.t ?? this.range.start;
      glide(this, settled?.s ?? Number.MAX_SAFE_INTEGER, settled?.node);
    } else if (aboveList) {
      this.pin = topTime(this);
      glide(this, 0);
    } else {
      // it settles on the row the moment falls in; the keys keep their exact step, a finger lands on the row
      const settled = settleOn(this, value);
      this.pin = via === 'key' ? value : (settled?.t ?? value);
      glide(this, settled?.s ?? rowAt(this, value)?.s ?? 0, settled?.node);
    }
    if (rail) rail.value = this.pin;
  };

  readonly railLabel = (time: number, day: boolean): string => {
    const date = new Date(time);
    if (day) return String(date.getDate());
    const hour = date.getHours();
    // the end of the day is its 24th hour
    const end = time === this.range.end && hour === 0;
    if (this.timeWidth > 52) return end ? '12a' : `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
    return end ? '24' : String(hour).padStart(2, '0');
  };

  readonly railBubble = (time: number): string => {
    const date = new Date(time);
    const long = this.range.end - this.range.start > 36 * HOUR;
    const when = long
      ? `${formatDate(this.hass, date, 'short')} · ${this.time(time)}`
      : this.time(time);
    // how busy the stretch the knob is on was (the bar beside it)
    const model = this.modelMemo?.model;
    const bucket = bucketOf(this.range);
    const index = Math.floor((time - this.range.start) / bucket);
    const n = model?.density[Math.min(index, model.density.length - 1)] ?? 0;
    return n ? `${when} · ${this.count('changes', n)}` : when;
  };

  /* ---------- rendering ---------- */

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const model = this.model();
    this.sections = model.sections;
    const { density, key } = histogram(this, model);
    const rail = html`<fluvy-time-rail
      ?reduced-motion=${this.reduced}
      .start=${this.range.start}
      .end=${this.range.end}
      .now=${isCurrent(this) ? this.now : 0}
      .density=${density}
      .densityKey=${key}
      .compact=${this.compact}
      .label=${this.t('rail')}
      .formatLabel=${this.railLabel}
      .formatBubble=${this.railBubble}
      @fluvy-scrub=${this.onScrub}
    ></fluvy-time-rail>`;
    return html`${renderBar(this)}
      <div
        class="av-scroll ${this.freshCount ? 'has-fresh' : ''}"
        style="--av-time:${this.timeWidth}px"
        @scroll=${this.onScroll}
        @wheel=${this.onManual}
        @touchstart=${this.onManual}
      >
        <div class="av-page">
          <div class="av-main">
            ${renderDay(this, model)} ${renderTools(this)} ${renderFilters(this, model)}
            ${renderNarrowed(this)} ${renderFresh(this)} ${renderList(this, model)}
          </div>
          <div class="av-rail">${rail}</div>
          ${model.sections.length ? html`<div class="av-foot" aria-hidden="true"></div>` : nothing}
        </div>
      </div>
      ${this.picking && this.compact ? renderPickerSheet(this) : nothing}
      ${this.sourcing ? renderSources(this) : nothing}`;
  }

  readonly onSkipped = (event: Event & { skipped?: boolean }): void => {
    (event.currentTarget as HTMLElement).toggleAttribute('data-skipped', !!event.skipped);
    this.anchors = undefined;
  };
}

if (!customElements.get('fluvy-activity')) customElements.define('fluvy-activity', FluvyActivity);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-activity': FluvyActivity;
  }
}
