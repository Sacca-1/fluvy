import { device, entriesFor, type FixtureAt } from './house.js';

/*
 * Tuya (Home Assistant's tuya): a kettle ("bh": its status and water temperature, the temperature it heats to, its
 * start switch and work mode; sensor.py:289-305, number.py:49-80, switch.py:36-46, select.py:31-41) and a coffee
 * maker ("kfj": its cups, powder, strength and mode; number.py:180-200, select.py:162-180).
 */

const PLATFORM = 'tuya';

/** A kettle heating, 62 °C on its way to 100. */
export const tuyaKettle: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'tuya-kettle');
  return {
    title: 'Tuya kettle, heating',
    platform: PLATFORM,
    device: device('tuya-kettle', 'Wasserkocher', 'Smart Kettle', 'Tuya'),
    entities: [
      e('sensor.wasserkocher_status', 'status'),
      e('sensor.wasserkocher_aktuelle_temperatur', 'current_temperature'),
      e('number.wasserkocher_temperatur', 'temperature', { entity_category: 'config' }),
      e('switch.wasserkocher_start', 'start'),
      e('switch.wasserkocher_warmhalten', 'heat_preservation', { entity_category: 'config' }),
      e('select.wasserkocher_arbeitsmodus', 'kettle_work_mode', { entity_category: 'config' }),
    ],
    states: [
      ['sensor.wasserkocher_status', 'heating', {}, 120],
      [
        'sensor.wasserkocher_aktuelle_temperatur',
        '62',
        { device_class: 'temperature', unit_of_measurement: '°C' },
      ],
      [
        'number.wasserkocher_temperatur',
        '100',
        { unit_of_measurement: '°C', min: 40, max: 100, step: 5 },
      ],
      ['switch.wasserkocher_start', 'on'],
      ['switch.wasserkocher_warmhalten', 'off'],
      [
        'select.wasserkocher_arbeitsmodus',
        'boiling_quick',
        { options: ['boiling_quick', 'temp_boiling', 'temp_setting'] },
      ],
    ],
    expected: {
      kind: 'kettle',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.wasserkocher_status',
        temperature: 'sensor.wasserkocher_aktuelle_temperatur',
        target: 'number.wasserkocher_temperatur',
        start: 'switch.wasserkocher_start',
        program: 'select.wasserkocher_arbeitsmodus',
      },
    },
  };
};

/** A coffee maker at rest. */
export const tuyaCoffee: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'tuya-coffee');
  return {
    title: 'Tuya coffee maker',
    platform: PLATFORM,
    device: device('tuya-coffee', 'Kaffeemaschine', 'Smart Coffee', 'Tuya'),
    entities: [
      e('select.kaffeemaschine_tassen', 'cups'),
      e('number.kaffeemaschine_pulver', 'powder', { entity_category: 'config' }),
      e('select.kaffeemaschine_starke', 'concentration', { entity_category: 'config' }),
      e('select.kaffeemaschine_modus', 'mode'),
    ],
    states: [
      ['select.kaffeemaschine_tassen', '2', { options: ['1', '2', '4'] }],
      ['number.kaffeemaschine_pulver', '12', { min: 5, max: 20, step: 1 }],
      ['select.kaffeemaschine_starke', 'medium', { options: ['light', 'medium', 'strong'] }],
      ['select.kaffeemaschine_modus', 'coffee', { options: ['coffee', 'tea'] }],
    ],
    expected: { kind: 'coffee', listed: true },
  };
};
