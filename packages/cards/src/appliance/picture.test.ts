import { describe, expect, it } from 'vitest';
import { headFit, SUB_BESIDE } from './picture.js';

/*
 * The whole card's head (#47): the picture gives way before a letter of the name does. The names are German ones from
 * the reporter's house and the judge's probes, each as the card's ruler measures it in its head title (Inter 700, its
 * −0.01em tracking, the ruler's pixel for rounding) at 20 and at 16; the columns are 211, 266 and 360 (the card's 20
 * a side), the round 48 and its 16.
 */
const NAMES: Readonly<Record<string, readonly [number, number]>> = {
  Backofen: [95, 78],
  Kühlschrank: [121, 99],
  Spülmaschine: [138, 112],
  Wasserkocher: [142, 117],
  Geschirrspüler: [143, 119],
  'Trockner Keller': [148, 123],
  Heißluftfritteuse: [160, 133],
  Waschmaschine: [161, 132],
  Kaffeevollautomat: [185, 149],
  'Waschmaschine Keller': [219, 180],
  'Kühl-Gefrierkombination': [240, 194],
  'Samsung Geschirrspüler': [239, 196],
};
const ROUND = 48 + 16;

/** The head at a column: its picture, whether the name steps to 16, and whether the name is whole. */
const at = (column: number, name: string, picture = true) => {
  const [big, small] = NAMES[name] ?? [0, 0];
  const fit = headFit(column - 40, ROUND, picture, big, small);
  return {
    size: fit.size,
    small: fit.small,
    whole: (fit.small ? small : big) <= fit.room,
    under: fit.under,
  };
};

describe('the whole card’s head', () => {
  it('gives its picture up before a letter of the name: 64, 44, 44 with the name at 16, none (#47)', () => {
    // a 360 column, as the reporter's page: his names whole at 20 beside the 64
    for (const name of [
      'Backofen',
      'Kühlschrank',
      'Geschirrspüler',
      'Waschmaschine',
      'Heißluftfritteuse',
    ])
      expect(at(360, name), name).toEqual({ size: 64, small: false, whole: true, under: false });
    // a longer one keeps its 20 beside the 44; longer still, the 44 with the name at 16 — never cut beside a picture
    expect(at(360, 'Kaffeevollautomat')).toEqual({
      size: 44,
      small: false,
      whole: true,
      under: false,
    });
    for (const name of [
      'Waschmaschine Keller',
      'Samsung Geschirrspüler',
      'Kühl-Gefrierkombination',
    ])
      expect(at(360, name), name).toEqual({ size: 44, small: true, whole: true, under: false });
  });

  it('at 266, the German names are whole: the picture goes first (#47)', () => {
    // "Waschma…" and "Geschirrs…" beside a 44 were the judge's: each holds without it
    for (const name of [
      'Waschmaschine',
      'Geschirrspüler',
      'Spülmaschine',
      'Wasserkocher',
      'Trockner Keller',
    ])
      expect(at(266, name), name).toEqual({ size: 0, small: false, whole: true, under: true });
    expect(at(266, 'Kaffeevollautomat')).toEqual({
      size: 0,
      small: true,
      whole: true,
      under: true,
    });
    // a short one keeps a picture
    expect(at(266, 'Backofen')).toEqual({ size: 44, small: false, whole: true, under: true });
    expect(at(266, 'Kühlschrank')).toEqual({ size: 44, small: true, whole: true, under: true });
  });

  it('at 211, no picture; the name at 20, then 16, and only one that holds nowhere ends in its ellipsis', () => {
    expect(at(211, 'Backofen')).toEqual({ size: 0, small: false, whole: true, under: true });
    expect(at(211, 'Kühlschrank')).toEqual({ size: 0, small: true, whole: true, under: true });
    expect(at(211, 'Waschmaschine')).toEqual({ size: 0, small: true, whole: false, under: true });
  });

  it('says what the appliance does beside the name or under the head by the column alone, never by the name', () => {
    for (const column of [211, 266, 300, 320, 360, 412]) {
      const said = Object.keys(NAMES).map((name) => at(column, name).under);
      expect(new Set(said).size, String(column)).toBe(1);
      expect(said[0], String(column)).toBe(column - 40 - ROUND - 64 - 16 < SUB_BESIDE);
    }
    // without a picture, by the room the column leaves the name
    expect(at(266, 'Waschmaschine', false).under).toBe(226 - ROUND < SUB_BESIDE);
    expect(at(360, 'Waschmaschine Keller', false)).toEqual({
      size: 0,
      small: false,
      whole: true,
      under: false,
    });
  });
});
