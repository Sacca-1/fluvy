import { describe, expect, it } from 'vitest';

import { labelOf, nameUnder, normaliseExtras } from './series.js';

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
});
