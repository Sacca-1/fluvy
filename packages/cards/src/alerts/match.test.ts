import { describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { house, iso, NOW, MINUTE, type Seed } from './fixture.js';
import { compileMatcher } from './match.js';
import { definitionOf, type AlertConfig } from './model.js';

/** The ids an alert matches now (its timing aside), in id order. */
function matched(alert: AlertConfig, hass: HomeAssistant): string[] {
  const matcher = compileMatcher(definitionOf(alert, 0, 'fluvy-alerts-card'));
  return Object.keys(hass.states)
    .filter((id) => {
      const state = hass.states[id];
      return (
        state !== undefined &&
        matcher.clauses.some((clause) => clause.test(id, state, hass)) &&
        !matcher.excluded(id, state, hass)
      );
    })
    .sort();
}

const on: Seed = { state: 'on' };

const HOUSE = house(
  {
    'sensor.kitchen_battery': {
      state: '12',
      attributes: { device_class: 'battery' },
      device: 'thermo',
      platform: 'zha',
      category: 'diagnostic',
    },
    'sensor.hall_battery': {
      state: '80',
      attributes: { device_class: 'battery' },
      device: 'motion',
    },
    'sensor.porch_battery': {
      state: 'low',
      attributes: { device_class: 'battery' },
      area: 'porch',
    },
    'sensor.phone_battery': {
      state: '9',
      attributes: { device_class: 'battery' },
      device: 'phone',
      platform: 'mobile_app',
    },
    'sensor.temperature': {
      state: '21.5',
      attributes: { device_class: 'temperature' },
      device: 'thermo',
    },
    'binary_sensor.front_door': { state: 'on', attributes: { device_class: 'door' }, area: 'hall' },
    'binary_sensor.back_door': {
      state: 'off',
      attributes: { device_class: 'door' },
      area: 'kitchen',
    },
    'binary_sensor.motion': { ...on, attributes: { device_class: 'motion' }, device: 'motion' },
    'light.kitchen': { ...on, device: 'kitchen_lamp', labels: ['night'] },
    'light.hall': { state: 'unavailable', area: 'hall' },
    'light.porch': { state: 'off', area: 'porch' },
    'light.hidden': { ...on, hidden: true },
    'switch.identify': { ...on, category: 'config' },
    'climate.hall': {
      state: 'heat',
      attributes: { hvac_action: 'heating', current_temperature: 18 },
    },
    'climate.attic': { state: 'off', attributes: { hvac_action: null } },
    'update.core': { state: 'on', attributes: { in_progress: false } },
  },
  {
    devices: {
      thermo: { name: 'Thermostat', area_id: 'kitchen' },
      kitchen_lamp: { name: 'Lamp', name_by_user: 'Island light', area_id: 'kitchen', labels: [] },
      motion: { name: 'Hall motion', area_id: 'hall', labels: ['security'] },
    },
    areas: {
      kitchen: { name: 'Kitchen', floor_id: 'ground' },
      hall: { name: 'Hall', floor_id: 'ground' },
      porch: { name: 'Porch', labels: ['outside'] },
    },
    floors: { ground: { name: 'Ground floor', level: 0 } },
  },
);

describe('the matcher', () => {
  it('matches by exact ids, globs and regular expressions', () => {
    expect(matched({ entity: 'light.kitchen' }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ entities: ['light.porch', { entity: 'light.kitchen' }] }, HOUSE)).toEqual([
      'light.kitchen',
      'light.porch',
    ]);
    expect(matched({ entity_id: 'sensor.*_battery' }, HOUSE)).toEqual([
      'sensor.hall_battery',
      'sensor.kitchen_battery',
      'sensor.phone_battery',
      'sensor.porch_battery',
    ]);
    expect(matched({ entity_id: ['light.?all', '/^climate\\.(hall|loft)$/'] }, HOUSE)).toEqual([
      'climate.hall',
    ]);
  });

  it('matches by domain and device class lists', () => {
    expect(matched({ domain: ['light', 'switch'] }, HOUSE)).toEqual([
      'light.kitchen',
      'light.porch',
    ]);
    expect(matched({ device_class: ['door', 'motion'], state: 'on' }, HOUSE)).toEqual([
      'binary_sensor.front_door',
      'binary_sensor.motion',
    ]);
  });

  it('compares the state exactly, and strictly above and below', () => {
    expect(matched({ domain: 'light', state: 'off' }, HOUSE)).toEqual(['light.porch']);
    expect(matched({ domain: 'light', not_state: 'off' }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ device_class: 'battery', below: 12 }, HOUSE)).toEqual([
      'sensor.phone_battery',
    ]);
    expect(matched({ device_class: 'battery', below: 13, above: 9 }, HOUSE)).toEqual([
      'sensor.kitchen_battery',
    ]);
    // a state that is not a number never compares
    expect(matched({ entity: 'sensor.porch_battery', below: 100 }, HOUSE)).toEqual([]);
  });

  // a YAML-mode dashboard reads an unquoted on or off as true or false (Home Assistant's loader speaks YAML 1.1)
  it('reads a state given as true or false as on or off, and an attribute’s boolean as itself', () => {
    const yes = true as unknown as string;
    const no = false as unknown as string;
    expect(matched({ domain: 'light', state: no }, HOUSE)).toEqual(['light.porch']);
    expect(matched({ domain: 'light', not_state: no }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ device_class: 'door', state: [yes] }, HOUSE)).toEqual([
      'binary_sensor.front_door',
    ]);
    expect(matched({ domain: 'update', attribute: 'in_progress', state: no }, HOUSE)).toEqual([
      'update.core',
    ]);
  });

  it('reads an attribute: compared, or alone there and truthy', () => {
    expect(
      matched({ domain: 'climate', attribute: 'hvac_action', state: 'heating' }, HOUSE),
    ).toEqual(['climate.hall']);
    expect(
      matched({ domain: 'climate', attribute: 'current_temperature', below: 19 }, HOUSE),
    ).toEqual(['climate.hall']);
    expect(matched({ domain: 'climate', attribute: 'hvac_action' }, HOUSE)).toEqual([
      'climate.hall',
    ]);
    expect(
      matched({ domain: 'climate', attribute: 'hvac_action', not_state: 'heating' }, HOUSE),
    ).toEqual(['climate.attic']);
  });

  it('never matches unavailable or unknown unless `state` names it or the clause includes them', () => {
    expect(matched({ domain: 'light', not_state: 'on' }, HOUSE)).toEqual(['light.porch']);
    expect(matched({ domain: 'light', not_state: 'on', include_unavailable: true }, HOUSE)).toEqual(
      ['light.hall', 'light.porch'],
    );
    expect(matched({ state: 'unavailable' }, HOUSE)).toEqual(['light.hall']);
  });

  it('finds the area through the device, by id or name; the floor through the area', () => {
    expect(matched({ domain: 'sensor', area: 'kitchen' }, HOUSE)).toEqual([
      'sensor.kitchen_battery',
      'sensor.temperature',
    ]);
    expect(matched({ domain: 'binary_sensor', area: 'Hall' }, HOUSE)).toEqual([
      'binary_sensor.front_door',
      'binary_sensor.motion',
    ]);
    expect(matched({ domain: 'light', floor: 'ground floor' }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ domain: 'light', floor: 'ground', include_unavailable: true }, HOUSE)).toEqual(
      ['light.hall', 'light.kitchen'],
    );
  });

  it('finds a label on the entity, its device or its area', () => {
    expect(matched({ label: 'night' }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ label: 'security' }, HOUSE)).toEqual([
      'binary_sensor.motion',
      'sensor.hall_battery',
    ]);
    expect(matched({ label: ['outside'], domain: 'light' }, HOUSE)).toEqual(['light.porch']);
  });

  it('finds the integration and the device, by id, name or a name’s pattern', () => {
    expect(matched({ integration: 'mobile_app' }, HOUSE)).toEqual(['sensor.phone_battery']);
    expect(matched({ device: 'thermo' }, HOUSE)).toEqual([
      'sensor.kitchen_battery',
      'sensor.temperature',
    ]);
    expect(matched({ device: 'island LIGHT' }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ device: 'hall *' }, HOUSE)).toEqual([
      'binary_sensor.motion',
      'sensor.hall_battery',
    ]);
  });

  it('excludes by ids, patterns and clauses', () => {
    const batteries: AlertConfig = { device_class: 'battery' };
    expect(matched({ ...batteries, exclude: 'sensor.hall_battery' }, HOUSE)).toEqual([
      'sensor.kitchen_battery',
      'sensor.phone_battery',
      'sensor.porch_battery',
    ]);
    expect(matched({ ...batteries, exclude: ['sensor.p*'] }, HOUSE)).toEqual([
      'sensor.hall_battery',
      'sensor.kitchen_battery',
    ]);
    expect(
      matched({ ...batteries, exclude: [{ integration: 'mobile_app' }, { area: 'porch' }] }, HOUSE),
    ).toEqual(['sensor.hall_battery', 'sensor.kitchen_battery']);
    // a clause's own exclusion, inside `match`
    expect(matched({ match: [{ domain: 'light', exclude: 'light.porch' }] }, HOUSE)).toEqual([
      'light.kitchen',
    ]);
  });

  it('skips hidden entities unless asked, config entities unless named, diagnostic ones when asked', () => {
    expect(matched({ domain: 'light', state: 'on' }, HOUSE)).toEqual(['light.kitchen']);
    expect(matched({ domain: 'light', state: 'on', hidden: true }, HOUSE)).toEqual([
      'light.hidden',
      'light.kitchen',
    ]);
    expect(matched({ domain: 'switch' }, HOUSE)).toEqual([]);
    expect(matched({ entity: 'switch.identify' }, HOUSE)).toEqual(['switch.identify']);
    // named by its id, a hidden or diagnostic entity is wanted whatever the modifiers say
    expect(
      matched({ entity: ['light.hidden', 'sensor.kitchen_battery'], diagnostic: false }, HOUSE),
    ).toEqual(['light.hidden', 'sensor.kitchen_battery']);
    expect(matched({ device: 'thermo', diagnostic: false }, HOUSE)).toEqual(['sensor.temperature']);
  });

  it('says which domains it can match: the index it is tested against', () => {
    const domains = (alert: AlertConfig): string[] | undefined => {
      const set = compileMatcher(definitionOf(alert, 0, 'card')).domains;
      return set && [...set].sort();
    };
    expect(domains({ preset: 'low_battery' })).toEqual(['binary_sensor', 'sensor']);
    expect(domains({ entity_id: ['sensor.*_battery', 'light.hall'] })).toEqual(['light', 'sensor']);
    expect(domains({ domain: ['light', 'switch'], entity: 'light.kitchen' })).toEqual(['light']);
    expect(domains({ preset: 'unavailable' })).toBeUndefined();
    expect(domains({ entity_id: '/battery/' })).toBeUndefined();
    expect(domains({ preset: 'repairs' })).toEqual([]);
  });

  it('seeds how long a clause has held: the state’s change, or the entity’s update for an attribute', () => {
    const matcher = (alert: AlertConfig) =>
      compileMatcher(definitionOf(alert, 0, 'card')).clauses[0];
    const state = {
      ...HOUSE.states['climate.hall']!,
      last_changed: iso(NOW - 60 * MINUTE),
      last_updated: iso(NOW - 5 * MINUTE),
    };
    expect(matcher({ domain: 'climate', state: 'heat' })?.seed(state)).toBe(NOW - 60 * MINUTE);
    expect(matcher({ domain: 'climate', attribute: 'hvac_action' })?.seed(state)).toBe(
      NOW - 5 * MINUTE,
    );
  });
});
