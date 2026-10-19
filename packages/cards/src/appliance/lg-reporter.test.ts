import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { buildNotice, parseNotice } from '../automations/notice.js';
import './english.js';
import { houseOf, reporterAtWork, reporterHouse, type ApplianceFixture } from './fixtures/index.js';
import { applianceDevices, kindOf, signalsOf } from './kinds.js';
import { maintenanceItem, maintenanceOf, type MaintenanceSpec } from './maintenance.js';
import { noticeTriggers } from './notice.js';
import { findAppliance, readAppliance } from './reading.js';
import { refView } from './refs.js';
import { applianceEntities, type Candidate } from './roles.js';
import { statusOfWord, stepOf, type ApplianceStatus, type ApplianceStep } from './status.js';
import { burnerOf } from './zones.js';

/*
 * The reporter's LG house (#47), read as he dumped it: his four appliances on the two integrations he runs — the
 * older one's device sensor with the cycle in its attributes, the core one's enums with their options — found by
 * what they say and never by their names ("Woven"), their cycles, cavities, burners, compartments and reminders read
 * right, every word their statuses can say landing on one of the card's ten, and the words Home Assistant has none
 * for said in the house's language.
 */

const NOW = Date.parse('2026-10-19T10:08:00Z');
const MINUTE = 60_000;
const HOUSE = houseOf(reporterHouse(NOW), NOW);
const AT_WORK = houseOf(reporterAtWork(NOW), NOW);
const IDS = reporterHouse(NOW).map((fixture) => fixture.device.id);

const read = (hass: HomeAssistant, device: string) =>
  readAppliance(hass, findAppliance(hass, { device }), { device }, NOW);

/** The house with only the device sensor of each of the older integration's devices: its attributes alone. */
const bare = (fixtures: readonly ApplianceFixture[]): HomeAssistant =>
  houseOf(
    fixtures.map((fixture) => {
      if (fixture.platform !== 'smartthinq_sensors') return fixture;
      const own = `sensor.${(fixture.device.name ?? '').toLowerCase()}`;
      return {
        ...fixture,
        entities: fixture.entities.filter((entry) => entry.entity_id === own),
        states: fixture.states.filter(([id]) => id === own),
      };
    }),
    NOW,
  );

const candidate = (platform: string, id: string, key?: string): Candidate => ({
  id,
  domain: id.slice(0, id.indexOf('.')),
  key,
  platform,
  object: id.slice(id.indexOf('.') + 1),
});

const state = (
  id: string,
  value: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: new Date(NOW - 3_600_000).toISOString(),
  last_updated: new Date(NOW - 3_600_000).toISOString(),
});

describe('the reporter’s LG house (#47)', () => {
  it('knows each of his appliances by what its integration says, never by its name: the "Woven" is an oven', () => {
    for (const fixture of reporterHouse(NOW))
      expect(kindOf(signalsOf(HOUSE, fixture.device.id)), fixture.title).toEqual({
        kind: fixture.expected.kind,
        by: 'keys',
      });
    // renamed to a word no language has, the ovens are ovens still: their cavities and burners say so
    const renamed = {
      ...HOUSE,
      devices: Object.fromEntries(
        Object.entries(HOUSE.devices).map(([id, entry]) => [
          id,
          id.startsWith('rep-oven') ? { ...entry, name_by_user: 'Zzz' } : entry,
        ]),
      ),
    } as HomeAssistant;
    expect(kindOf(signalsOf(renamed, 'rep-oven'))).toEqual({ kind: 'oven', by: 'keys' });
    expect(kindOf(signalsOf(renamed, 'rep-oven-thinq'))).toEqual({ kind: 'oven', by: 'keys' });
    // the core washer, every entity of it out of reach, is a washer by what its status could say
    expect(kindOf(signalsOf(HOUSE, 'rep-washer-thinq'))).toEqual({ kind: 'washer', by: 'keys' });
    // the house lists all eight, once each
    expect([...applianceDevices(HOUSE)].sort()).toEqual([...IDS].sort());
  });

  it('reads the older integration’s device sensor by its attributes alone, where its sensors are off (as they are by default)', () => {
    const alone = bare(reporterAtWork(NOW));
    expect(applianceEntities(alone, 'rep-dish').roles).toEqual({
      power: 'sensor.dishwasher',
      state: 'sensor.dishwasher#run_state',
      phase: 'sensor.dishwasher#process_state',
      program: 'sensor.dishwasher#current_course',
      remaining: 'sensor.dishwasher#remain_time',
      total: 'sensor.dishwasher#initial_time',
      start_in: 'sensor.dishwasher#reserve_time',
      error: 'sensor.dishwasher#error_message',
      completed: 'sensor.dishwasher#run_completed',
      door: 'sensor.dishwasher#door_open',
    });
    // the washer's remote start is an attribute of its own (a dishwasher has none)
    expect(applianceEntities(alone, 'rep-washer').roles).toMatchObject({
      remote: 'sensor.washer#remote_start',
      spin: 'sensor.washer#spin_speed',
      wash_temperature: 'sensor.washer#water_temp',
    });
    const dish = read(alone, 'rep-dish');
    expect(dish).toMatchObject({
      kind: 'dishwasher',
      status: 'running',
      word: 'Rinsing',
      phase: '',
      step: 'rinse',
      program: 'Auto',
      clock: { left: 72 * 60, total: 165 * 60, elapsed: 93 * 60, at: NOW + 72 * MINUTE },
      door: { open: false },
    });
    expect(dish.clock.progress).toBeCloseTo(56.4, 0);
    // its tub clean at 49 cycles is due, its salt and rinse aid fine; the washer, whose count is "N/A", asks nothing
    expect(dish.maintenance).toMatchObject([
      {
        key: 'machine_care',
        entity: 'sensor.dishwasher#tubclean_count',
        severity: 'due',
        level: 0,
      },
      { key: 'salt', entity: 'sensor.dishwasher#salt_refill', severity: 'ok' },
      { key: 'rinse_aid', entity: 'sensor.dishwasher#rinse_refill', severity: 'ok' },
    ]);
    expect(dish.attention).toMatchObject([{ key: 'appliance.m_machine_care' }]);
    const washer = read(alone, 'rep-washer');
    expect(washer).toMatchObject({
      status: 'running',
      step: 'spin',
      word: 'Spinning',
      program: 'Cotton',
    });
    expect(washer.readouts).toMatchObject({
      program: 'sensor.washer#current_course',
      spin: 'sensor.washer#spin_speed',
      temperature: 'sensor.washer#water_temp',
    });
    expect(washer.maintenance).toEqual([]);
    expect(refView(alone, 'sensor.washer#spin_speed')).toMatchObject({
      status: 'ok',
      state: 'High',
    });
    // at rest its dashes say nothing, and the sensor's own off says off; its door open is its door
    const rest = bare(reporterHouse(NOW));
    expect(read(rest, 'rep-dish')).toMatchObject({ status: 'off', word: '', door: { open: true } });
    expect(refView(rest, 'sensor.dishwasher#run_state').status).toBe('unknown');
    expect(read(rest, 'rep-washer').status).toBe('off');
    // with its sensors on, they play the parts, the sensor stays its power (over the switch it cannot reach)
    expect(read(HOUSE, 'rep-washer').roles).toMatchObject({
      state: 'sensor.washer_run_state',
      remaining: 'sensor.washer_remaining_time',
      power: 'sensor.washer',
    });
    expect(read(AT_WORK, 'rep-dish')).toMatchObject({
      status: 'running',
      step: 'rinse',
      clock: { left: 72 * 60, total: 165 * 60 },
    });
  });

  it('reads the range’s cavities and burners off its sensor’s attributes: the upper preheating in °F, the lower its twin, five zones by their places', () => {
    const oven = read(AT_WORK, 'rep-oven');
    expect(oven).toMatchObject({
      kind: 'oven',
      status: 'preheating',
      word: 'Preheating',
      program: 'Bake',
      heat: { current: 350, target: 425, unit: '°F', ready: false },
      twin: { unit: 'lower', status: 'off', word: 'Off' },
    });
    expect(oven.heat?.progress).toBeCloseTo(79, 0);
    expect(oven.hob).toEqual([
      'sensor.woven#cooktop_left_front_state',
      'sensor.woven#cooktop_left_rear_state',
      'sensor.woven#cooktop_center_state',
      'sensor.woven#cooktop_right_front_state',
      'sensor.woven#cooktop_right_rear_state',
    ]);
    expect(oven.hob.map(burnerOf)).toEqual([
      'left_front',
      'left_rear',
      'center',
      'right_front',
      'right_rear',
    ]);
    expect(burnerOf('sensor.cooktop_centre_power_level')).toBe('center');
    expect(burnerOf('sensor.cooktop_burner_1_power_level')).toBeUndefined();
    expect(refView(AT_WORK, 'sensor.woven#cooktop_left_front_state').state).toBe('on');
    // at rest: off, its cavities unknown in their unit, the twin there still
    expect(read(HOUSE, 'rep-oven')).toMatchObject({
      status: 'off',
      heat: { current: null, target: null, unit: '°F' },
      twin: { unit: 'lower', status: 'off' },
    });
    // the core integration's upper cavity: at temperature in °F, stop the one thing its operation lists
    expect(read(AT_WORK, 'rep-oven-thinq')).toMatchObject({
      status: 'preheating',
      heat: { current: 350, target: null, unit: '°F' },
    });
    expect(read(AT_WORK, 'rep-oven-thinq').commands.map((c) => c.action)).toEqual(['stop']);
    expect(read(HOUSE, 'rep-oven-thinq')).toMatchObject({ status: 'idle', commands: [] });
    // at rest its upper cavity says 0 °F: no reading, a dash — never "0 °F" in the hero
    expect(read(HOUSE, 'rep-oven-thinq').heat).toMatchObject({ current: null, unit: '°F' });
  });

  it('reads the fridge’s compartments from its climates, its temperatures from its sensors, its quick modes from its switches', () => {
    const fridge = read(HOUSE, 'rep-fridge');
    expect(fridge.zones).toEqual([
      { kind: 'fridge', setpoint: 'climate.fridge_fridge', current: 'sensor.fridge_fridge_temp' },
      {
        kind: 'freezer',
        setpoint: 'climate.fridge_freezer',
        current: 'sensor.fridge_freezer_temp',
      },
    ]);
    expect(fridge).toMatchObject({
      status: 'idle',
      boosts: [
        'switch.fridge_eco_friendly',
        'switch.fridge_express_mode_2',
        'switch.fridge_express_cool',
      ],
      door: { open: false },
    });
    // the attributes alone: its temperatures, in the unit named beside them
    const alone = bare(reporterHouse(NOW));
    expect(read(alone, 'rep-fridge').zones).toEqual([
      { kind: 'fridge', current: 'sensor.fridge#fridge_temp' },
      { kind: 'freezer', current: 'sensor.fridge#freezer_temp' },
    ]);
    expect(refView(alone, 'sensor.fridge#freezer_temp')).toMatchObject({
      status: 'ok',
      number: -16,
      unit: '°C',
    });
    // the core integration's: its setpoints by their location, its door, its express modes
    expect(read(HOUSE, 'rep-fridge-thinq')).toMatchObject({
      status: 'idle',
      zones: [
        { kind: 'fridge', setpoint: 'number.fridge_fridge_temperature' },
        { kind: 'freezer', setpoint: 'number.fridge_freezer_temperature' },
      ],
      boosts: ['switch.fridge_express_fridge', 'switch.fridge_express_mode'],
      roles: { door: 'binary_sensor.fridge_door' },
    });
  });

  it('lands every word the core integration’s statuses can say on one of the card’s ten, with its step', () => {
    const table: ReadonlyArray<
      readonly [
        'dishwasher' | 'washer' | 'oven' | 'dryer',
        string,
        ApplianceStatus | undefined,
        ApplianceStep?,
      ]
    > = [
      // the dishwasher's
      ['dishwasher', 'cancel', 'idle'],
      ['dishwasher', 'rinsing', 'running', 'rinse'],
      ['dishwasher', 'running', 'running'],
      ['dishwasher', 'drying', 'running', 'dry'],
      ['dishwasher', 'pause', 'paused'],
      ['dishwasher', 'reserved', 'scheduled'],
      ['dishwasher', 'power_fail', 'error'],
      ['dishwasher', 'error', 'error'],
      ['dishwasher', 'power_off', 'off'],
      ['dishwasher', 'night_dry', 'running', 'dry'],
      ['dishwasher', 'initial', 'idle'],
      ['dishwasher', 'end', 'finished'],
      // the washer's
      ['washer', 'sleep', 'off'],
      ['washer', 'power_off', 'off'],
      ['washer', 'spinning', 'running', 'spin'],
      ['washer', 'steam_softening', 'running', 'prewash'],
      ['washer', 'end', 'finished'],
      ['washer', 'drying', 'running'],
      ['washer', 'detecting', 'running', 'wash'],
      ['washer', 'running', 'running'],
      ['washer', 'rinsing', 'running', 'rinse'],
      ['washer', 'cool_down', 'running'],
      ['washer', 'rinse_hold', 'paused', 'rinse'],
      ['washer', 'refreshing', 'running'],
      ['washer', 'error', 'error'],
      ['washer', 'initial', 'idle'],
      ['washer', 'reserved', 'scheduled'],
      ['washer', 'pause', 'paused'],
      // the oven's
      ['oven', 'initial', 'idle'],
      ['oven', 'cooking_in_progress', 'running'],
      ['oven', 'preheating', 'preheating'],
      ['oven', 'cleaning_is_done', 'finished'],
      ['oven', 'cooling', 'running'],
      ['oven', 'cleaning', 'running'],
      ['oven', 'done', 'finished'],
      // his dryer's, by his own template
      ['dryer', 'off', 'off'],
      ['dryer', 'idle', 'idle'],
      ['dryer', 'starting', 'running'],
      ['dryer', 'running', 'running'],
      ['dryer', 'paused', 'paused'],
      ['dryer', 'user_paused', 'paused'],
      ['dryer', 'ending', 'running'],
      ['dryer', 'finished', 'finished'],
      ['dryer', 'anti_wrinkle', 'running', 'anti_crease'],
      ['dryer', 'delay_wait', 'scheduled'],
      ['dryer', 'interrupted', 'error'],
      ['dryer', 'force_stopped', 'idle'],
      ['dryer', 'unknown', undefined],
      ['dryer', 'clean', 'running'],
      // the older integration's, which says nothing with a dash or "N/A"
      ['washer', '-', undefined],
      ['washer', 'N/A', undefined],
    ];
    for (const [kind, word, status, step] of table) {
      expect(statusOfWord(word, 'lg_thinq', kind), `${kind} ${word}`).toBe(status);
      expect(stepOf(kind, word), `${kind} ${word}'s step`).toBe(step);
    }
  });

  it('reads the rinse aid’s dispenser level as a reminder, the softening level as the setting it is, and the tub-clean count against LG’s thirty', () => {
    const level = candidate('lg_thinq', 'sensor.d_rinse', 'rinse_level');
    const spec = maintenanceOf(level) as MaintenanceSpec;
    expect(spec).toEqual({ key: 'rinse_aid', form: 'steps' });
    const options = { options: [0, 1, 2, 3, 4].map((n) => `rinselevel_${n}`) };
    const at = (step: number) =>
      maintenanceItem(spec, state('sensor.d_rinse', `rinselevel_${step}`, options));
    expect(at(0)).toMatchObject({ severity: 'due', level: 0 });
    expect(at(1)).toMatchObject({ severity: 'soon', level: 25 });
    expect(at(2)).toMatchObject({ severity: 'ok', level: 50 });
    expect(at(4)).toMatchObject({ severity: 'ok', level: 100 });
    expect(
      maintenanceOf(candidate('lg_thinq', 'sensor.d_soft', 'softening_level')),
    ).toBeUndefined();
    const count = maintenanceOf(
      candidate('smartthinq_sensors', 'sensor.d_tub_clean_counter'),
    ) as MaintenanceSpec;
    expect(count).toEqual({ key: 'machine_care', form: 'count' });
    const cycles = (value: string) =>
      maintenanceItem(count, state('sensor.d_tub_clean_counter', value));
    expect(cycles('49')).toMatchObject({ severity: 'due', level: 0 });
    expect(cycles('30')).toMatchObject({ severity: 'due', level: 0 });
    expect(cycles('24')).toMatchObject({ severity: 'soon', level: 20 });
    expect(cycles('10')).toMatchObject({ severity: 'ok', level: 67 });
    expect(cycles('N/A')).toBeUndefined();
    // his core dishwasher: machine clean and the clean light on, the rinse aid at 2 of 4 fine
    expect(read(HOUSE, 'rep-dish-thinq').maintenance).toMatchObject([
      { key: 'machine_care', severity: 'due' },
      { key: 'clean', severity: 'due' },
      { key: 'rinse_aid', severity: 'ok', level: 50 },
    ]);
  });

  it('says the words Home Assistant has none for in the card’s own, and keeps Home Assistant’s where it has them', () => {
    // the core integration's words, untranslated (as the older integration's English come): the card's own
    const raw = read(AT_WORK, 'rep-dish-thinq');
    expect(raw).toMatchObject({ word: 'Rinsing', program: 'Auto' });
    const heavy = {
      ...AT_WORK,
      states: {
        ...AT_WORK.states,
        'sensor.dishwasher_current_status': {
          ...(AT_WORK.states['sensor.dishwasher_current_status'] as HassEntity),
          state: 'night_dry',
        },
        'sensor.dishwasher_current_cycle': {
          ...(AT_WORK.states['sensor.dishwasher_current_cycle'] as HassEntity),
          state: 'download_cycle',
        },
      },
    } as HomeAssistant;
    expect(read(heavy, 'rep-dish-thinq')).toMatchObject({
      word: 'Night dry',
      program: 'Downloaded cycle',
      step: 'dry',
    });
    // Home Assistant's own translation wins where it has one
    const german = {
      ...heavy,
      formatEntityState: (stateObj: HassEntity) =>
        stateObj.state === 'night_dry' ? 'Nachttrocknung' : stateObj.state,
    } as HomeAssistant;
    expect(read(german, 'rep-dish-thinq')).toMatchObject({ word: 'Nachttrocknung' });
  });

  it('tells the person when it is done through the older integration’s completed flag, as an attribute’s turn where it is one', () => {
    const plug = { running: 5, finishedAfter: 3 };
    const alone = bare(reporterHouse(NOW));
    const attribute = noticeTriggers(
      alone,
      findAppliance(alone, { device: 'rep-dish' }),
      'dishwasher',
      plug,
    );
    expect(attribute).toEqual([
      { kind: 'state', entity: 'sensor.dishwasher', attribute: 'run_completed', to: ['on'] },
    ]);
    const flag = noticeTriggers(
      HOUSE,
      findAppliance(HOUSE, { device: 'rep-washer' }),
      'washer',
      plug,
    );
    expect(flag).toEqual([
      { kind: 'state', entity: 'binary_sensor.washer_run_completed', to: ['on'] },
    ]);
    // the automation says the attribute, and reads back as written
    const notice = {
      id: 'fluvy_done_rep_dish',
      alias: 'Dishwasher: tell me when it’s done',
      triggers: attribute,
      title: 'Dishwasher',
      message: 'Dishwasher is done.',
    };
    const built = buildNotice(notice);
    expect(built.triggers[0]).toMatchObject({
      entity_id: 'sensor.dishwasher',
      attribute: 'run_completed',
      to: ['on'],
    });
    expect(parseNotice(built)?.triggers).toEqual(attribute);
  });

  it('is out of reach where the core washer’s remote start is off, and all there once it runs', () => {
    expect(read(HOUSE, 'rep-washer-thinq')).toMatchObject({ status: 'offline', unavailable: true });
    expect(read(AT_WORK, 'rep-washer-thinq')).toMatchObject({
      status: 'running',
      word: 'Spinning',
      step: 'spin',
      clock: { left: 9 * 60, total: 90 * 60 },
    });
    expect(read(AT_WORK, 'rep-washer-thinq').commands.map((c) => c.action)).toEqual([
      'stop',
      'power_off',
    ]);
  });
});
