import { optionColumns } from '@fluvy/ui';

/** An option tile's two sides (12 px of padding each), which its label sits between. */
const SIDES = 24;

/** A cell's content (between a tile's sides) at `columns` of `width`, `gap` the row's or the caller's by column count. */
export const optionCell = (
  width: number,
  gap: number | ((columns: number) => number),
  columns: number,
): number =>
  (width - (typeof gap === 'number' ? gap : gap(columns)) * (columns - 1)) / columns - SIDES;

/**
 * The columns a row of option tiles takes so that no label is cut: as many as the count suggests
 * (`optionColumns`), one fewer while the longest label — measured in the tile's own class — does not fit
 * a cell's content, never under two (a tile's value would go too narrow; `optionGrid` already splits a
 * shorter last row). `gap` is the row's, or the gap the caller lays a given column count out with.
 */
export function optionColumnsFor(
  labels: readonly string[],
  width: number,
  gap: number | ((columns: number) => number),
  measure: (label: string) => number,
): number {
  const widest = Math.max(0, ...labels.map(measure));
  let columns = optionColumns(labels.length);
  while (columns > 2 && optionCell(width, gap, columns) < widest) columns -= 1;
  return columns;
}

/**
 * Whether a row of option tiles holds its labels at the columns `optionColumnsFor` gives it: false where even two
 * a row would cut the longest ("Personnalisé" in a 211 column), when a card draws its choices as chips instead —
 * the chips give way in their own order (the glyphs, the words, the glyphs alone), and never cut a word.
 */
export function optionsHold(
  labels: readonly string[],
  width: number,
  gap: number | ((columns: number) => number),
  measure: (label: string) => number,
): boolean {
  const columns = optionColumnsFor(labels, width, gap, measure);
  return Math.max(0, ...labels.map(measure)) <= optionCell(width, gap, columns);
}

/** The longest word of a value, measured in the value's class: what a cell must hold, a word never being cut. */
const longestWord = (value: string, measure: (text: string) => number): number =>
  Math.max(0, ...value.split(/\s+/).filter(Boolean).map(measure));

/**
 * Whether every value holds a `cell` of content: a value of several words wraps on its own, a word longer than the
 * cell (de's "Bereitschaft" under Off in a 211 column) would be cut, which a tile never does.
 */
export const valuesHold = (
  values: readonly string[],
  cell: number,
  measure: (text: string) => number,
): boolean => values.every((value) => longestWord(value, measure) <= cell);

/**
 * The tiles with every value a cell could not hold dropped: the label says what the tile is, and a value that repeats
 * the head (Off's "Standby") or explains a mode (a charger's "Surplus") is let go before a word of it is cut. A tile
 * whose value is its only word (no label: the energy mode row's names) keeps it.
 */
export const valuesHeld = <T extends { readonly label: string; readonly value?: string }>(
  items: readonly T[],
  cell: number,
  measure: (text: string) => number,
): T[] =>
  items.map((item) =>
    item.label && item.value && longestWord(item.value, measure) > cell
      ? { ...item, value: '' }
      : item,
  );
