import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { allFixtures, hcDishwasher, houseOf, lgWasher, plugWasher } from './fixtures/index.js';
import { noticeTriggers, phoneOf } from './notice.js';
import { findAppliance } from './reading.js';
import { FINISHED_WORDS } from './status.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const PLUG = { running: 5, finishedAfter: 3 };
const HOUSE = houseOf(allFixtures(NOW), NOW);

const triggersOf = (device: string, hass: HomeAssistant = HOUSE, plug = PLUG) => {
  const found = findAppliance(hass, { device });
  const kind = found.verdict && 'kind' in found.verdict ? found.verdict.kind : 'appliance';
  return noticeTriggers(hass, found, kind, plug);
};

describe('“Tell me when it’s done”: what says an appliance finished (#47)', () => {
  it('hears LG’s own word that a cycle completed: its washers power off when done', () => {
    expect(triggersOf(lgWasher(NOW).device.id)).toEqual([
      {
        kind: 'event',
        entity: 'event.waschmaschine_benachrichtigung',
        types: [
          'washing_is_complete',
          'drying_is_complete',
          'cleaning_is_complete',
          'cooking_is_complete',
          'styling_is_complete',
        ],
      },
    ]);
  });

  it('hears the state turn to the words that say finished: its options that do, else every integration’s', () => {
    const device = hcDishwasher(NOW).device.id;
    expect(triggersOf(device)).toEqual([
      { kind: 'state', entity: 'sensor.geschirrspuler_betriebszustand', to: [...FINISHED_WORDS] },
    ]);
    const options = ['inactive', 'ready', 'run', 'pause', 'finished', 'aborting'];
    const listed = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'sensor.geschirrspuler_betriebszustand': {
          ...(HOUSE.states['sensor.geschirrspuler_betriebszustand'] as HassEntity),
          attributes: { device_class: 'enum', options },
        },
      },
    } as HomeAssistant;
    expect(triggersOf(device, listed)).toEqual([
      { kind: 'state', entity: 'sensor.geschirrspuler_betriebszustand', to: ['finished'] },
    ]);
  });

  it('hears a plug fall quiet as its card reads it: under half its running power for its minutes', () => {
    const device = plugWasher(NOW).device.id;
    expect(triggersOf(device)).toEqual([
      { kind: 'below', entity: 'sensor.waschmaschine_keller_leistung', below: 2.5, minutes: 3 },
    ]);
    expect(triggersOf(device, HOUSE, { running: 10, finishedAfter: 5 })).toEqual([
      { kind: 'below', entity: 'sensor.waschmaschine_keller_leistung', below: 5, minutes: 5 },
    ]);
  });

  it('tells the administrator on their phone: the app on a device their person tracks', () => {
    const phone = (services: Record<string, unknown>) =>
      phoneOf({
        ...HOUSE,
        user: { id: 'u-marta', name: 'Marta', is_admin: true },
        services: { notify: services },
        states: {
          ...HOUSE.states,
          'person.marta': {
            entity_id: 'person.marta',
            state: 'home',
            attributes: { user_id: 'u-marta', device_trackers: ['device_tracker.handy'] },
          } as unknown as HassEntity,
        },
        entities: {
          ...HOUSE.entities,
          'device_tracker.handy': {
            entity_id: 'device_tracker.handy',
            device_id: 'phone',
            platform: 'mobile_app',
          },
        },
        devices: {
          ...HOUSE.devices,
          phone: {
            id: 'phone',
            name: 'Martas Händy',
            name_by_user: 'Work',
            area_id: null,
            model: null,
            manufacturer: null,
            via_device_id: null,
          },
        },
      } as HomeAssistant);
    // its notify action is named for the app's device, as Home Assistant slugs it
    expect(phone({ mobile_app_martas_handy: {} })).toBe('mobile_app_martas_handy');
    // no app there: Home Assistant's own notifications instead
    expect(phone({ persistent_notification: {} })).toBeUndefined();
    expect(phoneOf(HOUSE)).toBeUndefined();
  });
});
