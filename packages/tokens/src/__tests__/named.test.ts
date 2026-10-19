import { describe, expect, it } from 'vitest';
import { fromHex, hueDistance, isHex } from '../color/oklch.js';
import { RAMP_LIGHTNESS } from '../color/ramp.js';
import { derivePalettes } from '../build/palettes.js';
import {
  HA_COLOR_NAMES,
  NAMED_COLORS,
  NEUTRAL_RUNGS,
  resolveAccent,
  THEME_COLOR_NAMES,
} from '../ha/named.js';

const linen = derivePalettes().find((p) => p.name === 'linen')!;

describe('Home Assistant’s named colours', () => {
  it('are the 23 of its colour selector less primary and accent, 21 of them the theme’s', () => {
    expect(HA_COLOR_NAMES).toHaveLength(23);
    expect(THEME_COLOR_NAMES).toHaveLength(21);
    expect(THEME_COLOR_NAMES).not.toContain('black');
    expect(HA_COLOR_NAMES).toContain('black');
  });

  it('each resolve to a plain hex of the palette, in both modes', () => {
    for (const mode of ['light', 'dark'] as const)
      for (const name of HA_COLOR_NAMES)
        expect(isHex(NAMED_COLORS[name](linen[mode])), name).toBe(true);
  });

  it('keep the tone Home Assistant gives them', () => {
    const c = linen.light;
    expect(NAMED_COLORS.teal(c)).toBe(c.state['presence-home'].ink);
    expect(NAMED_COLORS.cyan(c)).toBe(c.state['energy-water'].ink);
    expect(NAMED_COLORS.brown(c)).toBe(c.state['energy-gas'].ink);
    expect(NAMED_COLORS.pink(c)).toBe(c.state['security-armed'].ink);
    expect(NAMED_COLORS.black(c)).toBe(c.neutralRamp['05']);
    expect(NAMED_COLORS.white(c)).toBe(c.neutralRamp['95']);
    // blue-grey is a grey with a whisper of Home Assistant's own cool, whatever the palette's greys lean to
    const blueGrey = fromHex(NAMED_COLORS['blue-grey'](c));
    expect(blueGrey.c).toBeLessThan(0.03);
    expect(hueDistance(blueGrey.h, fromHex('#607d8b').h)).toBeLessThan(5);
  });

  it('name six greys, each at the lightness of its rung of the ladder', () => {
    for (const [name, step] of NEUTRAL_RUNGS)
      expect(fromHex(NAMED_COLORS[name](linen.light)).l, name).toBeCloseTo(RAMP_LIGHTNESS[step], 2);
  });
});

describe('resolveAccent', () => {
  const c = linen.light;
  it('reads a name, a hex in any case or length, and a triplet', () => {
    expect(resolveAccent('Teal', c)).toBe(c.state['presence-home'].ink);
    expect(resolveAccent(' #AABBCC ', c)).toBe('#aabbcc');
    expect(resolveAccent('#abc', c)).toBe('#aabbcc');
    expect(resolveAccent([255, 74, 26], c)).toBe('#ff4a1a');
  });
  it('reads the theme’s inks a dashboard’s YAML may name, on the palette (#40)', () => {
    expect(resolveAccent('primary-text', c)).toBe(c.text.primary);
    expect(resolveAccent('Secondary-Text', c)).toBe(c.text.secondary);
    expect(resolveAccent('disabled', c)).toBe(c.unavailable.ink);
    expect(resolveAccent('primary-text', linen.dark)).toBe(linen.dark.text.primary);
  });
  it('reads what Home Assistant’s picker lets you type: an alpha dropped, rgb() with commas or spaces (#40)', () => {
    expect(resolveAccent('#AABBCC80', c)).toBe('#aabbcc');
    expect(resolveAccent('#abcd', c)).toBe('#aabbcc');
    expect(resolveAccent('rgb(255, 74, 26)', c)).toBe('#ff4a1a');
    expect(resolveAccent('rgb(255 74 26)', c)).toBe('#ff4a1a');
    expect(resolveAccent('rgba(255, 74, 26, 0.5)', c)).toBe('#ff4a1a');
    expect(resolveAccent('rgb(255 74 26 / 50%)', c)).toBe('#ff4a1a');
    // no opacity at all is no colour
    expect(resolveAccent('#aabbcc00', c)).toBeUndefined();
    expect(resolveAccent('rgba(0, 0, 0, 0)', c)).toBeUndefined();
  });
  it('is nothing for the palette’s own names, an empty value and nonsense', () => {
    for (const choice of [
      'primary',
      'accent',
      'none',
      'state',
      '',
      undefined,
      null,
      42,
      'reddish',
      'constructor',
      '#12345',
      '#1234567',
      'rgb(256, 0, 0)',
      'rgb(1, 2)',
      [1, 2],
      [256, 0, 0],
      {},
    ])
      expect(resolveAccent(choice, c), String(choice)).toBeUndefined();
  });
});
