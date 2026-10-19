import { describe, expect, it } from 'vitest';
import { scores } from '../energy-model/allocate.js';
import {
  arcDash,
  hasCo2Signal,
  netWay,
  RING,
  RING_SMALL,
  ringLayout,
  ringPercent,
  ringRadius,
  ringsOf,
  totalsLayout,
} from './rings.js';

const day = {
  totals: { solar: 11.2, fromGrid: 4.1, toGrid: 1.3, fromBattery: 2.4, toBattery: 3.0 },
  buckets: [
    { totals: { solar: 11.2, fromGrid: 4.1, toGrid: 1.3, fromBattery: 2.4, toBattery: 3.0 } },
  ],
  battery: true,
  exported: true,
};

describe('the score’s rings', () => {
  it('keeps the low-carbon ring for a CO₂ signal out of reach, the card’s own or the house’s (1.9)', () => {
    expect(hasCo2Signal('sensor.fossil', {})).toBe(true);
    // the house's integration put it there; its state may be gone
    expect(hasCo2Signal(undefined, { 'sensor.fossil': { platform: 'co2signal' } })).toBe(true);
    expect(hasCo2Signal(undefined, { 'sensor.solar': { platform: 'solaredge' } })).toBe(false);
    expect(hasCo2Signal(undefined, undefined)).toBe(false);
  });

  it('a ring the house cannot have is left out; the others keep their order', () => {
    const s = scores(day);
    expect(ringsOf({ solar: true, exported: true, co2: true }, s, 0.87).map((r) => r.key)).toEqual([
      'self_powered',
      'sun_used',
      'low_carbon',
    ]);
    // no sun, or no export meter (Home Assistant cannot tell the sun's share without it): no "sun used"
    expect(ringsOf({ solar: false, exported: true, co2: true }, s, 0.87).map((r) => r.key)).toEqual(
      ['self_powered', 'low_carbon'],
    );
    expect(
      ringsOf({ solar: true, exported: false, co2: false }, s, null).map((r) => r.key),
    ).toEqual(['self_powered']);
  });

  it('a figure not in yet is null — "—" over an empty ring — never 0', () => {
    const rings = ringsOf({ solar: true, exported: true, co2: true }, null, null);
    expect(rings.every((r) => r.value === null)).toBe(true);
    expect(ringPercent(null)).toBeNull();
    expect(arcDash(null)).toMatch(/^0\.0 /);
  });

  it('rounds to a whole percent as Home Assistant’s gauges do, and draws the arc to its share', () => {
    const s = scores(day);
    expect(ringPercent(s.selfPowered)).toBe(69);
    expect(ringPercent(s.sunUsed)).toBe(88);
    const circle = 2 * Math.PI * ringRadius(RING);
    expect(ringRadius(RING)).toBe(36);
    expect(ringRadius(RING_SMALL)).toBe(24);
    expect(arcDash(0.5)).toBe(`${(circle / 2).toFixed(1)} ${circle.toFixed(1)}`);
    // a figure past either end draws at that end
    expect(arcDash(1.2)).toBe(`${circle.toFixed(1)} ${circle.toFixed(1)}`);
    expect(arcDash(-0.1)).toMatch(/^0\.0 /);
  });
});

describe('how the rings lie', () => {
  it('three in a full column spread over it, in the design’s columns of 96', () => {
    expect(ringLayout(3, 320, 93)).toMatchObject({
      columns: 3,
      column: 96,
      spread: true,
      small: false,
    });
  });

  it('a longer word widens its column (to an even width: the ring stays on whole pixels)', () => {
    // the ruler's rounding pixel aside: "SELF-POWERED" measured at 97 holds in 96
    expect(ringLayout(3, 320, 97).column).toBe(96);
    expect(ringLayout(3, 320, 99).column).toBe(98);
    expect(ringLayout(3, 320, 100).column).toBe(100);
  });

  it('fewer rings stay centred, 16 apart; a column that cannot hold three wraps them', () => {
    expect(ringLayout(2, 320, 93)).toMatchObject({ columns: 2, spread: false, gap: 16 });
    expect(ringLayout(3, 224, 93)).toMatchObject({ columns: 2, spread: false, gap: 16 });
    expect(ringLayout(3, 280, 93)).toMatchObject({ columns: 2, spread: false });
  });

  it('a column narrower than a ring takes the small ring, one a row', () => {
    expect(ringLayout(3, 84, 93)).toMatchObject({ columns: 1, column: 84, small: true });
    expect(ringLayout(3, 85, 93).column).toBe(84);
  });
});

describe('Imported · Exported · Net', () => {
  it('in the rings’ columns when they hold every readout, the net with its way', () => {
    expect(totalsLayout(320, { plain: 64, way: 80 })).toEqual({ layout: 'columns', way: true });
    // the rings' own columns, when a longer word widened them
    expect(totalsLayout(352, { plain: 64, way: 80 }, 100)).toEqual({
      layout: 'columns',
      way: true,
    });
    expect(totalsLayout(320, { plain: 64, way: 80 }, 100).layout).toBe('fluid');
  });

  it('a way that does not fit its column leaves the net signed before the row is given up', () => {
    // German: "0,5 kWh Einspeisung"
    expect(totalsLayout(320, { plain: 72, way: 130 })).toEqual({ layout: 'columns', way: false });
  });

  it('a narrower column: three equal columns 8 apart, then one under the other', () => {
    expect(totalsLayout(276, { plain: 64, way: 82 })).toEqual({ layout: 'fluid', way: true });
    expect(totalsLayout(224, { plain: 64, way: 80 })).toEqual({ layout: 'fluid', way: false });
    expect(totalsLayout(84, { plain: 64, way: 80 })).toEqual({ layout: 'stacked', way: true });
  });

  it('the net’s way: in for a net importer, out for a net exporter, none at 0', () => {
    expect(netWay(2.8, 0.005)).toBe('in');
    expect(netWay(-0.5, 0.005)).toBe('out');
    expect(netWay(0.001, 0.005)).toBe('');
    expect(netWay(null, 0.005)).toBe('');
  });
});
