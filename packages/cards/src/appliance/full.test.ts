import { describe, expect, it } from 'vitest';
import {
  heroSays,
  hoursMinutes,
  KIND_VALUES,
  kindRows,
  ROW_KEYS,
  rowEntry,
  type RowKey,
} from './full.js';
import { APPLIANCE_KINDS, KIND_DEFAULTS, type Hero } from './kinds.js';

describe('the whole card’s rows', () => {
  it('take the kind’s, as many as a card shows, each slot its first the appliance has', () => {
    const has =
      (...keys: RowKey[]) =>
      (key: RowKey): boolean =>
        keys.includes(key);
    // a washer without a water meter shows its next row instead
    expect(kindRows('washer', has('program', 'energy', 'spin', 'end'))).toEqual([
      'program',
      'energy',
      'spin',
    ]);
    // a fridge's filter is its water filter, else its air filter; its alarm keeps its place
    expect(kindRows('fridge', has('mode', 'air_filter', 'alarm'))).toEqual([
      'mode',
      'air_filter',
      'alarm',
    ]);
    expect(kindRows('fridge', has('mode', 'water_filter', 'air_filter', 'alarm'))).toEqual([
      'mode',
      'water_filter',
      'alarm',
    ]);
    // where it has fewer than three, its next rows, then a dash in the place of a slot it lacks, said by the slot's
    // most general row: the card keeps its three rows (#47)
    expect(kindRows('coffee', has('last_brew'))).toEqual(['last_brew', 'water_tank', 'beans']);
    expect(kindRows('coffee', has('last_brew', 'alarm'))).toEqual([
      'last_brew',
      'water_tank',
      'alarm',
    ]);
    expect(kindRows('fridge', has('mode', 'alarm'))).toEqual(['mode', 'filter', 'alarm']);
    expect(kindRows('fridge', has('mode', 'alarm', 'energy'))).toEqual(['mode', 'alarm', 'energy']);
    expect(kindRows('hob', has('zones', 'alarm'))).toEqual(['zones', 'power', 'alarm']);
    expect(kindRows('washer', has('energy', 'elapsed', 'power', 'alarm'))).toEqual([
      'energy',
      'elapsed',
      'power',
    ]);
    // beside a second drum or cavity, two: the oven's programme and its time left
    expect(kindRows('oven', has('program', 'remaining', 'end'), 2)).toEqual([
      'program',
      'remaining',
    ]);
  });

  it('never say again what the hero says: a cycle’s time left and its end, a plug’s power and energy, a heat’s target, a hob’s zones (#47)', () => {
    const has =
      (...keys: RowKey[]) =>
      (key: RowKey): boolean =>
        keys.includes(key);
    // a cycle: the air fryer's own reads its target and its programme, then how long it has run — never the time
    // left its hero says ("Restzeit 0:12 h" twice on the generated Home)
    expect(
      kindRows(
        'air_fryer',
        has('target', 'program', 'remaining', 'end', 'elapsed', 'alarm'),
        3,
        heroSays('cycle'),
      ),
    ).toEqual(['target', 'program', 'elapsed']);
    // the reporter's LG washer at work: programme, its next rows, never its time left or its end
    expect(
      kindRows(
        'washer',
        has('program', 'remaining', 'end', 'elapsed', 'alarm'),
        3,
        heroSays('cycle'),
      ),
    ).toEqual(['program', 'elapsed', 'alarm']);
    // his dishwasher: "Fertig um 22:02" is the hero's, never a row's "Ende 22:02"
    expect(
      kindRows('dishwasher', has('program', 'end', 'remaining', 'alarm'), 3, heroSays('cycle')),
    ).toEqual(['program', 'water', 'alarm']);
    // a washer on a plug: its hero says what it draws and what this cycle used; its rows when it finished, how long
    // it ran, its alarm
    expect(
      kindRows('washer', has('power', 'energy', 'end', 'elapsed', 'alarm'), 3, heroSays('plug')),
    ).toEqual(['end', 'elapsed', 'alarm']);
    // a toaster on its plug, whole: the same
    expect(
      kindRows('toaster', has('power', 'energy', 'end', 'elapsed', 'alarm'), 3, heroSays('plug')),
    ).toEqual(['elapsed', 'end', 'alarm']);
    // a fridge on a plug: its mode, a filter it lacks (a dash), its alarm — what it draws is its hero's
    expect(kindRows('fridge', has('power', 'energy', 'alarm'), 3, heroSays('plug'))).toEqual([
      'mode',
      'filter',
      'alarm',
    ]);
    // heat: the kettle's target is its hero's line ("Ziel 100 °C"), never a row's "Soll 100 °C"
    expect(kindRows('kettle', has('target', 'alarm'), 3, heroSays('heat'))).toEqual([
      'power',
      'energy',
      'alarm',
    ]);
    // the oven's own rows say nothing its hero does: its heating, the time left, when it ends
    expect(
      kindRows(
        'oven',
        has('program', 'target', 'temperature', 'remaining', 'end'),
        3,
        heroSays('heat'),
      ),
    ).toEqual(['program', 'remaining', 'end']);
    // a hob: its plates are its panel's and its head's ("Zone 1 aktiv"), never a row's "1 von 4 an"
    expect(kindRows('hob', has('zones', 'power', 'alarm'), 3, heroSays('hob'))).toEqual([
      'power',
      'energy',
      'alarm',
    ]);
    // what has every row says three others than its hero's, in its kind's order
    expect(kindRows('washer', () => true, 3, heroSays('cycle'))).toEqual([
      'program',
      'water',
      'energy',
    ]);
    expect(kindRows('washer', () => true, 3, heroSays('plug'))).toEqual([
      'program',
      'water',
      'spin',
    ]);
  });

  it('give every kind three rows besides its hero’s, its own and a plug’s, whatever it has (#47)', () => {
    for (const kind of APPLIANCE_KINDS)
      for (const hero of [KIND_DEFAULTS[kind].hero, 'plug'] as const satisfies readonly Hero[])
        for (const has of [() => true, () => false])
          for (const count of [3, 2]) {
            const rows = kindRows(kind, has, count, heroSays(hero));
            expect(rows, `${kind} · ${hero}`).toHaveLength(count);
            expect(new Set(rows).size, `${kind} · ${hero}`).toBe(count);
            expect(rows.filter(heroSays(hero)), `${kind} · ${hero}`).toEqual([]);
          }
  });

  it('give every kind three rows whatever it has, and no row twice', () => {
    for (const kind of APPLIANCE_KINDS) {
      expect(
        kindRows(kind, () => false),
        kind,
      ).toHaveLength(3);
      const all = kindRows(kind, () => true, 99);
      expect(new Set(all).size, kind).toBe(all.length);
    }
  });

  it('give every kind its rows and how their values sit', () => {
    for (const kind of APPLIANCE_KINDS) {
      expect(
        kindRows(kind, () => true),
        kind,
      ).toHaveLength(3);
      expect(KIND_VALUES[kind], kind).toMatch(/^(inline|end|plain)$/);
    }
  });

  it('read a config’s row from a key, an entity or an entry', () => {
    expect(rowEntry('water')).toEqual({ key: 'water' });
    expect(rowEntry('sensor.timer')).toEqual({ key: 'entity', entity: 'sensor.timer' });
    expect(rowEntry({ entity: 'sensor.timer', name: 'Timer' })).toEqual({
      key: 'entity',
      entity: 'sensor.timer',
      name: 'Timer',
    });
    expect(rowEntry({ key: 'end', name: '' })).toEqual({ key: 'end', name: '' });
    expect(ROW_KEYS).toContain('entity');
    expect(ROW_KEYS).toContain('water_filter');
  });

  it('say a span in hours and minutes, as the hero writes the time left', () => {
    expect(hoursMinutes(72 * 60)).toEqual({ h: '1', mm: '12' });
    expect(hoursMinutes(48 * 60 + 20)).toEqual({ h: '0', mm: '48' });
    expect(hoursMinutes(0)).toEqual({ h: '0', mm: '00' });
    expect(hoursMinutes(-5)).toEqual({ h: '0', mm: '00' });
  });
});
