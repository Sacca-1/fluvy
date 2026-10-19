import { device, entriesFor, minutesFrom, type ApplianceFixture, type FixtureAt } from './house.js';

/*
 * Miele (Home Assistant's miele): its model is the appliance's type in English (entity.py:59-72, const.py
 * DEVICE_TYPE_TAGS), and a device the person has not named is named for it too — a coffee machine is the "Coffee
 * system", and every id it has begins so. Its status and programme phase (sensor.py, strings.json), its times in
 * minutes, its tanks in percent, its start, pause and stop buttons (button.py:58-100), its compartments as climates
 * (climate.py:126-215).
 */

const PLATFORM = 'miele';
const minutes = { device_class: 'duration', unit_of_measurement: 'min' };

/** A washing machine rinsing: 42 minutes left, 63 run, its TwinDos tank low. */
export const mieleWasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'miele-washer');
  return {
    title: 'Miele washing machine, rinsing',
    platform: PLATFORM,
    device: device('miele-washer', 'Miele Waschmaschine', 'Washing machine', 'Miele'),
    entities: [
      e('sensor.miele_waschmaschine_status', 'status'),
      e('sensor.miele_waschmaschine_programmphase', 'program_phase'),
      e('sensor.miele_waschmaschine_programm', 'program_id'),
      e('sensor.miele_waschmaschine_restzeit', 'remaining_time'),
      e('sensor.miele_waschmaschine_verstrichene_zeit', 'elapsed_time'),
      e('sensor.miele_waschmaschine_ende', 'finish'),
      e('sensor.miele_waschmaschine_schleuderdrehzahl', 'spin_speed'),
      e('sensor.miele_waschmaschine_energieverbrauch', 'energy_consumption'),
      e('sensor.miele_waschmaschine_twindos_1_fullstand', 'twin_dos_1_level'),
      e('button.miele_waschmaschine_start', 'start'),
      e('button.miele_waschmaschine_pause', 'pause'),
      e('button.miele_waschmaschine_stopp', 'stop'),
      e('switch.miele_waschmaschine_strom', 'power'),
      e('binary_sensor.miele_waschmaschine_fernsteuerung', 'remote_control'),
      e('binary_sensor.miele_waschmaschine_mobilstart', 'mobile_start'),
      e('binary_sensor.miele_waschmaschine_tur'),
      e('binary_sensor.miele_waschmaschine_storung', 'failure'),
      e('sensor.miele_waschmaschine_firmware_version', undefined, {
        entity_category: 'diagnostic',
      }),
    ],
    states: [
      ['sensor.miele_waschmaschine_status', 'in_use', {}, 63 * 60],
      ['sensor.miele_waschmaschine_programmphase', 'rinses', {}, 6 * 60],
      ['sensor.miele_waschmaschine_programm', 'cottons'],
      ['sensor.miele_waschmaschine_restzeit', '42', minutes],
      ['sensor.miele_waschmaschine_verstrichene_zeit', '63', minutes],
      ['sensor.miele_waschmaschine_ende', minutesFrom(now, 42), { device_class: 'timestamp' }],
      ['sensor.miele_waschmaschine_schleuderdrehzahl', '1400', { unit_of_measurement: 'rpm' }],
      [
        'sensor.miele_waschmaschine_energieverbrauch',
        '0.6',
        { device_class: 'energy', unit_of_measurement: 'kWh' },
      ],
      ['sensor.miele_waschmaschine_twindos_1_fullstand', '15', { unit_of_measurement: '%' }],
      ['button.miele_waschmaschine_start', 'unavailable'],
      ['button.miele_waschmaschine_pause', 'unknown'],
      ['button.miele_waschmaschine_stopp', 'unknown'],
      ['switch.miele_waschmaschine_strom', 'on'],
      ['binary_sensor.miele_waschmaschine_fernsteuerung', 'on'],
      ['binary_sensor.miele_waschmaschine_mobilstart', 'on'],
      ['binary_sensor.miele_waschmaschine_tur', 'off', { device_class: 'door' }, 64 * 60],
      ['binary_sensor.miele_waschmaschine_storung', 'off', { device_class: 'problem' }],
      ['sensor.miele_waschmaschine_firmware_version', '31.17'],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.miele_waschmaschine_status',
        phase: 'sensor.miele_waschmaschine_programmphase',
        program: 'sensor.miele_waschmaschine_programm',
        remaining: 'sensor.miele_waschmaschine_restzeit',
        elapsed: 'sensor.miele_waschmaschine_verstrichene_zeit',
        finish: 'sensor.miele_waschmaschine_ende',
        spin: 'sensor.miele_waschmaschine_schleuderdrehzahl',
        energy: 'sensor.miele_waschmaschine_energieverbrauch',
        start: 'button.miele_waschmaschine_start',
        pause: 'button.miele_waschmaschine_pause',
        stop: 'button.miele_waschmaschine_stopp',
        power: 'switch.miele_waschmaschine_strom',
        remote: 'binary_sensor.miele_waschmaschine_mobilstart',
        door: 'binary_sensor.miele_waschmaschine_tur',
        error: 'binary_sensor.miele_waschmaschine_storung',
      },
    },
  };
};

/**
 * The "Coffee system": a coffee machine nobody renamed, every id beginning "coffee_system" — a system's word, which
 * must never read as one of the integration's system entities.
 */
export const mieleCoffee: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'miele-coffee');
  return {
    title: 'Miele coffee system, at rest',
    platform: PLATFORM,
    device: device('miele-coffee', 'Coffee system', 'Coffee system', 'Miele'),
    entities: [
      e('sensor.coffee_system_status', 'status'),
      e('sensor.coffee_system_program_phase', 'program_phase'),
      e('sensor.coffee_system_descaling_cycles', 'descaling_counter'),
      e('switch.coffee_system_power', 'power'),
      e('button.coffee_system_stop', 'stop'),
      e('light.coffee_system_light', 'light'),
    ],
    states: [
      ['sensor.coffee_system_status', 'on'],
      ['sensor.coffee_system_program_phase', 'not_running'],
      ['sensor.coffee_system_descaling_cycles', '12'],
      ['switch.coffee_system_power', 'on'],
      ['button.coffee_system_stop', 'unavailable'],
      ['light.coffee_system_light', 'off'],
    ],
    expected: {
      kind: 'coffee',
      status: 'idle',
      listed: true,
      roles: {
        state: 'sensor.coffee_system_status',
        phase: 'sensor.coffee_system_program_phase',
        power: 'switch.coffee_system_power',
        stop: 'button.coffee_system_stop',
        light: 'light.coffee_system_light',
      },
    },
  };
};

/** A fridge freezer: its two compartments as climates, super cooling on. */
export const mieleFridge: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'miele-fridge');
  const climate = (current: number, target: number, min: number, max: number) =>
    [
      'cool',
      {
        current_temperature: current,
        temperature: target,
        min_temp: min,
        max_temp: max,
        target_temp_step: 1,
        hvac_modes: ['cool'],
      },
    ] as const;
  return {
    title: 'Miele fridge freezer, super cooling',
    platform: PLATFORM,
    device: device('miele-fridge', 'Kühl-Gefrierkombination', 'Fridge freezer', 'Miele'),
    entities: [
      e('climate.kuhl_gefrierkombination_kuhlschrank', 'refrigerator'),
      e('climate.kuhl_gefrierkombination_gefrierschrank', 'freezer'),
      e('switch.kuhl_gefrierkombination_superkuhlen', 'supercooling'),
      e('switch.kuhl_gefrierkombination_supergefrieren', 'superfreezing'),
      e('sensor.kuhl_gefrierkombination_status', 'status'),
      e('binary_sensor.kuhl_gefrierkombination_tur'),
    ],
    states: [
      ['climate.kuhl_gefrierkombination_kuhlschrank', ...climate(4.2, 4, 1, 9)],
      ['climate.kuhl_gefrierkombination_gefrierschrank', ...climate(-18.4, -18, -26, -14)],
      ['switch.kuhl_gefrierkombination_superkuhlen', 'on'],
      ['switch.kuhl_gefrierkombination_supergefrieren', 'off'],
      ['sensor.kuhl_gefrierkombination_status', 'supercooling'],
      ['binary_sensor.kuhl_gefrierkombination_tur', 'off', { device_class: 'door' }],
    ],
    expected: { kind: 'fridge', listed: true },
  };
};

/** A four-plate hob, two plates on. */
export const mieleHob: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'miele-hob');
  return {
    title: 'Miele hob, two plates on',
    platform: PLATFORM,
    device: device('miele-hob', 'Kochfeld', 'Hob', 'Miele'),
    entities: [
      e('sensor.kochfeld_status', 'status'),
      ...[1, 2, 3, 4].map((n) => e(`sensor.kochfeld_kochzone_${n}`, 'plate')),
    ],
    states: [
      ['sensor.kochfeld_status', 'in_use'],
      ['sensor.kochfeld_kochzone_1', 'plate_step_7'],
      ['sensor.kochfeld_kochzone_2', 'plate_step_0'],
      ['sensor.kochfeld_kochzone_3', 'plate_step_3'],
      ['sensor.kochfeld_kochzone_4', 'plate_step_0'],
    ],
    expected: { kind: 'hob', listed: true },
  };
};

/** What Miele makes that is not an appliance here: its robot vacuum, and (until 1.10) its warming drawer. */
export const mieleNotAppliances: (now: number) => readonly ApplianceFixture[] = () =>
  (
    [
      ['miele-robot', 'Scout', 'Robot vacuum cleaner', 'vacuum'],
      ['miele-drawer', 'Wärmeschublade', 'Warming drawer', 'warming_drawer'],
    ] as const
  ).map(([id, name, model, excluded]) => {
    const e = entriesFor(PLATFORM, id);
    return {
      title: `Miele ${model.toLowerCase()}`,
      platform: PLATFORM,
      device: device(id, name, model, 'Miele'),
      entities: [e(`sensor.${id.replace('-', '_')}_status`, 'status')],
      states: [[`sensor.${id.replace('-', '_')}_status`, 'in_use']],
      expected: { excluded, listed: false },
    };
  });
