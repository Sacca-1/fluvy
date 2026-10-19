import { device, entriesFor, minutesFrom, type FixtureAt } from './house.js';

/*
 * The community's integrations, from HACS, read by the ends of their ids and never written to: hOn (gvigroux/hon:
 * "<nickname> <name>" in English, base.py:102; its states are numbers, translations/en.json), Electrolux and AEG
 * (albaintor/homeassistant_electrolux_status: "<brand>_<name>_<source>_<attribute>" run together, entity.py:84-95; its
 * words title-cased, sensor.py:77-80), LG's older SmartThinQ (ollo69/ha-smartthinq-sensors: "<device> <name>", its
 * times "H:MM:SS", device_helpers.py:81-98; its model ends in its type, __init__.py:471).
 */

/** An hOn washer running: its mode "2", 35 minutes left. */
export const honWasher: FixtureAt = (now) => {
  const e = entriesFor('hon', 'hon-washer');
  return {
    title: 'hOn washer, running',
    platform: 'hon',
    device: device('hon-washer', 'Haier Waschmaschine', 'HW80-B14979', 'Haier'),
    entities: [
      e('sensor.haier_waschmaschine_mode', 'wash_mode'),
      e('sensor.haier_waschmaschine_program_phase', 'wash_program_phase'),
      e('sensor.haier_waschmaschine_remaining_time'),
      e('sensor.haier_waschmaschine_end_time'),
      e('sensor.haier_waschmaschine_start_time'),
      e('sensor.haier_waschmaschine_program_name', 'programs_wm'),
      e('binary_sensor.haier_waschmaschine_door_status'),
      e('binary_sensor.haier_waschmaschine_remote_control'),
    ],
    states: [
      ['sensor.haier_waschmaschine_mode', '2', {}, 50 * 60],
      ['sensor.haier_waschmaschine_program_phase', '3'],
      [
        'sensor.haier_waschmaschine_remaining_time',
        '35',
        { device_class: 'duration', unit_of_measurement: 'min' },
      ],
      ['sensor.haier_waschmaschine_end_time', minutesFrom(now, 35), { device_class: 'timestamp' }],
      [
        'sensor.haier_waschmaschine_start_time',
        minutesFrom(now, -50),
        { device_class: 'timestamp' },
      ],
      ['sensor.haier_waschmaschine_program_name', 'cotton'],
      ['binary_sensor.haier_waschmaschine_door_status', 'off', { device_class: 'door' }],
      ['binary_sensor.haier_waschmaschine_remote_control', 'on'],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.haier_waschmaschine_mode',
        phase: 'sensor.haier_waschmaschine_program_phase',
        remaining: 'sensor.haier_waschmaschine_remaining_time',
        finish: 'sensor.haier_waschmaschine_end_time',
        program: 'sensor.haier_waschmaschine_program_name',
        door: 'binary_sensor.haier_waschmaschine_door_status',
        remote: 'binary_sensor.haier_waschmaschine_remote_control',
      },
    },
  };
};

/** An hOn dishwasher waiting for its delayed start: a dishwasher's "3" is that, a washer's a pause. */
export const honDishwasher: FixtureAt = () => {
  const e = entriesFor('hon', 'hon-dish');
  return {
    title: 'hOn dishwasher, its start delayed',
    platform: 'hon',
    device: device('hon-dish', 'Dish Washer', 'XIB 6B2D3FB', 'Candy'),
    entities: [e('sensor.dish_washer_mode', 'dishwasher_mode')],
    states: [['sensor.dish_washer_mode', '3']],
    expected: { kind: 'dishwasher', status: 'scheduled', listed: true },
  };
};

/** An AEG washer spinning, read by its ids: 30 minutes left in seconds, an hour run. */
export const electroluxWasher: FixtureAt = () => {
  const e = entriesFor('electrolux_status', 'aeg-washer');
  const seconds = { device_class: 'duration', unit_of_measurement: 's' };
  return {
    title: 'AEG washer, spinning (Electrolux)',
    platform: 'electrolux_status',
    device: device('aeg-washer', 'Waschmaschine', 'L9FEC96BS', 'AEG'),
    entities: [
      e('sensor.aeg_waschmaschine_appliancestate'),
      e('sensor.aeg_waschmaschine_cyclephase'),
      e('sensor.aeg_waschmaschine_timetoend'),
      e('sensor.aeg_waschmaschine_runningtime'),
      e('binary_sensor.aeg_waschmaschine_doorstate'),
      e('sensor.aeg_waschmaschine_remotecontrol'),
      e('select.aeg_waschmaschine_executecommand'),
      e('sensor.aeg_waschmaschine_userselections_programuid'),
      e('sensor.aeg_waschmaschine_totalcyclecounter'),
    ],
    states: [
      ['sensor.aeg_waschmaschine_appliancestate', 'Running', {}, 60 * 60],
      ['sensor.aeg_waschmaschine_cyclephase', 'Spin'],
      ['sensor.aeg_waschmaschine_timetoend', '1800', seconds],
      ['sensor.aeg_waschmaschine_runningtime', '3600', seconds],
      ['binary_sensor.aeg_waschmaschine_doorstate', 'off', { device_class: 'door' }],
      ['sensor.aeg_waschmaschine_remotecontrol', 'Enabled'],
      [
        'select.aeg_waschmaschine_executecommand',
        'Start',
        { options: ['Off', 'On', 'Pause', 'Resume', 'Start', 'Stopreset'] },
      ],
      ['sensor.aeg_waschmaschine_userselections_programuid', 'Cotton Pr Eco40 60'],
      ['sensor.aeg_waschmaschine_totalcyclecounter', '420'],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.aeg_waschmaschine_appliancestate',
        phase: 'sensor.aeg_waschmaschine_cyclephase',
        remaining: 'sensor.aeg_waschmaschine_timetoend',
        elapsed: 'sensor.aeg_waschmaschine_runningtime',
        door: 'binary_sensor.aeg_waschmaschine_doorstate',
        remote: 'sensor.aeg_waschmaschine_remotecontrol',
        operation: 'select.aeg_waschmaschine_executecommand',
        program: 'sensor.aeg_waschmaschine_userselections_programuid',
        cycles: 'sensor.aeg_waschmaschine_totalcyclecounter',
      },
    },
  };
};

/** An Electrolux fridge, read by its ids: its compartments' setpoints, a quick freeze, a water filter to change. */
export const electroluxFridge: FixtureAt = () => {
  const e = entriesFor('electrolux_status', 'elx-fridge');
  return {
    title: 'Electrolux fridge',
    platform: 'electrolux_status',
    device: device('elx-fridge', 'Kühlschrank', 'LNT7ME34X1', 'Electrolux'),
    entities: [
      e('number.electrolux_kuhlschrank_fridge_targettemperaturec'),
      e('number.electrolux_kuhlschrank_freezer_targettemperaturec'),
      e('switch.electrolux_kuhlschrank_freezer_fastmode'),
      e('sensor.electrolux_kuhlschrank_waterfilterstate'),
    ],
    states: [
      [
        'number.electrolux_kuhlschrank_fridge_targettemperaturec',
        '4',
        { unit_of_measurement: '°C', min: 1, max: 9 },
      ],
      [
        'number.electrolux_kuhlschrank_freezer_targettemperaturec',
        '-18',
        { unit_of_measurement: '°C', min: -24, max: -14 },
      ],
      ['switch.electrolux_kuhlschrank_freezer_fastmode', 'off'],
      ['sensor.electrolux_kuhlschrank_waterfilterstate', 'Change'],
    ],
    expected: { kind: 'fridge', listed: true },
  };
};

/** An LG washer on the older integration, rinsing: its times "H:MM:SS". */
export const smartthinqWasher: FixtureAt = () => {
  const e = entriesFor('smartthinq_sensors', 'stq-washer');
  return {
    title: 'LG washer on SmartThinQ, rinsing',
    platform: 'smartthinq_sensors',
    device: device('stq-washer', 'LG Waschmaschine', 'F4V5VYP0W (WASHER)', 'LG'),
    entities: [
      e('sensor.lg_waschmaschine'),
      e('sensor.lg_waschmaschine_run_state'),
      e('sensor.lg_waschmaschine_process_state'),
      e('sensor.lg_waschmaschine_current_course'),
      e('sensor.lg_waschmaschine_remaining_time'),
      e('sensor.lg_waschmaschine_initial_time'),
      e('sensor.lg_waschmaschine_error_message'),
      e('binary_sensor.lg_waschmaschine_door_open'),
      e('binary_sensor.lg_waschmaschine_remote_start'),
    ],
    states: [
      ['sensor.lg_waschmaschine', 'on'],
      ['sensor.lg_waschmaschine_run_state', 'Rinsing', {}, 10 * 60],
      ['sensor.lg_waschmaschine_process_state', 'Rinsing'],
      ['sensor.lg_waschmaschine_current_course', 'Cotton'],
      ['sensor.lg_waschmaschine_remaining_time', '0:35:00'],
      ['sensor.lg_waschmaschine_initial_time', '1:45:00'],
      ['sensor.lg_waschmaschine_error_message', 'No error'],
      ['binary_sensor.lg_waschmaschine_door_open', 'off', { device_class: 'door' }],
      ['binary_sensor.lg_waschmaschine_remote_start', 'on'],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.lg_waschmaschine_run_state',
        phase: 'sensor.lg_waschmaschine_process_state',
        program: 'sensor.lg_waschmaschine_current_course',
        remaining: 'sensor.lg_waschmaschine_remaining_time',
        total: 'sensor.lg_waschmaschine_initial_time',
        error: 'sensor.lg_waschmaschine_error_message',
        door: 'binary_sensor.lg_waschmaschine_door_open',
        remote: 'binary_sensor.lg_waschmaschine_remote_start',
      },
    },
  };
};
