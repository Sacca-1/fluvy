import { describe, expect, it } from 'vitest';
import { convert, convertible, unitClass, unitsFor } from './units.js';

describe('the units Home Assistant’s statistics convert', () => {
  it('asks the recorder in a unit of energy, power, volume or distance; nothing for any other', () => {
    expect(unitsFor('kWh')).toEqual({ energy: 'kWh' });
    expect(unitsFor('W')).toEqual({ power: 'W' });
    expect(unitsFor('m³')).toEqual({ volume: 'm³' });
    expect(unitsFor('in')).toEqual({ distance: 'in' });
    expect(unitsFor('°C')).toBeUndefined();
    expect(unitsFor('%')).toBeUndefined();
    expect(unitsFor('')).toBeUndefined();
  });

  it('reads a value in another unit of its class: a rain gauge in inches, a meter in cubic metres', () => {
    expect(convert(16.9, 'mm', 'in')).toBeCloseTo(0.6654, 4);
    expect(convert(1250, 'L', 'm³')).toBeCloseTo(1.25, 6);
    expect(convert(33_300, 'Wh', 'kWh')).toBeCloseTo(33.3, 6);
    expect(convert(1, 'GJ', 'kWh')).toBeCloseTo(277.78, 2);
    expect(convert(2, 'gal', 'L')).toBeCloseTo(7.5708, 4);
  });

  it('leaves a value whose units do not convert as it is, and says so', () => {
    expect(convert(21.5, '°C', 'kWh')).toBe(21.5);
    expect(convert(3, 'kWh', 'L')).toBe(3);
    expect(convertible('mm', 'in')).toBe(true);
    expect(convertible('kWh', 'kWh')).toBe(true);
    expect(convertible('%', '%')).toBe(true);
    expect(convertible('kWh', 'm³')).toBe(false);
    expect(convertible('°C', '°F')).toBe(false);
    expect(unitClass('fl. oz.')).toBe('volume');
    expect(unitClass('furlong')).toBeUndefined();
  });
});
