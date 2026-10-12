import { describe, expect, it } from 'vitest';

import { activeSwatch, hsToRgb, hueOf, kelvinRgb, resolveSwatch, rgbOf } from './colour.js';

describe('a colour bulb’s quick colours', () => {
  it('resolves a word, a Home Assistant colour, a hex and a triplet, and nothing else', () => {
    expect(resolveSwatch('warm', 2200, 6500)).toMatchObject({
      kind: 'white',
      word: 'warm',
      kelvin: 2700,
    });
    expect(resolveSwatch('cool', 2200, 4000)).toMatchObject({ kind: 'white', kelvin: 4000 }); // clamped to the bulb
    expect(resolveSwatch('red', 2200, 6500)).toMatchObject({
      kind: 'colour',
      name: 'red',
      hex: '#f44336',
    });
    expect(resolveSwatch('#FF2D55', 2200, 6500)).toMatchObject({
      kind: 'colour',
      rgb: [255, 45, 85],
    });
    expect(resolveSwatch('#abc', 2200, 6500)).toMatchObject({ hex: '#aabbcc' });
    expect(resolveSwatch([10, 300, -4], 2200, 6500)).toMatchObject({
      rgb: [10, 255, 0],
      hex: '#0aff00',
    });
    expect(resolveSwatch('picker', 2200, 6500)).toEqual({ kind: 'picker', hex: '' });
    expect(resolveSwatch('mauve-ish', 2200, 6500)).toBeUndefined();
    expect(resolveSwatch([1, 2], 2200, 6500)).toBeUndefined();
  });

  it('says which quick colour the bulb is on: the nearest within tolerance, never across kinds', () => {
    const swatches = ['warm', 'cool', 'red', 'orange', 'green', 'blue'].map((e) =>
      resolveSwatch(e, 2200, 6500)!,
    );
    expect(activeSwatch(swatches, { rgb: [244, 67, 54] }, 4300)).toBe(2);
    expect(activeSwatch(swatches, { rgb: [250, 60, 60] }, 4300)).toBe(2); // within 12 a channel
    expect(activeSwatch(swatches, { rgb: [200, 60, 60] }, 4300)).toBe(-1); // a colour of its own
    expect(activeSwatch(swatches, { kelvin: 2750 }, 4300)).toBe(0);
    expect(activeSwatch(swatches, { kelvin: 5500 }, 4300)).toBe(1); // within 15 % of 4300
    expect(activeSwatch(swatches, { kelvin: 4000 }, 4300)).toBe(-1);
    expect(activeSwatch(swatches, {}, 4300)).toBe(-1); // off
    // the picker's round holds a colour none of the others has — never a white, never one of theirs
    const withPicker = [...swatches, resolveSwatch('picker', 2200, 6500)!];
    expect(activeSwatch(withPicker, { rgb: [200, 60, 60] }, 4300)).toBe(6);
    expect(activeSwatch(withPicker, { rgb: [244, 67, 54] }, 4300)).toBe(2);
    expect(activeSwatch(withPicker, { kelvin: 4000 }, 4300)).toBe(-1);
    expect(activeSwatch(withPicker, {}, 4300)).toBe(-1);
  });

  it('turns a hue into the colour the bulb glows, and reads it back', () => {
    expect(hsToRgb(0, 100)).toEqual([255, 0, 0]);
    expect(hsToRgb(120, 100)).toEqual([0, 255, 0]);
    expect(hsToRgb(240, 100)).toEqual([0, 0, 255]);
    expect(hsToRgb(30, 100)).toEqual([255, 128, 0]);
    expect(hueOf([255, 128, 0])).toBe(30);
    expect(hueOf([0, 0, 255])).toBe(240);
    expect(hueOf([120, 120, 120])).toBe(0);
    expect(rgbOf('not a colour')).toBeUndefined();
  });

  it('draws a white at a temperature as a warm or a cool white', () => {
    const [r, , b] = kelvinRgb(2700);
    expect(r).toBe(255);
    expect(b).toBeLessThan(200);
    const [r2, , b2] = kelvinRgb(6500);
    expect(r2).toBeGreaterThanOrEqual(240);
    expect(b2).toBeGreaterThanOrEqual(240);
  });
});
