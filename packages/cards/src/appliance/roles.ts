import type { EntityRegistryDisplayEntry, HassEntity, HomeAssistant } from '@fluvy/core';
import { boostOf, hobOf, zoneOf } from './zones.js';
import { maintenanceOf } from './maintenance.js';
import { entityOf, stateOf } from './refs.js';

/*
 * An appliance's entities, found on its device. Each integration hangs a washer's, an oven's or a fridge's entities on
 * one device, each with its own words: LG ThinQ, Home Connect, Miele, SmartThings, Matter, Whirlpool and Tuya (Home
 * Assistant's own, read from their source: their translation keys, and the writes the commands module pins), and hOn,
 * Electrolux and LG's older SmartThinQ integration (from HACS, read by the ends of their ids). A role is known by the
 * integration's own translation key, then by the keys they share, then by the end of its id, then by what it is (a
 * door by its device class, a power reading by its unit); where two entities could play it, the one known more
 * surely plays it. A role the card names by hand (`roles`) wins. The rest of a device's entities are read in kind:
 * its compartments and their setpoints, its maintenance flags, a fridge's quick modes, a hob's plates, a coffee
 * machine's counters. An integration's system buttons — firmware, reboot, a factory reset — are never anything, read
 * by their key or their id without the device's name (a Miele coffee machine is the "Coffee system", and all its ids
 * say so). LG's older integration says the whole cycle in the attributes of the device's own sensor, and the sensors
 * it makes for most of them are off by default: each of those attributes is a candidate of its own
 * ("sensor.washer#remain_time", `refs.ts`), under any sensor that says the same.
 */

export type ApplianceRole =
  /** What it is doing: Home Connect's operation state, Miele's status, LG's current state. */
  | 'state'
  /** The step of its cycle: Miele's programme phase, SmartThings' job state, Matter's current phase. */
  | 'phase'
  /** The programme it runs: a sensor, or the select that also chooses it. */
  | 'program'
  /** When it ends (a timestamp). */
  | 'finish'
  /** The time left (a duration). */
  | 'remaining'
  /** How long the whole cycle takes. */
  | 'total'
  /** How long it has run. */
  | 'elapsed'
  /** Its progress, in percent. */
  | 'progress'
  /** When a delayed start begins (a timestamp). */
  | 'start_at'
  /** How long until a delayed start begins (a duration). */
  | 'start_in'
  | 'door'
  /** Whether it may be started from Home Assistant (its own remote-start switch, set on the appliance). */
  | 'remote'
  /** Its power switch (or, on LG's older integration, the device's own sensor, which says whether it is on). */
  | 'power'
  /** A flag that its cycle completed, its last change the finish (LG's older integration's `run_completed`). */
  | 'completed'
  /** A select that runs and stops it (LG's operation, SmartThings' operating state, Electrolux's command). */
  | 'operation'
  /** Home Connect's active programme: choosing one starts it. */
  | 'launch'
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  /** SmartThings' dishwasher "Cancel": a stop that drains. */
  | 'cancel'
  | 'light'
  | 'fan'
  /** What went wrong: a failure flag, an error code or message, LG's error event. */
  | 'error'
  /** LG's notification event ("Washing is completed", "The door is open"). */
  | 'notification'
  /** Home Connect's "Pre-heat finished" event. */
  | 'preheated'
  /** The temperature inside (an oven's cavity, a kettle's water). */
  | 'temperature'
  /** The temperature it is set to (an oven's, a kettle's): a number to set, or a sensor. */
  | 'target'
  | 'probe'
  | 'probe_target'
  /** A wash's temperature, spin and dryness: what the programme was set to. */
  | 'wash_temperature'
  | 'spin'
  | 'dryness'
  | 'energy'
  | 'water'
  | 'cycles'
  | 'detergent'
  /** What it draws (W): a plug's reading. */
  | 'watts'
  /** A binary "running" sensor: Home Assistant's threshold helper on a plug's power. */
  | 'running';

export const APPLIANCE_ROLES: readonly ApplianceRole[] = [
  'state',
  'phase',
  'program',
  'finish',
  'remaining',
  'total',
  'elapsed',
  'progress',
  'start_at',
  'start_in',
  'door',
  'remote',
  'power',
  'completed',
  'operation',
  'launch',
  'start',
  'pause',
  'resume',
  'stop',
  'cancel',
  'light',
  'fan',
  'error',
  'notification',
  'preheated',
  'temperature',
  'target',
  'probe',
  'probe_target',
  'wash_temperature',
  'spin',
  'dryness',
  'energy',
  'water',
  'cycles',
  'detergent',
  'watts',
  'running',
];

/**
 * The integrations the card reads by their words. Home Assistant's own are read from their source: their keys, and
 * (in `commands.ts`) the writes their source pins. The community's, from HACS, are read by the ends of their ids, and
 * never written to.
 */
export const VERIFIED_PLATFORMS = [
  'lg_thinq',
  'home_connect',
  'miele',
  'smartthings',
  'matter',
  'whirlpool',
  'tuya',
] as const;
export const COMMUNITY_PLATFORMS = ['hon', 'electrolux_status', 'smartthinq_sensors'] as const;
export type AppliancePlatform =
  (typeof VERIFIED_PLATFORMS)[number] | (typeof COMMUNITY_PLATFORMS)[number];

const PLATFORMS: readonly string[] = [...VERIFIED_PLATFORMS, ...COMMUNITY_PLATFORMS];
export const knownPlatform = (platform: string | undefined): platform is AppliancePlatform =>
  PLATFORMS.includes(platform ?? '');

/** What a role may be: the domains its entity lives in, the one preferred first (a number to set over a sensor's reading). */
const DOMAINS: Readonly<Record<ApplianceRole, readonly string[]>> = {
  state: ['sensor'],
  phase: ['sensor'],
  program: ['select', 'sensor'],
  finish: ['sensor'],
  remaining: ['sensor'],
  total: ['sensor'],
  elapsed: ['sensor'],
  progress: ['sensor'],
  start_at: ['sensor'],
  start_in: ['sensor'],
  door: ['binary_sensor', 'sensor'],
  remote: ['binary_sensor', 'sensor'],
  power: ['switch', 'sensor'],
  completed: ['binary_sensor', 'sensor'],
  operation: ['select'],
  launch: ['select'],
  // Tuya's kettle starts by a switch
  start: ['button', 'switch'],
  pause: ['button'],
  resume: ['button'],
  stop: ['button'],
  cancel: ['button'],
  light: ['light', 'switch'],
  fan: ['fan'],
  error: ['binary_sensor', 'sensor', 'event'],
  notification: ['event'],
  preheated: ['sensor'],
  temperature: ['sensor'],
  target: ['number', 'sensor'],
  probe: ['sensor'],
  probe_target: ['sensor'],
  wash_temperature: ['sensor', 'select'],
  spin: ['sensor', 'select'],
  dryness: ['sensor', 'select'],
  energy: ['sensor'],
  water: ['sensor'],
  cycles: ['sensor'],
  detergent: ['sensor'],
  watts: ['sensor'],
  running: ['binary_sensor'],
};

/** The roles that act: never an entity Home Assistant files under diagnostics. */
const ACTING: ReadonlySet<ApplianceRole> = new Set([
  'power',
  'operation',
  'launch',
  'start',
  'pause',
  'resume',
  'stop',
  'cancel',
  'light',
  'fan',
]);

/** An integration's word for an entity: the role it plays, or `null` — none at all, whatever its id ends in. */
type Word = ApplianceRole | null;

/** The translation keys the integrations share, meaning the same on each. */
const KEYS_COMMON: Readonly<Record<string, ApplianceRole>> = {
  status: 'state',
  operation_state: 'state',
  operational_state: 'state',
  program_phase: 'phase',
  current_phase: 'phase',
  remaining_time: 'remaining',
  elapsed_time: 'elapsed',
  door: 'door',
  remote_control: 'remote',
  power: 'power',
  start: 'start',
  pause: 'pause',
  resume: 'resume',
  stop: 'stop',
  light: 'light',
  target_temperature: 'target',
  core_temperature: 'probe',
  core_target_temperature: 'probe_target',
  spin_speed: 'spin',
  energy_consumption: 'energy',
  water_consumption: 'water',
};

/**
 * Each integration's own translation keys, beyond the shared ones: what it calls a role, and (`null`) what it has that
 * is not the card's business — a setting a programme takes before it starts, a reading of another kind, a shared key
 * that means something else here. Its compartments, maintenance flags, quick modes and plates are read by `zones.ts`
 * and `maintenance.ts`.
 */
const KEYS_BY_PLATFORM: Readonly<
  Record<(typeof VERIFIED_PLATFORMS)[number] | 'hon', Readonly<Record<string, Word>>>
> = {
  // lg_thinq/sensor.py, binary_sensor.py, select.py, switch.py, number.py, event.py
  lg_thinq: {
    current_state: 'state',
    current_state_for_location: 'state',
    remain: 'finish',
    remain_for_location: 'finish',
    total: 'total',
    total_for_location: 'total',
    relative_to_start_wm: 'start_at',
    current_dish_washing_course: 'program',
    cook_mode: 'program',
    cycle_count: 'cycles',
    remote_control_enabled: 'remote',
    remote_control_enabled_for_location: 'remote',
    operation_mode: 'operation',
    operation_mode_for_location: 'operation',
    operation_power: 'power',
    error: 'error',
    notification: 'notification',
    relative_to_start: 'start_at',
    temperature_state: 'temperature',
    temperature_state_for_location: 'temperature',
    // the delayed end, a robot's running time, the recipe and lamp settings, the water hardness's set level (the
    // rinse aid's level is a reminder, `maintenance.ts`)
    relative_to_stop: null,
    relative_to_stop_wm: null,
    running: null,
    softening_level: null,
    light_status: null,
    lamp_brightness: null,
    signal_level: null,
    eco_friendly_mode: null,
    power_save_enabled: null,
  },
  // home_connect/sensor.py, binary_sensor.py, button.py, select.py, switch.py, number.py, light.py
  home_connect: {
    program_progress: 'progress',
    program_finish_time: 'finish',
    selected_program: 'program',
    active_program: 'launch',
    remote_start: 'remote',
    pause_program: 'pause',
    resume_program: 'resume',
    stop_program: 'stop',
    oven_current_cavity_temperature: 'temperature',
    setpoint_temperature: 'target',
    washer_temperature: 'wash_temperature',
    drying_target: 'dryness',
    preheat_finished: 'preheated',
    regular_preheat_finished: 'preheated',
    program_aborted: 'error',
    internal_light: 'light',
    cooking_lighting: 'light',
    // the remote control flag (start is `remote_start`), a programme's options, the door buttons, the events of a
    // finish (the state says it), the alarm clock
    remote_control: null,
    start_in_relative: null,
    finish_in_relative: null,
    duration: null,
    open_door: null,
    partly_open_door: null,
    program_finished: null,
    drying_process_finished: null,
    alarm_clock: null,
    alarm_clock_elapsed: null,
    ambient_light: null,
    external_light: null,
  },
  // miele/sensor.py, binary_sensor.py, button.py, switch.py, light.py, fan.py
  miele: {
    program_id: 'program',
    finish: 'finish',
    start: 'start_at',
    start_time: 'start_in',
    drying_step: 'dryness',
    failure: 'error',
    mobile_start: 'remote',
    fan: 'fan',
    // the forecasts, the programme's type, the info and smart grid flags; its start button is `start` on a button
    energy_forecast: null,
    water_forecast: null,
    program_type: null,
    info: null,
    notification_active: null,
    smart_grid: null,
    ambient_light: null,
  },
  // smartthings/sensor.py, binary_sensor.py, button.py, select.py
  smartthings: {
    washer_machine_state: 'state',
    dryer_machine_state: 'state',
    dishwasher_machine_state: 'state',
    oven_machine_state: 'state',
    cooktop_operating_state: 'state',
    washer_job_state: 'phase',
    dryer_job_state: 'phase',
    dishwasher_job_state: 'phase',
    oven_job_state: 'phase',
    completion_time: 'finish',
    washer_progress: 'progress',
    dryer_progress: 'progress',
    washer_mode: 'program',
    dryer_mode: 'program',
    oven_mode: 'program',
    dishwasher_washing_course: 'program',
    oven_setpoint: 'target',
    operating_state: 'operation',
    cancel: 'cancel',
    water_temperature: 'wash_temperature',
    spin_level: 'spin',
    power_energy: 'energy',
    hood: 'fan',
    // the second cavity's temperature (`oven_temperature_cavity_01`), read as the first's would be
    oven_temperature: 'temperature',
    // the drain-and-cancel course, a wrinkle-prevent flag, the refrigeration setpoint, the energy saved
    cancel_and_drain: null,
    dryer_wrinkle_prevent_active: null,
    refrigeration_setpoint: null,
    energy_difference: null,
    energy_saved: null,
    oven_cavity_status: null,
  },
  // matter/sensor.py, button.py, select.py, number.py, binary_sensor.py
  matter: {
    estimated_end_time: 'finish',
    operational_error: 'error',
    dishwasher_alarm_inflow: 'error',
    alarm_door: 'door',
    mode: 'program',
    // an oven cavity's; a compartment's setpoint (its range says which) is read by `zones.ts`
    temperature_setpoint: 'target',
    laundry_washer_spin_speed: 'spin',
    // a microwave's set cook time and power, the rinses, the energy management's own state
    cook_time: null,
    power_level: null,
    laundry_washer_number_of_rinses: null,
    esa_state: null,
    esa_opt_out_state: null,
  },
  // whirlpool/sensor.py, button.py, light.py, number.py, select.py
  whirlpool: {
    washer_state: 'state',
    dryer_state: 'state',
    oven_state: 'state',
    oven_state_upper: 'state',
    end_time: 'finish',
    oven_cook_mode: 'program',
    oven_cook_mode_upper: 'program',
    oven_current_temperature: 'temperature',
    oven_current_temperature_upper: 'temperature',
    oven_target_temperature: 'target',
    oven_target_temperature_upper: 'target',
    oven_stop: 'stop',
    oven_stop_upper: 'stop',
    oven_light: 'light',
    oven_light_upper: 'light',
  },
  // tuya/sensor.py, switch.py, number.py, select.py (the kettle "bh", the coffee maker "kfj", the sous-vide "mzj")
  tuya: {
    sous_vide_status: 'state',
    current_temperature: 'temperature',
    temperature: 'target',
    kettle_work_mode: 'program',
    // a setting kept between boils or brews
    heat_preservation: null,
    heat_preservation_time: null,
    temperature_after_boiling: null,
    quick_heat_temperature: null,
    water_level: null,
    powder: null,
    cups: null,
    concentration: null,
    material: null,
  },
  // the older hOn line (Andre0512/hon) named its entities with keys; the newer (gvigroux/hon) by their ids
  hon: {
    washing_modes: 'state',
    mach_modes_wm: 'state',
    mach_modes_td: 'state',
    mach_modes_dw: 'state',
    program_phases_wm: 'phase',
    program_phases_td: 'phase',
    program_phases_dw: 'phase',
    door_open: 'door',
    delay_time: 'start_in',
  },
};

/** The end of an entity's id, for what an integration names without a key (its object id without the device's name). */
type Ends = ReadonlyArray<readonly [RegExp, Word]>;

/** The ends of ids of the integrations the card reads by their ids. */
const SUFFIXES_BY_PLATFORM: Partial<Record<AppliancePlatform, Ends>> = {
  // gvigroux/hon sensor.py and binary_sensor.py: "<nickname> <name>" (base.py:102); its states are numbers
  hon: [
    [/(^|_)mode$/, 'state'],
    [/_program_phase$|^program_phase$/, 'phase'],
    [/(^|_)remaining_time$/, 'remaining'],
    [/(^|_)end_time$/, 'finish'],
    [/(^|_)program_name$/, 'program'],
    [/(^|_)program_duration$/, 'total'],
    [/(^|_)door_status$/, 'door'],
    [/(^|_)remote_control$/, 'remote'],
    [/(^|_)dry_level$/, 'dryness'],
    [/(^|_)(start_time|program_code|door_lock|paused|status)$/, null],
  ],
  // albaintor/homeassistant_electrolux_status entity.py:84-95: "<domain>.<brand>_<name>_<source>_<attribute>",
  // the attribute run together in lower case; its durations are seconds
  electrolux_status: [
    [/appliancestate$/, 'state'],
    [/cyclephase$/, 'phase'],
    [/cyclesubphase$/, null],
    [/timetoend$/, 'remaining'],
    [/runningtime$/, 'elapsed'],
    [/starttime$/, 'start_in'],
    [/doorstate$/, 'door'],
    [/doorlock$/, null],
    [/remotecontrol$/, 'remote'],
    [/executecommand$/, 'operation'],
    [/programuid$/, 'program'],
    [/displayfoodprobetemperaturec?$/, 'probe'],
    [/displaytemperaturec?$/, 'temperature'],
    [/totalcyclecounter$/, 'cycles'],
    [/(^|_)alerts$/, 'error'],
  ],
  // ollo69/ha-smartthinq-sensors sensor.py:96-185, binary_sensor.py: "<device> <name>"; its times are "H:MM:SS"; its
  // device's own sensor (no name) says whether it is on, and its attributes the rest (`SMARTTHINQ_ATTRIBUTES`); a
  // range's upper cavity is the oven, its lower the twin
  smartthinq_sensors: [
    [/(^|_)(run_state|oven_(upper|lower)_state)$/, 'state'],
    [/(^|_)process_state$/, 'phase'],
    [/(^|_)(current_course|oven_(upper|lower)_mode)$/, 'program'],
    [/(^|_)(remaining_time|remain_time)$/, 'remaining'],
    [/(^|_)initial_time$/, 'total'],
    [/(^|_)(countdown_time|reserve_time)$/, 'start_in'],
    [/(^|_)error_message$/, 'error'],
    [/(^|_)run_completed$/, 'completed'],
    [/(^|_)water_temp$/, 'wash_temperature'],
    [/(^|_)spin_speed$/, 'spin'],
    [/(^|_)dry_level$/, 'dryness'],
    [/(^|_)oven_(upper|lower)_current_temp$/, 'temperature'],
    [/(^|_)oven_(upper|lower)_target_temp$/, 'target'],
    [/(^|_)door_open$/, 'door'],
    [/(^|_)remote_start$/, 'remote'],
    // the course to start next, a flag the message says better, settings of a course
    [/(^|_)(pre_state|tub_clean_counter|half_load|course_selection|error_state|rinse_mode)$/, null],
  ],
};

/**
 * The attributes of LG's older integration's device sensor that say what its sensors would (ollo69/ha-smartthinq-sensors
 * sensor.py ATTR_*): the cycle's state, step, course and times, its door and remote start, a wash's settings, the
 * tub-clean count, a dishwasher's refills, a fridge's temperatures, a range's cavities and burners.
 */
const SMARTTHINQ_ATTRIBUTES =
  /^(run_state|process_state|current_course|remain_time|initial_time|reserve_time|error_message|run_completed|door_open|remote_start|spin_speed|water_temp|dry_level|tubclean_count|rinse_refill|salt_refill|(fridge|freezer)_temp|oven_(upper|lower)_(state|mode|current_temp|target_temp)|cooktop_[a-z_]+_state)$/;

/**
 * The attributes each of those device sensors had while it could be read: out of reach, Home Assistant writes none
 * of them, and the appliance keeps the rows they gave it (1.9: it keeps its size), as a missing entity keeps its
 * capabilities (`@fluvy/core`'s `resolveEntity`).
 */
const ATTRIBUTES_SEEN = new Map<string, string[]>();

/** The ends of ids anyone writes: for a role named by an integration the card does not know. */
const SUFFIXES: Ends = [
  [/(^|_)(end_time|finish_time|completion_time|finish)$/, 'finish'],
  [/(^|_)(remaining_time|time_remaining|time_left|remaining)$/, 'remaining'],
  [/(^|_)(progress|program_progress)$/, 'progress'],
  [/(^|_)(program_phase|phase|job_state|cycle_phase)$/, 'phase'],
  [/(^|_)(program|programme|course|cycle)$/, 'program'],
  [/(^|_)(door|door_open|door_state)$/, 'door'],
  [/(^|_)(remote_start|remote_control)$/, 'remote'],
];

/** A loose guess at the end of an id, for an integration the card does not know: last, and never when strict. */
const LOOSE: Ends = [[/(^|_)(state|status|operation_state|machine_state|run_state)$/, 'state']];

/**
 * Never a role, by a key or an id without the device's name: the integration's system and connection entities, and
 * anything that would reset or update the appliance — whole words of it. Never the whole id: a Miele coffee machine
 * nobody renamed is the "Coffee system", and every one of its ids says "system".
 */
const NEVER =
  /(^|_)(system|firmware|reboot|restart|factory_reset|reset_to_factory|identify|wifi|rssi|signal_strength|link_quality|connectivity|update|ip_address|mac_address|shutdown)(_|$)/;

/** How surely a role is known: by the integration's own word, a shared one, an id's end, a loose guess, what it is. */
const RANK = { platform: 4, common: 3, suffix: 2, loose: 1, domain: 0 } as const;

/** An entity of the device as the registry and the states say it. */
export interface Candidate {
  readonly id: string;
  readonly domain: string;
  /** Its translation key (`hass.entities[…].translation_key`). */
  readonly key: string | undefined;
  /** The integration it belongs to (`hass.entities[…].platform`). */
  readonly platform?: string | undefined;
  /** Its device class, from its state (the registry the frontend reads carries none). */
  readonly deviceClass?: string | undefined;
  /** Its unit, from its state. */
  readonly unit?: string | undefined;
  /** `config` or `diagnostic`, as the registry files it. */
  readonly category?: string | undefined;
  /** Its object id without the device's name: what the ends of ids and `NEVER` read ("coffee_system_status" → "status"). */
  readonly object: string;
  /** A number's top (`max`), from its state: Matter's setpoints are a compartment's or an oven's by their range. */
  readonly max?: number | undefined;
  /** The attribute of its entity it stands for (`id` is "<entity>#<attribute>"): LG's older integration's. */
  readonly attribute?: string | undefined;
}

/** A role of the appliance's own, or of its twin (a second drum or cavity on the same device). */
export interface Part {
  readonly role: ApplianceRole;
  readonly rank: number;
  readonly twin?: boolean;
}

/** What else an entity is to an appliance: a compartment's, a maintenance flag, a quick mode, a plate, a counter. */
export type Gathered = 'zones' | 'maintenance' | 'boosts' | 'hob' | 'counters';

/**
 * How the roles are read. `lenient` (the card, on the device it is given): every word, the loose guesses and what an
 * entity is. `strict` (the house's appliances): only the integrations' words and the ends of ids they write, never a
 * guess.
 */
export type Rigour = 'lenient' | 'strict';

const domainOf = (id: string): string => id.slice(0, id.indexOf('.'));

/** The second unit's entities on a device that has two: SmartThings' upper washer and second cavity, Whirlpool's lower oven. */
const TWIN: ReadonlyArray<readonly [RegExp, string]> = [
  [/^washer_sub_(machine_state|job_state|progress)$/, 'washer_$1'],
  [/^washer_sub_completion_time$/, 'completion_time'],
  [/^sub_remote_control$/, 'remote_control'],
  [/^oven_(machine_state|job_state|mode|setpoint)_cavity_01$/, 'oven_$1'],
  [/^oven_completion_time_cavity_01$/, 'completion_time'],
  [/^oven_temperature_cavity_01$/, 'oven_temperature'],
  [/^(oven_[a-z_]+)_lower$/, '$1'],
];

/** The twin's key as the first unit's: `washer_sub_job_state` plays what `washer_job_state` plays, for the twin. */
function twinOf(key: string | undefined): string | undefined {
  if (!key) return undefined;
  for (const [pattern, main] of TWIN) if (pattern.test(key)) return key.replace(pattern, main);
  return undefined;
}

/**
 * The part an entity plays on an appliance and how surely it is known: by its integration's own word (4), by a word
 * the integrations share (3), by the end of its id — its integration's, then anyone's (2) — by a loose guess (1,
 * lenient only), by what it is (0: a door, a power or energy reading, a running flag, a light, a power switch). None
 * where the integration says it is not the card's business, for a system entity, for one Home Assistant files under
 * diagnostics where it would act.
 */
export function partOf(candidate: Candidate, rigour: Rigour = 'lenient'): Part | undefined {
  const { domain, key, object } = candidate;
  if (NEVER.test(object) || (key && NEVER.test(key))) return undefined;
  const platform = knownPlatform(candidate.platform) ? candidate.platform : undefined;
  const fits = (word: Word | undefined): word is ApplianceRole =>
    word !== undefined &&
    word !== null &&
    DOMAINS[word].includes(domain) &&
    !(ACTING.has(word) && candidate.category === 'diagnostic');
  const twinKey = twinOf(key);
  const keyed = twinKey ?? key;
  // the lower cavity of LG's older integration's range is the twin, by its attributes' names
  const twin =
    twinKey !== undefined || (candidate.attribute && /^oven_lower_/.test(object))
      ? { twin: true }
      : {};
  // an attribute is known no surer than a loose guess: a sensor that says the same plays the part
  const at = (rank: number): number => (candidate.attribute ? Math.min(rank, RANK.loose) : rank);
  const own =
    platform && platform in KEYS_BY_PLATFORM && keyed
      ? KEYS_BY_PLATFORM[platform as keyof typeof KEYS_BY_PLATFORM][keyed]
      : undefined;
  if (own === null) return undefined;
  if (fits(own)) return { role: own, rank: RANK.platform, ...twin };
  const shared = keyed ? KEYS_COMMON[keyed] : undefined;
  if (fits(shared)) return { role: shared, rank: RANK.common, ...twin };
  // the ends of ids in turn: the integration's own, the shared, the loose guesses; a `null` ends the search
  const tiers: ReadonlyArray<readonly [Ends, number]> = [
    [platform ? (SUFFIXES_BY_PLATFORM[platform] ?? []) : [], RANK.suffix],
    [key ? [] : SUFFIXES, RANK.suffix],
    [rigour === 'lenient' && !key ? LOOSE : [], RANK.loose],
  ];
  for (const [ends, rank] of tiers)
    for (const [pattern, word] of ends) {
      if (!pattern.test(object)) continue;
      if (word === null) return undefined;
      if (fits(word)) return { role: word, rank: at(rank), ...twin };
    }
  // LG's older integration: the device's own sensor, named by the device alone, says whether it is on — over the
  // power switch it makes, which is out of reach whenever remote start is off
  if (platform === 'smartthinq_sensors' && object === '' && domain === 'sensor')
    return { role: 'power', rank: RANK.loose };
  return whatItIs(candidate, rigour);
}

/** What an entity is, when no word says what it plays: lenient only, but for a power reading (a plug's, anywhere). */
function whatItIs(candidate: Candidate, rigour: Rigour): Part | undefined {
  const { domain, deviceClass, unit, key } = candidate;
  const at = (role: ApplianceRole): Part => ({ role, rank: RANK.domain });
  if (domain === 'sensor' && (deviceClass === 'power' || /^(k|m)?W$/.test(unit ?? '')))
    return at('watts');
  if (rigour === 'strict' || key) return undefined;
  if (domain === 'binary_sensor' && (deviceClass === 'door' || deviceClass === 'opening'))
    return at('door');
  if (
    domain === 'binary_sensor' &&
    (deviceClass === 'running' || candidate.platform === 'threshold')
  )
    return at('running');
  if (domain === 'sensor' && deviceClass === 'energy') return at('energy');
  if (domain === 'sensor' && deviceClass === 'temperature') return at('temperature');
  if (domain === 'light') return at('light');
  if (domain === 'switch' && candidate.category !== 'config' && candidate.category !== 'diagnostic')
    return at('power');
  return undefined;
}

/** The role an entity plays on an appliance, or none. */
export function roleOf(
  candidate: Candidate,
  rigour: Rigour = 'lenient',
): ApplianceRole | undefined {
  return partOf(candidate, rigour)?.role;
}

/** What else an entity is to an appliance (a compartment's, a flag to look after, a quick mode, a plate, a counter). */
export function gatheredOf(candidate: Candidate): Gathered | undefined {
  if (NEVER.test(candidate.object) || (candidate.key && NEVER.test(candidate.key)))
    return undefined;
  if (zoneOf(candidate)) return 'zones';
  if (maintenanceOf(candidate)) return 'maintenance';
  if (boostOf(candidate)) return 'boosts';
  if (hobOf(candidate)) return 'hob';
  if (/_counter$/.test(candidate.key ?? '') && candidate.domain === 'sensor') return 'counters';
  return undefined;
}

/* ---------- the device ---------- */

/**
 * The slug a device's name gives its entities' ids: the object id its entities share before their own names (every
 * integration names its entities after the device), else the device's name made an id. "sensor.coffee_system_status"
 * on a device whose entities all begin "coffee_system_" is the status.
 */
export function deviceSlug(objects: readonly string[], name: string | null | undefined): string {
  if (objects.length > 1) {
    const [first = '', ...rest] = objects;
    let words = first.split('_');
    for (const object of rest) {
      const own = object.split('_');
      let n = 0;
      while (n < words.length && n < own.length && words[n] === own[n]) n += 1;
      words = words.slice(0, n);
    }
    // never the whole id of one of them: "washer" and "washer_run_state" share "washer", the device's name
    if (words.length) return words.join('_');
  }
  return slugify(name ?? '');
}

/** A name as Home Assistant makes it an id: lower case, its accents taken off, anything else an underscore. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** An object id without the device's slug: what is left of "coffee_system_status" on the coffee system ("status"). */
export function withoutSlug(object: string, slug: string): string {
  if (!slug) return object;
  if (object === slug) return '';
  return object.startsWith(`${slug}_`) ? object.slice(slug.length + 1) : object;
}

/** The house as discovery reads it: the registries, and the states for what the registry does not say. */
export type House = Pick<HomeAssistant, 'entities' | 'devices' | 'states'>;

/** The entries of a device, as the registry lists them (hidden ones too: what is hidden is still the device's). */
export function entriesOf(
  hass: Pick<HomeAssistant, 'entities'> | undefined,
  device: string | undefined,
): EntityRegistryDisplayEntry[] {
  if (!device) return [];
  return Object.values(hass?.entities ?? {}).filter((entry) => entry.device_id === device);
}

/**
 * The candidates of a device: each entry with its state's device class, unit and range, and its id without the
 * device's name; after LG's older integration's device sensor, its attributes as candidates of their own.
 */
export function candidatesOf(
  hass: House | undefined,
  entries: readonly EntityRegistryDisplayEntry[],
  name?: string | null,
): Candidate[] {
  const objects = entries.map((entry) => entry.entity_id.slice(entry.entity_id.indexOf('.') + 1));
  const slug = deviceSlug(objects, name);
  const list = entries.map((entry, index) =>
    candidateOf(entry, stateOf(hass, entry.entity_id), slug, objects[index]),
  );
  // the attributes after every entity: a sensor that says the same is found first
  return [
    ...list,
    ...list.flatMap((candidate) => {
      if (candidate.platform !== 'smartthinq_sensors' || candidate.object) return [];
      const written = Object.keys(hass?.states?.[candidate.id]?.attributes ?? {}).filter(
        (attribute) => SMARTTHINQ_ATTRIBUTES.test(attribute),
      );
      if (written.length) ATTRIBUTES_SEEN.set(candidate.id, written);
      return (written.length ? written : (ATTRIBUTES_SEEN.get(candidate.id) ?? [])).map(
        (attribute): Candidate => ({
          id: `${candidate.id}#${attribute}`,
          domain: 'sensor',
          key: undefined,
          platform: candidate.platform,
          object: attribute,
          attribute,
        }),
      );
    }),
  ];
}

function candidateOf(
  entry: EntityRegistryDisplayEntry,
  state: HassEntity | undefined,
  slug: string,
  object = entry.entity_id.slice(entry.entity_id.indexOf('.') + 1),
): Candidate {
  const max = state?.attributes['max'];
  return {
    id: entry.entity_id,
    domain: domainOf(entry.entity_id),
    key: entry.translation_key,
    platform: entry.platform,
    deviceClass: state?.attributes.device_class,
    unit: state?.attributes.unit_of_measurement,
    category: entry.entity_category,
    object: withoutSlug(object, slug),
    ...(typeof max === 'number' ? { max } : {}),
  };
}

export type ApplianceRoles = Partial<Record<ApplianceRole, string>>;

/** A second drum or cavity on the same device: its own roles, and which it is. */
export interface Twin {
  readonly unit: 'upper' | 'lower' | 'second';
  readonly roles: ApplianceRoles;
}

/** An appliance's entities: one per role (the twin's apart), and everything else it has, read in kind. */
export interface ApplianceEntities {
  readonly roles: ApplianceRoles;
  readonly twin?: Twin;
  readonly zones: readonly string[];
  readonly maintenance: readonly string[];
  readonly boosts: readonly string[];
  readonly hob: readonly string[];
  readonly counters: readonly string[];
}

/** An entity holding a role, and how surely. */
interface Holder {
  readonly id: string;
  readonly rank: number;
}

/** Whether a part known this surely takes a role from its holder: a higher rank, else the role's preferred domain. */
function surer(role: ApplianceRole, id: string, rank: number, held: Holder): boolean {
  if (rank !== held.rank) return rank > held.rank;
  return DOMAINS[role].indexOf(domainOf(id)) < DOMAINS[role].indexOf(domainOf(held.id));
}

/** The twin's unit, by the keys (or the attributes) that named it. */
function twinUnit(keys: readonly (string | undefined)[]): Twin['unit'] {
  if (keys.some((key) => /(^|_)lower(_|$)/.test(key ?? ''))) return 'lower';
  if (keys.some((key) => /^washer_sub_|^sub_/.test(key ?? ''))) return 'upper';
  return 'second';
}

/**
 * Every role the appliance's device fills — by the entity known most surely to play it — and everything else it has,
 * read in kind; then the roles named by hand over them. Hidden entities are left out of the search. The entity the
 * card names (a plug's switch, a state sensor) is its state, power or power reading when it plays no other part.
 */
export function applianceEntities(
  hass: House | undefined,
  device: string | undefined,
  named: ReadonlyArray<{ readonly role: string; readonly entity: string }> = [],
  entity?: string,
): ApplianceEntities {
  const held: Partial<Record<ApplianceRole, Holder>> = {};
  const twinHeld: Partial<Record<ApplianceRole, Holder>> = {};
  const twinKeys: (string | undefined)[] = [];
  const gathered: Record<Gathered, string[]> = {
    zones: [],
    maintenance: [],
    boosts: [],
    hob: [],
    counters: [],
  };
  const entries = entriesOf(hass, device);
  const name = device
    ? (hass?.devices?.[device]?.name_by_user ?? hass?.devices?.[device]?.name)
    : undefined;
  for (const candidate of candidatesOf(hass, entries, name)) {
    if (hass?.entities?.[entityOf(candidate.id)]?.hidden) continue;
    const kind = gatheredOf(candidate);
    if (kind) {
      gathered[kind].push(candidate.id);
      continue;
    }
    const part = partOf(candidate);
    if (!part) continue;
    const table = part.twin ? twinHeld : held;
    if (part.twin) twinKeys.push(candidate.key ?? candidate.object);
    const holder = table[part.role];
    if (!holder || surer(part.role, candidate.id, part.rank, holder))
      table[part.role] = { id: candidate.id, rank: part.rank };
  }
  const roles = rolesOf(held);
  // the entity the card names plays a part of its own, or the one a lone entity would
  if (entity && !Object.values(roles).includes(entity)) {
    const entry = hass?.entities?.[entity];
    const state = hass?.states?.[entity];
    const object = entity.slice(entity.indexOf('.') + 1);
    const role =
      roleOf(candidateOf(entry ?? { entity_id: entity }, state, '', object)) ??
      ({ sensor: 'state', switch: 'power', binary_sensor: 'running' } as const)[
        domainOf(entity) as 'sensor' | 'switch' | 'binary_sensor'
      ];
    if (role && !roles[role]) roles[role] = entity;
  }
  for (const { role, entity: id } of named)
    if ((APPLIANCE_ROLES as readonly string[]).includes(role) && id)
      roles[role as ApplianceRole] = id;
  const twinRoles = rolesOf(twinHeld);
  return {
    roles,
    ...(Object.keys(twinRoles).length
      ? { twin: { unit: twinUnit(twinKeys), roles: twinRoles } }
      : {}),
    ...gathered,
  };
}

const rolesOf = (held: Partial<Record<ApplianceRole, Holder>>): ApplianceRoles => {
  const roles: ApplianceRoles = {};
  for (const [role, holder] of Object.entries(held) as Array<[ApplianceRole, Holder]>)
    roles[role] = holder.id;
  return roles;
};

/** The device the card is about: the one it names, else the device of the entity it names. */
export function applianceDevice(
  hass: Pick<HomeAssistant, 'entities'> | undefined,
  device: string | undefined,
  entity: string | undefined,
): string | undefined {
  if (device) return device;
  return entity ? hass?.entities?.[entity]?.device_id : undefined;
}
