/**
 * Choosing the wording that fits. A date line has a long and a short form ("Thursday, September 17" /
 * "Thu, Sep 17"); which one a head can hold depends on the language, the weekday and the badge next
 * to it — not on a breakpoint. So the candidates are measured, in the card's own face, by the same
 * engine that will lay them out (`@fluvy/ui`'s measurer: one hidden probe for the page, every answer cached).
 */

import { textWidth as measure } from '@fluvy/ui';

export interface Face {
  readonly size: number;
  readonly weight: 500 | 600;
  /** Letter spacing in em. */
  readonly tracking?: number;
  readonly upper?: boolean;
}

/** The faces of the sheet's text styles that carry variable wording. */
export const FACE = {
  title: { size: 16, weight: 600 },
  sub: { size: 13, weight: 500 },
  badge: { size: 13, weight: 600 },
  /** A list row's title (`fv-row__title`). */
  row: { size: 15, weight: 600 },
  time: { size: 13, weight: 600 },
  tile: { size: 14, weight: 500 },
  /** The week strip's weekday (`cd-wday__n`). */
  weekday: { size: 11, weight: 600, tracking: 0.06, upper: true },
} as const satisfies Record<string, Face>;

let family = '';

/** The face the calendar lays its words out in (the card's family, read once it is connected). */
export function useFamily(fontFamily: string): void {
  family = fontFamily;
}

/** Measured by `@fluvy/ui`'s one measurer, in the card's face, figures tabular as the sheet draws them. */
export function textWidth(text: string, face: Face): number {
  return measure(text, {
    size: face.size,
    weight: face.weight,
    tabular: true,
    ...(face.tracking ? { tracking: face.tracking } : {}),
    ...(face.upper ? { upper: true } : {}),
    ...(family ? { family } : {}),
  });
}

/** The first candidate that fits `available` px; the last one (the shortest) when none does. */
export function fitText(candidates: readonly string[], available: number, face: Face): string {
  for (const candidate of candidates) if (textWidth(candidate, face) <= available) return candidate;
  return candidates[candidates.length - 1] ?? '';
}

/** A badge is its text plus 14 px sides, rounded up to the 4 px grid (`fitPills` sizes it the same way). */
export const badgeWidth = (text: string): number =>
  Math.ceil((Math.ceil(textWidth(text, FACE.badge)) + 28) / 4) * 4;
