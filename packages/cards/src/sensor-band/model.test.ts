import { describe, expect, it } from 'vitest';
import { fraction, placeLabels, validateScale } from './model.js';

describe('sensor band scale', () => {
  it('accepts signed ranges, gaps and endpoint references', () => {
    expect(() =>
      validateScale({
        min: -20,
        max: 40,
        bands: [
          { from: -20, to: 0, tone: 'cool' },
          { from: 10, to: 40, tone: 'heat' },
        ],
        references: [{ value: -20 }, { value: 40, label: 'Limit' }],
      }),
    ).not.toThrow();
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite limits and references: %s', (value) => {
    expect(() => validateScale({ max: value })).toThrow();
    expect(() => validateScale({ references: [{ value }] })).toThrow();
  });
  it('rejects reversed scales, overlap, invalid tones and out-of-range references', () => {
    expect(() => validateScale({ min: 10, max: 10 })).toThrow();
    expect(() =>
      validateScale({
        bands: [
          { from: 0, to: 50, tone: 'water' },
          { from: 40, to: 100, tone: 'heat' },
        ],
      }),
    ).toThrow();
    expect(() => validateScale({ bands: [{ from: 0, to: 101, tone: 'water' }] })).toThrow();
    expect(() => validateScale({ references: [{ value: 101 }] })).toThrow();
    expect(() =>
      validateScale({ bands: [{ from: 0, to: 50, tone: 'invalid' as 'water' }] }),
    ).toThrow();
  });
  it('positions exact references and clamps only the marker geometry', () => {
    expect(fraction(800, 400, 2000)).toBe(0.25);
    expect(fraction(15, 0, 50)).toBe(0.3);
    expect(fraction(2500, 400, 2000)).toBe(1);
    expect(fraction(-1, 0, 50)).toBe(0);
  });
  it('preserves all captions without overlaps in a narrow column', () => {
    const labels = placeLabels(
      [
        { fraction: 0, text: '0', width: 12 },
        { fraction: 0.3, text: '24h reference 15', width: 100 },
        { fraction: 0.31, text: 'Nearby', width: 60 },
        { fraction: 1, text: '50', width: 20 },
      ],
      180,
    );
    expect(labels).toHaveLength(4);
    expect(labels.some((item) => item.lane > 0)).toBe(true);
    for (const item of labels) {
      expect(item.left).toBeGreaterThanOrEqual(0);
      expect(item.left + item.width).toBeLessThanOrEqual(180);
      for (const other of labels)
        if (other !== item && other.lane === item.lane)
          expect(
            item.left + item.width <= other.left || other.left + other.width <= item.left,
          ).toBe(true);
    }
  });
});
