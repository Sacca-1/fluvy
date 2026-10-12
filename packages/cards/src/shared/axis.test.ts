import { describe, expect, it } from 'vitest';

import { axisHolds } from './axis.js';
import type { TextRuler } from './fit.js';

/** A ruler that says every character is 7 px wide. */
const ruler = { width: (_cls: string, text: string) => text.length * 7 } as unknown as TextRuler;

describe('an axis holds its labels apart', () => {
  it('always holds two, and three where 12 px stay between neighbours', () => {
    expect(
      axisHolds(ruler, 100, [
        [0, '−6 h'],
        [1, 'Now'],
      ]),
    ).toBe(true);
    const three = [
      [0, '−6 h'],
      [0.5, '−3 h'],
      [1, 'Now'],
    ] as const;
    expect(axisHolds(ruler, 200, three)).toBe(true); // 28 | 84–112 | 179: 56 and 67 apart
    expect(axisHolds(ruler, 100, three)).toBe(false); // 28 | 36–64 | 79: 8 and 15 apart
  });

  it('places the ends flush and the middle on its point', () => {
    // a middle label wider than its share crowds the end even on a wide axis
    expect(
      axisHolds(ruler, 240, [
        [0, 'a'],
        [0.95, 'a long middle label'],
        [1, 'now'],
      ]),
    ).toBe(false);
  });
});
