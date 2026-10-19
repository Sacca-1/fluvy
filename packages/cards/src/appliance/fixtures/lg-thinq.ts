import { device, entriesFor, minutesFrom, type ApplianceFixture, type FixtureAt } from './house.js';

/*
 * LG ThinQ (Home Assistant's lg_thinq): its model ends in the device type (entity.py:47-50), a WashTower is two devices
 * named "<alias> washer" and "<alias> dryer" (coordinator.py:42-55), "Remaining time" is when the cycle ends
 * (sensor.py:407-410) and "Total time" its minutes (:373-377), washers and dryers have no door (binary_sensor.py:93-120),
 * a fridge's setpoints are "{location} temperature" numbers whose location stays the raw word (entity.py:58-66).
 */

const PLATFORM = 'lg_thinq';
const timestamp = { device_class: 'timestamp' };
const minutes = { device_class: 'duration', unit_of_measurement: 'min' };

/** A washer spinning: its finish time, its total, its remote start on. */
export const lgWasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'lg-washer');
  return {
    title: 'LG washer, spinning',
    platform: PLATFORM,
    device: device('lg-washer', 'Waschmaschine', 'F4WR709Y (DEVICE_WASHER)', 'LG Electronics'),
    entities: [
      e('sensor.waschmaschine_aktueller_status', 'current_state'),
      e('sensor.waschmaschine_restzeit', 'remain'),
      e('sensor.waschmaschine_gesamtzeit', 'total'),
      e('sensor.waschmaschine_verzogerter_start', 'relative_to_start_wm'),
      e('sensor.waschmaschine_zyklen', 'cycle_count'),
      e('binary_sensor.waschmaschine_fernstart', 'remote_control_enabled'),
      e('select.waschmaschine_betrieb', 'operation_mode'),
      e('switch.waschmaschine_strom', 'operation_power'),
      e('event.waschmaschine_benachrichtigung', 'notification'),
      e('event.waschmaschine_fehler', 'error'),
      e('sensor.waschmaschine_energie_heute', 'energy_usage_today'),
    ],
    states: [
      ['sensor.waschmaschine_aktueller_status', 'spinning', {}, 300],
      ['sensor.waschmaschine_restzeit', minutesFrom(now, 42), timestamp],
      ['sensor.waschmaschine_gesamtzeit', '120', minutes],
      ['sensor.waschmaschine_verzogerter_start', 'unknown', timestamp],
      ['sensor.waschmaschine_zyklen', '312'],
      ['binary_sensor.waschmaschine_fernstart', 'on'],
      ['select.waschmaschine_betrieb', 'start', { options: ['start', 'stop', 'power_off'] }],
      ['switch.waschmaschine_strom', 'on'],
      [
        'event.waschmaschine_benachrichtigung',
        minutesFrom(now, -26 * 60),
        { event_type: 'washing_is_complete', event_types: ['washing_is_complete', 'door_is_open'] },
      ],
      [
        'event.waschmaschine_fehler',
        minutesFrom(now, -3 * 24 * 60),
        { event_type: 'unbalanced_load_error' },
      ],
      [
        'sensor.waschmaschine_energie_heute',
        '410',
        { device_class: 'energy', unit_of_measurement: 'Wh' },
      ],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.waschmaschine_aktueller_status',
        finish: 'sensor.waschmaschine_restzeit',
        total: 'sensor.waschmaschine_gesamtzeit',
        start_at: 'sensor.waschmaschine_verzogerter_start',
        cycles: 'sensor.waschmaschine_zyklen',
        remote: 'binary_sensor.waschmaschine_fernstart',
        operation: 'select.waschmaschine_betrieb',
        power: 'switch.waschmaschine_strom',
        notification: 'event.waschmaschine_benachrichtigung',
        error: 'event.waschmaschine_fehler',
      },
    },
  };
};

/**
 * A dryer that finished 40 minutes ago and powered off, as LG's dryers do: its notification says it completed, and it
 * has no door to say it was unloaded.
 */
export const lgDryer: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'lg-dryer');
  return {
    title: 'LG dryer, done and off',
    platform: PLATFORM,
    device: device('lg-dryer', 'Trockner', 'RC90V9AV4Q (DEVICE_DRYER)', 'LG Electronics'),
    entities: [
      e('sensor.trockner_aktueller_status', 'current_state'),
      e('sensor.trockner_restzeit', 'remain'),
      e('sensor.trockner_gesamtzeit', 'total'),
      e('binary_sensor.trockner_fernstart', 'remote_control_enabled'),
      e('select.trockner_betrieb', 'operation_mode'),
      e('event.trockner_benachrichtigung', 'notification'),
    ],
    states: [
      ['sensor.trockner_aktueller_status', 'power_off', {}, 25 * 60],
      ['sensor.trockner_restzeit', 'unknown', timestamp],
      ['sensor.trockner_gesamtzeit', '0', minutes],
      ['binary_sensor.trockner_fernstart', 'off'],
      [
        'select.trockner_betrieb',
        'unknown',
        { options: ['start', 'stop', 'power_off', 'wake_up'] },
      ],
      [
        'event.trockner_benachrichtigung',
        minutesFrom(now, -40),
        { event_type: 'drying_is_complete', event_types: ['drying_is_complete'] },
        40 * 60,
      ],
    ],
    expected: { kind: 'dryer', status: 'finished', listed: true },
  };
};

/** A WashTower: one appliance, two devices, each named for its half. */
export const lgWashTower: (now: number) => readonly ApplianceFixture[] = () => {
  const half = (
    id: string,
    name: string,
    kind: 'washer' | 'dryer',
    state: string,
  ): ApplianceFixture => {
    const e = entriesFor(PLATFORM, id);
    return {
      title: `LG WashTower, its ${kind}`,
      platform: PLATFORM,
      device: device(id, name, 'WKEX200HBA (DEVICE_WASHTOWER)', 'LG Electronics'),
      entities: [
        e(`sensor.${name.toLowerCase().replace(/ /g, '_')}_aktueller_status`, 'current_state'),
        e(`select.${name.toLowerCase().replace(/ /g, '_')}_betrieb`, 'operation_mode'),
      ],
      states: [
        [`sensor.${name.toLowerCase().replace(/ /g, '_')}_aktueller_status`, state],
        [
          `select.${name.toLowerCase().replace(/ /g, '_')}_betrieb`,
          'stop',
          { options: ['start', 'stop'] },
        ],
      ],
      expected: { kind, listed: true },
    };
  };
  return [
    half('lg-tower-washer', 'Turm washer', 'washer', 'rinsing'),
    half('lg-tower-dryer', 'Turm dryer', 'dryer', 'standby'),
  ];
};

/** A WashCombo: the main drum washes and dries, the mini below it only washes. */
export const lgWashCombo: (now: number) => readonly ApplianceFixture[] = () =>
  (
    [
      ['lg-combo-main', 'Kombi', 'WM6998HBA (DEVICE_WASHCOMBO_MAIN)', 'washer_dryer'],
      ['lg-combo-mini', 'Kombi Mini', 'WM6998HBA (DEVICE_WASHCOMBO_MINI)', 'washer'],
    ] as const
  ).map(([id, name, model, kind]) => {
    const object = name.toLowerCase().replace(/ /g, '_');
    const e = entriesFor(PLATFORM, id);
    return {
      title: `LG WashCombo, ${name}`,
      platform: PLATFORM,
      device: device(id, name, model, 'LG Electronics'),
      entities: [e(`sensor.${object}_aktueller_status`, 'current_state')],
      states: [[`sensor.${object}_aktueller_status`, 'initial']],
      expected: { kind, status: 'idle', listed: true },
    };
  });

/** A fridge: its compartments' setpoints by their raw location, a door ajar, its quick modes, a water filter nearly spent. */
export const lgFridge: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'lg-fridge');
  const setpoint = (value: string, min: number, max: number) =>
    [value, { device_class: 'temperature', unit_of_measurement: '°C', min, max, step: 1 }] as const;
  return {
    title: 'LG fridge, its door ajar',
    platform: PLATFORM,
    device: device(
      'lg-fridge',
      'Kühlschrank',
      'GBB92STAXP (DEVICE_REFRIGERATOR)',
      'LG Electronics',
    ),
    entities: [
      e('number.kuhlschrank_fridge_temperatur', 'target_temperature_for_location'),
      e('number.kuhlschrank_freezer_temperatur', 'target_temperature_for_location'),
      e('binary_sensor.kuhlschrank_tur'),
      e('switch.kuhlschrank_express_kuhlen', 'express_fridge'),
      e('switch.kuhlschrank_schnellgefrieren', 'rapid_freeze'),
      e('sensor.kuhlschrank_wasserfilter', 'water_filter_1_remain_percent'),
      e('select.kuhlschrank_frischluftfilter', 'fresh_air_filter'),
    ],
    states: [
      ['number.kuhlschrank_fridge_temperatur', ...setpoint('4', 1, 7)],
      ['number.kuhlschrank_freezer_temperatur', ...setpoint('-18', -23, -15)],
      ['binary_sensor.kuhlschrank_tur', 'on', { device_class: 'door' }, 90],
      ['switch.kuhlschrank_express_kuhlen', 'off'],
      ['switch.kuhlschrank_schnellgefrieren', 'on'],
      ['sensor.kuhlschrank_wasserfilter', '8', { unit_of_measurement: '%' }],
      [
        'select.kuhlschrank_frischluftfilter',
        'auto',
        { options: ['auto', 'off', 'power', 'replace'] },
      ],
    ],
    expected: { kind: 'fridge', listed: true, roles: { door: 'binary_sensor.kuhlschrank_tur' } },
  };
};

/** A dishwasher: its door, its course, its rinse aid running out. */
export const lgDishwasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'lg-dish');
  return {
    title: 'LG dishwasher, rinse aid low',
    platform: PLATFORM,
    device: device('lg-dish', 'Spülmaschine', 'DFB425FP (DEVICE_DISH_WASHER)', 'LG Electronics'),
    entities: [
      e('sensor.spulmaschine_aktueller_status', 'current_state'),
      e('sensor.spulmaschine_aktuelles_programm', 'current_dish_washing_course'),
      e('sensor.spulmaschine_restzeit', 'remain'),
      e('binary_sensor.spulmaschine_tur'),
      e('binary_sensor.spulmaschine_klarspuler_auffullen', 'rinse_refill'),
      e('binary_sensor.spulmaschine_fernstart', 'remote_control_enabled'),
    ],
    states: [
      ['sensor.spulmaschine_aktueller_status', 'drying'],
      ['sensor.spulmaschine_aktuelles_programm', 'eco'],
      ['sensor.spulmaschine_restzeit', minutesFrom(now, 15), timestamp],
      ['binary_sensor.spulmaschine_tur', 'off', { device_class: 'door' }],
      ['binary_sensor.spulmaschine_klarspuler_auffullen', 'on', {}, 3600],
      ['binary_sensor.spulmaschine_fernstart', 'off'],
    ],
    expected: { kind: 'dishwasher', status: 'running', listed: true },
  };
};

/** What LG makes that is not an appliance here: its robot and stick vacuums, and (until 1.10) its Styler and kimchi fridge. */
export const lgNotAppliances: (now: number) => readonly ApplianceFixture[] = () =>
  (
    [
      ['lg-robot', 'Robo', 'R9MASTER (DEVICE_ROBOT_CLEANER)', 'vacuum'],
      ['lg-stick', 'Stab', 'A9K (DEVICE_STICK_CLEANER)', 'vacuum'],
      ['lg-styler', 'Styler', 'S3WF (DEVICE_STYLER)', 'styler'],
      ['lg-kimchi', 'Kimchi', 'K410 (DEVICE_KIMCHI_REFRIGERATOR)', 'kimchi'],
    ] as const
  ).map(([id, name, model, excluded]) => {
    const e = entriesFor(PLATFORM, id);
    const object = name.toLowerCase();
    return {
      title: `LG ${name}`,
      platform: PLATFORM,
      device: device(id, name, model, 'LG Electronics'),
      entities: [e(`sensor.${object}_aktueller_status`, 'current_state')],
      states: [[`sensor.${object}_aktueller_status`, 'working']],
      expected: { excluded, listed: false },
    };
  });
