/*
 * An entity out of reach, as Home Assistant writes it (`Entity.__async_calculate_state`): whatever its state, it keeps
 * its description — name, icon, picture, unit, class, features — and its capability attributes (a thermostat's modes
 * and range, a fan's presets, a light's colour modes and effects, a select's options); the attributes of its state (a
 * temperature now, a brightness, a position, a humidity) are written only while it is available. The playground draws
 * a card's twin with it, and the cards' tests hold an unavailable card to its live one's anatomy (1.9: an unavailable
 * card keeps its configured size).
 *
 * Pure: the states handed in are never written.
 */
import type { SimulatedEntity } from './simulate.js';

/** What Home Assistant writes for an entity whatever its state. */
export const KEPT: ReadonlySet<string> = new Set([
  // every entity
  'friendly_name',
  'icon',
  'entity_picture',
  'unit_of_measurement',
  'device_class',
  'supported_features',
  'assumed_state',
  'attribution',
  'restored',
  // light
  'supported_color_modes',
  'min_color_temp_kelvin',
  'max_color_temp_kelvin',
  'min_mireds',
  'max_mireds',
  'effect_list',
  // climate, water heater, humidifier, fan, vacuum
  'hvac_modes',
  'min_temp',
  'max_temp',
  'target_temp_step',
  'fan_modes',
  'preset_modes',
  'swing_modes',
  'swing_horizontal_modes',
  'min_humidity',
  'max_humidity',
  'available_modes',
  'operation_list',
  'fan_speed_list',
  // media player
  'source_list',
  'sound_mode_list',
  // automation: its config's id (a capability: Home Assistant's editor reaches an automation that failed to load by it)
  'id',
  // select, number, text and their helpers; sensor; event, siren, remote
  'options',
  'min',
  'max',
  'step',
  'mode',
  'pattern',
  'state_class',
  'event_types',
  'available_tones',
  'activity_list',
]);

/** How an entity is out of reach: unavailable, unknown (available, with no state), or missing from the house. */
export type OutOfReach = 'unavailable' | 'unknown' | 'missing';

export const OUT_OF_REACH: readonly OutOfReach[] = ['unavailable', 'unknown', 'missing'];

/**
 * An entity as Home Assistant reports it out of reach: `unavailable` keeps what is written whatever the state and
 * drops the rest; `unknown` keeps it too and writes the state's own attributes as null (their value is none);
 * `missing` is no entity at all.
 */
export function outOfReach<E extends SimulatedEntity>(entity: E, kind: OutOfReach): E | undefined {
  if (kind === 'missing') return undefined;
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity.attributes))
    if (KEPT.has(key)) attributes[key] = value;
    else if (kind === 'unknown') attributes[key] = null;
  return { ...entity, state: kind, attributes };
}

/** The house's states with these entities out of reach; any other entity is handed back as it was. */
export function outOfReachStates<E extends SimulatedEntity>(
  states: Readonly<Record<string, E>>,
  ids: Iterable<string>,
  kind: OutOfReach,
): Record<string, E> {
  const out: Record<string, E> = { ...states };
  for (const id of ids) {
    const entity = states[id];
    if (!entity) continue;
    const reported = outOfReach(entity, kind);
    if (reported) out[id] = reported;
    else delete out[id];
  }
  return out;
}
