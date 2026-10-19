// @vitest-environment happy-dom
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { areaEntities, localize, preloadLanguages, type HomeAssistant } from '@fluvy/core';
import { familiesDefined } from '../index.js';
import { FluvyRoomCard, type RoomCardConfig } from './room-card.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

/*
 * #39: a room finds what is in it. The reporter's four areas, each one temperature and one humidity sensor and nothing
 * else: two plain, one whose sensors are diagnostic and named by the area, one whose sensors are hidden; and the
 * shapes around them — a thermostat alone, a dead sensor first, entries the registry has and the house has no state
 * for, a sensor whose state comes after the first draw.
 */

type Seed = readonly [id: string, state: string, attributes?: Record<string, unknown>];
const STAMP = '2026-10-17T19:00:00+00:00';
const states = (seeds: readonly Seed[]) =>
  Object.fromEntries(
    seeds.map(([entity_id, state, attributes]) => [
      entity_id,
      { entity_id, state, attributes: attributes ?? {}, last_changed: STAMP, last_updated: STAMP },
    ]),
  );
const temperature = (id: string, value: string): Seed => [
  id,
  value,
  { device_class: 'temperature', unit_of_measurement: '°C' },
];
const humidity = (id: string, value: string): Seed => [
  id,
  value,
  { device_class: 'humidity', unit_of_measurement: '%' },
];

const SEEDS: readonly Seed[] = [
  temperature('sensor.garten_t', '16.4'),
  humidity('sensor.garten_h', '92'),
  temperature('sensor.kuche_t', '21.4'),
  humidity('sensor.kuche_h', '48'),
  temperature('sensor.wohnzimmer_t', '20.5'),
  humidity('sensor.wohnzimmer_h', '45'),
  ['climate.buero', 'heat', { current_temperature: 20.5, current_humidity: 44, temperature: 21 }],
  temperature('sensor.flur_a', 'unavailable'),
  temperature('sensor.flur_b', '19.8'),
  ['light.keller', 'off', {}],
];

/** Registry entries: the area each is in, and how dashboards treat it. */
const ENTRIES: Record<string, Record<string, unknown>> = {
  'sensor.garten_t': { area_id: 'garten' },
  'sensor.garten_h': { area_id: 'garten' },
  'sensor.kuche_t': { area_id: 'kuche', entity_category: 'diagnostic' },
  'sensor.kuche_h': { area_id: 'kuche', entity_category: 'diagnostic' },
  'sensor.wohnzimmer_t': { area_id: 'wohnzimmer', hidden: true },
  'sensor.wohnzimmer_h': { area_id: 'wohnzimmer', hidden: true },
  'climate.buero': { area_id: 'buero' },
  'sensor.flur_a': { area_id: 'flur' },
  'sensor.flur_b': { area_id: 'flur' },
  // entries the house has no state for: neither shown nor counted
  'sensor.speicher_t': { area_id: 'speicher' },
  'sensor.speicher_h': { area_id: 'speicher', hidden: true },
  // a sensor that comes late
  'sensor.spaet_t': { area_id: 'spaet' },
  'light.keller': { area_id: 'keller' },
};

const area = (area_id: string, name: string, more: Record<string, unknown> = {}) => ({
  area_id,
  name,
  picture: null,
  icon: null,
  ...more,
});

const registries = {
  entities: Object.fromEntries(
    Object.entries(ENTRIES).map(([entity_id, entry]) => [entity_id, { entity_id, ...entry }]),
  ),
  devices: {},
  areas: {
    garten: area('garten', 'Garten'),
    kuche: area('kuche', 'Küche', {
      temperature_entity_id: 'sensor.kuche_t',
      humidity_entity_id: 'sensor.kuche_h',
    }),
    wohnzimmer: area('wohnzimmer', 'Wohnzimmer'),
    buero: area('buero', 'Büro'),
    flur: area('flur', 'Flur'),
    speicher: area('speicher', 'Speicher'),
    spaet: area('spaet', 'Später'),
    leer: area('leer', 'Leer'),
    keller: area('keller', 'Keller'),
  },
};

const house = (seeds: readonly Seed[] = SEEDS, admin = true): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: states(seeds),
    ...registries,
    user: { id: 'u1', name: 'Marta', is_admin: admin },
    config: { unit_system: { temperature: '°C', length: 'km' } },
    themes: { darkMode: false, themes: {} },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
  }) as unknown as HomeAssistant;

type RoomElement = HTMLElement & {
  setConfig(config: RoomCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

/** The reporter's card: the photo variant, tiles under it, no count. */
const REPORTER = { variant: 'photo', controls: 'tiles', show_count: false } as const;

async function room(
  config: Partial<RoomCardConfig> & { area: string },
  hass: HomeAssistant = house(),
): Promise<RoomElement> {
  const card = document.createElement('fluvy-room-card') as RoomElement;
  card.setConfig({ type: 'custom:fluvy-room-card', ...config });
  card.hass = hass;
  (card as unknown as { width: number }).width = 360;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const root = (card: RoomElement): ShadowRoot => card.shadowRoot!;
const readouts = (card: RoomElement): string[] =>
  [...root(card).querySelectorAll('.am-area__stats .fv-readout__value')].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
const hint = (card: RoomElement): string | undefined =>
  root(card).querySelector('.fv-empty-state__hint')?.textContent?.trim();

describe('a room finds what is in it (#39)', () => {
  afterEach(() => document.body.replaceChildren());

  it('reads a plain room: its photo and its two readings', async () => {
    const card = await room({ area: 'garten', ...REPORTER });
    expect(root(card).querySelector('.rm-hero')).not.toBeNull();
    expect(readouts(card)).toEqual(['16.4°C', '92%']);
    expect(root(card).querySelector('.fv-empty-state')).toBeNull();
  });

  it('reads the sensors the area names, even diagnostic ones', async () => {
    const card = await room({ area: 'kuche', ...REPORTER });
    expect(readouts(card)).toEqual(['21.4°C', '48%']);
  });

  it('keeps a room whose sensors are hidden as a room: its photo, then why it is empty', async () => {
    const card = await room({ area: 'wohnzimmer', ...REPORTER });
    expect(root(card).querySelector('.rm-hero')).not.toBeNull();
    expect(root(card).querySelector('.fv-empty-state__text')?.textContent?.trim()).toBe(
      'Nothing in this room yet',
    );
    expect(hint(card)).toBe(
      '2 hidden or diagnostic entities · choose its sensors in the area’s settings',
    );
  });

  it('tells only an administrator why', async () => {
    const card = await room({ area: 'wohnzimmer', ...REPORTER }, house(SEEDS, false));
    expect(root(card).querySelector('.fv-empty-state')).not.toBeNull();
    expect(hint(card)).toBeUndefined();
  });

  it('never counts what the registry has and the house has no state for', async () => {
    const card = await room({ area: 'speicher', ...REPORTER });
    expect(root(card).querySelector('.fv-empty-state')).not.toBeNull();
    expect(hint(card)).toBeUndefined();
    const bare = await room({ area: 'leer' });
    expect(hint(bare)).toBeUndefined();
  });

  it('draws the readings its config names, in a room that shows nothing', async () => {
    const card = await room({
      area: 'wohnzimmer',
      ...REPORTER,
      temperature_entity: 'sensor.garten_t',
    });
    expect(readouts(card)).toEqual(['16.4°C']);
    expect(root(card).querySelector('.fv-empty-state')).toBeNull();
  });

  it('draws the tiles asked for in an empty room, only where its controls are tiles', async () => {
    const tiles = [{ entity: 'light.keller' }];
    const asked = await room({ area: 'leer', controls: 'tiles', tiles });
    expect(root(asked).querySelectorAll('.rm-controls .fv-tile').length).toBe(1);
    expect(root(asked).querySelector('.fv-empty-state')).toBeNull();
    const rows = await room({ area: 'leer', tiles });
    expect(root(rows).querySelector('.rm-controls')).toBeNull();
    expect(root(rows).querySelector('.fv-empty-state')).not.toBeNull();
  });

  it('reads a thermostat-only room from the thermostat', async () => {
    const card = await room({ area: 'buero', ...REPORTER });
    expect(readouts(card)).toEqual(['20.5°C', '44%']);
    const tile = await room({ area: 'buero', variant: 'tile', show_count: false });
    expect(root(tile).querySelector('.fv-card__sub')?.textContent?.trim()).toBe('20.5°');
  });

  it('counts what is on as its rows do: a heating thermostat is on in the readout, the line and the rows alike', async () => {
    // the readout once counted the lights, switches, covers and fans that were on over everything it showed ("Devices
    // on 0 of 1") above the rows' "All devices · 1 of 1 on"
    const card = await room({ area: 'buero', variant: 'photo' });
    expect(readouts(card)).toEqual(['20.5°C', '44%', '1of 1']);
    const all = [...root(card).querySelectorAll('.am-rows .fv-row')].at(-1)!;
    expect(all.querySelector('.fv-row__sub')?.textContent?.trim()).toBe('1 of 1 on');
    const tile = await room({ area: 'buero', variant: 'tile' });
    expect(root(tile).querySelector('.fv-card__sub')?.textContent?.trim()).toBe(
      '1 of 1 on · 20.5°',
    );
    // nothing on is nothing on, in both
    const off = await room({ area: 'keller', variant: 'photo' });
    expect(readouts(off)).toEqual(['0of 1']);
    expect(
      [...root(off).querySelectorAll('.am-rows .fv-row__sub')].map((el) => el.textContent?.trim()),
    ).toEqual(['1 device', '1 device']);
  });

  it('reads the sensor that works when the first one is dead', async () => {
    const card = await room({ area: 'flur', ...REPORTER });
    expect(readouts(card)).toEqual(['19.8°C']);
  });

  it('carries the climate in the line of a row and a tile', async () => {
    const row = await room({ area: 'kuche', variant: 'row' });
    expect(root(row).querySelector('.fv-tile__state')?.textContent?.trim()).toBe('21.4°');
    const tile = await room({ area: 'kuche', variant: 'tile' });
    expect(root(tile).querySelector('.fv-card__sub')?.textContent?.trim()).toBe('21.4°');
    expect(root(tile).querySelector('.fv-empty-state')).toBeNull();
  });

  it('keeps an empty card’s way in: its tap, its hold and its chevron', async () => {
    const went: string[] = [];
    const listen = (): void => void went.push(window.location.pathname);
    window.addEventListener('location-changed', listen);
    try {
      const actions = {
        path: '/fluvy-home/room-leer',
        hold_action: { action: 'navigate', navigation_path: '/hold' },
      } as const;
      const tile = await room({ area: 'leer', variant: 'tile', ...actions });
      const head = root(tile).querySelector('.fv-card__head')!;
      expect(head.classList.contains('fv-card__head--hold')).toBe(true);
      expect(root(tile).querySelector('.fv-head__open')).not.toBeNull();
      root(tile).querySelector<HTMLElement>('.fv-card__tap')!.click();
      expect(went.at(-1)).toBe('/fluvy-home/room-leer');
      const photo = await room({ area: 'leer', variant: 'photo', ...actions });
      const cover = root(photo).querySelector<HTMLElement & { fvHold?: () => void }>(
        '.rm-hero .fv-tile__tap',
      )!;
      expect(cover.fvHold).toBeTypeOf('function');
      expect(root(photo).querySelector('.rm-hero + .fv-empty-state')).not.toBeNull();
    } finally {
      window.removeEventListener('location-changed', listen);
    }
  });

  it('fills the room when a sensor comes late, with the same registries', async () => {
    const early = house();
    const card = await room({ area: 'spaet', ...REPORTER }, early);
    expect(root(card).querySelector('.fv-empty-state')).not.toBeNull();
    card.hass = house([...SEEDS, temperature('sensor.spaet_t', '18.2')]);
    await card.updateComplete;
    expect(readouts(card)).toEqual(['18.2°C']);
  });

  it('is never starved by an earlier reader that saw fewer states (the automatic dashboard while Home Assistant starts)', async () => {
    const partial = house(SEEDS.filter(([id]) => !id.startsWith('sensor.garten')));
    expect(areaEntities(partial, 'garten')).toEqual([]);
    const card = await room({ area: 'garten', ...REPORTER });
    expect(readouts(card)).toEqual(['16.4°C', '92%']);
  });

  it('shows in the editor the variant it draws and the readings it found', () => {
    const defaults = FluvyRoomCard.defaults(
      { type: 'custom:fluvy-room-card', area: 'kuche' },
      house(),
    );
    expect(defaults).toMatchObject({
      variant: 'tile',
      temperature_entity: 'sensor.kuche_t',
      humidity_entity: 'sensor.kuche_h',
    });
    const pictured = FluvyRoomCard.defaults(
      { type: 'custom:fluvy-room-card', area: 'garten', picture: '/local/garten.jpg' },
      house(),
    );
    expect(pictured['variant']).toBe('photo');
  });

  it('is offered with a room that holds something', () => {
    expect(FluvyRoomCard.getStubConfig(house(), []).area).toBe('buero');
  });
});

/** A room drawn at `width` on a stub ruler: what happy-dom cannot lay out. */
async function roomAt(
  config: Partial<RoomCardConfig> & { area: string },
  width: number,
  ruler: { width: (cls: string, text: string) => number },
  hass: HomeAssistant = house(),
): Promise<RoomElement> {
  const card = document.createElement('fluvy-room-card') as RoomElement;
  Object.assign((card as unknown as { headFit: object }).headFit, {
    ruler: {
      ...ruler,
      pill: (_cls: string, text: string, pad: number) => text.length * 8 + pad,
      clear() {},
    },
  });
  card.setConfig({ type: 'custom:fluvy-room-card', ...config });
  card.hass = hass;
  (card as unknown as { width: number }).width = width;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

describe('a room in a narrow column', () => {
  afterEach(() => document.body.replaceChildren());

  it('gives its tile head’s circle to a name that would be cut beside it, as every head does', async () => {
    // 8 px a glyph: "Wohnzimmer" (80) beside the circle and the chevron at 211 has 171 − 56 − 48 = 67; without the
    // circle, 123
    const ruler = { width: (_cls: string, text: string) => text.length * 8 };
    const narrow = await roomAt({ area: 'wohnzimmer', variant: 'tile' }, 211, ruler);
    const head = root(narrow).querySelector('.fv-card__head')!;
    expect(head.querySelector('.fv-ico')).toBeNull();
    expect(head.querySelector('.fv-card__title')?.textContent?.trim()).toBe('Wohnzimmer');
    expect(head.querySelector('.fv-card__tap')?.hasAttribute('title')).toBe(false);
    // a name that holds beside it keeps the circle, and so does every name in a wide column
    const short = await roomAt({ area: 'flur', variant: 'tile' }, 211, ruler);
    expect(root(short).querySelector('.fv-card__head .fv-ico')).not.toBeNull();
    const wide = await roomAt({ area: 'wohnzimmer', variant: 'tile' }, 360, ruler);
    expect(root(wide).querySelector('.fv-card__head .fv-ico')).not.toBeNull();
    // never asked for, never drawn
    const none = await roomAt({ area: 'flur', variant: 'tile', show_icon: 'never' }, 360, ruler);
    expect(root(none).querySelector('.fv-card__head .fv-ico')).toBeNull();
  });

  it('keeps an administrator’s hint to three lines at 211 in every language: the why, the way out left out', async () => {
    await preloadLanguages();
    // the ruler as a browser's: a class's measure caps its probe, as the hint's 380 does — the room measures the hint's
    // whole line (7 px a glyph), so a long one is never taken for three lines it would run past
    const ruler = {
      width: (cls: string, text: string) =>
        (cls === 'fv-empty-state__hint' ? Math.min(text.length * 7, 380) : text.length * 7) + 1,
    };
    for (const language of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt-BR', 'tr']) {
      const hass = { ...house(), language, locale: { language, number_format: 'language' } };
      const full = localize(hass as HomeAssistant, 'room.kept_out', { n: 2 });
      const why = full.split(' · ')[0]!;
      const narrow = await roomAt(
        { area: 'wohnzimmer', ...REPORTER },
        211,
        ruler,
        hass as HomeAssistant,
      );
      // three lines of 211's 139 less what wrapping by words loses: 389
      expect(hint(narrow), language).toBe(why);
      expect(why.length * 7 + 1, language).toBeLessThanOrEqual(389);
      const wide = await roomAt(
        { area: 'wohnzimmer', ...REPORTER },
        360,
        ruler,
        hass as HomeAssistant,
      );
      expect(hint(wide), language).toBe(full);
      document.body.replaceChildren();
    }
  });
});
