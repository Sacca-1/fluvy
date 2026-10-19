import { readout } from '@fluvy/ui';
import { css, html, type TemplateResult } from 'lit';
import type { TextRuler } from '../shared/fit.js';
import { statsRow, type StatSize, type StatText } from '../shared/readouts.js';

/** A statistic of the row: its words, whether its label is a name, and how it is drawn when not a plain readout. */
export interface Stat extends StatText {
  /** The label is a sensor's name: in a column too narrow for it, it ends in an ellipsis, as names do. */
  readonly name?: boolean;
  /** Drawn at the row's size (a span of time's units in the unit face). */
  readonly draw?: (size: StatSize) => TemplateResult;
}

/**
 * The energy family's row of statistics (a session's figures, the money, a legend, the flow's totals): as many equal
 * columns as hold the widest label and figure, at the size the widest fits, a shorter last row taking the whole row
 * (`statsRow`) — "Von der Sonne" over its own 96 %, never wrapped onto it.
 */
export function statsCols(ruler: TextRuler, width: number, stats: readonly Stat[]): TemplateResult {
  const row = statsRow(ruler, width, stats);
  return html`<div
    class="ef-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}"
    style="--cols:${row.columns}"
    data-align="center"
  >
    ${stats.map(
      (stat) =>
        stat.draw?.(row.size) ??
        readout({
          label: stat.label,
          value: stat.value,
          unit: stat.unit ?? '',
          size: row.size,
          name: stat.name ?? false,
        }),
    )}
  </div>`;
}

/**
 * The row's columns (`--cols`, from `statsCols`): a name may end in an ellipsis; a word or a figure never. A shorter
 * last row's one readout takes the whole row (`fv-cols--odd`, the language's own rule).
 */
export const statsStyles = css`
  .ef-cols {
    grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  }
  .ef-cols .fv-readout {
    min-width: 0;
  }
  .ef-cols .fv-readout__label[data-name] {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
`;
