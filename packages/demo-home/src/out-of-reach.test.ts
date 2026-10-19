import { describe, expect, it } from 'vitest';
import { outOfReach, outOfReachStates } from './out-of-reach.js';
import type { SimulatedEntity } from './simulate.js';

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): SimulatedEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: '2026-10-17T08:00:00.000Z',
  last_updated: '2026-10-17T08:00:00.000Z',
});
const thermostat = entity('climate.living', 'heat', {
  friendly_name: 'Living room',
  supported_features: 401,
  hvac_modes: ['off', 'heat'],
  min_temp: 7,
  max_temp: 30,
  preset_modes: ['eco', 'comfort'],
  current_temperature: 20.5,
  temperature: 21,
  preset_mode: 'comfort',
});
const house = { 'climate.living': thermostat, 'switch.kettle': entity('switch.kettle', 'off') };

describe('an entity out of reach', () => {
  it('keeps its description and its capabilities while unavailable, and loses its state’s attributes', () => {
    expect(outOfReach(thermostat, 'unavailable')).toEqual({
      ...thermostat,
      state: 'unavailable',
      attributes: {
        friendly_name: 'Living room',
        supported_features: 401,
        hvac_modes: ['off', 'heat'],
        min_temp: 7,
        max_temp: 30,
        preset_modes: ['eco', 'comfort'],
      },
    });
  });

  it('writes its state’s attributes as null while unknown', () => {
    const unknown = outOfReach(thermostat, 'unknown');
    expect(unknown?.state).toBe('unknown');
    expect(unknown?.attributes).toMatchObject({
      hvac_modes: ['off', 'heat'],
      current_temperature: null,
      temperature: null,
      preset_mode: null,
    });
  });

  it('is no entity at all while missing, and the house handed in is never written', () => {
    const states = outOfReachStates(house, ['climate.living', 'light.nowhere'], 'missing');
    expect(Object.keys(states)).toEqual(['switch.kettle']);
    expect(states['switch.kettle']).toBe(house['switch.kettle']);
    expect(house['climate.living']).toBe(thermostat);
    expect(thermostat.state).toBe('heat');
  });
});
