import { describe, expect, it } from 'vitest';

import { labelOf, nameUnder, normaliseExtras, seriesTones } from './series.js';

describe('the sensors on one chart', () => {
  it('reads the extras as entries, two at most, and drops what is not one', () => {
    expect(normaliseExtras(undefined)).toEqual([]);
    expect(normaliseExtras(['sensor.a', { entity: 'sensor.b', name: 'B', color: 'teal' }])).toEqual(
      [{ entity: 'sensor.a' }, { entity: 'sensor.b', name: 'B', color: 'teal' }],
    );
    expect(normaliseExtras(['', { name: 'no id' }, 7, null, 'sensor.c'])).toEqual([
      { entity: 'sensor.c' },
    ]);
    expect(normaliseExtras(['sensor.a', 'sensor.b', 'sensor.c'])).toHaveLength(2);
  });

  it('names a sensor beyond the head, else whole', () => {
    expect(nameUnder('Living room temperature', 'Living room')).toBe('Temperature');
    expect(nameUnder('Office humidity', 'Living room')).toBe('Office humidity');
    expect(nameUnder('Living room', 'Living room')).toBe('Living room');
  });

  it("labels a readout: the config's name, else its measure's word when it alone measures it, else its name", () => {
    const temperature = { name: 'Office climate temperature', deviceClass: 'temperature' };
    const humidity = { name: 'Office climate humidity', deviceClass: 'humidity' };
    const measures = ['temperature', 'humidity'];
    expect(labelOf({}, temperature, 'Office', 'Temperature', measures)).toBe('Temperature');
    expect(labelOf({ name: 'Inside' }, temperature, 'Office', 'Temperature', measures)).toBe(
      'Inside',
    );
    expect(labelOf({}, humidity, 'Office', 'Humidity', measures)).toBe('Humidity');
    // two temperatures: their names tell them apart
    const twice = ['temperature', 'temperature'];
    expect(labelOf({}, temperature, 'Office', 'Temperature', twice)).toBe('Climate temperature');
    expect(
      labelOf(
        {},
        { name: 'Office patio', deviceClass: 'temperature' },
        'Office',
        'Temperature',
        twice,
      ),
    ).toBe('Patio');
    // no measure word known, or no class: the name beyond the head
    expect(labelOf({}, temperature, 'Office climate', '', measures)).toBe('Temperature');
    expect(labelOf({}, { name: 'Washer' }, 'Living room', '', [undefined, 'temperature'])).toBe(
      'Washer',
    );
  });

  it('labels a sensor that is not there by the last word of its id, unless the config names it', () => {
    const gone = { id: 'sensor.bme280_humidity', name: 'Bme280 humidity', status: 'missing' };
    expect(labelOf({}, gone, 'Living room', '', [undefined])).toBe('Humidity');
    expect(labelOf({ name: 'Air' }, gone, 'Living room', '', [undefined])).toBe('Air');
    // unavailable keeps its name and its class: it is labelled as it is live
    const away = { ...gone, name: 'Bedroom humidity', status: 'unavailable' };
    expect(labelOf({}, away, 'Bedroom', '', [undefined])).toBe('Humidity');
  });
});

describe('seriesTones: two curves never closer than the gate', () => {
  // inks on a warm palette: heat and solar sit 4 apart, water and the accent far from both
  const INK: Record<string, string> = {
    heat: '#c0392b',
    solar: '#c8471f',
    water: '#1f6fb8',
    accent: '#2f8f5b',
    grid: '#6b4fa0',
    '#123456': '#123456',
  };
  const inkOf = (source: string): string | undefined => INK[source];
  /** A stand-in distance: the inks' places on a line, by name. */
  const PLACE: Record<string, number> = {
    '#c0392b': 0,
    '#c8471f': 4,
    '#1f6fb8': 40,
    '#2f8f5b': 80,
    '#6b4fa0': 120,
    '#123456': 2,
  };
  const distance = (a: string, b: string): number => Math.abs((PLACE[a] ?? 0) - (PLACE[b] ?? 0));

  it('keeps the measures’ tones while they stand apart', () => {
    expect(seriesTones([{ tone: 'heat' }, { tone: 'water' }], inkOf, distance, 8)).toEqual([
      'heat',
      'water',
    ]);
  });

  it('moves a second curve to the first spare tone far enough from the first (a repeat, or a near colour)', () => {
    // the same tone twice: the first spare (the accent, 80 away)
    expect(seriesTones([{ tone: 'heat' }, { tone: 'heat' }], inkOf, distance, 8)).toEqual([
      'heat',
      'accent',
    ]);
    // solar 4 from heat: too close for the gate of 8
    expect(seriesTones([{ tone: 'heat' }, { tone: 'solar' }], inkOf, distance, 8)).toEqual([
      'heat',
      'accent',
    ]);
    // a third curve keeps away from both
    expect(
      seriesTones([{ tone: 'heat' }, { tone: 'solar' }, { tone: 'accent' }], inkOf, distance, 8),
    ).toEqual(['heat', 'accent', 'water']);
  });

  it('leaves a curve with a colour of its own as the user chose it, and keeps the others away from it', () => {
    // the user's hex sits 2 from heat: heat moves to the spare farthest from it, not the other way round
    expect(
      seriesTones(
        [{ tone: 'water' }, { tone: 'heat', own: '#123456' }, { tone: 'heat' }],
        inkOf,
        distance,
        8,
      ),
    ).toEqual(['water', 'heat', 'accent']);
  });

  it('leaves a curve without an ink (out of reach) alone', () => {
    expect(seriesTones([{ tone: 'heat' }, { tone: 'off' }], inkOf, distance, 8)).toEqual([
      'heat',
      'off',
    ]);
  });
});
