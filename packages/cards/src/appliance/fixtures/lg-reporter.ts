import { device, entriesFor, minutesFrom, type ApplianceFixture } from './house.js';

/*
 * The reporter's LG house (#47, his dumps of 2026-10-19), as given: his ids, attributes and options — the oven's
 * device named "Woven" (his typo), its temperatures in °F, the fridge's in °C — on both integrations he runs. LG's older
 * integration (ollo69/ha-smartthinq-sensors) hangs an aggregate sensor on each device, saying the whole cycle in its
 * attributes, with a sensor or a binary sensor per feature beside it (the times, the tub-clean count and the cooktop's
 * burners are off by default: he turned the times on); the core one (lg_thinq) says each feature as an enum with its
 * options, and its washer is out of reach while its remote start is off. Each appliance is a device on each, as Home
 * Assistant registers them, named as he named it, its model unsaid (his dumps say none): what it is comes from what
 * its integration says, never from "Woven". `reporterHouse` is the house as dumped; `reporterAtWork` the same devices
 * with a cycle under way — the dishwasher rinsing with 1:12 left, the washer spinning, the oven's upper cavity
 * preheating from 350 °F to 425 °F, the fridge's express cool on — each alone in its house.
 */

const OLDER = 'smartthinq_sensors';
const CORE = 'lg_thinq';
const timestamp = { device_class: 'timestamp' };
const minutes = { device_class: 'duration', unit_of_measurement: 'min' };
const enumOf = (options: readonly string[]) => ({ device_class: 'enum', options });

/** The core integration's options, as his dumps list them. */
const DISHWASHER_STATES = [
  'cancel',
  'rinsing',
  'running',
  'drying',
  'pause',
  'reserved',
  'power_fail',
  'error',
  'power_off',
  'night_dry',
  'initial',
  'end',
];
const DISHWASHER_CYCLES = [
  'turbo',
  'heavy',
  'auto',
  'refresh',
  'normal',
  'express',
  'rinse',
  'machine_clean',
  'download_cycle',
  'delicate',
];
const WASHER_STATES = [
  'sleep',
  'power_off',
  'spinning',
  'steam_softening',
  'end',
  'drying',
  'detecting',
  'running',
  'rinsing',
  'cool_down',
  'rinse_hold',
  'refreshing',
  'error',
  'initial',
  'reserved',
  'pause',
];
const OVEN_STATES = [
  'initial',
  'cooking_in_progress',
  'preheating',
  'cleaning_is_done',
  'cooling',
  'cleaning',
  'done',
];
const LEVELS = (prefix: string): string[] => [0, 1, 2, 3, 4].map((n) => `${prefix}_${n}`);
/** The older integration's course select, his washer's sixteen. */
const COURSES = [
  'Current course',
  'Cotton',
  'Easy Care',
  'Cotton+',
  'Duvet',
  'Stain Care',
  'Mix',
  'Sports Wear',
  'Silent Wash',
  'Gentle Care',
  'Speed 14',
  'Tub Clean',
  'Delicate',
  'Baby Steam Care/Baby Care',
  'Allergy Care/Hygiene',
];

const DISHWASHER = 'rep-dish';
const WASHER = 'rep-washer';
const OVEN = 'rep-oven';
const FRIDGE = 'rep-fridge';
const thinq = (id: string): string => `${id}-thinq`;

type Builder = (now: number, busy: boolean) => ApplianceFixture;

/** His dishwasher on the older integration: the aggregate sensor, its features beside it, its door open at rest. */
const olderDishwasher: Builder = (_now, busy) => {
  const e = entriesFor(OLDER, DISHWASHER);
  const course = busy ? 'Auto' : '-';
  const state = busy ? 'Rinsing' : '-';
  const remain = busy ? '1:12:00' : '0:00:00';
  const initial = busy ? '2:45:00' : '0:00:00';
  const door = busy ? 'off' : 'on';
  return {
    title: `LG · the reporter’s dishwasher (SmartThinQ)${busy ? ', rinsing' : ''}`,
    platform: OLDER,
    device: device(DISHWASHER, 'Dishwasher', null, 'LG'),
    entities: [
      e('sensor.dishwasher'),
      e('sensor.dishwasher_current_course'),
      e('sensor.dishwasher_run_state'),
      e('sensor.dishwasher_process_state'),
      e('sensor.dishwasher_error_message'),
      e('sensor.dishwasher_tub_clean_counter'),
      e('sensor.dishwasher_initial_time'),
      e('sensor.dishwasher_remaining_time'),
      e('sensor.dishwasher_countdown_time'),
      e('binary_sensor.dishwasher_door_open'),
      e('binary_sensor.dishwasher_auto_door'),
      e('binary_sensor.dishwasher_child_lock'),
      e('binary_sensor.dishwasher_dual_zone'),
      e('binary_sensor.dishwasher_error_state'),
      e('binary_sensor.dishwasher_run_completed'),
      e('binary_sensor.dishwasher_half_load'),
      e('binary_sensor.dishwasher_rinse_refill'),
      e('binary_sensor.dishwasher_salt_refill'),
      e('binary_sensor.dishwasher_extra_dry'),
      e('binary_sensor.dishwasher_high_temp'),
      e('binary_sensor.dishwasher_night_dry'),
      e('binary_sensor.dishwasher_steam'),
    ],
    states: [
      [
        'sensor.dishwasher',
        busy ? 'on' : 'off',
        {
          run_completed: 'off',
          error_state: 'off',
          start_time: null,
          end_time: null,
          initial_time: initial,
          remain_time: remain,
          reserve_time: '0:00:00',
          current_course: course,
          run_state: state,
          process_state: state,
          half_load: 'off',
          error_message: '-',
          tubclean_count: 49,
          auto_door: 'on',
          child_lock: 'off',
          delay_start: 'off',
          door_open: door,
          dual_zone: 'off',
          energy_saver: 'off',
          extra_dry: 'off',
          high_temp: 'off',
          night_dry: 'off',
          rinse_refill: 'off',
          salt_refill: 'off',
          steam: 'off',
          icon: 'cil:dishwasher-silverware',
          supported_features: 0,
        },
      ],
      ['sensor.dishwasher_current_course', course],
      ['sensor.dishwasher_run_state', state, {}, busy ? 15 * 60 : 7200],
      ['sensor.dishwasher_process_state', state],
      ['sensor.dishwasher_error_message', '-'],
      ['sensor.dishwasher_tub_clean_counter', '49', { icon: 'mdi:pipe-leak' }],
      ['sensor.dishwasher_initial_time', initial],
      ['sensor.dishwasher_remaining_time', remain],
      ['sensor.dishwasher_countdown_time', '0:00:00'],
      ['binary_sensor.dishwasher_door_open', door, { device_class: 'opening' }],
      ['binary_sensor.dishwasher_auto_door', 'on'],
      ['binary_sensor.dishwasher_child_lock', 'off'],
      ['binary_sensor.dishwasher_dual_zone', 'off'],
      ['binary_sensor.dishwasher_error_state', 'off', { device_class: 'problem' }],
      ['binary_sensor.dishwasher_run_completed', 'off'],
      ['binary_sensor.dishwasher_half_load', 'off'],
      ['binary_sensor.dishwasher_rinse_refill', 'off'],
      ['binary_sensor.dishwasher_salt_refill', 'off'],
      ['binary_sensor.dishwasher_extra_dry', 'off'],
      ['binary_sensor.dishwasher_high_temp', 'off', { device_class: 'heat' }],
      ['binary_sensor.dishwasher_night_dry', 'off'],
      ['binary_sensor.dishwasher_steam', 'off'],
    ],
    expected: {
      kind: 'dishwasher',
      status: busy ? 'running' : 'off',
      listed: true,
      roles: {
        state: 'sensor.dishwasher_run_state',
        phase: 'sensor.dishwasher_process_state',
        program: 'sensor.dishwasher_current_course',
        remaining: 'sensor.dishwasher_remaining_time',
        total: 'sensor.dishwasher_initial_time',
        start_in: 'sensor.dishwasher_countdown_time',
        error: 'sensor.dishwasher_error_message',
        completed: 'binary_sensor.dishwasher_run_completed',
        door: 'binary_sensor.dishwasher_door_open',
        power: 'sensor.dishwasher',
      },
    },
  };
};

/** His dishwasher on the core integration: its status and cycle as enums, its rinse aid's level, its reminders on. */
const coreDishwasher: Builder = (now, busy) => {
  const e = entriesFor(CORE, thinq(DISHWASHER));
  return {
    title: `LG · the reporter’s dishwasher (ThinQ)${busy ? ', rinsing' : ''}`,
    platform: CORE,
    device: device(thinq(DISHWASHER), 'Dishwasher', null, 'LG'),
    entities: [
      e('sensor.dishwasher_current_status', 'current_state'),
      e('sensor.dishwasher_current_cycle', 'current_dish_washing_course'),
      e('sensor.dishwasher_rinse_aid_dispenser_level', 'rinse_level'),
      e('sensor.dishwasher_softening_level', 'softening_level'),
      e('sensor.dishwasher_total_time', 'total'),
      e('sensor.dishwasher_delayed_start', 'relative_to_start'),
      e('sensor.dishwasher_remaining_time_2', 'remain'),
      e('binary_sensor.dishwasher_door'),
      e('binary_sensor.dishwasher_rinse_refill_needed', 'rinse_refill'),
      e('binary_sensor.dishwasher_machine_clean_reminder', 'machine_clean_reminder'),
      e('binary_sensor.dishwasher_clean_indicator_light', 'clean_light_reminder'),
      e('binary_sensor.dishwasher_chime_sound', 'chime_sound'),
      e('event.dishwasher_error', 'error'),
      e('event.dishwasher_notification', 'notification'),
    ],
    states: [
      [
        'sensor.dishwasher_current_status',
        busy ? 'rinsing' : 'power_off',
        enumOf(DISHWASHER_STATES),
        busy ? 15 * 60 : 7200,
      ],
      ['sensor.dishwasher_current_cycle', 'auto', enumOf(DISHWASHER_CYCLES)],
      ['sensor.dishwasher_rinse_aid_dispenser_level', 'rinselevel_2', enumOf(LEVELS('rinselevel'))],
      ['sensor.dishwasher_softening_level', 'softeninglevel_4', enumOf(LEVELS('softeninglevel'))],
      ['sensor.dishwasher_total_time', busy ? '165' : 'unknown', minutes],
      ['sensor.dishwasher_delayed_start', 'unknown', timestamp],
      ['sensor.dishwasher_remaining_time_2', busy ? minutesFrom(now, 72) : 'unknown', timestamp],
      ['binary_sensor.dishwasher_door', busy ? 'off' : 'on', { device_class: 'door' }],
      ['binary_sensor.dishwasher_rinse_refill_needed', 'off'],
      ['binary_sensor.dishwasher_machine_clean_reminder', 'on'],
      ['binary_sensor.dishwasher_clean_indicator_light', 'on'],
      ['binary_sensor.dishwasher_chime_sound', 'on'],
      ['event.dishwasher_error', 'unknown', { event_type: null }],
      [
        'event.dishwasher_notification',
        minutesFrom(now, -15 * 60),
        {
          event_type: 'cleaning_is_complete',
          event_types: ['cleaning_is_complete', 'door_is_open'],
        },
      ],
    ],
    expected: {
      kind: 'dishwasher',
      status: busy ? 'running' : 'off',
      listed: true,
      roles: {
        state: 'sensor.dishwasher_current_status',
        program: 'sensor.dishwasher_current_cycle',
        total: 'sensor.dishwasher_total_time',
        start_at: 'sensor.dishwasher_delayed_start',
        finish: 'sensor.dishwasher_remaining_time_2',
        door: 'binary_sensor.dishwasher_door',
        error: 'event.dishwasher_error',
        notification: 'event.dishwasher_notification',
      },
    },
  };
};

/** His washer on the older integration: its settings as sensors, its controls out of reach (remote start off). */
const olderWasher: Builder = (_now, busy) => {
  const e = entriesFor(OLDER, WASHER);
  const course = busy ? 'Cotton' : '-';
  const state = busy ? 'Spinning' : '-';
  const remain = busy ? '0:09:00' : '0:00:00';
  const initial = busy ? '1:30:00' : '0:00:00';
  const setting = (value: string): string => (busy ? value : '-');
  return {
    title: `LG · the reporter’s washer (SmartThinQ)${busy ? ', spinning' : ''}`,
    platform: OLDER,
    device: device(WASHER, 'Washer', null, 'LG'),
    entities: [
      e('sensor.washer'),
      e('sensor.washer_current_course'),
      e('sensor.washer_run_state'),
      e('sensor.washer_pre_state'),
      e('sensor.washer_spin_speed'),
      e('sensor.washer_water_temp'),
      e('sensor.washer_rinse_mode'),
      e('sensor.washer_error_message'),
      e('sensor.washer_tub_clean_counter'),
      e('sensor.washer_initial_time'),
      e('sensor.washer_remaining_time'),
      e('sensor.washer_countdown_time'),
      e('binary_sensor.washer_run_completed'),
      e('binary_sensor.washer_error_state'),
      e('binary_sensor.washer_standby'),
      e('binary_sensor.washer_child_lock'),
      e('binary_sensor.washer_door_lock'),
      e('binary_sensor.washer_remote_start'),
      e('select.washer_course_selection'),
      e('switch.washer_power'),
      e('button.washer_remote_start'),
      e('button.washer_pause'),
    ],
    states: [
      [
        'sensor.washer',
        busy ? 'on' : 'off',
        {
          run_completed: 'off',
          error_state: 'off',
          start_time: null,
          end_time: null,
          initial_time: initial,
          remain_time: remain,
          reserve_time: '0:00:00',
          current_course: course,
          run_state: state,
          pre_state: '-',
          error_message: '-',
          spin_speed: setting('High'),
          water_temp: setting('40'),
          rinse_mode: setting('Normal'),
          tubclean_count: 'N/A',
          standby: 'off',
          child_lock: 'off',
          crease_care: 'off',
          door_lock: busy ? 'on' : 'off',
          medic_rinse: 'off',
          pre_wash: 'off',
          remote_start: 'off',
          turbo_wash: 'off',
          assumed_state: true,
          icon: 'mdi:washing-machine',
          supported_features: 1,
        },
      ],
      ['sensor.washer_current_course', course],
      ['sensor.washer_run_state', state, {}, busy ? 80 * 60 : 7200],
      ['sensor.washer_pre_state', '-'],
      ['sensor.washer_spin_speed', setting('High')],
      ['sensor.washer_water_temp', setting('40')],
      ['sensor.washer_rinse_mode', setting('Normal')],
      ['sensor.washer_error_message', '-'],
      ['sensor.washer_tub_clean_counter', 'N/A', { assumed_state: true }],
      ['sensor.washer_initial_time', initial],
      ['sensor.washer_remaining_time', remain],
      ['sensor.washer_countdown_time', '0:00:00'],
      ['binary_sensor.washer_run_completed', 'off'],
      ['binary_sensor.washer_error_state', 'off', { device_class: 'problem' }],
      ['binary_sensor.washer_standby', 'off'],
      ['binary_sensor.washer_child_lock', 'off'],
      ['binary_sensor.washer_door_lock', busy ? 'on' : 'off'],
      ['binary_sensor.washer_remote_start', 'off'],
      ['select.washer_course_selection', 'unavailable', { options: COURSES }],
      ['switch.washer_power', 'unavailable'],
      ['button.washer_remote_start', 'unavailable', { device_class: 'update' }],
      ['button.washer_pause', 'unavailable', { device_class: 'update' }],
    ],
    expected: {
      kind: 'washer',
      status: busy ? 'running' : 'off',
      listed: true,
      roles: {
        state: 'sensor.washer_run_state',
        program: 'sensor.washer_current_course',
        remaining: 'sensor.washer_remaining_time',
        total: 'sensor.washer_initial_time',
        start_in: 'sensor.washer_countdown_time',
        error: 'sensor.washer_error_message',
        completed: 'binary_sensor.washer_run_completed',
        remote: 'binary_sensor.washer_remote_start',
        spin: 'sensor.washer_spin_speed',
        wash_temperature: 'sensor.washer_water_temp',
        power: 'sensor.washer',
      },
    },
  };
};

/** His washer on the core integration: everything out of reach while its remote start is off; at work, all there. */
const coreWasher: Builder = (now, busy) => {
  const e = entriesFor(CORE, thinq(WASHER));
  const gone = 'unavailable';
  return {
    title: `LG · the reporter’s washer (ThinQ)${busy ? ', spinning' : ', out of reach'}`,
    platform: CORE,
    device: device(thinq(WASHER), 'Washer', null, 'LG'),
    entities: [
      e('sensor.washer_current_status', 'current_state'),
      e('sensor.washer_total_time', 'total'),
      e('sensor.washer_delayed_end', 'relative_to_stop_wm'),
      e('sensor.washer_remaining_time_2', 'remain'),
      e('binary_sensor.washer_remote_start_2', 'remote_control_enabled'),
      e('select.washer_operation', 'operation_mode'),
      e('number.washer_delayed_end', 'relative_hour_to_stop_wm'),
      e('event.washer_error', 'error'),
      e('event.washer_notification', 'notification'),
    ],
    states: [
      [
        'sensor.washer_current_status',
        busy ? 'spinning' : gone,
        enumOf(WASHER_STATES),
        busy ? 80 * 60 : 7200,
      ],
      ['sensor.washer_total_time', busy ? '90' : gone, minutes],
      ['sensor.washer_delayed_end', busy ? 'unknown' : gone, timestamp],
      ['sensor.washer_remaining_time_2', busy ? minutesFrom(now, 9) : gone, timestamp],
      ['binary_sensor.washer_remote_start_2', busy ? 'on' : gone],
      [
        'select.washer_operation',
        busy ? 'start' : gone,
        { options: ['start', 'stop', 'power_off', 'wake_up'] },
      ],
      [
        'number.washer_delayed_end',
        busy ? '0' : gone,
        { unit_of_measurement: 'h', min: 0, max: 19 },
      ],
      ['event.washer_error', busy ? 'unknown' : gone, { event_type: null }],
      [
        'event.washer_notification',
        busy ? minutesFrom(now, -26 * 60) : gone,
        { event_type: 'washing_is_complete', event_types: ['washing_is_complete'] },
      ],
    ],
    expected: {
      kind: 'washer',
      status: busy ? 'running' : 'offline',
      listed: true,
      roles: {
        state: 'sensor.washer_current_status',
        total: 'sensor.washer_total_time',
        finish: 'sensor.washer_remaining_time_2',
        remote: 'binary_sensor.washer_remote_start_2',
        operation: 'select.washer_operation',
        error: 'event.washer_error',
        notification: 'event.washer_notification',
      },
    },
  };
};

/** His range on the older integration, "Woven": its cavities and burners in its sensor's attributes alone, in °F. */
const olderOven: Builder = (_now, busy) => {
  const e = entriesFor(OLDER, OVEN);
  const power = { device_class: 'power' };
  return {
    title: `LG · the reporter’s oven (SmartThinQ)${busy ? ', preheating' : ''}`,
    platform: OLDER,
    device: device(OVEN, 'Woven', null, 'LG'),
    entities: [
      e('sensor.woven'),
      e('binary_sensor.woven_cooktop_state'),
      e('binary_sensor.woven_oven_state'),
    ],
    states: [
      [
        'sensor.woven',
        busy ? 'on' : 'off',
        {
          oven_upper_state: busy ? 'Preheating' : 'off',
          oven_upper_mode: busy ? 'Bake' : '-',
          oven_upper_current_temp: busy ? 350 : null,
          oven_upper_target_temp: busy ? 425 : null,
          oven_lower_state: 'off',
          oven_lower_mode: '-',
          oven_lower_current_temp: null,
          oven_lower_target_temp: null,
          cooktop_left_front_state: busy ? 'on' : 'off',
          cooktop_left_rear_state: 'off',
          cooktop_center_state: 'off',
          cooktop_right_front_state: 'off',
          cooktop_right_rear_state: 'off',
          oven_temp_unit: '°F',
          icon: 'mdi:stove',
          supported_features: 0,
        },
      ],
      ['binary_sensor.woven_cooktop_state', busy ? 'on' : 'off', power],
      ['binary_sensor.woven_oven_state', busy ? 'on' : 'off', power],
    ],
    expected: {
      kind: 'oven',
      status: busy ? 'preheating' : 'off',
      listed: true,
      roles: {
        state: 'sensor.woven#oven_upper_state',
        program: 'sensor.woven#oven_upper_mode',
        temperature: 'sensor.woven#oven_upper_current_temp',
        target: 'sensor.woven#oven_upper_target_temp',
        power: 'sensor.woven',
      },
    },
  };
};

/** His range on the core integration: its upper cavity's status, operation and temperature by their location. */
const coreOven: Builder = (now, busy) => {
  const e = entriesFor(CORE, thinq(OVEN));
  return {
    title: `LG · the reporter’s oven (ThinQ)${busy ? ', preheating' : ''}`,
    platform: CORE,
    device: device(thinq(OVEN), 'Woven', null, 'LG'),
    entities: [
      e('sensor.woven_upper_current_status', 'current_state_for_location'),
      e('select.woven_upper_operation', 'operation_mode_for_location'),
      e('binary_sensor.woven_upper_remote_start', 'remote_control_enabled_for_location'),
      e('sensor.woven_upper_temperature', 'temperature_state_for_location'),
      e('event.woven_notification', 'notification'),
    ],
    states: [
      [
        'sensor.woven_upper_current_status',
        busy ? 'preheating' : 'initial',
        enumOf(OVEN_STATES),
        busy ? 4 * 60 : 7200,
      ],
      ['select.woven_upper_operation', 'unknown', { options: ['stop'] }],
      ['binary_sensor.woven_upper_remote_start', busy ? 'on' : 'off'],
      [
        'sensor.woven_upper_temperature',
        busy ? '350' : '0',
        { device_class: 'temperature', unit_of_measurement: '°F' },
      ],
      [
        'event.woven_notification',
        minutesFrom(now, -13 * 60),
        { event_type: 'preheating_is_complete', event_types: ['preheating_is_complete'] },
      ],
    ],
    expected: {
      kind: 'oven',
      status: busy ? 'preheating' : 'idle',
      listed: true,
      roles: {
        state: 'sensor.woven_upper_current_status',
        operation: 'select.woven_upper_operation',
        remote: 'binary_sensor.woven_upper_remote_start',
        temperature: 'sensor.woven_upper_temperature',
        notification: 'event.woven_notification',
      },
    },
  };
};

/** His fridge on the older integration: two climates with one mode, the temperatures as sensors, the door twice. */
const olderFridge: Builder = (_now, busy) => {
  const e = entriesFor(OLDER, FRIDGE);
  const celsius = { device_class: 'temperature', unit_of_measurement: '°C' };
  const climate = (temperature: number, min: number, max: number, icon: string) => ({
    hvac_modes: ['auto'],
    temperature,
    min_temp: min,
    max_temp: max,
    target_temp_step: 1,
    current_temperature: null,
    icon,
    supported_features: 1,
  });
  return {
    title: `LG · the reporter’s fridge (SmartThinQ)${busy ? ', express cool' : ''}`,
    platform: OLDER,
    device: device(FRIDGE, 'Fridge', null, 'LG'),
    entities: [
      e('sensor.fridge'),
      e('climate.fridge_fridge'),
      e('climate.fridge_freezer'),
      e('sensor.fridge_fridge_temp'),
      e('sensor.fridge_freezer_temp'),
      e('binary_sensor.fridge_door_open'),
      e('binary_sensor.fridge_eco_friendly'),
      e('switch.fridge_eco_friendly'),
      e('switch.fridge_express_mode_2'),
      e('switch.fridge_express_cool'),
    ],
    states: [
      [
        'sensor.fridge',
        'on',
        {
          fridge_temp: 5,
          freezer_temp: -16,
          temp_unit: '°C',
          door_open: 'off',
          eco_friendly: 'off',
          express_cool: busy ? 'on' : 'off',
          express_freeze: 'off',
          icon: 'mdi:fridge-outline',
          supported_features: 0,
        },
      ],
      ['climate.fridge_fridge', 'auto', climate(5, 1, 7, 'mdi:fridge-top')],
      ['climate.fridge_freezer', 'auto', climate(-16, -23, -15, 'mdi:fridge-bottom')],
      ['sensor.fridge_fridge_temp', '5', celsius],
      ['sensor.fridge_freezer_temp', '-16', celsius],
      ['binary_sensor.fridge_door_open', 'off', { device_class: 'door' }],
      ['binary_sensor.fridge_eco_friendly', 'off'],
      ['switch.fridge_eco_friendly', 'off'],
      ['switch.fridge_express_mode_2', 'off'],
      ['switch.fridge_express_cool', busy ? 'on' : 'off'],
    ],
    expected: {
      kind: 'fridge',
      status: 'idle',
      listed: true,
      roles: { door: 'binary_sensor.fridge_door_open', power: 'sensor.fridge' },
    },
  };
};

/** His fridge on the core integration: its setpoints by their location, its door, its express modes. */
const coreFridge: Builder = (now, busy) => {
  const e = entriesFor(CORE, thinq(FRIDGE));
  const setpoint = (value: string, min: number, max: number) =>
    [value, { device_class: 'temperature', unit_of_measurement: '°C', min, max, step: 1 }] as const;
  return {
    title: `LG · the reporter’s fridge (ThinQ)${busy ? ', express cool' : ''}`,
    platform: CORE,
    device: device(thinq(FRIDGE), 'Fridge', null, 'LG'),
    entities: [
      e('number.fridge_fridge_temperature', 'target_temperature_for_location'),
      e('number.fridge_freezer_temperature', 'target_temperature_for_location'),
      e('binary_sensor.fridge_door'),
      e('switch.fridge_express_fridge', 'express_fridge'),
      e('switch.fridge_express_mode', 'express_mode'),
      e('event.fridge_notification', 'notification'),
    ],
    states: [
      ['number.fridge_fridge_temperature', ...setpoint('5', 1, 7)],
      ['number.fridge_freezer_temperature', ...setpoint('-16', -23, -15)],
      ['binary_sensor.fridge_door', 'off', { device_class: 'door' }],
      ['switch.fridge_express_fridge', busy ? 'on' : 'off'],
      ['switch.fridge_express_mode', 'off'],
      [
        'event.fridge_notification',
        minutesFrom(now, -8 * 24 * 60),
        { event_type: 'door_is_open', event_types: ['door_is_open'] },
      ],
    ],
    expected: {
      kind: 'fridge',
      status: 'idle',
      listed: true,
      roles: { door: 'binary_sensor.fridge_door', notification: 'event.fridge_notification' },
    },
  };
};

const BUILDERS: readonly Builder[] = [
  olderDishwasher,
  coreDishwasher,
  olderWasher,
  coreWasher,
  olderOven,
  coreOven,
  olderFridge,
  coreFridge,
];

/** The reporter's house as he dumped it: eight devices, four appliances on two integrations, all at rest. */
export const reporterHouse = (now: number): readonly ApplianceFixture[] =>
  BUILDERS.map((build) => build(now, false));

/** The same devices with a cycle under way, each alone in its house (its ids are the house's). */
export const reporterAtWork = (now: number): readonly ApplianceFixture[] =>
  BUILDERS.map((build) => build(now, true));
