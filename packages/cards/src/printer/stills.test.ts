// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';
import { PRINTER_HOUSE } from './fixtures.js';

// the printer lands with its own chunk, defined as the index starts
await familiesDefined;

/*
 * A printer's camera stills refresh themselves while the card is on screen (every five seconds while it prints);
 * off screen they pause, and the card back on screen pulls one at once (the camera card's rule).
 */

const STAMP = '2026-10-17T19:00:00+00:00';
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state: value,
    attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
    last_changed: STAMP,
    last_updated: STAMP,
    context: { id: '', parent_id: null, user_id: null },
  }) as HassEntity;

const STATES = [
  state('sensor.p1s_print_status', 'running'),
  state('sensor.p1s_print_progress', '62', { unit_of_measurement: '%' }),
  state('sensor.p1s_remaining_time', '72', { unit_of_measurement: 'min' }),
  state('camera.p1s_camera', 'idle', { entity_picture: '/api/camera_proxy/camera.p1s?token=1' }),
];

/** The house, counting every still the card asks for. */
function house(pulled: string[]): HomeAssistant {
  return {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
    entities: PRINTER_HOUSE.entities,
    devices: PRINTER_HOUSE.devices,
    areas: {},
    user: { id: 'u1', name: 'Marta', is_admin: true, is_owner: true },
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => {
      pulled.push(path);
      return path;
    },
    callWS: () => new Promise(() => undefined),
  } as unknown as HomeAssistant;
}

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  holder: { onScreen: boolean; report(onScreen: boolean): void };
  /** The still asked for last, until it lands (no image lands under test: the test says it did). */
  inFlight: number;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('a printer’s stills', () => {
  it('refresh on screen, pause off it, and come back with one at once', async () => {
    const pulled: string[] = [];
    const card = document.createElement('fluvy-printer-card') as CardElement;
    card.setConfig({ type: 'custom:fluvy-printer-card', device: 'd-bambu', _now: STAMP });
    card.hass = house(pulled);
    card.width = 360;
    document.body.append(card);
    await card.updateComplete;
    // until the viewport's first word the card is off screen: nothing is pulled
    expect(pulled).toHaveLength(0);
    // on screen: one still at once, then one every five seconds while it prints (each landing before the next)
    card.holder.report(true);
    expect(pulled).toHaveLength(1);
    card.inFlight = 0;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(pulled).toHaveLength(2);
    card.inFlight = 0;
    // off screen: no more
    card.holder.report(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pulled).toHaveLength(2);
    // back on screen: one at once, and the five seconds again
    card.holder.report(true);
    expect(pulled).toHaveLength(3);
    card.inFlight = 0;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(pulled).toHaveLength(4);
  });
});
