// @vitest-environment happy-dom
import {
  setLightDefaults,
  type HaFormSchemaItem,
  type HomeAssistant,
  type LovelaceCardConfig,
} from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { FluvyLightCard } from './light-card.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

/**
 * #41: a lit light shows its colour. The light card's surface (`tint`, `tint_strength`) and what decides its colour
 * (its own, a tone, the bulb's, a group's, the one it last glowed); tiles, rows and rooms in their bulbs' colours
 * (`light_colors`); the house's defaults for both, repainting a mounted card.
 */

const STAMP = '2026-09-17T19:00:00+00:00';
const state = (id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: STAMP,
  last_updated: STAMP,
});
const BULB = { supported_color_modes: ['hs', 'color_temp'] };
const STATES = {
  'light.lamp': state('light.lamp', 'on', {
    friendly_name: 'Lamp',
    brightness: 200,
    color_mode: 'hs',
    hs_color: [36, 100],
    rgb_color: [255, 152, 0],
    ...BULB,
  }),
  'light.dim': state('light.dim', 'on', {
    friendly_name: 'Night lamp',
    brightness: 26,
    color_mode: 'hs',
    rgb_color: [255, 152, 0],
    ...BULB,
  }),
  'light.white': state('light.white', 'on', {
    friendly_name: 'Desk lamp',
    brightness: 204,
    color_mode: 'color_temp',
    color_temp_kelvin: 2700,
    rgb_color: [255, 167, 87],
    ...BULB,
  }),
  'light.reading': state('light.reading', 'off', {
    friendly_name: 'Reading',
    supported_color_modes: ['brightness'],
  }),
  'light.porch': state('light.porch', 'unavailable', {
    friendly_name: 'Porch',
    supported_color_modes: ['brightness'],
  }),
  'light.group': state('light.group', 'on', {
    friendly_name: 'Living room',
    brightness: 200,
    // Home Assistant's own: the most common mode among the members, and the plain mean of their colours
    color_mode: 'color_temp',
    rgb_color: [255, 160, 44],
    entity_id: ['light.lamp', 'light.white', 'light.reading'],
    ...BULB,
  }),
  'switch.kettle': state('switch.kettle', 'on', { friendly_name: 'Kettle' }),
};

const house = (states: Record<string, unknown> = STATES): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states,
    entities: {
      'light.lamp': { entity_id: 'light.lamp', area_id: 'den', device_id: null },
      'light.white': { entity_id: 'light.white', area_id: 'den', device_id: null },
      'light.reading': { entity_id: 'light.reading', area_id: 'den', device_id: null },
    },
    devices: {},
    areas: { den: { area_id: 'den', name: 'Den', picture: null } },
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

async function mount(config: Record<string, unknown>, states?: Record<string, unknown>) {
  const card = document.createElement(String(config['type'])) as CardElement;
  card.setConfig({ ...config, type: `custom:${String(config['type'])}` });
  card.hass = house(states);
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** A light card's surface as drawn: its classes, its colour, its lit surface. */
async function light(config: Record<string, unknown>, states?: Record<string, unknown>) {
  const card = await mount({ type: 'fluvy-light-card', entity: 'light.lamp', ...config }, states);
  const article = card.shadowRoot!.querySelector('article')!;
  return {
    card,
    article,
    lit: article.classList.contains('is-lit'),
    glow: article.classList.contains('is-glow'),
    tone: [...article.classList].find((c) => c.startsWith('fv-tone--')) ?? '',
    accent: article.dataset['accent'] ?? '',
    surface: article.dataset['surface'] ?? '',
  };
}

afterEach(() => {
  document.body.replaceChildren();
  setLightDefaults({ tint: 'off', colors: false });
});

describe('a light card shows its colour (`tint`, #41)', () => {
  it('draws as 1.8 did where neither the card nor the house says: its colour on its parts, never its surface', async () => {
    const plain = await light({});
    expect([plain.lit, plain.glow, plain.surface]).toEqual([false, false, '']);
    expect(plain.accent).toBe('#ff9800');
  });

  it('lit, wears a lit tile’s whole fill in its bulb’s colour (`full`, the default strength)', async () => {
    const full = await light({ tint: 'on' });
    expect([full.lit, full.tone, full.surface, full.accent]).toEqual([
      true,
      'fv-tone--light',
      '',
      '#ff9800',
    ]);
    // the rulers on the fill take its ink, as a lit tile's
    expect(full.card.shadowRoot!.querySelector('fluvy-ruler')!.hasAttribute('on-fill')).toBe(true);
  });

  it('reads `tint: on` and `tint: off` as a YAML-mode dashboard hands them over: true and false', async () => {
    expect((await light({ tint: true })).lit).toBe(true);
    // the card's off wins over the house's on
    setLightDefaults({ tint: 'on', colors: false });
    expect((await light({ tint: false })).lit).toBe(false);
  });

  it('a wash as soft as asked, or as the lamp is bright: a dim lamp reads lit', async () => {
    expect((await light({ tint: 'on', tint_strength: 'soft' })).surface).toBe('#ff9800-60');
    const bright = await light({ tint: 'on', tint_strength: 'brightness' });
    expect([bright.glow, bright.surface]).toEqual([true, '#ff9800-80']);
    // at 10 % it takes the floor, never the rest's wash
    const dim = await light({ entity: 'light.dim', tint: 'on', tint_strength: 'brightness' });
    expect(dim.surface).toBe('#ff9800-60');
  });

  it('always: a quiet wash at rest, which a lit card never equals; a card colour of its own is its rest', async () => {
    const rest = await light({ entity: 'light.reading', tint: 'always' });
    expect([rest.lit, rest.glow, rest.surface]).toEqual([false, false, 'light-0']);
    const purple = await light({ entity: 'light.reading', tint: 'always', color: 'purple' });
    expect(purple.surface).toMatch(/^#[0-9a-f]{6}-0$/);
    const lit = await light({ entity: 'light.dim', tint: 'always', tint_strength: 'brightness' });
    expect(lit.surface).not.toBe(rest.surface.replace('light', '#ff9800'));
    expect(lit.surface).toBe('#ff9800-60');
    const own = await light({ entity: 'light.reading', tint: 'always', card_color: 'blue' });
    expect(own.surface).toBe('');
  });

  it('its own colour beats its bulb’s; Primary is the palette’s accent; State follows the light', async () => {
    const teal = await light({ tint: 'on', tint_strength: 'soft', color: 'teal' });
    expect(teal.accent).toBe('');
    expect(teal.surface).toMatch(/^#[0-9a-f]{6}-60$/);
    expect(teal.surface).not.toBe('#ff9800-60');
    const primary = await light({ tint: 'on', tint_strength: 'soft', color: 'primary' });
    expect([primary.accent, primary.surface]).toEqual(['', 'accent-60']);
    const full = await light({ tint: 'on', color: 'accent' });
    expect(full.tone).toBe('fv-tone--accent');
    const followed = await light({ tint: 'on', color: 'state' });
    expect([followed.accent, followed.tone]).toEqual(['#ff9800', 'fv-tone--light']);
  });

  it('honours a tone of its own, over the bulb', async () => {
    const heat = await light({ tint: 'on', tone: 'heat' });
    expect([heat.accent, heat.tone]).toEqual(['', 'fv-tone--heat']);
    expect((await light({ tint: 'on', tone: 'heat', tint_strength: 'soft' })).surface).toBe(
      'heat-60',
    );
  });

  it('a white: the palette’s lit light, or by its temperature where asked', async () => {
    const white = await light({ entity: 'light.white', tint: 'on', tint_strength: 'soft' });
    expect([white.accent, white.surface]).toEqual(['', 'light-60']);
    const warm = await light({
      entity: 'light.white',
      tint: 'on',
      tint_strength: 'soft',
      light_whites: 'temperature',
    });
    expect([warm.accent, warm.surface]).toEqual(['#ffa757', '#ffa757-60']);
  });

  it('a group: its lit members’ colours by brightness, a white adding none (mixed modes)', async () => {
    const group = await light({ entity: 'light.group', tint: 'on' });
    expect(group.accent).toBe('#ff9800');
  });

  it('switched on, shows the colour it last glowed before Home Assistant says', async () => {
    const id = 'light.flip';
    const lit = state(id, 'on', {
      friendly_name: 'Flip',
      brightness: 255,
      color_mode: 'hs',
      rgb_color: [244, 67, 54],
      ...BULB,
    });
    const seen = await light({ entity: id, tint: 'on' }, { ...STATES, [id]: lit });
    expect(seen.accent).toBe('#f44336');
    seen.card.hass = house({
      ...STATES,
      [id]: state(id, 'off', { friendly_name: 'Flip', ...BULB }),
    });
    await seen.card.updateComplete;
    expect(seen.article.dataset['accent']).toBeUndefined();
    seen.card.shadowRoot!.querySelector<HTMLElement>('.fv-hit')!.click();
    await seen.card.updateComplete;
    expect(seen.article.dataset['accent']).toBe('#f44336');
    expect(seen.article.classList.contains('is-lit')).toBe(true);
  });

  it('a light that cannot be read keeps the unavailable skin and the card’s whole anatomy, still', async () => {
    const live = await light({ entity: 'light.reading', tint: 'always' });
    const parts = (root: ShadowRoot): string[] =>
      [...root.querySelectorAll('.fv-hit, .fv-readout, .fv-stepper, fluvy-ruler')].map(
        (el) => el.classList[0] ?? el.tagName,
      );
    const gone = await light({ entity: 'light.porch', tint: 'always' });
    expect([gone.lit, gone.glow, gone.surface]).toEqual([false, false, '']);
    expect(gone.article.classList.contains('is-off')).toBe(true);
    expect(parts(gone.card.shadowRoot!)).toEqual(parts(live.card.shadowRoot!));
    expect(gone.card.shadowRoot!.querySelector('.fv-switch')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(gone.card.shadowRoot!.querySelector('.fv-readout__value')!.textContent?.trim()).toBe(
      '—',
    );
    // gone altogether: the same
    const missing = await light({ entity: 'light.nowhere', tint: 'always' });
    expect(parts(missing.card.shadowRoot!)).toEqual(parts(live.card.shadowRoot!));
  });

  it('the house’s default (fluvy’s settings) repaints a card that says none, at once, and never one that does', async () => {
    const silent = await light({});
    const own = await light({ tint: 'off' });
    setLightDefaults({ tint: 'on', colors: false });
    await silent.card.updateComplete;
    await own.card.updateComplete;
    expect(silent.article.classList.contains('is-lit')).toBe(true);
    expect(own.article.classList.contains('is-lit')).toBe(false);
    setLightDefaults({ tint: 'off', colors: false });
    await silent.card.updateComplete;
    expect(silent.article.classList.contains('is-lit')).toBe(false);
  });
});

describe('the light card’s editor (#41)', () => {
  const fields = (schema: readonly HaFormSchemaItem[]): HaFormSchemaItem[] =>
    schema.flatMap((item) => (item.schema ? fields(item.schema) : [item]));
  const field = (name: string) =>
    fields(FluvyLightCard.getConfigForm().schema).find((item) => item.name === name)!;
  const options = (name: string) =>
    (field(name).selector?.['select'] as { options: { value: string; label: string }[] }).options;

  it('offers the tint and its strength on one row, worded so they read beside "Show its colour"', () => {
    expect(options('tint').map((o) => [o.value, o.label])).toEqual([
      ['off', 'Never'],
      ['on', 'When on'],
      ['always', 'Always'],
    ]);
    expect(options('tint_strength').map((o) => [o.value, o.label])).toEqual([
      ['soft', 'Soft'],
      ['brightness', 'With the brightness'],
      ['full', 'Full colour'],
    ]);
    expect(options('light_whites').map((o) => o.value)).toEqual(['palette', 'temperature']);
    const row = FluvyLightCard.getConfigForm().schema.find((item) =>
      item.schema?.some((inner) => inner.name === 'tint'),
    );
    expect(row?.schema?.map((item) => item.name)).toEqual(['tint', 'tint_strength']);
  });

  it('its colour says State by default, as Home Assistant’s tile does', () => {
    expect(field('color').selector?.['ui_color']).toEqual({
      default_color: 'state',
      include_none: false,
      include_state: true,
    });
  });

  it('shows the house’s default where the card says none', () => {
    const defaults = () => FluvyLightCard.defaults!({ type: 'custom:fluvy-light-card' }, undefined);
    expect(defaults()).toMatchObject({
      tint: 'off',
      tint_strength: 'full',
      light_whites: 'palette',
    });
    setLightDefaults({ tint: 'always', colors: true });
    expect(defaults()['tint']).toBe('always');
  });
});

describe('tiles, rows and rooms in their bulbs’ colours (`light_colors`, #41)', () => {
  const accents = (card: CardElement, selector: string): string[] =>
    [...card.shadowRoot!.querySelectorAll<HTMLElement>(selector)].map(
      (el) => el.dataset['accent'] ?? '',
    );
  const ENTITIES = ['light.lamp', 'light.white', 'light.reading', 'switch.kettle'];

  it('a lit colour bulb’s tile wears its colour; a white, an off light and a plug keep their own', async () => {
    const card = await mount({ type: 'fluvy-tiles-card', light_colors: true, entities: ENTITIES });
    expect(accents(card, '.fv-tile')).toEqual(['#ff9800', '', '', '']);
  });

  it('as 1.8 drew them where neither the card nor the house says; the house’s default where the card says none', async () => {
    const card = await mount({ type: 'fluvy-tiles-card', entities: ENTITIES });
    expect(accents(card, '.fv-tile')).toEqual(['', '', '', '']);
    setLightDefaults({ tint: 'off', colors: true });
    await card.updateComplete;
    expect(accents(card, '.fv-tile')).toEqual(['#ff9800', '', '', '']);
    const own = await mount({ type: 'fluvy-tiles-card', light_colors: false, entities: ENTITIES });
    expect(accents(own, '.fv-tile')).toEqual(['', '', '', '']);
  });

  it('a tile’s own colour, then its tone, then the card’s colour or tone come before the bulb’s', async () => {
    const items = await mount({
      type: 'fluvy-tiles-card',
      light_colors: true,
      tiles: [
        { entity: 'light.lamp', color: 'teal' },
        { entity: 'light.lamp', tone: 'heat' },
      ],
    });
    const [teal, heat] = accents(items, '.fv-tile');
    expect(teal).toMatch(/^#[0-9a-f]{6}$/);
    expect(teal).not.toBe('#ff9800');
    expect(heat).toBe('');
    const card = await mount({
      type: 'fluvy-tiles-card',
      light_colors: true,
      color: 'purple',
      entities: ['light.lamp'],
    });
    expect(accents(card, '.fv-tile')).toEqual(['']);
  });

  it('a lone tile wears it on its own article', async () => {
    const card = await mount({ type: 'fluvy-tile-card', entity: 'light.lamp', light_colors: true });
    expect(accents(card, 'article')).toEqual(['#ff9800']);
  });

  it('a row of lights: each lit colour bulb in its colour', async () => {
    const card = await mount({
      type: 'fluvy-entities-card',
      light_colors: true,
      entities: ENTITIES,
    });
    expect(accents(card, '.fv-row')).toEqual(['#ff9800', '', '', '']);
  });

  it('a room: its tiles each in its own, its lights’ row in the colour of what is lit', async () => {
    const tiles = await mount({
      type: 'fluvy-room-card',
      area: 'den',
      variant: 'tile',
      controls: 'tiles',
      light_colors: true,
    });
    expect(accents(tiles, '.fv-tile')).toContain('#ff9800');
    const rows = await mount({
      type: 'fluvy-room-card',
      area: 'den',
      variant: 'tile',
      light_colors: true,
    });
    expect(accents(rows, '.fv-row')[0]).toBe('#ff9800');
  });
});
