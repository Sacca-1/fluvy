import {
  resolveEntity,
  stateText,
  strings,
  type EntityView,
  type HomeAssistant,
  type KeyOf,
  type MessageKey,
} from '@fluvy/core';
import { printerDevices } from '../printer/roles.js';
import {
  clockSeconds,
  durationSeconds,
  finishedAt,
  jobClock,
  type JobClock,
} from '../shared/job-time.js';
import { commandsOf, programChoice, type Command, type ProgramChoice } from './commands.js';
import {
  byWords,
  KIND_DEFAULTS,
  kindOf,
  signalsOf,
  unloads,
  type ApplianceKind,
  type ApplianceReadout,
  type KindVerdict,
} from './kinds.js';
import {
  maintenanceItem,
  maintenanceList,
  maintenanceOf,
  notifiedItem,
  type MaintenanceItem,
} from './maintenance.js';
import {
  applianceDevice,
  applianceEntities,
  candidatesOf,
  entriesOf,
  type ApplianceEntities,
  type ApplianceRoles,
  type Candidate,
  type House,
  type Twin,
} from './roles.js';
import { refState, refView } from './refs.js';
import {
  applianceStatus,
  busy,
  statusOfWord,
  stepOf,
  stepsOf,
  wordOf,
  type ApplianceStatus,
  type ApplianceStep,
} from './status.js';
import type { PlugCycle } from './plug.js';
import { zoneOf, zonesOf, type Zone } from './zones.js';

/*
 * An appliance as a card reads it, at one moment: what it is and what it is doing, in Home Assistant's words and in the
 * card's few statuses; its cycle's step and times (left, ready at, so far, in all, how far along); whether it waits to
 * be unloaded, its door has stood open too long, or it failed and why; what it asks to be looked after; its
 * compartments, quick modes, plates and counters; its oven's or kettle's heat; its readouts; the commands it can take
 * now; its twin's state. Pure: the appliance card and the list of the house's appliances both read it, and draw it
 * each their own way. A plug's appliance (no integration of its own) is read here as far as its switch and power
 * reading go; its cycle, from the plug's history, is the card's.
 */

/** What a card's config says that the reading reads. */
export interface ApplianceConfig {
  readonly device?: string | undefined;
  readonly entity?: string | undefined;
  readonly kind?: ApplianceKind | 'auto' | undefined;
  /** Entities named by hand for what the card does not find: `{ role, entity }`. */
  readonly roles?: ReadonlyArray<{ readonly role: string; readonly entity: string }> | undefined;
  /** Whether a finished cycle waits to be unloaded (the kind's say by default). */
  readonly unload_reminder?: boolean | undefined;
  /** Minutes after a finish before it is said to wait (30). */
  readonly unload_after?: number | undefined;
  /** Minutes a finish is remembered, where no door clears it (120). */
  readonly done_for?: number | undefined;
  /** The level, in percent, a tank or a filter is low at (20). */
  readonly low_level?: number | undefined;
  /** Seconds a door may stand open before the card says so (the kind's say by default: a fridge's 60). */
  readonly door_alert?: number | undefined;
}

export const UNLOAD_AFTER = 30;
export const DONE_FOR = 120;
export const LOW_LEVEL = 20;
const MINUTE = 60_000;
/** How long LG's error event says the appliance failed: half an hour. */
const ERROR_FOR = 30 * MINUTE;

/** An appliance as found: its device, its integration, its entities, and what it is. */
export interface ApplianceFound {
  readonly device: string | undefined;
  readonly platform: string | undefined;
  readonly entities: ApplianceEntities;
  /** Every entity of its device, as discovery reads it (its compartments are read from them). */
  readonly candidates: readonly Candidate[];
  /** What it is, or why it is not one; none where nothing says. */
  readonly verdict: KindVerdict | undefined;
}

/**
 * The appliance a card is about: the device it names (or its entity's), its entities, what it is. Costly on a large
 * house: a card keeps it while the registries and its config stay the same, as the printer card keeps its printer.
 */
export function findAppliance(hass: House | undefined, config: ApplianceConfig): ApplianceFound {
  const device = applianceDevice(hass, config.device, config.entity);
  const entry = device ? hass?.devices?.[device] : undefined;
  const entries = entriesOf(hass, device);
  const platform =
    entries.find((item) => item.platform && item.platform !== 'threshold')?.platform ??
    (config.entity ? hass?.entities?.[config.entity]?.platform : undefined);
  const printer = device !== undefined && printerDevices(hass).includes(device);
  const signals = device ? signalsOf(hass, device, printer) : undefined;
  // a plug's entity may be named for what it powers ("Washing machine") where its device is not ("Plug 3")
  const named = config.entity ? hass?.states?.[config.entity]?.attributes.friendly_name : undefined;
  const verdict = signals
    ? kindOf(signals, config.kind)
    : config.kind && config.kind !== 'auto'
      ? ({ kind: config.kind, by: 'config' } as const)
      : undefined;
  return {
    device,
    platform,
    entities: applianceEntities(hass, device, config.roles ?? [], config.entity),
    candidates: candidatesOf(hass, entries, entry?.name_by_user ?? entry?.name),
    verdict: verdict ?? byWords(named, config.entity),
  };
}

/** Something the card says under the head, most pressing first: why it failed, a door left open, a load to take out, what to look after. */
export interface Attention {
  readonly key: MessageKey;
  /** The integration's own words for it, where it has them (why it failed); the key's are said otherwise. */
  readonly text?: string;
  /** Since when (ms): said as its age ("Door open · 2 min"). */
  readonly since?: number;
}

/** An oven's or a kettle's heat: where it is, where it is going, and whether it is there. */
export interface Heat {
  readonly current: number | null;
  readonly target: number | null;
  readonly unit: string;
  /** At temperature: its integration said so (Home Connect's pre-heat event, LG's notification), or it is within 2 °C. */
  readonly ready: boolean;
  /** How far from the room's temperature to the target it has come, 0–100; null where either is unknown. */
  readonly progress: number | null;
}

/** A twin unit's reading: its status, its words, its times. */
export interface TwinReading {
  readonly unit: Twin['unit'];
  readonly status: ApplianceStatus;
  readonly word: string;
  readonly phase: string;
  readonly clock: JobClock;
  readonly finishedAt: number | null;
}

export interface ApplianceReading {
  readonly kind: ApplianceKind;
  readonly platform: string | undefined;
  readonly name: string;
  readonly status: ApplianceStatus;
  /** What the appliance says it is doing, in Home Assistant's words ('' where nothing says: `statusWord` is said). */
  readonly word: string;
  /** The card's word for its status ("Done", "At temperature"). */
  readonly statusWord: MessageKey;
  /** The step it is at, in Home Assistant's words ('' where its state says it already). */
  readonly phase: string;
  readonly step: ApplianceStep | undefined;
  /** The steps its bar shows. */
  readonly steps: readonly ApplianceStep[];
  /** The programme, in Home Assistant's words. */
  readonly program: string;
  /** Its cycle's times, while it has a job. */
  readonly clock: JobClock;
  /** When a delayed start begins (ms), while it waits. */
  readonly startAt: number | null;
  /** When it finished (ms), while it is finished. */
  readonly finishedAt: number | null;
  /** Its doors: whether one is open and since when, and when any last opened or shut. */
  readonly door: {
    readonly open: boolean;
    readonly since: number | null;
    readonly changed: number | null;
  } | null;
  /** Waiting to be unloaded since its finish (ms). */
  readonly unload: { readonly since: number } | null;
  readonly attention: readonly Attention[];
  readonly maintenance: readonly MaintenanceItem[];
  readonly zones: readonly Zone[];
  readonly boosts: readonly string[];
  readonly hob: readonly string[];
  readonly counters: readonly string[];
  readonly heat: Heat | null;
  /** The readouts it has: each the entity that says it. */
  readonly readouts: Partial<Record<ApplianceReadout, string>>;
  readonly commands: readonly Command[];
  /** The programmes it may be started on, where its integration lets a card choose. */
  readonly programs: ProgramChoice | undefined;
  readonly twin: TwinReading | undefined;
  /** Read from a plug's switch and power alone: its cycle is the plug's history's. */
  readonly plug: boolean;
  readonly unavailable: boolean;
  /** The entities it found, by role: what a tap opens. */
  readonly roles: ApplianceRoles;
}

/** LG's notifications that a cycle is done (lg_thinq strings.json event.notification). */
export const COMPLETED: ReadonlySet<string> = new Set([
  'washing_is_complete',
  'drying_is_complete',
  'cleaning_is_complete',
  'cooking_is_complete',
  'styling_is_complete',
]);

/** The integrations whose state is the cycle's step (it changes with every phase): no start is read from its change. */
const STEPPING = new Set(['lg_thinq', 'whirlpool', 'smartthinq_sensors']);

const EMPTY_CLOCK: JobClock = { left: null, at: null, total: null, elapsed: null, progress: null };
/** A plug's job says nothing but when it started. */
const NO_SOURCES = { remaining: null, finish: null, total: null, elapsed: null, progress: null };

/** Read from a plug's switch and power alone: nothing of an integration says what it is doing. */
export const isPlug = (roles: ApplianceRoles): boolean =>
  !roles.state && !roles.phase && !roles.finish && !roles.remaining && Boolean(roles.watts);

/**
 * What a plug's appliance is doing: out of reach with its reading, off with its switch, else its cycle's — but what
 * keeps food cold (`cold`) draws in its compressor's bursts and never finishes: it is in operation while switched on.
 */
function plugStatus(
  cycle: PlugCycle,
  watts: EntityView | undefined,
  power: EntityView | undefined,
  cold: boolean,
): ApplianceStatus {
  if (watts?.status === 'unavailable' || watts?.status === 'missing') return 'offline';
  if (cold) return power?.status === 'ok' && power.state === 'off' ? 'off' : 'idle';
  if (power?.status === 'ok' && power.state === 'off' && cycle.status !== 'finished') return 'off';
  return cycle.status === 'running' ? 'running' : cycle.status === 'finished' ? 'finished' : 'idle';
}

/** A word that says nothing: a number (hOn's states untranslated), LG's older integration's dash or "N/A", or nothing at all. */
const saysNothing = (text: string): boolean =>
  !wordOf(text) || wordOf(text) === 'n/a' || /^\d+$/.test(text);

const s = strings('appliance');

/**
 * The words the appliances share, by the card's key for each — a status's where it is one, a step's, else its
 * own — for a state or a programme Home Assistant has no translation of: LG's older integration's plain English
 * ("Rinsing", "Power Off"), a house whose language the integration lacks (the word comes back as it is).
 */
const SHARED: Readonly<Partial<Record<KeyOf<'appliance'>, string>>> = {
  status_off: 'off power_off sleep',
  status_idle: 'initial idle',
  status_scheduled: 'reserved delay_wait',
  status_running: 'running starting',
  status_paused: 'pause paused user_paused',
  status_finished: 'end done finished complete cleaning_is_done',
  status_error: 'error power_fail interrupted',
  status_preheating: 'preheat preheating',
  step_rinse: 'rinse',
  step_anti_crease: 'anti_wrinkle wrinkle_care',
  state_cancelled: 'cancel cancelled force_stopped',
  state_finishing: 'ending',
  state_rinse_hold: 'rinse_hold',
  state_rinsing: 'rinsing',
  state_spinning: 'spinning',
  state_drying: 'drying',
  state_night_dry: 'night_dry',
  state_detecting: 'detecting',
  state_steam: 'steam_softening',
  state_cooling: 'cool_down cooling',
  state_refreshing: 'refreshing',
  state_cooking: 'cook cooking cooking_in_progress',
  state_cleaning: 'clean cleaning',
  cycle_turbo: 'turbo',
  cycle_heavy: 'heavy',
  cycle_auto: 'auto',
  cycle_refresh: 'refresh',
  cycle_normal: 'normal',
  cycle_express: 'express',
  cycle_download: 'download_cycle',
  cycle_delicate: 'delicate',
  cycle_eco: 'eco',
  cycle_quick: 'quick',
  n_machine_care: 'machine_clean',
};
const WORD_KEYS = new Map(
  (Object.entries(SHARED) as Array<[KeyOf<'appliance'>, string]>).flatMap(([key, words]) =>
    words.split(' ').map((word) => [word, key] as const),
  ),
);

/** A text as the words are compared: lower case, one space for the underscores and spaces between its words. */
const plainOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();

/**
 * What an entity says, in Home Assistant's words; where it has none for the word (the state came back as it is), the
 * card's own in the house's language, for the words the appliances share.
 */
function spoken(hass: HomeAssistant | undefined, v: EntityView): string {
  const text = stateText(hass, v);
  const key = WORD_KEYS.get(wordOf(v.state));
  return key && plainOf(text) === plainOf(v.state) ? s(hass, key) : text;
}

/**
 * The state in Home Assistant's words, unless the status is not what they say — LG's "Power off" when it is done, a
 * stopped machine whose job finished, a failure — when the card's own word is said instead.
 */
function stateWords(
  hass: HomeAssistant | undefined,
  found: ApplianceFound,
  state: EntityView | undefined,
  status: ApplianceStatus,
): string {
  if (!state || state.status !== 'ok') return '';
  const kind = found.verdict && 'kind' in found.verdict ? found.verdict.kind : undefined;
  return statusOfWord(state.state, found.platform, kind) === status ? spoken(hass, state) : '';
}

/**
 * Reads an appliance at a moment. `unloaded` is the finish (ms) the person said they unloaded, if any; `cycle` what
 * an appliance on a plug is doing, as its power says it (`plug.ts`).
 */
export function readAppliance(
  hass: HomeAssistant | undefined,
  found: ApplianceFound,
  config: ApplianceConfig,
  now: number,
  unloaded: number | null = null,
  cycle?: PlugCycle,
): ApplianceReading {
  const { roles } = found.entities;
  const plug = isPlug(roles);
  const kind = found.verdict && 'kind' in found.verdict ? found.verdict.kind : 'appliance';
  const defaults = KIND_DEFAULTS[kind];
  const view = (id: string | undefined): EntityView | undefined =>
    id ? refView(hass, id) : undefined;
  const ok = (id: string | undefined): EntityView | undefined => {
    const v = view(id);
    return v && v.status === 'ok' ? v : undefined;
  };
  const doneFor = (config.done_for ?? DONE_FOR) * MINUTE;
  const state = view(roles.state);
  const notification = ok(roles.notification);
  const completedAt = completion(notification) ?? completedFlag(ok(roles.completed));
  const said =
    plug && cycle
      ? plugStatus(cycle, view(roles.watts), view(roles.power), defaults.hero === 'cold')
      : statusOf(found, roles, now, doneFor, completedAt, view);
  const failure = failureOf(hass, roles, view, now);
  // a failure the appliance says outright is its status, unless it is off or out of reach
  const status: ApplianceStatus = failure && said !== 'offline' && said !== 'off' ? 'error' : said;
  const word = stateWords(hass, found, state, status);
  const phaseView = roles.phase !== roles.state ? ok(roles.phase) : undefined;
  const phase = phaseView ? spoken(hass, phaseView) : '';
  const step = stepOf(kind, (phaseView ?? state)?.state);
  const clock = !busy(status)
    ? EMPTY_CLOCK
    : plug && cycle
      ? jobClock({ ...NO_SOURCES, started: cycle.start }, now)
      : clockOf(roles, status, found.platform, now, view);
  const startAt = status === 'scheduled' ? startOf(roles, now, view) : null;
  const finish =
    status !== 'finished'
      ? null
      : plug && cycle
        ? cycle.end
        : finishOf(roles, completedAt, now, view);
  const door = doorOf(roles, found, view);
  const unload = unloadOf(kind, config, status, finish, door, notification, unloaded, now, doneFor);
  const maintenance = maintenanceOfAppliance(hass, found, config, now);
  const heat = defaults.hero === 'heat' ? heatOf(hass, roles, view, !busy(status)) : null;
  const doorAlert = config.door_alert ?? defaults.doorAlert;
  const attention: Attention[] = [];
  if (failure) attention.push(failure);
  if (door?.open && doorAlert > 0 && door.since !== null && now - door.since >= doorAlert * 1000)
    attention.push({ key: 'appliance.door_open', since: door.since });
  if (unload) attention.push({ key: 'appliance.unload', since: unload.since });
  if (status === 'running' && step === 'anti_crease')
    attention.push({ key: 'appliance.anti_crease' });
  for (const item of maintenance)
    if (item.severity === 'due')
      attention.push({
        key: `appliance.m_${item.key}`,
        ...(item.since ? { since: item.since } : {}),
      });
  const statusWord: MessageKey =
    heat?.ready && (status === 'running' || status === 'preheating')
      ? 'appliance.status_at_temperature'
      : `appliance.status_${status}`;
  const twin = found.entities.twin;
  return {
    kind,
    platform: found.platform,
    name: nameOf(hass, found, config),
    status,
    word: saysNothing(word) ? '' : word,
    statusWord,
    phase: saysNothing(phase) || phase === word ? '' : phase,
    step,
    steps: stepsOf(kind, step),
    program: textOf(hass, ok(roles.program)),
    clock,
    startAt,
    finishedAt: finish,
    door,
    unload,
    attention,
    maintenance,
    zones: zonesOf(
      hass,
      found.candidates.filter((candidate) => found.entities.zones.includes(candidate.id)),
    ),
    boosts: found.entities.boosts,
    hob: found.entities.hob,
    counters: found.entities.counters,
    heat,
    readouts: readoutsOf(roles),
    commands: commandsOf({ hass, platform: found.platform, roles, status, kind }),
    programs: programChoice({ hass, platform: found.platform, roles, status }),
    twin: twin ? twinOf(hass, found, twin, now, doneFor, view) : undefined,
    plug,
    unavailable: status === 'offline',
    roles,
  };
}

/** The appliance's name: the person's for its device, the integration's, else its entity's. */
function nameOf(
  hass: HomeAssistant | undefined,
  found: ApplianceFound,
  config: ApplianceConfig,
): string {
  const device = found.device ? hass?.devices?.[found.device] : undefined;
  return (
    device?.name_by_user ??
    device?.name ??
    (config.entity ? resolveEntity(hass, config.entity).name : '')
  );
}

const textOf = (hass: HomeAssistant | undefined, v: EntityView | undefined): string => {
  const text = v ? spoken(hass, v) : '';
  return saysNothing(text) ? '' : text;
};

/** When LG said a cycle completed (ms), if its last notification says so. */
function completion(notification: EntityView | undefined): number | null {
  const type = notification?.attr<unknown>('event_type');
  if (typeof type !== 'string' || !COMPLETED.has(type)) return null;
  const at = Date.parse(notification?.state ?? '');
  return Number.isFinite(at) ? at : null;
}

/** When a flag that the cycle completed was raised (ms), while it is (LG's older integration's). */
function completedFlag(v: EntityView | undefined): number | null {
  if (v?.state !== 'on') return null;
  const at = Date.parse(v.stateObj?.last_changed ?? '');
  return Number.isFinite(at) ? at : null;
}

const on = (v: EntityView | undefined): boolean | undefined =>
  v && v.status === 'ok' ? v.state === 'on' : undefined;

/** The status of a unit's roles (the appliance's, or its twin's). */
function statusOf(
  found: ApplianceFound,
  roles: ApplianceRoles,
  now: number,
  doneFor: number,
  completedAt: number | null,
  view: (id: string | undefined) => EntityView | undefined,
): ApplianceStatus {
  const state = view(roles.state);
  const kind = found.verdict && 'kind' in found.verdict ? found.verdict.kind : undefined;
  // unavailable, or gone from the house: out of reach either way (1.9)
  if (state && (state.status === 'unavailable' || state.status === 'missing')) return 'offline';
  // with no state, or one that says nothing (LG's older integration's dash), a running flag or the power says what it can
  return applianceStatus({
    state: state?.status === 'ok' ? state.state : undefined,
    phase: view(roles.phase)?.state,
    platform: found.platform,
    kind,
    power: on(view(roles.power)),
    running: on(view(roles.running)),
    completedAt,
    now,
    doneFor,
  });
}

/**
 * Seconds a duration role holds: a figure in its unit (minutes where it says none: an appliance's cycle is counted in
 * them), else a clock ("1:35:00", an appliance's "1:35").
 */
function seconds(v: EntityView | undefined): number | null {
  if (!v || v.status !== 'ok') return null;
  return durationSeconds(v.number, v.unit || 'min') ?? clockSeconds(v.state, 'h:mm');
}

/** A timestamp role's moment (ms). */
function moment(v: EntityView | undefined): number | null {
  if (!v || v.status !== 'ok') return null;
  const at = Date.parse(v.state);
  return Number.isFinite(at) ? at : null;
}

/** A running cycle's times, from whatever its integration says. */
function clockOf(
  roles: ApplianceRoles,
  status: ApplianceStatus,
  platform: string | undefined,
  now: number,
  view: (id: string | undefined) => EntityView | undefined,
): JobClock {
  const progress = view(roles.progress);
  const startedAt = moment(view(roles.start_at));
  const state = view(roles.state);
  // when it started: its start time, else when a status (not a step) turned to running
  const changed =
    status === 'running' && state?.stateObj && !STEPPING.has(platform ?? '')
      ? Date.parse(state.stateObj.last_changed)
      : NaN;
  return jobClock(
    {
      remaining: seconds(view(roles.remaining)),
      finish: moment(view(roles.finish)),
      total: seconds(view(roles.total)),
      elapsed: seconds(view(roles.elapsed)),
      progress: progress && progress.status === 'ok' ? progress.number : null,
      started:
        startedAt !== null && startedAt <= now
          ? startedAt
          : Number.isFinite(changed)
            ? changed
            : null,
    },
    now,
  );
}

/** When a delayed start begins: its start time, else now and the time until it. */
function startOf(
  roles: ApplianceRoles,
  now: number,
  view: (id: string | undefined) => EntityView | undefined,
): number | null {
  const at = moment(view(roles.start_at));
  if (at !== null && at > now) return at;
  const wait = seconds(view(roles.start_in));
  return wait !== null ? now + wait * 1000 : null;
}

/** When a finished cycle finished: when it said so (LG's notification), its finish time, else its state's change. */
function finishOf(
  roles: ApplianceRoles,
  completedAt: number | null,
  now: number,
  view: (id: string | undefined) => EntityView | undefined,
): number | null {
  if (completedAt !== null) return completedAt;
  const changed = view(roles.state)?.stateObj?.last_changed;
  const at = changed ? Date.parse(changed) : NaN;
  return finishedAt(moment(view(roles.finish)), Number.isFinite(at) ? at : null, now);
}

/** The appliance's doors (its own, its compartments'): open when any is, since the first opened. */
function doorOf(
  roles: ApplianceRoles,
  found: ApplianceFound,
  view: (id: string | undefined) => EntityView | undefined,
): ApplianceReading['door'] {
  const zoneDoors = found.candidates
    .filter(
      (candidate) =>
        found.entities.zones.includes(candidate.id) && zoneOf(candidate)?.part === 'door',
    )
    .map((candidate) => candidate.id);
  const doors = [roles.door, ...zoneDoors]
    .map((id) => view(id))
    .filter((v): v is EntityView => v !== undefined && v.status === 'ok');
  if (!doors.length) return null;
  const changedOf = (v: EntityView): number => Date.parse(v.stateObj?.last_changed ?? '');
  const open = doors.filter((v) => v.state === 'on' || v.state === 'open');
  const since = open.map(changedOf).filter(Number.isFinite);
  const changed = doors.map(changedOf).filter(Number.isFinite);
  return {
    open: open.length > 0,
    since: since.length ? Math.min(...since) : null,
    changed: changed.length ? Math.max(...changed) : null,
  };
}

/**
 * Whether a finished cycle waits to be unloaded, and since when: a washer's, a dryer's, a dishwasher's, from
 * `unload_after` minutes after it finished — until its door opens after the finish (or LG says it did), the person
 * says it is unloaded, or, with no door to say so, `done_for` after the finish.
 */
function unloadOf(
  kind: ApplianceKind,
  config: ApplianceConfig,
  status: ApplianceStatus,
  finish: number | null,
  door: ApplianceReading['door'],
  notification: EntityView | undefined,
  unloaded: number | null,
  now: number,
  doneFor: number,
): ApplianceReading['unload'] {
  if (status !== 'finished' || finish === null) return null;
  if (!(config.unload_reminder ?? unloads(kind))) return null;
  if (unloaded !== null && unloaded === finish) return null;
  const after = (config.unload_after ?? UNLOAD_AFTER) * MINUTE;
  if (now - finish < after) return null;
  // the door said it: opened (or shut) after the finish, or open now, or LG's notification that it is open
  if (door && ((door.changed !== null && door.changed > finish) || door.open)) return null;
  const said =
    notification?.attr<unknown>('event_type') === 'door_is_open' ? moment(notification) : null;
  if (said !== null && said > finish) return null;
  if (!door && now - finish > doneFor) return null;
  return { since: finish };
}

/** Why it failed, while it says so: a failure flag, an error code, LG's error event within half an hour. */
function failureOf(
  hass: HomeAssistant | undefined,
  roles: ApplianceRoles,
  view: (id: string | undefined) => EntityView | undefined,
  now: number,
): Attention | null {
  const v = view(roles.error);
  if (!v || v.status !== 'ok') return null;
  const failing = (text?: string): Attention => ({
    key: 'appliance.failure',
    ...(text ? { text } : {}),
  });
  switch (v.domain) {
    case 'binary_sensor':
      return v.state === 'on' ? failing() : null;
    case 'event': {
      const at = Date.parse(v.state);
      if (!Number.isFinite(at) || now - at > ERROR_FOR || !v.stateObj) return null;
      const type = v.attr<unknown>('event_type');
      const text =
        hass?.formatEntityAttributeValue?.(v.stateObj, 'event_type') ??
        (typeof type === 'string' ? type : '');
      return failing(text);
    }
    default: {
      const word = wordOf(v.state);
      // Home Connect's "Program aborted" event, present or confirmed
      if (word === 'present' || word === 'confirmed') return { key: 'appliance.aborted' };
      // nothing, or a word for none (LG's older integration's dash is nothing once read)
      if (/^(off|none|no_error|ok|normal|0|no|false)?$/.test(word)) return null;
      if (word === 'on' || word === 'true') return failing();
      // a count of alerts (Electrolux), above none
      if (v.number !== null) return v.number > 0 ? failing() : null;
      return failing(stateText(hass, v));
    }
  }
}

/** What it asks to be looked after: its maintenance entities, and LG's notification for a day. */
function maintenanceOfAppliance(
  hass: HomeAssistant | undefined,
  found: ApplianceFound,
  config: ApplianceConfig,
  now: number,
): MaintenanceItem[] {
  const items = found.candidates
    .filter((candidate) => found.entities.maintenance.includes(candidate.id))
    .map((candidate) => {
      const spec = maintenanceOf(candidate);
      return spec
        ? maintenanceItem(spec, refState(hass, candidate.id), config.low_level ?? LOW_LEVEL)
        : undefined;
    });
  const notification = found.entities.roles.notification;
  return maintenanceList([
    ...items,
    notifiedItem(notification ? hass?.states?.[notification] : undefined, now),
  ]);
}

/**
 * An oven's or a kettle's heat, where it has a temperature or a target. At rest a reading of nothing at all is none
 * (LG ThinQ's oven says 0 while it is off: a dash, never "0 °F").
 */
function heatOf(
  hass: HomeAssistant | undefined,
  roles: ApplianceRoles,
  view: (id: string | undefined) => EntityView | undefined,
  resting: boolean,
): Heat | null {
  const current = view(roles.temperature);
  const target = view(roles.target);
  if (!current && !target) return null;
  const reading = (v: EntityView | undefined): number | null =>
    v?.status === 'ok' && !(resting && v.number !== null && v.number <= 0) ? v.number : null;
  const now = reading(current);
  const goal = reading(target);
  const unit = current?.unit || target?.unit || hass?.config.unit_system.temperature || '°C';
  const room = /F$/.test(unit) ? 68 : 20;
  const near = /F$/.test(unit) ? 4 : 2;
  const preheated = view(roles.preheated);
  const said =
    preheated?.status === 'ok' &&
    (preheated.state === 'present' || preheated.state === 'confirmed');
  const ready = said || (now !== null && goal !== null && goal > room && now >= goal - near);
  const progress =
    now !== null && goal !== null && goal > room
      ? Math.min(100, Math.max(0, ((now - room) / (goal - room)) * 100))
      : null;
  return { current: now, target: goal, unit, ready, progress };
}

/** The readouts an appliance has, each the entity that says it (a plug's power for `power` and `this_cycle`). */
function readoutsOf(roles: ApplianceRoles): Partial<Record<ApplianceReadout, string>> {
  const pairs: Array<readonly [ApplianceReadout, string | undefined]> = [
    ['program', roles.program],
    ['temperature', roles.wash_temperature ?? roles.temperature],
    ['spin', roles.spin],
    ['dryness', roles.dryness],
    ['energy', roles.energy],
    ['water', roles.water],
    ['cycles', roles.cycles],
    ['detergent', roles.detergent],
    ['elapsed', roles.elapsed],
    ['total', roles.total],
    ['this_cycle', roles.energy ?? roles.watts],
    ['probe', roles.probe],
    ['power', roles.watts],
  ];
  return Object.fromEntries(pairs.filter(([, id]) => id)) as Partial<
    Record<ApplianceReadout, string>
  >;
}

/** A twin unit's reading. */
function twinOf(
  hass: HomeAssistant | undefined,
  found: ApplianceFound,
  twin: Twin,
  now: number,
  doneFor: number,
  view: (id: string | undefined) => EntityView | undefined,
): TwinReading {
  const status = statusOf(found, twin.roles, now, doneFor, null, view);
  const state = view(twin.roles.state);
  const phase = twin.roles.phase ? view(twin.roles.phase) : undefined;
  const word = stateWords(hass, found, state, status);
  const phaseWord = phase && phase.status === 'ok' ? spoken(hass, phase) : '';
  return {
    unit: twin.unit,
    status,
    word: saysNothing(word) ? '' : word,
    phase: saysNothing(phaseWord) || phaseWord === word ? '' : phaseWord,
    clock: busy(status) ? clockOf(twin.roles, status, found.platform, now, view) : EMPTY_CLOCK,
    finishedAt: status === 'finished' ? finishOf(twin.roles, null, now, view) : null,
  };
}
