import { describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { bindAction, installable, offered } from './actions.js';
import { AlertEngine, type AlertResult } from './engine.js';
import { change, house, MINUTE, NOW } from './fixture.js';
import { definitionOf, type AlertConfig } from './model.js';
import { PRESET_NAMES, PRESETS } from './presets.js';

/** What a preset shows in this house now: its results (a split preset has several). */
function results(alert: AlertConfig, hass: HomeAssistant, now = NOW): readonly AlertResult[] {
  const engine = new AlertEngine([definitionOf(alert, 0, 'card')], { now: () => now });
  return engine.evaluate(hass).alerts;
}
const rows = (alert: AlertConfig, hass: HomeAssistant, now = NOW): string[] =>
  results(alert, hass, now).flatMap((result) => result.rows.map((row) => row.id));

const battery = (state: string, extra: object = {}) => ({
  state,
  attributes: { device_class: 'battery' },
  ...extra,
});

describe('every preset', () => {
  it('has its words, a glyph and a severity', () => {
    for (const name of PRESET_NAMES) {
      const preset = PRESETS[name];
      expect(preset.title, name).toBe(`alerts.preset.${name}`);
      expect(preset.icon, name).toBeTruthy();
      expect(['critical', 'warning', 'info'], name).toContain(preset.severity);
    }
  });
});

describe('low_battery', () => {
  const HOUSE = house({
    'sensor.thermo_battery': battery('12', { device: 'thermo' }),
    'sensor.lock_battery': battery('20', { device: 'lock' }),
    'sensor.motion_battery': battery('21', { device: 'motion' }),
    'sensor.remote_battery': battery('low', { device: 'remote' }),
    'binary_sensor.leak_battery': battery('on', { device: 'leak' }),
    'binary_sensor.door_battery': battery('off', { device: 'door' }),
    'sensor.phone_battery': battery('9', { device: 'phone', platform: 'mobile_app' }),
    'sensor.vacuum_battery': battery('8', { device: 'vacuum' }),
    'binary_sensor.vacuum_charging': {
      state: 'on',
      attributes: { device_class: 'battery_charging' },
      device: 'vacuum',
    },
    'sensor.dead_battery': battery('unavailable', { device: 'dead' }),
  });

  it('is 20 % and under, a "low" state, a battery binary sensor on; lowest first', () => {
    expect(rows({ preset: 'low_battery' }, HOUSE)).toEqual([
      'sensor.thermo_battery',
      'sensor.lock_battery',
      'binary_sensor.leak_battery',
      'sensor.remote_battery',
    ]);
  });

  it('leaves phones out unless asked, and a battery that charges', () => {
    expect(rows({ preset: 'low_battery', phones: true }, HOUSE)).toContain('sensor.phone_battery');
    expect(rows({ preset: 'low_battery' }, HOUSE)).not.toContain('sensor.vacuum_battery');
  });

  it('takes its own threshold, the states that say "low" untouched', () => {
    expect(rows({ preset: 'low_battery', below: 12 }, HOUSE)).toEqual([
      'binary_sensor.leak_battery',
      'sensor.remote_battery',
    ]);
  });

  it('counts devices and names a row by its device', () => {
    const [result] = results({ preset: 'low_battery' }, HOUSE);
    expect(result?.count).toBe(4);
    expect(result?.definition.nameBy).toBe('device');
  });

  it('is shown again when the charger stops, with the battery itself unchanged', () => {
    const definition = definitionOf({ preset: 'low_battery' }, 0, 'card');
    const engine = new AlertEngine([definition], { now: () => NOW });
    expect(engine.evaluate(HOUSE).alerts[0]?.rows.map((row) => row.id)).not.toContain(
      'sensor.vacuum_battery',
    );
    const unplugged = change(HOUSE, 'binary_sensor.vacuum_charging', {
      state: 'off',
      attributes: { device_class: 'battery_charging' },
    });
    expect(engine.evaluate(unplugged).alerts[0]?.rows.map((row) => row.id)).toContain(
      'sensor.vacuum_battery',
    );
  });
});

describe('unavailable', () => {
  const gone = NOW - 10 * MINUTE;
  const HOUSE = house({
    'sensor.node_temperature': { state: 'unavailable', changed: gone, device: 'node' },
    'sensor.node_humidity': { state: 'unavailable', changed: gone, device: 'node' },
    'sensor.node_linkquality': {
      state: 'unavailable',
      changed: gone,
      device: 'node',
      category: 'diagnostic',
    },
    'light.desk': { state: 'unavailable', changed: gone, device: 'desk' },
    'light.blip': { state: 'unavailable', changed: NOW - 2 * MINUTE, device: 'blip' },
    'sensor.ok': { state: '20', device: 'ok' },
    'sensor.signal': { state: 'unavailable', changed: gone, device: 'ok', category: 'diagnostic' },
    'button.restart': { state: 'unavailable', changed: gone, device: 'desk' },
    'scene.movie': { state: 'unavailable', changed: gone },
    'event.doorbell': { state: 'unavailable', changed: gone },
  });

  it('is five minutes unavailable, counted by device, without buttons, events, scenes or diagnostics', () => {
    const [result] = results({ preset: 'unavailable' }, HOUSE);
    expect(result?.rows.map((row) => row.id).sort()).toEqual([
      'light.desk',
      'sensor.node_humidity',
      'sensor.node_temperature',
    ]);
    // the node is one device of two entities, the desk lamp another
    expect(result?.count).toBe(2);
  });

  it('shows the flapping one once its five minutes are up', () => {
    expect(rows({ preset: 'unavailable' }, HOUSE, NOW + 3 * MINUTE)).toContain('light.blip');
  });
});

describe('open, unlocked, hazards, errors, lights on', () => {
  const HOUSE = house({
    'binary_sensor.front_door': {
      state: 'on',
      attributes: { device_class: 'door' },
      changed: NOW - 6 * MINUTE,
    },
    'binary_sensor.kitchen_window': {
      state: 'on',
      attributes: { device_class: 'window' },
      changed: NOW - 40 * MINUTE,
    },
    'binary_sensor.patio_door': { state: 'on', attributes: { device_class: 'door' } },
    'binary_sensor.hall_motion': { state: 'on', attributes: { device_class: 'motion' } },
    'cover.garage': {
      state: 'open',
      attributes: { device_class: 'garage' },
      changed: NOW - 5 * MINUTE,
    },
    'cover.blinds': { state: 'open', attributes: { device_class: 'blind' } },
    'lock.front': { state: 'unlocked', changed: NOW - 11 * MINUTE },
    'lock.back': { state: 'unlocked', changed: NOW - 2 * MINUTE },
    'lock.shed': { state: 'jammed' },
    'binary_sensor.leak': { state: 'on', attributes: { device_class: 'moisture' } },
    'binary_sensor.smoke': { state: 'off', attributes: { device_class: 'smoke' } },
    'vacuum.robot': { state: 'error' },
    'binary_sensor.boiler_problem': { state: 'on', attributes: { device_class: 'problem' } },
    'light.kitchen': { state: 'on' },
    'light.hall': { state: 'off' },
  });

  it('open: doors, windows and openings on; door, garage and gate covers open; for five minutes', () => {
    expect(rows({ preset: 'open' }, HOUSE).sort()).toEqual([
      'binary_sensor.front_door',
      'binary_sensor.kitchen_window',
      'cover.garage',
    ]);
    // a door walked through a moment ago is not left open: it shows at its fifth minute, unless said otherwise
    expect(rows({ preset: 'open' }, HOUSE)).not.toContain('binary_sensor.patio_door');
    expect(rows({ preset: 'open' }, HOUSE, NOW + 5 * MINUTE)).toContain('binary_sensor.patio_door');
    expect(rows({ preset: 'open', for: 0 }, HOUSE)).toContain('binary_sensor.patio_door');
    expect(definitionOf({ preset: 'open' }, 0, 'card').clauses[0]?.forMs).toBe(5 * MINUTE);
  });

  it('unlocked: for ten minutes', () => {
    expect(rows({ preset: 'unlocked' }, HOUSE)).toEqual(['lock.front']);
    expect(rows({ preset: 'unlocked', for: 0 }, HOUSE).sort()).toEqual(['lock.back', 'lock.front']);
  });

  it('hazards: what goes off, critical', () => {
    const [result] = results({ preset: 'hazards' }, HOUSE);
    expect(result?.rows.map((row) => row.id)).toEqual(['binary_sensor.leak']);
    expect(result?.severity).toBe('critical');
    expect(result?.tone).toBe('danger');
  });

  it('errors: a vacuum in error, a jammed lock, a problem sensor', () => {
    expect(rows({ preset: 'errors' }, HOUSE).sort()).toEqual([
      'binary_sensor.boiler_problem',
      'lock.shed',
      'vacuum.robot',
    ]);
  });

  it('lights on: on lights, info in the notice tone', () => {
    const [result] = results({ preset: 'lights_on' }, HOUSE);
    expect(result?.rows.map((row) => row.id)).toEqual(['light.kitchen']);
    expect(result?.tone).toBe('notice');
  });

  it('offers its buttons where they belong, bound to the rows or every match', () => {
    const open = definitionOf({ preset: 'open' }, 0, 'card');
    const close = open.rowButton;
    expect(close && offered(close, HOUSE, 'cover.garage')).toBe(true);
    expect(close && offered(close, HOUSE, 'binary_sensor.front_door')).toBe(false);
    expect(close && bindAction(close.tap_action, { matched: [], row: 'cover.garage' })).toEqual({
      action: 'perform-action',
      perform_action: 'cover.close_cover',
      target: { entity_id: ['cover.garage'] },
    });
    const [lockAll] = definitionOf({ preset: 'unlocked' }, 0, 'card').actions;
    expect(
      lockAll && bindAction(lockAll.tap_action, { matched: ['lock.front', 'lock.back'] }),
    ).toEqual({
      action: 'perform-action',
      perform_action: 'lock.lock',
      target: { entity_id: ['lock.front', 'lock.back'] },
      confirmation: true,
    });
  });
});

describe('updates', () => {
  const HOUSE = house({
    'update.core': { state: 'on', attributes: { supported_features: 1 } },
    'update.addon': { state: 'on', attributes: { supported_features: 1, in_progress: true } },
    'update.firmware': { state: 'on', attributes: { supported_features: 0 } },
    'update.done': { state: 'off', attributes: { supported_features: 1 } },
  });

  it('lists the ones waiting; an administrator installs one that can be installed from here', () => {
    expect(rows({ preset: 'updates' }, HOUSE).sort()).toEqual([
      'update.addon',
      'update.core',
      'update.firmware',
    ]);
    expect(
      ['update.core', 'update.addon', 'update.firmware'].map((id) => installable(HOUSE, id)),
    ).toEqual([true, false, false]);
    const install = definitionOf({ preset: 'updates' }, 0, 'card').rowButton;
    expect(install && offered(install, HOUSE, 'update.core')).toBe(true);
    const guest = { ...HOUSE, user: { id: 'u2', name: 'Guest', is_admin: false } };
    expect(install && offered(install, guest, 'update.core')).toBe(false);
  });
});

describe('ha_alerts', () => {
  const HOUSE = house({
    'alert.freezer': { state: 'on', attributes: { friendly_name: 'Freezer warm' } },
    'alert.garage': { state: 'on', attributes: { friendly_name: 'Garage left open' } },
    'alert.quiet': { state: 'off' },
    'alert.idle': { state: 'idle' },
  });

  it('is one alert per firing alert, each with its entity and key; the acknowledged ones when asked', () => {
    const split = results({ preset: 'ha_alerts' }, HOUSE);
    expect(split.map((result) => result.entity)).toEqual(['alert.freezer', 'alert.garage']);
    expect(split.map((result) => result.count)).toEqual([1, 1]);
    expect(new Set(split.map((result) => result.key)).size).toBe(2);
    expect(results({ preset: 'ha_alerts', acknowledged: true }, HOUSE)).toHaveLength(3);
  });

  it('acknowledges through Home Assistant: the row, or the alert’s one entity', () => {
    const definition = definitionOf({ preset: 'ha_alerts' }, 0, 'card');
    expect(
      definition.rowButton &&
        bindAction(definition.rowButton.tap_action, { matched: [], row: 'alert.garage' }),
    ).toMatchObject({ perform_action: 'alert.turn_off', target: { entity_id: ['alert.garage'] } });
    const [all] = definition.actions;
    expect(all && bindAction(all.tap_action, { matched: ['alert.freezer'] })).toMatchObject({
      target: { entity_id: ['alert.freezer'] },
    });
  });
});

describe('repairs', () => {
  it('is fed by its source, for administrators, a repair’s own severity raising it', () => {
    const definition = definitionOf({ preset: 'repairs' }, 0, 'card');
    const engine = new AlertEngine([definition], { now: () => NOW });
    const HOUSE = house({});
    expect(engine.evaluate(HOUSE).alerts[0]?.count).toBe(0);
    engine.feed('repairs', [
      { id: 'hacs.restart', since: NOW - MINUTE, severity: 'warning' },
      { id: 'zha.firmware', since: NOW - 2 * MINUTE, severity: 'critical' },
    ]);
    const [result] = engine.evaluate(HOUSE).alerts;
    expect(result?.rows.map((row) => row.id)).toEqual(['zha.firmware', 'hacs.restart']);
    expect(result?.severity).toBe('critical');
    expect(definition.rowAction).toEqual({
      action: 'navigate',
      navigation_path: '/config/repairs',
    });
    const guest = { ...HOUSE, user: { id: 'u2', name: 'Guest', is_admin: false } };
    expect(engine.evaluate(guest).alerts).toEqual([]);
  });
});
