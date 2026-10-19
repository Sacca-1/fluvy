import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import '../energy/english.js';
import { staleShorter } from '../energy/freshness.js';
import { downLine, meterOutage } from './outage.js';

/** A house in UTC on a 24-hour clock: a grid meter gone since 21:35, a solar meter reading. */
const hass = {
  language: 'en',
  locale: { language: 'en', time_format: '24', time_zone: 'server' },
  config: { time_zone: 'UTC' },
  states: {
    'sensor.grid_in': {
      entity_id: 'sensor.grid_in',
      state: 'unavailable',
      attributes: {},
      last_changed: '2026-09-17T21:35:00Z',
      last_updated: '2026-09-17T21:35:00Z',
    },
    'sensor.solar': {
      entity_id: 'sensor.solar',
      state: '11.2',
      attributes: { unit_of_measurement: 'kWh' },
      last_changed: '2026-09-17T21:40:00Z',
      last_updated: '2026-09-17T21:40:00Z',
    },
  },
} as unknown as HomeAssistant;

describe('a source that cannot be read (1.9: the head lets its segments go, never cuts its time)', () => {
  it('says which and since when, in segments', () => {
    expect(downLine(hass, 'Grid', 'sensor.grid_in')).toBe('Grid · unavailable · since 21:35');
    // nothing to say since when: the two first segments
    expect(downLine(hass, 'Solar')).toBe('Solar · unavailable');
  });

  it('names the first meter of a period card that went down', () => {
    expect(
      meterOutage(hass, [
        { id: 'sensor.solar', name: 'Solar' },
        { id: 'sensor.grid_in', name: 'Grid' },
        { id: 'tibber:energy_grid', name: 'Tibber' },
      ]),
    ).toBe('Grid · unavailable · since 21:35');
    expect(meterOutage(hass, [{ id: 'sensor.solar', name: 'Solar' }])).toBeUndefined();
  });
});

describe('the stale words’ shorter form', () => {
  const at = Date.parse('2026-09-17T21:00:00Z');
  it('is the age alone once the figures are stale, none while they are live', () => {
    expect(staleShorter(hass, at, at + 32 * 86_400_000)).toEqual(['32 days ago']);
    expect(staleShorter(hass, at, at + 5 * 60_000)).toEqual([]);
  });
});
