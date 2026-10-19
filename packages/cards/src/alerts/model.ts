import {
  idsOf,
  listOf,
  type ActionConfig,
  type EntityEntry,
  type HomeAssistant,
  type LovelaceCardConfig,
  type MessageKey,
  type ServiceTarget,
} from '@fluvy/core';
import type { VisibilityCondition } from './conditions.js';
import { PRESETS, isPreset, type PresetName } from './presets.js';
import { isAlertTone, isSeverity, type AlertTone, type Severity } from './severity.js';
import { durationMs, type DurationConfig } from './time.js';

/*
 * One definition per alert drives everything the card shows of it: what it matches (the count, the list) and what
 * can be done about it (its row button, its actions, its snooze). A definition is read once per config: a preset is
 * resolved into its clauses and defaults, the alert's own keys narrow them, every value is checked (a mistake is one
 * readable error naming the alert), and the alert gets the key its snoozes are remembered by.
 *
 * The grammar. A clause is the AND of its keys; `match` takes one clause or a list of them (any matching). An alert
 * without a preset or `match` is one clause, its own keys. With either, the alert's own matcher keys narrow every
 * clause (the AND of both) — but those a preset reads as its parameters (`below` for low batteries) — and its
 * modifiers (`for`, `unchanged_for`, `include_unavailable`, `hidden`, `diagnostic`) are the default of every clause
 * that names none, before the preset's own.
 */

type OneOrMany<T> = T | readonly T[];

/** What a clause matches by: the AND of these keys. */
export interface MatchConfig {
  /** Exact ids. */
  readonly entity?: OneOrMany<string>;
  /** Exact ids, or objects naming one (as a filter hands them over). */
  readonly entities?: readonly EntityEntry[];
  /** Ids by pattern: `*` and `?` (`sensor.*_battery`), or a regular expression between slashes (`/^light\./i`). */
  readonly entity_id?: OneOrMany<string>;
  readonly domain?: OneOrMany<string>;
  readonly device_class?: OneOrMany<string>;
  /** The integration that provides the entity (the registry's platform: `zha`, `mobile_app`). */
  readonly integration?: OneOrMany<string>;
  /** An area or a floor, by id or name: the entity's own area, else its device's. */
  readonly area?: OneOrMany<string>;
  readonly floor?: OneOrMany<string>;
  /** A label id, on the entity, its device or its area (as Home Assistant's targets read a label). */
  readonly label?: OneOrMany<string>;
  /** A device, by id or by name (with `*` and `?`). */
  readonly device?: OneOrMany<string>;
  /** Never these: ids, patterns, or clauses. */
  readonly exclude?: OneOrMany<string | MatchConfig>;
  /** Hidden entities too (skipped otherwise). A config entity is always skipped; one named by its id never is. */
  readonly hidden?: boolean;
  /** Diagnostic entities too (kept unless false: a battery is often one). */
  readonly diagnostic?: boolean;
  /** The state is one of these (exact, as Home Assistant's state condition compares). */
  readonly state?: OneOrMany<string>;
  readonly not_state?: OneOrMany<string>;
  /** Strictly above / below (Home Assistant's numeric state): the state's number, or the attribute's. */
  readonly above?: number | string;
  readonly below?: number | string;
  /** An attribute: with `state`, `above` or `below` they compare it; alone, it must be there and truthy. */
  readonly attribute?: string;
  /** Matching for this long before it counts. */
  readonly for?: DurationConfig;
  /**
   * Neither its state nor its attributes changed for this long. Home Assistant's frontend never sees when an entity
   * last *reported* (`last_reported` is not in the states a browser receives): a sensor that keeps sending the same
   * value looks unchanged too. So this finds a value stuck for hours, not a sensor that went silent.
   */
  readonly unchanged_for?: DurationConfig;
  /** Unavailable and unknown states match too (they never do unless `state` names them or this is true). */
  readonly include_unavailable?: boolean;
}

/** The keys a clause matches by (the rest of an alert's keys say how it shows and what it does). */
export const MATCH_KEYS = [
  'entity',
  'entities',
  'entity_id',
  'domain',
  'device_class',
  'integration',
  'area',
  'floor',
  'label',
  'device',
  'state',
  'not_state',
  'above',
  'below',
  'attribute',
] as const satisfies readonly (keyof MatchConfig)[];

/** What a clause says about how it counts rather than what it matches: an alert's own are every clause's defaults. */
export const MODIFIER_KEYS = [
  'for',
  'unchanged_for',
  'include_unavailable',
  'hidden',
  'diagnostic',
] as const satisfies readonly (keyof MatchConfig)[];

export type CountBy = 'entity' | 'device';
export type NameBy = 'entity' | 'device' | 'area';
export type SortRows = 'duration' | 'value' | 'name' | 'area';

/**
 * A tap as an alert's buttons write it: Home Assistant's action, whose target (or `entity`) may say `matched` — every
 * entity the alert matches now — or `row` — the row's own.
 */
export interface AlertAction {
  readonly action: ActionConfig['action'];
  readonly target?: ServiceTarget | 'matched' | 'row';
  readonly entity?: string;
  /** The rest of Home Assistant's action, as it writes it (`perform_action`, `data`, `confirmation` …). */
  readonly [key: string]: unknown;
}

/** A button an alert offers: on each of its rows (`row_button`), or for the whole alert (`actions`). */
export interface AlertButton {
  /** Its words: the person's own, else a word of the catalogue (a preset's). */
  readonly name?: string;
  readonly words?: MessageKey;
  readonly icon?: string;
  readonly tap_action: AlertAction;
  /** Only for an administrator. */
  readonly admin_only?: boolean;
  /** On rows of these domains only (a cover's Close among doors and windows). */
  readonly domains?: readonly string[];
  /** Only while the row's update can be installed from here (it supports Install and is not running already). */
  readonly when?: 'installable';
}

/** Raises an alert once it has lasted, or once it counts this many: a door open 5 min is a warning, at 30 critical. */
export interface EscalateConfig {
  readonly for?: DurationConfig;
  readonly count?: number;
  /** To this severity (critical unless said). */
  readonly severity?: Severity;
}

/** An alert as a config writes it. */
export interface AlertConfig extends MatchConfig {
  readonly preset?: PresetName;
  /** The key its snoozes are remembered by (else one made of what it matches). */
  readonly id?: string;
  readonly name?: string;
  readonly icon?: string;
  /** How much it matters: the order and the tone (warning unless said). */
  readonly severity?: Severity;
  /** A tone by name: outranks the severity's. */
  readonly tone?: AlertTone;
  /** The alert's own colour: its identity (circle, rest wash), never the severity's fill. */
  readonly color?: string;
  readonly match?: OneOrMany<MatchConfig>;
  /** What the count counts: entities, or the devices they belong to (a dead node is one device). */
  readonly count_by?: CountBy;
  /** It shows from this count up (1). */
  readonly min_count?: number;
  /** One alert per matched entity (each firing Home Assistant alert its own tile). */
  readonly split?: boolean;
  readonly escalate?: EscalateConfig;
  /** When it applies at all: Home Assistant's visibility conditions (state, numeric state, user, screen, time, location, and, or, not). */
  readonly conditions?: readonly VisibilityCondition[];
  readonly admin_only?: boolean;
  readonly tap_action?: AlertAction;
  readonly hold_action?: AlertAction;
  readonly row_action?: AlertAction;
  readonly row_hold_action?: AlertAction;
  /** A button on each row; `false` takes a preset's away. */
  readonly row_button?: AlertButton | false;
  readonly actions?: readonly AlertButton[];
  /** A row's name: the entity's, its device's or its area's. */
  readonly name_by?: NameBy;
  readonly sort_rows?: SortRows;
  /** Whether it may be snoozed (true). */
  readonly snooze?: boolean;
  /** Low batteries: phones too (they cross 20 % every day; left out unless asked). */
  readonly phones?: boolean;
  /** Home Assistant's alerts: the acknowledged ones too. */
  readonly acknowledged?: boolean;
}

/** Where an alert's rows come from: the house's states, or a source the card reads for it (Home Assistant's repairs). */
export type AlertSource = 'states' | 'repairs';

/** One clause, resolved: all of its parts must hold (the alert's own keys narrowing a preset's or a `match`'s). */
export interface ClauseSpec {
  readonly parts: readonly MatchConfig[];
  readonly forMs: number;
  readonly unchangedMs: number | undefined;
  readonly includeUnavailable: boolean;
  readonly hidden: boolean;
  readonly diagnostic: boolean;
}

export interface Escalation {
  readonly forMs: number | undefined;
  readonly count: number | undefined;
  readonly severity: Severity;
}

/** A check a preset makes that reads other entities (a battery's charger), and which ones, so a change of them tests again. */
export interface PresetCheck {
  test(hass: HomeAssistant, id: string): boolean;
  reads(hass: HomeAssistant, id: string): readonly string[];
}

/** An alert, read: what drives its count, its list and its actions. */
export interface AlertDefinition {
  /** What its snoozes and acknowledgements are remembered by: `id`, else the preset and a hash of what it matches. */
  readonly key: string;
  /** Its place in the config. */
  readonly index: number;
  readonly config: AlertConfig;
  readonly preset: PresetName | undefined;
  readonly source: AlertSource;
  /** The person's name for it; without one, `title` is said. */
  readonly name: string | undefined;
  readonly title: MessageKey | undefined;
  readonly icon: string;
  readonly severity: Severity;
  readonly tone: AlertTone | undefined;
  readonly color: string | undefined;
  /** Any of these matching: the entity matches. */
  readonly clauses: readonly ClauseSpec[];
  /** Never these. */
  readonly exclude: readonly (string | MatchConfig)[];
  readonly check: PresetCheck | undefined;
  readonly countBy: CountBy;
  readonly minCount: number;
  readonly split: boolean;
  readonly escalate: Escalation | undefined;
  readonly conditions: readonly VisibilityCondition[];
  readonly adminOnly: boolean;
  readonly nameBy: NameBy;
  readonly sortRows: SortRows;
  readonly snooze: boolean;
  readonly rowButton: AlertButton | undefined;
  readonly actions: readonly AlertButton[];
  readonly tapAction: AlertAction | undefined;
  readonly holdAction: AlertAction | undefined;
  readonly rowAction: AlertAction | undefined;
  readonly rowHoldAction: AlertAction | undefined;
}

const COUNT_BY: readonly CountBy[] = ['entity', 'device'];
const NAME_BY: readonly NameBy[] = ['entity', 'device', 'area'];
const SORT_ROWS: readonly SortRows[] = ['duration', 'value', 'name', 'area'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A config's one-or-many as a list. */
export const many = <T>(value: OneOrMany<T> | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? (value as readonly T[]) : [value as T];

/** JSON with every object's keys in order: two configs compare by what they say, not how they were typed. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );

/** FNV-1a, 32 bits, in base 36: a short, stable name for a text. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The key an alert's snoozes and acknowledgements are remembered by: its `id`, else its preset (or `custom`) and a
 * hash of what it matches — its preset's parameters, its matcher keys, `match` and `exclude` — so renaming it,
 * recolouring it or giving it actions keeps its snoozes, and matching something else starts afresh.
 */
export function alertKey(config: AlertConfig): string {
  if (typeof config.id === 'string' && config.id.trim()) return config.id.trim();
  const preset = config.preset && isPreset(config.preset) ? config.preset : undefined;
  const keys = new Set<string>([
    ...MATCH_KEYS,
    ...MODIFIER_KEYS,
    'match',
    'exclude',
    ...(preset ? (PRESETS[preset].params ?? []) : []),
  ]);
  const matcher = Object.fromEntries(
    Object.entries(config).filter(([key, value]) => keys.has(key) && value !== undefined),
  );
  return `${preset ?? 'custom'}:${hash(canonical(matcher))}`;
}

/** A mistake in one alert: said once, with the card and the alert it is in. */
class AlertProblem extends Error {
  constructor(card: string, index: number, text: string) {
    super(`${card}: alerts[${index}]: ${text}`);
  }
}

/** A clause's modifiers: its own, else the alert's, else the preset's, else none. */
function modifiers(
  clause: MatchConfig,
  own: AlertConfig,
  fallback: MatchConfig,
  problem: (text: string) => AlertProblem,
): Omit<ClauseSpec, 'parts'> {
  const pick = <K extends (typeof MODIFIER_KEYS)[number]>(key: K): MatchConfig[K] =>
    clause[key] ?? own[key] ?? fallback[key];
  const span = (key: 'for' | 'unchanged_for'): number | undefined => {
    const value = pick(key);
    if (value === undefined) return undefined;
    const ms = durationMs(value);
    if (ms === undefined)
      throw problem(`"${key}" is not a duration (seconds, "HH:MM:SS" or {minutes: 5})`);
    return ms;
  };
  return {
    forMs: span('for') ?? 0,
    unchangedMs: span('unchanged_for'),
    includeUnavailable: pick('include_unavailable') === true,
    hidden: pick('hidden') === true,
    diagnostic: pick('diagnostic') !== false,
  };
}

/** The matcher keys of an alert's own config (its parameters and modifiers left out): what narrows every clause. */
function narrowing(config: AlertConfig, params: readonly string[]): MatchConfig | undefined {
  const own = Object.fromEntries(
    MATCH_KEYS.filter((key) => config[key] !== undefined && !params.includes(key)).map((key) => [
      key,
      config[key],
    ]),
  );
  return Object.keys(own).length ? (own as MatchConfig) : undefined;
}

/** A number a config wrote as a number or as its digits; undefined when absent, NaN when it is not one. */
const numeric = (value: unknown): number | undefined =>
  value === undefined
    ? undefined
    : typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;

/** The checks every clause's own values pass: numbers that are numbers, patterns that compile. */
function checkClause(clause: MatchConfig, problem: (text: string) => AlertProblem): void {
  for (const key of ['above', 'below'] as const) {
    const value = numeric(clause[key]);
    if (value !== undefined && !Number.isFinite(value)) throw problem(`"${key}" must be a number`);
  }
  for (const pattern of many(clause.entity_id))
    if (typeof pattern !== 'string') throw problem('"entity_id" takes ids or patterns');
    else if (/^\/.*\/[a-z]*$/.test(pattern))
      try {
        const end = pattern.lastIndexOf('/');
        new RegExp(pattern.slice(1, end), pattern.slice(end + 1));
      } catch {
        throw problem(`"${pattern}" is not a regular expression`);
      }
  if (clause.entities !== undefined && !Array.isArray(clause.entities))
    throw problem('"entities" must be a list');
  for (const excluded of many(clause.exclude))
    if (isRecord(excluded)) checkClause(excluded as MatchConfig, problem);
    else if (typeof excluded !== 'string')
      throw problem('"exclude" takes ids, patterns or clauses');
}

const oneOf = <T extends string>(
  value: unknown,
  choices: readonly T[],
  key: string,
  problem: (text: string) => AlertProblem,
): T | undefined => {
  if (value === undefined) return undefined;
  if ((choices as readonly unknown[]).includes(value)) return value as T;
  throw problem(`"${key}" must be ${choices.slice(0, -1).join(', ')} or ${choices.at(-1)}`);
};

/** An escalation as written, read. */
function escalationOf(
  raw: unknown,
  problem: (text: string) => AlertProblem,
): Escalation | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw problem('"escalate" takes for, count and severity');
  const forMs = raw['for'] === undefined ? undefined : durationMs(raw['for']);
  if (raw['for'] !== undefined && forMs === undefined)
    throw problem('"escalate.for" is not a duration');
  const count = raw['count'];
  if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 1))
    throw problem('"escalate.count" must be a whole number, 1 or more');
  if (forMs === undefined && count === undefined)
    throw problem('"escalate" needs a "for", a "count" or both');
  const severity = raw['severity'] ?? 'critical';
  if (!isSeverity(severity)) throw problem('"escalate.severity" must be info, warning or critical');
  return { forMs, count, severity };
}

/** One alert, read. */
export function definitionOf(raw: unknown, index: number, card: string): AlertDefinition {
  const problem = (text: string): AlertProblem => new AlertProblem(card, index, text);
  if (!isRecord(raw)) throw problem('an alert is a set of keys (preset, entity, state …)');
  const config = raw as AlertConfig;
  if (config.preset !== undefined && !isPreset(config.preset))
    throw problem(`unknown preset "${String(config.preset)}" (${Object.keys(PRESETS).join(', ')})`);
  const preset = config.preset ? PRESETS[config.preset] : undefined;
  const params = preset?.params ?? [];
  const defaults: AlertConfig = preset?.defaults ?? {};

  if (config.severity !== undefined && !isSeverity(config.severity))
    throw problem('"severity" must be info, warning or critical');
  if (config.tone !== undefined && !isAlertTone(config.tone))
    throw problem(`unknown tone "${String(config.tone)}"`);
  const minCount = config.min_count ?? 1;
  if (!Number.isInteger(minCount) || minCount < 1)
    throw problem('"min_count" must be a whole number, 1 or more');
  if (config.conditions !== undefined && !Array.isArray(config.conditions))
    throw problem('"conditions" must be a list');
  if (config.actions !== undefined && !Array.isArray(config.actions))
    throw problem('"actions" must be a list');
  if (config.match !== undefined && !isRecord(config.match) && !Array.isArray(config.match))
    throw problem('"match" takes a clause or a list of clauses');

  // the clauses: the preset's, else `match`'s, else the alert's own matcher keys as the one clause
  const shorthand = !preset && config.match === undefined;
  const own = narrowing(config, shorthand ? [] : params);
  if (shorthand && !own)
    throw problem('give it a preset, or what it matches (entity, domain, device_class, state …)');
  const given: readonly MatchConfig[] = preset
    ? preset.clauses(config)
    : own && shorthand
      ? [own]
      : many(config.match);
  for (const clause of given)
    if (!isRecord(clause)) throw problem('a clause of "match" is a set of keys');
    else checkClause(clause, problem);
  checkClause(config, problem);
  for (const button of [
    ...(config.row_button ? [config.row_button] : []),
    ...(config.actions ?? []),
  ])
    if (!isRecord(button) || !isRecord(button.tap_action))
      throw problem('a button (row_button, actions) needs a tap_action');
  const clauses = given.map((clause): ClauseSpec => ({
    parts: own && !shorthand ? [own, clause] : [clause],
    ...modifiers(shorthand ? {} : clause, config, defaults, problem),
  }));

  const rowButton =
    config.row_button === false ? undefined : (config.row_button ?? defaults.row_button);
  return {
    key: alertKey(config),
    index,
    config,
    preset: config.preset,
    source: preset?.source ?? 'states',
    name: typeof config.name === 'string' && config.name.trim() ? config.name : undefined,
    title: preset?.title,
    icon: config.icon ?? preset?.icon ?? 'warn',
    severity: config.severity ?? preset?.severity ?? 'warning',
    tone: config.tone,
    color: config.color,
    clauses: preset?.source ? [] : clauses,
    exclude: [...many(config.exclude), ...(preset?.exclude?.(config) ?? [])],
    check: preset?.check,
    countBy: oneOf(config.count_by, COUNT_BY, 'count_by', problem) ?? defaults.count_by ?? 'entity',
    minCount,
    split: config.split ?? defaults.split ?? false,
    escalate: escalationOf(config.escalate, problem),
    conditions: config.conditions ?? [],
    adminOnly: config.admin_only ?? defaults.admin_only ?? false,
    nameBy: oneOf(config.name_by, NAME_BY, 'name_by', problem) ?? defaults.name_by ?? 'entity',
    sortRows:
      oneOf(config.sort_rows, SORT_ROWS, 'sort_rows', problem) ?? defaults.sort_rows ?? 'duration',
    snooze: config.snooze !== false,
    rowButton: rowButton || undefined,
    actions: config.actions ?? defaults.actions ?? [],
    tapAction: config.tap_action ?? defaults.tap_action,
    holdAction: config.hold_action ?? defaults.hold_action,
    rowAction: config.row_action ?? defaults.row_action,
    rowHoldAction: config.row_hold_action ?? defaults.row_hold_action,
  };
}

/**
 * A card's alerts, read: [] when it has none (an empty list is a list), one readable error for a list that is not
 * one or an alert that cannot be read. Two alerts with the same key would share their snoozes: the later one's key
 * takes its place in the list after it (`#2`).
 */
export function definitionsOf(config: LovelaceCardConfig, key = 'alerts'): AlertDefinition[] {
  const card = config.type.replace(/^custom:/, '');
  const seen = new Map<string, number>();
  return listOf(config, key).map((raw, index) => {
    const definition = definitionOf(raw, index, card);
    const twins = seen.get(definition.key) ?? 0;
    seen.set(definition.key, twins + 1);
    return twins ? { ...definition, key: `${definition.key}#${twins + 1}` } : definition;
  });
}

/** The ids a clause names exactly (`entity`, `entities`): a config entity is matched only when named so. */
export const namedIds = (clause: MatchConfig): string[] => [
  ...many(clause.entity),
  ...idsOf(clause.entities),
];
