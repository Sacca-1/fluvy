import { isTimeZone, wallClock } from '@fluvy/core';

/**
 * A schedule as Fluvy writes it into Home Assistant: a native automation of a stable shape, with an id of its own
 * (`fluvy_` and twelve hex digits), which Home Assistant's editor shows and edits like any other. The card reads
 * every automation of the house; the ones that parse strictly as this shape are schedules, the rest are plain rows.
 * Nothing here touches the socket: `buildAutomation` says what to write, `parseAutomation` what was read, and the
 * store (`store.ts`) carries them to and from Home Assistant.
 *
 * The shape: `id`, `alias`, an optional `description`, `mode: single`; one or two triggers with ids `start` and
 * `end` (a time of day, or sunrise or sunset with an offset in whole minutes); the days as one condition, a weekday
 * list or the workday sensor's state, never on the trigger; and the steps, one per domain in alphabetical order,
 * with `brightness_pct` for a light and `temperature` for a thermostat as the only data. A lone moment keeps its
 * day condition at the top and its steps as the actions; a window (a start and an end) keeps a single `choose` with
 * one branch per trigger, each with its trigger condition and its day condition.
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WORKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WEEKEND: readonly Weekday[] = ['sat', 'sun'];

/** The days a schedule runs: every day, the workdays or the weekend (by the house's workday sensor when it has one, else by the weekday), or a list of the user's own. */
export type Days =
  | { kind: 'every' }
  | { kind: 'workdays'; sensor?: string }
  | { kind: 'weekend'; sensor?: string }
  | { kind: 'custom'; days: readonly Weekday[] };

export type SunEvent = 'sunrise' | 'sunset';

/** A moment of the day: a time on the clock ('HH:MM'), or sunrise or sunset with an offset in whole minutes. */
export type Moment =
  { kind: 'time'; at: string } | { kind: 'sun'; event: SunEvent; offset: number };

export type Verb = 'on' | 'off' | 'open' | 'close' | 'run';

/** What the schedule does: the verb, with a brightness for a light turned on, a target for a thermostat turned on. */
export interface Doing {
  verb: Verb;
  /** Brightness in percent, 1–100, for a light turned on. */
  level?: number;
  /** The thermostat's target, in the house's unit, for a thermostat turned on. */
  temperature?: number;
}

export interface Schedule {
  id: string;
  alias: string;
  description?: string;
  targets: readonly string[];
  days: Days;
  start: Moment;
  /** The end of a window: the schedule does `after` (the opposite of `then` when unsaid) at that moment. */
  end?: Moment;
  then: Doing;
  after?: Doing;
}

/* ---------- the automation as Home Assistant keeps it ---------- */

export type TriggerId = 'start' | 'end';

export interface TimeTrigger {
  trigger: 'time';
  /** 'HH:MM:00'. */
  at: string;
  id: TriggerId;
}

export interface SunTrigger {
  trigger: 'sun';
  event: SunEvent;
  /** '-00:30:00', '01:15:00'. */
  offset: string;
  id: TriggerId;
}

export type Trigger = TimeTrigger | SunTrigger;

export interface WeekdayCondition {
  condition: 'time';
  weekday: readonly Weekday[];
}

export interface SensorCondition {
  condition: 'state';
  entity_id: string;
  state: 'on' | 'off';
}

export interface TriggerCondition {
  condition: 'trigger';
  id: TriggerId;
}

export type Condition = WeekdayCondition | SensorCondition | TriggerCondition;

export interface StepData {
  brightness_pct?: number;
  temperature?: number;
  skip_condition?: true;
}

export interface ServiceStep {
  action: string;
  target: { entity_id: readonly string[] };
  data?: StepData;
}

export interface Branch {
  conditions: readonly Condition[];
  sequence: readonly ServiceStep[];
}

export interface ChooseStep {
  choose: readonly Branch[];
}

export type Step = ServiceStep | ChooseStep;

export interface AutomationConfig {
  id: string;
  alias: string;
  description?: string;
  triggers: readonly Trigger[];
  conditions: readonly Condition[];
  actions: readonly Step[];
  mode: 'single';
}

export const SCHEDULE_ID = /^fluvy_[0-9a-f]{12}$/;

export type ScheduleProblem =
  | 'no_targets'
  | 'mixed_domains'
  | 'bad_time'
  | 'bad_offset'
  | 'no_days'
  | 'run_with_end'
  | 'level_without_light'
  | 'temperature_without_climate';

/** What `buildAutomation` throws: the problem `checkSchedule` found, as its code. */
export class ScheduleError extends Error {
  constructor(readonly problem: ScheduleProblem) {
    super(problem);
    this.name = 'ScheduleError';
  }
}

/* ---------- the verbs ---------- */

/** The verbs in the order the sheet offers them. */
export const VERB_ORDER: readonly Verb[] = ['on', 'off', 'open', 'close', 'run'];

const onOff = (domain: string): Readonly<Partial<Record<Verb, string>>> => ({
  on: `${domain}.turn_on`,
  off: `${domain}.turn_off`,
});

/** Domain → verb → the service that does it: what a schedule may target, and how. */
export const VERBS: Readonly<Record<string, Readonly<Partial<Record<Verb, string>>>>> = {
  light: onOff('light'),
  switch: onOff('switch'),
  fan: onOff('fan'),
  input_boolean: onOff('input_boolean'),
  media_player: onOff('media_player'),
  humidifier: onOff('humidifier'),
  siren: onOff('siren'),
  climate: onOff('climate'),
  cover: { open: 'cover.open_cover', close: 'cover.close_cover' },
  valve: { open: 'valve.open_valve', close: 'valve.close_valve' },
  scene: { run: 'scene.turn_on' },
  script: { run: 'script.turn_on' },
  automation: { run: 'automation.trigger' },
  button: { run: 'button.press' },
  input_button: { run: 'input_button.press' },
};

/** The verb an end does when the schedule does not say: on ↔ off, open ↔ close; a run has none. */
export const OPPOSITE: Readonly<Record<Verb, Verb | undefined>> = {
  on: 'off',
  off: 'on',
  open: 'close',
  close: 'open',
  run: undefined,
};

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const isEntityId = (id: unknown): id is string => typeof id === 'string' && ENTITY_ID.test(id);
const domainOf = (id: string): string => id.slice(0, id.indexOf('.'));

/** The domains of those targets, each once, in alphabetical order. */
export function domainsOf(targets: readonly string[]): readonly string[] {
  return [...new Set(targets.filter(isEntityId).map(domainOf))].sort();
}

/** The verbs every one of those domains has, in the sheet's order; none for no domains or a domain outside the table. */
export function verbsFor(domains: readonly string[]): readonly Verb[] {
  if (!domains.length) return [];
  return VERB_ORDER.filter((verb) => domains.every((domain) => VERBS[domain]?.[verb]));
}

/** The service a step names, as domain and verb; `homeassistant.turn_on` and `turn_off` serve any domain of the table. */
function verbOf(service: string, domain: string): Verb | undefined {
  if (service === 'homeassistant.turn_on') return VERBS[domain]?.on ? 'on' : undefined;
  if (service === 'homeassistant.turn_off') return VERBS[domain]?.off ? 'off' : undefined;
  const verbs = VERBS[domain];
  if (!verbs) return undefined;
  return VERB_ORDER.find((verb) => verbs[verb] === service);
}

/* ---------- moments ---------- */

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MINUTES = 24 * 60;
const DAY_MS = DAY_MINUTES * 60_000;
/** Where sunrise and sunset sit on a nominal clock, to tell a window that crosses midnight from one that does not. */
const NOMINAL_SUN: Readonly<Record<SunEvent, number>> = { sunrise: 7 * 60, sunset: 19 * 60 };

const minutesOf = (at: string): number => {
  const [h = '0', m = '0'] = at.split(':');
  return Number(h) * 60 + Number(m);
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** An offset in minutes as Home Assistant writes it: '-00:30:00', '01:15:00'. */
export function offsetText(minutes: number): string {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : ''}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}:00`;
}

/** Where a moment sits on a nominal day, in minutes: a sun moment by its nominal hour, so two moments can be ordered without the sky. */
const nominal = (m: Moment): number =>
  m.kind === 'time' ? minutesOf(m.at) : NOMINAL_SUN[m.event] + m.offset;

/**
 * Whether a window ends on the day after it starts: a clock end at or before its clock start ("22:00 until 02:00",
 * "until tomorrow"); with a sun moment, judged on a nominal clock (sunrise at 07:00, sunset at 19:00), a stated
 * approximation. The end branch's days shift by one when it does.
 */
export function crossesMidnight(start: Moment, end: Moment): boolean {
  return nominal(end) <= nominal(start);
}

const problemOf = (m: Moment): ScheduleProblem | undefined =>
  m.kind === 'time'
    ? CLOCK.test(m.at)
      ? undefined
      : 'bad_time'
    : Number.isInteger(m.offset) && Math.abs(m.offset) < DAY_MINUTES
      ? undefined
      : 'bad_offset';

/* ---------- days ---------- */

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item, i) => item === b[i]);
const sameDays = sameList<Weekday>;

/** The valid days of a list, each once, in the week's order. */
const orderedDays = (days: readonly string[]): Weekday[] =>
  WEEKDAYS.filter((day) => days.includes(day));

/** The same days a day later: the end of a window that crosses midnight. */
const shifted = (days: readonly Weekday[]): Weekday[] =>
  orderedDays(days.map((day) => WEEKDAYS[(WEEKDAYS.indexOf(day) + 1) % 7] as Weekday));

/** The weekday list a schedule's days mean, when they mean one (a sensor and every day mean none). */
function weekdaysOf(days: Days): readonly Weekday[] | undefined {
  switch (days.kind) {
    case 'every':
      return undefined;
    case 'workdays':
      return days.sensor ? undefined : WORKDAYS;
    case 'weekend':
      return days.sensor ? undefined : WEEKEND;
    case 'custom':
      return orderedDays(days.days);
  }
}

/** A weekday list as days: all seven are every day, Monday to Friday the workdays, Saturday and Sunday the weekend. */
function daysOfList(list: readonly Weekday[]): Days {
  if (list.length === 7) return { kind: 'every' };
  if (sameDays(list, WORKDAYS)) return { kind: 'workdays' };
  if (sameDays(list, WEEKEND)) return { kind: 'weekend' };
  return { kind: 'custom', days: list };
}

/** The one day condition a schedule's days write; none for every day. */
function dayCondition(days: Days): WeekdayCondition | SensorCondition | undefined {
  if (days.kind === 'every') return undefined;
  if ((days.kind === 'workdays' || days.kind === 'weekend') && days.sensor)
    return {
      condition: 'state',
      entity_id: days.sensor,
      state: days.kind === 'workdays' ? 'on' : 'off',
    };
  const list = weekdaysOf(days);
  return list?.length ? { condition: 'time', weekday: list } : undefined;
}

/**
 * The days the end of a window runs on: the start's own while the window ends the same day; a day later when it
 * crosses midnight, and then a sensor says nothing about yesterday, so a sensor window ends every day (an off is
 * idempotent).
 */
export function endDays(days: Days, crossing: boolean): Days {
  if (!crossing || days.kind === 'every') return days;
  const list = weekdaysOf(days);
  if (!list) return { kind: 'every' };
  return daysOfList(shifted(list));
}

/* ---------- checking and building ---------- */

/** The first thing wrong with a schedule, or nothing: what `buildAutomation` refuses. */
export function checkSchedule(s: Schedule): ScheduleProblem | undefined {
  if (!s.targets.length || !s.targets.every(isEntityId)) return 'no_targets';
  const domains = domainsOf(s.targets);
  const verbs = verbsFor(domains);
  if (!verbs.includes(s.then.verb)) return 'mixed_domains';
  const start = problemOf(s.start);
  if (start) return start;
  if (s.end) {
    const end = problemOf(s.end);
    if (end) return end;
  }
  if (s.days.kind === 'custom' && !orderedDays(s.days.days).length) return 'no_days';
  if (s.end && (s.then.verb === 'run' || s.after?.verb === 'run')) return 'run_with_end';
  if (s.end && s.after && !verbs.includes(s.after.verb)) return 'mixed_domains';
  for (const doing of s.end && s.after ? [s.then, s.after] : [s.then]) {
    if (
      doing.level !== undefined &&
      (doing.verb !== 'on' || !domains.includes('light') || !Number.isFinite(doing.level))
    )
      return 'level_without_light';
    if (
      doing.temperature !== undefined &&
      (doing.verb !== 'on' || !domains.includes('climate') || !Number.isFinite(doing.temperature))
    )
      return 'temperature_without_climate';
  }
  return undefined;
}

const clampLevel = (level: number): number => Math.min(100, Math.max(1, Math.round(level)));
const roundTemperature = (t: number): number => Math.round(t * 10) / 10;

/** The steps a doing writes for those targets: one per domain, alphabetical; a thermostat turned on to a target takes two. */
function stepsOf(targets: readonly string[], doing: Doing): ServiceStep[] {
  const steps: ServiceStep[] = [];
  for (const domain of domainsOf(targets)) {
    const action = VERBS[domain]?.[doing.verb];
    if (!action) continue;
    const target = { entity_id: targets.filter((id) => domainOf(id) === domain) };
    if (domain === 'light' && doing.verb === 'on' && doing.level !== undefined)
      steps.push({ action, target, data: { brightness_pct: clampLevel(doing.level) } });
    else if (domain === 'automation')
      steps.push({ action, target, data: { skip_condition: true } });
    else steps.push({ action, target });
    if (domain === 'climate' && doing.verb === 'on' && doing.temperature !== undefined)
      steps.push({
        action: 'climate.set_temperature',
        target,
        data: { temperature: roundTemperature(doing.temperature) },
      });
  }
  return steps;
}

function triggerOf(m: Moment, id: TriggerId): Trigger {
  return m.kind === 'time'
    ? { trigger: 'time', at: `${m.at}:00`, id }
    : { trigger: 'sun', event: m.event, offset: offsetText(m.offset), id };
}

/**
 * The automation a schedule writes. `workday` is the house's workday sensor: the workdays and the weekend take it
 * when the schedule names none of its own. Throws a `ScheduleError` with what `checkSchedule` found.
 */
export function buildAutomation(s: Schedule, workday?: string): AutomationConfig {
  const problem = checkSchedule(s);
  if (problem) throw new ScheduleError(problem);
  const days: Days =
    (s.days.kind === 'workdays' || s.days.kind === 'weekend') && !s.days.sensor && workday
      ? { kind: s.days.kind, sensor: workday }
      : s.days;
  const description = s.description?.trim();
  const head = {
    id: s.id,
    alias: sanitiseAlias(s.alias),
    ...(description ? { description } : {}),
  };
  const day = dayCondition(days);
  if (!s.end)
    return {
      ...head,
      triggers: [triggerOf(s.start, 'start')],
      conditions: day ? [day] : [],
      actions: stepsOf(s.targets, s.then),
      mode: 'single',
    };
  const after: Doing = s.after ?? { verb: OPPOSITE[s.then.verb] ?? 'off' };
  const endDay = dayCondition(endDays(days, crossesMidnight(s.start, s.end)));
  return {
    ...head,
    triggers: [triggerOf(s.start, 'start'), triggerOf(s.end, 'end')],
    conditions: [],
    actions: [
      {
        choose: [
          {
            conditions: [{ condition: 'trigger', id: 'start' }, ...(day ? [day] : [])],
            sequence: stepsOf(s.targets, s.then),
          },
          {
            conditions: [{ condition: 'trigger', id: 'end' }, ...(endDay ? [endDay] : [])],
            sequence: stepsOf(s.targets, after),
          },
        ],
      },
    ],
    mode: 'single',
  };
}

/* ---------- parsing ---------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A value Home Assistant may keep as one or as a list: as a list. */
const listOf = (value: unknown): readonly unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const keysWithin = (record: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(record).every((key) => allowed.includes(key));

/** `metadata: {}` is what Home Assistant's editor leaves on a step or a trigger: nothing. */
const emptyMetadata = (record: Record<string, unknown>): boolean =>
  record['metadata'] === undefined ||
  (isRecord(record['metadata']) && Object.keys(record['metadata']).length === 0);

/** A clock time as Home Assistant accepts it ('9:00', '09:00:00'), as 'HH:MM'; seconds other than zero are not a schedule's. */
function parseClock(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59 || (match[3] !== undefined && match[3] !== '00')) return undefined;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** A sun offset as Home Assistant accepts it ('-00:30:00', '-0:30', seconds as a number or a string, a dict), in whole minutes. */
function parseOffset(value: unknown): number | undefined {
  let seconds: number | undefined;
  if (typeof value === 'number') seconds = value;
  else if (typeof value === 'string') {
    const text = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(text)) seconds = Number(text);
    else {
      const match = /^([+-]?)(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(text);
      if (!match) return undefined;
      const sign = match[1] === '-' ? -1 : 1;
      seconds = sign * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? '0'));
    }
  } else if (isRecord(value)) {
    if (!keysWithin(value, ['days', 'hours', 'minutes', 'seconds', 'milliseconds']))
      return undefined;
    const part = (key: string): number => {
      const raw = value[key];
      return raw === undefined ? 0 : typeof raw === 'number' ? raw : Number.NaN;
    };
    seconds =
      part('days') * 86_400 +
      part('hours') * 3600 +
      part('minutes') * 60 +
      part('seconds') +
      part('milliseconds') / 1000;
  } else return undefined;
  if (!Number.isFinite(seconds) || seconds % 60 !== 0) return undefined;
  const minutes = seconds / 60;
  return Math.abs(minutes) < DAY_MINUTES ? minutes : undefined;
}

function parseTrigger(raw: unknown, id: TriggerId): Moment | undefined {
  if (!isRecord(raw)) return undefined;
  if (!keysWithin(raw, ['trigger', 'platform', 'at', 'event', 'offset', 'id', 'metadata']))
    return undefined;
  if (!emptyMetadata(raw)) return undefined;
  if (raw['id'] !== id) return undefined;
  const kind = raw['trigger'] ?? raw['platform'];
  if (
    raw['trigger'] !== undefined &&
    raw['platform'] !== undefined &&
    raw['trigger'] !== raw['platform']
  )
    return undefined;
  if (kind === 'time') {
    if (raw['event'] !== undefined || raw['offset'] !== undefined) return undefined;
    const at = parseClock(raw['at']);
    return at ? { kind: 'time', at } : undefined;
  }
  if (kind === 'sun') {
    if (raw['at'] !== undefined) return undefined;
    const event = raw['event'];
    if (event !== 'sunrise' && event !== 'sunset') return undefined;
    const offset = raw['offset'] === undefined ? 0 : parseOffset(raw['offset']);
    return offset === undefined ? undefined : { kind: 'sun', event, offset };
  }
  return undefined;
}

/** A day condition as the schedule means it, or nothing when the condition is not one of the two the shape has. */
function parseDayCondition(raw: unknown): Days | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw['condition'] === 'time') {
    if (!keysWithin(raw, ['condition', 'weekday'])) return undefined;
    const list = listOf(raw['weekday']);
    if (
      !list.length ||
      !list.every((day) => typeof day === 'string' && (WEEKDAYS as readonly string[]).includes(day))
    )
      return undefined;
    return daysOfList(orderedDays(list as string[]));
  }
  if (raw['condition'] === 'state') {
    if (!keysWithin(raw, ['condition', 'entity_id', 'state'])) return undefined;
    const ids = listOf(raw['entity_id']);
    const sensor = ids[0];
    if (ids.length !== 1 || !isEntityId(sensor) || domainOf(sensor) !== 'binary_sensor')
      return undefined;
    const states = listOf(raw['state']);
    if (states.length !== 1) return undefined;
    if (states[0] === 'on') return { kind: 'workdays', sensor };
    if (states[0] === 'off') return { kind: 'weekend', sensor };
  }
  return undefined;
}

function sameSchedule(a: Days, b: Days): boolean {
  if (a.kind === 'custom' || b.kind === 'custom')
    return a.kind === 'custom' && b.kind === 'custom' && sameDays(a.days, b.days);
  if (a.kind === 'every' || b.kind === 'every') return a.kind === b.kind;
  return a.kind === b.kind && a.sensor === b.sensor;
}

const isLevel = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;

/** One step as read: its targets, and what it does to them. A `climate.set_temperature` carries the target alone. */
interface ReadStep {
  service: string;
  verb: Verb | undefined;
  targets: readonly string[];
  level?: number;
  temperature?: number;
}

function parseStep(raw: unknown): ReadStep | undefined {
  if (!isRecord(raw)) return undefined;
  if (!keysWithin(raw, ['action', 'service', 'target', 'data', 'entity_id', 'metadata']))
    return undefined;
  if (!emptyMetadata(raw)) return undefined;
  const service = raw['action'] ?? raw['service'];
  if (typeof service !== 'string' || !isEntityId(service)) return undefined;
  if (
    raw['action'] !== undefined &&
    raw['service'] !== undefined &&
    raw['action'] !== raw['service']
  )
    return undefined;
  const target = raw['target'];
  if (target !== undefined && (!isRecord(target) || !keysWithin(target, ['entity_id'])))
    return undefined;
  const data = raw['data'];
  if (
    data !== undefined &&
    (!isRecord(data) ||
      !keysWithin(data, ['brightness_pct', 'temperature', 'skip_condition', 'entity_id']))
  )
    return undefined;
  const targets = [
    ...listOf(isRecord(target) ? target['entity_id'] : undefined),
    ...listOf(raw['entity_id']),
    ...listOf(isRecord(data) ? data['entity_id'] : undefined),
  ];
  if (!targets.length || !targets.every(isEntityId)) return undefined;
  if (new Set(targets).size !== targets.length) return undefined;
  const domains = domainsOf(targets);
  const own = domainOf(service);
  if (own !== 'homeassistant' && (domains.length !== 1 || domains[0] !== own)) return undefined;
  const step: ReadStep = { service, verb: undefined, targets };
  const level = isRecord(data) ? data['brightness_pct'] : undefined;
  const temperature = isRecord(data) ? data['temperature'] : undefined;
  const skip = isRecord(data) ? data['skip_condition'] : undefined;
  if (service === 'climate.set_temperature') {
    if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return undefined;
    if (level !== undefined || skip !== undefined) return undefined;
    step.temperature = temperature;
    return step;
  }
  const verbs = domains.map((domain) => verbOf(service, domain));
  const verb = verbs[0];
  if (!verb || verbs.some((other) => other !== verb)) return undefined;
  step.verb = verb;
  if (temperature !== undefined) return undefined;
  if (level !== undefined) {
    if (service !== 'light.turn_on' || !isLevel(level)) return undefined;
    step.level = level;
  }
  if (skip !== undefined && (service !== 'automation.trigger' || skip !== true)) return undefined;
  return step;
}

/** A sequence of steps as one doing on one set of targets, or nothing when the steps are not the shape's. */
function parseSequence(raw: readonly unknown[]): { doing: Doing; targets: string[] } | undefined {
  const steps = raw.map(parseStep);
  if (!steps.length || steps.some((step) => step === undefined)) return undefined;
  const read = steps as ReadStep[];
  const seen = new Set<string>();
  const targets: string[] = [];
  let verb: Verb | undefined;
  let level: number | undefined;
  let temperature: number | undefined;
  for (const [i, step] of read.entries()) {
    if (step.temperature !== undefined) {
      // a thermostat's target follows the step that turns it on, on the same thermostats
      const before = read[i - 1];
      if (
        !before ||
        before.service !== 'climate.turn_on' ||
        !sameList(before.targets, step.targets)
      )
        return undefined;
      temperature = step.temperature;
      continue;
    }
    for (const domain of domainsOf(step.targets)) {
      if (seen.has(domain)) return undefined;
      seen.add(domain);
    }
    if (verb !== undefined && step.verb !== verb) return undefined;
    verb = step.verb;
    if (step.level !== undefined) level = step.level;
    targets.push(...step.targets);
  }
  if (!verb || new Set(targets).size !== targets.length) return undefined;
  const doing: Doing = { verb };
  if (level !== undefined) doing.level = level;
  if (temperature !== undefined) doing.temperature = temperature;
  return { doing, targets };
}

const sameTargets = (a: readonly string[], b: readonly string[]): boolean =>
  sameList([...a].sort(), [...b].sort());

const isOpposite = (then: Doing, after: Doing): boolean =>
  after.verb === OPPOSITE[then.verb] &&
  after.level === undefined &&
  after.temperature === undefined;

interface ReadBranch {
  id: TriggerId;
  days: Days | undefined;
  sequence: readonly unknown[];
}

function parseBranch(raw: unknown): ReadBranch | undefined {
  if (!isRecord(raw) || !keysWithin(raw, ['conditions', 'condition', 'sequence'])) return undefined;
  if (raw['conditions'] !== undefined && raw['condition'] !== undefined) return undefined;
  const conditions = listOf(raw['conditions'] ?? raw['condition']);
  const first = conditions[0];
  if (
    !isRecord(first) ||
    first['condition'] !== 'trigger' ||
    !keysWithin(first, ['condition', 'id'])
  )
    return undefined;
  const ids = listOf(first['id']);
  const id = ids[0];
  if (ids.length !== 1 || (id !== 'start' && id !== 'end')) return undefined;
  if (conditions.length > 2) return undefined;
  const days = conditions[1] === undefined ? undefined : parseDayCondition(conditions[1]);
  if (conditions[1] !== undefined && !days) return undefined;
  return { id, days, sequence: listOf(raw['sequence']) };
}

const TOP_KEYS = [
  'id',
  'alias',
  'description',
  'triggers',
  'trigger',
  'conditions',
  'condition',
  'actions',
  'action',
  'mode',
];

/**
 * The schedule an automation is, read strictly: a `fluvy_` id, no blueprint, no template anywhere, one or two
 * triggers of the two kinds with their ids, offsets in whole minutes, one day condition at most, steps only from
 * the verb table on targets of their own domain, the same verb across them, the same targets in both branches of
 * a window. Tolerant of what Home Assistant accepts as the same thing: `platform:` and `service:`, the singular
 * keys, `entity_id` as a string or at the top of a step, an offset in seconds, a weekday list in any order,
 * `homeassistant.turn_on`, an empty `metadata`. Anything else is not a schedule: undefined, and the row stays plain.
 */
export function parseAutomation(config: unknown): Schedule | undefined {
  if (!isRecord(config)) return undefined;
  const id = config['id'];
  if (typeof id !== 'string' || !SCHEDULE_ID.test(id)) return undefined;
  if (!keysWithin(config, TOP_KEYS)) return undefined;
  const text = JSON.stringify(config);
  if (text.includes('{{') || text.includes('{%')) return undefined;
  const alias = config['alias'];
  if (typeof alias !== 'string') return undefined;
  const description = config['description'];
  if (description !== undefined && typeof description !== 'string') return undefined;
  if (config['mode'] !== undefined && config['mode'] !== 'single') return undefined;
  for (const [plural, singular] of [
    ['triggers', 'trigger'],
    ['conditions', 'condition'],
    ['actions', 'action'],
  ] as const)
    if (config[plural] !== undefined && config[singular] !== undefined) return undefined;
  const triggers = listOf(config['triggers'] ?? config['trigger']);
  if (triggers.length < 1 || triggers.length > 2) return undefined;
  const start = parseTrigger(triggers[0], 'start');
  if (!start) return undefined;
  const end = triggers.length === 2 ? parseTrigger(triggers[1], 'end') : undefined;
  if (triggers.length === 2 && !end) return undefined;
  const conditions = listOf(config['conditions'] ?? config['condition']);
  const actions = listOf(config['actions'] ?? config['action']);
  const base = {
    id,
    alias,
    ...(description?.trim() ? { description: description.trim() } : {}),
  };
  const finish = (schedule: Schedule): Schedule | undefined =>
    checkSchedule(schedule) ? undefined : schedule;

  if (!end) {
    if (conditions.length > 1) return undefined;
    const days = conditions.length ? parseDayCondition(conditions[0]) : { kind: 'every' as const };
    if (!days) return undefined;
    const read = parseSequence(actions);
    if (!read) return undefined;
    return finish({ ...base, targets: read.targets, days, start, then: read.doing });
  }

  if (conditions.length) return undefined;
  const choose = actions[0];
  if (actions.length !== 1 || !isRecord(choose) || !keysWithin(choose, ['choose']))
    return undefined;
  const branches = listOf(choose['choose']).map(parseBranch);
  const first = branches[0];
  const second = branches[1];
  if (branches.length !== 2 || !first || !second) return undefined;
  const startBranch = first.id === 'start' ? first : second.id === 'start' ? second : undefined;
  const endBranch = first.id === 'end' ? first : second.id === 'end' ? second : undefined;
  if (!startBranch || !endBranch) return undefined;
  const days = startBranch.days ?? { kind: 'every' as const };
  const expected = endDays(days, crossesMidnight(start, end));
  if (!sameSchedule(endBranch.days ?? { kind: 'every' }, expected)) return undefined;
  const then = parseSequence(startBranch.sequence);
  const after = parseSequence(endBranch.sequence);
  if (!then || !after || !sameTargets(then.targets, after.targets)) return undefined;
  return finish({
    ...base,
    targets: then.targets,
    days,
    start,
    end,
    then: then.doing,
    ...(isOpposite(then.doing, after.doing) ? {} : { after: after.doing }),
  });
}

/* ---------- the next run ---------- */

/** What the clock and the sky say, for the next run: the next rising and setting (`sun.sun`), the house's zone, whether today is a workday (the sensor's state). */
export interface RunEnv {
  sun?: { rising: Date; setting: Date };
  zone?: string;
  workday?: boolean;
}

interface WallDate {
  year: number;
  month: number;
  day: number;
}

const weekdayOf = (date: WallDate): Weekday =>
  WEEKDAYS[
    (new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7
  ] as Weekday;

const sameDate = (a: WallDate, b: WallDate): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/** Whether the schedule runs on that day: the sensor's word for today when the schedule keeps one, the weekday otherwise. */
function allowedOn(days: Days, env: RunEnv, date: WallDate, today: boolean): boolean {
  switch (days.kind) {
    case 'every':
      return true;
    case 'custom':
      return days.days.includes(weekdayOf(date));
    case 'workdays':
    case 'weekend': {
      if (days.sensor && today && env.workday !== undefined)
        return days.kind === 'workdays' ? env.workday : !env.workday;
      const workday = WORKDAYS.includes(weekdayOf(date));
      return days.kind === 'workdays' ? workday : !workday;
    }
  }
}

/** The instant a wall clock in that zone shows those fields, found in two passes around the zone's offset; the browser's own clock without a zone. */
function instantOf(date: WallDate, hour: number, minute: number, zone: string | undefined): Date {
  if (!zone || !isTimeZone(zone))
    return new Date(date.year, date.month - 1, date.day, hour, minute, 0, 0);
  const want = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guess = want;
  for (let pass = 0; pass < 2; pass++) {
    const wall = wallClock(new Date(guess), zone);
    const shown = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    );
    if (shown === want) break;
    guess += want - shown;
  }
  return new Date(guess);
}

/** The calendar date `offset` days after that one. */
function plusDays(date: WallDate, offset: number): WallDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + offset));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/** The next instant after `now` a moment comes round on an allowed day: day by day on the clock, event by event in the sky. */
function nextMoment(m: Moment, days: Days, now: Date, env: RunEnv): Date | undefined {
  if (!Number.isFinite(now.getTime())) return undefined;
  const today = wallClock(now, env.zone);
  if (m.kind === 'time') {
    if (!CLOCK.test(m.at)) return undefined;
    const [hour, minute] = m.at.split(':').map(Number) as [number, number];
    for (let offset = 0; offset <= 8; offset++) {
      const date = plusDays(today, offset);
      const candidate = instantOf(date, hour, minute, env.zone);
      if (candidate.getTime() <= now.getTime()) continue;
      if (allowedOn(days, env, date, offset === 0)) return candidate;
    }
    return undefined;
  }
  if (!env.sun) return undefined;
  const base = m.event === 'sunrise' ? env.sun.rising : env.sun.setting;
  if (!Number.isFinite(base.getTime())) return undefined;
  // beyond the next event, the same instant a day later: a stated approximation, a minute or two off at most
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = new Date(base.getTime() + m.offset * 60_000 + offset * DAY_MS);
    if (candidate.getTime() <= now.getTime()) continue;
    const date = wallClock(candidate, env.zone);
    if (allowedOn(days, env, date, sameDate(date, today))) return candidate;
  }
  return undefined;
}

/** When the schedule next starts, after `now`; nothing when it cannot be told (a sun moment without the sky). */
export function nextRun(s: Schedule, now: Date, env: RunEnv = {}): Date | undefined {
  return nextMoment(s.start, s.days, now, env);
}

/** The sooner of the next start and the next end ("on until 11:00"), and which it is; the start on a tie. */
export function nextChange(
  s: Schedule,
  now: Date,
  env: RunEnv = {},
): { at: Date; which: 'start' | 'end' } | undefined {
  const start = nextRun(s, now, env);
  const end = s.end
    ? nextMoment(s.end, endDays(s.days, crossesMidnight(s.start, s.end)), now, env)
    : undefined;
  if (start && (!end || start.getTime() <= end.getTime())) return { at: start, which: 'start' };
  if (end) return { at: end, which: 'end' };
  return undefined;
}

/* ---------- small helpers ---------- */

/** A fresh id: `fluvy_` and twelve hex digits from the platform's random bytes. */
export function newScheduleId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `fluvy_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** A name fit to write: trimmed, one space between words, no control characters, a hundred characters at most. */
export function sanitiseAlias(text: string): string {
  const clean = text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(clean).slice(0, 100).join('').trim();
}
