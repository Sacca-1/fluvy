import type { Tone } from '@fluvy/ui';
import { printerDevices } from '../printer/roles.js';
import type { CommandName } from './commands.js';
import { stateOf } from './refs.js';
import { candidatesOf, entriesOf, knownPlatform, roleOf, type House } from './roles.js';
import type { ApplianceStep } from './status.js';
import { KIND_WORDS, NOT_AN_APPLIANCE } from './words.generated.js';
import { celsius } from './zones.js';

/*
 * What an appliance is. The card's own `kind` first; then what the integration says outright — Miele's model is the
 * appliance's type in English ("Washing machine", "Coffee system"), LG's model ends in its device type ("WM4000
 * (DEVICE_WASHER)"), and a WashTower is two devices named "<name> washer" and "<name> dryer"; then the keys only one
 * kind has (salt is a dishwasher's, i-Dos a washer's, a cavity's temperature an oven's, a setpoint that tops out below
 * 30 °C a compartment's; what LG's status can say — spinning, night dry, preheating — and what its older integration
 * writes in the device sensor's attributes); then the words of its name in any of the eight languages. Some things
 * are never an appliance, whatever they say: a vacuum (Home Connect's robot has no vacuum entity, only its keys), a
 * charger, a 3D printer, and — until 1.10 — a warming drawer, LG's Styler and its kimchi fridge.
 */

export type ApplianceKind =
  | 'washer'
  | 'dryer'
  | 'washer_dryer'
  | 'dishwasher'
  | 'oven'
  | 'microwave'
  | 'hob'
  | 'hood'
  | 'fridge'
  | 'freezer'
  | 'wine'
  | 'coffee'
  | 'kettle'
  | 'air_fryer'
  | 'toaster'
  | 'blender'
  | 'sandwich_maker'
  | 'appliance';

export const APPLIANCE_KINDS: readonly ApplianceKind[] = [
  'washer',
  'dryer',
  'washer_dryer',
  'dishwasher',
  'oven',
  'microwave',
  'hob',
  'hood',
  'fridge',
  'freezer',
  'wine',
  'coffee',
  'kettle',
  'air_fryer',
  'toaster',
  'blender',
  'sandwich_maker',
  'appliance',
];

/** How a kind was known: the card's word, the model, LG's device type, the keys, the name. */
export type KindSource = 'config' | 'model' | 'lg' | 'keys' | 'words';

/** Why a device is never an appliance: what it is (the last three wait for 1.10), or its name's say. */
export type Exclusion =
  'vacuum' | 'printer' | 'charger' | 'warming_drawer' | 'styler' | 'kimchi' | 'name';

export type KindVerdict =
  { readonly kind: ApplianceKind; readonly by: KindSource } | { readonly excluded: Exclusion };

/** What a device says about its kind, gathered once from the registries and the states. */
export interface KindSignals {
  readonly platform?: string | undefined;
  readonly model?: string | null | undefined;
  /** Its name as the person sees it (theirs, else the integration's). */
  readonly name?: string | null | undefined;
  /** Its entities' translation keys. */
  readonly keys: ReadonlySet<string>;
  /** Its entities' ids without the device's name ("door_status"), and LG's older integration's attributes. */
  readonly objects: readonly string[];
  readonly domains: ReadonlySet<string>;
  /** The programmes its programme select lists (Home Connect's name the appliance: "dishcare_dishwasher_program_eco_50"). */
  readonly programs: readonly string[];
  /** The words its status can say (LG ThinQ's current status lists them: a washer spins, an oven preheats). */
  readonly states?: readonly string[];
  /** Its setpoints' tops, in °C (Matter's compartments and cavities say what they are by their range). */
  readonly tops: readonly number[];
  /** A 3D printer, as the printer card finds them. */
  readonly printer?: boolean;
}

/** Miele's models, its appliance types in English (miele/const.py DEVICE_TYPE_TAGS, entity.py:59-72). */
const MIELE: Readonly<Record<string, ApplianceKind | Exclusion>> = {
  'washing machine': 'washer',
  'tumble dryer': 'dryer',
  'washer dryer': 'washer_dryer',
  dishwasher: 'dishwasher',
  oven: 'oven',
  'oven microwave': 'oven',
  'steam oven': 'oven',
  'steam oven combi': 'oven',
  'steam oven micro': 'oven',
  'dialog oven': 'oven',
  microwave: 'microwave',
  hob: 'hob',
  'hob extraction': 'hob',
  hood: 'hood',
  refrigerator: 'fridge',
  'fridge freezer': 'fridge',
  freezer: 'freezer',
  'wine cabinet': 'wine',
  'wine conditioning unit': 'wine',
  'wine unit': 'wine',
  'wine cabinet freezer': 'wine',
  'coffee system': 'coffee',
  'robot vacuum cleaner': 'vacuum',
  'warming drawer': 'warming_drawer',
};

/**
 * LG's device types, as its models end (lg_thinq/entity.py:47-50 "{model} ({device_type})", thinqconnect's
 * "DEVICE_WASHER"; smartthinq_sensors __init__.py:471 "{model} ({type})", its "WASHER", "TOWER_DRYER").
 */
const LG: Readonly<Record<string, ApplianceKind | Exclusion>> = {
  WASHER: 'washer',
  WASHTOWER_WASHER: 'washer',
  TOWER_WASHER: 'washer',
  WASHCOMBO_MINI: 'washer',
  DRYER: 'dryer',
  WASHTOWER_DRYER: 'dryer',
  TOWER_DRYER: 'dryer',
  WASHCOMBO_MAIN: 'washer_dryer',
  TOWER_WASHERDRYER: 'washer_dryer',
  WASHTOWER: 'washer_dryer',
  DISH_WASHER: 'dishwasher',
  DISHWASHER: 'dishwasher',
  REFRIGERATOR: 'fridge',
  WINE_CELLAR: 'wine',
  OVEN: 'oven',
  RANGE: 'oven',
  MICROWAVE_OVEN: 'microwave',
  MICROWAVE: 'microwave',
  COOKTOP: 'hob',
  HOOD: 'hood',
  ROBOT_CLEANER: 'vacuum',
  STICK_CLEANER: 'vacuum',
  ROBOT_VACUUM: 'vacuum',
  STICK_VACUUM: 'vacuum',
  STYLER: 'styler',
  KIMCHI_REFRIGERATOR: 'kimchi',
};

/** LG's device type at the end of its model: "WM4000 (DEVICE_WASHER)" → "WASHER". */
export const LG_MODEL = /\((?:DEVICE_)?([A-Z_]+)\)$/;

const EXCLUSIONS: readonly string[] = [
  'vacuum',
  'printer',
  'charger',
  'warming_drawer',
  'styler',
  'kimchi',
  'name',
];
const verdict = (said: ApplianceKind | Exclusion, by: KindSource): KindVerdict =>
  EXCLUSIONS.includes(said) ? { excluded: said as Exclusion } : { kind: said as ApplianceKind, by };

/** A WashTower's half, by its name's end (lg_thinq/coordinator.py:42-55: "<alias> washer", "<alias> dryer"). */
const TOWER_HALF = /\s(washer|dryer)$/i;

/** By its model: Miele's type, LG's device type and a WashTower's half. */
function byModel(signals: KindSignals): KindVerdict | undefined {
  const model = (signals.model ?? '').trim();
  if (signals.platform === 'miele') {
    const said = MIELE[model.toLowerCase()];
    if (said) return verdict(said, 'model');
  }
  const type = LG_MODEL.exec(model)?.[1];
  const said = type ? LG[type] : undefined;
  if (!said) return undefined;
  const half = TOWER_HALF.exec(signals.name ?? '')?.[1]?.toLowerCase();
  if (said === 'washer_dryer' && type === 'WASHTOWER' && half)
    return verdict(half as ApplianceKind, 'lg');
  return verdict(said, 'lg');
}

/** Home Connect's robot (it has no vacuum entity: home_connect/__init__.py PLATFORMS), by the keys only it has. */
const ROBOT_KEYS = [
  'lost',
  'lifted',
  'dust_box_inserted',
  'current_map',
  'robot_is_stuck',
  'camera_state',
  'docking_station_not_found',
  'empty_dust_box_and_clean_filter',
];

/** Home Connect's programmes, by the appliance their keys begin with (select.py PROGRAMS_TRANSLATION_KEYS_MAP). */
const PROGRAMS: ReadonlyArray<readonly [RegExp, ApplianceKind | Exclusion]> = [
  [/^consumer_products_cleaning_robot_/, 'vacuum'],
  [/^dishcare_dishwasher_/, 'dishwasher'],
  [/^laundry_care_washer_dryer_/, 'washer_dryer'],
  [/^laundry_care_washer_/, 'washer'],
  [/^laundry_care_dryer_/, 'dryer'],
  [/^cooking_oven_program_microwave/, 'microwave'],
  [/^cooking_oven_/, 'oven'],
  [/^consumer_products_coffee_maker_/, 'coffee'],
  [/^cooking_common_program_hood_/, 'hood'],
];

/** By the keys only one kind has, the integration's own. */
function byKeys(signals: KindSignals): KindVerdict | undefined {
  const { keys, platform, objects, domains, tops } = signals;
  const has = (...wanted: string[]): boolean => wanted.some((key) => keys.has(key));
  const hasLike = (pattern: RegExp): boolean => [...keys].some((key) => pattern.test(key));
  if (domains.has('vacuum') || has(...ROBOT_KEYS) || hasLike(/^stick_cleaner_/))
    return { excluded: 'vacuum' };
  if (hasLike(/^evse_/)) return { excluded: 'charger' };
  switch (platform) {
    case 'home_connect': {
      // the programmes name the appliance: all a microwave's are microwave programmes, an oven's are its heating modes
      const said = signals.programs.map(
        (program) => PROGRAMS.find(([pattern]) => pattern.test(program))?.[1],
      );
      const named = said.find((kind) => kind && kind !== 'microwave') ?? said.find(Boolean);
      if (named) return verdict(named, 'keys');
      if (
        hasLike(/^(salt|rinse_aid)_/) ||
        has('machine_care_reminder', 'smart_filter_cleaning_reminder')
      )
        return verdict('dishwasher', 'keys');
      if (has('drying_target', 'drying_process_finished'))
        return verdict(
          has('washer_temperature', 'spin_speed', 'i_dos1_active') ? 'washer_dryer' : 'dryer',
          'keys',
        );
      if (hasLike(/i_dos|^washer_temperature$|^spin_speed$|^vario_perfect$/))
        return verdict('washer', 'keys');
      if (
        has(
          'oven_current_cavity_temperature',
          'regular_preheat_finished',
          'fast_pre_heat',
          'warming_level',
        )
      )
        return verdict('oven', 'keys');
      if (hasLike(/_counter$|^bean_|^descaling_in_|^calc_n_clean|^drip_tray_full$|^coffee_/))
        return verdict('coffee', 'keys');
      if (hasLike(/^wine_compartment/)) return verdict('wine', 'keys');
      if (hasLike(/^refrigerator_/)) return verdict('fridge', 'keys');
      if (hasLike(/^freezer_(setpoint|super|door)/)) return verdict('freezer', 'keys');
      if (hasLike(/^(venting_level|intensive_level|grease_filter_)/))
        return verdict('hood', 'keys');
      return undefined;
    }
    case 'miele':
      if (has('plate')) return verdict('hob', 'keys');
      if (has('salt_level', 'rinse_aid_level', 'power_disk_level'))
        return verdict('dishwasher', 'keys');
      if (has('drying_step'))
        return verdict(has('twin_dos_1_level') ? 'washer_dryer' : 'dryer', 'keys');
      if (has('twin_dos_1_level', 'twin_dos_2_level')) return verdict('washer', 'keys');
      if (has('core_temperature')) return verdict('oven', 'keys');
      if (has('descaling_counter', 'milk_cleaning_counter')) return verdict('coffee', 'keys');
      if (has('wine_cabinet')) return verdict('wine', 'keys');
      if (has('refrigerator')) return verdict('fridge', 'keys');
      if (has('freezer')) return verdict('freezer', 'keys');
      return undefined;
    case 'smartthings': {
      const washer = hasLike(/^washer_/);
      const dryer = hasLike(/^dryer_/);
      if (washer || dryer)
        return verdict(washer && dryer ? 'washer_dryer' : washer ? 'washer' : 'dryer', 'keys');
      if (hasLike(/^dishwasher_/)) return verdict('dishwasher', 'keys');
      if (hasLike(/^oven_/)) return verdict('oven', 'keys');
      if (has('cooktop_operating_state', 'manual_level', 'heating_mode'))
        return verdict('hob', 'keys');
      if (hasLike(/^cooler_/)) return verdict('fridge', 'keys');
      if (hasLike(/^freezer_/)) return verdict('freezer', 'keys');
      if (hasLike(/^hood_|^reset_hood_filter$/)) return verdict('hood', 'keys');
      return undefined;
    }
    case 'matter':
      if (hasLike(/^laundry_washer_/)) return verdict('washer', 'keys');
      if (has('dishwasher_alarm_inflow')) return verdict('dishwasher', 'keys');
      if (has('cook_time', 'power_level')) return verdict('microwave', 'keys');
      if (tops.some((top) => top > 100)) return verdict('oven', 'keys');
      if (tops.length && tops.every((top) => top <= 30))
        return verdict(tops.every((top) => top <= -5) ? 'freezer' : 'fridge', 'keys');
      return undefined;
    case 'whirlpool':
      if (has('washer_state')) return verdict('washer', 'keys');
      if (has('dryer_state')) return verdict('dryer', 'keys');
      if (hasLike(/^oven_/)) return verdict('oven', 'keys');
      if (has('refrigerator_temperature_level')) return verdict('fridge', 'keys');
      return undefined;
    case 'tuya':
      if (has('temperature_after_boiling', 'kettle_work_mode', 'quick_heat_temperature'))
        return verdict('kettle', 'keys');
      if (has('cups', 'powder', 'concentration')) return verdict('coffee', 'keys');
      return undefined;
    case 'lg_thinq': {
      if (has('current_dish_washing_course', 'rinse_level')) return verdict('dishwasher', 'keys');
      if (has('express_fridge', 'rapid_freeze')) return verdict('fridge', 'keys');
      if (has('cook_mode')) return verdict('oven', 'keys');
      if (has('power_level_for_location')) return verdict('hob', 'keys');
      // an oven's parts are its cavities ("Upper current status"); then what its status can say
      const says = (...words: string[]): boolean =>
        words.some((word) => signals.states?.includes(word));
      if (
        (hasLike(/_for_location$/) &&
          objects.some((object) => /(^|_)(upper|lower)(_|$)/.test(object))) ||
        says('cooking_in_progress', 'preheating', 'cook')
      )
        return verdict('oven', 'keys');
      if (says('night_dry')) return verdict('dishwasher', 'keys');
      if (says('spinning', 'rinse_hold')) return verdict('washer', 'keys');
      if (says('wrinkle_care', 'drying')) return verdict('dryer', 'keys');
      return undefined;
    }
    // LG's older integration: the device sensor's attributes and the sensors it makes (ollo69/ha-smartthinq-sensors)
    case 'smartthinq_sensors': {
      const own = (pattern: RegExp): boolean => objects.some((object) => pattern.test(object));
      if (own(/^oven_(upper|lower)_|^oven_state$/)) return verdict('oven', 'keys');
      if (own(/^cooktop_/)) return verdict('hob', 'keys');
      if (own(/^(fridge|freezer)(_temp)?$/)) return verdict('fridge', 'keys');
      if (
        own(
          /^(half_load|salt_refill|rinse_refill|dual_zone|auto_door|night_dry|extra_dry|high_temp)$/,
        )
      )
        return verdict('dishwasher', 'keys');
      if (own(/^(dry_level|temp_control|time_dry|eco_hybrid)$/)) return verdict('dryer', 'keys');
      if (own(/^(spin_speed|water_temp|rinse_mode|pre_wash|turbo_wash|crease_care|medic_rinse)$/))
        return verdict('washer', 'keys');
      return undefined;
    }
    case 'hon':
      if (has('mach_modes_dw', 'program_phases_dw', 'dishwasher_mode'))
        return verdict('dishwasher', 'keys');
      if (has('mach_modes_td', 'program_phases_td', 'tumbledryer_mode'))
        return verdict('dryer', 'keys');
      if (has('mach_modes_wm', 'program_phases_wm')) return verdict('washer', 'keys');
      return undefined;
    case 'electrolux_status':
      if (objects.some((object) => /(^|_)(fridge|freezer)_.*targettemperature/.test(object)))
        return verdict('fridge', 'keys');
      return undefined;
    default:
      return undefined;
  }
}

/** A name as the words read it: lower case, its accents taken off ("Kühlschrank" is "kuhlschrank"). */
export function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

/** By the words of its names (its own and its model) in any of the eight languages. */
export function byWords(
  ...names: ReadonlyArray<string | null | undefined>
): KindVerdict | undefined {
  const text = names
    .filter((name): name is string => Boolean(name))
    .map(plain)
    .join(' | ');
  if (!text) return undefined;
  if (NOT_AN_APPLIANCE.test(text)) return { excluded: 'name' };
  const found = KIND_WORDS.find(([, pattern]) => pattern.test(text));
  return found ? { kind: found[0], by: 'words' } : undefined;
}

/**
 * What an appliance is, in the order its signals are surest: the card's `kind`; a 3D printer is never one; the model
 * (Miele's type, LG's device type); the keys only one kind has; the words of its name. None where nothing says.
 */
export function kindOf(
  signals: KindSignals,
  kind?: ApplianceKind | 'auto',
): KindVerdict | undefined {
  if (kind && kind !== 'auto' && APPLIANCE_KINDS.includes(kind)) return { kind, by: 'config' };
  if (signals.printer) return { excluded: 'printer' };
  return byModel(signals) ?? byKeys(signals) ?? byWords(signals.name, signals.model);
}

/** The programme select's options: Home Connect's selected or active programme, Matter's mode. */
const PROGRAM_SELECTS = ['selected_program', 'active_program'];

/** What a device says about its kind, from the registries and the states. */
export function signalsOf(hass: House | undefined, device: string, printer = false): KindSignals {
  const entry = hass?.devices?.[device];
  const name = entry?.name_by_user ?? entry?.name;
  const entries = entriesOf(hass, device);
  const candidates = candidatesOf(hass, entries, name);
  const platforms = entries.map((item) => item.platform).filter(knownPlatform);
  const programs: string[] = [];
  const states: string[] = [];
  const tops: number[] = [];
  for (const candidate of candidates) {
    const options = stateOf(hass, candidate.id)?.attributes['options'];
    const words = Array.isArray(options)
      ? options.filter((option): option is string => typeof option === 'string')
      : [];
    if (PROGRAM_SELECTS.includes(candidate.key ?? '')) programs.push(...words);
    if (/^current_state(_for_location)?$/.test(candidate.key ?? '')) states.push(...words);
    if (
      candidate.domain === 'number' &&
      candidate.max !== undefined &&
      /temperature|setpoint/.test(candidate.key ?? '')
    )
      tops.push(celsius(candidate.max, candidate.unit));
  }
  return {
    platform: platforms[0] ?? entries[0]?.platform,
    model: entry?.model,
    name,
    keys: new Set(
      candidates.map((candidate) => candidate.key).filter((key): key is string => Boolean(key)),
    ),
    objects: candidates.map((candidate) => candidate.object),
    domains: new Set(candidates.map((candidate) => candidate.domain)),
    programs,
    states,
    tops,
    ...(printer ? { printer } : {}),
  };
}

/* ---------- what each kind shows by default ---------- */

/** The readouts a card may show, as many as it names, in its order. */
export type ApplianceReadout =
  | 'program'
  | 'temperature'
  | 'spin'
  | 'dryness'
  | 'energy'
  | 'water'
  | 'cycles'
  | 'detergent'
  | 'elapsed'
  | 'total'
  | 'this_cycle'
  | 'probe'
  | 'power';

export const APPLIANCE_READOUTS: readonly ApplianceReadout[] = [
  'program',
  'temperature',
  'spin',
  'dryness',
  'energy',
  'water',
  'cycles',
  'detergent',
  'elapsed',
  'total',
  'this_cycle',
  'probe',
  'power',
];

/**
 * The hero a kind draws: a cycle's progress (washer, dryer, dishwasher, microwave, air fryer), a temperature on its
 * way to its target (oven, kettle), a hob's plates, a fridge's compartments, a state and its counters (coffee
 * machine, hood), a plug's power.
 */
export type Hero = 'cycle' | 'heat' | 'hob' | 'cold' | 'state' | 'plug';

/** A kind's stroke glyph: the ten kinds' are drawn by the appliances' chunk, the hood's and a plug's are Fluvy's. */
export type ApplianceGlyph =
  | 'washer'
  | 'dryer'
  | 'dishwasher'
  | 'oven'
  | 'microwave'
  | 'hob'
  | 'fridge'
  | 'coffee'
  | 'kettle'
  | 'fryer'
  | 'toaster'
  | 'blender'
  | 'sandwich'
  | 'fan'
  | 'plug';

export interface KindDefaults {
  readonly glyph: ApplianceGlyph;
  /** The tone of its running state (the card's colour stands in for the accent; a paused or failed one is the warning's). */
  readonly tone: Tone;
  readonly hero: Hero;
  readonly readouts: readonly ApplianceReadout[];
  readonly controls: readonly CommandName[];
  /** The steps of its cycle, in order; none where it has none to show. */
  readonly steps: readonly ApplianceStep[];
  /** Whether a finished cycle waits to be unloaded. */
  readonly unload: boolean;
  /** Seconds a door may stand open before the card says so (0: never). */
  readonly doorAlert: number;
  /** The layout a card of this kind takes where it names none: a big appliance's whole card, a small one's row. */
  readonly variant: 'full' | 'compact' | 'row';
}

const cycle = (
  glyph: ApplianceGlyph,
  readouts: readonly ApplianceReadout[],
  steps: readonly ApplianceStep[],
): KindDefaults => ({
  glyph,
  tone: 'accent',
  hero: 'cycle',
  readouts,
  controls: ['start', 'pause', 'stop', 'power'],
  steps,
  unload: true,
  doorAlert: 0,
  variant: 'full',
});

const cold = (glyph: ApplianceGlyph): KindDefaults => ({
  glyph,
  tone: 'cool',
  hero: 'cold',
  readouts: [],
  controls: [],
  steps: [],
  unload: false,
  doorAlert: 60,
  variant: 'full',
});

const small = (
  glyph: ApplianceGlyph,
  tone: Tone,
  hero: Hero,
  readouts: readonly ApplianceReadout[],
  controls: readonly CommandName[],
  variant: KindDefaults['variant'] = 'row',
): KindDefaults => ({
  glyph,
  tone,
  hero,
  readouts,
  controls,
  steps: [],
  unload: false,
  doorAlert: 0,
  variant,
});

/** Each kind's defaults: what it shows when the card names nothing, of what the appliance has. */
export const KIND_DEFAULTS: Readonly<Record<ApplianceKind, KindDefaults>> = {
  washer: cycle('washer', ['program', 'temperature', 'spin', 'energy'], ['wash', 'rinse', 'spin']),
  dryer: cycle('dryer', ['program', 'dryness', 'energy'], ['dry', 'cool', 'anti_crease']),
  washer_dryer: cycle(
    'washer',
    ['program', 'temperature', 'spin', 'dryness'],
    ['wash', 'rinse', 'spin', 'dry'],
  ),
  dishwasher: cycle(
    'dishwasher',
    ['program', 'energy', 'water'],
    ['prewash', 'wash', 'rinse', 'dry'],
  ),
  oven: {
    glyph: 'oven',
    tone: 'heat',
    hero: 'heat',
    readouts: ['program', 'probe', 'elapsed'],
    controls: ['stop', 'light', 'power'],
    steps: [],
    unload: false,
    doorAlert: 0,
    variant: 'full',
  },
  microwave: small('microwave', 'heat', 'cycle', ['program'], ['start', 'pause', 'stop']),
  hob: {
    glyph: 'hob',
    tone: 'heat',
    hero: 'hob',
    readouts: [],
    controls: ['power'],
    steps: [],
    unload: false,
    doorAlert: 0,
    variant: 'full',
  },
  hood: small('fan', 'fan', 'state', [], ['light', 'power'], 'compact'),
  fridge: cold('fridge'),
  freezer: cold('fridge'),
  wine: cold('fridge'),
  coffee: small('coffee', 'accent', 'state', [], ['power'], 'full'),
  kettle: small('kettle', 'heat', 'heat', [], ['start', 'stop']),
  air_fryer: small(
    'fryer',
    'heat',
    'cycle',
    ['program', 'temperature'],
    ['start', 'pause', 'stop'],
    'full',
  ),
  // what mostly lives on a smart plug: its switch and its power say all there is
  toaster: small('toaster', 'heat', 'state', [], ['power']),
  blender: small('blender', 'accent', 'state', [], ['power']),
  sandwich_maker: small('sandwich', 'heat', 'state', [], ['power']),
  appliance: {
    glyph: 'plug',
    tone: 'accent',
    hero: 'plug',
    readouts: ['power', 'this_cycle'],
    controls: ['power'],
    steps: [],
    unload: false,
    doorAlert: 0,
    variant: 'row',
  },
};

/** Whether a kind runs cycles that end and wait to be unloaded (the washer, the dryer, the dishwasher). */
export const unloads = (kind: ApplianceKind): boolean => KIND_DEFAULTS[kind].unload;

/* ---------- the house's appliances ---------- */

/** The roles that say an appliance is doing something: a job, its time, its progress. */
const JOB_ROLES = ['state', 'phase', 'finish', 'remaining', 'progress'] as const;

/** The house's appliances as last listed, by the registries they were read from. */
const listed = new WeakMap<
  object,
  { readonly devices: unknown; readonly list: readonly string[] }
>();

/**
 * The appliances of a house, once each, strictly: a device of an integration the card reads whose kind is known and
 * which says what it is doing (a cold or a small appliance needs only its kind); a device of any other integration by
 * a plug's signature — a power switch and a power reading on a device whose name says an appliance's kind. Never a
 * vacuum, a charger, a 3D printer (the printer card's own), or what waits for 1.10. Read again when the registries
 * change, not on every state: a 3,000-entity house is not read on every tick.
 */
export function applianceDevices(hass: House | undefined): readonly string[] {
  const entities = hass?.entities;
  if (!hass || !entities) return [];
  const memo = listed.get(entities);
  if (memo && memo.devices === hass.devices) return memo.list;
  const printers = new Set(printerDevices(hass));
  const devices: string[] = [];
  for (const entry of Object.values(entities))
    if (entry.device_id && !devices.includes(entry.device_id)) devices.push(entry.device_id);
  const list = devices.filter((device) => isAppliance(hass, device, printers.has(device)));
  listed.set(entities, { devices: hass.devices, list });
  return list;
}

/** Whether a device is an appliance, read strictly (see `applianceDevices`). */
function isAppliance(hass: House, device: string, printer: boolean): boolean {
  const signals = signalsOf(hass, device, printer);
  const verdict = kindOf(signals);
  if (!verdict || 'excluded' in verdict) return false;
  const entry = hass.devices?.[device];
  const candidates = candidatesOf(
    hass,
    entriesOf(hass, device),
    entry?.name_by_user ?? entry?.name,
  );
  const roles = new Set(candidates.map((candidate) => roleOf(candidate, 'strict')));
  if (knownPlatform(signals.platform)) {
    if (JOB_ROLES.some((role) => roles.has(role))) return true;
    // a fridge, a hob, a coffee machine has no job to say, only its kind
    if (verdict.by !== 'words' && !KIND_DEFAULTS[verdict.kind].steps.length) return true;
  }
  // a plug: its switch and its reading, on a device whose name says what it powers
  const switched = candidates.some(
    (candidate) => candidate.domain === 'switch' && candidate.category === undefined,
  );
  return verdict.by === 'words' && switched && roles.has('watts');
}
