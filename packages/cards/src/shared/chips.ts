import { chips, type ChipItem } from '@fluvy/ui';
import type { TemplateResult } from 'lit';
import type { RowStyle } from './config.js';
import type { TextRuler } from './fit.js';

/** What a card knows to lay a filled row out: its text ruler and the width the row fills. */
export interface ChipFit {
  readonly ruler: TextRuler;
  readonly width: number;
}

const GAP = 8;
/** A filled chip's pill: 8 each side of its label. */
const SIDES = 16;
/** A chip's glyph and the gap before its label. */
const GLYPH = 24;
/** A chip that is its glyph alone. */
const GLYPH_ALONE = 20;
/** No chip under a finger's 44: a row of glyphs alone wraps before its chips go narrower (five in a 211 column). */
const TOUCH = 44;

/** The widest chip of a row, measured in the row's own classes. */
const widestOf = (items: readonly ChipItem[], ruler: TextRuler): number =>
  Math.max(
    0,
    ...items.map((item) =>
      item.short
        ? Math.max(TOUCH, SIDES + GLYPH_ALONE)
        : ruler.width('fv-chips fv-chips--fill > fv-chip > fv-chip__pill', item.label) +
          SIDES +
          (item.glyph ? GLYPH : 0),
    ),
  );

const fitsIn = (columns: number, widest: number, width: number): boolean =>
  (width - GAP * (columns - 1)) / columns >= widest;

/** Whether every chip stands on one line: a card that must keep one row trades its glyphs, then its words, for it. */
export const fitsOneRow = (items: readonly ChipItem[], { ruler, width }: ChipFit): boolean =>
  fitsIn(items.length, widestOf(items, ruler), width);

/**
 * The columns a filled row takes so that no label is cut: as many as the labels are (three at most in one row of
 * five or six, four or two of four: every row full), the widest label measured in the row's own classes.
 */
export function fittedColumns(
  items: readonly ChipItem[],
  { ruler, width }: ChipFit,
  candidates: readonly number[] = defaultColumns(items.length),
): number {
  const widest = widestOf(items, ruler);
  for (const n of candidates) if (fitsIn(n, widest, width)) return n;
  return 1;
}

const defaultColumns = (count: number): number[] =>
  count <= 3 ? [count] : count === 4 ? [4, 2] : [count, 3, 2];

/**
 * A card's row of short choices (modes, presets, sources), in the style its config asks: `full` (the default) —
 * equal chips that fill the row, laid out so no label is cut where the card can measure — or `chips`,
 * content-sized ones. One call, so every card reads `<x>_style` alike.
 */
export const chipRow = (
  items: readonly ChipItem[],
  onSelect: (key: string) => void,
  style: RowStyle = 'full',
  fit?: ChipFit,
): TemplateResult =>
  style === 'full'
    ? chips(items, onSelect, '', true, fit ? fittedColumns(items, fit) : undefined)
    : chips(items, onSelect);
