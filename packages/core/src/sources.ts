import { areaOf } from './areas.js';
import { domainOf } from './entity.js';
import type { HomeAssistant } from './ha/types.js';

/** What a page is narrowed to, as Home Assistant's own pickers and links say it (`?entity_id=…`). */
export interface SourceTarget {
  readonly floor_id?: string | readonly string[];
  readonly area_id?: string | readonly string[];
  readonly device_id?: string | readonly string[];
  readonly entity_id?: string | readonly string[];
  readonly label_id?: string | readonly string[];
}

/** Home Assistant's source filters: domains (`sensor`, or `sensor/power` for a device class) and integrations. */
export interface SourceFilters {
  readonly types?: readonly string[];
  readonly integrations?: readonly string[];
}

const TARGET_KEYS = ['floor_id', 'area_id', 'device_id', 'entity_id', 'label_id'] as const;

const list = (value: string | readonly string[] | undefined): string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : [...value];

export const countTargets = (target: SourceTarget): number =>
  TARGET_KEYS.reduce((count, key) => count + list(target[key]).length, 0);

export const countFilters = (filters: SourceFilters): number =>
  (filters.types?.length ? 1 : 0) + (filters.integrations?.length ? 1 : 0);

/**
 * The entities a target covers: picked entities, a device's, an area's (an entity in no area of its own takes its
 * device's), a floor's areas', and what carries a label (an entity, a device's entities, an area's).
 */
export function targetEntities(hass: HomeAssistant, target: SourceTarget): Set<string> {
  const entities = new Set(list(target.entity_id));
  const devices = new Set(list(target.device_id));
  const areas = new Set(list(target.area_id));
  const floors = new Set(list(target.floor_id));
  const labels = new Set(list(target.label_id));
  if (floors.size)
    for (const area of Object.values(hass.areas ?? {}))
      if (area.floor_id && floors.has(area.floor_id)) areas.add(area.area_id);
  if (labels.size) {
    for (const area of Object.values(hass.areas ?? {}))
      if (area.labels?.some((label) => labels.has(label))) areas.add(area.area_id);
    for (const device of Object.values(hass.devices ?? {}))
      if (device.labels?.some((label) => labels.has(label))) devices.add(device.id);
  }
  for (const entry of Object.values(hass.entities ?? {})) {
    const area = areaOf(hass, entry.entity_id);
    if (
      (entry.device_id && devices.has(entry.device_id)) ||
      (area && areas.has(area)) ||
      entry.labels?.some((label) => labels.has(label))
    )
      entities.add(entry.entity_id);
  }
  return entities;
}

/** Entities kept by the source filters (a type is a domain, or a domain narrowed to a device class). */
export function applySourceFilters(
  hass: HomeAssistant,
  ids: Iterable<string>,
  filters: SourceFilters,
): string[] {
  const types = filters.types ?? [];
  const integrations = new Set(filters.integrations ?? []);
  const kept: string[] = [];
  for (const id of ids) {
    const domain = domainOf(id);
    const deviceClass = hass.states[id]?.attributes.device_class;
    const typed =
      !types.length ||
      types.some((type) =>
        type.includes('/') ? type === `${domain}/${String(deviceClass)}` : type === domain,
      );
    const integrated = !integrations.size || integrations.has(hass.entities?.[id]?.platform ?? '');
    if (typed && integrated) kept.push(id);
  }
  return kept;
}

/**
 * The entities a page asks for, or undefined for all of them. Without a target, `whenUntargeted` decides what the
 * whole house means: the Activity page leaves out what it cannot show (a continuous sensor with a unit), the History
 * page asks for nothing at all until something is picked.
 */
export function sourceEntities(
  hass: HomeAssistant,
  target: SourceTarget,
  filters: SourceFilters,
  whenUntargeted: (hass: HomeAssistant) => string[] | undefined = (house) =>
    Object.keys(house.states).filter((id) => !house.states[id]?.attributes.unit_of_measurement),
): string[] | undefined {
  const targeted = countTargets(target) > 0;
  if (!targeted && !countFilters(filters)) return undefined;
  const base = targeted ? targetEntities(hass, target) : whenUntargeted(hass);
  if (!base) return undefined;
  return applySourceFilters(hass, [...base], filters).sort();
}

/** A target from the page's address (`?entity_id=light.a,light.b&area_id=…`), as Home Assistant writes it. */
export function targetFromSearch(search: string): SourceTarget {
  const params = new URLSearchParams(search);
  const target: Record<string, string[]> = {};
  for (const key of TARGET_KEYS) {
    const value = params.get(key);
    if (value) target[key] = value.split(',').filter(Boolean);
  }
  return target;
}
