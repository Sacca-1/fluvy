import type { EntityView, HomeAssistant } from '@fluvy/core';
import { legendParts, shortName } from './power.js';
import type { Stat } from './stats.js';

/** A legend's item: a sensor, and the name the card was given for it. */
export interface LegendItem {
  readonly entity: string;
  readonly name?: string;
}

/**
 * A legend row's statistics (the energy card's legend, the flow's totals, the grid's own readouts): each item's label
 * — or its sensor's short name — over its figure, every figure of a family in one unit, chosen by the largest
 * ("0.2 kWh" beside "1.2 kWh", never "230 Wh"). Drawn by `statsCols`.
 */
export function legendStats(
  hass: HomeAssistant | undefined,
  items: readonly LegendItem[],
  entity: (id: string) => EntityView,
): Stat[] {
  const views = items.map((item) => entity(item.entity));
  const parts = legendParts(hass, views);
  return items.map((item, index) => ({
    label: item.name ?? shortName(views[index] as EntityView),
    value: parts[index]?.value ?? '—',
    unit: parts[index]?.unit ?? '',
    name: true,
  }));
}
