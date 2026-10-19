import { device, entriesFor, minutesFrom, type FixtureAt } from './house.js';

/*
 * SmartThings (Samsung; Home Assistant's smartthings): its machine and job states, completion time and progress
 * (sensor.py:395-449, :1197-1240), the operating-state select that runs, pauses and stops a washer, a dryer or a
 * dishwasher, named for the device alone and needing its remote control on (select.py:170-197), the dishwasher's and
 * the oven's buttons (button.py:33-91), a fridge's compartments as numbers and sensors of the same keys
 * (number.py:203-206), the upper washer of a Flex washer and an oven's second cavity on the same device.
 */

const PLATFORM = 'smartthings';
const OPERATING = { options: ['pause', 'run', 'stop'] };

/** A washer spinning, its upper drum (a Flex washer's) at rest; its remote control on. */
export const stWasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'st-washer');
  return {
    title: 'SmartThings Flex washer, spinning, its upper drum at rest',
    platform: PLATFORM,
    device: device('st-washer', 'Samsung Waschmaschine', 'WF50A8800AV', 'Samsung Electronics'),
    entities: [
      e('sensor.samsung_waschmaschine_maschinenstatus', 'washer_machine_state'),
      e('sensor.samsung_waschmaschine_auftragsstatus', 'washer_job_state'),
      e('sensor.samsung_waschmaschine_fertigstellungszeit', 'completion_time'),
      e('sensor.samsung_waschmaschine_fortschritt', 'washer_progress'),
      e('sensor.samsung_waschmaschine_waschmodus', 'washer_mode'),
      e('select.samsung_waschmaschine', 'operating_state'),
      e('binary_sensor.samsung_waschmaschine_fernsteuerung', 'remote_control'),
      e(
        'sensor.samsung_waschmaschine_maschinenstatus_obere_waschmaschine',
        'washer_sub_machine_state',
      ),
      e('sensor.samsung_waschmaschine_auftragsstatus_obere_waschmaschine', 'washer_sub_job_state'),
      e(
        'sensor.samsung_waschmaschine_fertigstellungszeit_obere_waschmaschine',
        'washer_sub_completion_time',
      ),
      e(
        'binary_sensor.samsung_waschmaschine_fernsteuerung_obere_waschmaschine',
        'sub_remote_control',
      ),
      e('sensor.samsung_waschmaschine_energie', undefined),
      e('sensor.samsung_waschmaschine_leistung', undefined),
    ],
    states: [
      ['sensor.samsung_waschmaschine_maschinenstatus', 'run', {}, 47 * 60],
      ['sensor.samsung_waschmaschine_auftragsstatus', 'spin', {}, 4 * 60],
      [
        'sensor.samsung_waschmaschine_fertigstellungszeit',
        minutesFrom(now, 18),
        { device_class: 'timestamp' },
      ],
      ['sensor.samsung_waschmaschine_fortschritt', '85', { unit_of_measurement: '%' }],
      ['sensor.samsung_waschmaschine_waschmodus', 'Table_00_Course_5B'],
      ['select.samsung_waschmaschine', 'run', OPERATING],
      ['binary_sensor.samsung_waschmaschine_fernsteuerung', 'on'],
      ['sensor.samsung_waschmaschine_maschinenstatus_obere_waschmaschine', 'stop'],
      ['sensor.samsung_waschmaschine_auftragsstatus_obere_waschmaschine', 'none'],
      [
        'sensor.samsung_waschmaschine_fertigstellungszeit_obere_waschmaschine',
        minutesFrom(now, -300),
        { device_class: 'timestamp' },
      ],
      ['binary_sensor.samsung_waschmaschine_fernsteuerung_obere_waschmaschine', 'on'],
      [
        'sensor.samsung_waschmaschine_energie',
        '312.4',
        { device_class: 'energy', unit_of_measurement: 'kWh' },
      ],
      [
        'sensor.samsung_waschmaschine_leistung',
        '480',
        { device_class: 'power', unit_of_measurement: 'W' },
      ],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.samsung_waschmaschine_maschinenstatus',
        phase: 'sensor.samsung_waschmaschine_auftragsstatus',
        finish: 'sensor.samsung_waschmaschine_fertigstellungszeit',
        progress: 'sensor.samsung_waschmaschine_fortschritt',
        program: 'sensor.samsung_waschmaschine_waschmodus',
        operation: 'select.samsung_waschmaschine',
        remote: 'binary_sensor.samsung_waschmaschine_fernsteuerung',
        energy: 'sensor.samsung_waschmaschine_energie',
        watts: 'sensor.samsung_waschmaschine_leistung',
      },
    },
  };
};

/** A fridge: its two setpoints and readings, the fridge door open three minutes, its quick modes, its water filter worn. */
export const stFridge: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'st-fridge');
  const temperature = (value: string) =>
    [value, { device_class: 'temperature', unit_of_measurement: '°C' }] as const;
  return {
    title: 'SmartThings fridge, its door open three minutes',
    platform: PLATFORM,
    device: device('st-fridge', 'Samsung Kühlschrank', 'RF65DG960ESR', 'Samsung Electronics'),
    entities: [
      e('number.samsung_kuhlschrank_kuhlschranktemperatur', 'cooler_temperature'),
      e('number.samsung_kuhlschrank_gefrierschranktemperatur', 'freezer_temperature'),
      e('sensor.samsung_kuhlschrank_kuhlschranktemperatur', 'cooler_temperature'),
      e('sensor.samsung_kuhlschrank_gefrierschranktemperatur', 'freezer_temperature'),
      e('binary_sensor.samsung_kuhlschrank_kuhlschranktur', 'cooler_door'),
      e('binary_sensor.samsung_kuhlschrank_gefrierschranktur', 'freezer_door'),
      e('switch.samsung_kuhlschrank_power_cool', 'power_cool'),
      e('switch.samsung_kuhlschrank_power_freeze', 'power_freeze'),
      e('switch.samsung_kuhlschrank_eiswurfel', 'ice_maker'),
      e('sensor.samsung_kuhlschrank_wasserfilternutzung', 'water_filter_usage'),
      e('button.samsung_kuhlschrank_wasserfilter_zurucksetzen', 'reset_water_filter', {
        entity_category: 'diagnostic',
      }),
    ],
    states: [
      [
        'number.samsung_kuhlschrank_kuhlschranktemperatur',
        '3',
        { unit_of_measurement: '°C', min: 1, max: 7, step: 1 },
      ],
      [
        'number.samsung_kuhlschrank_gefrierschranktemperatur',
        '-19',
        { unit_of_measurement: '°C', min: -23, max: -15, step: 1 },
      ],
      ['sensor.samsung_kuhlschrank_kuhlschranktemperatur', ...temperature('3.4')],
      ['sensor.samsung_kuhlschrank_gefrierschranktemperatur', ...temperature('-18.7')],
      ['binary_sensor.samsung_kuhlschrank_kuhlschranktur', 'on', { device_class: 'door' }, 180],
      ['binary_sensor.samsung_kuhlschrank_gefrierschranktur', 'off', { device_class: 'door' }],
      ['switch.samsung_kuhlschrank_power_cool', 'off'],
      ['switch.samsung_kuhlschrank_power_freeze', 'off'],
      ['switch.samsung_kuhlschrank_eiswurfel', 'on'],
      ['sensor.samsung_kuhlschrank_wasserfilternutzung', '92', { unit_of_measurement: '%' }],
      ['button.samsung_kuhlschrank_wasserfilter_zurucksetzen', 'unknown'],
    ],
    expected: { kind: 'fridge', listed: true },
  };
};

/** A dual-cavity oven: the main one cooking at 180 °C, the second at rest. */
export const stOven: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'st-oven');
  return {
    title: 'SmartThings oven, two cavities',
    platform: PLATFORM,
    device: device('st-oven', 'Samsung Backofen', 'NV7B4040VBS', 'Samsung Electronics'),
    entities: [
      e('sensor.samsung_backofen_maschinenstatus', 'oven_machine_state'),
      e('sensor.samsung_backofen_auftragsstatus', 'oven_job_state'),
      e('sensor.samsung_backofen_fertigstellungszeit', 'completion_time'),
      e('sensor.samsung_backofen_ofenmodus', 'oven_mode'),
      e('sensor.samsung_backofen_sollwert', 'oven_setpoint'),
      e('sensor.samsung_backofen_temperatur'),
      e('button.samsung_backofen_stopp', 'stop'),
      e('sensor.samsung_backofen_maschinenstatus_zweiter_garraum', 'oven_machine_state_cavity_01'),
      e('sensor.samsung_backofen_auftragsstatus_zweiter_garraum', 'oven_job_state_cavity_01'),
      e('sensor.samsung_backofen_sollwert_zweiter_garraum', 'oven_setpoint_cavity_01'),
      e('sensor.samsung_backofen_temperatur_zweiter_garraum', 'oven_temperature_cavity_01'),
    ],
    states: [
      ['sensor.samsung_backofen_maschinenstatus', 'running', {}, 20 * 60],
      ['sensor.samsung_backofen_auftragsstatus', 'cooking'],
      [
        'sensor.samsung_backofen_fertigstellungszeit',
        minutesFrom(now, 35),
        { device_class: 'timestamp' },
      ],
      ['sensor.samsung_backofen_ofenmodus', 'convection_bake'],
      [
        'sensor.samsung_backofen_sollwert',
        '180',
        { device_class: 'temperature', unit_of_measurement: '°C' },
      ],
      [
        'sensor.samsung_backofen_temperatur',
        '179',
        { device_class: 'temperature', unit_of_measurement: '°C' },
      ],
      ['button.samsung_backofen_stopp', 'unknown'],
      ['sensor.samsung_backofen_maschinenstatus_zweiter_garraum', 'ready'],
      ['sensor.samsung_backofen_auftragsstatus_zweiter_garraum', 'ready'],
      [
        'sensor.samsung_backofen_sollwert_zweiter_garraum',
        '0',
        { device_class: 'temperature', unit_of_measurement: '°C' },
      ],
      [
        'sensor.samsung_backofen_temperatur_zweiter_garraum',
        '24',
        { device_class: 'temperature', unit_of_measurement: '°C' },
      ],
    ],
    expected: {
      kind: 'oven',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.samsung_backofen_maschinenstatus',
        target: 'sensor.samsung_backofen_sollwert',
        temperature: 'sensor.samsung_backofen_temperatur',
        stop: 'button.samsung_backofen_stopp',
      },
    },
  };
};

/** A dishwasher its job says finished while its machine has stopped; its remote control off. */
export const stDishwasher: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'st-dish');
  return {
    title: 'SmartThings dishwasher, finished, its remote control off',
    platform: PLATFORM,
    device: device('st-dish', 'Samsung Geschirrspüler', 'DW60A8050FS', 'Samsung Electronics'),
    entities: [
      e('sensor.samsung_geschirrspuler_maschinenstatus', 'dishwasher_machine_state'),
      e('sensor.samsung_geschirrspuler_auftragsstatus', 'dishwasher_job_state'),
      e('select.samsung_geschirrspuler_programm', 'dishwasher_washing_course'),
      e('button.samsung_geschirrspuler_start', 'start'),
      e('button.samsung_geschirrspuler_pause', 'pause'),
      e('button.samsung_geschirrspuler_fortsetzen', 'resume'),
      e('button.samsung_geschirrspuler_abbrechen', 'cancel'),
      e('binary_sensor.samsung_geschirrspuler_fernsteuerung', 'remote_control'),
      e('binary_sensor.samsung_geschirrspuler_tur', 'door'),
    ],
    states: [
      ['sensor.samsung_geschirrspuler_maschinenstatus', 'stop', {}, 30 * 60],
      ['sensor.samsung_geschirrspuler_auftragsstatus', 'finish', {}, 30 * 60],
      [
        'select.samsung_geschirrspuler_programm',
        'eco',
        { options: ['auto', 'eco', 'intensive', 'express'] },
      ],
      ['button.samsung_geschirrspuler_start', 'unknown'],
      ['button.samsung_geschirrspuler_pause', 'unknown'],
      ['button.samsung_geschirrspuler_fortsetzen', 'unknown'],
      ['button.samsung_geschirrspuler_abbrechen', 'unknown'],
      ['binary_sensor.samsung_geschirrspuler_fernsteuerung', 'off'],
      ['binary_sensor.samsung_geschirrspuler_tur', 'off', { device_class: 'door' }, 3 * 3600],
    ],
    expected: { kind: 'dishwasher', status: 'finished', listed: true },
  };
};
