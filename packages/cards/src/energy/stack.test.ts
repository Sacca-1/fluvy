import { describe, expect, it } from 'vitest';
import {
  aggregate,
  BELOW_ROOM,
  chargeLine,
  crosses,
  flowShape,
  flowsOf,
  integrate,
  integrateFlows,
  meterBlock,
  stackOf,
  stackShape,
} from './stack.js';

const DAY = Date.parse('2026-09-30T22:00:00Z');
const bucket = (minute: number, totals: Record<string, number>) => ({
  start: DAY + minute * 60_000,
  totals: { solar: 0, fromGrid: 0, toGrid: 0, fromBattery: 0, toBattery: 0, ...totals },
});

describe('the house by source', () => {
  it('turns five minutes of energy into average power, allocated the dashboard’s way', () => {
    // 12:00: 0.25 kWh of sun in five minutes is 3 kW; 0.05 of it charged the battery, 0.1 went out
    const [p] = stackOf([bucket(720, { solar: 0.25, toBattery: 0.05, toGrid: 0.1 })], DAY);
    expect(p?.at).toBeCloseTo((720 + 2.5) / 1440);
    expect(p?.used.solar).toBeCloseTo(1.2);
    expect(p?.charged).toBeCloseTo(0.6);
    expect(p?.exported).toBeCloseTo(1.2);
    expect(p?.used.grid).toBe(0);
  });

  it('reads power buckets as they are: kW means need no conversion', () => {
    const [p] = stackOf([bucket(720, { solar: 6, toBattery: 4.5, toGrid: 0.2 })], DAY, 5, 'kW');
    expect(p?.used.solar).toBeCloseTo(1.3);
    expect(p?.charged).toBeCloseTo(4.5);
    expect(p?.exported).toBeCloseTo(0.2);
  });

  it('stacks from the sun up and keeps one kW scale above and below the line', () => {
    const points = stackOf(
      [
        bucket(0, { fromGrid: 0.05 }),
        bucket(720, { solar: 0.25, toGrid: 0.1 }),
        bucket(1200, { fromBattery: 0.05, fromGrid: 0.02 }),
      ],
      DAY,
    );
    const shape = stackShape(points, 320, 160);
    expect(shape.layers.map((l) => l.key)).toEqual(['solar', 'battery', 'grid']);
    expect(shape.below.map((b) => b.key)).toEqual(['exported']);
    // 1.8 kW used at the top and 1.2 kW out: the line sits 12 + 147 × 1.8 / 3 down (the foot a pixel up, its edge whole)
    expect(shape.zero).toBeCloseTo(12 + (147 * 1.8) / 3);
    expect(shape.y(0)).toBeCloseTo(shape.zero);
  });

  it('draws the battery’s charge under the line, the export under it', () => {
    const points = stackOf(
      [
        bucket(720, { solar: 0.5, toBattery: 0.3, toGrid: 0.1 }),
        bucket(725, { solar: 0.5, toBattery: 0.3, toGrid: 0.1 }),
      ],
      DAY,
    );
    const shape = stackShape(points, 320, 160);
    expect(shape.below.map((b) => b.key)).toEqual(['charged', 'exported']);
    // 1.2 kW used, 3.6 kW charged and 1.2 kW exported: one scale for 1.2 up and 4.8 down
    expect(shape.zero).toBeCloseTo(12 + (147 * 1.2) / 6);
  });

  it('a day with nothing out keeps its line at the bottom', () => {
    const shape = stackShape(
      stackOf([bucket(0, { fromGrid: 0.1 }), bucket(5, { fromGrid: 0.1 })], DAY),
      320,
      160,
    );
    expect(shape.below).toEqual([]);
    expect(shape.zero).toBeCloseTo(159);
  });

  it('never joins points across a gap: a run a stretch of data, a lone point across its own bucket', () => {
    const points = stackOf(
      [
        bucket(0, { fromGrid: 0.05 }),
        bucket(5, { fromGrid: 0.05 }),
        // the recorder was down from 00:10 to 00:30
        bucket(30, { fromGrid: 0.05 }),
      ],
      DAY,
    );
    const shape = stackShape(points, 1440, 160);
    const grid = shape.layers.find((l) => l.key === 'grid');
    expect(grid?.line.match(/M/g)?.length).toBe(2);
    // the lone point at 00:30 spans 00:30–00:35 (1 px a minute)
    expect(grid?.line).toContain('M30.0,');
    expect(grid?.line).toContain('35.0,');
  });
});

describe('coarse meters', () => {
  it('sums five-minute changes into fifteen-minute blocks, so 0.1 kWh steps even out', () => {
    // 1.2 kW from the grid on a meter that ticks in 0.1 kWh: 0, 0.1, 0.2, 0.1, 0, 0.2
    const steps = [0, 0.1, 0.2, 0.1, 0, 0.2];
    const blocks = aggregate(
      steps.map((fromGrid, i) => bucket(i * 5, { fromGrid })),
      DAY,
    );
    expect(blocks.map((b) => b.totals.fromGrid)).toEqual([
      expect.closeTo(0.3),
      expect.closeTo(0.3),
    ]);
    const points = stackOf(blocks, DAY, 15);
    expect(points.map((p) => p.used.grid)).toEqual([expect.closeTo(1.2), expect.closeTo(1.2)]);
  });

  it('keeps a gap as a gap: a block with no bucket is absent', () => {
    const blocks = aggregate([bucket(0, { fromGrid: 0.1 }), bucket(60, { fromGrid: 0.1 })], DAY);
    expect(blocks.map((b) => (b.start - DAY) / 60_000)).toEqual([0, 60]);
  });

  it('integrates a curve of power into the day’s energy', () => {
    const points = stackOf(
      [bucket(0, { fromGrid: 1.2 }), bucket(5, { solar: 3, toBattery: 0.6, toGrid: 0.6 })],
      DAY,
      5,
      'kW',
    );
    const day = integrate(points, 5);
    expect(day.used.grid).toBeCloseTo(0.1);
    expect(day.used.solar).toBeCloseTo(0.15);
    expect(day.charged).toBeCloseTo(0.05);
    expect(day.exported).toBeCloseTo(0.05);
  });
});

describe('the block meters are drawn in', () => {
  const zero = {
    solar: 0,
    fromGrid: 0,
    toGrid: 0,
    fromBattery: 0,
    toBattery: 0,
    generator: 0,
    fromVehicle: 0,
    toVehicle: 0,
  };
  const night = (step: number, kw: number) =>
    Array.from({ length: 96 }, (_, i) => {
      // a meter that counts in `step` kWh at a steady draw: whole steps, a tick whenever one is due
      const before = Math.floor((i * kw) / 12 / step + 1e-9);
      const after = Math.floor(((i + 1) * kw) / 12 / step + 1e-9);
      return { start: i * 300_000, totals: { ...zero, fromGrid: (after - before) * step } };
    });

  it('keeps the quarter for a precise meter', () => {
    expect(meterBlock(night(0.001, 0.4))).toBe(15);
  });

  it('widens it until a coarse meter’s step no longer shows', () => {
    // 0.1 kWh at 0.4 kW ticks about once a quarter: only an hour (four ticks) hides the step
    expect(meterBlock(night(0.1, 0.4))).toBe(60);
    expect(meterBlock(night(0.1, 2))).toBe(30);
    expect(meterBlock(night(0.1, 4))).toBe(15);
    expect(meterBlock([])).toBe(15);
  });
});

describe('the room under the line', () => {
  it('keeps the tag’s 28 px under the zero line when little went out, on one scale', () => {
    const point = (exported: number) => ({
      at: 0.5,
      used: { solar: 4, battery: 0, gas: 0, vehicle: 0, grid: 0 },
      charged: 0,
      exported,
    });
    const shape = stackShape([point(0.05), { ...point(0.05), at: 0.51 }], 1440, 200);
    expect(199 - shape.zero).toBeCloseTo(BELOW_ROOM);
    // the same kW is the same height above and below
    expect(shape.y(1) - shape.y(2)).toBeCloseTo(shape.y(-1) - shape.y(0));
    // nothing out: no room taken
    expect(stackShape([point(0), { ...point(0), at: 0.51 }], 1440, 200).zero).toBe(199);
  });
});

describe('the whole house', () => {
  it('keeps every flow as it came: the sun’s whole production above, the charge and the export below', () => {
    // 12:00: 6 kW of sun, 4.5 into the battery, 0.2 out to the grid; the house used the rest (1.3)
    const [p] = flowsOf([bucket(720, { solar: 6, toBattery: 4.5, toGrid: 0.2 })], DAY, 5, 'kW');
    expect(p?.into.solar).toBeCloseTo(6);
    expect(p?.out.battery).toBeCloseTo(4.5);
    expect(p?.out.grid).toBeCloseTo(0.2);
    expect(p?.house).toBeCloseTo(1.3);
    expect(p?.into.grid).toBe(0);
  });

  it('turns meters’ energy into power over their block', () => {
    const [p] = flowsOf([bucket(720, { solar: 0.75, fromBattery: 0.25 })], DAY, 15);
    expect(p?.into.solar).toBeCloseTo(3);
    expect(p?.into.battery).toBeCloseTo(1);
    expect(p?.at).toBeCloseTo((720 + 7.5) / 1440);
  });

  it('stacks the sources from the sun up and the outflows from the line down, on one kW scale', () => {
    const points = flowsOf(
      [
        bucket(0, { fromBattery: 0.8, fromGrid: 0.2 }),
        bucket(5, { fromBattery: 0.8, fromGrid: 0.2 }),
        bucket(720, { solar: 5, toBattery: 2, toGrid: 1 }),
        bucket(725, { solar: 5, toBattery: 2, toGrid: 1 }),
      ],
      DAY,
      5,
      'kW',
    );
    const shape = flowShape(points, 320, 184, 28);
    expect(shape.above.map((a) => a.key)).toEqual(['solar', 'battery', 'grid']);
    expect(shape.below.map((b) => b.key)).toEqual(['battery', 'grid']);
    // 5 kW at the top and 3 kW out: the line sits 28 + 155 × 5 / 8 down, the deepest outflow on the foot (183)
    expect(shape.zero).toBeCloseTo(28 + (155 * 5) / 8);
    expect(shape.y(-3)).toBeCloseTo(183);
    // the house's line is drawn over the stacks
    expect(shape.house.startsWith('M')).toBe(true);
  });

  it('splits every area and the house’s line where the recorder stopped', () => {
    const points = flowsOf(
      [
        bucket(0, { fromGrid: 1 }),
        bucket(5, { fromGrid: 1 }),
        bucket(60, { fromGrid: 1 }),
        bucket(65, { fromGrid: 1 }),
      ],
      DAY,
      5,
      'kW',
    );
    const shape = flowShape(points, 320, 184, 28);
    expect(shape.house.match(/M/g)).toHaveLength(2);
    expect(shape.above[0]?.area.match(/M/g)).toHaveLength(2);
  });

  it('adds the day up from its power: kWh by source, outflow and the house', () => {
    const points = flowsOf(
      [bucket(720, { solar: 6, toBattery: 3 }), bucket(725, { solar: 6, toBattery: 3 })],
      DAY,
      5,
      'kW',
    );
    const day = integrateFlows(points, 5);
    expect(day.into.solar).toBeCloseTo(1);
    expect(day.out.battery).toBeCloseTo(0.5);
    expect(day.house).toBeCloseTo(0.5);
  });

  it('draws the charge on its own scale: 100 % at the top, 0 % at the foot, split at a gap', () => {
    const line = chargeLine(
      [
        { at: 0, level: 50 },
        { at: 5 / 1440, level: 60 },
        { at: 120 / 1440, level: 80 },
        { at: 125 / 1440, level: 100 },
      ],
      320,
      28,
      184,
    );
    expect(line.y(100)).toBe(28);
    expect(line.y(0)).toBe(184);
    expect(line.y(150)).toBe(28); // never outside its scale
    expect(line.line.match(/M/g)).toHaveLength(2);
    // each run is laid out a whole number of 4 · 4 dashes long, ending on a dash: a gap reads as two ends
    expect(line.runs).toHaveLength(2);
    for (const run of line.runs) expect((run.dashes - 4) % 8).toBe(0);
  });

  it('keeps the charge above the kW zero line, however deep the export runs (issue #28)', () => {
    const points = flowsOf(
      [
        bucket(720, { solar: 6, toBattery: 0.5, toGrid: 4.5 }),
        bucket(725, { solar: 6, toBattery: 0.5, toGrid: 4.5 }),
      ],
      DAY,
      5,
      'kW',
    );
    const shape = flowShape(points, 320, 184, 28);
    expect(shape.zero).toBeGreaterThan(28);
    expect(shape.zero).toBeLessThan(183 - 28); // the export took more than the tag's room under the line
    const charge = [
      { at: 0.5, level: 30 },
      { at: 0.5 + 5 / 1440, level: 31 },
    ];
    const line = chargeLine(charge, 320, 28, shape.zero);
    expect(line.y(0)).toBe(shape.zero);
    expect(line.y(100)).toBe(28);
    expect(line.y(30)).toBeGreaterThan(28);
    expect(line.y(30)).toBeLessThan(shape.zero);
    // a 30 % battery on the chart's full height would have sat in the export's area
    expect(184 - 0.3 * (184 - 28)).toBeGreaterThan(shape.zero);
  });

  it('puts 0 % on the foot when nothing left the house: the zero line is the foot', () => {
    const points = flowsOf([bucket(720, { solar: 2 }), bucket(725, { solar: 2 })], DAY, 5, 'kW');
    const shape = flowShape(points, 320, 184, 28);
    expect(shape.zero).toBe(183);
    expect(
      chargeLine(
        [
          { at: 0.5, level: 0 },
          { at: 0.51, level: 0 },
        ],
        320,
        28,
        shape.zero,
      ).y(0),
    ).toBe(183);
  });

  it('knows whether the charge runs through a tag’s box, between its points too', () => {
    const line = chargeLine(
      [
        { at: 0, level: 0 },
        { at: 0.5, level: 100 },
      ],
      320,
      28,
      184,
      1,
    );
    // the diagonal from (0, 184) to (160, 28) passes x 80 at y 106, with no point of its own there
    expect(crosses(line.runs, { x: 76, y: 100, w: 8, h: 12 })).toBe(true);
    expect(crosses(line.runs, { x: 240, y: 100, w: 60, h: 24 })).toBe(false);
  });
});
