// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { outOfReachStates, type OutOfReach } from '@fluvy/demo-home/out-of-reach';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { PRINTER_HOUSE } from '../printer/fixtures.js';

// the lazy families (the players, the cameras, the printers, the automations) are defined before a card is drawn
await familiesDefined;

/*
 * An unavailable card keeps its configured size (the owner's rule, 1.9), family by family: what `unavailable.test.ts`
 * does not see in a card's parts — a row's figures kept as dashes, a list's rows at rest, a word that keeps a grid a
 * grid, the size a card says — held for the cards of the third sweep (clocks, lists, people, cameras, players,
 * calendars, maps, rooms, printers, automations). Each card is drawn live and again with what it reads out of reach as
 * Home Assistant writes it (`@fluvy/demo-home/out-of-reach`).
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
  state('weather.home', 'sunny', {
    supported_features: 1,
    temperature: 18,
    temperature_unit: '°C',
  }),
  state('sun.sun', 'above_horizon', {
    next_rising: '2026-10-18T06:10:00+00:00',
    next_setting: '2026-10-17T17:40:00+00:00',
  }),
  state('todo.groceries', '3', { supported_features: 15 }),
  state('person.marta', 'home'),
  state('person.pau', 'home'),
  state('person.ona', 'not_home'),
  state('binary_sensor.front_door', 'off', { device_class: 'door' }),
  state('binary_sensor.kitchen_window', 'on', { device_class: 'window' }),
  state('camera.porch', 'idle', {
    entity_picture: '/api/camera_proxy/camera.porch?token=1',
    supported_features: 2,
  }),
  // a speaker playing a track: its seek line, the five rounds, its volume and the power round
  state('media_player.kitchen', 'playing', {
    supported_features: 311743,
    media_title: 'Midnight Coda',
    media_artist: 'Ola Gjeilo',
    media_duration: 222,
    media_position: 84,
    media_position_updated_at: STAMP,
    volume_level: 0.4,
  }),
  // a radio stream: playing, with no length to seek
  state('media_player.radio', 'playing', {
    supported_features: 16397,
    media_title: 'Radio Paradise',
    volume_level: 0.3,
  }),
];

const house = (states: readonly HassEntity[] = STATES): HomeAssistant =>
  ({
    language: 'en',
    locale: {
      language: 'en',
      number_format: 'language',
      time_format: '24',
      first_weekday: 'monday',
    },
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    entities: {},
    devices: {},
    areas: {},
    floors: {},
    user: { id: 'u1', name: 'Marta', is_admin: true, is_owner: true },
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
    themes: { darkMode: false, themes: {} },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callService: () => Promise.resolve(),
    // the recorder, the forecasts and the lists never answer: what a card keeps is what it draws before they do
    callWS: () => new Promise(() => undefined),
    callApi: () => new Promise(() => undefined),
    connection: {
      subscribeMessage: () => new Promise(() => undefined),
      subscribeEvents: () => new Promise(() => undefined),
    },
  }) as unknown as HomeAssistant;

/** The house with these entities out of reach. */
const away = (ids: readonly string[], kind: OutOfReach): HomeAssistant => {
  const live = house();
  return { ...live, states: outOfReachStates(live.states, ids, kind) };
};

type Mounted = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
  getCardSize(): number | Promise<number>;
};

async function draw(config: LovelaceCardConfig, hass: HomeAssistant, width = 360) {
  const element = document.createElement(config.type.replace(/^custom:/, '')) as Mounted;
  element.setConfig(config);
  element.hass = hass;
  (element as unknown as { width: number }).width = width;
  document.body.append(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  return element;
}

const root = (element: Mounted): ShadowRoot => element.shadowRoot!;
const texts = (element: Mounted, selector: string): string[] =>
  [...root(element).querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? '');

afterEach(() => document.body.replaceChildren());

const KINDS: readonly OutOfReach[] = ['unavailable', 'unknown', 'missing'];

describe('clocks out of reach', () => {
  const config = { type: 'custom:fluvy-clock-card', weather: 'weather.home', _now: STAMP };

  it.each(KINDS)(
    'keep the forecast row, its figures dashes, while the weather is %s',
    async (kind) => {
      for (const variant of ['hero', 'side']) {
        const live = await draw({ ...config, variant }, house());
        const twin = await draw({ ...config, variant }, away(['weather.home', 'sun.sun'], kind));
        expect(texts(live, '.fv-readout__label')).toEqual(texts(twin, '.fv-readout__label'));
        expect(texts(twin, '.fv-readout__value')).toEqual(['—', '—', '—']);
        expect(await twin.getCardSize()).toBe(await live.getCardSize());
      }
    },
  );

  it('keep the row out where the weather says it has no daily forecast', async () => {
    const hourly = house(
      STATES.map((s) =>
        s.entity_id === 'weather.home'
          ? { ...s, attributes: { ...s.attributes, supported_features: 2 } }
          : s,
      ),
    );
    const twin = await draw(config, {
      ...hourly,
      states: outOfReachStates(hourly.states, ['weather.home'], 'unavailable'),
    });
    expect(root(twin).querySelector('.ck-cols')).toBeNull();
  });

  it.each(KINDS)('say a %s sun as its slot with a dash', async (kind) => {
    const plain = {
      type: 'custom:fluvy-clock-card',
      variant: 'tile',
      face: 'digital',
      _now: STAMP,
    };
    const twin = await draw(plain, away(['sun.sun'], kind), 172);
    expect(texts(twin, '.fv-readout__value')).toEqual(['—', '—']);
    const side = await draw({ ...plain, variant: 'side' }, away(['sun.sun'], kind));
    expect(texts(side, '.fv-card__sub')).toContain('Sunrise —');
  });
});

describe('to-do lists out of reach', () => {
  const config = { type: 'custom:fluvy-todo-card', entity: 'todo.groceries' };

  it.each(['unavailable', 'missing'] as const)(
    'keep their head, a still "+" and the five rows they declare while %s',
    async (kind) => {
      const twin = await draw(config, away(['todo.groceries'], kind));
      expect(root(twin).querySelector('.fv-card--empty')).toBeNull();
      expect(root(twin).querySelectorAll('.in-todo__row')).toHaveLength(5);
      expect(root(twin).querySelector<HTMLButtonElement>('.in-add')?.disabled).toBe(true);
      expect(await twin.getCardSize()).toBe(6);
    },
  );
});

describe('cameras out of reach', () => {
  it('keep their head and their plate when the camera is gone', async () => {
    const config = { type: 'custom:fluvy-camera-card', entity: 'camera.porch' };
    const twin = await draw(config, away(['camera.porch'], 'missing'));
    expect(root(twin).querySelector('.fv-card--empty')).toBeNull();
    expect(root(twin).querySelector('.dv-cam.is-off')).not.toBeNull();
    expect(texts(twin, '.dv-cam__off p')).toEqual(['Entity not found']);
  });
});

describe('people out of reach', () => {
  it.each(KINDS)('stay a grid, a %s person saying a word that holds its column', async (kind) => {
    const config = {
      type: 'custom:fluvy-people-card',
      entities: ['person.marta', 'person.pau', 'person.ona'],
    };
    const twin = await draw(config, away(['person.marta', 'person.pau', 'person.ona'], kind));
    expect(root(twin).querySelector('.am-people')).not.toBeNull();
    expect(root(twin).querySelector('.am-rows')).toBeNull();
  });
});

describe('openings out of reach', () => {
  it.each(KINDS)('keep two tiles a row, a %s sensor saying a dash', async (kind) => {
    const config = {
      type: 'custom:fluvy-openings-card',
      variant: 'tiles',
      entities: ['binary_sensor.front_door', 'binary_sensor.kitchen_window'],
    };
    const live = await draw(config, house(), 211);
    const twin = await draw(config, away(['binary_sensor.front_door'], kind), 211);
    const columns = (el: Mounted) => root(el).querySelector('.op-tiles')?.className;
    expect(columns(twin)).toBe(columns(live));
    expect(texts(twin, '.fv-tile__state')[0]).toBe('—');
  });
});

describe('players out of reach', () => {
  const full = { type: 'custom:fluvy-media-card', entity: 'media_player.kitchen' };
  const parts = (el: Mounted) =>
    [...root(el).querySelector('article')!.children].map((child) => child.className.trim());

  it.each(['unavailable', 'missing'] as const)(
    'keep the whole player while %s: the seek line at rest, the rounds and the volume still',
    async (kind) => {
      for (const variant of ['full', 'hero']) {
        const live = await draw({ ...full, variant }, house());
        const twin = await draw({ ...full, variant }, away(['media_player.kitchen'], kind));
        expect(parts(twin).length).toBe(parts(live).length);
        expect(texts(twin, '.md-times span')).toEqual(['—', '—']);
        const rounds = [...root(twin).querySelectorAll<HTMLButtonElement>('.md-controls button')];
        expect(rounds.length).toBeGreaterThanOrEqual(3);
        expect(rounds.every((round) => round.disabled)).toBe(true);
        expect(root(twin).querySelector('.md-volume fluvy-ruler')?.hasAttribute('inert')).toBe(
          true,
        );
      }
    },
  );

  it('keep their seek line at rest while nothing has a length (a stream)', async () => {
    const live = await draw({ ...full, entity: 'media_player.radio' }, house());
    expect(root(live).querySelector('.md-seek')).not.toBeNull();
    expect(texts(live, '.md-times span')).toEqual(['—', '—']);
  });

  it.each(['unavailable', 'missing'] as const)(
    'keep the compact row and the strip while %s, their rounds still',
    async (kind) => {
      const mini = await draw({ ...full, variant: 'mini' }, away(['media_player.kitchen'], kind));
      expect(root(mini).querySelector('.md-mini__row')).not.toBeNull();
      expect(
        [...root(mini).querySelectorAll<HTMLButtonElement>('.md-mini__row button.fv-round')].every(
          (round) => round.disabled,
        ),
      ).toBe(true);
      const strip = await draw(
        { type: 'custom:fluvy-now-playing-card', entity: 'media_player.kitchen' },
        away(['media_player.kitchen'], kind),
      );
      expect(root(strip).querySelector('.hm-progress')).not.toBeNull();
      expect(texts(strip, '.hm-times span')).toEqual(['—', '—']);
      expect(
        [...root(strip).querySelectorAll<HTMLButtonElement>('.hm-transport button')].every(
          (round) => round.disabled,
        ),
      ).toBe(true);
    },
  );
});

describe('calendars out of reach', () => {
  const calendars = house([
    ...STATES,
    state('calendar.family', 'off'),
    state('calendar.work', 'on', { message: 'Stand-up', start_time: STAMP, end_time: STAMP }),
  ]);
  const ids = ['calendar.family', 'calendar.work'];
  const config = { type: 'custom:fluvy-calendar-card', calendars: ids, _now: STAMP };
  const twinOf = (kind: OutOfReach) => ({
    ...calendars,
    states: outOfReachStates(calendars.states, ids, kind),
  });

  it.each(['unavailable', 'missing'] as const)(
    'draw each view at rest while %s, saying why in the head',
    async (kind) => {
      const agenda = await draw(config, twinOf(kind));
      expect(root(agenda).querySelector('.cd-card.is-off')).not.toBeNull();
      expect(root(agenda).querySelectorAll('.cd-event')).toHaveLength(4);
      expect(texts(agenda, '.cd-rows .fv-row__sub')).toEqual(['—']);
      expect(texts(agenda, '.fv-card__sub')[0]).toMatch(
        kind === 'missing' ? /^Entity not found/ : /^Unavailable/,
      );

      const month = await draw({ ...config, variant: 'month' }, twinOf(kind));
      expect(root(month).querySelector('.fv-month')).not.toBeNull();
      const nav = [...root(month).querySelectorAll<HTMLButtonElement>('.cd-nav button')];
      expect(nav).toHaveLength(2);
      expect(nav.every((button) => button.disabled)).toBe(true);

      const tile = await draw({ ...config, variant: 'tile' }, twinOf(kind), 172);
      expect(root(tile).querySelector('.cd-tile.fv-tile--off .cd-tile__date')).not.toBeNull();
    },
  );

  it('say why on a tile whose every read was refused, never a loading bar', async () => {
    const refused = { ...calendars, callApi: () => Promise.reject(new Error('refused')) };
    const tile = await draw({ ...config, variant: 'tile' }, refused as HomeAssistant, 172);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tile.updateComplete;
    expect(root(tile).querySelector('.cd-tile.fv-tile--off')).not.toBeNull();
    expect(root(tile).querySelector('.fv-skeleton')).toBeNull();
  });

  it('draw a view that is still reading its calendars at the size it declares', async () => {
    const agenda = await draw(config, calendars);
    expect(root(agenda).querySelectorAll('.cd-event')).toHaveLength(4);
    expect(root(agenda).querySelector('.cd-card.is-off')).toBeNull();
  });
});

describe('printers out of reach', () => {
  const live = house([
    ...STATES,
    state('sensor.p1s_print_status', 'running'),
    state('sensor.p1s_print_progress', '62', { unit_of_measurement: '%' }),
    state('sensor.p1s_remaining_time', '72', { unit_of_measurement: 'min' }),
    state('sensor.p1s_current_layer', '112'),
    state('sensor.p1s_total_layer_count', '240'),
    state('camera.p1s_camera', 'idle', { entity_picture: '/api/camera_proxy/camera.p1s?token=1' }),
    state('light.p1s_chamber_light', 'on'),
    state('sensor.p1s_ams_tray_1', 'PLA', { type: 'PLA', color: '#FF6A13FF' }),
    state('sensor.p1s_ams_tray_2', 'PETG', { type: 'PETG', color: '#000000FF' }),
  ]);
  const printing: HomeAssistant = {
    ...live,
    entities: PRINTER_HOUSE.entities,
    devices: PRINTER_HOUSE.devices,
  };
  const ids = Object.keys(printing.states).filter((id) => id.includes('p1s'));
  const config = { type: 'custom:fluvy-printer-card', device: 'd-bambu', _now: STAMP };

  it.each(KINDS)(
    'stand at the size of a job while %s: its picture, progress, readouts, trays and light still',
    async (kind) => {
      const card = await draw(config, printing);
      const twin = await draw(config, {
        ...printing,
        states: outOfReachStates(printing.states, ids, kind),
      });
      const parts = (el: Mounted) =>
        [...root(el).querySelector('article')!.children].map((child) => child.localName);
      expect(parts(twin)).toEqual(parts(card));
      expect(root(twin).querySelector('.pr-card.is-off')).not.toBeNull();
      expect(root(twin).querySelector('.pr-plate.is-off')).not.toBeNull();
      expect(texts(twin, '.pr-top .fv-readout__value')).toEqual(['—', '—']);
      expect(root(twin).querySelectorAll('.pr-tray')).toHaveLength(2);
      const buttons = [...root(twin).querySelectorAll<HTMLButtonElement>('.pr-actions button')];
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every((button) => button.disabled)).toBe(true);
    },
  );
});

describe('lists of things out of reach', () => {
  const updates = house([
    ...STATES,
    state('update.core', 'on', { installed_version: '2026.10.0', latest_version: '2026.10.1' }),
    state('update.plug', 'off', { installed_version: '1.4.3', latest_version: '1.4.3' }),
  ]);
  const listed = ['update.core', 'update.plug'];

  it.each(KINDS)('keep a row for every update that cannot be read, %s', async (kind) => {
    const twin = await draw(
      { type: 'custom:fluvy-updates-card', entities: listed },
      {
        ...updates,
        states: outOfReachStates(updates.states, listed, kind),
      },
    );
    expect(root(twin).querySelector('.in-rows--quiet')).toBeNull();
    expect(root(twin).querySelectorAll('.in-rows .fv-row')).toHaveLength(2);
    expect(texts(twin, '.fv-row__value')).toEqual(['—', '—']);
    expect(texts(twin, '.fv-badge')).toEqual(['2 unavailable']);
  });

  it('count what cannot be read by its plural, one and then two, while nothing waits', async () => {
    const idle = house([
      ...STATES,
      state('update.core', 'off', { installed_version: '2026.10.1', latest_version: '2026.10.1' }),
      state('update.plug', 'off', { installed_version: '1.4.3', latest_version: '1.4.3' }),
    ]);
    const away = async (ids: readonly string[]) =>
      texts(
        await draw(
          { type: 'custom:fluvy-updates-card', entities: listed },
          { ...idle, states: outOfReachStates(idle.states, ids, 'unavailable') },
        ),
        '.fv-badge',
      );
    expect(await away(['update.plug'])).toEqual(['1 unavailable']);
    expect(await away(listed)).toEqual(['2 unavailable']);
  });

  it('keep a listed automation gone from the house as a row', async () => {
    const config = {
      type: 'custom:fluvy-automations-card',
      entities: ['automation.morning', 'automation.night'],
    };
    const twin = await draw(config, house());
    expect(root(twin).querySelectorAll('.au-rows .fv-row')).toHaveLength(2);
    expect(texts(twin, '.fv-row__sub')).toEqual(['Entity not found', 'Entity not found']);
  });
});

describe('maps out of reach', () => {
  const zones = house([
    ...STATES,
    state('zone.home', '0', { latitude: 41.4, longitude: 2.17, radius: 100 }),
    state('zone.school', '0', { latitude: 41.41, longitude: 2.18, radius: 100 }),
    state('zone.work', '0', { latitude: 41.39, longitude: 2.16, radius: 100 }),
  ]);
  const people = ['person.marta', 'person.pau', 'person.ona'];

  it.each(KINDS)(
    'keep the places nobody can be placed in while everyone is %s, beside the faces that cannot be',
    async (kind) => {
      const twin = await draw(
        { type: 'custom:fluvy-map-card', entities: people },
        {
          ...zones,
          states: outOfReachStates(zones.states, people, kind),
        },
      );
      // home, the house's two zones and the faces that cannot be placed
      expect(root(twin).querySelectorAll('.mp-zone')).toHaveLength(4);
    },
  );
});

describe('rooms out of reach', () => {
  it('keep their humidity where their thermostat cannot say whether it measures one', async () => {
    const den = house([
      state('climate.den', 'heat', { current_temperature: 20.5, current_humidity: 44 }),
    ]);
    const registered: HomeAssistant = {
      ...den,
      entities: { 'climate.den': { entity_id: 'climate.den', area_id: 'den' } },
      areas: { den: { area_id: 'den', name: 'Den', picture: null, icon: null } },
    } as unknown as HomeAssistant;
    const config = {
      type: 'custom:fluvy-room-card',
      area: 'den',
      variant: 'photo',
      show_count: false,
    };
    const live = await draw(config, registered);
    const twin = await draw(config, {
      ...registered,
      states: outOfReachStates(registered.states, ['climate.den'], 'unavailable'),
    });
    const labels = (el: Mounted) => texts(el, '.am-area__stats .fv-readout__label');
    expect(labels(twin)).toEqual(labels(live));
    expect(texts(twin, '.am-area__stats .fv-readout__value').slice(0, 2)).toEqual(['—', '—']);
  });
});
