import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { stateOf } from './refs.js';
import type { Candidate } from './roles.js';

/*
 * What a fridge keeps cold, a hob heats and a fridge can do in a hurry. A compartment is known by its integration's
 * key (Home Connect's refrigerator, freezer, chiller, bottle cooler and wine compartments; SmartThings' cooler, freezer
 * and CoolSelect+; Miele's climate per zone), by its id (LG's "{location}" is the raw location, fridge or freezer, in
 * every language; Electrolux's and LG's older integration's ids say it too), else by its range: a setpoint that tops
 * out below −5 °C is a freezer's, below 3 °C a chiller's, from 14 °C a wine cooler's, any other a fridge's (Matter's
 * compartments carry no word for what they are). Each compartment is its setpoint, its reading and its door. A quick
 * mode (super cool, super freeze, eco, holiday, the ice maker, sabbath, the child lock) is a switch; a hob's plates are
 * its levels. Setting a compartment's temperature is a number's `set_value`, a climate's `set_temperature` or a level
 * select's `select_option`, for the integrations whose setpoints are pinned by their source; the card settles a held
 * stepper before it sends one call.
 */

export type ZoneKind = 'fridge' | 'freezer' | 'chiller' | 'flex' | 'wine' | 'bottle' | 'zone';
export const ZONE_KINDS: readonly ZoneKind[] = [
  'fridge',
  'freezer',
  'chiller',
  'flex',
  'wine',
  'bottle',
  'zone',
];

/** What an entity is to a compartment: its setpoint (or level), its reading, its door. */
export type ZonePart = 'setpoint' | 'current' | 'door';

export interface ZoneOf {
  readonly part: ZonePart;
  /** What the compartment is, where its key or its id says; else its range decides. */
  readonly kind?: ZoneKind;
  /** Its number among compartments of a kind (Home Connect's wine compartments 2 and 3, Miele's zones). */
  readonly index?: number;
}

/** Home Connect's compartments (number.py:36-80, binary_sensor.py): the setpoint's key, and its door's. */
const HOME_CONNECT: ReadonlyArray<readonly [RegExp, ZoneKind]> = [
  [/^refrigerator_/, 'fridge'],
  [/^freezer_/, 'freezer'],
  [/^(chiller|chiller_left|chiller_right|left_chiller|right_chiller|common_chiller)_/, 'chiller'],
  [/^bottle_cooler_/, 'bottle'],
  [/^wine_compartment_/, 'wine'],
  [/^flex_compartment_/, 'flex'],
];

/** A compartment named in an id: LG's location, Electrolux's source, LG's older integration's names. */
const IN_ID: ReadonlyArray<readonly [RegExp, ZoneKind]> = [
  [/(^|_)(freezer|freeze)(_|$)/, 'freezer'],
  [/(^|_)(fridge|refrigerator|cooler)(_|$)/, 'fridge'],
  [/(^|_)(convertible|flex|cool_select_plus)(_|$)/, 'flex'],
  [/(^|_)chiller(_|$)/, 'chiller'],
  [/(^|_)wine(_|$)/, 'wine'],
];

const numbered = (text: string): number | undefined => {
  const match = /(?:^|_)(\d)(?:_|$)/.exec(text);
  return match ? Number(match[1]) : undefined;
};

const kindInId = (object: string): ZoneKind | undefined =>
  IN_ID.find(([pattern]) => pattern.test(object))?.[1];

/** A compartment's part, by its integration's key, its id or (Matter's) its range; none for anything else. */
export function zoneOf(candidate: Candidate): ZoneOf | undefined {
  const { domain, key, platform, object } = candidate;
  // the second of two of a kind: Home Connect's right-hand chiller, its wine compartments 2 and 3, Miele's zones
  const index = /(^|_)right(_|$)/.test(key ?? '') ? 2 : numbered(key ?? object);
  const at = (part: ZonePart, kind?: ZoneKind): ZoneOf => ({
    part,
    ...(kind ? { kind } : {}),
    ...(index !== undefined && index > 1 ? { index } : {}),
  });
  switch (platform) {
    case 'home_connect': {
      const kind = HOME_CONNECT.find(([pattern]) => pattern.test(key ?? ''))?.[1];
      if (!kind) return undefined;
      if (domain === 'number' && /setpoint_temperature$/.test(key ?? ''))
        return at('setpoint', kind);
      if (domain === 'binary_sensor' && /_door$/.test(key ?? '')) return at('door', kind);
      return undefined;
    }
    case 'miele':
      if (domain === 'climate') {
        const kind = (
          { refrigerator: 'fridge', freezer: 'freezer', wine_cabinet: 'wine' } as const
        )[key as 'refrigerator' | 'freezer' | 'wine_cabinet'];
        return at('setpoint', kind);
      }
      // its zones' temperature sensors say what their climates already do
      return undefined;
    case 'lg_thinq': {
      // a compartment's by its location; an oven's cavity ("upper") sets no compartment
      const kind = kindInId(object);
      if (
        domain === 'number' &&
        key === 'target_temperature_for_location' &&
        (kind || (candidate.max !== undefined && celsius(candidate.max, candidate.unit) <= 30))
      )
        return at('setpoint', kind);
      return undefined;
    }
    case 'smartthings': {
      const kind = (
        {
          cooler_temperature: 'fridge',
          freezer_temperature: 'freezer',
          cool_select_plus_temperature: 'flex',
          cooler_door: 'fridge',
          freezer_door: 'freezer',
          cool_select_plus_door: 'flex',
        } as const
      )[key as 'cooler_temperature'];
      if (domain === 'number' && (kind || key === 'target_temperature'))
        return at('setpoint', kind);
      if (domain === 'sensor' && kind) return at('current', kind);
      if (domain === 'binary_sensor' && kind) return at('door', kind);
      return undefined;
    }
    case 'matter':
      // a compartment's setpoint tops out where no oven's or washer's does
      if (domain === 'number' && key === 'temperature_setpoint')
        return candidate.max !== undefined && celsius(candidate.max, candidate.unit) <= 30
          ? at('setpoint')
          : undefined;
      if (domain === 'select' && key === 'temperature_level') return at('setpoint');
      return undefined;
    case 'whirlpool':
      return domain === 'select' && key === 'refrigerator_temperature_level'
        ? at('setpoint', 'fridge')
        : undefined;
    case 'electrolux_status': {
      const kind = kindInId(object);
      if (!kind) return undefined;
      if (domain === 'number' && /targettemperaturec?$/.test(object)) return at('setpoint', kind);
      if (domain === 'sensor' && /(display|sensor)temperaturec?$/.test(object))
        return at('current', kind);
      if (domain === 'binary_sensor' && /doorstate$/.test(object)) return at('door', kind);
      return undefined;
    }
    case 'smartthinq_sensors':
      // its climates set a compartment each ("fridge", "freezer"); its sensors (and the device sensor's
      // attributes) read them
      if (domain === 'climate' && kindInId(object)) return at('setpoint', kindInId(object));
      if (domain === 'sensor' && /(^|_)(fridge|freezer)_temp$/.test(object))
        return at('current', kindInId(object));
      return undefined;
    default:
      return undefined;
  }
}

/** A temperature in °C, whatever unit it is written in. */
export const celsius = (value: number, unit: string | undefined): number =>
  /F$/.test(unit ?? '') ? ((value - 32) * 5) / 9 : value;

/**
 * A compartment by its range, where nothing names it: a freezer's tops out below −5 °C, a chiller's below 3 °C, a wine
 * cooler's from 14 °C; any other is a fridge's.
 */
export function zoneByRange(max: number, unit: string | undefined): ZoneKind {
  const top = celsius(max, unit);
  if (top <= -5) return 'freezer';
  if (top <= 3) return 'chiller';
  if (top >= 14) return 'wine';
  return 'fridge';
}

/** A compartment: its setpoint (a number, a climate, a level), its reading and its door, each where it has one. */
export interface Zone {
  readonly kind: ZoneKind;
  /** Its number among compartments of its kind, from the second ("Wine 2"). */
  readonly index?: number;
  readonly setpoint?: string;
  readonly current?: string;
  readonly door?: string;
}

/** The order compartments are listed in: the fridge first, then the freezer, the others after. */
const ORDER: readonly ZoneKind[] = [
  'fridge',
  'freezer',
  'chiller',
  'flex',
  'bottle',
  'wine',
  'zone',
];

/**
 * A device's compartments, from the entities `roles.ts` gathered: each setpoint, reading and door joined by what the
 * compartment is (a setpoint without a word for it by its range: its `max`, its options' last), listed fridge first.
 */
export function zonesOf(
  hass: Pick<HomeAssistant, 'states' | 'entities'> | undefined,
  candidates: readonly Candidate[],
): Zone[] {
  const zones = new Map<
    string,
    { kind: ZoneKind; index?: number } & Partial<Record<ZonePart, string>>
  >();
  for (const candidate of candidates) {
    const part = zoneOf(candidate);
    if (!part) continue;
    const state = stateOf(hass, candidate.id);
    const kind = part.kind ?? rangeKind(state, candidate) ?? 'zone';
    const id = `${kind}:${part.index ?? 1}`;
    const zone = zones.get(id) ?? { kind, ...(part.index ? { index: part.index } : {}) };
    // a climate's own reading comes with it: it is the setpoint and the reading at once, until a sensor reads it
    if (!zone[part.part] || (part.part === 'current' && zone.current === zone.setpoint))
      zone[part.part] = candidate.id;
    if (candidate.domain === 'climate' && !zone.current) zone.current = candidate.id;
    zones.set(id, zone);
  }
  return [...zones.values()]
    .filter((zone) => zone.setpoint || zone.current)
    .sort(
      (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.index ?? 1) - (b.index ?? 1),
    )
    .map(({ kind, index, setpoint, current, door }) => ({
      kind,
      ...(index ? { index } : {}),
      ...(setpoint ? { setpoint } : {}),
      ...(current ? { current } : {}),
      ...(door ? { door } : {}),
    }));
}

/** A setpoint's kind by its range: a number's or a climate's top, else none (a level select says no temperature). */
function rangeKind(state: HassEntity | undefined, candidate: Candidate): ZoneKind | undefined {
  const top = state?.attributes['max'] ?? state?.attributes['max_temp'] ?? candidate.max;
  return typeof top === 'number'
    ? zoneByRange(top, candidate.unit ?? state?.attributes.unit_of_measurement)
    : undefined;
}

/* ---------- setting a compartment ---------- */

/**
 * The integrations whose compartment setpoints the card may set, each pinned by its source (and its contract test):
 * a number's `set_value`, a climate's `set_temperature`, a level select's `select_option`. The others' are read only.
 */
export const SETPOINTS_PINNED: readonly string[] = [
  // lg_thinq/number.py: target_temperature_for_location, set_native_value
  'lg_thinq',
  // home_connect/number.py:36-80 (the compartments' setpoints), :175 set_native_value
  'home_connect',
  // miele/climate.py:248 async_set_temperature
  'miele',
  // smartthings/number.py:203-206 (cooler, freezer, onedoor), set_native_value
  'smartthings',
  // matter/number.py:616-636 temperature_setpoint; select.py temperature_level
  'matter',
  // whirlpool/select.py refrigerator_temperature_level
  'whirlpool',
];

/** How a setpoint is set: the service, the field it takes, and the range or the levels it allows. */
export interface Setter {
  readonly domain: 'number' | 'climate' | 'select';
  readonly service: 'set_value' | 'set_temperature' | 'select_option';
  readonly field: 'value' | 'temperature' | 'option';
  /** A temperature's range and step, in its own unit. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  /** A level select's levels, in the order it lists them. */
  readonly options?: readonly string[];
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * How a compartment's setpoint is set, for an integration whose setpoints are pinned; none for the others, or for an
 * entity that cannot be set (a reading, an unavailable one).
 */
export function zoneSetter(
  hass: Pick<HomeAssistant, 'config'> | undefined,
  platform: string | undefined,
  state: HassEntity | undefined,
): Setter | undefined {
  return SETPOINTS_PINNED.includes(platform ?? '') ? setterFor(hass, state) : undefined;
}

/**
 * How an entity that holds a temperature or a level is set: a number's range and step, a climate's (in the house's
 * unit), a level select's levels; none for a reading. What it can do it can do out of reach too (Home Assistant
 * keeps a number's range and a select's options on an unavailable state): a card keeps the stepper's room then,
 * disabled, so its rows stack alike. Whether it may act is the caller's to say.
 */
export function setterFor(
  hass: Pick<HomeAssistant, 'config'> | undefined,
  state: HassEntity | undefined,
): Setter | undefined {
  if (!state) return undefined;
  const domain = state.entity_id.slice(0, state.entity_id.indexOf('.'));
  const attributes = state.attributes;
  const range = (
    min: unknown,
    max: unknown,
    step: unknown,
    unit: string | undefined,
  ): Pick<Setter, 'min' | 'max' | 'step' | 'unit'> => {
    const [low, high, by] = [finite(min), finite(max), finite(step)];
    return {
      ...(low !== undefined ? { min: low } : {}),
      ...(high !== undefined ? { max: high } : {}),
      ...(by !== undefined ? { step: by } : {}),
      ...(unit ? { unit } : {}),
    };
  };
  if (domain === 'number')
    return {
      domain,
      service: 'set_value',
      field: 'value',
      ...range(
        attributes['min'],
        attributes['max'],
        attributes['step'],
        attributes.unit_of_measurement,
      ),
    };
  if (domain === 'climate')
    return {
      domain,
      service: 'set_temperature',
      field: 'temperature',
      ...range(
        attributes['min_temp'],
        attributes['max_temp'],
        attributes['target_temp_step'],
        hass?.config.unit_system.temperature,
      ),
    };
  if (domain === 'select') {
    const options = attributes['options'];
    return Array.isArray(options) && options.every((option) => typeof option === 'string')
      ? { domain, service: 'select_option', field: 'option', options }
      : undefined;
  }
  return undefined;
}

/** The call that sets a setpoint: the service, its data (the value, or the level), and the entity. */
export function setterCall(
  setter: Setter,
  entity: string,
  value: number | string,
): { domain: string; service: string; data: Record<string, unknown> } {
  return {
    domain: setter.domain,
    service: setter.service,
    data: { entity_id: entity, [setter.field]: value },
  };
}

/** A setpoint's current value: a number's state, a climate's target, a level select's option. */
export function setpointOf(state: HassEntity | undefined): number | string | null {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null;
  const domain = state.entity_id.slice(0, state.entity_id.indexOf('.'));
  if (domain === 'climate') return finite(state.attributes['temperature']) ?? null;
  if (domain === 'select') return state.state;
  const value = Number(state.state);
  return /\d/.test(state.state) && Number.isFinite(value) ? value : null;
}

/* ---------- quick modes and plates ---------- */

/** A fridge's quick modes, as the plan names them. */
export type BoostKey =
  'super_cool' | 'super_freeze' | 'eco' | 'holiday' | 'ice_maker' | 'sabbath' | 'child_lock';
export const BOOST_KEYS: readonly BoostKey[] = [
  'super_cool',
  'super_freeze',
  'eco',
  'holiday',
  'ice_maker',
  'sabbath',
  'child_lock',
];

/** Each integration's switches for them (lg_thinq/switch.py, home_connect/switch.py, miele/switch.py, smartthings/switch.py). */
const BOOSTS: Readonly<Record<string, Readonly<Record<string, BoostKey>>>> = {
  lg_thinq: {
    express_fridge: 'super_cool',
    rapid_freeze: 'super_freeze',
    express_mode: 'super_freeze',
  },
  home_connect: {
    refrigerator_super_mode: 'super_cool',
    freezer_super_mode: 'super_freeze',
    eco_mode: 'eco',
    vacation_mode: 'holiday',
    sabbath_mode: 'sabbath',
    child_lock: 'child_lock',
  },
  miele: { supercooling: 'super_cool', superfreezing: 'super_freeze' },
  smartthings: {
    power_cool: 'super_cool',
    power_freeze: 'super_freeze',
    ice_maker: 'ice_maker',
    ice_maker_2: 'ice_maker',
    sabbath_mode: 'sabbath',
  },
};

/** LG's older integration's switches, by the ends of their ids (switch.py: express cool, express mode, eco friendly). */
const SMARTTHINQ_BOOSTS: ReadonlyArray<readonly [RegExp, BoostKey]> = [
  [/(^|_)express_cool$/, 'super_cool'],
  [/(^|_)express_(mode|freeze)(_\d+)?$/, 'super_freeze'],
  [/(^|_)eco_friendly$/, 'eco'],
];

/** A fridge's quick mode, by its switch's key (or, for Electrolux and LG's older integration, its id); none for any other switch. */
export function boostOf(candidate: Candidate): BoostKey | undefined {
  if (candidate.domain !== 'switch') return undefined;
  if (candidate.platform === 'electrolux_status')
    return /fastmode$/.test(candidate.object) ? 'super_freeze' : undefined;
  if (candidate.platform === 'smartthinq_sensors')
    return SMARTTHINQ_BOOSTS.find(([pattern]) => pattern.test(candidate.object))?.[1];
  return BOOSTS[candidate.platform ?? '']?.[candidate.key ?? ''];
}

/** A hob's burner, by where it sits: the words a range names its zones with (LG's, in every language). */
export type Burner = 'left_front' | 'left_rear' | 'center' | 'right_front' | 'right_rear';

/** Where a plate sits, where its id or attribute says ("cooktop_left_front_state", "burner_1" says nothing). */
export const burnerOf = (ref: string): Burner | undefined =>
  /(left_front|left_rear|cent(?:er|re)|right_front|right_rear)/
    .exec(ref)?.[1]
    ?.replace('centre', 'center') as Burner | undefined;

/** A hob's plate: Miele's "Plate {n}", LG's power level per burner, SmartThings' burner levels, LG's older cooktop states. */
export function hobOf(candidate: Candidate): { readonly index?: number } | undefined {
  const { domain, key, platform, object } = candidate;
  if (domain !== 'sensor') return undefined;
  const plate =
    (platform === 'miele' && key === 'plate') ||
    (platform === 'lg_thinq' && (key === 'power_level' || key === 'power_level_for_location')) ||
    (platform === 'smartthings' && key === 'manual_level') ||
    (platform === 'smartthinq_sensors' && /(^|_)cooktop_[a-z_]+_state$/.test(object));
  if (!plate) return undefined;
  const index = numbered(object);
  return index !== undefined ? { index } : {};
}
