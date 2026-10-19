import type { TextRuler } from './fit.js';

/** A statistic as a card says it: its label, its number and its unit. */
export interface StatText {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

/** The readout sizes a row of statistics may take: the small one, or the extra-small one where it must. */
export type StatSize = 's' | 'xs';

/**
 * The room each readout of a row has in `columns` equal columns 16 apart (`fv-cols`): its column, or — the one
 * readout of a shorter last row, which takes the whole row — the whole row.
 */
const roomsOf =
  (width: number, count: number, columns: number) =>
  (index: number): number =>
    count % columns !== 0 && index === count - 1 ? width : (width - 16 * (columns - 1)) / columns;

/**
 * The columns a row of statistics takes so that no label or figure leaves its room: one for each while every label
 * and figure (at the extra-small size) holds in an equal column, else fewer — the caller lets a shorter last row take
 * the whole row, so its one readout is held to the row, not to a column: three in half a column are two and one
 * while the first two hold their halves. The columns are equal and 16 apart (`fv-cols`).
 */
export function statsColumns(ruler: TextRuler, width: number, items: readonly StatText[]): number {
  const widths = items.map(({ label, value, unit }) =>
    Math.max(
      ruler.width('fv-readout__label', label),
      ruler.width('fv-readout fv-readout--xs > fv-readout__value', value, 'fv-unit', unit ?? ''),
    ),
  );
  let columns = Math.max(1, items.length);
  while (columns > 1) {
    const room = roomsOf(width, items.length, columns);
    if (widths.every((wide, index) => wide <= room(index))) break;
    columns -= 1;
  }
  return columns;
}

/**
 * The size a row of statistics fits at: the small readout while every number with its unit fits its room (measured,
 * in the real classes), the extra-small one where a long unit ("µg/m³") on a narrow card would not.
 * The columns are equal and 16 apart (`fv-cols`), a shorter last row's one readout across the row.
 */
export function statsSize(
  ruler: TextRuler,
  width: number,
  items: readonly StatText[],
  columns = items.length,
): StatSize {
  const room = roomsOf(width, items.length, Math.max(1, columns));
  const fits = items.every(
    ({ value, unit }, index) =>
      ruler.width('fv-readout fv-readout--s > fv-readout__value', value, 'fv-unit', unit ?? '') <=
      room(index),
  );
  return fits ? 's' : 'xs';
}

/** A row of statistics laid out: its columns, its readouts' size, and whether its last row is shorter. */
export interface StatsRow {
  readonly columns: number;
  readonly size: StatSize;
  /** The last row holds fewer than `columns` (one, in rows of three at most): it takes the whole row. */
  readonly odd: boolean;
}

/**
 * A row of statistics as one decision, measured, never by a threshold: as many equal columns as hold every label
 * and figure (`statsColumns`), the size every figure fits its room at (`statsSize`), and a shorter last row taking
 * the whole row (`fv-cols--odd`) — three readouts in half a column are two and one, never three cut ones.
 */
export function statsRow(ruler: TextRuler, width: number, items: readonly StatText[]): StatsRow {
  const columns = statsColumns(ruler, width, items);
  return {
    columns,
    size: statsSize(ruler, width, items, columns),
    odd: items.length % columns !== 0,
  };
}
