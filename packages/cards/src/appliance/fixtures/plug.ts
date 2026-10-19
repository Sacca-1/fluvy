import { device, entriesFor, type ApplianceFixture, type FixtureAt } from './house.js';

/*
 * An appliance on a smart plug, as most "smart" washers are: a switch and its power reading on a device whose name
 * says what it powers. Its cycle is read from the plug's power by the card; discovery only has to know it is one. A
 * plug whose name says nothing is a plug.
 */

/** A washer on a plug, drawing 420 W. */
export const plugWasher: FixtureAt = () => {
  const e = entriesFor('shelly', 'plug-washer');
  return {
    title: 'A washer on a plug',
    platform: 'shelly',
    device: device('plug-washer', 'Waschmaschine Keller', 'Shelly Plus Plug S', 'Shelly'),
    entities: [
      e('switch.waschmaschine_keller'),
      e('sensor.waschmaschine_keller_leistung'),
      e('sensor.waschmaschine_keller_energie'),
      e('button.waschmaschine_keller_neustart', undefined, { entity_category: 'config' }),
      e('update.waschmaschine_keller_firmware', undefined, { entity_category: 'config' }),
    ],
    states: [
      ['switch.waschmaschine_keller', 'on'],
      [
        'sensor.waschmaschine_keller_leistung',
        '420',
        { device_class: 'power', unit_of_measurement: 'W' },
      ],
      [
        'sensor.waschmaschine_keller_energie',
        '182.4',
        { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' },
      ],
      ['button.waschmaschine_keller_neustart', 'unknown'],
      ['update.waschmaschine_keller_firmware', 'off'],
    ],
    expected: {
      kind: 'washer',
      status: 'idle',
      listed: true,
      roles: {
        power: 'switch.waschmaschine_keller',
        watts: 'sensor.waschmaschine_keller_leistung',
        energy: 'sensor.waschmaschine_keller_energie',
      },
    },
  };
};

/**
 * A fridge on a plug, its compressor resting (0.9 W): it never finishes, whatever its power says — it is in operation
 * while switched on. Alone in its house (a card's tests put it there, and the playground a frame of its own).
 */
export const plugFridge: FixtureAt = () => {
  const e = entriesFor('shelly', 'plug-fridge');
  return {
    title: 'A fridge on a plug',
    platform: 'shelly',
    device: device('plug-fridge', 'Kühlschrank Keller', 'Shelly Plus Plug S', 'Shelly'),
    entities: [
      e('switch.kuhlschrank_keller'),
      e('sensor.kuhlschrank_keller_leistung'),
      e('sensor.kuhlschrank_keller_energie'),
    ],
    states: [
      ['switch.kuhlschrank_keller', 'on'],
      [
        'sensor.kuhlschrank_keller_leistung',
        '0.9',
        { device_class: 'power', unit_of_measurement: 'W' },
      ],
      [
        'sensor.kuhlschrank_keller_energie',
        '41.2',
        { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' },
      ],
    ],
    expected: {
      kind: 'fridge',
      status: 'idle',
      listed: true,
      roles: {
        power: 'switch.kuhlschrank_keller',
        watts: 'sensor.kuhlschrank_keller_leistung',
        energy: 'sensor.kuhlschrank_keller_energie',
      },
    },
  };
};

/** Plugs that are only plugs: one named for nothing, one powering a hair dryer. */
export const plainPlugs: (now: number) => readonly ApplianceFixture[] = () =>
  (
    [
      ['plug-hall', 'Steckdose Flur', undefined],
      ['plug-hair', 'Haartrockner', 'name'],
    ] as const
  ).map(([id, name, excluded]) => {
    const e = entriesFor('shelly', id);
    const object = id.replace('-', '_');
    return {
      title: `A plug: ${name}`,
      platform: 'shelly',
      device: device(id, name, 'Shelly Plus Plug S', 'Shelly'),
      entities: [e(`switch.${object}`), e(`sensor.${object}_power`)],
      states: [
        [`switch.${object}`, 'on'],
        [`sensor.${object}_power`, '12', { device_class: 'power', unit_of_measurement: 'W' }],
      ],
      expected: { ...(excluded ? { excluded } : {}), listed: false },
    };
  });
