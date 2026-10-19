import { describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { compileConditions, type VisibilityCondition } from './conditions.js';
import { house, NOW } from './fixture.js';

const HOUSE = house(
  {
    'person.marta': {
      state: 'Work',
      attributes: { user_id: 'u1', in_zones: ['zone.work', 'zone.city'] },
    },
    'person.leo': { state: 'not_home', attributes: { user_id: 'u2', in_zones: [] } },
    'zone.work': { state: '1', attributes: { friendly_name: 'Work' } },
    'zone.city': { state: '0', attributes: { friendly_name: 'City', passive: true } },
    'zone.home': { state: '0', attributes: { friendly_name: 'Home' } },
    'input_select.mode': { state: 'night' },
    'input_number.limit': { state: '25' },
    'sensor.temperature': { state: '21.5', attributes: { battery: 40 } },
    'alarm_control_panel.house': { state: 'armed_away' },
  },
  { user: 'u1' },
);

const holds = (
  conditions: readonly VisibilityCondition[],
  hass: HomeAssistant = HOUSE,
  now = NOW,
  matches: (query: string) => boolean = () => false,
): boolean => compileConditions(conditions).test(hass, { now, matches });

describe('conditions, in Home Assistant’s visibility shapes', () => {
  it('always hold when there are none', () => {
    expect(holds([])).toBe(true);
  });

  it('compare a state, an attribute, or a state another entity holds', () => {
    expect(
      holds([{ condition: 'state', entity: 'alarm_control_panel.house', state: 'armed_away' }]),
    ).toBe(true);
    expect(
      holds([
        {
          condition: 'state',
          entity_id: 'alarm_control_panel.house',
          state_not: ['armed_away', 'armed_night'],
        },
      ]),
    ).toBe(false);
    // the legacy shape, without `condition`
    expect(holds([{ entity: 'input_select.mode', state: ['day', 'night'] }])).toBe(true);
    expect(
      holds([
        { condition: 'state', entity: 'sensor.temperature', attribute: 'battery', state: '40' },
      ]),
    ).toBe(true);
    // a state that names an entity reads as that entity's state
    expect(
      holds([{ condition: 'state', entity: 'input_select.mode', state: 'input_select.mode' }]),
    ).toBe(true);
    // a missing entity is unknown
    expect(holds([{ condition: 'state', entity: 'light.gone', state: 'unknown' }])).toBe(true);
    // nothing to compare: never
    expect(holds([{ condition: 'state', entity: 'input_select.mode' }])).toBe(false);
  });

  it('compare numbers strictly, a threshold from another entity', () => {
    expect(
      holds([{ condition: 'numeric_state', entity: 'sensor.temperature', above: 21, below: 22 }]),
    ).toBe(true);
    expect(holds([{ condition: 'numeric_state', entity: 'sensor.temperature', above: 21.5 }])).toBe(
      false,
    );
    expect(
      holds([
        { condition: 'numeric_state', entity: 'sensor.temperature', below: 'input_number.limit' },
      ]),
    ).toBe(true);
    expect(
      holds([
        {
          condition: 'numeric_state',
          entity: 'sensor.temperature',
          attribute: 'battery',
          below: 20,
        },
      ]),
    ).toBe(false);
    expect(holds([{ condition: 'numeric_state', entity: 'input_select.mode', above: 0 }])).toBe(
      false,
    );
  });

  it('ask the screen and the user', () => {
    const wide = (query: string): boolean => query === '(min-width: 1024px)';
    expect(
      holds([{ condition: 'screen', media_query: '(min-width: 1024px)' }], HOUSE, NOW, wide),
    ).toBe(true);
    expect(
      holds([{ condition: 'screen', media_query: '(max-width: 600px)' }], HOUSE, NOW, wide),
    ).toBe(false);
    expect(
      compileConditions([{ condition: 'screen', media_query: '(min-width: 1024px)' }]).queries,
    ).toEqual(['(min-width: 1024px)']);
    expect(holds([{ condition: 'user', users: ['u1', 'u3'] }])).toBe(true);
    expect(holds([{ condition: 'user', users: ['u2'] }])).toBe(false);
  });

  it('read a time window in the house’s zone, across midnight, on some weekdays', () => {
    // NOW is Saturday 2026-10-17 12:00 UTC
    const at = (hour: number, minute = 0): number => Date.UTC(2026, 9, 17, hour, minute);
    const night = [{ condition: 'time', after: '22:00', before: '06:00' }];
    expect(holds(night, HOUSE, at(23))).toBe(true);
    expect(holds(night, HOUSE, at(5, 59))).toBe(true);
    expect(holds(night, HOUSE, at(12))).toBe(false);
    expect(holds([{ condition: 'time', after: '09:00', before: '17:00' }])).toBe(true);
    expect(holds([{ condition: 'time', weekdays: ['sat', 'sun'] }])).toBe(true);
    expect(holds([{ condition: 'time', weekdays: ['mon'], after: '09:00' }])).toBe(false);
    expect(compileConditions(night).next(HOUSE, at(12))).toBe(at(22));
    expect(compileConditions(night).next(HOUSE, at(23))).toBe(Date.UTC(2026, 9, 18, 6, 0, 1));
    expect(compileConditions([{ condition: 'time', weekdays: ['sat'] }]).next(HOUSE, at(12))).toBe(
      Date.UTC(2026, 9, 18),
    );
    // another zone: Madrid's 22:00 is 20:00 UTC in October
    const madrid = { ...HOUSE, config: { ...HOUSE.config, time_zone: 'Europe/Madrid' } };
    expect(holds(night, madrid, at(21))).toBe(true);
    expect(compileConditions(night).next(madrid, at(12))).toBe(at(20));
  });

  it('read where the person is: their zone’s name, away, or zones they are in', () => {
    expect(holds([{ condition: 'location', locations: ['Work'] }])).toBe(true);
    expect(holds([{ condition: 'location', locations: ['home'] }])).toBe(false);
    expect(holds([{ condition: 'location', target: { entity_id: 'zone.city' } }])).toBe(true);
    expect(
      holds([
        { condition: 'location', target: { entity_id: ['zone.city'] }, match_mode: 'active_zone' },
      ]),
    ).toBe(false);
    expect(
      holds([
        { condition: 'location', target: { entity_id: 'zone.work' }, match_mode: 'active_zone' },
      ]),
    ).toBe(true);
    const leo = { ...HOUSE, user: { id: 'u2', name: 'Leo', is_admin: false } };
    expect(holds([{ condition: 'location', away: true }], leo)).toBe(true);
    expect(holds([{ condition: 'location', target: { entity_id: 'zone.home' } }], leo)).toBe(false);
    const nobody = { ...HOUSE, user: { id: 'wall', name: 'Wall', is_admin: false } };
    expect(holds([{ condition: 'location', locations: ['Work'] }], nobody)).toBe(false);
  });

  it('combine: and, or, and not (not all of them, as Home Assistant’s cards read it)', () => {
    const home = { condition: 'state', entity: 'alarm_control_panel.house', state: 'disarmed' };
    const night = { condition: 'state', entity: 'input_select.mode', state: 'night' };
    expect(holds([{ condition: 'and', conditions: [home, night] }])).toBe(false);
    expect(holds([{ condition: 'or', conditions: [home, night] }])).toBe(true);
    expect(holds([{ condition: 'not', conditions: [home, night] }])).toBe(true);
    expect(holds([{ condition: 'not', conditions: [night] }])).toBe(false);
    expect(holds([{ condition: 'or', conditions: night }])).toBe(true);
    expect(holds([home, night])).toBe(false);
  });

  it('never hold for a shape only Home Assistant’s server can check', () => {
    expect(holds([{ condition: 'template', value_template: '{{ true }}' }])).toBe(false);
    expect(holds([{ condition: 'sun', after: 'sunset' }])).toBe(false);
    expect(holds(['night' as unknown as VisibilityCondition])).toBe(false);
  });
});
