import type { Hex } from '../types.js';
import { contrastRatio } from './contrast.js';
import { toHex, type Oklch } from './oklch.js';

export type FitDirection = 'darker' | 'lighter';

export interface FitOptions {
  /** Starting point. Kept verbatim when it already clears `minRatio`. */
  readonly color: Oklch;
  readonly background: Hex;
  readonly minRatio: number;
  readonly direction: FitDirection;
}

const STEP = 0.002;

/**
 * Walks lightness — and only lightness — until the colour clears a contrast gate.
 *
 * Hue and chroma are the designer's intent, so they never move; the ratio is measured
 * on the *rounded hex*, because that is the value the theme actually ships. If the
 * lightness axis runs out before the gate is met, the extreme is returned and the
 * contrast report fails the build rather than silently shipping a near-miss.
 */
export function fitLightness(options: FitOptions): Oklch {
  const { color, background, minRatio, direction } = options;
  const step = direction === 'darker' ? -STEP : STEP;

  let candidate = color;
  for (let i = 0; i <= 500; i += 1) {
    if (contrastRatio(toHex(candidate), background) >= minRatio) {
      return candidate;
    }
    const next = candidate.l + step;
    if (next < 0 || next > 1) break;
    candidate = { ...candidate, l: next };
  }
  return candidate;
}

/**
 * Walks lightness from `from`, a step at a time (`most` steps at the most), until `ok` holds or the scale runs out: a
 * fit by any rule, where `ensureContrast` fits by one ratio.
 */
export function walkLightness(
  from: Oklch,
  direction: FitDirection,
  ok: (hex: Hex) => boolean,
  most = 500,
): Oklch {
  const step = direction === 'darker' ? -STEP : STEP;
  let color = from;
  for (let i = 0; i < most && !ok(toHex(color)) && color.l + step >= 0 && color.l + step <= 1; i++)
    color = { ...color, l: color.l + step };
  return color;
}

/** Convenience wrapper that keeps the "nudge the anchor" intent readable at call sites. */
export function ensureContrast(
  color: Oklch,
  background: Hex,
  minRatio: number,
  direction: FitDirection,
): Oklch {
  return fitLightness({ color, background, minRatio, direction });
}
