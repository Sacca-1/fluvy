import type {
  DeviceRegistryEntry,
  EntityRegistryDisplayEntry,
  HassEntity,
  HomeAssistant,
} from '@fluvy/core';
import type { ApplianceKind, Exclusion } from '../kinds.js';
import type { ApplianceRole } from '../roles.js';
import type { ApplianceStatus } from '../status.js';

/*
 * Appliances as their integrations register them, for the tests and the playground: each a device, its entities as
 * the registry lists them (their translation keys, their platform) and their states, at a moment the caller gives —
 * every time in them is counted from it. The keyed integrations' ids are a German house's (Home Assistant names an
 * entity in its own language), so nothing is found by an English id that only an English house would have; the
 * integrations read by their ids keep the words their source writes.
 */

/**
 * A state as the playground seeds it (`apps/playground/src/hass.ts` StateSeed): the entity, its state, its
 * attributes, and how many seconds ago it changed (two hours when unsaid).
 */
export type Seed = [
  entity: string,
  state: string,
  attributes?: Record<string, unknown>,
  ago?: number,
];

export interface ApplianceFixture {
  /** What it shows, for a test's name and a frame's title. */
  readonly title: string;
  readonly platform: string;
  readonly device: DeviceRegistryEntry;
  readonly entities: readonly EntityRegistryDisplayEntry[];
  readonly states: readonly Seed[];
  /** What the modules must read of it. */
  readonly expected: {
    readonly kind?: ApplianceKind;
    readonly excluded?: Exclusion;
    readonly status?: ApplianceStatus;
    /** Roles that must be found, by the entity that plays them. */
    readonly roles?: Partial<Record<ApplianceRole, string>>;
    /** Whether the house's search lists it (an appliance found strictly). */
    readonly listed?: boolean;
  };
}

/** A fixture at a moment: every time in it counted from `now` (ms). */
export type FixtureAt = (now: number) => ApplianceFixture;

/** A moment `minutes` from now, as a timestamp sensor says it. */
export const minutesFrom = (now: number, minutes: number): string =>
  new Date(now + minutes * 60_000).toISOString();

/** A device as the registry lists it. */
export const device = (
  id: string,
  name: string,
  model: string | null,
  manufacturer: string | null = null,
): DeviceRegistryEntry => ({
  id,
  name,
  name_by_user: null,
  area_id: null,
  model,
  manufacturer,
  via_device_id: null,
});

/** The entries of one device of one integration: `(id, key, more)` each. */
export const entriesFor =
  (platform: string, device: string) =>
  (
    entity_id: string,
    translation_key?: string,
    more: Partial<EntityRegistryDisplayEntry> = {},
  ): EntityRegistryDisplayEntry => ({
    entity_id,
    device_id: device,
    platform,
    ...(translation_key ? { translation_key } : {}),
    ...more,
  });

/** A house holding the fixtures: their registries and their states, each changed `ago` seconds before `now`. */
export function houseOf(
  fixtures: readonly ApplianceFixture[],
  now: number,
  base: Partial<HomeAssistant> = {},
): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  const entities: Record<string, EntityRegistryDisplayEntry> = {};
  const devices: Record<string, DeviceRegistryEntry> = {};
  for (const fixture of fixtures) {
    devices[fixture.device.id] = fixture.device;
    for (const entry of fixture.entities) entities[entry.entity_id] = entry;
    for (const [entity_id, state, attributes = {}, ago = 7200] of fixture.states) {
      const changed = new Date(now - ago * 1000).toISOString();
      states[entity_id] = {
        entity_id,
        state,
        attributes: { friendly_name: entity_id, ...attributes },
        last_changed: changed,
        last_updated: changed,
      };
    }
  }
  return {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    config: { unit_system: { temperature: '°C', length: 'km' } },
    ...base,
    states: { ...(base.states ?? {}), ...states },
    entities: { ...(base.entities ?? {}), ...entities },
    devices: { ...(base.devices ?? {}), ...devices },
  } as HomeAssistant;
}
