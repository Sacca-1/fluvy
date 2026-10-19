import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it, vi } from 'vitest';
import { buildNotice, noticeId, parseNotice, type Notice } from './notice.js';
import { AutomationStore } from './store.js';

/** A washer's notice without a phone to tell: Home Assistant's own notifications. */
const QUIET: Notice = {
  id: 'fluvy_done_0123456789abcdef0123456789abcdef',
  alias: 'Washing machine: tell me when it’s done',
  triggers: [
    { kind: 'event', entity: 'event.washer_notification', types: ['washing_is_complete'] },
  ],
  title: 'Washing machine',
  message: 'Washing machine is done.',
};
const WASHER: Notice = { ...QUIET, phone: 'mobile_app_pixel_9' };

describe('“Tell me when it’s done”: the automation an appliance’s card writes (#47)', () => {
  it('is a native automation: what ends the cycle, then a notification on the phone', () => {
    expect(buildNotice(WASHER)).toEqual({
      id: WASHER.id,
      alias: WASHER.alias,
      // a new event, never a change of its attributes alone; its type is the condition's
      triggers: [
        {
          trigger: 'state',
          entity_id: 'event.washer_notification',
          to: null,
          not_from: ['unavailable', 'unknown'],
        },
      ],
      conditions: [
        {
          condition: 'state',
          entity_id: 'event.washer_notification',
          attribute: 'event_type',
          state: ['washing_is_complete'],
        },
      ],
      actions: [
        {
          action: 'notify.mobile_app_pixel_9',
          data: { title: 'Washing machine', message: 'Washing machine is done.' },
        },
      ],
      mode: 'single',
    });
  });

  it('hears a state that says finished, a plug falling quiet, a running sensor going off', () => {
    const notice = (triggers: Notice['triggers']) => buildNotice({ ...QUIET, triggers });
    expect(
      notice([{ kind: 'state', entity: 'sensor.dish_state', to: ['finished'] }]).triggers,
    ).toEqual([
      {
        trigger: 'state',
        entity_id: 'sensor.dish_state',
        to: ['finished'],
        not_from: ['unavailable', 'unknown'],
      },
    ]);
    expect(
      notice([{ kind: 'below', entity: 'sensor.plug_power', below: 2.5, minutes: 3 }]).triggers,
    ).toEqual([
      { trigger: 'numeric_state', entity_id: 'sensor.plug_power', below: 2.5, for: { minutes: 3 } },
    ]);
    const off = notice([{ kind: 'off', entity: 'binary_sensor.washer_running' }]);
    expect(off.triggers).toEqual([
      { trigger: 'state', entity_id: 'binary_sensor.washer_running', from: 'on', to: 'off' },
    ]);
    // without the app on a phone: Home Assistant's own notifications, one an appliance
    expect(off.conditions).toEqual([]);
    expect(off.actions).toEqual([
      {
        action: 'persistent_notification.create',
        data: {
          title: 'Washing machine',
          message: 'Washing machine is done.',
          notification_id: WASHER.id,
        },
      },
    ]);
  });

  it('reads back exactly what it writes, and nothing else', () => {
    const notices: Notice[] = [
      WASHER,
      {
        ...QUIET,
        triggers: [
          { kind: 'state', entity: 'sensor.a', to: ['end', 'finished'] },
          { kind: 'state', entity: 'sensor.b', to: ['finish'] },
        ],
      },
      { ...WASHER, triggers: [{ kind: 'below', entity: 'sensor.p', below: 5, minutes: 10 }] },
    ];
    for (const notice of notices) {
      const read = parseNotice(buildNotice(notice));
      expect(read).toEqual(notice);
      expect(buildNotice(read!)).toEqual(buildNotice(notice));
    }
    const config = buildNotice(WASHER) as unknown as Record<string, unknown>;
    // another id, a template, another action, a key more: not the shape it writes
    expect(parseNotice({ ...config, id: 'fluvy_0123456789ab' })).toBeUndefined();
    expect(
      parseNotice({
        ...config,
        actions: [{ action: 'script.turn_on', data: { title: '', message: '' } }],
      }),
    ).toBeUndefined();
    expect(parseNotice({ ...config, description: 'x' })).toBeUndefined();
    expect(parseNotice({ ...config, conditions: [] })).toBeUndefined();
  });

  it('is named by its appliance: a device’s id, or a plug’s entity', () => {
    expect(noticeId('0123456789abcdef0123456789ABCDEF')).toBe(
      'fluvy_done_0123456789abcdef0123456789abcdef',
    );
    expect(noticeId('switch.kettle')).toBe('fluvy_done_switch_kettle');
  });

  it('is written through the store, by an administrator, only in its own shape; and removed', async () => {
    const callApi = vi.fn(async () => ({ result: 'ok' }));
    const hass = {
      states: {},
      user: { id: 'u', name: 'U', is_admin: true },
      callApi,
    } as unknown as HomeAssistant;
    const store = AutomationStore.for(hass);
    await store.save(WASHER.id, buildNotice(WASHER));
    expect(callApi).toHaveBeenLastCalledWith(
      'POST',
      `config/automation/config/${WASHER.id}`,
      buildNotice(WASHER),
    );
    await expect(
      store.save(WASHER.id, { ...buildNotice(WASHER), alias: ' padded ' }),
    ).rejects.toThrow(/shape/);
    await store.remove(WASHER.id);
    expect(callApi).toHaveBeenLastCalledWith('DELETE', `config/automation/config/${WASHER.id}`);
    const guest = AutomationStore.for({ ...hass, user: { id: 'g', name: 'G', is_admin: false } });
    await expect(guest.save(WASHER.id, buildNotice(WASHER))).rejects.toThrow(/administrator/);
  });
});
