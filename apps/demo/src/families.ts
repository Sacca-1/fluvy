import type { StringKey } from './strings.js';

/** The playground's sheets grouped the way the README groups the cards: one chip each on the demo. */
export interface Family {
  readonly key: string;
  readonly label: StringKey;
  readonly sheets: readonly string[];
}

export const FAMILIES: readonly Family[] = [
  { key: 'home', label: 'family.home', sheets: ['home', 'home-extras', 'ambient'] },
  {
    key: 'devices',
    label: 'family.devices',
    sheets: ['devices-motion', 'devices-security', 'printer', 'appliances', 'slider', 'lights'],
  },
  { key: 'climate', label: 'family.climate', sheets: ['climate'] },
  { key: 'energy', label: 'family.energy', sheets: ['flow', 'energy', 'solar', 'history-bars'] },
  { key: 'media', label: 'family.media', sheets: ['media'] },
  { key: 'time', label: 'family.time', sheets: ['clocks', 'calendar'] },
  { key: 'helpers', label: 'family.helpers', sheets: ['inputs', 'lists', 'automations', 'alerts'] },
];

/** The sheets a name stands for: a family's, or the one sheet of that name. */
export const sheetsOf = (name: string): readonly string[] =>
  FAMILIES.find((family) => family.key === name)?.sheets ?? [name];

/** The family a name belongs to (its own, or the one holding that sheet). */
export const familyOf = (name: string): string | undefined =>
  FAMILIES.find((family) => family.key === name || family.sheets.includes(name))?.key;
