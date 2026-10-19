import { describe, expect, it } from 'vitest';
import type { Schedule } from './schedule.js';
import { isSchedule, targetChoices, touches } from './scope.js';

const LAMP: Schedule = {
  id: 'fluvy_a1b2c3d4e5f6',
  alias: 'Good morning',
  targets: ['light.kitchen', 'light.hall'],
  days: { kind: 'every' },
  start: { kind: 'time', at: '06:45' },
  then: { verb: 'on' },
};

describe('targetChoices', () => {
  it('reads ids and objects in their order, each once, and drops what no schedule can drive', () => {
    expect(
      targetChoices([
        'light.kitchen',
        { entity: 'cover.living', name: ' Blinds ' },
        'light.kitchen',
        'sensor.power',
        'not an id',
        { name: 'no entity' },
        42,
        'scene.movie',
      ]),
    ).toEqual([
      { id: 'light.kitchen' },
      { id: 'cover.living', name: 'Blinds' },
      { id: 'scene.movie' },
    ]);
    expect(targetChoices(undefined)).toEqual([]);
    expect(targetChoices('light.kitchen')).toEqual([]);
  });

  it('keeps a verb the domain has, a light’s level (1–100, whole) and a thermostat’s temperature', () => {
    expect(
      targetChoices([
        { entity: 'light.kitchen', icon: 'mdi:lamp', verb: 'off', level: 140.4 },
        { entity: 'light.hall', verb: 'open', level: 0.2, temperature: 21 },
        { entity: 'climate.living', verb: 'on', temperature: 20.5, level: 40 },
        { entity: 'switch.fountain', temperature: 'warm' },
        { entity: 'cover.living', verb: 'close' },
      ]),
    ).toEqual([
      { id: 'light.kitchen', icon: 'mdi:lamp', verb: 'off', level: 100 },
      { id: 'light.hall', level: 1 },
      { id: 'climate.living', verb: 'on', temperature: 20.5 },
      { id: 'switch.fountain' },
      { id: 'cover.living', verb: 'close' },
    ]);
  });
});

describe('touches', () => {
  it('is a schedule that drives a target, or an automation Home Assistant relates to one', () => {
    const none = new Set<string>();
    expect(touches(LAMP, 'automation.good_morning', ['light.hall'], none)).toBe(true);
    expect(touches(LAMP, 'automation.good_morning', ['switch.fountain'], none)).toBe(false);
    expect(
      touches(undefined, 'automation.motion', ['light.hall'], new Set(['automation.motion'])),
    ).toBe(true);
    expect(touches(undefined, 'automation.motion', ['light.hall'], none)).toBe(false);
  });
});

describe('isSchedule', () => {
  it('is a config read as one, or a Fluvy id where the config is not read', () => {
    // an administrator's, read: by its config alone (an id edited past the shape is plain)
    expect(isSchedule(LAMP, LAMP.id, true)).toBe(true);
    expect(isSchedule(undefined, 'fluvy_0dd0dd0dd0dd', true)).toBe(false);
    // a guest's, or an administrator's still on its way: by the id
    expect(isSchedule(undefined, 'fluvy_0dd0dd0dd0dd', false)).toBe(true);
    expect(isSchedule(undefined, '1690000000001', false)).toBe(false);
    expect(isSchedule(undefined, undefined, false)).toBe(false);
  });
});
