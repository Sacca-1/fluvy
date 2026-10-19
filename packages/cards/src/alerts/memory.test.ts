// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { AlertEngine } from './engine.js';
import { change, house, iso, MINUTE, NOW } from './fixture.js';
import {
  DEVICE_KEY,
  memoryFor,
  MEMORY_KEY,
  NOTHING,
  OFF,
  parseRemembered,
  prune,
  snoozeAlert,
  snoozeEnd,
  SNOOZE_CHOICES,
  SNOOZE_WORDS,
} from './memory.js';
import { definitionOf } from './model.js';

/** A house with a socket: frontend data kept per layer, subscriptions heard, every message recorded. */
function connected(options: { admin?: boolean; stored?: unknown; refuse?: boolean } = {}) {
  const data: Record<string, unknown> = { user: options.stored ?? null, system: null };
  const listeners: { layer: string; callback: (message: { value: unknown }) => void }[] = [];
  const unsubscribe = vi.fn();
  const layer = (type: string): string => (type.includes('system') ? 'system' : 'user');
  const connection = {
    subscribeMessage: vi.fn(
      async (
        callback: (message: { value: unknown }) => void,
        message: { type: string; key: string },
      ) => {
        expect(message.key).toBe(MEMORY_KEY);
        listeners.push({ layer: layer(message.type), callback });
        return unsubscribe;
      },
    ),
  };
  const callWS = vi.fn(async (message: { type: string; key: string; value?: unknown }) => {
    expect(message.key).toBe(MEMORY_KEY);
    if (message.type.startsWith('frontend/get_')) return { value: data[layer(message.type)] };
    if (options.refuse || (message.type === 'frontend/set_system_data' && !options.admin))
      throw new Error('Unauthorized');
    data[layer(message.type)] = message.value;
    return null;
  });
  const hass = {
    ...house(
      {
        'lock.front': { state: 'unlocked', changed: NOW - 5 * MINUTE },
        'lock.back': { state: 'unlocked', changed: NOW - 2 * MINUTE },
      },
      { admin: options.admin ?? true },
    ),
    connection,
    callWS,
  } as unknown as HomeAssistant;
  /** Home Assistant says the stored value (another device wrote it). */
  const say = (where: string, value: unknown): void => {
    data[where] = value;
    for (const listener of listeners) if (listener.layer === where) listener.callback({ value });
  };
  return { hass, connection, callWS, unsubscribe, say, data };
}

const sets = (callWS: ReturnType<typeof connected>['callWS']) =>
  callWS.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type.startsWith('frontend/set_'));

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('what is remembered', () => {
  it('is read leniently', () => {
    expect(parseRemembered(null)).toEqual(NOTHING);
    expect(parseRemembered({ v: 2, snoozed: { a: 1 } })).toEqual(NOTHING);
    expect(
      parseRemembered({
        v: 1,
        snoozed: { a: 5, b: 'x' },
        acked: { c: { 'lock.a': 'then', 'lock.b': 3 }, d: 4 },
      }),
    ).toEqual({ v: 1, snoozed: { a: 5 }, acked: { c: { 'lock.a': 'then' } } });
  });

  it('is pruned of ended snoozes and of acknowledgements whose entity changed or left', () => {
    const states = house({ 'lock.a': { state: 'unlocked', changed: NOW - MINUTE } }).states;
    expect(
      prune(
        {
          v: 1,
          snoozed: { over: NOW - 1, on: NOW + 1 },
          acked: {
            locks: { 'lock.a': iso(NOW - MINUTE), 'lock.gone': iso(NOW) },
            moved: { 'lock.a': iso(NOW - 2 * MINUTE) },
          },
        },
        NOW,
        states,
      ),
    ).toEqual({
      v: 1,
      snoozed: { on: NOW + 1 },
      acked: { locks: { 'lock.a': iso(NOW - MINUTE) } },
    });
  });
});

describe('the person’s memory (frontend user data)', () => {
  it('is one store per connection, subscribed while someone listens', async () => {
    const { hass, connection, unsubscribe, say } = connected();
    const memory = memoryFor(hass);
    expect(memoryFor({ ...hass })).toBe(memory);
    expect(memoryFor({ ...hass, connection: { ...hass.connection } })).not.toBe(memory);
    expect(memory).toMatchObject({ scope: 'user', writable: true });

    const heard = vi.fn();
    const stop = memory.subscribe(heard);
    const again = memory.subscribe(() => undefined);
    await Promise.resolve();
    expect(connection.subscribeMessage).toHaveBeenCalledTimes(1);
    expect(connection.subscribeMessage.mock.calls[0]?.[1]).toEqual({
      type: 'frontend/subscribe_user_data',
      key: MEMORY_KEY,
    });
    say('user', { v: 1, snoozed: { doors: NOW + MINUTE }, acked: {} });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(memory.snoozedUntil('doors')).toBe(NOW + MINUTE);
    // the same value again is nothing new
    const version = memory.version;
    say('user', { v: 1, snoozed: { doors: NOW + MINUTE }, acked: {} });
    expect(memory.version).toBe(version);
    stop();
    again();
    await Promise.resolve();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('writes once per snooze, merged with what Home Assistant last said', async () => {
    vi.useFakeTimers({ now: NOW });
    const { hass, callWS, say } = connected();
    const memory = memoryFor(hass);
    const stop = memory.subscribe(() => undefined);
    await Promise.resolve();
    // another device snoozed the doors
    say('user', { v: 1, snoozed: { doors: NOW + 60 * MINUTE }, acked: {} });
    await memory.snooze('locks', NOW + 8 * 60 * MINUTE);
    expect(sets(callWS)).toEqual([
      {
        type: 'frontend/set_user_data',
        key: MEMORY_KEY,
        value: {
          v: 1,
          snoozed: { doors: NOW + 60 * MINUTE, locks: NOW + 8 * 60 * MINUTE },
          acked: {},
        },
      },
    ]);
    // no read: the subscription had said it
    expect(callWS.mock.calls.some(([message]) => message.type.startsWith('frontend/get_'))).toBe(
      false,
    );
    stop();
  });

  it('reads the stored value once before a first write nobody subscribed for', async () => {
    vi.useFakeTimers({ now: NOW });
    const { hass, callWS } = connected({
      stored: { v: 1, snoozed: { doors: NOW + MINUTE }, acked: {} },
    });
    const memory = memoryFor(hass);
    await Promise.all([memory.snooze('a', NOW + 2 * MINUTE), memory.snooze('b', NOW + 3 * MINUTE)]);
    expect(
      callWS.mock.calls.filter(([message]) => message.type === 'frontend/get_user_data'),
    ).toHaveLength(1);
    expect(sets(callWS).at(-1)?.value).toEqual({
      v: 1,
      snoozed: { doors: NOW + MINUTE, a: NOW + 2 * MINUTE, b: NOW + 3 * MINUTE },
      acked: {},
    });
  });

  it('says what Home Assistant keeps again when it refuses a write', async () => {
    vi.useFakeTimers({ now: NOW });
    const kept = { v: 1, snoozed: { doors: NOW + MINUTE }, acked: {} };
    const { hass } = connected({ stored: kept, refuse: true });
    const memory = memoryFor(hass);
    await expect(memory.snooze('locks', NOW + 60 * MINUTE)).rejects.toThrow('Unauthorized');
    expect(memory.snoozedUntil('locks')).toBeUndefined();
    expect(memory.snoozedUntil('doors')).toBe(NOW + MINUTE);
  });

  it('acknowledges beside what was acknowledged, and wakes an alert', async () => {
    vi.useFakeTimers({ now: NOW });
    const { hass } = connected();
    const memory = memoryFor(hass);
    const front = hass.states['lock.front']?.last_changed ?? '';
    const back = hass.states['lock.back']?.last_changed ?? '';
    await memory.acknowledge('locks', { 'lock.front': front });
    await memory.acknowledge('locks', { 'lock.back': back });
    await memory.snooze('locks', NOW + MINUTE);
    expect(memory.acknowledged('locks')).toEqual({ 'lock.front': front, 'lock.back': back });
    await memory.wake('locks');
    expect(memory.acknowledged('locks')).toBeUndefined();
    expect(memory.snoozedUntil('locks')).toBeUndefined();
  });
});

describe('the house’s memory (frontend system data)', () => {
  it('is written by an administrator only: for anyone else it offers no snooze', async () => {
    const guest = connected({ admin: false });
    const memory = memoryFor(guest.hass, 'house');
    expect(memory).toMatchObject({ scope: 'house', writable: false });
    await memory.snooze('doors', NOW + MINUTE);
    expect(guest.callWS).not.toHaveBeenCalled();

    const admin = connected({ admin: true });
    await memoryFor(admin.hass, 'house').snooze('doors', NOW + 60 * MINUTE);
    expect(sets(admin.callWS).map((message) => message.type)).toEqual(['frontend/set_system_data']);
  });
});

describe('this device’s memory', () => {
  it('lives in this browser’s storage, shared with its other tabs', async () => {
    vi.useFakeTimers({ now: NOW });
    const { hass, callWS } = connected();
    const memory = memoryFor(hass, 'device');
    expect(memory).toMatchObject({ scope: 'device', writable: true });
    await memory.snooze('doors', NOW + MINUTE);
    expect(JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '{}')).toEqual({
      v: 1,
      snoozed: { doors: NOW + MINUTE },
      acked: {},
    });
    expect(callWS).not.toHaveBeenCalled();

    const heard = vi.fn();
    const stop = memory.subscribe(heard);
    localStorage.setItem(
      DEVICE_KEY,
      JSON.stringify({ v: 1, snoozed: { locks: NOW + MINUTE }, acked: {} }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: DEVICE_KEY }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(memory.snoozedUntil('locks')).toBe(NOW + MINUTE);
    expect(memory.snoozedUntil('doors')).toBeUndefined();
    stop();
  });

  it('is nothing with `off`', async () => {
    const { hass } = connected();
    expect(memoryFor(hass, 'off')).toBe(OFF);
    expect(OFF.writable).toBe(false);
    await OFF.snooze('doors', NOW + MINUTE);
    expect(OFF.snoozedUntil('doors')).toBeUndefined();
  });
});

describe('snoozing', () => {
  it('offers an hour, eight, tomorrow morning and until it changes, each with its words', () => {
    expect(SNOOZE_CHOICES).toEqual(['hour', 'hours', 'tomorrow', 'changes']);
    expect(SNOOZE_WORDS.hour).toEqual(['alerts.snooze.for', { n: 1 }]);
    expect(SNOOZE_WORDS.tomorrow).toEqual(['common.tomorrow']);
  });

  it('ends at its instant: tomorrow is eight in the morning in the house’s zone', () => {
    expect(snoozeEnd('hour', NOW, 'UTC')).toBe(NOW + 60 * MINUTE);
    expect(snoozeEnd('hours', NOW, 'UTC')).toBe(NOW + 8 * 60 * MINUTE);
    expect(snoozeEnd('tomorrow', NOW, 'UTC')).toBe(Date.UTC(2026, 9, 18, 8));
    expect(snoozeEnd('tomorrow', Date.UTC(2026, 9, 17, 23, 30), 'Europe/Madrid')).toBe(
      Date.UTC(2026, 9, 19, 6),
    );
  });

  it('quiets an alert in the engine until the snooze ends, or each entity until it changes', async () => {
    let clock = NOW;
    vi.useFakeTimers({ now: NOW });
    const { hass } = connected();
    const memory = memoryFor(hass);
    const engine = new AlertEngine(
      [definitionOf({ preset: 'unlocked', id: 'locks', for: 0 }, 0, 'card')],
      {
        now: () => clock,
      },
    );
    let [locks] = engine.evaluate(hass, memory).shown;
    expect(locks?.count).toBe(2);

    await snoozeAlert(memory, hass, locks!, 'hour', NOW);
    expect(engine.evaluate(hass, memory).shown).toEqual([]);
    clock = NOW + 60 * MINUTE;
    [locks] = engine.evaluate(hass, memory).shown;
    expect(locks?.count).toBe(2);

    await snoozeAlert(memory, hass, locks!, 'changes');
    expect(engine.evaluate(hass, memory).shown).toEqual([]);
    const relocked = change(hass, 'lock.back', { state: 'unlocked', changed: clock });
    expect(engine.evaluate(relocked, memory).shown[0]?.rows.map((row) => row.id)).toEqual([
      'lock.back',
    ]);
  });
});
