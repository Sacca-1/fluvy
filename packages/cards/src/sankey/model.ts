import type { EntityView, HomeAssistant } from '@fluvy/core';
import type { Allocation, Totals } from '../energy-model/allocate.js';

/**
 * Where a period's energy went, as rows: the sources (grid, battery, sun), what they fed (the house, the battery's
 * charge, the export), and the house's own devices under it. Figures are kWh, the Energy dashboard's: a source is
 * its meter's total, the house what the hours used, and every link between them Home Assistant's allocation.
 */

export type Ink = 'grid' | 'battery' | 'solar' | 'home';
export type SourceKey = 'grid' | 'battery' | 'solar';
export type TargetKey = 'house' | 'charged' | 'exported';
/** A device's own key, the devices beyond the cap, what the devices do not account for. */
export type KidKey = `device:${number}` | 'other' | 'unmeasured';

export interface FlowNode<K extends string = string> {
  readonly key: K;
  readonly value: number;
  readonly ink: Ink;
  /** Drawn as an outline: a figure worked out, not metered (the house less its devices). */
  readonly dashed?: boolean;
}

export interface FlowLink {
  readonly from: SourceKey;
  readonly to: TargetKey;
  readonly value: number;
  readonly ink: Ink;
}

/** A device as the card was given it (or the Energy dashboard lists it): its index, its period's kWh, its parent. */
export interface DeviceInput {
  readonly index: number;
  /** Its statistic: what a `parent` names. */
  readonly id: string;
  /** kWh over the period; null when it has no statistics at all. */
  readonly value: number | null;
  readonly parent?: string | undefined;
}

export interface SankeyModel {
  readonly sources: readonly FlowNode<SourceKey>[];
  readonly targets: readonly FlowNode<TargetKey>[];
  readonly links: readonly FlowLink[];
  /** The house's top-level devices, the rest of them, and what they leave unmeasured. Empty with no device. */
  readonly kids: readonly FlowNode<KidKey>[];
  /** Ribbons that cross another, in the order chosen: 0 whenever an order allows it. */
  readonly crossings: number;
  /** Every source's energy (the head's total). */
  readonly total: number;
}

/** Below this (kWh), a figure reads "0.00" and is left out. */
export const ZERO = 0.005;

const SOURCES: readonly SourceKey[] = ['grid', 'battery', 'solar'];
const TARGETS: readonly TargetKey[] = ['house', 'charged', 'exported'];
const pos = (n: number | undefined): number => Math.max(0, n ?? 0);

export function sankeyModel(
  totals: Totals,
  a: Allocation,
  devices: readonly DeviceInput[],
  maxDevices: number,
): SankeyModel {
  const sourceValue: Record<SourceKey, number> = {
    grid: pos(totals.fromGrid),
    battery: pos(totals.fromBattery),
    solar: pos(totals.solar),
  };
  const house = Math.max(
    0,
    sourceValue.grid +
      sourceValue.battery +
      sourceValue.solar -
      pos(totals.toGrid) -
      pos(totals.toBattery),
  );
  const targetValue: Record<TargetKey, number> = {
    house,
    charged: pos(totals.toBattery),
    exported: pos(totals.toGrid),
  };
  const sources = SOURCES.filter((k) => sourceValue[k] >= ZERO);
  const targets = TARGETS.filter((k) => targetValue[k] >= ZERO);
  const candidates: FlowLink[] = [
    { from: 'grid', to: 'house', value: a.usedGrid, ink: 'grid' },
    { from: 'grid', to: 'charged', value: a.gridToBattery, ink: 'grid' },
    { from: 'battery', to: 'house', value: a.usedBattery, ink: 'battery' },
    { from: 'battery', to: 'exported', value: a.batteryToGrid, ink: 'battery' },
    { from: 'solar', to: 'house', value: a.usedSolar, ink: 'solar' },
    { from: 'solar', to: 'charged', value: a.solarToBattery, ink: 'solar' },
    { from: 'solar', to: 'exported', value: a.solarToGrid, ink: 'solar' },
  ];
  const links = candidates.filter(
    (l) => l.value >= ZERO && sources.includes(l.from) && targets.includes(l.to),
  );
  const order = bestOrder(sources, targets, links);
  const kids = targets.includes('house') ? houseKids(house, devices, maxDevices) : [];
  return {
    sources: order.sources.map((key) => ({ key, value: sourceValue[key], ink: key })),
    targets: order.targets.map((key) => ({
      key,
      value: targetValue[key],
      ink: key === 'house' ? 'home' : key === 'charged' ? 'battery' : 'grid',
    })),
    links,
    kids,
    crossings: order.crossings,
    total: sources.reduce((sum, k) => sum + sourceValue[k], 0),
  };
}

/* ---------- the order of the rows ---------- */

function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((item, i) =>
    permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/** How far an order is from the canonical one: the pairs it swaps. */
function inversions<T>(order: readonly T[], canonical: readonly T[]): number {
  let n = 0;
  for (let i = 0; i < order.length; i++)
    for (let j = i + 1; j < order.length; j++)
      if (canonical.indexOf(order[i] as T) > canonical.indexOf(order[j] as T)) n++;
  return n;
}

/**
 * Ribbons attached in row order (a source's leave in the order of their targets, a target's arrive in the order of
 * their sources) cross exactly when one pair runs the rows in opposite orders. Counted, and weighed by the thinner.
 */
export function crossingsOf(
  sources: readonly SourceKey[],
  targets: readonly TargetKey[],
  links: readonly FlowLink[],
): { count: number; weight: number } {
  let count = 0;
  let weight = 0;
  for (let i = 0; i < links.length; i++)
    for (let j = i + 1; j < links.length; j++) {
      const p = links[i] as FlowLink;
      const q = links[j] as FlowLink;
      const ds = sources.indexOf(p.from) - sources.indexOf(q.from);
      const dt = targets.indexOf(p.to) - targets.indexOf(q.to);
      if (ds * dt < 0) {
        count++;
        weight += Math.min(p.value, q.value);
      }
    }
  return { count, weight };
}

/**
 * The rows' order: Grid · Battery · Solar over House · Charged · Exported, unless another order crosses fewer
 * ribbons (the grid charging the battery, the battery exporting). No crossing whenever an order allows it; when
 * none does (the grid and the sun both feeding the house and the battery), the fewest, the thinnest, the nearest to
 * the canonical rows.
 */
function bestOrder(
  sources: readonly SourceKey[],
  targets: readonly TargetKey[],
  links: readonly FlowLink[],
): { sources: SourceKey[]; targets: TargetKey[]; crossings: number } {
  let best = { sources: [...sources], targets: [...targets], crossings: 0 };
  let score = { count: Infinity, weight: Infinity, distance: Infinity };
  for (const s of permutations(sources))
    for (const t of permutations(targets)) {
      const c = crossingsOf(s, t, links);
      const distance = inversions(s, SOURCES) + inversions(t, TARGETS);
      const better =
        c.count < score.count ||
        (c.count === score.count &&
          (c.weight < score.weight - 1e-9 ||
            (Math.abs(c.weight - score.weight) <= 1e-9 && distance < score.distance)));
      if (better) {
        score = { ...c, distance };
        best = { sources: s, targets: t, crossings: c.count };
      }
    }
  return best;
}

/* ---------- the house's devices ---------- */

/**
 * The devices drawn under the house: the top-level ones (a device inside another listed one is already in its
 * figure), largest first; past `max`, the smallest — two at least, as Home Assistant groups them — join one "other"
 * bar; then what the house used that no device accounts for, dashed. No device read anything: no row at all.
 */
export function houseKids(
  house: number,
  devices: readonly DeviceInput[],
  max: number,
): FlowNode<KidKey>[] {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const nested = (d: DeviceInput): boolean => {
    let parent = d.parent;
    for (let hops = 0; parent && hops <= devices.length; hops++) {
      const up = byId.get(parent);
      if (!up) return false;
      if (up !== d) return true;
      parent = up.parent;
    }
    return false;
  };
  const top = devices
    .filter((d) => !nested(d) && d.value !== null && d.value >= ZERO)
    .sort((p, q) => (q.value ?? 0) - (p.value ?? 0) || p.index - q.index);
  if (!top.length) return [];
  const cap = Math.max(1, Math.floor(max));
  const grouped = top.length > cap ? Math.min(top.length, Math.max(top.length - cap, 2)) : 0;
  const named = top.slice(0, top.length - grouped);
  const rest = top.slice(top.length - grouped);
  const kids: FlowNode<KidKey>[] = named.map((d) => ({
    key: `device:${d.index}` as const,
    value: d.value ?? 0,
    ink: 'home',
  }));
  if (rest.length)
    kids.push({
      key: 'other',
      value: rest.reduce((sum, d) => sum + (d.value ?? 0), 0),
      ink: 'home',
    });
  const measured = top.reduce((sum, d) => sum + (d.value ?? 0), 0);
  if (house - measured >= ZERO)
    kids.push({ key: 'unmeasured', value: house - measured, ink: 'home', dashed: true });
  return kids;
}

/**
 * Whether a device's name is only its id's: no longer in the house, it has no name of its own (the config's, the
 * prefs'), none this page read of it (the friendly name it last had) and none in the registry. One it had keeps its
 * room while the device is away, so the labels keep their places (the owner's rule, 1.9).
 */
export const idNamed = (
  hass: HomeAssistant | undefined,
  view: EntityView,
  name: string | undefined,
): boolean =>
  !name &&
  view.status === 'missing' &&
  !view.attr('friendly_name') &&
  !hass?.entities?.[view.id]?.name;
