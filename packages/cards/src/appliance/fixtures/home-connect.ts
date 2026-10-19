import { device, entriesFor, minutesFrom, type FixtureAt, type Seed } from './house.js';

/*
 * Home Connect (Bosch, Siemens, Neff, Gaggenau; Home Assistant's home_connect): its operation state and its events
 * (sensor.py:51-101, :197-420), its door as a sensor of its own, its remote start (binary_sensor.py:44), its programmes
 * as two selects — the one chosen and the one that starts it (select.py:99-114) — its pause, resume and stop buttons
 * (button.py:36-45, :128-139), its power switch (switch.py:79-81), its compartments' setpoints (number.py:36-80).
 */

const PLATFORM = 'home_connect';
/** An event sensor's state (present, confirmed, off), changed `ago` seconds before (two hours when unsaid). */
const event = (state: 'present' | 'confirmed' | 'off', ago = 7200) =>
  [state, { device_class: 'enum', options: ['confirmed', 'off', 'present'] }, ago] as const;
const DISHWASHER_PROGRAMS = [
  'dishcare_dishwasher_program_auto_2',
  'dishcare_dishwasher_program_eco_50',
  'dishcare_dishwasher_program_quick_45',
  'dishcare_dishwasher_program_intensiv_70',
];

/** A dishwasher running Eco 50: salt out, rinse aid nearly out, its door shut. */
export const hcDishwasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'hc-dish');
  return {
    title: 'Home Connect dishwasher, running, salt out',
    platform: PLATFORM,
    device: device('hc-dish', 'Geschirrspüler', 'SN658X06TE', 'Siemens'),
    entities: [
      e('sensor.geschirrspuler_betriebszustand', 'operation_state'),
      e('sensor.geschirrspuler_programmfortschritt', 'program_progress'),
      e('sensor.geschirrspuler_programmende', 'program_finish_time'),
      e('sensor.geschirrspuler_tur', 'door'),
      e('binary_sensor.geschirrspuler_fernstart', 'remote_start'),
      e('binary_sensor.geschirrspuler_fernsteuerung', 'remote_control'),
      e('select.geschirrspuler_ausgewahltes_programm', 'selected_program'),
      e('select.geschirrspuler_aktives_programm', 'active_program'),
      e('button.geschirrspuler_programm_pausieren', 'pause_program'),
      e('button.geschirrspuler_programm_fortsetzen', 'resume_program'),
      e('button.geschirrspuler_programm_stoppen', 'stop_program'),
      e('switch.geschirrspuler_strom', 'power'),
      e('sensor.geschirrspuler_salzmangel', 'salt_lack'),
      e('sensor.geschirrspuler_klarspuler_fast_leer', 'rinse_aid_nearly_empty'),
      e('sensor.geschirrspuler_maschinenpflege', 'machine_care_reminder'),
      e('sensor.geschirrspuler_programm_beendet', 'program_finished'),
      e('sensor.geschirrspuler_programm_abgebrochen', 'program_aborted'),
    ],
    states: [
      ['sensor.geschirrspuler_betriebszustand', 'run', {}, 40 * 60],
      ['sensor.geschirrspuler_programmfortschritt', '60', { unit_of_measurement: '%' }],
      ['sensor.geschirrspuler_programmende', minutesFrom(now, 50), { device_class: 'timestamp' }],
      ['sensor.geschirrspuler_tur', 'closed', { device_class: 'enum' }, 41 * 60],
      ['binary_sensor.geschirrspuler_fernstart', 'on'],
      ['binary_sensor.geschirrspuler_fernsteuerung', 'on'],
      [
        'select.geschirrspuler_ausgewahltes_programm',
        'dishcare_dishwasher_program_eco_50',
        { options: DISHWASHER_PROGRAMS },
      ],
      [
        'select.geschirrspuler_aktives_programm',
        'dishcare_dishwasher_program_eco_50',
        { options: DISHWASHER_PROGRAMS },
      ],
      ['button.geschirrspuler_programm_pausieren', 'unknown'],
      ['button.geschirrspuler_programm_fortsetzen', 'unknown'],
      ['button.geschirrspuler_programm_stoppen', 'unknown'],
      ['switch.geschirrspuler_strom', 'on'],
      ['sensor.geschirrspuler_salzmangel', ...event('present', 3 * 3600)],
      ['sensor.geschirrspuler_klarspuler_fast_leer', ...event('present', 5 * 3600)],
      ['sensor.geschirrspuler_maschinenpflege', ...event('off')],
      ['sensor.geschirrspuler_programm_beendet', ...event('off')],
      ['sensor.geschirrspuler_programm_abgebrochen', ...event('off')],
    ],
    expected: {
      kind: 'dishwasher',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.geschirrspuler_betriebszustand',
        progress: 'sensor.geschirrspuler_programmfortschritt',
        finish: 'sensor.geschirrspuler_programmende',
        door: 'sensor.geschirrspuler_tur',
        remote: 'binary_sensor.geschirrspuler_fernstart',
        program: 'select.geschirrspuler_ausgewahltes_programm',
        launch: 'select.geschirrspuler_aktives_programm',
        pause: 'button.geschirrspuler_programm_pausieren',
        resume: 'button.geschirrspuler_programm_fortsetzen',
        stop: 'button.geschirrspuler_programm_stoppen',
        power: 'switch.geschirrspuler_strom',
        error: 'sensor.geschirrspuler_programm_abgebrochen',
      },
    },
  };
};

/** The same dishwasher, done an hour ago, its door shut since it was loaded, ready for its next programme. */
export const hcDishwasherDone: FixtureAt = (now) => {
  const running = hcDishwasher(now);
  const done: Readonly<Record<string, Seed>> = {
    'sensor.geschirrspuler_betriebszustand': [
      'sensor.geschirrspuler_betriebszustand',
      'finished',
      {},
      60 * 60,
    ],
    'sensor.geschirrspuler_programmende': [
      'sensor.geschirrspuler_programmende',
      minutesFrom(now, -60),
      { device_class: 'timestamp' },
    ],
    'sensor.geschirrspuler_tur': [
      'sensor.geschirrspuler_tur',
      'closed',
      { device_class: 'enum' },
      3 * 3600,
    ],
  };
  return {
    ...running,
    title: 'Home Connect dishwasher, done an hour ago',
    states: running.states.map((seed) => done[seed[0]] ?? seed),
    expected: { kind: 'dishwasher', status: 'finished', listed: true },
  };
};

/** An oven heating to 180 °C: 142 °C inside, its light, its setpoint to set. */
export const hcOven: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'hc-oven');
  return {
    title: 'Home Connect oven, preheating',
    platform: PLATFORM,
    device: device('hc-oven', 'Backofen', 'HBG7741B1', 'Bosch'),
    entities: [
      e('sensor.backofen_betriebszustand', 'operation_state'),
      e('sensor.backofen_aktuelle_garraumtemperatur', 'oven_current_cavity_temperature'),
      e('number.backofen_temperatur', 'setpoint_temperature'),
      e('sensor.backofen_vorheizen_beendet', 'preheat_finished'),
      e('select.backofen_ausgewahltes_programm', 'selected_program'),
      e('light.backofen_innenbeleuchtung', 'internal_light'),
      e('button.backofen_programm_stoppen', 'stop_program'),
      e('switch.backofen_strom', 'power'),
    ],
    states: [
      ['sensor.backofen_betriebszustand', 'run', {}, 9 * 60],
      [
        'sensor.backofen_aktuelle_garraumtemperatur',
        '142',
        { device_class: 'temperature', unit_of_measurement: '°C' },
      ],
      [
        'number.backofen_temperatur',
        '180',
        { unit_of_measurement: '°C', min: 30, max: 300, step: 5 },
      ],
      ['sensor.backofen_vorheizen_beendet', ...event('off')],
      [
        'select.backofen_ausgewahltes_programm',
        'cooking_oven_program_heating_mode_hot_air',
        {
          options: [
            'cooking_oven_program_heating_mode_hot_air',
            'cooking_oven_program_heating_mode_top_bottom_heating',
            'cooking_oven_program_heating_mode_pizza_setting',
          ],
        },
      ],
      ['light.backofen_innenbeleuchtung', 'off'],
      ['button.backofen_programm_stoppen', 'unknown'],
      ['switch.backofen_strom', 'on'],
    ],
    expected: {
      kind: 'oven',
      status: 'running',
      listed: true,
      roles: {
        temperature: 'sensor.backofen_aktuelle_garraumtemperatur',
        target: 'number.backofen_temperatur',
        preheated: 'sensor.backofen_vorheizen_beendet',
        light: 'light.backofen_innenbeleuchtung',
      },
    },
  };
};

/** A coffee machine at rest: its counters, descaling due, its beans container seen to and still empty. */
export const hcCoffee: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'hc-coffee');
  return {
    title: 'Home Connect coffee machine, descale due',
    platform: PLATFORM,
    device: device('hc-coffee', 'Kaffeevollautomat', 'TI9573X1RW', 'Siemens'),
    entities: [
      e('sensor.kaffeevollautomat_betriebszustand', 'operation_state'),
      e('sensor.kaffeevollautomat_kaffees', 'coffee_counter', { entity_category: 'diagnostic' }),
      e('sensor.kaffeevollautomat_milchkaffees', 'coffee_and_milk_counter', {
        entity_category: 'diagnostic',
      }),
      e('sensor.kaffeevollautomat_entkalken', 'device_should_be_descaled'),
      e('sensor.kaffeevollautomat_wassertank_leer', 'water_tank_empty'),
      e('sensor.kaffeevollautomat_bohnenbehalter_leer', 'bean_container_empty'),
      e('switch.kaffeevollautomat_strom', 'power'),
    ],
    states: [
      ['sensor.kaffeevollautomat_betriebszustand', 'ready'],
      ['sensor.kaffeevollautomat_kaffees', '1234', { state_class: 'total_increasing' }],
      ['sensor.kaffeevollautomat_milchkaffees', '512', { state_class: 'total_increasing' }],
      ['sensor.kaffeevollautomat_entkalken', ...event('present', 2 * 24 * 3600)],
      ['sensor.kaffeevollautomat_wassertank_leer', ...event('off')],
      ['sensor.kaffeevollautomat_bohnenbehalter_leer', ...event('confirmed', 600)],
      ['switch.kaffeevollautomat_strom', 'on'],
    ],
    expected: { kind: 'coffee', status: 'idle', listed: true },
  };
};

/** A fridge freezer: its two setpoints, the fridge door open three minutes, its super modes. */
export const hcFridge: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'hc-fridge');
  const setpoint = (value: string, min: number, max: number) =>
    [value, { device_class: 'temperature', unit_of_measurement: '°C', min, max, step: 1 }] as const;
  return {
    title: 'Home Connect fridge freezer, its door open three minutes',
    platform: PLATFORM,
    device: device('hc-fridge', 'Kühl-Gefrier-Kombination', 'KGN39AIBT', 'Bosch'),
    entities: [
      e(
        'number.kuhl_gefrier_kombination_kuhlschranktemperatur',
        'refrigerator_setpoint_temperature',
      ),
      e('number.kuhl_gefrier_kombination_gefrierschranktemperatur', 'freezer_setpoint_temperature'),
      e('binary_sensor.kuhl_gefrier_kombination_kuhlschranktur', 'refrigerator_door'),
      e('binary_sensor.kuhl_gefrier_kombination_gefrierschranktur', 'freezer_door'),
      e('switch.kuhl_gefrier_kombination_super_kuhlen', 'refrigerator_super_mode'),
      e('switch.kuhl_gefrier_kombination_super_gefrieren', 'freezer_super_mode'),
      e('switch.kuhl_gefrier_kombination_eco_modus', 'eco_mode'),
      e('switch.kuhl_gefrier_kombination_urlaubsmodus', 'vacation_mode'),
    ],
    states: [
      ['number.kuhl_gefrier_kombination_kuhlschranktemperatur', ...setpoint('4', 2, 8)],
      ['number.kuhl_gefrier_kombination_gefrierschranktemperatur', ...setpoint('-18', -24, -16)],
      [
        'binary_sensor.kuhl_gefrier_kombination_kuhlschranktur',
        'on',
        { device_class: 'door' },
        180,
      ],
      ['binary_sensor.kuhl_gefrier_kombination_gefrierschranktur', 'off', { device_class: 'door' }],
      ['switch.kuhl_gefrier_kombination_super_kuhlen', 'on'],
      ['switch.kuhl_gefrier_kombination_super_gefrieren', 'off'],
      ['switch.kuhl_gefrier_kombination_eco_modus', 'off'],
      ['switch.kuhl_gefrier_kombination_urlaubsmodus', 'off'],
    ],
    expected: { kind: 'fridge', listed: true },
  };
};

/** Home Connect's robot vacuum: an operation state, a progress and buttons, and no vacuum entity — only its own keys say what it is. */
export const hcRobot: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'hc-robot');
  return {
    title: 'Home Connect robot vacuum',
    platform: PLATFORM,
    device: device('hc-robot', 'Roxxter', 'BCR1ACG1', 'Bosch'),
    entities: [
      e('sensor.roxxter_betriebszustand', 'operation_state'),
      e('sensor.roxxter_programmfortschritt', 'program_progress'),
      e('button.roxxter_programm_pausieren', 'pause_program'),
      e('binary_sensor.roxxter_verloren', 'lost'),
      e('binary_sensor.roxxter_angehoben', 'lifted'),
      e('select.roxxter_aktuelle_karte', 'current_map'),
    ],
    states: [
      ['sensor.roxxter_betriebszustand', 'run'],
      ['sensor.roxxter_programmfortschritt', '40', { unit_of_measurement: '%' }],
      ['button.roxxter_programm_pausieren', 'unknown'],
      ['binary_sensor.roxxter_verloren', 'off'],
      ['binary_sensor.roxxter_angehoben', 'off'],
      [
        'select.roxxter_aktuelle_karte',
        'consumer_products_cleaning_robot_enum_type_available_maps_map_1',
      ],
    ],
    expected: { excluded: 'vacuum', listed: false },
  };
};
