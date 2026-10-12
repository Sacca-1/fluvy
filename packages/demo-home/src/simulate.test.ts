import { describe, expect, it } from 'vitest';
import { simulate, targetsOf, type SimulatedEntity } from './simulate.js';

const at = new Date('2026-09-29T10:00:00Z');
const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): SimulatedEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: '2026-09-29T08:00:00.000Z',
  last_updated: '2026-09-29T08:00:00.000Z',
});
const house = {
  'light.living': entity('light.living', 'on', { brightness: 178 }),
  'switch.kitchen': entity('switch.kitchen', 'off'),
  'climate.bedroom': entity('climate.bedroom', 'heat', {
    temperature: 21.5,
    hvac_action: 'heating',
  }),
  'lock.door': entity('lock.door', 'locked'),
  'alarm_control_panel.home': entity('alarm_control_panel.home', 'disarmed'),
  'automation.morning': entity('automation.morning', 'on', { id: 'fluvy_0123456789ab' }),
};

describe('simulate', () => {
  it('answers a tap the way Home Assistant would, and returns only what changed', () => {
    const changed = simulate(
      house,
      { domain: 'light', service: 'turn_off', target: { entity_id: 'light.living' } },
      at,
    );
    expect(Object.keys(changed)).toEqual(['light.living']);
    expect(changed['light.living']?.state).toBe('off');
    expect(changed['light.living']?.last_changed).toBe(at.toISOString());
    expect(house['light.living'].state).toBe('on'); // the house handed in is never written
  });

  it('keeps the attributes a call sets: a target, a mode with its action', () => {
    const warmer = simulate(
      house,
      {
        domain: 'climate',
        service: 'set_temperature',
        data: { entity_id: 'climate.bedroom', temperature: 23 },
      },
      at,
    );
    expect(warmer['climate.bedroom']?.attributes['temperature']).toBe(23);
    expect(warmer['climate.bedroom']?.state).toBe('heat');
    expect(warmer['climate.bedroom']?.last_changed).toBe('2026-09-29T08:00:00.000Z'); // the state did not change
    const cooling = simulate(
      house,
      {
        domain: 'climate',
        service: 'set_hvac_mode',
        data: { hvac_mode: 'cool' },
        target: { entity_id: ['climate.bedroom'] },
      },
      at,
    );
    expect(cooling['climate.bedroom']?.state).toBe('cool');
    expect(cooling['climate.bedroom']?.attributes['hvac_action']).toBe('cooling');
  });

  it('toggles from the state it reads, and lights up with a brightness when it has none', () => {
    expect(
      simulate(
        house,
        { domain: 'switch', service: 'toggle', target: { entity_id: 'switch.kitchen' } },
        at,
      )['switch.kitchen']?.state,
    ).toBe('on');
    const dark = { 'light.hall': entity('light.hall', 'off') };
    expect(
      simulate(
        dark,
        { domain: 'light', service: 'turn_on', target: { entity_id: 'light.hall' } },
        at,
      )['light.hall']?.attributes['brightness'],
    ).toBe(178);
    expect(
      simulate(
        dark,
        {
          domain: 'light',
          service: 'turn_on',
          data: { brightness_pct: 50 },
          target: { entity_id: 'light.hall' },
        },
        at,
      )['light.hall']?.attributes['brightness'],
    ).toBe(128);
  });

  it('locks, arms, and leaves alone what it does not know', () => {
    expect(
      simulate(
        house,
        { domain: 'lock', service: 'unlock', target: { entity_id: 'lock.door' } },
        at,
      )['lock.door']?.state,
    ).toBe('unlocked');
    expect(
      simulate(
        house,
        {
          domain: 'alarm_control_panel',
          service: 'alarm_arm_away',
          target: { entity_id: 'alarm_control_panel.home' },
        },
        at,
      )['alarm_control_panel.home']?.state,
    ).toBe('armed_away');
    expect(
      simulate(
        house,
        { domain: 'lock', service: 'unlock', target: { entity_id: 'lock.missing' } },
        at,
      ),
    ).toEqual({});
    expect(
      simulate(
        house,
        { domain: 'light', service: 'wave', target: { entity_id: 'light.living' } },
        at,
      ),
    ).toEqual({});
  });

  it('switches an automation on and off, toggles it, and keeps the moment it ran', () => {
    const call = (service: string) =>
      simulate(
        house,
        { domain: 'automation', service, target: { entity_id: 'automation.morning' } },
        at,
      )['automation.morning'];
    expect(call('turn_off')?.state).toBe('off');
    expect(call('turn_on')?.state).toBe('on');
    expect(call('turn_on')?.last_changed).toBe('2026-09-29T08:00:00.000Z'); // already on
    expect(call('toggle')?.state).toBe('off');
    const off = { 'automation.morning': entity('automation.morning', 'off') };
    expect(
      simulate(
        off,
        { domain: 'automation', service: 'toggle', target: { entity_id: 'automation.morning' } },
        at,
      )['automation.morning']?.state,
    ).toBe('on');
    const ran = call('trigger');
    expect(ran?.state).toBe('on');
    expect(ran?.attributes['last_triggered']).toBe(at.toISOString());
    expect(ran?.attributes['id']).toBe('fluvy_0123456789ab');
  });

  it('reads the targets from the target, else from the data', () => {
    expect(targetsOf({ domain: 'x', service: 'y', target: { entity_id: ['a', 'b'] } })).toEqual([
      'a',
      'b',
    ]);
    expect(targetsOf({ domain: 'x', service: 'y', data: { entity_id: 'a' } })).toEqual(['a']);
    expect(targetsOf({ domain: 'x', service: 'y' })).toEqual([]);
  });
});
