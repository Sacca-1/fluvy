import { formatNumber, type HomeAssistant } from '@fluvy/core';
import { css, svg, type SVGTemplateResult } from 'lit';

import { niceTicks } from '../history-bars/scale.js';

/**
 * A chart's scales, one look for the history bars (1.8) and the energy card's stacked charts (1.9, issue #49): dashed
 * hairlines in the border's colour across the plot, the tick labels 11/500 in the secondary ink 8 from it, the unit
 * rotated in a 16 column on the far side of the labels.
 */

/** The rotated unit's column beside the scale, and the gap between the tick labels and the plot. */
export const UNIT_COLUMN = 16;
export const AXIS_GAP = 8;

export const axesStyles = css`
  .ax-grid {
    stroke: var(--fluvy-border);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .ax-tick,
  .ax-unit {
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
  }
  /* a scale is read, so its words take the secondary ink (4.5:1 and more at 11 px in every palette), as the bars'
     dates do: the ticks, the unit and the hours under a scaled stacked chart, one ink */
  .ax-tick,
  .ax-unit,
  .is-scaled + .fv-axis {
    fill: var(--fluvy-text-secondary);
    color: var(--fluvy-text-secondary);
  }
`;

/** A tick as a scale writes it: the house's number format, a true minus before a negative one. */
export const tickText = (
  hass: HomeAssistant | undefined,
  value: number,
  decimals: number,
): string =>
  formatNumber(hass, value, { digits: decimals, minDigits: decimals }).replace(/^-/, '−');

/** A dashed gridline at each `y` from `x1` to `x2`, on the pixel grid (a 1 px line on a half pixel is one pixel). */
export const gridLines = (ys: readonly number[], x1: number, x2: number): SVGTemplateResult =>
  svg`${ys.map((y) => {
    const at = Math.round(y) + 0.5;
    return svg`<line class="ax-grid" x1=${x1} x2=${x2} y1=${at} y2=${at}></line>`;
  })}`;

/** Tick labels ending at `x`, each centred on its `y`: a scale on the plot's start, or one ending on the card's edge. */
export const tickLabels = (
  marks: ReadonlyArray<readonly [y: number, text: string]>,
  x: number,
): SVGTemplateResult =>
  svg`${marks.map(([y, text]) => svg`<text class="ax-tick" x=${x} y=${Math.round(y) + 4} text-anchor="end">${text}</text>`)}`;

/** The unit, rotated, centred on the plot between `top` and `bottom`, in the column at the scale's outer side. */
export const unitLabel = (unit: string, top: number, bottom: number): SVGTemplateResult =>
  svg`<text class="ax-unit" transform="rotate(-90)" x=${-(top + bottom) / 2} y="11" text-anchor="middle">${unit}</text>`;

/** A stacked energy chart's power scale: its ticks (kW, lowest first, zero among them) and how they are written. */
export interface PowerScale {
  readonly ticks: readonly number[];
  /** Watts below a kilowatt, else kilowatts. */
  readonly unit: 'W' | 'kW';
  /** The labels' decimals, in that unit. */
  readonly decimals: number;
  /** How many ticks lie above zero: the charge's scale divides 0–100 % among them. */
  readonly above: number;
}

/**
 * The power scale of a stacked energy chart from the day's highest stack `up` and its deepest outflow `down` (kW): the
 * history bars' scale (Heckbert's nice steps, four intervals at most, zero a tick), in watts below a kilowatt. Under
 * the charge's own scale (`charge`: 0 % on the zero line, 100 % on the top tick, labelled on the power's gridlines) a
 * positive half of three intervals gets a fourth on top, so the charge reads 0 · 25 · 50 · 75 · 100 % (or 0 · 50 ·
 * 100 %, or 0 · 100 %) on whole lines, never 33 %. That fourth is one of the four: where a tick below zero leaves it no
 * room, the scale takes the next step (−5 … 15 with the charge is −10 … 20, not −5 … 20).
 */
export function powerScale(up: number, down: number, charge: boolean): PowerScale {
  const unit = Math.max(up, down) >= 1 ? 'kW' : 'W';
  const k = unit === 'kW' ? 1 : 1000;
  const thirds = (ticks: readonly number[]): boolean =>
    charge && ticks.filter((t) => t > 0).length === 3;
  const four = niceTicks(-down * k, up * k, 4);
  const nice = thirds(four.ticks) && four.min < 0 ? niceTicks(-down * k, up * k, 3) : four;
  const quarters = thirds(nice.ticks);
  const ticks = quarters
    ? [...nice.ticks, Number((nice.max + nice.step).toFixed(nice.decimals))]
    : nice.ticks;
  return {
    ticks: ticks.map((t) => t / k),
    unit,
    decimals: nice.decimals,
    above: ticks.filter((t) => t > 0).length,
  };
}
