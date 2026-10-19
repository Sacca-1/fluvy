import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  allFixtures,
  hcDishwasherDone,
  hcFridge,
  houseOf,
  lgDryer,
  type ApplianceFixture,
} from './fixtures/index.js';
import { findAppliance, readAppliance, type ApplianceConfig } from './reading.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const MINUTE = 60_000;
const FIXTURES = allFixtures(NOW);
const HOUSE = houseOf(FIXTURES, NOW);

const read = (
  device: string,
  config: ApplianceConfig = {},
  hass: HomeAssistant = HOUSE,
  now = NOW,
  unloaded: number | null = null,
) =>
  readAppliance(
    hass,
    findAppliance(hass, { device, ...config }),
    { device, ...config },
    now,
    unloaded,
  );

/** A fixture alone in a house, at its own moment, read a while later. */
const later = (
  fixture: (now: number) => ApplianceFixture,
  minutes: number,
  config: ApplianceConfig = {},
  unloaded: number | null = null,
) => {
  const at = houseOf([fixture(NOW)], NOW);
  const id = fixture(NOW).device.id;
  return readAppliance(
    at,
    findAppliance(at, { device: id }),
    { device: id, ...config },
    NOW + minutes * MINUTE,
    unloaded,
  );
};

describe('an appliance read', () => {
  it.each(
    FIXTURES.filter((fixture) => fixture.expected.status).map((fixture) => [
      fixture.title,
      fixture,
    ]),
  )('says what %s is doing', (_, fixture) => {
    expect(read(fixture.device.id).status).toBe(fixture.expected.status);
  });

  it('works its times out of whatever the integration says (findings 08 § D)', () => {
    // LG: a finish time and a total in minutes; the progress from both
    expect(read('lg-washer').clock).toEqual({
      left: 42 * 60,
      at: NOW + 42 * MINUTE,
      total: 120 * 60,
      elapsed: 78 * 60,
      progress: 65,
    });
    // Miele: remaining and elapsed minutes; its finish time says when
    expect(read('miele-washer').clock).toMatchObject({
      left: 42 * 60,
      at: NOW + 42 * MINUTE,
      total: 105 * 60,
      progress: 60,
    });
    // Home Connect: its progress as it says it, its finish time; started when its state turned to running
    expect(read('hc-dish').clock).toMatchObject({
      progress: 60,
      left: 50 * 60,
      at: NOW + 50 * MINUTE,
    });
    // Electrolux: seconds; SmartThinQ: "0:35:00" and "1:45:00"
    expect(read('aeg-washer').clock).toMatchObject({ left: 1800, elapsed: 3600, total: 5400 });
    expect(read('stq-washer').clock).toMatchObject({ left: 2100, total: 6300 });
    // a state that changes with every step (LG's) never says when the cycle began
    expect(read('wp-washer').clock).toMatchObject({ left: 25 * 60, total: null, progress: null });
    // at rest, no times
    expect(read('hc-coffee').clock).toEqual({
      left: null,
      at: null,
      total: null,
      elapsed: null,
      progress: null,
    });
  });

  it('says the step it is at, and the words Home Assistant says', () => {
    expect(read('miele-washer')).toMatchObject({
      step: 'rinse',
      steps: ['wash', 'rinse', 'spin'],
      word: 'In use',
      phase: 'Rinses',
    });
    expect(read('lg-washer')).toMatchObject({ step: 'spin', word: 'Spinning', phase: '' });
    // hOn's numbers say nothing: the card's own word is said
    expect(read('hon-washer')).toMatchObject({ word: '', statusWord: 'appliance.status_running' });
    expect(read('hc-oven').statusWord).toBe('appliance.status_running');
    // where the status is not what the state says, the card's own word: LG's "Power off" when done, a stopped
    // machine whose job finished
    expect(later(lgDryer, 0)).toMatchObject({ word: '', statusWord: 'appliance.status_finished' });
    expect(read('st-dish')).toMatchObject({ word: '', statusWord: 'appliance.status_finished' });
  });

  it('waits to be unloaded from half an hour after a finish, until its door opens', () => {
    // done an hour ago, its door shut since before: waiting
    const done = houseOf([hcDishwasherDone(NOW)], NOW);
    expect(read('hc-dish', {}, done)).toMatchObject({
      status: 'finished',
      finishedAt: NOW - 60 * MINUTE,
      unload: { since: NOW - 60 * MINUTE },
    });
    expect(read('hc-dish', {}, done).attention[0]).toEqual({
      key: 'appliance.unload',
      since: NOW - 60 * MINUTE,
    });
    // its door opened after the finish: unloaded
    const opened = {
      ...done,
      states: {
        ...done.states,
        'sensor.geschirrspuler_tur': {
          ...(done.states['sensor.geschirrspuler_tur'] ?? {
            entity_id: 'sensor.geschirrspuler_tur',
            attributes: {},
          }),
          state: 'closed',
          last_changed: new Date(NOW - 10 * MINUTE).toISOString(),
        },
      },
    } as HomeAssistant;
    expect(read('hc-dish', {}, opened).unload).toBeNull();
    // the person said so, for this finish
    expect(read('hc-dish', {}, done, NOW, NOW - 60 * MINUTE).unload).toBeNull();
    // the reminder turned off, or not yet half an hour
    expect(read('hc-dish', { unload_reminder: false }, done).unload).toBeNull();
    expect(read('hc-dish', { unload_after: 90 }, done).unload).toBeNull();
  });

  it('reads LG’s washer that powers off when done, with no door: done for two hours, waiting from half an hour', () => {
    // finished 40 minutes ago (its notification), powered off since
    expect(later(lgDryer, 0)).toMatchObject({
      status: 'finished',
      finishedAt: NOW - 40 * MINUTE,
      unload: { since: NOW - 40 * MINUTE },
    });
    // the person tapped "Unloaded" for this finish
    expect(later(lgDryer, 0, {}, NOW - 40 * MINUTE).unload).toBeNull();
    // past the done time, it is off and asks nothing
    expect(later(lgDryer, 81)).toMatchObject({ status: 'off', unload: null });
    expect(later(lgDryer, 60, { done_for: 60 })).toMatchObject({ status: 'off', unload: null });
    // one that stays at "end" (it did not power off) waits too, until LG says its door was opened after the finish
    const ended = houseOf([lgDryer(NOW)], NOW);
    const state = ended.states['sensor.trockner_aktueller_status'];
    const note = ended.states['event.trockner_benachrichtigung'];
    if (!state || !note) throw new Error('the dryer has a state and a notification');
    const at = (notification: { state: string; event_type: string }) =>
      ({
        ...ended,
        states: {
          ...ended.states,
          [state.entity_id]: {
            ...state,
            state: 'end',
            last_changed: new Date(NOW - 40 * MINUTE).toISOString(),
          },
          [note.entity_id]: {
            ...note,
            state: notification.state,
            attributes: { ...note.attributes, event_type: notification.event_type },
          },
        },
      }) as HomeAssistant;
    const dryer = (hass: HomeAssistant) =>
      readAppliance(hass, findAppliance(hass, { device: 'lg-dryer' }), {}, NOW);
    const before = at({
      state: new Date(NOW - 50 * MINUTE).toISOString(),
      event_type: 'door_is_open',
    });
    expect(dryer(before)).toMatchObject({
      status: 'finished',
      unload: { since: NOW - 40 * MINUTE },
    });
    const after = at({
      state: new Date(NOW - 5 * MINUTE).toISOString(),
      event_type: 'door_is_open',
    });
    expect(dryer(after)).toMatchObject({ status: 'finished', unload: null });
  });

  it('says a fridge’s door has stood open after a minute, with when it opened', () => {
    const fridge = later(hcFridge, 0);
    expect(fridge.door).toEqual({ open: true, since: NOW - 180_000, changed: NOW - 180_000 });
    expect(fridge.attention).toEqual([{ key: 'appliance.door_open', since: NOW - 180_000 }]);
    expect(later(hcFridge, 0, { door_alert: 300 }).attention).toEqual([]);
    // a washer's door alert is off by default
    expect(read('st-fridge').attention.map((line) => line.key)).toContain('appliance.door_open');
  });

  it('says what it asks to be looked after, due first, and puts the due on the attention line', () => {
    expect(read('hc-dish').maintenance.map((item) => `${item.key} ${item.severity}`)).toEqual([
      'salt due',
      'rinse_aid soon',
      'machine_care ok',
    ]);
    expect(read('hc-dish').attention).toEqual([
      { key: 'appliance.m_salt', since: NOW - 3 * 3_600_000 },
    ]);
    expect(read('hc-coffee').attention.map((line) => line.key)).toEqual([
      'appliance.m_descale',
      'appliance.m_beans',
    ]);
    expect(read('miele-washer').maintenance).toEqual([
      {
        key: 'detergent',
        entity: 'sensor.miele_waschmaschine_twindos_1_fullstand',
        severity: 'soon',
        level: 15,
        since: NOW - 7_200_000,
      },
    ]);
  });

  it('says why it failed, in the integration’s words where it has them', () => {
    const failed = (changes: Record<string, string>, attributes: Record<string, unknown> = {}) => {
      const states = { ...HOUSE.states };
      for (const [id, value] of Object.entries(changes)) {
        const state = states[id];
        if (state)
          states[id] = {
            ...state,
            state: value,
            attributes: { ...state.attributes, ...attributes },
          };
      }
      return { ...HOUSE, states } as HomeAssistant;
    };
    // LG's error event, within half an hour; Home Assistant translates its type
    const lg = {
      ...failed({ 'event.waschmaschine_fehler': new Date(NOW - 5 * MINUTE).toISOString() }),
      formatEntityAttributeValue: () => 'Out-of-balance load',
    } as HomeAssistant;
    expect(read('lg-washer', {}, lg)).toMatchObject({
      status: 'error',
      attention: [{ key: 'appliance.failure', text: 'Out-of-balance load' }],
    });
    // Miele's failure flag
    expect(
      read('miele-washer', {}, failed({ 'binary_sensor.miele_waschmaschine_storung': 'on' }))
        .status,
    ).toBe('error');
    // Home Connect's aborted programme
    expect(
      read('hc-dish', {}, failed({ 'sensor.geschirrspuler_programm_abgebrochen': 'present' }))
        .attention[0],
    ).toEqual({
      key: 'appliance.aborted',
    });
    // LG's older integration's message
    expect(
      read('stq-washer', {}, failed({ 'sensor.lg_waschmaschine_error_message': 'UE' }))
        .attention[0],
    ).toEqual({
      key: 'appliance.failure',
      text: 'UE',
    });
    // an old error is not one
    expect(read('lg-washer').status).toBe('running');
  });

  it('reads an oven’s and a kettle’s heat, at temperature within 2 °C or when the integration says so', () => {
    expect(read('hc-oven').heat).toEqual({
      current: 142,
      target: 180,
      unit: '°C',
      ready: false,
      progress: 76.25,
    });
    const preheated = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'sensor.backofen_vorheizen_beendet': {
          ...HOUSE.states['sensor.backofen_vorheizen_beendet'],
          state: 'present',
        },
      },
    } as HomeAssistant;
    expect(read('hc-oven', {}, preheated)).toMatchObject({
      heat: { ready: true },
      statusWord: 'appliance.status_at_temperature',
    });
    expect(read('st-oven').heat).toMatchObject({ current: 179, target: 180, ready: true });
    expect(read('tuya-kettle').heat).toMatchObject({
      current: 62,
      target: 100,
      ready: false,
      progress: 52.5,
    });
  });

  it('reads its twin: SmartThings’ upper drum at rest, Whirlpool’s lower oven cooking', () => {
    expect(read('st-washer').twin).toMatchObject({ unit: 'upper', status: 'idle' });
    expect(read('wp-oven').twin).toMatchObject({ unit: 'lower', status: 'running' });
    expect(read('hc-dish').twin).toBeUndefined();
  });

  it('reads its compartments, quick modes, plates and counters, and the readouts it has', () => {
    expect(read('st-fridge').zones).toHaveLength(2);
    expect(read('st-fridge').boosts).toHaveLength(3);
    expect(read('miele-hob').hob).toHaveLength(4);
    expect(read('hc-coffee').counters).toHaveLength(2);
    expect(read('miele-washer').readouts).toEqual({
      program: 'sensor.miele_waschmaschine_programm',
      spin: 'sensor.miele_waschmaschine_schleuderdrehzahl',
      energy: 'sensor.miele_waschmaschine_energieverbrauch',
      elapsed: 'sensor.miele_waschmaschine_verstrichene_zeit',
      this_cycle: 'sensor.miele_waschmaschine_energieverbrauch',
    });
  });

  it('reads a plug’s appliance as far as its switch and power go, by the words of its name', () => {
    expect(read('plug-washer')).toMatchObject({
      kind: 'washer',
      plug: true,
      status: 'idle',
      name: 'Waschmaschine Keller',
      readouts: {
        power: 'sensor.waschmaschine_keller_leistung',
        energy: 'sensor.waschmaschine_keller_energie',
      },
    });
    // a card on a plug's switch alone, named for what it powers
    const lone = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'switch.lone': {
          entity_id: 'switch.lone',
          state: 'off',
          attributes: { friendly_name: 'Dishwasher plug' },
          last_changed: '',
          last_updated: '',
        },
      },
    } as HomeAssistant;
    expect(
      readAppliance(
        lone,
        findAppliance(lone, { entity: 'switch.lone' }),
        { entity: 'switch.lone' },
        NOW,
      ),
    ).toMatchObject({
      kind: 'dishwasher',
      status: 'off',
      name: 'Dishwasher plug',
    });
  });

  it('reads an appliance gone from reach as offline, with nothing to do', () => {
    const away = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'sensor.geschirrspuler_betriebszustand': {
          ...HOUSE.states['sensor.geschirrspuler_betriebszustand'],
          state: 'unavailable',
        },
      },
    } as HomeAssistant;
    expect(read('hc-dish', {}, away)).toMatchObject({
      status: 'offline',
      unavailable: true,
      commands: [],
    });
  });
});
