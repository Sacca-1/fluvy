// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogue } from '../index.js';

/**
 * The actions' contract (#42), held for every card of the catalogue: an action its editor offers has somewhere to be
 * reached, and nothing is drawn as a button that does nothing. A card is drawn from its own stub in a house of every
 * kind of thing, with a tap and a hold that go somewhere (`navigate`); then one of its surfaces must take the tap
 * there — a click, as a finger gives it — and one the hold, each with a name a reader hears. A head's circle is never
 * the button (a head that fits gives it away); with neither action able to run, a head is no button at all. The 44 a
 * finger needs is the browser's to measure: the measurer's `head-target` and `touch-target` rules.
 */

const CATALOGUE = await catalogue();

type CardClass = CustomElementConstructor & {
  base?: readonly string[];
  getStubConfig?(hass: unknown, entities: readonly string[]): LovelaceCardConfig;
};
type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

const STAMP = '2026-09-17T19:00:00+00:00';
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state: value,
  attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
  last_changed: STAMP,
  last_updated: STAMP,
  context: { id: '', parent_id: null, user_id: null },
});

/** A house of every kind of thing a card is drawn from. */
const STATES = [
  state('light.living_room_ceiling', 'on', {
    brightness: 180,
    supported_color_modes: ['brightness'],
    color_mode: 'brightness',
  }),
  state('switch.kitchen_kettle', 'off'),
  state('fan.bedroom', 'on', { percentage: 50, supported_features: 1 }),
  state('cover.living_blind', 'open', { current_position: 70, supported_features: 15 }),
  state('lock.front_door', 'locked'),
  state('alarm_control_panel.house', 'disarmed', { supported_features: 3 }),
  state('climate.living', 'heat', {
    current_temperature: 20.5,
    temperature: 21,
    hvac_modes: ['off', 'heat'],
    min_temp: 7,
    max_temp: 30,
  }),
  state('humidifier.bedroom', 'on', { humidity: 45, min_humidity: 30, max_humidity: 70 }),
  state('water_heater.boiler', 'eco', { temperature: 50, min_temp: 30, max_temp: 70 }),
  state('vacuum.robot', 'docked', { supported_features: 12 }),
  state('camera.porch', 'idle', { entity_picture: '/api/camera_proxy/camera.porch' }),
  state('media_player.living_tv', 'playing', { media_title: 'News', supported_features: 152463 }),
  state('person.marta', 'home'),
  state('zone.home', '1', { latitude: 41.4, longitude: 2.17, radius: 100 }),
  state('todo.groceries', '2', { supported_features: 15 }),
  state('timer.oven', 'active', {
    duration: '0:10:00',
    remaining: '0:05:00',
    finishes_at: '2026-09-17T19:05:00+00:00',
  }),
  state('update.core', 'on', { title: 'Core', installed_version: '1', latest_version: '2' }),
  state('weather.home', 'sunny', { temperature: 21, temperature_unit: '°C' }),
  state('scene.evening', STAMP),
  state('script.goodnight', 'off'),
  state('automation.lights', 'on'),
  state('input_number.target', '20', { min: 0, max: 40, step: 1 }),
  state('input_boolean.guest', 'off'),
  state('binary_sensor.front_door', 'off', { device_class: 'door' }),
  state('calendar.home', 'off'),
  state('sensor.living_temperature', '21.4', {
    unit_of_measurement: '°C',
    device_class: 'temperature',
    state_class: 'measurement',
  }),
  state('sensor.living_humidity', '48', {
    unit_of_measurement: '%',
    device_class: 'humidity',
    state_class: 'measurement',
  }),
  state('sensor.solar_power', '1200', {
    unit_of_measurement: 'W',
    device_class: 'power',
    state_class: 'measurement',
  }),
  state('sensor.grid_energy', '12.4', {
    unit_of_measurement: 'kWh',
    device_class: 'energy',
    state_class: 'total_increasing',
  }),
  state('sensor.phone_battery', '64', { unit_of_measurement: '%', device_class: 'battery' }),
  state('sun.sun', 'above_horizon'),
];

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24', first_weekday: 'monday' },
  states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
  entities: Object.fromEntries(
    STATES.map((s) => [
      s.entity_id,
      { entity_id: s.entity_id, area_id: 'living', device_id: null },
    ]),
  ),
  devices: {},
  areas: { living: { area_id: 'living', name: 'Living room', picture: null, icon: null } },
  floors: {},
  user: { id: 'u1', name: 'Marta', is_admin: true, is_owner: true },
  config: {
    unit_system: { temperature: '°C', length: 'km' },
    time_zone: 'UTC',
    latitude: 41.4,
    longitude: 2.17,
  },
  themes: { darkMode: false, themes: {} },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  hassUrl: (path: string) => path,
  callService: () => Promise.resolve(),
  callWS: () => new Promise(() => undefined),
  callApi: () => new Promise(() => undefined),
  connection: {
    subscribeMessage: () => new Promise(() => undefined),
    subscribeEvents: () => new Promise(() => undefined),
  },
} as unknown as HomeAssistant;

/** Every navigation the cards ask for, as Home Assistant hears it (`location-changed`). */
const went: string[] = [];
window.addEventListener('location-changed', () => went.push(window.location.pathname));

const TAP = { action: 'navigate', navigation_path: '/t' };
const HOLD = { action: 'navigate', navigation_path: '/h' };

async function drawn(
  tag: string,
  card: CardClass,
  actions: Record<string, unknown>,
): Promise<ShadowRoot | null> {
  let config: LovelaceCardConfig;
  try {
    config = {
      ...card.getStubConfig?.(hass, Object.keys(hass.states)),
      type: `custom:${tag}`,
      ...actions,
    };
  } catch {
    unfilled.add(tag);
    return null;
  }
  const element = document.createElement(tag) as CardElement;
  try {
    element.setConfig(config);
  } catch {
    unfilled.add(tag);
    return null;
  }
  element.hass = hass;
  (element as unknown as { width: number }).width = 360;
  document.body.append(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  // a card this house cannot fill draws its one quiet line, with nothing to tap: there is nothing to hold it to
  if (!element.shadowRoot || element.shadowRoot.querySelector('.fv-card--empty')) {
    unfilled.add(tag);
    return null;
  }
  return element.shadowRoot;
}

/** The cards this house leaves empty (a printer, an appliance: devices of their own); any other must be drawn and held. */
const UNFILLABLE = new Set(['fluvy-printer-card', 'fluvy-appliance-card']);
const unfilled = new Set<string>();

/** What a reader hears for a surface: its label, or its words. */
const named = (el: Element): boolean =>
  Boolean(el.getAttribute('aria-label')?.trim() || el.textContent?.trim());

type Pressable = HTMLElement & { fvTap?: () => void; fvHold?: () => void };
const all = (root: ShadowRoot): Pressable[] => [...root.querySelectorAll<Pressable>('*')];

/** A pointer's click on `el`, after a still press on it (so a held or dragged earlier press is forgotten). */
function click(el: HTMLElement): void {
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      button: 0,
      pointerType: 'mouse',
    }),
  );
  window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse' }));
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1 }),
  );
}

const offers = (card: CardClass, key: string): boolean => card.base?.includes(key) ?? false;
const cards = CATALOGUE.map(([tag, element]) => ({ tag, card: element as unknown as CardClass }));

describe('every action a card offers has somewhere to be reached (#42)', () => {
  afterEach(() => {
    document.body.replaceChildren();
    went.length = 0;
    vi.useRealTimers();
  });

  it.each(cards.filter(({ card }) => offers(card, 'tap_action')))(
    '$tag: a named surface takes the tap',
    async ({ tag, card }) => {
      const root = await drawn(tag, card, { tap_action: TAP, hold_action: HOLD });
      if (!root) return;
      const surfaces = all(root).filter(
        (el) => el.matches('button, [role="button"]') || typeof el.fvTap === 'function',
      );
      const taken = surfaces.find((el) => {
        went.length = 0;
        click(el);
        return went.includes('/t');
      });
      expect(taken, `${tag}: no surface runs its tap_action`).toBeDefined();
      expect(named(taken!), `${tag}: its tap has no name`).toBe(true);
    },
  );

  it.each(cards.filter(({ card }) => offers(card, 'hold_action')))(
    '$tag: a surface takes the hold',
    async ({ tag, card }) => {
      const root = await drawn(tag, card, { tap_action: TAP, hold_action: HOLD });
      if (!root) return;
      const held = all(root).find((el) => {
        if (typeof el.fvHold !== 'function') return false;
        went.length = 0;
        el.fvHold();
        return went.includes('/h');
      });
      expect(held, `${tag}: no surface runs its hold_action`).toBeDefined();
    },
  );

  it.each(cards)('$tag: a head’s circle is never its button', async ({ tag, card }) => {
    const root = await drawn(tag, card, { tap_action: TAP, hold_action: HOLD });
    if (!root) return;
    // its own circle, never a control raised beside it (a light's round in a room's head)
    expect(root.querySelector('.fv-card__head > :is(button.fv-ico, .fv-ico--tap)')).toBeNull();
    for (const tap of root.querySelectorAll('.fv-card__tap'))
      expect(named(tap), `${tag}: a head's button has no name`).toBe(true);
  });

  it.each(cards)('$tag: a head with nothing to run is no button', async ({ tag, card }) => {
    const none = { action: 'none' };
    const root = await drawn(tag, card, { tap_action: none, hold_action: none });
    if (!root) return;
    expect(root.querySelector('.fv-card__tap'), tag).toBeNull();
    expect(root.querySelector('.fv-card__head--tap'), tag).toBeNull();
  });

  it('drew every card but those this house cannot fill', () => {
    expect([...unfilled].sort()).toEqual([...UNFILLABLE].sort());
  });
});
