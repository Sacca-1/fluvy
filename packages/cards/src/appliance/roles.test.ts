import { describe, expect, it } from 'vitest';
import {
  allFixtures,
  houseOf,
  mieleCoffee,
  stOven,
  stWasher,
  whirlpoolOven,
} from './fixtures/index.js';
import {
  applianceDevice,
  applianceEntities,
  deviceSlug,
  partOf,
  roleOf,
  slugify,
  withoutSlug,
  type Candidate,
} from './roles.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const FIXTURES = allFixtures(NOW);
const HOUSE = houseOf(FIXTURES, NOW);

const candidate = (given: Partial<Candidate> & { id: string }): Candidate => ({
  domain: given.id.slice(0, given.id.indexOf('.')),
  key: undefined,
  object: given.id.slice(given.id.indexOf('.') + 1),
  ...given,
});

describe('an appliance’s entities', () => {
  it('are fixtures of one house: no two of its entities share an id', () => {
    const ids = FIXTURES.flatMap((fixture) => fixture.entities.map((entry) => entry.entity_id));
    expect(ids.length).toBe(new Set(ids).size);
    for (const fixture of FIXTURES)
      for (const [id] of fixture.states)
        expect(
          fixture.entities.map((entry) => entry.entity_id),
          fixture.title,
        ).toContain(id);
  });

  it.each(
    FIXTURES.filter((fixture) => fixture.expected.roles).map((fixture) => [fixture.title, fixture]),
  )('finds %s’s by its integration’s words, whatever language its ids are in', (_, fixture) => {
    const found = applianceEntities(HOUSE, fixture.device.id);
    expect(found.roles).toMatchObject(fixture.expected.roles ?? {});
  });

  it('never takes a system entity for a role, by its key or its id without the device’s name', () => {
    expect(
      roleOf(candidate({ id: 'button.x_firmware_update', key: 'firmware_update' })),
    ).toBeUndefined();
    expect(roleOf(candidate({ id: 'button.washer_reboot', object: 'reboot' }))).toBeUndefined();
    expect(
      roleOf(candidate({ id: 'button.washer_restart_system', object: 'restart_system' })),
    ).toBeUndefined();
    // a word of a name is not one: "update" inside another word, "system" inside the device's name
    expect(
      roleOf(candidate({ id: 'sensor.updater_state', object: 'updater_state', platform: 'x' })),
    ).toBe('state');
  });

  it('reads the "Coffee system" by its ids without its name: every id says "system", none is a system’s', () => {
    const found = applianceEntities(HOUSE, 'miele-coffee');
    expect(found.roles).toMatchObject(mieleCoffee(NOW).expected.roles ?? {});
    expect(found.counters).toEqual(['sensor.coffee_system_descaling_cycles']);
    // read whole, the id would be a system's
    expect(
      roleOf(
        candidate({
          id: 'sensor.coffee_system_status',
          object: 'coffee_system_status',
          platform: 'x',
        }),
      ),
    ).toBeUndefined();
  });

  it('knows a device’s slug by what its entities share, else by its name', () => {
    expect(
      deviceSlug(['coffee_system_status', 'coffee_system_power', 'coffee_system'], 'Mine'),
    ).toBe('coffee_system');
    // one entity alone: its name made an id
    expect(deviceSlug(['wasserkocher_status'], 'Wasserkocher')).toBe('wasserkocher');
    expect(slugify('Kühl-Gefrier-Kombination')).toBe('kuhl_gefrier_kombination');
    expect(slugify('Çamaşır makinesi')).toBe('camasir_makinesi');
    expect(withoutSlug('waschmaschine', 'waschmaschine')).toBe('');
    expect(withoutSlug('waschmaschine_run_state', 'waschmaschine')).toBe('run_state');
    expect(withoutSlug('other_state', 'waschmaschine')).toBe('other_state');
  });

  it('ranks its words: the integration’s own over a shared key, a key over an id, an id over what it is', () => {
    expect(
      partOf(
        candidate({ id: 'binary_sensor.w_mobilstart', key: 'mobile_start', platform: 'miele' }),
      ),
    ).toEqual({ role: 'remote', rank: 4 });
    expect(
      partOf(
        candidate({
          id: 'binary_sensor.w_fernsteuerung',
          key: 'remote_control',
          platform: 'miele',
        }),
      ),
    ).toEqual({ role: 'remote', rank: 3 });
    expect(
      partOf(candidate({ id: 'sensor.w_end_time', object: 'end_time', platform: 'x' })),
    ).toEqual({
      role: 'finish',
      rank: 2,
    });
    expect(
      partOf(
        candidate({ id: 'binary_sensor.w_tur', object: 'tur', deviceClass: 'door', platform: 'x' }),
      ),
    ).toEqual({ role: 'door', rank: 0 });
    // read strictly, what an entity is says nothing but a power reading (a plug's, anywhere)
    expect(
      roleOf(
        candidate({ id: 'binary_sensor.w_tur', object: 'tur', deviceClass: 'door' }),
        'strict',
      ),
    ).toBeUndefined();
    expect(roleOf(candidate({ id: 'sensor.w_power', unit: 'W' }), 'strict')).toBe('watts');
  });

  it('never acts through what Home Assistant files under diagnostics', () => {
    expect(
      roleOf(
        candidate({ id: 'button.w_stop', key: 'stop', platform: 'matter', category: 'diagnostic' }),
      ),
    ).toBeUndefined();
    expect(roleOf(candidate({ id: 'button.w_stop', key: 'stop', platform: 'matter' }))).toBe(
      'stop',
    );
  });

  it('reads a second drum or cavity apart: SmartThings’ upper washer, its second cavity, Whirlpool’s lower oven', () => {
    expect(applianceEntities(HOUSE, 'st-washer').twin).toEqual({
      unit: 'upper',
      roles: {
        state: 'sensor.samsung_waschmaschine_maschinenstatus_obere_waschmaschine',
        phase: 'sensor.samsung_waschmaschine_auftragsstatus_obere_waschmaschine',
        finish: 'sensor.samsung_waschmaschine_fertigstellungszeit_obere_waschmaschine',
        remote: 'binary_sensor.samsung_waschmaschine_fernsteuerung_obere_waschmaschine',
      },
    });
    expect(applianceEntities(HOUSE, 'st-oven').twin).toMatchObject({
      unit: 'second',
      roles: {
        state: 'sensor.samsung_backofen_maschinenstatus_zweiter_garraum',
        target: 'sensor.samsung_backofen_sollwert_zweiter_garraum',
        temperature: 'sensor.samsung_backofen_temperatur_zweiter_garraum',
      },
    });
    expect(applianceEntities(HOUSE, 'wp-oven').twin).toMatchObject({
      unit: 'lower',
      roles: {
        state: 'sensor.herd_zustand_unten',
        target: 'number.herd_zieltemperatur_unten',
        stop: 'button.herd_stopp_unten',
      },
    });
    // the first unit keeps its own
    expect(applianceEntities(HOUSE, 'wp-oven').roles).toMatchObject(
      whirlpoolOven(NOW).expected.roles ?? {},
    );
    expect(applianceEntities(HOUSE, 'st-washer').roles).toMatchObject(
      stWasher(NOW).expected.roles ?? {},
    );
    expect(applianceEntities(HOUSE, 'st-oven').roles).toMatchObject(
      stOven(NOW).expected.roles ?? {},
    );
  });

  it('gathers the rest in kind: compartments, maintenance, quick modes, plates and counters', () => {
    expect(applianceEntities(HOUSE, 'hc-fridge')).toMatchObject({
      zones: [
        'number.kuhl_gefrier_kombination_kuhlschranktemperatur',
        'number.kuhl_gefrier_kombination_gefrierschranktemperatur',
        'binary_sensor.kuhl_gefrier_kombination_kuhlschranktur',
        'binary_sensor.kuhl_gefrier_kombination_gefrierschranktur',
      ],
      boosts: [
        'switch.kuhl_gefrier_kombination_super_kuhlen',
        'switch.kuhl_gefrier_kombination_super_gefrieren',
        'switch.kuhl_gefrier_kombination_eco_modus',
        'switch.kuhl_gefrier_kombination_urlaubsmodus',
      ],
    });
    expect(applianceEntities(HOUSE, 'hc-dish').maintenance).toEqual([
      'sensor.geschirrspuler_salzmangel',
      'sensor.geschirrspuler_klarspuler_fast_leer',
      'sensor.geschirrspuler_maschinenpflege',
    ]);
    expect(applianceEntities(HOUSE, 'miele-hob').hob).toHaveLength(4);
    expect(applianceEntities(HOUSE, 'hc-coffee').counters).toEqual([
      'sensor.kaffeevollautomat_kaffees',
      'sensor.kaffeevollautomat_milchkaffees',
    ]);
    // LG's fresh-air filter select is a setting, not a flag to look after
    expect(applianceEntities(HOUSE, 'lg-fridge').maintenance).toEqual([
      'sensor.kuhlschrank_wasserfilter',
    ]);
  });

  it('takes a plug’s switch as its power, the entity a card names as what it plays, and a role named by hand over both', () => {
    expect(applianceEntities(HOUSE, 'plug-washer').roles).toMatchObject({
      power: 'switch.waschmaschine_keller',
      watts: 'sensor.waschmaschine_keller_leistung',
    });
    expect(applianceDevice(HOUSE, undefined, 'switch.waschmaschine_keller')).toBe('plug-washer');
    // a lone entity, no device: a switch is the power, a sensor the state
    expect(applianceEntities(HOUSE, undefined, [], 'switch.lone_plug').roles).toEqual({
      power: 'switch.lone_plug',
    });
    expect(
      applianceEntities(HOUSE, 'plug-washer', [
        { role: 'running', entity: 'binary_sensor.washer_running' },
      ]).roles.running,
    ).toBe('binary_sensor.washer_running');
  });
});
