import type { ActionConfig, HaFormSchemaItem } from '@fluvy/core';
import type { GlyphName } from '@fluvy/ui';
import {
  accentField,
  actionField,
  editorWord,
  entityField,
  fieldRow,
  iconField,
  numberField,
  pickFields,
  textField,
} from '../shared/form.js';
import type { Stat } from './buckets.js';

/**
 * What the history bars say beside and under the chart: the head's readouts and the facts strip are lists of
 * kinds the person composes in order — the honest numbers of the bars (the total, the average, the highest, the
 * lowest, the bucket in progress) and, when asked for, what they come to (CO₂, trees, kilometres, money, a share
 * of another sensor, a template of their own). Each item may carry its own name, icon, colour, unit, decimals,
 * factor and tap action.
 */

export type FactKind =
  | 'total'
  | 'average'
  | 'highest'
  | 'lowest'
  | 'today'
  | 'co2'
  | 'trees'
  | 'km'
  | 'share'
  | 'money'
  | 'template';

export const FACT_KINDS: readonly FactKind[] = [
  'total',
  'average',
  'highest',
  'lowest',
  'today',
  'co2',
  'trees',
  'km',
  'share',
  'money',
  'template',
];

export interface FactItem {
  readonly kind: FactKind;
  /** The label; empty, the kind's own word. */
  readonly name?: string;
  readonly icon?: string;
  readonly color?: unknown;
  /** The unit shown; empty, the kind's own (the sensor's, "kg", "km", the currency, "%"). */
  readonly unit?: string;
  readonly decimals?: number;
  /** CO₂ per kWh (kg), kg of CO₂ a tree takes in a year, km per kWh, the price per unit: the kind's factor, overridden. */
  readonly factor?: number;
  /** The sensor a share is of. */
  readonly of?: string;
  /** A template Home Assistant renders, for a fact of the person's own. */
  readonly template?: string;
  readonly tap_action?: ActionConfig;
}

/** The keys an item may carry, as the editor's contract checks them. */
export const FACT_KEYS = [
  'kind',
  'name',
  'icon',
  'color',
  'unit',
  'decimals',
  'factor',
  'of',
  'template',
  'tap_action',
] as const;

export const isFactKind = (value: unknown): value is FactKind =>
  typeof value === 'string' && (FACT_KINDS as readonly string[]).includes(value);

/** A config list as items: a bare kind becomes `{ kind }`, an object keeps its options, anything else is dropped. */
export function factsOf(raw: unknown): FactItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): FactItem[] => {
    if (isFactKind(entry)) return [{ kind: entry }];
    if (typeof entry === 'object' && entry !== null && isFactKind((entry as FactItem).kind))
      return [entry as FactItem];
    return [];
  });
}

/**
 * The head's readouts by default: bars that add up (a meter's change, a reading at each cycle's end) say their total
 * and average; any other (a mean, an extreme, a reading) its average and highest.
 */
export const defaultHead = (stat: Stat, additive = stat === 'change'): FactKind[] =>
  additive ? ['total', 'average'] : ['average', 'highest'];

/** The strip by default: the honest numbers of the bars; the equivalents only when asked for. */
export const DEFAULT_FACTS: readonly FactKind[] = ['highest', 'lowest', 'average'];

/** The rough factors the equivalents rest on, each editable: kg of CO₂ a kWh of grid power costs, kg a tree takes in a year, km an electric car goes on a kWh. */
export const FACTORS = { co2: 0.4, trees: 22, km: 5 } as const;

export const FACT_ICONS: Readonly<Record<FactKind, GlyphName>> = {
  total: 'bolt',
  average: 'chart',
  highest: 'trendUp',
  lowest: 'trendDown',
  today: 'calendar',
  co2: 'leaf',
  trees: 'globe',
  km: 'car',
  share: 'grid',
  money: 'tag',
  template: 'text',
};

/** What the bars come to: the figures the facts are worked out from. */
export interface Summary {
  /** How many buckets are drawn. */
  readonly count: number;
  /** The sum of the buckets that have a value (the one in progress with them when drawn); null when none has, or when the bars do not add up. */
  readonly total: number | null;
  /** The finished buckets' mean, over those that have a value. */
  readonly average: number | null;
  /** The finished buckets' highest and lowest. */
  readonly highest: number | null;
  readonly lowest: number | null;
  /** The bucket in progress (today, this week, this month), live. */
  readonly current: number | null;
}

/** How the bars are summed up: whether the bucket in progress is drawn, and whether the bars add up at all. */
export interface SummaryOptions {
  readonly drawn?: boolean;
  readonly additive?: boolean;
}

/**
 * The honest figures of the bars. The average, the highest and the lowest are the finished buckets' — a day still
 * running is not a low day — over the buckets that have a value (a day before the sensor was there has none). The
 * total adds the bucket in progress where it is drawn; bars that do not add up (means, extremes, readings) have none,
 * and neither have what is worked out from it (money, CO₂, a share).
 */
export function summarise(
  finished: ReadonlyArray<number | null>,
  current: number | null,
  { drawn = false, additive = true }: SummaryOptions = {},
): Summary {
  const known = finished.filter((v): v is number => v !== null && Number.isFinite(v));
  const running = drawn && current !== null && Number.isFinite(current) ? current : null;
  const sum = known.reduce((total, v) => total + v, 0);
  return {
    count: finished.length + (drawn ? 1 : 0),
    total: !additive || (!known.length && running === null) ? null : sum + (running ?? 0),
    average: known.length ? sum / known.length : null,
    highest: known.length ? Math.max(...known) : null,
    lowest: known.length ? Math.min(...known) : null,
    current,
  };
}

/** What a card hands the facts: its unit and precision, the total in kWh, the house's price and currency, the other sensor's total. */
export interface FactContext {
  readonly unit: string;
  readonly decimals: number;
  /** The total in kWh when the sensor measures energy; null when it does not (the equivalents then read "—"). */
  readonly kwh: number | null;
  readonly price: number | undefined;
  readonly co2Factor: number;
  readonly currency: string;
  /** The total of the sensor a share is of; null when it cannot be read, undefined while it loads. */
  readonly shareOf: number | null | undefined;
  /** The word for trees, in the house's language. */
  readonly trees: string;
}

export interface FactFigure {
  readonly value: number | null;
  readonly unit: string;
  readonly decimals: number;
}

const times = (a: number | null, b: number | undefined): number | null =>
  a === null || b === undefined || !Number.isFinite(b) ? null : a * b;

/** A fact's figure: the kind's maths, then the item's own unit and decimals over the kind's. */
export function factFigure(item: FactItem, summary: Summary, c: FactContext): FactFigure {
  const own = (figure: FactFigure): FactFigure => ({
    value: figure.value,
    unit: item.unit ?? figure.unit,
    decimals: item.decimals ?? figure.decimals,
  });
  const plain = (value: number | null): FactFigure =>
    own({ value, unit: c.unit, decimals: c.decimals });
  switch (item.kind) {
    case 'total':
      return plain(summary.total);
    case 'average':
      return plain(summary.average);
    case 'highest':
      return plain(summary.highest);
    case 'lowest':
      return plain(summary.lowest);
    case 'today':
      return plain(summary.current);
    case 'co2':
      return own({ value: times(c.kwh, item.factor ?? c.co2Factor), unit: 'kg', decimals: 1 });
    case 'trees': {
      const kg = times(c.kwh, c.co2Factor);
      const perTree = item.factor ?? FACTORS.trees;
      return own({
        value: kg === null || !(perTree > 0) ? null : kg / perTree,
        unit: c.trees,
        decimals: 1,
      });
    }
    case 'km':
      return own({ value: times(c.kwh, item.factor ?? FACTORS.km), unit: 'km', decimals: 0 });
    case 'money':
      return own({
        value: times(summary.total, item.factor ?? c.price),
        unit: c.currency,
        decimals: 2,
      });
    case 'share': {
      const of = c.shareOf;
      return own({
        value:
          summary.total === null || of === null || of === undefined || !(of > 0)
            ? null
            : (summary.total / of) * 100,
        unit: '%',
        decimals: 0,
      });
    }
    case 'template':
      return own({ value: null, unit: '', decimals: 0 });
  }
}

/* ---------- the editor ---------- */

/** The kinds as a dropdown, each by its word in the editor's language. */
const KIND_OPTIONS = {
  select: {
    mode: 'dropdown' as const,
    options: FACT_KINDS.map((value) => ({
      value,
      label: editorWord(`history-bars.kind_${value}`),
    })),
  },
};

/** The add-picker of a list of facts: a kind. */
export const KIND_PICKER: HaFormSchemaItem = { name: 'kind', selector: KIND_OPTIONS };

/** Every field a fact may carry, in the order its form shows them. */
export const FACT_FIELDS: HaFormSchemaItem[] = [
  KIND_PICKER,
  fieldRow(textField('name'), iconField()),
  accentField(),
  fieldRow(textField('unit'), numberField('decimals', 0, 3)),
  numberField('factor', 0, 100_000, 0.001),
  entityField(['sensor'], 'of', false),
  textField('template'),
  actionField('tap_action'),
];

/** A head readout has no circle: the same fields without the icon and the colour. */
export const READOUT_FIELDS: HaFormSchemaItem[] = pickFields(
  FACT_FIELDS,
  (name) => name !== 'icon' && name !== 'color',
);
export const READOUT_KEYS = FACT_KEYS.filter((key) => key !== 'icon' && key !== 'color');

/** What each kind is worked out from, beyond the fields every fact has. */
const KIND_FIELDS: Readonly<Record<FactKind, readonly string[]>> = {
  total: [],
  average: [],
  highest: [],
  lowest: [],
  today: [],
  co2: ['factor'],
  trees: ['factor'],
  km: ['factor'],
  money: ['factor'],
  share: ['of'],
  template: ['template'],
};
const EVERY_FACT = new Set(['kind', 'name', 'icon', 'color', 'unit', 'decimals', 'tap_action']);
/** A readout has no circle: no icon, no colour. */
const EVERY_READOUT = new Set(['kind', 'name', 'unit', 'decimals', 'tap_action']);

const forms = new Map<string, HaFormSchemaItem[]>();

/**
 * The fields one item shows: those every fact has, the kind's own (a factor, the other sensor, the template) and any
 * the item already carries — the same array for the same answer, so its form is not rebuilt on every render.
 */
function schemaFor(
  item: Readonly<Record<string, unknown>>,
  every: ReadonlySet<string>,
  prefix: string,
): readonly HaFormSchemaItem[] {
  const own = KIND_FIELDS[item['kind'] as FactKind] as readonly string[] | undefined;
  const shown = (name: string): boolean =>
    every.has(name) ||
    (own ?? []).includes(name) ||
    (item[name] !== undefined && item[name] !== '' && item[name] !== null);
  const key = `${prefix}:${FACT_KEYS.filter(shown).join(',')}`;
  let form = forms.get(key);
  if (!form) {
    form = pickFields(prefix === 'fact' ? FACT_FIELDS : READOUT_FIELDS, shown);
    forms.set(key, form);
  }
  return form;
}

export const factSchema = (item: Readonly<Record<string, unknown>>): readonly HaFormSchemaItem[] =>
  schemaFor(item, EVERY_FACT, 'fact');

export const readoutSchema = (
  item: Readonly<Record<string, unknown>>,
): readonly HaFormSchemaItem[] => schemaFor(item, EVERY_READOUT, 'readout');
