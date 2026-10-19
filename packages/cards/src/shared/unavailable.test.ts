// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { OUT_OF_REACH, outOfReachStates } from '@fluvy/demo-home/out-of-reach';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { catalogue, familiesDefined } from '../index.js';

// the index fetches the families: they land before this file's page goes
afterAll(() => familiesDefined);

/*
 * An unavailable card keeps its configured size (the owner's rule, 1.9): only its colours change; its anatomy stays.
 * Held here for every card of the catalogue in each of its variants (its editor's `variant`, or a tile's `size`), drawn
 * from its stub in a house of every kind of thing and drawn again with every entity it reads out of reach as Home
 * Assistant writes it — unavailable, unknown, missing (`@fluvy/demo-home/out-of-reach`): the card's root and its parts,
 * in order, are the live card's. A part is an element and its own classes; a state (`is-…`) and a modifier (`…--…`)
 * are only its colours. The heights are the browser's to measure: `interactions-unavailable.mjs`.
 */

/**
 * The cards not yet brought to the rule, by card, variant and state: each draws other parts out of reach today. The
 * list only shrinks: a card brought to the rule fails here until it is taken off.
 */
const PENDING = new Set<string>([]);

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

/** A house of every kind of thing, each with what Home Assistant writes for it: its capabilities and its state's. */
const STATES = [
  state('light.living_room_ceiling', 'on', {
    supported_color_modes: ['color_temp', 'hs'],
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500,
    color_mode: 'color_temp',
    brightness: 180,
    color_temp_kelvin: 3200,
  }),
  state('switch.kitchen_kettle', 'on'),
  state('fan.bedroom', 'on', {
    supported_features: 57,
    preset_modes: ['auto', 'sleep'],
    percentage: 50,
    percentage_step: 25,
    preset_mode: 'auto',
    oscillating: false,
  }),
  state('cover.living_blind', 'open', {
    supported_features: 15,
    device_class: 'blind',
    current_position: 70,
  }),
  state('lock.front_door', 'locked', { supported_features: 1 }),
  state('alarm_control_panel.house', 'disarmed', {
    supported_features: 63,
    code_format: null,
    code_arm_required: false,
  }),
  state('climate.living', 'heat', {
    supported_features: 401,
    hvac_modes: ['off', 'heat', 'cool', 'auto'],
    min_temp: 7,
    max_temp: 30,
    target_temp_step: 0.5,
    preset_modes: ['eco', 'comfort'],
    fan_modes: ['auto', 'low', 'high'],
    current_temperature: 20.5,
    temperature: 21,
    hvac_action: 'heating',
    preset_mode: 'comfort',
    fan_mode: 'auto',
  }),
  state('humidifier.bedroom', 'on', {
    min_humidity: 30,
    max_humidity: 70,
    available_modes: ['normal', 'eco'],
    humidity: 45,
    current_humidity: 41,
    mode: 'normal',
  }),
  state('water_heater.boiler', 'eco', {
    operation_list: ['eco', 'electric', 'off'],
    min_temp: 30,
    max_temp: 70,
    temperature: 50,
    current_temperature: 47,
  }),
  state('vacuum.robot', 'docked', {
    supported_features: 14204,
    fan_speed_list: ['quiet', 'standard', 'max'],
    fan_speed: 'standard',
    battery_level: 90,
  }),
  state('camera.porch', 'idle', {
    entity_picture: '/api/camera_proxy/camera.porch?token=1',
    supported_features: 2,
  }),
  state('media_player.living_tv', 'playing', {
    supported_features: 152463,
    source_list: ['TV', 'Radio'],
    media_title: 'News',
    media_artist: 'Channel 1',
    source: 'TV',
    volume_level: 0.4,
  }),
  state('person.marta', 'home', { latitude: 41.4, longitude: 2.17, gps_accuracy: 10 }),
  state('zone.home', '1', { latitude: 41.4, longitude: 2.17, radius: 100 }),
  state('todo.groceries', '2', { supported_features: 15 }),
  state('timer.oven', 'active', {
    duration: '0:10:00',
    remaining: '0:05:00',
    finishes_at: '2026-10-17T19:05:00+00:00',
  }),
  state('update.core', 'on', {
    title: 'Core',
    installed_version: '2026.10.0',
    latest_version: '2026.10.1',
    entity_picture: '/brands/core.png',
  }),
  state('weather.home', 'sunny', {
    supported_features: 3,
    temperature: 21,
    temperature_unit: '°C',
    humidity: 50,
    wind_speed: 12,
    wind_speed_unit: 'km/h',
  }),
  state('scene.evening', STAMP),
  state('script.goodnight', 'off', { last_triggered: STAMP }),
  state('automation.lights', 'on', { id: '1', last_triggered: STAMP }),
  state('input_number.target', '20', { min: 0, max: 40, step: 1, mode: 'slider' }),
  state('input_boolean.guest', 'off'),
  state('input_select.house_mode', 'Home', { options: ['Home', 'Away', 'Night'] }),
  state('binary_sensor.front_door', 'off', { device_class: 'door' }),
  state('calendar.home', 'on', { message: 'Dentist', start_time: STAMP, end_time: STAMP }),
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
  state('sun.sun', 'above_horizon', { next_rising: STAMP, next_setting: STAMP }),
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
  // the recorder, the forecasts and the stores never answer: the live card and its twin wait alike
  callWS: () => new Promise(() => undefined),
  callApi: () => new Promise(() => undefined),
  connection: {
    subscribeMessage: () => new Promise(() => undefined),
    subscribeEvents: () => new Promise(() => undefined),
  },
} as unknown as HomeAssistant;

type CardClass = CustomElementConstructor & {
  getStubConfig?(hass: unknown, entities: readonly string[]): LovelaceCardConfig;
  getConfigForm?(): { schema: readonly FormItem[] };
};
type FormItem = {
  name: string;
  schema?: readonly FormItem[];
  selector?: { select?: { options?: ReadonlyArray<string | { value: string }> } };
};
type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

/** A part of a card: its element and its own classes (a state, `is-…`, and a modifier, `…--…`, are its colours). */
const part = (el: Element): string =>
  [
    el.localName,
    ...[...el.classList].filter((c) => !c.startsWith('is-') && !c.includes('--')),
  ].join('.');
/** What a card is made of: its root, then the root's parts in order. */
function anatomy(root: ShadowRoot): string[] {
  const card = [...root.children].find((el) => el.localName !== 'style');
  return card ? [part(card), ...[...card.children].map(part)] : [];
}

async function drawn(tag: string, config: LovelaceCardConfig, house: HomeAssistant) {
  const element = document.createElement(tag) as CardElement;
  element.setConfig(config);
  element.hass = house;
  (element as unknown as { width: number }).width = 360;
  document.body.append(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  return element;
}

/**
 * Cards that find what they show (a room in its area, the house's automations, the house's appliances) instead of
 * being told: missing, an entity is gone from the house and so from what they find (#39, #48) — only what their
 * config names is taken out of it for that twin (`interactions-unavailable.mjs`'s `FOUND`).
 */
const FOUND = new Set(['fluvy-room-card', 'fluvy-automations-card', 'fluvy-appliances-card']);

/** Every entity a card reads: what it watches, and every id its config names — only those for `named`. */
function entitiesOf(element: CardElement, config: LovelaceCardConfig, named = false): string[] {
  const ids = new Set<string>();
  const watched = named
    ? []
    : ((element as unknown as { watched?(): readonly string[] }).watched?.() ?? []);
  for (const id of watched) if (hass.states[id]) ids.add(id);
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (hass.states[value]) ids.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(config);
  return [...ids];
}

const fields = (schema: readonly FormItem[]): FormItem[] =>
  schema.flatMap((item) => (item.schema ? fields(item.schema) : item.name ? [item] : []));

/** Each card's variants from its stub: its editor's `variant` (or a tile's `size`), each written over the stub. */
const variants = (await catalogue()).flatMap(([tag, element]) => {
  const card = element as unknown as CardClass;
  let stub: LovelaceCardConfig;
  try {
    stub = { ...card.getStubConfig?.(hass, Object.keys(hass.states)), type: `custom:${tag}` };
  } catch {
    return [];
  }
  const form = fields(card.getConfigForm?.().schema ?? []);
  const axis = form.find((f) => f.name === 'variant') ?? form.find((f) => f.name === 'size');
  const options = (axis?.selector?.select?.options ?? []).map((o) =>
    typeof o === 'string' ? o : o.value,
  );
  return options.length
    ? options.map((value) => ({
        tag,
        variant: `${axis!.name}=${value}`,
        config: { ...stub, [axis!.name]: value },
      }))
    : [{ tag, variant: 'default', config: stub }];
});
const cases = variants.flatMap((v) => OUT_OF_REACH.map((kind) => ({ ...v, kind })));

afterEach(() => document.body.replaceChildren());

describe('an unavailable card keeps its anatomy (1.9)', () => {
  it.each(cases)('$tag · $variant · $kind', async ({ tag, variant, config, kind }) => {
    const live = await drawn(tag, config, hass);
    // a card this house cannot fill (a printer, an appliance: devices of their own) is the browser suite's
    if (live.shadowRoot!.querySelector('.fv-card--empty')) return;
    const ids = entitiesOf(live, config, FOUND.has(tag) && kind === 'missing');
    if (!ids.length) return; // nothing to take out of reach (chips that only go somewhere, a room's things)
    const twin = await drawn(tag, config, {
      ...hass,
      states: outOfReachStates(hass.states, ids, kind),
    });
    const [kept, held] = [anatomy(twin.shadowRoot!), anatomy(live.shadowRoot!)];
    const name = `${tag} · ${variant} · ${kind}`;
    if (PENDING.has(name))
      expect(kept, `${name} is brought to the rule: take it off PENDING`).not.toEqual(held);
    else expect(kept, ids.join(', ')).toEqual(held);
  });

  it('names only cases that exist', () => {
    const names = new Set(cases.map((c) => `${c.tag} · ${c.variant} · ${c.kind}`));
    for (const name of PENDING) expect(names.has(name), name).toBe(true);
  });
});
