import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { buildAutomation, type AutomationConfig, type Schedule } from './schedule.js';
import {
  apiMessage,
  AutomationStore,
  automationEntity,
  CONFIG_PATH,
  scheduleIds,
  workdaySensor,
} from './store.js';

const ID = 'fluvy_0123456789ab';
const OTHER = 'fluvy_abcdefabcdef';

const entity = (entity_id: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id,
  state: 'on',
  attributes: { friendly_name: entity_id, ...attributes },
  last_changed: '',
  last_updated: '',
});

const schedule: Schedule = {
  id: ID,
  alias: 'Kitchen',
  targets: ['light.kitchen'],
  days: { kind: 'every' },
  start: { kind: 'time', at: '06:45' },
  then: { verb: 'on', level: 70 },
};
const built = buildAutomation(schedule);

/** Home Assistant's frontend's failed `callApi`: the status and the body it carried. */
const refusal = (status: number, body: unknown) => ({
  error: `Response error: ${status}`,
  status_code: status,
  body,
});

/** A house with two schedules, a plain automation and one from YAML, and an API that answers as told. */
function fixture(
  options: {
    admin?: boolean;
    api?: (method: string, path: string, body?: unknown) => unknown;
  } = {},
) {
  const subscriptions: { callback: (event: unknown) => void; message: Record<string, unknown> }[] =
    [];
  const unsubscribe = vi.fn();
  const connection = {
    subscribeMessage: vi.fn(
      async (callback: (event: unknown) => void, message: Record<string, unknown>) => {
        subscriptions.push({ callback, message });
        return unsubscribe;
      },
    ),
  };
  const callApi = vi.fn(async (method: string, path: string, body?: unknown) =>
    options.api ? options.api(method, path, body) : { ...built },
  );
  const hass = {
    states: {
      'automation.kitchen': entity('automation.kitchen', { id: ID }),
      'automation.other': entity('automation.other', { id: OTHER }),
      'automation.plain': entity('automation.plain', { id: '1700000000000' }),
      'automation.yaml': entity('automation.yaml'),
      'light.kitchen': entity('light.kitchen'),
    },
    entities: {},
    user: { id: 'u1', name: 'Marta', is_admin: options.admin ?? true },
    connection,
    callApi,
  } as unknown as HomeAssistant;
  const reload = (): void => {
    for (const { callback } of subscriptions)
      callback({ event_type: 'automation_reloaded', data: {} });
  };
  return { hass, callApi, connection, subscriptions, unsubscribe, reload };
}

const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

afterEach(() => vi.useRealTimers());

describe('AutomationStore', () => {
  it('is one per connection, reading the hass handed in last', () => {
    const { hass } = fixture();
    const store = AutomationStore.for(hass);
    expect(AutomationStore.for({ ...hass } as HomeAssistant)).toBe(store);
    expect(AutomationStore.for(fixture().hass)).not.toBe(store);
    expect(store.admin).toBe(true);
    expect(
      AutomationStore.for({
        ...hass,
        user: { id: 'u2', name: 'Guest', is_admin: false },
      } as HomeAssistant).admin,
    ).toBe(false);
    expect(store.admin).toBe(false);
  });

  it('reads a config once, keeps it, and asks only for schedules the house has', async () => {
    const { hass, callApi } = fixture();
    const store = AutomationStore.for(hass);
    expect(store.config(ID)).toBeUndefined();
    await store.load([ID, ID, '1700000000000', 'fluvy_000000000000', 'nonsense']);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('GET', CONFIG_PATH + ID);
    expect(store.config(ID)).toEqual(built);
    expect(store.error(ID)).toBeUndefined();
    await store.load([ID]);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('asks once while an answer is on its way', async () => {
    const answers: ((config: AutomationConfig) => void)[] = [];
    const { hass, callApi } = fixture({
      api: () => new Promise((resolve) => answers.push(resolve)),
    });
    const store = AutomationStore.for(hass);
    const first = store.load([ID]);
    const second = store.load([ID, OTHER]);
    expect(callApi).toHaveBeenCalledTimes(2);
    for (const answer of answers) answer(built);
    await Promise.all([first, second]);
    expect(store.config(ID)).toEqual(built);
    expect(store.config(OTHER)).toEqual(built);
  });

  it('never asks for anyone but an administrator', async () => {
    const { hass, callApi, connection } = fixture({ admin: false });
    const store = AutomationStore.for(hass);
    await store.load([ID]);
    expect(callApi).not.toHaveBeenCalled();
    await expect(store.save(ID, built)).rejects.toThrow();
    await expect(store.remove(ID)).rejects.toThrow();
    expect(callApi).not.toHaveBeenCalled();
    const unsubscribe = store.subscribe(() => undefined);
    expect(connection.subscribeMessage).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('hears automations reload: every config stale, shown meanwhile, read again when asked', async () => {
    const { hass, callApi, connection, reload } = fixture();
    const store = AutomationStore.for(hass);
    const heard = vi.fn();
    store.subscribe(heard);
    expect(connection.subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'subscribe_events',
      event_type: 'automation_reloaded',
    });
    await store.load([ID]);
    expect(heard).toHaveBeenCalledTimes(1);
    reload();
    reload();
    await flush();
    expect(heard).toHaveBeenCalledTimes(2); // two events, one word
    expect(store.config(ID)).toEqual(built); // stale, and still there
    await store.load([ID]);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("closes the socket's events with the last listener, once", async () => {
    const { hass, connection, unsubscribe } = fixture();
    const store = AutomationStore.for(hass);
    const first = store.subscribe(() => undefined);
    const second = store.subscribe(() => undefined);
    await flush();
    expect(connection.subscribeMessage).toHaveBeenCalledTimes(1);
    first();
    first();
    expect(unsubscribe).not.toHaveBeenCalled();
    second();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    // the next listener opens them again
    store.subscribe(() => undefined);
    expect(connection.subscribeMessage).toHaveBeenCalledTimes(2);
  });

  it('writes the built config only, and holds it stale until the next read', async () => {
    const { hass, callApi } = fixture({
      api: (method) => (method === 'POST' ? { result: 'ok' } : { ...built }),
    });
    const store = AutomationStore.for(hass);
    const heard = vi.fn();
    store.subscribe(heard);
    // the same config with its keys in another order is the same config
    const shuffled = {
      mode: 'single',
      actions: built.actions,
      conditions: [],
      triggers: built.triggers,
      alias: 'Kitchen',
      id: ID,
    } as AutomationConfig;
    await store.save(ID, shuffled);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('POST', CONFIG_PATH + ID, built);
    expect(JSON.stringify(callApi.mock.calls[0]?.[2])).toBe(JSON.stringify(built));
    expect(store.config(ID)).toEqual(built);
    await flush();
    expect(heard).toHaveBeenCalledTimes(1);
    await store.load([ID]);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenLastCalledWith('GET', CONFIG_PATH + ID);
  });

  it('refuses to write anything but a schedule of its own shape', async () => {
    const { hass, callApi } = fixture();
    const store = AutomationStore.for(hass);
    await expect(store.save('morning', { ...built, id: 'morning' })).rejects.toThrow(/schedule id/);
    await expect(store.save(OTHER, built)).rejects.toThrow(/shape/);
    await expect(
      store.save(ID, { ...built, variables: { x: 1 } } as AutomationConfig),
    ).rejects.toThrow(/shape/);
    await expect(
      store.save(ID, { ...built, mode: 'restart' } as unknown as AutomationConfig),
    ).rejects.toThrow(/shape/);
    await expect(
      store.save(ID, {
        ...built,
        actions: [{ ...built.actions[0], data: { brightness_pct: 70, color_name: 'red' } }],
      } as unknown as AutomationConfig),
    ).rejects.toThrow(/shape/);
    await expect(store.remove('morning')).rejects.toThrow(/schedule id/);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('passes on what Home Assistant said about a refused write', async () => {
    const malformed = refusal(400, {
      message: "Message malformed: extra keys not allowed @ data['x']",
    });
    const { hass } = fixture({
      api: (method) => {
        if (method === 'POST') throw malformed;
        return { ...built };
      },
    });
    const store = AutomationStore.for(hass);
    await expect(store.save(ID, built)).rejects.toBe(malformed);
    expect(apiMessage(malformed)).toBe("Message malformed: extra keys not allowed @ data['x']");
    expect(apiMessage(refusal(500, 'Internal Server Error'))).toBe('Internal Server Error');
    expect(apiMessage(refusal(404, null))).toBe('');
    expect(apiMessage(new Error('Failed to fetch'))).toBe('');
    expect(apiMessage(undefined)).toBe('');
  });

  it('deletes a schedule and forgets it', async () => {
    const { hass, callApi } = fixture({
      api: (method) => (method === 'DELETE' ? { result: 'ok' } : { ...built }),
    });
    const store = AutomationStore.for(hass);
    await store.load([ID]);
    await store.remove(ID);
    expect(callApi).toHaveBeenLastCalledWith('DELETE', CONFIG_PATH + ID);
    expect(store.config(ID)).toBeUndefined();
  });

  it('waits longer after each failed read: 30 s, 2 min, then 10 min', async () => {
    vi.useFakeTimers();
    const { hass, callApi } = fixture({
      api: () => {
        throw refusal(500, { message: 'Something went wrong' });
      },
    });
    const store = AutomationStore.for(hass);
    const expectCalls = async (after: number, calls: number): Promise<void> => {
      vi.advanceTimersByTime(after);
      await store.load([ID]);
      expect(callApi).toHaveBeenCalledTimes(calls);
    };
    await expectCalls(0, 1);
    expect(store.error(ID)).toBe('Something went wrong');
    expect(store.config(ID)).toBeUndefined();
    await expectCalls(29_000, 1);
    await expectCalls(1_000, 2);
    await expectCalls(119_000, 2);
    await expectCalls(1_000, 3);
    await expectCalls(599_000, 3);
    await expectCalls(1_000, 4);
    await expectCalls(599_000, 4);
    await expectCalls(1_000, 5);
  });

  it('waits for a reload after a config Home Assistant does not have', async () => {
    vi.useFakeTimers();
    let present = false;
    const { hass, callApi, reload } = fixture({
      api: () => {
        if (!present) throw refusal(404, { message: 'Resource not found' });
        return { ...built };
      },
    });
    const store = AutomationStore.for(hass);
    store.subscribe(() => undefined);
    await store.load([ID]);
    expect(store.error(ID)).toBe('Resource not found');
    vi.advanceTimersByTime(3_600_000);
    await store.load([ID]);
    expect(callApi).toHaveBeenCalledTimes(1);
    present = true;
    reload();
    await store.load([ID]);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(store.config(ID)).toEqual(built);
    expect(store.error(ID)).toBeUndefined();
  });

  it('keeps a config that is not an object away', async () => {
    const { hass } = fixture({ api: () => 'yes' });
    const store = AutomationStore.for(hass);
    await store.load([ID]);
    expect(store.config(ID)).toBeUndefined();
    expect(store.error(ID)).toBeUndefined();
  });
});

describe('the automation entities', () => {
  it('finds an automation by its config id, and the schedules among them', () => {
    const { hass } = fixture();
    expect(automationEntity(hass, ID)?.entity_id).toBe('automation.kitchen');
    expect(automationEntity(hass, '1700000000000')?.entity_id).toBe('automation.plain');
    expect(automationEntity(hass, 'automation.yaml')).toBeUndefined();
    expect(scheduleIds(hass).sort()).toEqual([ID, OTHER]);
    // the index follows the states object: a new house, a new index
    const moved = {
      ...hass,
      states: { 'automation.moved': entity('automation.moved', { id: ID }) },
    } as HomeAssistant;
    expect(automationEntity(moved, ID)?.entity_id).toBe('automation.moved');
    expect(automationEntity(hass, ID)?.entity_id).toBe('automation.kitchen');
  });

  it('names the workday sensor by the registry first, then by its usual id', () => {
    const { hass } = fixture();
    expect(workdaySensor(hass)).toBeUndefined();
    const usual = {
      ...hass,
      states: {
        ...hass.states,
        'binary_sensor.workday_sensor': entity('binary_sensor.workday_sensor'),
      },
    } as HomeAssistant;
    expect(workdaySensor(usual)).toBe('binary_sensor.workday_sensor');
    const registered = {
      ...usual,
      states: {
        ...usual.states,
        'binary_sensor.office_day': entity('binary_sensor.office_day'),
        'binary_sensor.madrid': entity('binary_sensor.madrid'),
      },
      entities: {
        'binary_sensor.office_day': { entity_id: 'binary_sensor.office_day', platform: 'workday' },
        'binary_sensor.madrid': { entity_id: 'binary_sensor.madrid', platform: 'workday' },
        'binary_sensor.gone': { entity_id: 'binary_sensor.gone', platform: 'workday' },
        'sensor.workday_count': { entity_id: 'sensor.workday_count', platform: 'workday' },
      },
    } as unknown as HomeAssistant;
    expect(workdaySensor(registered)).toBe('binary_sensor.madrid');
  });
});
