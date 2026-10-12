import { describe, expect, it } from 'vitest';

import { bulbHex, COLOURED, hexOf } from './light.js';

const view = (attributes: Record<string, unknown>) =>
  ({ attr: <T>(key: string) => attributes[key] as T }) as unknown as Parameters<typeof bulbHex>[0];

describe('a bulb’s colour', () => {
  it('writes a triplet as a hex, each channel rounded and kept, a white channel left out', () => {
    expect(hexOf([255, 128, 0])).toBe('#ff8000');
    expect(hexOf([255.4, 127.6, -3, 200])).toBe('#ff8000');
    expect(hexOf([300, 0, 0])).toBe('#ff0000');
  });

  it('is what a lit bulb glows in a colour mode, and nothing for a white or an off one', () => {
    expect(bulbHex(view({ color_mode: 'hs', rgb_color: [255, 128, 0] }), true)).toBe('#ff8000');
    expect(
      bulbHex(view({ color_mode: 'color_temp', rgb_color: [255, 200, 150] }), true),
    ).toBeUndefined();
    expect(bulbHex(view({ color_mode: 'hs', rgb_color: [255, 128, 0] }), false)).toBeUndefined();
    expect(bulbHex(view({ color_mode: 'rgb' }), true)).toBeUndefined();
    expect([...COLOURED]).toContain('xy');
  });
});
