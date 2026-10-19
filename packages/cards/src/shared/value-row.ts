import { readout } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import type { TextRuler } from './fit.js';

/*
 * The value row: a card's reading — its big figure — and what goes with it on one 64 row under the head: the control
 * that sets it (a stepper, a timer's rounds) or a second readout that qualifies it (when it is full, the time left).
 * Where the column cannot hold the two side by side, the row stacks, measured with the card's own ruler, never
 * squeezed. One rule says where a stacked row's parts sit: a control is centred, and the readout over it is centred
 * with it (the dial's column without its ring); readouts alone keep the column's start, as the head's words do — a
 * side readout under the reading reads on from it.
 */

/** A readout's words, for measuring and drawing it. */
export interface Figure {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  /** A mark drawn beside the label (a chart line's key): its width with its gap, measured with the label. */
  readonly mark?: number;
}

/** A figure the row can show, with its unit: a target's ends, a range, the word for off. */
export interface Reading {
  readonly value: string;
  readonly unit?: string;
}

export type RowSize = 'l' | 'm' | 's' | 'xs';

/**
 * How a row with a control is laid out: `beside` (the readout at the start, the control at the end), `stack` (the
 * readout centred on its own row, the control centred 12 under it), `halves` (the stack with the stepper's halves at
 * 44), `alone` (the readout at the start and no control: the column is too narrow for one, or the row has none — the
 * readout is then the card's tap).
 */
export type RowLayout = 'beside' | 'stack' | 'halves' | 'alone';

export interface ValueRowFit {
  readonly size: RowSize;
  readonly layout: RowLayout;
  /** The longest of the label's forms that fits its room. */
  readonly label: string;
}

export interface ValueRowSpec {
  /** The content column the row fills. */
  readonly width: number;
  /** The control's width (`STEPPER`, a timer's rounds); 0 for a row that has none. */
  readonly control: number;
  /** The control's narrowest form (`STEPPER_HALVES`), for a column under its width; under this one it goes. */
  readonly narrow?: number;
  /** The label's forms, longest first ("Target · Now 20.6°", "Target"). */
  readonly labels: readonly string[];
  /**
   * Every figure the row can show — not the one it shows now: a target's min and max, its range when the device can
   * hold one, the word for off. The row is laid out for the widest, so stepping, a mode, the device going off never
   * moves it.
   */
  readonly figures: readonly Reading[];
  /** The sizes the readout may take, largest first: all four by default; a side column's readouts are m and under. */
  readonly sizes?: readonly RowSize[];
}

/** The stepper (`.fv-stepper`), and its two halves at 44 where a column cannot hold it. */
export const STEPPER = 96;
export const STEPPER_HALVES = 88;
/** Between the readout and its control, beside it or over it (`.fv-value-row`'s gaps). */
const GAP = 12;
const SIZES: readonly RowSize[] = ['l', 'm', 's', 'xs'];

const LABEL = 'fv-readout > fv-readout__label';
const labelWidth = (ruler: TextRuler, text: string, mark = 0): number =>
  ruler.width(LABEL, text) + mark;
const figureWidth = (ruler: TextRuler, size: RowSize, reading: Reading): number =>
  ruler.width(
    `fv-readout fv-readout--${size} > fv-readout__value`,
    reading.value,
    'fv-unit',
    reading.unit ?? '',
  );

/**
 * A value row with a control, decided from the width, the labels and every figure the row can show — never from the
 * state. Beside the control at l, else at m; else stacked, the readout at the largest size the column holds; under
 * the control's width the stepper's halves at 44; under those the readout alone. A row without a control is the
 * readout alone at the largest size that fits.
 */
export function fitValueRow(ruler: TextRuler, spec: ValueRowSpec): ValueRowFit {
  const { width, control, narrow = control, labels, figures, sizes = SIZES } = spec;
  const shortest = labels.length ? labelWidth(ruler, labels[labels.length - 1] as string) : 0;
  const widest = (size: RowSize): number =>
    Math.max(shortest, ...figures.map((reading) => figureWidth(ruler, size, reading)));
  const label = (room: number): string =>
    labels.find((text) => labelWidth(ruler, text) <= room) ?? labels[labels.length - 1] ?? '';
  if (control > 0) {
    const room = width - GAP - control;
    for (const size of sizes.filter((size) => size === 'l' || size === 'm'))
      if (widest(size) <= room) return { size, layout: 'beside', label: label(room) };
  }
  const layout: RowLayout =
    control > 0 && width >= control ? 'stack' : control > 0 && width >= narrow ? 'halves' : 'alone';
  return {
    size: sizes.find((size) => widest(size) <= width) ?? sizes[sizes.length - 1] ?? 'xs',
    layout,
    label: label(width),
  };
}

/** The row's classes for its layout. */
export const valueRowClass = (layout: RowLayout): string =>
  layout === 'stack'
    ? 'fv-value-row fv-value-row--stack'
    : layout === 'halves'
      ? 'fv-value-row fv-value-row--stack fv-value-row--halves'
      : 'fv-value-row';

/** A side readout keeps 16 from the reading. */
const SIDE_GAP = 16;

/** A readout's laid-out width in its size: the wider of its label (with its mark) and its figure. */
const readoutWidth = (ruler: TextRuler, size: RowSize, figure: Figure): number =>
  Math.max(labelWidth(ruler, figure.label, figure.mark), figureWidth(ruler, size, figure));

/**
 * Whether the side readout goes under the reading (at the column's start, 12 below): the reading at l and the side
 * one at s, 16 apart, do not fit the column. Each is given in every form it takes where they differ (the words it
 * says at rest and while a chart is read, its widest figure), so reading the card never moves the row.
 */
export function sideStacked(
  ruler: TextRuler,
  width: number,
  main: readonly Figure[],
  side: readonly Figure[],
): boolean {
  if (!main.length || !side.length) return false;
  const widest = (size: RowSize, forms: readonly Figure[]): number =>
    Math.max(...forms.map((figure) => readoutWidth(ruler, size, figure)));
  return widest('l', main) + SIDE_GAP + widest('s', side) > width;
}

/**
 * The value row of the charge cards: the reading (a 40 figure) at the left, what qualifies it (a 20 figure: when it
 * is full, when it is due) at the right on its baseline, or under it where the column cannot hold both.
 */
export function valueRow(
  ruler: TextRuler,
  width: number,
  main: Figure,
  side: { readonly figure: Figure; readonly drawn?: TemplateResult } | null,
): TemplateResult {
  const stacked = sideStacked(ruler, width, [main], side ? [side.figure] : []);
  return html`<div class="ef-top fv-value-row ${stacked ? 'is-stacked' : ''}">
    ${readout({ ...main, size: 'l' })}
    ${
      side
        ? html`<div class="ef-top__side">
            ${side.drawn ?? readout({ ...side.figure, size: 's' })}
          </div>`
        : nothing
    }
  </div>`;
}
