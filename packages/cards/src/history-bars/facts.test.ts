// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FACTS,
  FACT_FIELDS,
  FACT_KEYS,
  FACT_KINDS,
  defaultHead,
  factFigure,
  factSchema,
  factsOf,
  readoutSchema,
  summarise,
  type FactContext,
} from './facts.js';

const names = (schema: ReadonlyArray<{ name: string; schema?: readonly unknown[] }>): string[] =>
  schema.flatMap((item) =>
    item.schema ? names(item.schema as ReadonlyArray<{ name: string }>) : [item.name],
  );

describe('a list of facts', () => {
  it('reads bare kinds and objects with a kind, and drops the rest', () => {
    expect(factsOf(['total', { kind: 'co2', factor: 0.3 }, 'nope', { name: 'x' }, 4])).toEqual([
      { kind: 'total' },
      { kind: 'co2', factor: 0.3 },
    ]);
    expect(factsOf(undefined)).toEqual([]);
    expect(factsOf('total')).toEqual([]);
  });

  it('defaults to honest numbers: a meter’s total and average, a measurement’s average and highest', () => {
    expect(defaultHead('change')).toEqual(['total', 'average']);
    expect(defaultHead('mean')).toEqual(['average', 'highest']);
    expect(defaultHead('max')).toEqual(['average', 'highest']);
    expect(DEFAULT_FACTS).toEqual(['highest', 'lowest', 'average']);
  });
});

describe('the summary of the bars', () => {
  it('totals, averages and ranges the buckets that have a value', () => {
    expect(summarise([35.4, 34.4, 28.6, 26.5, 30.2, 9.5, 26.9], 12.3)).toEqual({
      count: 7,
      total: 191.5,
      average: 191.5 / 7,
      highest: 35.4,
      lowest: 9.5,
      current: 12.3,
    });
  });

  it('averages a measurement over the days that have one, and knows nothing of an empty set', () => {
    expect(summarise([14, null, 16], null).average).toBe(15);
    expect(summarise([null, null], null)).toEqual({
      count: 2,
      total: null,
      average: null,
      highest: null,
      lowest: null,
      current: null,
    });
  });
});

describe('a fact’s figure', () => {
  const summary = summarise([35.4, 34.4, 28.6, 26.5, 30.2, 9.5, 26.9], 12.3);
  const context: FactContext = {
    unit: 'kWh',
    decimals: 1,
    kwh: 191.5,
    price: 0.19,
    co2Factor: 0.4,
    currency: '€',
    shareOf: 383,
    trees: 'trees',
  };

  it('is the bars’ own number in the card’s unit and precision', () => {
    expect(factFigure({ kind: 'total' }, summary, context)).toEqual({
      value: 191.5,
      unit: 'kWh',
      decimals: 1,
    });
    expect(factFigure({ kind: 'highest' }, summary, context).value).toBe(35.4);
    expect(factFigure({ kind: 'lowest' }, summary, context).value).toBe(9.5);
    expect(factFigure({ kind: 'today' }, summary, context).value).toBe(12.3);
    expect(factFigure({ kind: 'average' }, summary, context).value).toBeCloseTo(27.36, 2);
  });

  it('works the equivalents out from the kWh with the rough factors, each in its own unit and precision', () => {
    const co2 = factFigure({ kind: 'co2' }, summary, context);
    expect(co2.value).toBeCloseTo(76.6, 6);
    expect(co2.unit).toBe('kg');
    expect(co2.decimals).toBe(1);
    const trees = factFigure({ kind: 'trees' }, summary, context);
    expect(trees.value).toBeCloseTo(76.6 / 22, 6);
    expect(trees.unit).toBe('trees');
    expect(factFigure({ kind: 'km' }, summary, context)).toEqual({
      value: 957.5,
      unit: 'km',
      decimals: 0,
    });
    const money = factFigure({ kind: 'money' }, summary, context);
    expect(money.value).toBeCloseTo(36.385, 6);
    expect(money.unit).toBe('€');
    expect(money.decimals).toBe(2);
    expect(factFigure({ kind: 'share' }, summary, context)).toEqual({
      value: 50,
      unit: '%',
      decimals: 0,
    });
  });

  it('takes the item’s own factor, unit and decimals over the kind’s', () => {
    expect(factFigure({ kind: 'co2', factor: 0.25 }, summary, context).value).toBeCloseTo(47.875);
    expect(factFigure({ kind: 'trees', factor: 10 }, summary, context).value).toBeCloseTo(7.66);
    expect(factFigure({ kind: 'money', factor: 0.3 }, summary, context).value).toBeCloseTo(57.45);
    expect(factFigure({ kind: 'km', unit: 'mi', decimals: 1 }, summary, context)).toEqual({
      value: 957.5,
      unit: 'mi',
      decimals: 1,
    });
  });

  it('reads "—" where the maths has nothing to go on: no kWh, no price, no other sensor, no trees per kg', () => {
    const noEnergy = { ...context, kwh: null, price: undefined, shareOf: null };
    expect(factFigure({ kind: 'co2' }, summary, noEnergy).value).toBeNull();
    expect(factFigure({ kind: 'trees' }, summary, noEnergy).value).toBeNull();
    expect(factFigure({ kind: 'km' }, summary, noEnergy).value).toBeNull();
    expect(factFigure({ kind: 'money' }, summary, noEnergy).value).toBeNull();
    expect(factFigure({ kind: 'share' }, summary, noEnergy).value).toBeNull();
    expect(factFigure({ kind: 'share' }, summary, { ...context, shareOf: 0 }).value).toBeNull();
    expect(factFigure({ kind: 'trees', factor: 0 }, summary, context).value).toBeNull();
    expect(factFigure({ kind: 'template', unit: 'h' }, summary, context)).toEqual({
      value: null,
      unit: 'h',
      decimals: 0,
    });
  });
});

describe('a fact in the editor', () => {
  it('has the kind first, then every field it may carry', () => {
    expect(names(FACT_FIELDS)).toEqual([...FACT_KEYS]);
    expect(FACT_KINDS.length).toBe(11);
  });

  it('shows the kind’s own field — a factor, the other sensor, the template — and the same form for the same answer', () => {
    expect(names(factSchema({ kind: 'total' }))).toEqual([
      'kind',
      'name',
      'icon',
      'color',
      'unit',
      'decimals',
      'tap_action',
    ]);
    expect(names(factSchema({ kind: 'co2' }))).toContain('factor');
    expect(names(factSchema({ kind: 'money' }))).toContain('factor');
    expect(names(factSchema({ kind: 'share' }))).toContain('of');
    expect(names(factSchema({ kind: 'share' }))).not.toContain('factor');
    expect(names(factSchema({ kind: 'template' }))).toContain('template');
    expect(names(factSchema({ kind: 'total', factor: 2 }))).toContain('factor');
    expect(factSchema({ kind: 'co2' })).toBe(factSchema({ kind: 'trees', name: 'x' }));
    expect(factSchema({ kind: 'total' })).toBe(factSchema({ kind: 'lowest' }));
  });

  it('gives a head readout no circle: no icon, no colour', () => {
    expect(names(readoutSchema({ kind: 'total' }))).toEqual([
      'kind',
      'name',
      'unit',
      'decimals',
      'tap_action',
    ]);
    expect(names(readoutSchema({ kind: 'share' }))).toContain('of');
    expect(readoutSchema({ kind: 'total' })).not.toBe(factSchema({ kind: 'total' }));
  });
});
