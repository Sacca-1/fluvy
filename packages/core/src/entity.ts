import { areaOf } from './areas.js';
import type { HassEntity, HomeAssistant } from './ha/types.js';

/**
 * One honest view of an entity. `unavailable`, `unknown` and `missing` are first-class: a fifth of a
 * real instance sits in one of them at any time, so no card may assume a usable state.
 */
export type EntityStatus = 'ok' | 'unavailable' | 'unknown' | 'missing';

export interface EntityView {
  readonly id: string;
  readonly domain: string;
  readonly status: EntityStatus;
  readonly stateObj: HassEntity | undefined;
  readonly state: string;
  readonly name: string;
  readonly areaName: string;
  /** Numeric state, or null when the state is not a finite number. */
  readonly number: number | null;
  readonly unit: string;
  readonly deviceClass: string;
  supports(bit: number): boolean;
  attr<T = unknown>(key: string): T | undefined;
}

/** A finite number from an attribute, or null — integrations send null, strings and nothing at all. */
export function numberAttr(view: EntityView, key: string): number | null {
  const value = view.attr<unknown>(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A text attribute without its surrounding spaces, or '' when there is none (or it is not text). */
export function textAttr(view: EntityView, key: string): string {
  const value = view.attr<unknown>(key);
  return typeof value === 'string' ? value.trim() : '';
}

export const domainOf = (entityId: string): string =>
  entityId.slice(0, Math.max(0, entityId.indexOf('.')));

const titleCase = (id: string): string => {
  const object = id.slice(id.indexOf('.') + 1).replace(/_/g, ' ');
  return object.charAt(0).toUpperCase() + object.slice(1);
};

/**
 * What Home Assistant writes of an entity whatever its state (`Entity.__async_calculate_state`) that shapes its card:
 * its name, unit, device and state class and features, and its capabilities — a thermostat's modes and range, a fan's
 * presets, a light's colour modes, a select's options. Not its icon or picture (an entity that is not there draws the
 * `ban` glyph), nor its state's own attributes (a temperature now, a brightness, a position).
 */
const CAPABILITY =
  /^(friendly_name|unit_of_measurement|supported_features|options|min|max|step|mode)$|^(min|max)_|_(modes|list|step|class)$/;

/**
 * The last state this page read of each entity. One that goes missing — its integration not set up yet after a
 * restart, a YAML entity reloading, an id renamed — is drawn from its description and capabilities as they were, so
 * its card keeps the anatomy and the size it had (1.9, the owner's rule); never from its state's own attributes.
 */
const seen = new Map<string, HassEntity>();

export function resolveEntity(hass: HomeAssistant | undefined, id: string | undefined): EntityView {
  const entityId = id ?? '';
  const stateObj = hass?.states[entityId];
  if (stateObj) seen.set(entityId, stateObj);
  const kept = stateObj ?? seen.get(entityId);
  const attr = <T>(key: string): T | undefined =>
    (stateObj || CAPABILITY.test(key) ? kept?.attributes[key] : undefined) as T | undefined;
  const status: EntityStatus = !stateObj
    ? 'missing'
    : stateObj.state === 'unavailable'
      ? 'unavailable'
      : stateObj.state === 'unknown'
        ? 'unknown'
        : 'ok';
  const registry = hass?.entities?.[entityId]; // may be absent: some states never enter the registry
  const areaId = areaOf(hass, entityId);
  // `Number('')` and `Number('  ')` are 0: only a state with digits in it is a number
  const parsed =
    stateObj && status === 'ok' && /\d/.test(stateObj.state) ? Number(stateObj.state) : NaN;
  return {
    id: entityId,
    domain: domainOf(entityId),
    status,
    stateObj,
    state: stateObj?.state ?? 'missing',
    name: attr<string>('friendly_name') ?? registry?.name ?? titleCase(entityId),
    areaName: (areaId && hass?.areas?.[areaId]?.name) || '',
    number: Number.isFinite(parsed) ? parsed : null,
    unit: attr<string>('unit_of_measurement') ?? '',
    deviceClass: attr<string>('device_class') ?? '',
    supports: (bit) => ((attr<number>('supported_features') ?? 0) & bit) !== 0,
    attr,
  };
}

/**
 * A missing entity as its capabilities were last read: an unavailable state carrying them (a setpoint's range, a
 * select's options, a sensor's unit and class), for what reads a state object rather than a view. Nothing of its
 * state's own, as `resolveEntity` answers it.
 */
export function capabilitiesOf(id: string): HassEntity | undefined {
  const kept = seen.get(id);
  if (!kept) return undefined;
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(kept.attributes))
    if (CAPABILITY.test(key)) attributes[key] = value;
  return { ...kept, state: 'unavailable', attributes };
}

const ACTIVE_OFF = new Set([
  'off',
  'closed',
  'locked',
  'idle',
  'standby',
  'paused',
  'docked',
  'not_home',
  'disarmed',
  'unavailable',
  'unknown',
  'missing',
  'below_horizon',
]);

/**
 * Whether a state of a domain reads as "on/active" (what takes a filled tone): a state a history holds, without the
 * entity it belonged to.
 */
/** The house's weather entity, the first there is: the wall's screensaver and its preview show the same one. */
/**
 * A user's person: the `person.` entity that carries their user id, as every person of the house does (anyone may
 * read it, not only an administrator). Undefined for a user who is no one's person (a wall tablet's own account).
 */
export function personOf(
  hass: HomeAssistant | undefined,
  userId: string | undefined,
): string | undefined {
  if (!hass || !userId) return undefined;
  for (const state of Object.values(hass.states))
    if (domainOf(state.entity_id) === 'person' && state.attributes['user_id'] === userId)
      return state.entity_id;
  return undefined;
}

export const firstWeather = (hass: HomeAssistant | undefined): string | undefined =>
  Object.keys(hass?.states ?? {}).find((id) => id.startsWith('weather.'));

export function isActiveState(domain: string, state: string): boolean {
  // A sensor only measures: "21.5 °C" is not an on state, so it never takes the active fill.
  if (domain === 'sensor' || domain === 'number' || domain === 'input_number') return false;
  if (domain === 'climate' || domain === 'water_heater') return state !== 'off';
  return !ACTIVE_OFF.has(state);
}

/** Whether the entity reads as "on/active" for the purposes of a filled tone. */
export function isActive(view: EntityView): boolean {
  if (view.status !== 'ok') return false;
  return isActiveState(view.domain, view.state);
}

export const isUsable = (view: EntityView): boolean =>
  view.status === 'ok' || view.status === 'unknown';
