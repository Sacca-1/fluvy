import { describe, expect, it } from 'vitest';

import { bulbHex, COLOURED, glowOf, hexOf, meanHex } from './light.js';

type View = Parameters<typeof bulbHex>[0];
const view = (attributes: Record<string, unknown>, state = 'on', id = 'light.lamp'): View =>
  ({ id, state, attr: <T>(key: string) => attributes[key] as T }) as unknown as View;

const RED = { color_mode: 'hs', rgb_color: [255, 0, 0], brightness: 255 };
/** A white at 2700 K as Home Assistant reports it: its colour beside its temperature. */
const WARM = { color_mode: 'color_temp', rgb_color: [255, 167, 87], brightness: 255 };
const DAYLIGHT = { color_mode: 'color_temp', rgb_color: [255, 254, 250], brightness: 255 };

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

  it('shows a white by its temperature where asked, as Home Assistant’s tile does: at 0.4 saturation at least', () => {
    // 2700 K is saturated enough to be itself
    expect(bulbHex(view(WARM), true, 'temperature')).toBe('#ffa757');
    // 4000 K is lifted to 0.4 at its hue and value: warmer, never greyer
    const lifted = bulbHex(view({ ...WARM, rgb_color: [255, 206, 166] }), true, 'temperature');
    const [r, , b] = [1, 3, 5].map((i) => Number.parseInt(lifted!.slice(i, i + 2), 16));
    expect(r).toBe(255);
    expect(1 - b! / r!).toBeCloseTo(0.4, 1);
    // daylight is no colour: the palette's lit light, never a grey
    expect(bulbHex(view(DAYLIGHT), true, 'temperature')).toBeUndefined();
    expect(bulbHex(view(WARM), true, 'palette')).toBeUndefined();
  });
});

describe('lights glowing together', () => {
  it('take their lit members’ colours by brightness, a white adding none (a mixed-mode group)', () => {
    const red = view(RED, 'on', 'light.red');
    const white = view(WARM, 'on', 'light.white');
    const off = view({ color_mode: 'hs', rgb_color: [0, 0, 255] }, 'off', 'light.off');
    // Home Assistant's own mean would be a washed orange; the red bulb among whites glows red
    expect(meanHex([red, white, off])).toBe('#ff0000');
    const blue = view({ color_mode: 'rgb', rgb_color: [0, 0, 255], brightness: 85 }, 'on', 'b');
    // three parts red to one part blue
    expect(meanHex([red, blue])).toBe('#bf0040');
    expect(meanHex([white, off])).toBeUndefined();
    // whites by their temperature count as colours of their own
    expect(meanHex([white], 'temperature')).toBe('#ffa757');
  });

  it('a light flipped on shows the colour it last glowed until Home Assistant says, and forgets it once white', () => {
    const lamp = view(RED, 'on', 'light.flip');
    expect(glowOf(lamp, true)).toBe('#ff0000');
    // switched off, then on by the finger: Home Assistant still says off, so the colour it last glowed
    const waking = view({}, 'off', 'light.flip');
    expect(glowOf(waking, false)).toBeUndefined();
    expect(glowOf(waking, true)).toBe('#ff0000');
    // lit white now: nothing of its own, and nothing remembered for the next flip
    expect(glowOf(view(WARM, 'on', 'light.flip'), true)).toBeUndefined();
    expect(glowOf(waking, true)).toBeUndefined();
    // a group: its members'
    expect(glowOf(view({}, 'on', 'light.group'), true, 'palette', [lamp])).toBe('#ff0000');
  });
});
