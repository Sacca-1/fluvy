import {
  areaOf,
  domainOf,
  type HassEntities,
  type HassEntity,
  type HomeAssistant,
} from '@fluvy/core';
import type { Tone } from '@fluvy/ui';
import { compileConditions, screenMatches, type Conditions } from './conditions.js';
import { compileMatcher, type Matcher } from './match.js';
import type { AlertDefinition, AlertSource, NameBy } from './model.js';
import { bySeverity, graver, lookOf, type Severity } from './severity.js';

/*
 * The alerts of a card, kept up to date as the house changes, at the cost of what changed. A card's `hass` arrives
 * on every state change of the whole house; the engine compares the states object by object (Home Assistant hands a
 * new object only for an entity that changed, the base card's own assumption) and tests again only the changed ids,
 * against the alerts whose domains they can match — and the entities whose check read them (a battery when its
 * charger changes). Every clause was compiled once, with its config. All of it is tested again only when the
 * registries change (an area renamed, a device moved), and what it held is kept across that: how long a clause has
 * held is never forgotten while it holds on.
 *
 * Time is one timer: the earliest instant anything can change on its own — a match reaching its `for` or its
 * `unchanged_for`, an escalation's `for`, a snooze ending, a time condition's edge. At that instant the card asks
 * again (`due`), and nothing polls.
 *
 * What it answers is the same object for as long as nothing it says has changed: the card draws again only then.
 */

/** What the engine reads of the snoozes and acknowledgements (`memory.ts` keeps them). */
export interface MemoryView {
  /** Changes whenever what it holds does. */
  readonly version: number;
  /** Until when the alert of that key is snoozed (ms), if it is. */
  snoozedUntil(key: string): number | undefined;
  /** The entities acknowledged under that key, each with the `last_changed` it had then: back when it moves. */
  acknowledged(key: string): Readonly<Record<string, string>> | undefined;
}

/** No memory (`snooze: off`, or before the store answers). */
export const NO_MEMORY: MemoryView = {
  version: 0,
  snoozedUntil: () => undefined,
  acknowledged: () => undefined,
};

/** An item a source hands over (a repair): its id, since when, and how grave it is. */
export interface SourceRow {
  readonly id: string;
  readonly since: number;
  readonly severity?: Severity;
}

/** One match of an alert. */
export interface AlertRow {
  /** The entity's id (a source's own id for its items). */
  readonly id: string;
  /** The state it matched on (none for a source's item). */
  readonly state: HassEntity | undefined;
  /** When it began to match, as far as the engine can know (`for` counts from here). */
  readonly since: number;
  readonly device: string | undefined;
  /** Its state's number, if it is one (`sort_rows: value`: the lowest battery first). */
  readonly value: number | undefined;
  /** A source item's own severity. */
  readonly severity: Severity | undefined;
}

/** An alert as it stands. */
export interface AlertResult {
  /** What its snoozes and acknowledgements are remembered by (a split alert's: the alert's key and its entity). */
  readonly key: string;
  readonly definition: AlertDefinition;
  /** A split alert's one entity. */
  readonly entity: string | undefined;
  /** Its severity now: escalated, or raised by a source item's own. */
  readonly severity: Severity;
  readonly escalated: boolean;
  readonly tone: Tone;
  readonly color: string | undefined;
  /** What it counts, in its order (`sort_rows`): its matches, the acknowledged ones left out. */
  readonly rows: readonly AlertRow[];
  /** Its matches acknowledged and unchanged since. */
  readonly acknowledged: readonly AlertRow[];
  /** Its count: the rows, or the devices they are on (`count_by: device`). */
  readonly count: number;
  /** When its longest-standing match began. */
  readonly oldest: number | undefined;
  /** Its conditions hold. */
  readonly applies: boolean;
  /** Snoozed until then (ms). */
  readonly snoozedUntil: number | undefined;
  /** Whether a dashboard shows it: it applies, counts `min_count` or more, and is not snoozed. */
  readonly shown: boolean;
}

/** Every alert of the card as it stands. */
export interface AlertsState {
  /** Every alert this person may see, in order, snoozed and clear ones included (the overview). */
  readonly alerts: readonly AlertResult[];
  /** The ones a dashboard shows. */
  readonly shown: readonly AlertResult[];
}

export interface EngineOptions {
  /** By severity, then as configured (default); or as configured only. */
  readonly order?: 'severity' | 'config';
  readonly now?: () => number;
  /** The screen's media queries (the `screen` condition). */
  readonly matches?: (query: string) => boolean;
  /** Called at the earliest deadline: the card evaluates again then. */
  readonly due?: () => void;
}

/** A match being kept: the state it was tested on, since when each clause has held, when it counts. */
interface Track {
  readonly state: HassEntity;
  readonly sinces: readonly (number | undefined)[];
  readonly since: number;
  readonly from: number;
}

/** One alert in the engine. */
interface Watch {
  readonly definition: AlertDefinition;
  readonly matcher: Matcher;
  readonly conditions: Conditions;
  readonly tracks: Map<string, Track>;
  /** What each entity's check read, and who read each entity. */
  readonly reads: Map<string, readonly string[]>;
  readonly readers: Map<string, Set<string>>;
  /** Its tracks changed since its results were made. */
  dirty: boolean;
  results: readonly AlertResult[];
  /** What its results were made under: the earliest instant they can change, the memory, the person, the conditions. */
  until: number | undefined;
  memory: MemoryView | undefined;
  version: number;
  admin: boolean;
  applies: boolean;
}

/** The longest a browser's timer waits (about 24.8 days). */
const MAX_DELAY = 2 ** 31 - 1;

const numberOf = (state: string): number | undefined => {
  if (!/\d/.test(state)) return undefined;
  const n = Number(state);
  return Number.isFinite(n) ? n : undefined;
};

/** A row's name: the entity's, its device's, or its area's (the entity's own when it has none). */
export function nameOf(hass: HomeAssistant, id: string, by: NameBy = 'entity'): string {
  const entry = hass.entities?.[id];
  const own = hass.states[id]?.attributes.friendly_name ?? entry?.name ?? id;
  if (by === 'device') {
    const device = entry?.device_id ? hass.devices?.[entry.device_id] : undefined;
    return device?.name_by_user ?? device?.name ?? own;
  }
  if (by === 'area') {
    const area = areaOf(hass, id);
    return (area && hass.areas?.[area]?.name) || own;
  }
  return own;
}

const earlier = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.min(a, b);

const sameRows = (a: readonly AlertRow[], b: readonly AlertRow[]): boolean =>
  a.length === b.length &&
  a.every((row, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      row.id === other.id &&
      row.state === other.state &&
      row.since === other.since &&
      row.device === other.device &&
      row.severity === other.severity
    );
  });

/** Whether two results of one alert say the same. */
const sameResult = (a: AlertResult, b: AlertResult): boolean =>
  a.key === b.key &&
  a.definition === b.definition &&
  a.severity === b.severity &&
  a.escalated === b.escalated &&
  a.count === b.count &&
  a.applies === b.applies &&
  a.snoozedUntil === b.snoozedUntil &&
  a.shown === b.shown &&
  sameRows(a.rows, b.rows) &&
  sameRows(a.acknowledged, b.acknowledged);

export class AlertEngine {
  /** How many clause tests have run: what the bound on the work is asserted by. */
  tests = 0;

  private readonly watches: readonly Watch[];
  private readonly order: 'severity' | 'config';
  private readonly now: () => number;
  private readonly matches: (query: string) => boolean;
  private readonly due: (() => void) | undefined;
  private hass: HomeAssistant | undefined;
  /** Entity ids by domain, and how many there are: kept as entities come and go. */
  private readonly domains = new Map<string, Set<string>>();
  private count = 0;
  private readonly sources = new Map<AlertSource, readonly SourceRow[]>();
  private state: AlertsState | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private armed: number | undefined;

  constructor(definitions: readonly AlertDefinition[], options: EngineOptions = {}) {
    this.order = options.order ?? 'severity';
    this.now = options.now ?? Date.now;
    this.matches = options.matches ?? screenMatches;
    this.due = options.due;
    this.watches = definitions.map((definition) => ({
      definition,
      matcher: compileMatcher(definition),
      conditions: compileConditions(definition.conditions),
      tracks: new Map(),
      reads: new Map(),
      readers: new Map(),
      dirty: true,
      results: [],
      until: undefined,
      memory: undefined,
      version: -1,
      admin: false,
      applies: false,
    }));
  }

  /** The media queries the alerts' conditions ask: the card evaluates again when one of them changes. */
  get queries(): readonly string[] {
    return [...new Set(this.watches.flatMap((watch) => watch.conditions.queries))];
  }

  /** A source's items as they are now (the repairs the card read): its alerts are made again. */
  feed(source: AlertSource, rows: readonly SourceRow[]): void {
    this.sources.set(source, rows);
    for (const watch of this.watches) if (watch.definition.source === source) watch.dirty = true;
  }

  /**
   * The alerts as they stand for this `hass`, at the cost of what changed since the last call: the same object
   * when nothing they say has. The timer is set again for the earliest deadline.
   */
  evaluate(hass: HomeAssistant, memory: MemoryView = NO_MEMORY): AlertsState {
    const previous = this.hass;
    this.hass = hass;
    if (!previous) {
      this.index(hass.states);
      this.rebuild(hass);
    } else {
      const changed =
        previous.states === hass.states ? [] : this.diff(previous.states, hass.states);
      if (
        previous.entities !== hass.entities ||
        previous.devices !== hass.devices ||
        previous.areas !== hass.areas ||
        previous.floors !== hass.floors
      )
        this.rebuild(hass);
      else if (changed.length) this.retest(hass, changed);
      // names in another language sort in another order
      if (previous.language !== hass.language) for (const watch of this.watches) watch.dirty = true;
    }

    const now = this.now();
    const admin = hass.user?.is_admin === true;
    let fresh = !this.state;
    for (const watch of this.watches) {
      const applies = watch.conditions.test(hass, { now, matches: this.matches });
      if (
        watch.dirty ||
        watch.memory !== memory ||
        watch.version !== memory.version ||
        watch.admin !== admin ||
        watch.applies !== applies ||
        (watch.until !== undefined && watch.until <= now)
      )
        fresh = this.build(watch, hass, memory, now, admin, applies) || fresh;
    }
    const state = fresh || !this.state ? this.assemble() : this.state;
    this.state = state;
    this.arm(this.next, now);
    return state;
  }

  /** The next instant something can change on its own (ms): a `for` reached, an escalation, a snooze over, a time window's edge. */
  get next(): number | undefined {
    let next: number | undefined;
    for (const watch of this.watches) next = earlier(next, watch.until);
    return next;
  }

  /** Stops the timer (the card left the page). */
  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.armed = undefined;
  }

  /* ---------- what changed ---------- */

  private index(states: HassEntities): void {
    this.domains.clear();
    this.count = 0;
    for (const id in states) {
      this.add(id);
      this.count += 1;
    }
  }

  private add(id: string): void {
    const domain = domainOf(id);
    const ids = this.domains.get(domain);
    if (ids) ids.add(id);
    else this.domains.set(domain, new Set([id]));
  }

  /** The ids whose state is another object (new, changed or gone), in one pass over the states and the index kept. */
  private diff(previous: HassEntities, next: HassEntities): string[] {
    const changed: string[] = [];
    let count = 0;
    let added = 0;
    for (const id in next) {
      count += 1;
      const before = previous[id];
      if (before === next[id]) continue;
      changed.push(id);
      if (before === undefined) {
        added += 1;
        this.add(id);
      }
    }
    if (this.count + added > count)
      for (const id in previous)
        if (!(id in next)) {
          changed.push(id);
          this.domains.get(domainOf(id))?.delete(id);
        }
    this.count = count;
    return changed;
  }

  /** Every alert tested again over every entity it can match; what each held is kept while it holds on. */
  private rebuild(hass: HomeAssistant): void {
    for (const watch of this.watches) {
      // a device or an area renamed or moved: the rows' devices, names and order are made again
      watch.dirty = true;
      const domains = watch.matcher.domains;
      const candidates = domains
        ? [...domains].flatMap((domain) => [...(this.domains.get(domain) ?? [])])
        : Object.keys(hass.states);
      const kept = new Set(watch.tracks.keys());
      for (const id of candidates) {
        kept.delete(id);
        this.test(watch, id, hass.states[id], hass);
      }
      for (const id of kept) this.test(watch, id, undefined, hass);
    }
  }

  /** The changed ids tested again, each once per alert that can match it — and whoever's check read it. */
  private retest(hass: HomeAssistant, changed: readonly string[]): void {
    for (const watch of this.watches) {
      const domains = watch.matcher.domains;
      const ids = new Set<string>();
      for (const id of changed) {
        if (!domains || domains.has(domainOf(id)) || watch.tracks.has(id)) ids.add(id);
        for (const reader of watch.readers.get(id) ?? []) ids.add(reader);
      }
      for (const id of ids) this.test(watch, id, hass.states[id], hass);
    }
  }

  /** One entity tested against one alert: its track made, kept or dropped. */
  private test(watch: Watch, id: string, state: HassEntity | undefined, hass: HomeAssistant): void {
    const before = watch.tracks.get(id);
    const clauses = watch.matcher.clauses;
    const sinces: (number | undefined)[] = [];
    let held = false;
    if (state)
      for (const [i, clause] of clauses.entries()) {
        this.tests += 1;
        if (!clause.test(id, state, hass)) continue;
        sinces[i] = before?.sinces[i] ?? clause.seed(state);
        held = true;
      }
    if (held && state && watch.matcher.excluded(id, state, hass)) held = false;
    const check = watch.definition.check;
    if (held && check) {
      this.recordReads(watch, id, check.reads(hass, id));
      held = check.test(hass, id);
    } else this.recordReads(watch, id, []);
    if (!held || !state) {
      if (before) {
        watch.tracks.delete(id);
        watch.dirty = true;
      }
      return;
    }
    let since = Number.POSITIVE_INFINITY;
    let from = Number.POSITIVE_INFINITY;
    const updated = Date.parse(state.last_updated);
    for (const [i, clause] of clauses.entries()) {
      const start = sinces[i];
      if (start === undefined) continue;
      since = Math.min(since, start);
      const unchanged =
        clause.unchangedMs === undefined
          ? Number.NEGATIVE_INFINITY
          : (Number.isFinite(updated) ? updated : start) + clause.unchangedMs;
      from = Math.min(from, Math.max(start + clause.forMs, unchanged));
    }
    if (before && before.state === state && before.since === since && before.from === from) return;
    watch.tracks.set(id, { state, sinces, since, from });
    watch.dirty = true;
  }

  private recordReads(watch: Watch, id: string, reads: readonly string[]): void {
    const old = watch.reads.get(id);
    if (old === reads || (!old && !reads.length)) return;
    for (const read of old ?? []) watch.readers.get(read)?.delete(id);
    if (!reads.length) {
      watch.reads.delete(id);
      return;
    }
    watch.reads.set(id, reads);
    for (const read of reads) {
      const readers = watch.readers.get(read);
      if (readers) readers.add(id);
      else watch.readers.set(read, new Set([id]));
    }
  }

  /* ---------- what it says ---------- */

  /**
   * An alert's results made again — its rows, count, severity, snooze — and the earliest instant they can change.
   * Results that say what they said keep their objects: false when nothing changed.
   */
  private build(
    watch: Watch,
    hass: HomeAssistant,
    memory: MemoryView,
    now: number,
    admin: boolean,
    applies: boolean,
  ): boolean {
    const definition = watch.definition;
    watch.dirty = false;
    watch.memory = memory;
    watch.version = memory.version;
    watch.admin = admin;
    watch.applies = applies;
    // a time condition's edge is a deadline whether it holds now or not
    let until = watch.conditions.next(hass, now);

    const rows: AlertRow[] = [];
    if (definition.adminOnly && !admin) {
      // never shown to this person: no results at all
    } else if (definition.source === 'states')
      for (const [id, track] of watch.tracks) {
        if (track.from > now) {
          until = earlier(until, track.from);
          continue;
        }
        rows.push({
          id,
          state: track.state,
          since: track.since,
          device: hass.entities?.[id]?.device_id,
          value: numberOf(track.state.state),
          severity: undefined,
        });
      }
    else
      for (const item of this.sources.get(definition.source) ?? [])
        rows.push({
          id: item.id,
          state: undefined,
          since: item.since,
          device: undefined,
          value: undefined,
          severity: item.severity,
        });
    this.sort(rows, definition, hass);

    const groups: [key: string, entity: string | undefined, rows: AlertRow[]][] = definition.split
      ? rows.map((row) => [`${definition.key}/${row.id}`, row.id, [row]])
      : definition.adminOnly && !admin
        ? []
        : [[definition.key, undefined, rows]];
    const results = groups.map(([key, entity, all]): AlertResult => {
      const stamps = memory.acknowledged(key);
      const counted: AlertRow[] = [];
      const acknowledged: AlertRow[] = [];
      for (const row of all)
        (stamps?.[row.id] !== undefined && stamps[row.id] === row.state?.last_changed
          ? acknowledged
          : counted
        ).push(row);
      const count =
        definition.countBy === 'device'
          ? new Set(counted.map((row) => row.device ?? row.id)).size
          : counted.length;

      let severity = definition.severity;
      for (const row of counted) if (row.severity) severity = graver(severity, row.severity);
      let escalated = false;
      const escalate = definition.escalate;
      if (escalate && counted.length) {
        if (escalate.count !== undefined && count >= escalate.count) escalated = true;
        if (escalate.forMs !== undefined)
          for (const row of counted) {
            const at = row.since + escalate.forMs;
            if (at <= now) escalated = true;
            else until = earlier(until, at);
          }
        if (escalated) severity = graver(severity, escalate.severity);
      }

      const snoozed = memory.snoozedUntil(key);
      const snoozedUntil = snoozed !== undefined && snoozed > now ? snoozed : undefined;
      until = earlier(until, snoozedUntil);
      const look = lookOf(severity, definition);
      return {
        key,
        definition,
        entity,
        severity,
        escalated,
        tone: look.tone,
        color: look.color,
        rows: counted,
        acknowledged,
        count,
        oldest: counted.length ? Math.min(...counted.map((row) => row.since)) : undefined,
        applies,
        snoozedUntil,
        shown: applies && count >= definition.minCount && snoozedUntil === undefined,
      };
    });
    watch.until = until;
    const old = watch.results;
    const kept = results.map((result, i) => {
      const before = old[i];
      return before && sameResult(before, result) ? before : result;
    });
    if (kept.length === old.length && kept.every((result, i) => result === old[i])) return false;
    watch.results = kept;
    return true;
  }

  /** A list's order: the longest-standing first, the lowest value, by name, or by area. */
  private sort(rows: AlertRow[], definition: AlertDefinition, hass: HomeAssistant): void {
    const name = (row: AlertRow): string => nameOf(hass, row.id, definition.nameBy);
    const area = (row: AlertRow): string => {
      const id = areaOf(hass, row.id);
      return (id && hass.areas?.[id]?.name) || '';
    };
    const compare = (a: string, b: string): number => a.localeCompare(b, hass.language);
    const by: Record<AlertDefinition['sortRows'], (a: AlertRow, b: AlertRow) => number> = {
      duration: (a, b) => a.since - b.since,
      value: (a, b) =>
        a.value === undefined
          ? b.value === undefined
            ? 0
            : 1
          : b.value === undefined
            ? -1
            : a.value - b.value,
      name: (a, b) => compare(name(a), name(b)),
      area: (a, b) => compare(area(a), area(b)) || compare(name(a), name(b)),
    };
    const first = by[definition.sortRows];
    rows.sort((a, b) => first(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Every alert's results in order: by severity, then as configured (a split alert's in its rows' order). */
  private assemble(): AlertsState {
    const alerts = this.watches
      .flatMap((watch) => watch.results)
      .sort(
        (a, b) =>
          (this.order === 'severity' ? bySeverity(a.severity, b.severity) : 0) ||
          a.definition.index - b.definition.index,
      );
    return { alerts, shown: alerts.filter((alert) => alert.shown) };
  }

  /** One timer, at the earliest deadline. */
  private arm(next: number | undefined, now: number): void {
    if (!this.due || next === this.armed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.armed = next;
    if (next === undefined) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.armed = undefined;
        this.due?.();
      },
      Math.min(MAX_DELAY, Math.max(0, next - now)),
    );
  }
}
