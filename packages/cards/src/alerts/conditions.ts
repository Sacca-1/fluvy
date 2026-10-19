import { houseZone, personOf, type HassEntity, type HomeAssistant } from '@fluvy/core';
import { clockSeconds, instantAt, plusDays, wallNow, WEEKDAYS, type Weekday } from './time.js';

/*
 * When an alert applies at all, in Home Assistant's own visibility shapes, so a condition pasted from a card's
 * Visibility tab means here what it means there (its frontend's `validate-condition.ts`): `state` and
 * `numeric_state` (on `entity` or `entity_id`, an `attribute`, a threshold or a state that names another entity),
 * `screen` (a media query), `user`, `time` (`after`, `before`, `weekdays`, in the zone the person's profile says,
 * across midnight when `before` is earlier), `location` (the person's state by `locations`, or `away`; a `target`
 * of zone ids), and `and`, `or`, `not` (not all of them); the legacy `{entity, state, state_not}`. A shape Home
 * Assistant checks on its server (a template, the sun) is not one a card can see, and never holds.
 *
 * A condition is read once; `test` answers now, `next` the next instant a time condition can change its answer,
 * which the engine keeps its one timer for.
 */

/** A condition as a config writes it. */
export type VisibilityCondition = Readonly<Record<string, unknown>>;

/** What a condition reads besides `hass`: the instant, and the screen's media queries. */
export interface ConditionContext {
  readonly now: number;
  readonly matches: (query: string) => boolean;
}

export interface Conditions {
  /** Whether every condition holds (none: always). */
  test(hass: HomeAssistant, context: ConditionContext): boolean;
  /** The next instant after `now` a time condition among them may change its answer; undefined: none can. */
  next(hass: HomeAssistant, now: number): number | undefined;
  /** The media queries they ask (the card listens to them). */
  readonly queries: readonly string[];
}

type Check = (hass: HomeAssistant, context: ConditionContext) => boolean;

const list = (value: unknown): readonly unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

/** A value that names an entity reads as that entity's state too (Home Assistant's `getValueFromEntityId`). */
const throughEntity = (hass: HomeAssistant, value: unknown): string | undefined =>
  typeof value === 'string' && ENTITY_ID.test(value) ? hass.states[value]?.state : undefined;

const entityOf = (condition: VisibilityCondition): string | undefined => {
  const id = condition['entity_id'] ?? condition['entity'];
  return typeof id === 'string' ? id : undefined;
};

function stateCheck(condition: VisibilityCondition): Check {
  const id = entityOf(condition);
  const attribute = typeof condition['attribute'] === 'string' ? condition['attribute'] : undefined;
  const negated = condition['state'] === undefined || condition['state'] === null;
  const values = list(negated ? condition['state_not'] : condition['state']).map(String);
  if (condition['state'] == null && condition['state_not'] == null) return () => false;
  return (hass) => {
    const stateObj: HassEntity | undefined = id ? hass.states[id] : undefined;
    const raw = !stateObj
      ? 'unknown'
      : attribute
        ? stateObj.attributes[attribute] == null
          ? 'unknown'
          : String(stateObj.attributes[attribute])
        : stateObj.state;
    const wanted = [...values, ...values.flatMap((value) => throughEntity(hass, value) ?? [])];
    return negated ? !wanted.includes(raw) : wanted.includes(raw);
  };
}

function numericCheck(condition: VisibilityCondition): Check {
  const id = entityOf(condition);
  const attribute = typeof condition['attribute'] === 'string' ? condition['attribute'] : undefined;
  const bound = (hass: HomeAssistant, key: 'above' | 'below'): number | undefined => {
    const raw = condition[key];
    if (raw === undefined || raw === null) return undefined;
    const n = Number(throughEntity(hass, raw) ?? raw);
    return Number.isNaN(n) ? undefined : n;
  };
  return (hass) => {
    const stateObj = id ? hass.states[id] : undefined;
    const value = Number(attribute ? stateObj?.attributes[attribute] : stateObj?.state);
    if (Number.isNaN(value)) return false;
    const above = bound(hass, 'above');
    const below = bound(hass, 'below');
    return (above === undefined || above < value) && (below === undefined || below > value);
  };
}

/** A time window: a weekday among `weekdays`, and between `after` and `before` (wrapping midnight), edges included. */
function timeCheck(condition: VisibilityCondition): { check: Check; next: Next } {
  const after = clockSeconds(condition['after']);
  const before = clockSeconds(condition['before']);
  const weekdays = list(condition['weekdays']).filter((day): day is Weekday =>
    (WEEKDAYS as readonly unknown[]).includes(day),
  );
  const inside = (weekday: Weekday, second: number): boolean => {
    if (weekdays.length && !weekdays.includes(weekday)) return false;
    if (after !== undefined && before !== undefined)
      return before < after
        ? second >= after || second <= before
        : second >= after && second <= before;
    if (after !== undefined) return second >= after;
    if (before !== undefined) return second <= before;
    return true;
  };
  return {
    check: (hass, { now }) => {
      const wall = wallNow(now, houseZone(hass));
      return inside(wall.weekday, wall.second);
    },
    // the answer can only change at an edge (the second after `before`) or, with weekdays, at midnight
    next: (hass, now) => {
      const zone = houseZone(hass);
      const today = wallNow(now, zone);
      const edges = [
        after,
        before === undefined ? undefined : before + 1,
        weekdays.length ? 0 : undefined,
      ].filter((edge): edge is number => edge !== undefined);
      let soonest: number | undefined;
      for (const offset of [0, 1])
        for (const edge of edges) {
          const at = instantAt(plusDays(today, offset), edge, zone);
          if (at > now && (soonest === undefined || at < soonest)) soonest = at;
        }
      return soonest;
    },
  };
}

/** The person this user is: one look over the house per user, kept while that person still carries the user. */
const persons = new Map<string, string>();
function personState(hass: HomeAssistant): HassEntity | undefined {
  const user = hass.user?.id;
  if (!user) return undefined;
  const known = persons.get(user);
  if (known && hass.states[known]?.attributes['user_id'] === user) return hass.states[known];
  const id = personOf(hass, user);
  if (id) persons.set(user, id);
  return id ? hass.states[id] : undefined;
}

/** The person's state shown while a zone is their active zone: `home` for the home zone, else its name. */
const zoneState = (hass: HomeAssistant, zone: string): string | undefined => {
  const state = hass.states[zone];
  if (!state || state.attributes['passive']) return undefined;
  return zone === 'zone.home' ? 'home' : (state.attributes.friendly_name ?? undefined);
};

function locationCheck(condition: VisibilityCondition): Check {
  const locations = list(condition['locations']).map(String);
  const away = condition['away'] === true;
  const target = isRecord(condition['target']) ? condition['target'] : undefined;
  const zones = list(target?.['entity_id']).map(String);
  return (hass) => {
    const person = personState(hass);
    if (!person) return false;
    if (locations.includes(person.state)) return true;
    if (away && person.state === 'not_home') return true;
    if (!zones.length) return false;
    const inZones = person.attributes['in_zones'];
    if (!Array.isArray(inZones) || !inZones.length)
      return (
        person.state !== 'not_home' && zones.some((zone) => zoneState(hass, zone) === person.state)
      );
    if (condition['match_mode'] === 'active_zone') {
      const active = inZones.find((zone) => zoneState(hass, String(zone)) === person.state);
      return active !== undefined && zones.includes(String(active));
    }
    return inZones.some((zone) => zones.includes(String(zone)));
  };
}

type Next = (hass: HomeAssistant, now: number) => number | undefined;

interface Compiled {
  readonly check: Check;
  readonly next: Next | undefined;
  readonly queries: readonly string[];
}

const NEVER: Compiled = { check: () => false, next: undefined, queries: [] };
const ALWAYS: Compiled = { check: () => true, next: undefined, queries: [] };

const soonest =
  (nexts: readonly Next[]): Next =>
  (hass, now) => {
    let best: number | undefined;
    for (const next of nexts) {
      const at = next(hass, now);
      if (at !== undefined && (best === undefined || at < best)) best = at;
    }
    return best;
  };

/** Every one of these: their checks, their soonest change, their queries. */
function all(items: readonly Compiled[]): Compiled {
  const nexts = items.flatMap((item) => (item.next ? [item.next] : []));
  return {
    check: (hass, context) => items.every((item) => item.check(hass, context)),
    next: nexts.length ? soonest(nexts) : undefined,
    queries: items.flatMap((item) => item.queries),
  };
}

function compile(raw: unknown): Compiled {
  if (!isRecord(raw)) return NEVER;
  if (!('condition' in raw)) return { check: stateCheck(raw), next: undefined, queries: [] };
  switch (raw['condition']) {
    case 'state':
      return { check: stateCheck(raw), next: undefined, queries: [] };
    case 'numeric_state':
      return { check: numericCheck(raw), next: undefined, queries: [] };
    case 'screen': {
      const query = typeof raw['media_query'] === 'string' ? raw['media_query'] : undefined;
      return query
        ? { check: (_hass, { matches }) => matches(query), next: undefined, queries: [query] }
        : NEVER;
    }
    case 'user': {
      const users = list(raw['users']).map(String);
      return {
        check: (hass) => hass.user?.id !== undefined && users.includes(hass.user.id),
        next: undefined,
        queries: [],
      };
    }
    case 'time': {
      const { check, next } = timeCheck(raw);
      return { check, next, queries: [] };
    }
    case 'location':
      return { check: locationCheck(raw), next: undefined, queries: [] };
    case 'and':
      return raw['conditions'] == null ? ALWAYS : all(list(raw['conditions']).map(compile));
    case 'or': {
      if (raw['conditions'] == null) return ALWAYS;
      const items = list(raw['conditions']).map(compile);
      const every = all(items);
      return {
        ...every,
        check: (hass, context) => items.some((item) => item.check(hass, context)),
      };
    }
    case 'not': {
      if (raw['conditions'] == null) return ALWAYS;
      const inner = all(list(raw['conditions']).map(compile));
      return { ...inner, check: (hass, context) => !inner.check(hass, context) };
    }
    default:
      return NEVER;
  }
}

/** A list of conditions, read once: all of them must hold. */
export function compileConditions(conditions: readonly VisibilityCondition[]): Conditions {
  const compiled = all(conditions.map(compile));
  return {
    test: compiled.check,
    next: (hass, now) => compiled.next?.(hass, now),
    queries: [...new Set(compiled.queries)],
  };
}

/** The screen as the browser says it (a page without `matchMedia`: no query holds). */
export const screenMatches = (query: string): boolean =>
  typeof matchMedia === 'function' && matchMedia(query).matches;
