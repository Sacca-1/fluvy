// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import {
  accentFamily,
  derivePalette,
  resolveAccent,
  seedOf,
  surfaceWash,
} from '@fluvy/tokens/runtime';
import { setFallbackTokens } from '@fluvy/ui';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { catalogue, familiesDefined } from '../index.js';

// the index fetches the families: they land before this file's page goes
afterAll(() => familiesDefined);

/**
 * Issue #40, over the whole catalogue: where no look reaches a card (any dashboard not named fluvy-*, and its card
 * editor, which builds a new card on every edit), the card wears its fallback tokens, and derives its own colour, its
 * surface and its items' on the palette that fallback wears from its very first frame — the same frame it draws once
 * it is attached again. happy-dom inherits no custom property from an ancestor: the fallback is on the host, as the
 * fallback sheet's `:host([no-theme])` puts it.
 */
const MIST = derivePalette(seedOf('mist')).light;
const LINEN = derivePalette(seedOf('linen')).light;

const entity = (entity_id: string, state: string, attributes = {}): HassEntity => ({
  entity_id,
  state,
  attributes: { friendly_name: entity_id, ...attributes },
  last_changed: '2026-10-17T08:00:00Z',
  last_updated: '2026-10-17T08:00:00Z',
});

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  themes: { darkMode: false },
  states: {
    'light.bulb': entity('light.bulb', 'on', {
      brightness: 200,
      color_mode: 'hs',
      supported_color_modes: ['hs'],
      hs_color: [200, 80],
      rgb_color: [51, 187, 255],
    }),
    'sensor.power': entity('sensor.power', '640', {
      unit_of_measurement: 'W',
      device_class: 'power',
      state_class: 'measurement',
    }),
    'climate.living': entity('climate.living', 'heat', {
      hvac_modes: ['off', 'heat'],
      current_temperature: 20.5,
      temperature: 21,
    }),
    'cover.blind': entity('cover.blind', 'open', { current_position: 60 }),
    'fan.ceiling': entity('fan.ceiling', 'on', { percentage: 50 }),
    'vacuum.robot': entity('vacuum.robot', 'docked'),
    'person.ana': entity('person.ana', 'home'),
    'binary_sensor.door': entity('binary_sensor.door', 'off', { device_class: 'door' }),
    'scene.evening': entity('scene.evening', '2026-10-17T07:00:00Z'),
    'todo.shopping': entity('todo.shopping', '2'),
    'timer.tea': entity('timer.tea', 'idle', { duration: '0:03:00' }),
    'update.core': entity('update.core', 'off', { title: 'Core' }),
    'weather.home': entity('weather.home', 'sunny', { temperature: 18 }),
    'media_player.speaker': entity('media_player.speaker', 'paused'),
    'lock.front': entity('lock.front', 'locked'),
    'camera.door': entity('camera.door', 'idle'),
  },
  entities: {},
  devices: {},
  areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' } },
  config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
  user: { id: 'u1', name: 'Ana', is_admin: true },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  callService: async () => undefined,
  callWS: async () => ({}),
  callApi: async () => ({}),
  connection: { subscribeMessage: async () => () => undefined },
} as unknown as HomeAssistant;

type Mounted = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};
type CardClass = {
  getStubConfig?: (hass: unknown, entities: readonly string[]) => LovelaceCardConfig;
};

/** The rules of the card's own colour sheet (the last it adopts): its colour and surface, each item's. */
const colourRules = (card: Mounted): string[] =>
  [...(card.shadowRoot!.adoptedStyleSheets.at(-1)?.cssRules ?? [])].map((rule) => rule.cssText);

async function mounted(tag: string, config: Record<string, unknown>): Promise<Mounted> {
  const card = document.createElement(tag) as Mounted;
  card.setConfig({ ...config, type: `custom:${tag}` });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** Attached again where it was (a tabbed card opened again, a view switched back): what it draws then. */
async function reattached(card: Mounted): Promise<string[]> {
  card.remove();
  document.body.append(card);
  await card.updateComplete;
  return colourRules(card);
}

const cards = (await catalogue()).map(([tag, element]) => ({
  tag,
  card: element as unknown as CardClass,
}));

beforeAll(() =>
  setFallbackTokens(
    ':host([no-theme]){--fluvy-palette:mist}:host([no-theme][dark]){--fluvy-palette:mist}',
  ),
);
afterEach(() => document.body.replaceChildren());

describe('every card where no look reaches it (#40)', () => {
  const black = accentFamily(seedOf('mist'), MIST, resolveAccent('black', MIST)!);
  const red = accentFamily(seedOf('mist'), MIST, resolveAccent('red', MIST)!);
  const linenBlack = accentFamily(seedOf('linen'), LINEN, resolveAccent('black', LINEN)!);

  it.each(cards)(
    '$tag: its colour and surface on the palette it wears, from its first frame',
    async ({ tag, card }) => {
      const stub = card.getStubConfig?.(hass, Object.keys(hass.states)) ?? {};
      const mount = await mounted(tag, { ...stub, color: 'black', card_color: 'red' });
      expect(mount.hasAttribute('no-theme')).toBe(true);
      const first = colourRules(mount);
      const own = first.find((rule) => rule.startsWith(':host > *')) ?? '';
      expect(own).toContain(`--fluvy-accent: ${black.ink};`);
      expect(own).toContain(`--fluvy-card: ${surfaceWash(red, MIST)};`);
      expect(own).not.toContain(`--fluvy-accent: ${linenBlack.ink};`);
      expect(await reattached(mount)).toEqual(first);
    },
  );

  it('a colour bulb without a colour of its own: the bulb’s colour on that palette at once', async () => {
    for (const [tag, config] of [
      ['fluvy-light-card', { entity: 'light.bulb' }],
      ['fluvy-lights-card', { entities: ['light.bulb'] }],
    ] as const) {
      const mount = await mounted(tag, config);
      const accent = mount.shadowRoot!.querySelector('[data-accent]')?.getAttribute('data-accent');
      expect(accent, tag).toMatch(/^#[0-9a-f]{6}$/);
      const bulb = accentFamily(seedOf('mist'), MIST, accent!);
      const first = colourRules(mount);
      expect(
        first.find((rule) => rule.startsWith(`[data-accent="${accent}"]`)),
        tag,
      ).toContain(`--fluvy-accent: ${bulb.ink};`);
      expect(await reattached(mount)).toEqual(first);
    }
  });
});
