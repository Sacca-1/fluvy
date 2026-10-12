import { describe, expect, it } from 'vitest';

import { CUSTOM, defaultSwatches, rgbOf, swatchEntry, swatchItem, tripletOf } from './swatches.js';

describe('the quick colours’ grammar', () => {
  it('reads a hex with or without its hash, short or long, and a triplet kept to 0–255', () => {
    expect(rgbOf('#FF2D55')).toEqual([255, 45, 85]);
    expect(rgbOf('ff2d55')).toEqual([255, 45, 85]);
    expect(rgbOf(' #abc ')).toEqual([170, 187, 204]);
    expect(rgbOf('not a colour')).toBeUndefined();
    expect(tripletOf([10, 300, -4, 99])).toEqual([10, 255, 0]);
    expect(tripletOf([1, 2])).toBeUndefined();
    expect(tripletOf([1, 2, 'x'])).toBeUndefined();
    expect(tripletOf('#ff2d55')).toBeUndefined();
  });

  it('gives a bulb two whites first when it has a temperature, colours alone otherwise', () => {
    expect(defaultSwatches(['hs', 'color_temp'])).toEqual([
      'warm',
      'cool',
      'red',
      'orange',
      'green',
      'blue',
    ]);
    expect(defaultSwatches(['rgb'])).toEqual(['red', 'orange', 'green', 'blue', 'purple', 'pink']);
    expect(defaultSwatches([])).toEqual(['red', 'orange', 'green', 'blue', 'purple', 'pink']);
  });
});

describe('a quick colour as a row of the editor', () => {
  it('reads a word, the picker and a Home Assistant name as the select’s value', () => {
    expect(swatchItem('warm')).toEqual({ color: 'warm' });
    expect(swatchItem(' Picker ')).toEqual({ color: 'picker' });
    expect(swatchItem('deep-purple')).toEqual({ color: 'deep-purple' });
  });

  it('reads a hex and a triplet as Custom with the well on them', () => {
    expect(swatchItem('#FF2D55')).toEqual({ color: CUSTOM, rgb: [255, 45, 85] });
    expect(swatchItem('abc')).toEqual({ color: CUSTOM, rgb: [170, 187, 204] });
    expect(swatchItem([0, 128, 128])).toEqual({ color: CUSTOM, rgb: [0, 128, 128] });
  });

  it('keeps a named entry’s name, whatever its colour is', () => {
    expect(swatchItem({ color: '#ff2d55', name: 'Lila' })).toEqual({
      color: CUSTOM,
      rgb: [255, 45, 85],
      name: 'Lila',
    });
    expect(swatchItem({ color: [0, 128, 128], name: 'Teal' })).toEqual({
      color: CUSTOM,
      rgb: [0, 128, 128],
      name: 'Teal',
    });
    expect(swatchItem({ color: 'amber', name: 'Honey' })).toEqual({
      color: 'amber',
      name: 'Honey',
    });
    expect(swatchItem({ color: 'warm', name: '  ' })).toEqual({ color: 'warm' }); // a blank name is none
  });

  it('drops what is no colour at all', () => {
    expect(swatchItem('')).toBeNull();
    expect(swatchItem([1, 2])).toBeNull();
    expect(swatchItem({ name: 'Nameless' })).toBeNull();
    expect(swatchItem({ color: [1, 2], name: 'Short' })).toBeNull();
    expect(swatchItem(42)).toBeNull();
    expect(swatchItem(null)).toBeNull();
  });
});

describe('a row of the editor as a quick colour', () => {
  it('writes a word alone as the bare word, and a named one as { color, name }', () => {
    expect(swatchEntry({ color: 'warm' })).toBe('warm');
    expect(swatchEntry({ color: 'Picker', name: '' })).toBe('picker');
    expect(swatchEntry({ color: 'amber', name: 'Honey' })).toEqual({
      color: 'amber',
      name: 'Honey',
    });
  });

  it('writes a Custom row as its hex, a fresh one as Home Assistant’s orange', () => {
    expect(swatchEntry({ color: CUSTOM, rgb: [255, 45, 85] })).toBe('#ff2d55');
    expect(swatchEntry({ color: CUSTOM, rgb: [0, 128, 128], name: 'Teal' })).toEqual({
      color: '#008080',
      name: 'Teal',
    });
    expect(swatchEntry({ color: CUSTOM })).toBe('#ff9800');
    expect(swatchEntry({ color: CUSTOM, rgb: 'nonsense' })).toBe('#ff9800');
  });

  it('writes a hex typed in the select as its canonical form, and ignores a well left on a word row', () => {
    expect(swatchEntry({ color: '#ABC' })).toBe('#aabbcc');
    expect(swatchEntry({ color: 'ff2d55' })).toBe('#ff2d55');
    expect(swatchEntry({ color: 'blue', rgb: [255, 45, 85] })).toBe('blue');
  });

  it('writes nothing for a row without a colour', () => {
    expect(swatchEntry({})).toBeNull();
    expect(swatchEntry({ color: '', name: 'Lila' })).toBeNull();
    expect(swatchEntry({ color: 7 })).toBeNull();
  });

  it('round-trips every form of the grammar through a row and back', () => {
    const back = (entry: unknown): unknown => swatchEntry(swatchItem(entry) ?? {});
    expect(back('warm')).toBe('warm');
    expect(back('picker')).toBe('picker');
    expect(back('deep-purple')).toBe('deep-purple');
    expect(back('#ff2d55')).toBe('#ff2d55');
    expect(back('#ABC')).toBe('#aabbcc');
    expect(back([0, 128, 128])).toBe('#008080'); // a triplet becomes its hex once the list is touched
    expect(back({ color: '#ff2d55', name: 'Lila' })).toEqual({ color: '#ff2d55', name: 'Lila' });
    expect(back({ color: 'amber', name: 'Honey' })).toEqual({ color: 'amber', name: 'Honey' });
  });
});
