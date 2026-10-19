import type { FluvyCardConfig } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  COMMON_ALIASES,
  ITEM_ALIASES,
  columnsOf,
  configKeys,
  inverted,
  normaliseConfig,
  type AliasSpec,
} from './config.js';

const base = { type: 'custom:fluvy-x-card' };

describe('normaliseConfig', () => {
  it('reads the older names as the shared ones and drops them', () => {
    const config = normaliseConfig({ ...base, sub: 'Upstairs', layout: 'rows' }, COMMON_ALIASES);
    expect(config).toEqual({ ...base, subtitle: 'Upstairs', variant: 'rows' });
  });

  it('never overrides a value the newer name already carries, and never writes into the object given', () => {
    const given = { ...base, sub: 'Old', subtitle: 'New' };
    const config = normaliseConfig(given, COMMON_ALIASES);
    expect(config).toEqual({ ...base, subtitle: 'New' });
    expect(given).toEqual({ ...base, sub: 'Old', subtitle: 'New' });
  });

  it('gives back the same object when nothing is read differently', () => {
    const given = { ...base, subtitle: 'As written' };
    expect(normaliseConfig(given, COMMON_ALIASES)).toBe(given);
  });

  it('inverts a hidden into a shown, and maps only what passes the guard', () => {
    const todo: AliasSpec = {
      keys: [
        inverted('hide_completed', 'show_completed'),
        { from: 'forecast', to: 'show_forecast', when: (v) => v === 'none', map: () => false },
      ],
    };
    expect(normaliseConfig({ ...base, hide_completed: true }, todo)).toEqual({
      ...base,
      show_completed: false,
    });
    expect(normaliseConfig({ ...base, forecast: 'none' }, todo)).toEqual({
      ...base,
      show_forecast: false,
    });
    // a forecast that is not "none" is the card's own field: left as it is
    expect(normaliseConfig({ ...base, forecast: 'hourly' }, todo)).toEqual({
      ...base,
      forecast: 'hourly',
    });
  });

  it('reads on in order: the clock’s variant becomes its face before its layout becomes its variant', () => {
    const clock: AliasSpec = {
      keys: [
        { from: 'variant', to: 'face' },
        { from: 'layout', to: 'variant' },
      ],
    };
    expect(normaliseConfig({ ...base, variant: 'digital', layout: 'side' }, clock)).toEqual({
      ...base,
      face: 'digital',
      variant: 'side',
    });
    // the specs apply in the order given, so the common moves do not eat the clock's own first
    expect(
      normaliseConfig({ ...base, variant: 'analog', layout: 'hero' }, clock, COMMON_ALIASES),
    ).toEqual({
      ...base,
      face: 'analog',
      variant: 'hero',
    });
  });

  it('reads the items of a list, leaving bare ids alone', () => {
    const spec: AliasSpec = { items: { rows: ITEM_ALIASES } };
    const config = normaliseConfig(
      { ...base, rows: ['sensor.a', { entity: 'sensor.b', label: 'B', sub: 'area' }] },
      spec,
    );
    expect(config.rows).toEqual(['sensor.a', { entity: 'sensor.b', name: 'B', secondary: 'area' }]);
    const untouched = { ...base, rows: ['sensor.a', { entity: 'sensor.b', name: 'B' }] };
    expect(normaliseConfig(untouched, spec)).toBe(untouched);
  });

  it('drops what the card reads into something else', () => {
    expect(
      normaliseConfig({ ...base, tones: { a: 'solar' }, kept: 1 }, { drop: ['tones'] }),
    ).toEqual({
      ...base,
      kept: 1,
    });
  });

  // a YAML-mode dashboard reads an unquoted on or off as true or false (Home Assistant's loader speaks YAML 1.1)
  it('reads true and false as on and off where a key’s values are words', () => {
    expect(
      normaliseConfig({ ...base, tint: true, motion: false, snooze: false }, COMMON_ALIASES),
    ).toEqual({ ...base, tint: 'on', motion: 'off', snooze: 'off' });
    expect(normaliseConfig({ ...base, tint: false }, COMMON_ALIASES)).toEqual({
      ...base,
      tint: 'off',
    });
    expect(normaliseConfig({ ...base, modes: [false, 'heat'] }, COMMON_ALIASES)).toEqual({
      ...base,
      modes: ['off', 'heat'],
    });
    const targets = [
      'light.a',
      { entity: 'light.b', verb: true },
      { entity: 'cover.c', verb: 'open' },
    ];
    expect(normaliseConfig({ ...base, targets }, COMMON_ALIASES)).toEqual({
      ...base,
      targets: ['light.a', { entity: 'light.b', verb: 'on' }, targets[2]],
    });
    // the words as written, every other boolean and an alert's own snooze are left as they are
    const given = {
      ...base,
      tint: 'always',
      show_icon: true,
      modes: ['off', 'heat'],
      targets: ['light.a', { entity: 'light.b', verb: 'off' }],
      alerts: [{ preset: 'open', snooze: false }],
    };
    expect(normaliseConfig(given, COMMON_ALIASES)).toBe(given);
  });
});

describe('columnsOf', () => {
  it('reads a count, a numeral or auto, and falls back on anything else', () => {
    expect(columnsOf(3, 2)).toBe(3);
    expect(columnsOf('4', 2)).toBe(4);
    expect(columnsOf('auto', 2)).toBe('auto');
    expect(columnsOf(7, 2)).toBe(2);
    expect(columnsOf(undefined, 'auto')).toBe('auto');
  });
});

describe('configKeys', () => {
  interface ProbeConfig extends FluvyCardConfig {
    variant?: 'a' | 'b';
    columns?: number;
  }
  it('is the list given, typed against the config', () => {
    const keys = configKeys<ProbeConfig>()(['variant', 'columns']);
    expect(keys).toEqual(['variant', 'columns']);
    // @ts-expect-error — a key the config does not declare
    configKeys<ProbeConfig>()(['variant', 'colour']);
    // @ts-expect-error — a declared key the list forgets fails, named in the type asked for
    configKeys<ProbeConfig>()(['variant']);
  });
});
