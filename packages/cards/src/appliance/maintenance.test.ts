import type { HassEntity } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  maintenanceItem,
  maintenanceList,
  maintenanceOf,
  notifiedItem,
  NOTIFIED_FOR,
  type MaintenanceItem,
} from './maintenance.js';
import type { Candidate } from './roles.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');

const state = (
  entity_id: string,
  value: string,
  ago = 3600,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id,
  state: value,
  attributes,
  last_changed: new Date(NOW - ago * 1000).toISOString(),
  last_updated: new Date(NOW - ago * 1000).toISOString(),
});
const candidate = (id: string, platform: string, key?: string): Candidate => ({
  id,
  domain: id.slice(0, id.indexOf('.')),
  key,
  platform,
  object: id.slice(id.indexOf('.') + 1),
});
/** One maintenance entity read: its spec by its key, its item by its state. */
const read = (
  platform: string,
  id: string,
  key: string | undefined,
  value: string,
  low?: number,
) => {
  const spec = maintenanceOf(candidate(id, platform, key));
  return spec ? maintenanceItem(spec, state(id, value), low) : undefined;
};

describe('what an appliance asks to be looked after', () => {
  it('reads Home Connect’s events: present is due, confirmed is due and seen to, off is fine; "nearly" is soon', () => {
    expect(read('home_connect', 'sensor.d_salt', 'salt_lack', 'present')).toEqual({
      key: 'salt',
      entity: 'sensor.d_salt',
      severity: 'due',
      since: NOW - 3_600_000,
    });
    expect(
      read('home_connect', 'sensor.d_beans', 'bean_container_empty', 'confirmed'),
    ).toMatchObject({
      key: 'beans',
      severity: 'due',
      confirmed: true,
    });
    expect(read('home_connect', 'sensor.d_salt', 'salt_lack', 'off')).toEqual({
      key: 'salt',
      entity: 'sensor.d_salt',
      severity: 'ok',
    });
    expect(
      read('home_connect', 'sensor.d_rinse', 'rinse_aid_nearly_empty', 'present'),
    ).toMatchObject({
      key: 'rinse_aid',
      severity: 'soon',
    });
    expect(
      read('home_connect', 'sensor.d_descale', 'descaling_in_10_cups', 'present'),
    ).toMatchObject({
      key: 'descale',
      severity: 'soon',
    });
    expect(
      read('home_connect', 'sensor.d_grease', 'grease_filter_max_saturation_reached', 'present'),
    ).toMatchObject({ key: 'grease_filter', severity: 'due' });
  });

  it('reads Miele’s levels against the low level: due at half of it, soon at it', () => {
    expect(read('miele', 'sensor.w_salt', 'salt_level', '8')).toMatchObject({
      key: 'salt',
      severity: 'due',
      level: 8,
    });
    expect(read('miele', 'sensor.w_salt', 'salt_level', '15')).toMatchObject({
      severity: 'soon',
      level: 15,
    });
    expect(read('miele', 'sensor.w_salt', 'salt_level', '60')).toMatchObject({
      severity: 'ok',
      level: 60,
    });
    // the card's own low level
    expect(read('miele', 'sensor.w_tank', 'twin_dos_1_level', '25', 30)).toMatchObject({
      key: 'detergent',
      severity: 'soon',
    });
    expect(read('miele', 'sensor.w_tank', 'twin_dos_2_level', 'unknown')).toBeUndefined();
  });

  it('reads LG’s reminders as flags, and its notifications for a day, said with their age', () => {
    expect(read('lg_thinq', 'binary_sensor.d_rinse', 'rinse_refill', 'on')).toMatchObject({
      key: 'rinse_aid',
      severity: 'due',
    });
    expect(read('lg_thinq', 'binary_sensor.d_care', 'machine_clean_reminder', 'off')).toMatchObject(
      {
        key: 'machine_care',
        severity: 'ok',
      },
    );
    expect(read('lg_thinq', 'sensor.f_filter', 'fresh_air_filter', 'replace')).toMatchObject({
      key: 'air_filter',
      severity: 'due',
    });
    const notified = (type: string, ago: number) =>
      notifiedItem(
        state('event.d_note', new Date(NOW - ago).toISOString(), 0, { event_type: type }),
        NOW,
      );
    expect(notified('salt_refill_is_needed', 3_600_000)).toEqual({
      key: 'salt',
      entity: 'event.d_note',
      severity: 'due',
      since: NOW - 3_600_000,
    });
    expect(notified('time_to_change_water_filter', NOTIFIED_FOR - 60_000)).toMatchObject({
      key: 'water_filter',
    });
    // a day on, or a notification of anything else, asks for nothing
    expect(notified('salt_refill_is_needed', NOTIFIED_FOR + 60_000)).toBeUndefined();
    expect(notified('washing_is_complete', 60_000)).toBeUndefined();
  });

  it('reads SmartThings’ filters by how much they are used, Whirlpool’s tank and Electrolux’s filter by their words', () => {
    expect(read('smartthings', 'sensor.f_water', 'water_filter_usage', '92')).toMatchObject({
      key: 'water_filter',
      severity: 'due',
      level: 8,
    });
    expect(read('smartthings', 'sensor.f_water', 'water_filter_usage', '40')).toMatchObject({
      severity: 'ok',
      level: 60,
    });
    expect(read('whirlpool', 'sensor.w_tank', 'whirlpool_tank', '25')).toMatchObject({
      key: 'detergent',
      severity: 'soon',
    });
    expect(read('whirlpool', 'sensor.w_tank', 'whirlpool_tank', 'empty')).toMatchObject({
      severity: 'due',
    });
    expect(read('whirlpool', 'sensor.w_tank', 'whirlpool_tank', '100')).toMatchObject({
      severity: 'ok',
    });
    expect(
      read('electrolux_status', 'sensor.e_fridge_waterfilterstate', undefined, 'Change'),
    ).toMatchObject({
      key: 'water_filter',
      severity: 'due',
    });
  });

  it('knows a reset by its button, never by a reading; a setting is not a flag', () => {
    expect(maintenanceOf(candidate('button.f_reset', 'smartthings', 'reset_water_filter'))).toEqual(
      {
        key: 'water_filter',
        form: 'reset',
      },
    );
    expect(
      maintenanceItem({ key: 'water_filter', form: 'reset' }, state('button.f_reset', 'unknown')),
    ).toBeUndefined();
    expect(
      maintenanceOf(candidate('select.f_air', 'lg_thinq', 'fresh_air_filter')),
    ).toBeUndefined();
    expect(maintenanceOf(candidate('sensor.x_salt_lack', 'zha', 'salt_lack'))).toBeUndefined();
  });

  it('lists one item a thing, the most pressing of those that say it, due first', () => {
    const item = (
      key: MaintenanceItem['key'],
      severity: MaintenanceItem['severity'],
      entity: string = key,
    ) => ({ key, severity, entity }) as MaintenanceItem;
    expect(
      maintenanceList([
        item('rinse_aid', 'soon'),
        item('salt', 'ok', 'salt-level'),
        item('salt', 'due', 'salt-event'),
        undefined,
        item('filter', 'ok'),
        item('beans', 'due'),
      ]).map(({ key, severity, entity }) => `${key} ${severity} ${entity}`),
    ).toEqual([
      'salt due salt-event',
      'beans due beans',
      'rinse_aid soon rinse_aid',
      'filter ok filter',
    ]);
  });
});
