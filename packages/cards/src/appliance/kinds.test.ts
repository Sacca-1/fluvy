import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { PRINTER_HOUSE } from '../printer/fixtures.js';
import { printerDevices } from '../printer/roles.js';
import { allFixtures, houseOf, laterFixtures } from './fixtures/index.js';
import {
  APPLIANCE_KINDS,
  applianceDevices,
  byWords,
  KIND_DEFAULTS,
  kindOf,
  LG_MODEL,
  signalsOf,
  type KindSignals,
} from './kinds.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const FIXTURES = allFixtures(NOW);
const HOUSE = houseOf(FIXTURES, NOW);

/** Signals with nothing in them but what a test says. */
const signals = (given: Partial<KindSignals>): KindSignals => ({
  keys: new Set(),
  objects: [],
  domains: new Set(),
  programs: [],
  tops: [],
  ...given,
});

describe('what an appliance is', () => {
  it.each(FIXTURES.map((fixture) => [fixture.title, fixture]))('knows %s', (_, fixture) => {
    const verdict = kindOf(signalsOf(HOUSE, fixture.device.id));
    if (fixture.expected.excluded) expect(verdict).toEqual({ excluded: fixture.expected.excluded });
    else if (fixture.expected.kind) expect(verdict).toMatchObject({ kind: fixture.expected.kind });
    else expect(verdict).toBeUndefined();
  });

  it('asks in order: the card, then the model, then LG’s type, then the keys, then the name', () => {
    // the card's word over everything, even what is never an appliance
    expect(kindOf(signals({ model: 'Robot vacuum cleaner', platform: 'miele' }), 'oven')).toEqual({
      kind: 'oven',
      by: 'config',
    });
    // Miele's model over its keys and its name
    expect(
      kindOf(
        signals({
          platform: 'miele',
          model: 'Washer dryer',
          keys: new Set(['salt_level']),
          name: 'Spüli',
        }),
      ),
    ).toEqual({ kind: 'washer_dryer', by: 'model' });
    // LG's type over its keys
    expect(
      kindOf(
        signals({
          platform: 'lg_thinq',
          model: 'X (DEVICE_OVEN)',
          keys: new Set(['express_fridge']),
        }),
      ),
    ).toEqual({ kind: 'oven', by: 'lg' });
    // the keys over the name
    expect(
      kindOf(
        signals({ platform: 'home_connect', keys: new Set(['salt_lack']), name: 'Waschmaschine' }),
      ),
    ).toEqual({ kind: 'dishwasher', by: 'keys' });
    expect(kindOf(signals({ platform: 'shelly', name: 'Lavastoviglie' }))).toEqual({
      kind: 'dishwasher',
      by: 'words',
    });
    // 'auto' asks the appliance
    expect(kindOf(signals({ name: 'Kettle' }), 'auto')).toEqual({ kind: 'kettle', by: 'words' });
  });

  it('reads LG’s type off its model, both integrations’ forms, and a WashTower’s half off its name', () => {
    expect(LG_MODEL.exec('WM4000HWA (DEVICE_WASHER)')?.[1]).toBe('WASHER');
    expect(LG_MODEL.exec('F4V5VYP0W (TOWER_DRYER)')?.[1]).toBe('TOWER_DRYER');
    expect(LG_MODEL.exec('WM4000HWA')).toBeNull();
    const tower = (name: string) =>
      kindOf(signals({ platform: 'lg_thinq', model: 'WKEX200 (DEVICE_WASHTOWER)', name }));
    expect(tower('Turm washer')).toMatchObject({ kind: 'washer' });
    expect(tower('Turm dryer')).toMatchObject({ kind: 'dryer' });
    // a WashTower not split in two is both
    expect(tower('Turm')).toMatchObject({ kind: 'washer_dryer' });
    expect(kindOf(signals({ model: 'WM6998 (DEVICE_WASHCOMBO_MAIN)' }))).toMatchObject({
      kind: 'washer_dryer',
    });
    expect(kindOf(signals({ model: 'WM6998 (DEVICE_WASHCOMBO_MINI)' }))).toMatchObject({
      kind: 'washer',
    });
  });

  it('reads Home Connect’s programmes: a dishwasher’s, a washer-dryer’s, a microwave’s all microwave, an oven with a microwave an oven', () => {
    const programs = (...list: string[]) =>
      kindOf(signals({ platform: 'home_connect', programs: list }));
    expect(programs('laundry_care_washer_dryer_program_mix')).toMatchObject({
      kind: 'washer_dryer',
    });
    expect(programs('laundry_care_dryer_program_cotton')).toMatchObject({ kind: 'dryer' });
    expect(programs('cooking_oven_program_microwave_600_watt')).toMatchObject({
      kind: 'microwave',
    });
    expect(
      programs(
        'cooking_oven_program_microwave_600_watt',
        'cooking_oven_program_heating_mode_hot_air',
      ),
    ).toMatchObject({ kind: 'oven' });
    expect(programs('consumer_products_cleaning_robot_program_cleaning_clean_all')).toEqual({
      excluded: 'vacuum',
    });
  });

  it('tells Matter’s compartments and cavities by their ranges', () => {
    expect(kindOf(signals({ platform: 'matter', tops: [7, -15] }))).toMatchObject({
      kind: 'fridge',
    });
    expect(kindOf(signals({ platform: 'matter', tops: [-15] }))).toMatchObject({ kind: 'freezer' });
    expect(kindOf(signals({ platform: 'matter', tops: [250] }))).toMatchObject({ kind: 'oven' });
  });

  it('reads a name in any of the eight languages, accents or none, the more particular kind first', () => {
    const names: ReadonlyArray<readonly [string, string]> = [
      ['Washing machine', 'washer'],
      ['Waschmaschine', 'washer'],
      ['Lave-linge', 'washer'],
      ['lave_linge', 'washer'],
      ['Lavadora', 'washer'],
      ['Wasmachine', 'washer'],
      ['Lavatrice', 'washer'],
      ['Máquina de lavar', 'washer'],
      ['Çamaşır makinesi', 'washer'],
      ['Waschtrockner', 'washer_dryer'],
      ['Lavasecadora', 'washer_dryer'],
      ['Kurutmalı çamaşır makinesi', 'washer_dryer'],
      ['Dishwasher', 'dishwasher'],
      ['Geschirrspüler', 'dishwasher'],
      ['Lave-vaisselle', 'dishwasher'],
      ['Lavavajillas', 'dishwasher'],
      ['Vaatwasser', 'dishwasher'],
      ['Lava-louças', 'dishwasher'],
      ['Bulaşık makinesi', 'dishwasher'],
      ['Wäschetrockner', 'dryer'],
      ['Sèche-linge', 'dryer'],
      ['Asciugatrice', 'dryer'],
      ['Kurutma makinesi', 'dryer'],
      ['Microwave oven', 'microwave'],
      ['Forno a microonde', 'microwave'],
      ['Magnetron', 'microwave'],
      ['Backofen', 'oven'],
      ['Horno', 'oven'],
      ['Four', 'oven'],
      ['Fırın', 'oven'],
      ['Kochfeld', 'hob'],
      ['Placa de inducción', 'hob'],
      ['Piano cottura', 'hob'],
      ['Dunstabzugshaube', 'hood'],
      ['Hotte', 'hood'],
      ['Weinkühlschrank', 'wine'],
      ['Wine fridge', 'wine'],
      ['Adega', 'wine'],
      ['Kühlschrank', 'fridge'],
      ['Fridge freezer', 'fridge'],
      ['Frigorífico', 'fridge'],
      ['Koelkast', 'fridge'],
      ['Geladeira', 'fridge'],
      ['Buzdolabı', 'fridge'],
      ['Gefrierschrank', 'freezer'],
      ['Congélateur', 'freezer'],
      ['Vriezer', 'freezer'],
      ['Kaffeevollautomat', 'coffee'],
      ['Cafetera', 'coffee'],
      ['Koffiezetapparaat', 'coffee'],
      ['Wasserkocher', 'kettle'],
      ['Bouilloire', 'kettle'],
      ['Waterkoker', 'kettle'],
      ['Air fryer', 'air_fryer'],
      ['Heißluftfritteuse', 'air_fryer'],
      ['Friggitrice ad aria', 'air_fryer'],
    ];
    for (const [name, kind] of names) expect(byWords(name), name).toEqual({ kind, by: 'words' });
    // a name that says no kind says none
    expect(byWords('Steckdose Flur')).toBeUndefined();
    // a word of another: a hood is not a "neighbourhood", a hob not a "hobby"
    expect(byWords('Neighbourhood lamp')).toBeUndefined();
    expect(byWords('Hobby room plug')).toBeUndefined();
  });

  it('never takes a vacuum, a charger, a hair dryer or what waits for 1.10 for an appliance', () => {
    for (const name of [
      'Saugroboter',
      'Robot vacuum',
      'Staubsauger',
      'Aspirateur',
      'Wallbox',
      'Haartrockner',
      'Hair dryer',
      'Wärmeschublade',
      'Styler',
    ])
      expect(byWords(name), name).toEqual({ excluded: 'name' });
    expect(kindOf(signals({ domains: new Set(['vacuum']), name: 'Waschmaschine' }))).toEqual({
      excluded: 'vacuum',
    });
    expect(
      kindOf(signals({ keys: new Set(['lost', 'lifted']), platform: 'home_connect' })),
    ).toEqual({
      excluded: 'vacuum',
    });
    expect(
      kindOf(
        signals({ keys: new Set(['stick_cleaner_operating_state']), platform: 'smartthings' }),
      ),
    ).toEqual({ excluded: 'vacuum' });
    expect(kindOf(signals({ keys: new Set(['evse_plug']), platform: 'matter' }))).toEqual({
      excluded: 'charger',
    });
    expect(kindOf(signals({ printer: true, name: 'Waschmaschine' }))).toEqual({
      excluded: 'printer',
    });
  });

  it('gives every kind its defaults: a glyph, a tone, a hero, what it shows', () => {
    for (const kind of APPLIANCE_KINDS) expect(KIND_DEFAULTS[kind], kind).toBeDefined();
    expect(KIND_DEFAULTS.washer.steps).toEqual(['wash', 'rinse', 'spin']);
    expect(KIND_DEFAULTS.fridge).toMatchObject({ hero: 'cold', doorAlert: 60, unload: false });
    // a big appliance's whole card (the reporter's design, #47); what lives on a plug, a row
    expect(KIND_DEFAULTS.coffee.variant).toBe('full');
    for (const kind of ['toaster', 'blender', 'sandwich_maker', 'kettle', 'microwave'] as const)
      expect(KIND_DEFAULTS[kind].variant, kind).toBe('row');
  });

  it('knows a toaster, a blender and a sandwich maker by their names, in every language, the sandwich maker first', () => {
    const said = (name: string) => byWords(name);
    expect(said('Toaster Küche')).toEqual({ kind: 'toaster', by: 'words' });
    expect(said('Grille-pain')).toEqual({ kind: 'toaster', by: 'words' });
    expect(said('Sandwichtoaster')).toEqual({ kind: 'sandwich_maker', by: 'words' });
    expect(said('Tosti-ijzer')).toEqual({ kind: 'sandwich_maker', by: 'words' });
    expect(said('Standmixer')).toEqual({ kind: 'blender', by: 'words' });
    expect(said('Liquidificador')).toEqual({ kind: 'blender', by: 'words' });
    expect(said('Ekmek kızartma makinesi')).toEqual({ kind: 'toaster', by: 'words' });
  });
});

describe('the house’s appliances', () => {
  it('lists every device that is one, strictly, once, and nothing else', () => {
    const listed = FIXTURES.filter((fixture) => fixture.expected.listed).map(
      (fixture) => fixture.device.id,
    );
    expect([...applianceDevices(HOUSE)].sort()).toEqual([...listed].sort());
    for (const fixture of laterFixtures(NOW))
      expect(applianceDevices(houseOf([fixture], NOW)), fixture.title).toEqual(
        fixture.expected.listed ? [fixture.device.id] : [],
      );
  });

  it('never lists a printer, and the printer card never lists one of them: every fixture of each', () => {
    expect(applianceDevices(PRINTER_HOUSE)).toEqual([]);
    expect(printerDevices(HOUSE)).toEqual([]);
    // in one house, each finds its own
    const both = houseOf(FIXTURES, NOW, PRINTER_HOUSE);
    const printers = printerDevices(both);
    const appliances = applianceDevices(both);
    expect(printers.filter((id) => appliances.includes(id))).toEqual([]);
    expect([...appliances].sort()).toEqual([...applianceDevices(HOUSE)].sort());
    expect([...printers].sort()).toEqual([...printerDevices(PRINTER_HOUSE)].sort());
  });

  it('reads the house again only when its registries change, not on every state', () => {
    const first = applianceDevices(HOUSE);
    const ticked = { ...HOUSE, states: { ...HOUSE.states } } as HomeAssistant;
    expect(applianceDevices(ticked)).toBe(first);
    const renamed = { ...HOUSE, entities: { ...HOUSE.entities } } as HomeAssistant;
    expect(applianceDevices(renamed)).not.toBe(first);
    expect(applianceDevices(renamed)).toEqual(first);
  });
});
