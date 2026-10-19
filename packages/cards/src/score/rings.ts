import type { Scores } from '../energy-model/allocate.js';

/**
 * The score's rings: which of them a house can have, how each is drawn and how they lie. A ring whose figure the
 * house cannot give is left out (no sun: no "sun used"; no CO₂ signal: no "low-carbon"); one whose figure is not in
 * yet reads "—" over an empty ring. Pure, for the tests.
 */

export type RingKey = 'self_powered' | 'sun_used' | 'low_carbon';

export interface Ring {
  readonly key: RingKey;
  /** 0 … 1, or null while it is unknown. */
  readonly value: number | null;
}

export interface HouseHas {
  /** An array's production is metered. */
  readonly solar: boolean;
  /** The grid's export is metered (Home Assistant's gauge needs it). */
  readonly exported: boolean;
  /** A CO₂ signal sensor exists and the grid's import is metered. */
  readonly co2: boolean;
}

/**
 * Whether the house has a CO₂ signal: the card's own, or one its integration put in the house (`co2signal`). A signal
 * out of reach, even one no longer there, is still the house's: its ring keeps its place, "—" in it (1.9).
 */
export const hasCo2Signal = (
  own: string | undefined,
  entities: Readonly<Record<string, { readonly platform?: string }>> | undefined,
): boolean =>
  Boolean(own) || Object.values(entities ?? {}).some((entry) => entry.platform === 'co2signal');

export function ringsOf(has: HouseHas, scores: Scores | null, lowCarbon: number | null): Ring[] {
  return [
    { key: 'self_powered' as const, value: scores?.selfPowered ?? null },
    ...(has.solar && has.exported
      ? [{ key: 'sun_used' as const, value: scores?.sunUsed ?? null }]
      : []),
    ...(has.co2 ? [{ key: 'low_carbon' as const, value: lowCarbon }] : []),
  ];
}

/** The ring: 88 across, a 6 px stroke on a radius of 36; 64 across (a radius of 24) in a column narrower than it. */
export const RING = 88;
export const RING_SMALL = 64;
export const ringRadius = (size: number): number => size / 2 - 8;

/** The arc's dash on a ring of `size`: its share of the circle (a figure outside 0 … 1 draws at the nearest end). */
export function arcDash(value: number | null, size = RING): string {
  const circumference = 2 * Math.PI * ringRadius(size);
  const share = value === null || !Number.isFinite(value) ? 0 : Math.min(1, Math.max(0, value));
  return `${(share * circumference).toFixed(1)} ${circumference.toFixed(1)}`;
}

/** The figure in a ring: a whole percent, as Home Assistant's gauges round it. */
export const ringPercent = (value: number | null): number | null =>
  value === null || !Number.isFinite(value) ? null : Math.round(value * 100);

/** The design's column: 96 (a ring and its label), 16 apart in a full column of 320. */
export const RING_COLUMN = 96;
export const RING_GAP = 16;
/** The least room between two columns before a ring goes to the next row. */
const TIGHT = 8;

export interface RingLayout {
  /** Rings a row. */
  readonly columns: number;
  /** Each column's width: the design's 96, a longer label's, or the whole column when it is narrower. */
  readonly column: number;
  /** Three rings in one row of a full column spread over it (the approved row); otherwise they stay centred. */
  readonly spread: boolean;
  readonly gap: number;
  /** A column narrower than a ring: the small ring. */
  readonly small: boolean;
}

/**
 * How the rings lie in a column of `width`: as many a row as it holds 8 apart, in columns as wide as the widest
 * label (measured) and never under the design's 96 — a column narrower than that is one column, its labels wrapped.
 */
export function ringLayout(count: number, width: number, widestLabel: number): RingLayout {
  // the ruler adds a pixel for rounding (a label it measures at 97 holds in 96); an even width keeps the ring (88)
  // on whole pixels in the middle of its column
  const column = Math.min(
    width - (width % 2),
    Math.max(RING_COLUMN, 2 * Math.ceil((widestLabel - 1) / 2)),
  );
  let columns = Math.max(1, count);
  while (columns > 1 && columns * column + (columns - 1) * TIGHT > width) columns--;
  const spread = count === 3 && columns === 3;
  const gap = spread ? 0 : columns * column + (columns - 1) * RING_GAP <= width ? RING_GAP : TIGHT;
  return { columns, column, spread, gap, small: column < RING };
}

export type TotalsLayout = 'columns' | 'fluid' | 'stacked';

/**
 * Imported · Exported · Net: in the rings' columns (96, a full column), in three equal columns 8 apart, or one
 * under the other — the first that holds every readout (widths measured). The net says its way in the unit's slot
 * ("2.8 kWh in") where its column holds the words, and is signed where it does not ("−0.5 kWh"): a row of three
 * is kept before a way is.
 */
export function totalsLayout(
  width: number,
  widest: { readonly plain: number; readonly way: number },
  column = RING_COLUMN,
): { readonly layout: TotalsLayout; readonly way: boolean } {
  const cells: [TotalsLayout, number][] = [
    ...(width >= 3 * column + 2 * RING_GAP ? [['columns', column] as [TotalsLayout, number]] : []),
    ['fluid', (width - 2 * TIGHT) / 3],
    ['stacked', width],
  ];
  for (const [layout, cell] of cells) {
    if (widest.way <= cell) return { layout, way: true };
    if (widest.plain <= cell) return { layout, way: false };
  }
  return { layout: 'stacked', way: false };
}

/** The net's direction, in the unit's slot: a net importer's "in", a net exporter's "out". */
export function netWay(net: number | null, zero: number): 'in' | 'out' | '' {
  if (net === null || Math.abs(net) < zero) return '';
  return net > 0 ? 'in' : 'out';
}
