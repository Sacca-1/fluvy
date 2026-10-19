// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

/**
 * An unavailable tile keeps its size (the owner's rule, 1.9): the tile whose entity cannot be read — unavailable, or
 * missing — draws the live tile's own anatomy in every size (its circle, its name, its state line, its readings as
 * dashes, its switch that does not move, its ruler at rest), so a large one never stands shorter than its neighbours.
 * Only the colours change.
 */

const STAMP = '2026-09-17T19:00:00+00:00';
const state = (id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: STAMP,
  last_updated: STAMP,
});

/** The live house, and the same house where each appliance cannot be read (its capabilities kept, as HA keeps them). */
const LIVE = {
  'switch.washer': state('switch.washer', 'on', { friendly_name: 'Washer' }),
  'switch.printer': state('switch.printer', 'on', { friendly_name: '3D printer' }),
  'light.desk': state('light.desk', 'on', {
    friendly_name: 'Desk lamp',
    brightness: 128,
    supported_color_modes: ['brightness'],
  }),
  'sensor.office': state('sensor.office', '21.5', {
    friendly_name: 'Office',
    unit_of_measurement: '°C',
    device_class: 'temperature',
  }),
  'sensor.washer_power': state('sensor.washer_power', '142', {
    friendly_name: 'Washer power',
    unit_of_measurement: 'W',
    device_class: 'power',
  }),
  'sensor.washer_energy': state('sensor.washer_energy', '0.8', {
    friendly_name: 'Washer energy',
    unit_of_measurement: 'kWh',
    device_class: 'energy',
  }),
};
const DEAD = Object.fromEntries(
  Object.entries(LIVE).map(([id, s]) => [
    id,
    {
      ...s,
      state: 'unavailable',
      attributes: Object.fromEntries(
        Object.entries(s.attributes).filter(([key]) =>
          [
            'friendly_name',
            'supported_color_modes',
            'unit_of_measurement',
            'device_class',
          ].includes(key),
        ),
      ),
    },
  ]),
);

const house = (states: Record<string, unknown>): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states,
    entities: Object.fromEntries(
      Object.keys(LIVE).map((id) => [id, { entity_id: id, area_id: 'office', device_id: null }]),
    ),
    devices: {},
    areas: { office: { area_id: 'office', name: 'Office', picture: null } },
    user: { id: 'u', is_admin: true },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callService: () => Promise.resolve(),
  }) as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

async function drawn(config: LovelaceCardConfig, states: Record<string, unknown>, width = 360) {
  const card = document.createElement(String(config.type).replace('custom:', '')) as CardElement;
  card.setConfig(config);
  card.hass = house(states);
  (card as unknown as { width: number }).width = width;
  document.body.append(card);
  await card.updateComplete;
  return [...card.shadowRoot!.querySelectorAll<HTMLElement>('.fv-tile')];
}

/** The parts a tile is drawn of, in their order, and the classes that size it. */
const PARTS: readonly string[] = [
  'fv-tile__tap',
  'fv-tile__head',
  'fv-ico',
  'fv-hit',
  'fv-tile__value',
  'fv-tile__text',
  'fv-tile__name',
  'fv-tile__state',
  'fv-tile__foot',
  'fv-readout',
];
const SIZING = [
  'fv-tile--compact',
  'fv-tile--mini',
  'fv-tile--inner',
  'fv-tile--footless',
  'fv-tile--tight',
];
function anatomy(tile: HTMLElement): string[] {
  const parts = [...tile.querySelectorAll('*')].flatMap((el) =>
    el.tagName === 'FLUVY-RULER' ? ['ruler'] : PARTS.filter((part) => el.classList.contains(part)),
  );
  return [...SIZING.filter((cls) => tile.classList.contains(cls)), ...parts];
}

const sizes = ['large', 'compact', 'mini'] as const;
const PLUG = {
  entity: 'switch.washer',
  readouts: ['sensor.washer_power', 'sensor.washer_energy'],
};

describe('an unavailable tile keeps the live one’s anatomy and size (A7)', () => {
  afterEach(() => document.body.replaceChildren());

  it.each(sizes)(
    'a plug, %s: circle, name, state line, readings and switch alike',
    async (size) => {
      const config = { type: 'custom:fluvy-tile-card', size, ...PLUG };
      const [live] = await drawn(config, LIVE);
      document.body.replaceChildren();
      const [dead] = await drawn(config, DEAD);
      expect(anatomy(dead!)).toEqual(anatomy(live!));
      expect(dead!.classList.contains('fv-tile--off')).toBe(true);
      if (size === 'large') {
        // the readings are dashes, the switch is there and does not move
        expect(
          [...dead!.querySelectorAll('.fv-readout__value')].map((v) => v.textContent?.trim()),
        ).toEqual(['—', '—']);
        expect(dead!.querySelector('.fv-hit')!.classList.contains('is-fixed')).toBe(true);
        expect(dead!.querySelector('.fv-tile__state')!.textContent).toContain('Unavailable');
      }
    },
  );

  it.each(sizes)('a missing entity, %s, is drawn the same', async (size) => {
    const config = { type: 'custom:fluvy-tile-card', size, ...PLUG };
    const [live] = await drawn(config, LIVE);
    document.body.replaceChildren();
    const rest = Object.fromEntries(Object.entries(LIVE).filter(([id]) => id !== 'switch.washer'));
    const [missing] = await drawn(config, rest);
    expect(anatomy(missing!)).toEqual(anatomy(live!));
  });

  it('a dimmable light keeps its ruler, at rest and out of reach', async () => {
    const config = { type: 'custom:fluvy-tile-card', entity: 'light.desk' };
    const [live] = await drawn(config, LIVE);
    document.body.replaceChildren();
    const [dead] = await drawn(config, DEAD);
    expect(anatomy(dead!)).toEqual(anatomy(live!));
    expect(anatomy(dead!)).toContain('ruler');
    expect(dead!.querySelector('fluvy-ruler')!.hasAttribute('inert')).toBe(true);
  });

  it('a sensor keeps its reading in the head, as a dash', async () => {
    const config = { type: 'custom:fluvy-tile-card', entity: 'sensor.office' };
    const [live] = await drawn(config, LIVE);
    document.body.replaceChildren();
    const [dead] = await drawn(config, DEAD);
    expect(anatomy(dead!)).toEqual(anatomy(live!));
    expect(dead!.querySelector('.fv-tile__value')?.textContent?.trim()).toBe('—');
  });

  it('four large tiles, one unavailable: the same parts in every one', async () => {
    const tiles = await drawn(
      {
        type: 'custom:fluvy-tiles-card',
        size: 'large',
        columns: 2,
        tiles: [PLUG, { ...PLUG, entity: 'switch.printer' }, PLUG, PLUG],
      },
      { ...LIVE, 'switch.printer': DEAD['switch.printer'] },
    );
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) expect(anatomy(tile)).toEqual(anatomy(tiles[0]!));
    expect(tiles[1]!.classList.contains('fv-tile--off')).toBe(true);
  });

  it('a room’s inner tiles: an unavailable one keeps the live one’s parts', async () => {
    const tiles = await drawn(
      {
        type: 'custom:fluvy-room-card',
        area: 'office',
        variant: 'tile',
        controls: 'tiles',
        tiles: [{ entity: 'switch.washer' }, { entity: 'switch.printer' }],
      },
      { ...LIVE, 'switch.printer': DEAD['switch.printer'] },
    );
    expect(tiles).toHaveLength(2);
    expect(anatomy(tiles[1]!)).toEqual(anatomy(tiles[0]!));
  });

  it('a large tile’s surface holds, and its switch is beside its button, never inside it', async () => {
    const [tile] = await drawn({ type: 'custom:fluvy-tile-card', ...PLUG }, LIVE);
    const tap = tile!.querySelector<HTMLElement & { fvHold?: () => void }>('.fv-tile__tap')!;
    expect(tap.tagName).toBe('BUTTON');
    expect(typeof tap.fvHold).toBe('function');
    expect(tap.querySelector('.fv-hit, button')).toBeNull();
    expect(tile!.hasAttribute('role')).toBe(false);
  });
});
