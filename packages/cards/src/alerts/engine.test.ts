import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { AlertEngine, NO_MEMORY, type MemoryView } from './engine.js';
import { change, house, MINUTE, NOW, type Seed } from './fixture.js';
import { definitionOf, type AlertConfig, type SortRows } from './model.js';

const define = (...alerts: AlertConfig[]) =>
  alerts.map((alert, i) => definitionOf(alert, i, 'card'));
const ids = (engine: AlertEngine, hass: HomeAssistant, memory?: MemoryView): string[][] =>
  engine.evaluate(hass, memory).alerts.map((alert) => alert.rows.map((row) => row.id));

const door = (state: string, changed = NOW): Seed => ({
  state,
  changed,
  attributes: { device_class: 'door' },
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the engine, incrementally', () => {
  /** A synthetic house: 5,000 entities over five domains, a hundred of the sensors low. */
  function big(): HomeAssistant {
    const seeds: Record<string, Seed> = {};
    for (let i = 0; i < 1000; i++) {
      seeds[`sensor.battery_${i}`] = {
        state: String(i < 100 ? 10 : 90),
        attributes: { device_class: 'battery' },
        device: `device_${i}`,
      };
      seeds[`light.light_${i}`] = { state: i % 2 ? 'on' : 'off' };
      seeds[`switch.switch_${i}`] = { state: 'off' };
      seeds[`binary_sensor.door_${i}`] = door('off');
      seeds[`sensor.temperature_${i}`] = {
        state: '21',
        attributes: { device_class: 'temperature' },
      };
    }
    return house(seeds);
  }

  it('answers the same object for the same states, and for a change it does not watch', () => {
    const hass = big();
    const engine = new AlertEngine(define({ preset: 'low_battery' }, { preset: 'open' }), {
      now: () => NOW,
    });
    const first = engine.evaluate(hass);
    expect(engine.evaluate(hass)).toBe(first);
    expect(engine.evaluate(change(hass, 'switch.switch_3', { state: 'on' }))).toBe(first);
    // a change among its matches is a new answer
    const next = engine.evaluate(
      change(hass, 'sensor.battery_3', { state: '9', attributes: { device_class: 'battery' } }),
    );
    expect(next).not.toBe(first);
    expect(next.alerts[1]).toBe(first.alerts[1]);
  });

  it('tests one changed entity once per clause of the alerts that can match it, and nothing else', () => {
    const hass = big();
    const engine = new AlertEngine(
      define({ preset: 'low_battery' }, { preset: 'open' }, { preset: 'lights_on' }),
      {
        now: () => NOW,
      },
    );
    engine.evaluate(hass);
    // the first look: every sensor and binary sensor against the batteries' three clauses, the binary sensors
    // against the openings' two (covers: none), the lights against one
    expect(engine.tests).toBe(3000 * 3 + 1000 * 2 + 1000);

    engine.tests = 0;
    let next = change(hass, 'sensor.battery_500', {
      state: '5',
      attributes: { device_class: 'battery' },
      device: 'device_500',
    });
    expect(ids(engine, next)[0]).toContain('sensor.battery_500');
    // the battery's three clauses, its device's own entities read for the charger: itself
    expect(engine.tests).toBe(3);

    engine.tests = 0;
    next = change(next, 'light.light_2', { state: 'on' });
    engine.evaluate(next);
    expect(engine.tests).toBe(1);

    engine.tests = 0;
    next = change(next, 'switch.switch_9', { state: 'on' });
    engine.evaluate(next);
    expect(engine.tests).toBe(0);
  });

  it('tests everything again when the registries change, and keeps how long a match has held', () => {
    let clock = NOW;
    const hass = house({
      'binary_sensor.door': door('on', NOW - 2 * MINUTE),
      'binary_sensor.window': { state: 'on', attributes: { device_class: 'window' } },
    });
    const engine = new AlertEngine(define({ preset: 'open', for: { minutes: 5 } }), {
      now: () => clock,
    });
    expect(ids(engine, hass)).toEqual([[]]);
    engine.tests = 0;
    clock = NOW + 3 * MINUTE;
    const renamed = {
      ...hass,
      entities: { ...hass.entities },
      areas: { hall: { area_id: 'hall', name: 'Hall' } },
    };
    expect(ids(engine, renamed)).toEqual([['binary_sensor.door']]);
    expect(engine.tests).toBe(2 * 2);
  });

  it('drops an entity that leaves, and tests one that arrives', () => {
    const hass = house({ 'light.a': { state: 'on' } });
    const engine = new AlertEngine(define({ preset: 'lights_on' }), { now: () => NOW });
    expect(ids(engine, hass)).toEqual([['light.a']]);
    const added = change(hass, 'light.b', { state: 'on' });
    expect(ids(engine, added)).toEqual([['light.a', 'light.b']]);
    expect(ids(engine, change(added, 'light.a', undefined))).toEqual([['light.b']]);
  });
});

describe('time', () => {
  it('reveals a match when its `for` is reached, by one timer, not before', () => {
    vi.useFakeTimers({ now: NOW });
    const due = vi.fn();
    const hass = house({ 'binary_sensor.door': door('on', NOW - 2 * MINUTE) });
    const engine = new AlertEngine(define({ preset: 'open', for: { minutes: 5 } }), { due });
    expect(engine.evaluate(hass).shown).toEqual([]);
    expect(engine.next).toBe(NOW + 3 * MINUTE);
    vi.advanceTimersByTime(3 * MINUTE - 1);
    expect(due).not.toHaveBeenCalled();
    expect(engine.evaluate(hass).shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(due).toHaveBeenCalledTimes(1);
    expect(engine.evaluate(hass).shown.map((alert) => alert.rows[0]?.id)).toEqual([
      'binary_sensor.door',
    ]);
    expect(engine.next).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a number’s `for` from the first moment it held, and starts again when it leaves the range', () => {
    let clock = NOW;
    const temperature = (state: string, changed: number): Seed => ({
      state,
      changed,
      attributes: { device_class: 'temperature' },
    });
    // 12° since ten minutes ago: a lower bound of how long it has been under 15
    let hass = house({ 'sensor.freezer': temperature('-2', NOW - 10 * MINUTE) });
    const engine = new AlertEngine(
      define({ entity: 'sensor.freezer', above: -5, for: { minutes: 30 } }),
      { now: () => clock },
    );
    expect(engine.evaluate(hass).shown).toEqual([]);
    expect(engine.next).toBe(NOW + 20 * MINUTE);
    // another value in the range: the clock keeps running from the first sight
    clock = NOW + 15 * MINUTE;
    hass = change(hass, 'sensor.freezer', temperature('-1', clock));
    engine.evaluate(hass);
    expect(engine.next).toBe(NOW + 20 * MINUTE);
    clock = NOW + 20 * MINUTE;
    expect(engine.evaluate(hass).shown).toHaveLength(1);
    expect(engine.evaluate(hass).shown[0]?.oldest).toBe(NOW - 10 * MINUTE);
    // out of the range and back: from the new value's change
    clock = NOW + 25 * MINUTE;
    hass = change(hass, 'sensor.freezer', temperature('-8', clock));
    expect(engine.evaluate(hass).shown).toEqual([]);
    clock = NOW + 26 * MINUTE;
    hass = change(hass, 'sensor.freezer', temperature('-3', clock));
    engine.evaluate(hass);
    expect(engine.next).toBe(clock + 30 * MINUTE);
  });

  it('finds what has not changed for long, from its last update', () => {
    let clock = NOW;
    const stuck = (updated: number): Seed => ({
      state: '21.0',
      changed: NOW - 60 * MINUTE,
      updated,
    });
    let hass = house({
      'sensor.stuck': stuck(NOW - 60 * MINUTE),
      'sensor.live': stuck(NOW - MINUTE),
    });
    const engine = new AlertEngine(define({ domain: 'sensor', unchanged_for: { hours: 1 } }), {
      now: () => clock,
    });
    expect(ids(engine, hass)).toEqual([['sensor.stuck']]);
    expect(engine.next).toBe(NOW + 59 * MINUTE);
    clock = NOW + 30 * MINUTE;
    hass = change(hass, 'sensor.stuck', stuck(clock));
    expect(ids(engine, hass)).toEqual([[]]);
  });

  it('escalates by time and by count', () => {
    let clock = NOW;
    const hass = house({
      'binary_sensor.front': door('on', NOW - 10 * MINUTE),
      'binary_sensor.back': door('on', NOW - 6 * MINUTE),
    });
    const engine = new AlertEngine(
      define(
        { preset: 'open', escalate: { for: { minutes: 30 } } },
        { preset: 'open', id: 'many', escalate: { count: 2 } },
        { preset: 'open', id: 'more', escalate: { count: 3 } },
      ),
      { now: () => clock, order: 'config' },
    );
    expect(engine.evaluate(hass).alerts.map((alert) => [alert.severity, alert.escalated])).toEqual([
      ['warning', false],
      ['critical', true],
      ['warning', false],
    ]);
    expect(engine.next).toBe(NOW + 20 * MINUTE);
    clock = NOW + 20 * MINUTE;
    const [first] = engine.evaluate(hass).alerts;
    expect([first?.severity, first?.tone]).toEqual(['critical', 'danger']);
  });

  it('ends a snooze on time, and brings an acknowledged entity back when it changes', () => {
    let clock = NOW;
    let version = 1;
    const memory: MemoryView = {
      get version() {
        return version;
      },
      snoozedUntil: (key) => (key === 'doors' ? NOW + 60 * MINUTE : undefined),
      acknowledged: (key) =>
        key === 'locks' ? { 'lock.front': new Date(NOW - MINUTE).toISOString() } : undefined,
    };
    let hass = house({
      'binary_sensor.front': door('on', NOW - 6 * MINUTE),
      'lock.front': { state: 'unlocked', changed: NOW - MINUTE },
      'lock.back': { state: 'unlocked', changed: NOW - MINUTE },
    });
    const engine = new AlertEngine(
      define({ preset: 'open', id: 'doors' }, { preset: 'unlocked', id: 'locks', for: 0 }),
      { now: () => clock },
    );
    let state = engine.evaluate(hass, memory);
    expect(state.alerts.map((alert) => [alert.key, alert.snoozedUntil, alert.shown])).toEqual([
      ['doors', NOW + 60 * MINUTE, false],
      ['locks', undefined, true],
    ]);
    expect(state.alerts[1]?.rows.map((row) => row.id)).toEqual(['lock.back']);
    expect(state.alerts[1]?.acknowledged.map((row) => row.id)).toEqual(['lock.front']);
    expect(engine.next).toBe(NOW + 60 * MINUTE);

    hass = change(hass, 'lock.front', { state: 'unlocked', changed: NOW });
    state = engine.evaluate(hass, memory);
    expect(state.alerts[1]?.rows.map((row) => row.id).sort()).toEqual(['lock.back', 'lock.front']);

    clock = NOW + 60 * MINUTE;
    version = 2;
    expect(engine.evaluate(hass, memory).alerts[0]?.shown).toBe(true);
  });

  it('wakes at a time window’s edge', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 17, 21, 30) });
    const due = vi.fn();
    const hass = house({ 'light.porch': { state: 'on' } });
    const engine = new AlertEngine(
      define({
        preset: 'lights_on',
        conditions: [{ condition: 'time', after: '22:00', before: '06:00' }],
      }),
      { due },
    );
    expect(engine.evaluate(hass).alerts[0]).toMatchObject({
      applies: false,
      shown: false,
      count: 1,
    });
    vi.advanceTimersByTime(30 * MINUTE);
    expect(due).toHaveBeenCalledTimes(1);
    expect(engine.evaluate(hass).alerts[0]).toMatchObject({ applies: true, shown: true });
    expect(engine.next).toBe(Date.UTC(2026, 9, 18, 6, 0, 1));
    engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('counting and order', () => {
  const HOUSE = house(
    {
      'sensor.node_a': {
        state: 'unavailable',
        changed: NOW - 60 * MINUTE,
        device: 'node',
        area: 'attic',
      },
      'sensor.node_b': { state: 'unavailable', changed: NOW - 50 * MINUTE, device: 'node' },
      'light.zeta': { state: 'unavailable', changed: NOW - 90 * MINUTE, area: 'bedroom' },
      'light.alpha': {
        state: 'unavailable',
        changed: NOW - 30 * MINUTE,
        area: 'attic',
        attributes: { friendly_name: 'Alpha lamp' },
      },
    },
    { areas: { attic: { name: 'Attic' }, bedroom: { name: 'Bedroom' } } },
  );
  const unavailable = (extra: AlertConfig = {}) =>
    new AlertEngine(define({ preset: 'unavailable', for: 0, ...extra }), {
      now: () => NOW,
    }).evaluate(HOUSE).alerts[0];

  it('counts entities or devices', () => {
    expect(unavailable()?.count).toBe(3);
    expect(unavailable({ count_by: 'entity' })?.count).toBe(4);
  });

  it('shows from `min_count` up', () => {
    expect(unavailable({ min_count: 3 })?.shown).toBe(true);
    expect(unavailable({ min_count: 4 })?.shown).toBe(false);
  });

  it('orders its rows', () => {
    const order = (sort_rows: SortRows) => unavailable({ sort_rows })?.rows.map((row) => row.id);
    expect(order('duration')).toEqual([
      'light.zeta',
      'sensor.node_a',
      'sensor.node_b',
      'light.alpha',
    ]);
    expect(order('name')).toEqual(['light.alpha', 'sensor.node_a', 'sensor.node_b', 'light.zeta']);
    expect(order('area')).toEqual(['sensor.node_b', 'light.alpha', 'sensor.node_a', 'light.zeta']);
    expect(unavailable()?.oldest).toBe(NOW - 90 * MINUTE);
  });

  it('orders its rows again when an area is renamed', () => {
    const engine = new AlertEngine(
      define({ preset: 'unavailable', for: 0, count_by: 'entity', sort_rows: 'area' }),
      { now: () => NOW },
    );
    engine.evaluate(HOUSE);
    const renamed = {
      ...HOUSE,
      areas: { ...HOUSE.areas, attic: { area_id: 'attic', name: 'Zoo' } },
    };
    expect(engine.evaluate(renamed).alerts[0]?.rows.map((row) => row.id)).toEqual([
      'sensor.node_b',
      'light.zeta',
      'light.alpha',
      'sensor.node_a',
    ]);
  });

  it('orders alerts by severity, then as configured; or as configured only', () => {
    const hass = house({
      'light.a': { state: 'on' },
      'binary_sensor.leak': { state: 'on', attributes: { device_class: 'moisture' } },
    });
    const alerts = define(
      { preset: 'lights_on' },
      { preset: 'hazards' },
      { preset: 'lights_on', id: 'second', severity: 'warning' },
    );
    const keys = (order: 'severity' | 'config') =>
      new AlertEngine(alerts, { now: () => NOW, order })
        .evaluate(hass)
        .alerts.map((alert) => alert.definition.index);
    expect(keys('severity')).toEqual([1, 2, 0]);
    expect(keys('config')).toEqual([0, 1, 2]);
  });

  it('applies only while its conditions hold, and only to administrators when asked', () => {
    const hass = house({
      'light.a': { state: 'on' },
      'person.marta': { state: 'home', attributes: { user_id: 'u1' } },
    });
    const away = [{ condition: 'state', entity: 'person.marta', state: 'not_home' }];
    const engine = new AlertEngine(define({ preset: 'lights_on', conditions: away }), {
      now: () => NOW,
    });
    expect(engine.evaluate(hass).shown).toEqual([]);
    expect(
      engine.evaluate(
        change(hass, 'person.marta', { state: 'not_home', attributes: { user_id: 'u1' } }),
      ).shown,
    ).toHaveLength(1);
    const admins = new AlertEngine(define({ preset: 'lights_on', admin_only: true }), {
      now: () => NOW,
    });
    expect(admins.evaluate(hass).alerts).toHaveLength(1);
    expect(
      admins.evaluate({ ...hass, user: { id: 'u2', name: 'Guest', is_admin: false } }).alerts,
    ).toEqual([]);
  });

  it('reads no memory by default', () => {
    const engine = new AlertEngine(define({ preset: 'unavailable', for: 0 }), { now: () => NOW });
    expect(engine.evaluate(HOUSE, NO_MEMORY).shown).toHaveLength(1);
  });
});
