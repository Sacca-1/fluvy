/**
 * What a counter gained between two of its readings, by Home Assistant's own rule — a reading below 90 % of the one
 * before is a meter that started again (`reset_detected` in its sensor recorder), a smaller dip is a dip and comes
 * back on the recovery — plus what a counter that is known to start again adds to it. Shared by the history bars'
 * readings and live bucket and the meters' day, so every counter in Fluvy is read one way.
 */

/** Below this share of the reading before, a reading is a meter that started again (Home Assistant's 10 %). */
export const RESET_FALL = 0.9;

/** What is known of a step beyond its two readings. */
export interface StepRules {
  /** A lifetime meter: it never starts again, so a fall is a fall (a restart's glitch nets out on the recovery). */
  readonly never?: boolean;
  /** The step is the counter's whole cycle (a day counter read at each day's close): the reading is its count. */
  readonly whole?: boolean;
  /** A boundary of the counter's cycle lies in the step: any fall is a fresh start (0.30 → 0.28 at midnight is 0.28). */
  readonly boundary?: boolean;
}

/**
 * The gain of a step from reading `p` to reading `r`: r − p, except where the counter started again — at its cycle's
 * boundary any fall, anywhere else a fall below 90 % of `p` — where what it reads is what it gained since.
 */
export function stepGain(p: number, r: number, rules: StepRules = {}): number {
  if (rules.never) return r - p;
  if (rules.whole) return r;
  if (r < p && (rules.boundary || (p > 0 && r < RESET_FALL * p))) return r;
  return r - p;
}

/**
 * The live step of a counter as Home Assistant counts it, by its state class: a `total_increasing` by the 10 % rule;
 * a `total` starts again only when its `last_reset` changes; anything else (a `total` without one) is r − p, a fall
 * included — which is how a `total` without `last_reset` draws a bar below zero.
 */
export function countedStep(
  stateClass: string | undefined,
  p: number,
  r: number,
  resetChanged = false,
): number {
  if (stateClass === 'total_increasing') return stepGain(p, r);
  if (stateClass === 'total' && resetChanged) return r;
  return r - p;
}
