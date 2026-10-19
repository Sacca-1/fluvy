import { device, entriesFor, minutesFrom, type ApplianceFixture, type FixtureAt } from './house.js';

/*
 * Matter (Home Assistant's matter): an appliance's operational state, the phase it names itself and its estimated end
 * (sensor.py:1311-1385), its start, pause, resume and stop buttons (button.py:70-115), its power switch
 * (switch.py:301-330); a compartment's setpoint carries no word for what it is (number.py:616-636), so its range says
 * it; a robot vacuum shares the operational state, and an EV charger has its own keys.
 */

const PLATFORM = 'matter';

/** A dishwasher washing, half an hour to go. */
export const matterDishwasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'matter-dish');
  return {
    title: 'Matter dishwasher, washing',
    platform: PLATFORM,
    device: device('matter-dish', 'Spülmaschine Küche', 'DW-200', 'Acme'),
    entities: [
      e('sensor.spulmaschine_kuche_betriebszustand', 'operational_state'),
      e('sensor.spulmaschine_kuche_aktuelle_phase', 'current_phase'),
      e('sensor.spulmaschine_kuche_voraussichtliches_ende', 'estimated_end_time'),
      e('sensor.spulmaschine_kuche_betriebsfehler', 'operational_error', {
        entity_category: 'diagnostic',
      }),
      e('button.spulmaschine_kuche_start', 'start'),
      e('button.spulmaschine_kuche_pause', 'pause'),
      e('button.spulmaschine_kuche_fortsetzen', 'resume'),
      e('button.spulmaschine_kuche_stopp', 'stop'),
      e('binary_sensor.spulmaschine_kuche_zulauffehler', 'dishwasher_alarm_inflow'),
      e('select.spulmaschine_kuche_modus', 'mode'),
      e('switch.spulmaschine_kuche_strom', 'power'),
    ],
    states: [
      ['sensor.spulmaschine_kuche_betriebszustand', 'running', {}, 50 * 60],
      ['sensor.spulmaschine_kuche_aktuelle_phase', 'Washing'],
      [
        'sensor.spulmaschine_kuche_voraussichtliches_ende',
        minutesFrom(now, 30),
        { device_class: 'timestamp' },
      ],
      ['sensor.spulmaschine_kuche_betriebsfehler', 'no_error'],
      ['button.spulmaschine_kuche_start', 'unknown'],
      ['button.spulmaschine_kuche_pause', 'unknown'],
      ['button.spulmaschine_kuche_fortsetzen', 'unknown'],
      ['button.spulmaschine_kuche_stopp', 'unknown'],
      ['binary_sensor.spulmaschine_kuche_zulauffehler', 'off', { device_class: 'problem' }],
      ['select.spulmaschine_kuche_modus', 'Normal', { options: ['Normal', 'Heavy', 'Light'] }],
      ['switch.spulmaschine_kuche_strom', 'on'],
    ],
    expected: {
      kind: 'dishwasher',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.spulmaschine_kuche_betriebszustand',
        phase: 'sensor.spulmaschine_kuche_aktuelle_phase',
        finish: 'sensor.spulmaschine_kuche_voraussichtliches_ende',
        start: 'button.spulmaschine_kuche_start',
        pause: 'button.spulmaschine_kuche_pause',
        resume: 'button.spulmaschine_kuche_fortsetzen',
        stop: 'button.spulmaschine_kuche_stopp',
        program: 'select.spulmaschine_kuche_modus',
        power: 'switch.spulmaschine_kuche_strom',
      },
    },
  };
};

/** A washer paused mid-cycle. */
export const matterWasher: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'matter-washer');
  return {
    title: 'Matter washer, paused',
    platform: PLATFORM,
    device: device('matter-washer', 'Waschmaschine Bad', 'WM-100', 'Acme'),
    entities: [
      e('sensor.waschmaschine_bad_betriebszustand', 'operational_state'),
      e('select.waschmaschine_bad_schleuderdrehzahl', 'laundry_washer_spin_speed'),
      e('button.waschmaschine_bad_fortsetzen', 'resume'),
      e('button.waschmaschine_bad_stopp', 'stop'),
    ],
    states: [
      ['sensor.waschmaschine_bad_betriebszustand', 'paused'],
      ['select.waschmaschine_bad_schleuderdrehzahl', '1200', { options: ['800', '1200', '1400'] }],
      ['button.waschmaschine_bad_fortsetzen', 'unknown'],
      ['button.waschmaschine_bad_stopp', 'unknown'],
    ],
    expected: { kind: 'washer', status: 'paused', listed: true },
  };
};

/** A fridge: two compartments, each a setpoint named for nothing, told apart by their ranges. */
export const matterFridge: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'matter-fridge');
  return {
    title: 'Matter fridge, two compartments by their ranges',
    platform: PLATFORM,
    device: device('matter-fridge', 'Kühlschrank Garage', 'RF-300', 'Acme'),
    entities: [
      e('number.kuhlschrank_garage', 'temperature_setpoint'),
      e('number.kuhlschrank_garage_2', 'temperature_setpoint'),
      e('binary_sensor.kuhlschrank_garage_turalarm', 'alarm_door'),
      e('select.kuhlschrank_garage_modus', 'mode'),
    ],
    states: [
      ['number.kuhlschrank_garage', '4', { unit_of_measurement: '°C', min: 1, max: 7, step: 0.5 }],
      [
        'number.kuhlschrank_garage_2',
        '-18',
        { unit_of_measurement: '°C', min: -24, max: -15, step: 1 },
      ],
      ['binary_sensor.kuhlschrank_garage_turalarm', 'off', { device_class: 'problem' }],
      ['select.kuhlschrank_garage_modus', 'Normal', { options: ['Normal', 'Rapid cool'] }],
    ],
    expected: { kind: 'fridge', listed: true },
  };
};

/** What Matter has that is not an appliance here: a robot vacuum, an EV charger. */
export const matterNotAppliances: (now: number) => readonly ApplianceFixture[] = () => {
  const robot = entriesFor(PLATFORM, 'matter-robot');
  const charger = entriesFor(PLATFORM, 'matter-evse');
  return [
    {
      title: 'Matter robot vacuum',
      platform: PLATFORM,
      device: device('matter-robot', 'Saugroboter', 'RVC-1', 'Acme'),
      entities: [
        robot('vacuum.saugroboter'),
        robot('sensor.saugroboter_betriebszustand', 'operational_state'),
      ],
      states: [
        ['vacuum.saugroboter', 'cleaning'],
        ['sensor.saugroboter_betriebszustand', 'running'],
      ],
      expected: { excluded: 'vacuum', listed: false },
    },
    {
      title: 'Matter EV charger',
      platform: PLATFORM,
      device: device('matter-evse', 'Wallbox', 'EVSE-1', 'Acme'),
      entities: [
        charger('binary_sensor.wallbox_ladestatus', 'evse_charging_status'),
        charger('sensor.wallbox_betriebszustand', 'operational_state'),
      ],
      states: [
        ['binary_sensor.wallbox_ladestatus', 'on'],
        ['sensor.wallbox_betriebszustand', 'running'],
      ],
      expected: { excluded: 'charger', listed: false },
    },
  ];
};
