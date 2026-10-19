import { device, entriesFor, minutesFrom, type FixtureAt } from './house.js';

/*
 * Whirlpool (Home Assistant's whirlpool): a washer's and a dryer's cycle states and end time, its bulk detergent tank
 * (sensor.py), an oven's state, temperatures, cook mode, stop button and light per cavity — a double oven's suffixed
 * "_upper" and "_lower" (entity.py:80-86) — and a fridge's temperature level (select.py:49-50).
 */

const PLATFORM = 'whirlpool';

/** A washer rinsing, its detergent tank at a quarter. */
export const whirlpoolWasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'wp-washer');
  return {
    title: 'Whirlpool washer, rinsing, its tank at a quarter',
    platform: PLATFORM,
    device: device('wp-washer', 'Whirlpool Waschmaschine', 'WTW8127LW', 'Whirlpool'),
    entities: [
      e('sensor.whirlpool_waschmaschine_zustand', 'washer_state'),
      e('sensor.whirlpool_waschmaschine_endzeit', 'end_time'),
      e('sensor.whirlpool_waschmaschine_waschmittelstand', 'whirlpool_tank'),
      e('binary_sensor.whirlpool_waschmaschine_tur'),
    ],
    states: [
      ['sensor.whirlpool_waschmaschine_zustand', 'cycle_rinsing', {}, 5 * 60],
      [
        'sensor.whirlpool_waschmaschine_endzeit',
        minutesFrom(now, 25),
        { device_class: 'timestamp' },
      ],
      ['sensor.whirlpool_waschmaschine_waschmittelstand', '25'],
      ['binary_sensor.whirlpool_waschmaschine_tur', 'off', { device_class: 'door' }],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.whirlpool_waschmaschine_zustand',
        finish: 'sensor.whirlpool_waschmaschine_endzeit',
      },
    },
  };
};

/** A dryer done. */
export const whirlpoolDryer: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'wp-dryer');
  return {
    title: 'Whirlpool dryer, done',
    platform: PLATFORM,
    device: device('wp-dryer', 'Whirlpool Trockner', 'WED8127LW', 'Whirlpool'),
    entities: [
      e('sensor.whirlpool_trockner_zustand', 'dryer_state'),
      e('sensor.whirlpool_trockner_endzeit', 'end_time'),
    ],
    states: [
      ['sensor.whirlpool_trockner_zustand', 'complete', {}, 50 * 60],
      ['sensor.whirlpool_trockner_endzeit', 'unknown', { device_class: 'timestamp' }],
    ],
    expected: { kind: 'dryer', status: 'finished', listed: true },
  };
};

/** A double oven: the upper cavity preheating to 200 °C, the lower one cooking at 180 °C. */
export const whirlpoolOven: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'wp-oven');
  const celsius = (value: string) =>
    [value, { device_class: 'temperature', unit_of_measurement: '°C' }] as const;
  const target = (value: string) =>
    [value, { unit_of_measurement: '°C', min: 77, max: 288, step: 1 }] as const;
  return {
    title: 'Whirlpool double oven, the upper preheating, the lower cooking',
    platform: PLATFORM,
    device: device('wp-oven', 'Herd', 'WOD51HZES', 'Whirlpool'),
    entities: [
      e('sensor.herd_zustand_oben', 'oven_state_upper'),
      e('sensor.herd_aktuelle_temperatur_oben', 'oven_current_temperature_upper'),
      e('number.herd_zieltemperatur_oben', 'oven_target_temperature_upper'),
      e('select.herd_garmodus_oben', 'oven_cook_mode_upper'),
      e('button.herd_stopp_oben', 'oven_stop_upper'),
      e('light.herd_licht_oben', 'oven_light_upper'),
      e('sensor.herd_zustand_unten', 'oven_state_lower'),
      e('sensor.herd_aktuelle_temperatur_unten', 'oven_current_temperature_lower'),
      e('number.herd_zieltemperatur_unten', 'oven_target_temperature_lower'),
      e('button.herd_stopp_unten', 'oven_stop_lower'),
    ],
    states: [
      ['sensor.herd_zustand_oben', 'preheating', {}, 8 * 60],
      ['sensor.herd_aktuelle_temperatur_oben', ...celsius('150')],
      ['number.herd_zieltemperatur_oben', ...target('200')],
      [
        'select.herd_garmodus_oben',
        'bake',
        { options: ['bake', 'convection_bake', 'broil', 'standby'] },
      ],
      ['button.herd_stopp_oben', 'unknown'],
      ['light.herd_licht_oben', 'off'],
      ['sensor.herd_zustand_unten', 'cooking', {}, 40 * 60],
      ['sensor.herd_aktuelle_temperatur_unten', ...celsius('179')],
      ['number.herd_zieltemperatur_unten', ...target('180')],
      ['button.herd_stopp_unten', 'unknown'],
    ],
    expected: {
      kind: 'oven',
      status: 'preheating',
      listed: true,
      roles: {
        state: 'sensor.herd_zustand_oben',
        temperature: 'sensor.herd_aktuelle_temperatur_oben',
        target: 'number.herd_zieltemperatur_oben',
        program: 'select.herd_garmodus_oben',
        stop: 'button.herd_stopp_oben',
        light: 'light.herd_licht_oben',
      },
    },
  };
};

/** A fridge set by its temperature level. */
export const whirlpoolFridge: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'wp-fridge');
  return {
    title: 'Whirlpool fridge, by its level',
    platform: PLATFORM,
    device: device('wp-fridge', 'Whirlpool Kühlschrank', 'WRS325SDHZ', 'Whirlpool'),
    entities: [e('select.whirlpool_kuhlschrank_temperaturstufe', 'refrigerator_temperature_level')],
    states: [
      ['select.whirlpool_kuhlschrank_temperaturstufe', '3', { options: ['1', '2', '3', '4', '5'] }],
    ],
    expected: { kind: 'fridge', listed: true },
  };
};
