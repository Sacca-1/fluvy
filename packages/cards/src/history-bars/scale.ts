/**
 * The history bars' scale and geometry, pure: a y-axis of nice numbers (Heckbert's 1 · 2 · 2.5 · 5 times a power of
 * ten), how many date labels a row of bars can hold, and how wide a bar is in its slot.
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

/** The smallest nice step that spans `span` in `intervals` steps or fewer: 35.4 → 10, 16.8 → 5, 203 → 100. */
export function niceStep(span: number, intervals = 4): NiceStep {
  if (!(span > 0) || !Number.isFinite(span)) return { step: 1, decimals: 0 };
  let exponent = Math.floor(Math.log10(span / intervals));
  for (let round = 0; round < 4; round++, exponent++) {
    const base = 10 ** exponent;
    for (const [fraction, extra] of NICE) {
      const step = fraction * base;
      // 2.5 keeps its half only up to the units (0.25, 2.5); 25 and 250 are whole
      if (Math.ceil(span / step - 1e-9) <= intervals)
        return { step, decimals: Math.max(0, -exponent) + (exponent <= 0 ? extra : 0) };
    }
  }
  return { step: 10 ** exponent, decimals: Math.max(0, -exponent) };
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
 * A scale from `lo` to `hi` that always holds zero: nice ticks at most `intervals` apart, the ends on a tick. A set
 * with nothing in it (both ends zero) is the one tick, zero: the chart then draws its stubs and no scale.
 */
export function niceTicks(lo: number, hi: number, intervals = 4): Ticks {
  const low = Math.min(0, Number.isFinite(lo) ? lo : 0);
  const high = Math.max(0, Number.isFinite(hi) ? hi : 0);
  if (high - low <= 0) return { min: 0, max: 0, step: 0, ticks: [0], decimals: 0 };
  let { step, decimals } = niceStep(high - low, intervals);
  let min = Math.floor(low / step + 1e-9) * step;
  let max = Math.ceil(high / step - 1e-9) * step;
  let count = Math.round((max - min) / step);
  // a signed scale widened to its ticks may need one step more (−3.2 … 8.1: −5 … 10 by 2.5 is six intervals)
  if (count > intervals) {
    ({ step, decimals } = niceStep(max - min, intervals));
    min = Math.floor(low / step + 1e-9) * step;
    max = Math.ceil(high / step - 1e-9) * step;
    count = Math.round((max - min) / step);
  }
  const ticks = Array.from({ length: count + 1 }, (_unused, i) =>
    Number((min + i * step).toFixed(decimals)),
  );
  return { min: ticks[0] ?? 0, max: ticks[count] ?? 0, step, ticks, decimals };
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
