import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { describe, expect, it, vi } from 'vitest';
import {
  cycleOf,
  cycleOfFlag,
  drawn,
  energySince,
  inBase,
  LOOK_BACK,
  PlugHistory,
  valueAt,
  type Point,
} from './plug.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const MINUTE = 60_000;
const SETTINGS = { running: 5, finishedAfter: 3 * MINUTE, doneFor: 120 * MINUTE };

/** Readings, as [minutes before now, watts]. */
const points = (...readings: ReadonlyArray<readonly [number, number]>): Point[] =>
  readings.map(([ago, value]) => ({ at: NOW - ago * MINUTE, value }));

const state = (id: string, value: string, changed: number, unit?: string): HassEntity => ({
  entity_id: id,
  state: value,
  attributes: unit ? { unit_of_measurement: unit } : {},
  last_changed: new Date(changed).toISOString(),
  last_updated: new Date(changed).toISOString(),
  context: { id: '', parent_id: null, user_id: null },
});

describe('a plug’s cycle, by its power', () => {
  it('runs from the first reading at the running power', () => {
    expect(cycleOf(points([90, 0.4], [42, 2050], [10, 410]), NOW, SETTINGS)).toEqual({
      status: 'running',
      start: NOW - 42 * MINUTE,
      end: null,
    });
  });

  it('keeps running through a soak or a pause under the threshold that does not last', () => {
    // under half the running power for two minutes, then washing again
    const soak = points([42, 2050], [22, 2.1], [20, 410]);
    expect(cycleOf(soak, NOW, SETTINGS).status).toBe('running');
    // between half the running power and it, the cycle keeps what it was (no flicker at the edge)
    const edge = points([42, 2050], [30, 3], [2, 3]);
    expect(cycleOf(edge, NOW, SETTINGS).status).toBe('running');
  });

  it('finishes where the power fell and stayed under half the running power for `finished_after`', () => {
    const run = points([138, 2400], [52, 600], [48, 0.4]);
    expect(cycleOf(run, NOW, SETTINGS)).toEqual({
      status: 'finished',
      start: NOW - 138 * MINUTE,
      end: NOW - 48 * MINUTE,
    });
    // fallen a minute ago: not yet over
    expect(cycleOf(points([30, 500], [1, 0.4]), NOW, SETTINGS).status).toBe('running');
  });

  it('is at rest once its finish is older than `done_for`, and with no cycle at all', () => {
    expect(cycleOf(points([300, 500], [200, 0.2]), NOW, SETTINGS)).toMatchObject({
      status: 'idle',
      end: NOW - 200 * MINUTE,
    });
    expect(cycleOf(points([600, 0.3]), NOW, SETTINGS)).toEqual({
      status: 'idle',
      start: null,
      end: null,
    });
  });

  it('a second cycle after a finished one is the cycle', () => {
    const two = points([300, 500], [250, 0.2], [20, 800]);
    expect(cycleOf(two, NOW, SETTINGS)).toEqual({
      status: 'running',
      start: NOW - 20 * MINUTE,
      end: null,
    });
  });

  it('a threshold sensor says it outright: on since it turned on, off finished for a while', () => {
    expect(
      cycleOfFlag(state('binary_sensor.w', 'on', NOW - 30 * MINUTE), NOW, SETTINGS.doneFor),
    ).toEqual({
      status: 'running',
      start: NOW - 30 * MINUTE,
      end: null,
    });
    expect(
      cycleOfFlag(state('binary_sensor.w', 'off', NOW - 10 * MINUTE), NOW, SETTINGS.doneFor),
    ).toMatchObject({ status: 'finished', end: NOW - 10 * MINUTE });
    expect(
      cycleOfFlag(state('binary_sensor.w', 'off', NOW - 300 * MINUTE), NOW, SETTINGS.doneFor)
        .status,
    ).toBe('idle');
    expect(
      cycleOfFlag(state('binary_sensor.w', 'unavailable', NOW), NOW, SETTINGS.doneFor).status,
    ).toBe('idle');
  });
});

describe('what a cycle used', () => {
  it('is its meter’s gain since the cycle started', () => {
    const meter = points([600, 181.56], [42, 181.56], [30, 181.98], [6, 182.31]);
    expect(valueAt(meter, NOW - 42 * MINUTE)).toBe(181.56);
    expect(energySince(meter, NOW - 42 * MINUTE, NOW)).toBeCloseTo(0.75, 5);
    // a meter that restarted counts from zero; one with nothing that old says nothing
    expect(energySince(points([60, 12], [5, 0.4]), NOW - 60 * MINUTE, NOW)).toBeCloseTo(0.4, 5);
    expect(energySince(points([5, 1]), NOW - 60 * MINUTE, NOW)).toBeNull();
  });

  it('else what the plug drew, each reading held until the next', () => {
    // 2 kW for half an hour, then 0.5 kW for half an hour: 1.25 kWh
    expect(drawn(points([60, 2000], [30, 500]), NOW - 60 * MINUTE, NOW)).toBeCloseTo(1.25, 5);
    // only what falls inside the window
    expect(drawn(points([60, 2000], [30, 500]), NOW - 45 * MINUTE, NOW)).toBeCloseTo(0.75, 5);
  });

  it('reads power in watts and energy in kilowatt-hours, whatever their unit', () => {
    expect(inBase('1.2', 'kW')).toBe(1200);
    expect(inBase('410', 'Wh')).toBeCloseTo(0.41, 5);
    expect(inBase('3', 'MWh')).toBe(3000);
    expect(inBase('unavailable', 'W')).toBeNull();
  });
});

describe('a plug’s history', () => {
  it('is fetched once — the last twelve hours, raw, as one call — then kept by the live states', async () => {
    const callWS = vi.fn(async () => ({
      'sensor.p': [
        { s: '0.4', lu: (NOW - 600 * MINUTE) / 1000 },
        { s: '2050', lu: (NOW - 42 * MINUTE) / 1000 },
      ],
      'sensor.e': [{ s: '181.56', lu: (NOW - 600 * MINUTE) / 1000 }],
    }));
    const states: Record<string, HassEntity> = {
      'sensor.p': state('sensor.p', '410', NOW - 10 * MINUTE, 'W'),
      'sensor.e': state('sensor.e', '182.3', NOW - 5 * MINUTE, 'kWh'),
    };
    const hass = { callWS, states } as unknown as HomeAssistant;
    const landed = vi.fn();
    const history = new PlugHistory(landed);
    const first = history.read(hass, { watts: 'sensor.p', energy: 'sensor.e' }, NOW);
    expect(first.loaded).toBe(false);
    await vi.waitFor(() => expect(landed).toHaveBeenCalledTimes(1));
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history/history_during_period',
        start_time: new Date(NOW - LOOK_BACK).toISOString(),
        entity_ids: ['sensor.p', 'sensor.e'],
        minimal_response: true,
        no_attributes: true,
      }),
    );
    const read = history.read(hass, { watts: 'sensor.p', energy: 'sensor.e' }, NOW);
    expect(read.loaded).toBe(true);
    expect(read.watts.map((point) => point.value)).toEqual([0.4, 2050, 410]);
    expect(read.energy.map((point) => point.value)).toEqual([181.56, 182.3]);
    // a new live reading is kept; nothing is asked again
    states['sensor.p'] = state('sensor.p', '0.4', NOW - MINUTE, 'W');
    expect(history.read(hass, { watts: 'sensor.p', energy: 'sensor.e' }, NOW).watts).toHaveLength(
      4,
    );
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it('a recorder that cannot be read leaves the live states', async () => {
    const hass = {
      callWS: vi.fn(async () => {
        throw new Error('no recorder');
      }),
      states: { 'sensor.p': state('sensor.p', '410', NOW - 10 * MINUTE, 'W') },
    } as unknown as HomeAssistant;
    const landed = vi.fn();
    const history = new PlugHistory(landed);
    history.read(hass, { watts: 'sensor.p' }, NOW);
    await vi.waitFor(() => expect(landed).toHaveBeenCalled());
    const read = history.read(hass, { watts: 'sensor.p' }, NOW);
    expect(read.loaded).toBe(true);
    expect(read.watts).toEqual([{ at: NOW - 10 * MINUTE, value: 410 }]);
  });
});
