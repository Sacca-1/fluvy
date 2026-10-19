import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryDisplayEntry,
  FloorRegistryEntry,
  HassEntity,
  HomeAssistant,
} from '@fluvy/core';

/*
 * The alerts tests' house (never imported by the card): entities seeded in a line each, the registries built from
 * them, and a state changed the way Home Assistant changes it — a new states object, a new object for that entity
 * only, every other entity the same object as before.
 */

/** 2026-10-17 12:00 UTC: the tests' now. */
export const NOW = Date.UTC(2026, 9, 17, 12);
export const MINUTE = 60_000;

export interface Seed {
  readonly state: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  /** When the state last changed / the entity last updated (ms); now unless said. */
  readonly changed?: number;
  readonly updated?: number;
  readonly device?: string;
  readonly area?: string;
  readonly platform?: string;
  readonly hidden?: boolean;
  readonly category?: 'config' | 'diagnostic';
  readonly labels?: readonly string[];
}

export const iso = (ms: number): string => new Date(ms).toISOString();

export function stateOf(id: string, seed: Seed): HassEntity {
  const changed = seed.changed ?? NOW;
  return {
    entity_id: id,
    state: seed.state,
    attributes: { friendly_name: id.slice(id.indexOf('.') + 1), ...seed.attributes },
    last_changed: iso(changed),
    last_updated: iso(seed.updated ?? changed),
  };
}

export interface HouseOptions {
  readonly devices?: Readonly<Record<string, Partial<DeviceRegistryEntry>>>;
  readonly areas?: Readonly<Record<string, Partial<AreaRegistryEntry>>>;
  readonly floors?: Readonly<Record<string, Partial<FloorRegistryEntry>>>;
  readonly admin?: boolean;
  readonly user?: string;
}

/** A house of these entities, its registries made from them. */
export function house(
  seeds: Readonly<Record<string, Seed>>,
  options: HouseOptions = {},
): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, EntityRegistryDisplayEntry> = {};
  const devices: Record<string, DeviceRegistryEntry> = {};
  for (const [id, seed] of Object.entries(seeds)) {
    states[id] = stateOf(id, seed);
    entities[id] = {
      entity_id: id,
      ...(seed.device ? { device_id: seed.device } : {}),
      ...(seed.area ? { area_id: seed.area } : {}),
      ...(seed.platform ? { platform: seed.platform } : {}),
      ...(seed.hidden ? { hidden: true } : {}),
      ...(seed.category ? { entity_category: seed.category } : {}),
      ...(seed.labels ? { labels: [...seed.labels] } : {}),
    };
    if (seed.device && !devices[seed.device])
      devices[seed.device] = {
        id: seed.device,
        name: seed.device,
        name_by_user: null,
        area_id: null,
      };
  }
  for (const [id, device] of Object.entries(options.devices ?? {}))
    devices[id] = { id, name: id, name_by_user: null, area_id: null, ...devices[id], ...device };
  const areas = Object.fromEntries(
    Object.entries(options.areas ?? {}).map(([id, area]) => [
      id,
      { area_id: id, name: id, ...area },
    ]),
  );
  const floors = Object.fromEntries(
    Object.entries(options.floors ?? {}).map(([id, floor]) => [
      id,
      { floor_id: id, name: id, ...floor },
    ]),
  );
  return {
    states,
    entities,
    devices,
    areas,
    floors,
    language: 'en',
    // the server's zone, UTC: a test reads the same wherever it runs
    locale: { language: 'en', number_format: 'language', time_format: '24', time_zone: 'server' },
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
    user: { id: options.user ?? 'u1', name: 'Marta', is_admin: options.admin ?? true },
  } as unknown as HomeAssistant;
}

/** The house after one entity changed (or appeared, or — `undefined` — left): only its object is new. */
export function change(hass: HomeAssistant, id: string, seed: Seed | undefined): HomeAssistant {
  const states = { ...hass.states };
  if (seed) states[id] = stateOf(id, seed);
  else delete states[id];
  return { ...hass, states };
}
