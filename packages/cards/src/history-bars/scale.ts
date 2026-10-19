/**
 * The history bars' scale and geometry, pure: a y-axis of nice numbers (Heckbert's 1 · 2 · 2.5 · 5 times a power of
 * ten), the typical bar its unit is chosen by, how many date labels a row of bars can hold, and how wide a bar is in
 * its slot.
 */

/** Heckbert's nice fractions, in the order they are tried within a decade. */
const NICE: ReadonlyArray<readonly [fraction: number, extraDecimal: 0 | 1]> = [
  [1, 0],
  [2, 0],
  [2.5, 1],
  [5, 0],
];

export interface NiceStep {
  readonly step: number;
  /** The decimals the step needs when written (0.5 → 1, 2.5 → 1, 25 → 0). */
  readonly decimals: number;
}

/**
 * The smallest of Heckbert's steps from `least` up that `fits`: 1, 2, 2.5 or 5 times a power of ten, with the decimals
 * it is written with.
 */
function firstNice(least: number, fits: (step: number) => boolean): NiceStep {
  let exponent = Math.floor(Math.log10(least));
  for (let round = 0; round < 4; round++, exponent++) {
    const base = 10 ** exponent;
    for (const [fraction, extra] of NICE) {
      const step = fraction * base;
      // 2.5 keeps its half only up to the units (0.25, 2.5); 25 and 250 are whole
      if (fits(step))
        return { step, decimals: Math.max(0, -exponent) + (exponent <= 0 ? extra : 0) };
    }
  }
  return { step: 10 ** exponent, decimals: Math.max(0, -exponent) };
}

/** The smallest nice step that spans `span` in `intervals` steps or fewer: 35.4 → 10, 16.8 → 5, 203 → 100. */
export function niceStep(span: number, intervals = 4): NiceStep {
  if (!(span > 0) || !Number.isFinite(span)) return { step: 1, decimals: 0 };
  return firstNice(span / intervals, (step) => Math.ceil(span / step - 1e-9) <= intervals);
}

export interface Ticks {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** From the lowest tick to the highest, zero among them. */
  readonly ticks: readonly number[];
  /** The decimals the tick labels are written with. */
  readonly decimals: number;
}

/**
 * A scale from `lo` to `hi` that always holds zero: the smallest nice step whose ticks reach both ends in `intervals`
 * or fewer. A signed scale is widened to whole ticks on both sides of zero, so it can need a larger step than its span
 * asks (−5.05 … 2.55 by 2.5 is −7.5 … 5, five intervals; by 5, −10 … 5). A set with nothing in it (both ends zero) is
 * the one tick, zero: the chart then draws its stubs and no scale.
 */
export function niceTicks(lo: number, hi: number, intervals = 4): Ticks {
  const low = Math.min(0, Number.isFinite(lo) ? lo : 0);
  const high = Math.max(0, Number.isFinite(hi) ? hi : 0);
  if (high - low <= 0) return { min: 0, max: 0, step: 0, ticks: [0], decimals: 0 };
  const lowest = (step: number): number => Math.floor(low / step + 1e-9);
  const highest = (step: number): number => Math.ceil(high / step - 1e-9);
  const { step, decimals } = firstNice(
    (high - low) / intervals,
    (s) => highest(s) - lowest(s) <= intervals,
  );
  const first = lowest(step);
  const count = highest(step) - first;
  const ticks = Array.from({ length: count + 1 }, (_unused, i) =>
    Number(((first + i) * step).toFixed(decimals)),
  );
  return { min: ticks[0] ?? 0, max: ticks[count] ?? 0, step, ticks, decimals };
}

/**
 * The size of a typical bar, by which the figures choose their unit: the middle of the bars that have something in
 * them, by size (a bar below zero too), so a spike among them reads in the unit of the rest. Zero where none has.
 */
export function typical(values: ReadonlyArray<number | null>): number {
  const sizes = values.flatMap((v) => (v ? [Math.abs(v)] : [])).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 0;
}

/**
 * Every how many bars a date is written so that neighbours stay `gap` apart: the widest label and its gap over the
 * slot, rounded up (seven days at a 276 plot write every day; thirty write every sixth).
 */
export const thinStep = (widest: number, slot: number, gap = 12): number =>
  slot > 0 ? Math.max(1, Math.ceil((widest + gap) / slot)) : 1;

/**
 * Which bars carry a date at a thinning step: every `step`-th counted from the last, so the most recent day always
 * reads (the one people look for).
 */
export const labelled = (count: number, step: number): boolean[] =>
  Array.from({ length: count }, (_unused, i) => (count - 1 - i) % step === 0);

/** A label as placed: its centre and its width. */
export interface Placed {
  readonly x: number;
  readonly width: number;
}

/** Whether labels placed in order stand `gap` apart (a label kept inside the plot at an end may crowd its neighbour). */
export const labelsApart = (labels: readonly Placed[], gap = 12): boolean =>
  labels.every(
    (label, i) =>
      i === 0 ||
      label.x - label.width / 2 - gap >=
        (labels[i - 1] as Placed).x + (labels[i - 1] as Placed).width / 2,
  );

export interface BarGeometry {
  /** A bar's slot: the plot's width over the count. */
  readonly slot: number;
  /** The bar in its slot: 40 % of it, never under 2 nor over 40, on whole pixels. */
  readonly bar: number;
  /** The rounded end's corners: 4, or half the bar when it is thinner. */
  readonly radius: number;
}

export function barGeometry(count: number, width: number): BarGeometry {
  const slot = count > 0 ? width / count : width;
  const bar = Math.max(2, Math.min(40, Math.round(slot * 0.4)));
  return { slot, bar, radius: Math.min(4, bar / 2) };
}

/**
 * A bar as a path rounded at one end only — the top of a bar that rises from the zero line, the foot of one that
 * hangs from it — so its other end sits flat on the line. `y` is the bar's top, `height` its whole height; the
 * radius never exceeds half the bar either way.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  rounded: 'top' | 'bottom',
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const f = (n: number): string => String(Math.round(n * 10) / 10);
  const straight = f(width - 2 * r);
  if (rounded === 'top')
    return `M${f(x)},${f(y + r)}a${f(r)},${f(r)} 0 0 1 ${f(r)},-${f(r)}h${straight}a${f(r)},${f(r)} 0 0 1 ${f(r)},${f(r)}v${f(height - r)}h-${f(width)}z`;
  return `M${f(x)},${f(y)}h${f(width)}v${f(height - r)}a${f(r)},${f(r)} 0 0 1 -${f(r)},${f(r)}h-${straight}a${f(r)},${f(r)} 0 0 1 -${f(r)},-${f(r)}z`;
}
