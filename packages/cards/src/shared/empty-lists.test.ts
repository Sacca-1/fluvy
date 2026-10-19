// @vitest-environment happy-dom
import {
  VISIBILITY_EVENT,
  type HassEntity,
  type HomeAssistant,
  type LovelaceCardConfig,
} from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { catalogue, familiesDefined } from '../index.js';

// the index fetches the families: they land before this file's page goes
afterAll(() => familiesDefined);

/*
 * #48: a card of a list is never a configuration error for being empty. A filter that matches nothing yet hands it
 * `[]` (auto-entities), then the matches on the same element; a list may hold objects with options of their own, a
 * section's title or a divider among them. Held here for each of the fifteen cards of a list.
 */

/** Every entity is called so, and so is every item: what a card shows of its list is found by this word. */
const MARKER = 'Marker';

const entity = (entity_id: string, state: string, attributes = {}): HassEntity => ({
  entity_id,
  state,
  attributes: { friendly_name: MARKER, ...attributes },
  last_changed: '2026-10-17T08:00:00Z',
  last_updated: '2026-10-17T08:00:00Z',
});

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  states: Object.fromEntries(
    [
      entity('sensor.level', '64', { unit_of_measurement: '%', device_class: 'battery' }),
      entity('sensor.power', '420', { unit_of_measurement: 'W', device_class: 'power' }),
      entity('light.desk', 'on', { supported_color_modes: ['brightness'], brightness: 128 }),
      entity('update.core', 'on', { installed_version: '1.0', latest_version: '1.1' }),
      entity('input_boolean.guest', 'off'),
      entity('script.night', 'off'),
      entity('scene.evening', '2026-10-17T07:00:00Z'),
      entity('binary_sensor.door', 'on', { device_class: 'door' }),
      entity('person.ana', 'home'),
      entity('zone.home', '1'),
    ].map((state) => [state.entity_id, state]),
  ),
  entities: {},
  devices: {},
  areas: {},
  config: { unit_system: { temperature: '°C', length: 'km' } },
  user: { id: 'u1', name: 'Ana', is_admin: true },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  hassUrl: (path: string) => path,
  // the readouts ask the recorder for their trend: it has nothing to say here
  callWS: async () => ({}),
} as unknown as HomeAssistant;

/** A house with nothing in it: what the card picker hands a card's stub in a new instance. */
const empty = { ...hass, states: {} } as HomeAssistant;

interface ListCase {
  readonly tag: string;
  /** Where the list goes (auto-entities' default `entities` where the card reads it). */
  readonly key: string;
  /** One item of the list, named. */
  readonly item: Record<string, unknown>;
  /** What else the config needs to show its items' names. */
  readonly extra?: Record<string, unknown>;
}

const named = (id: string): Record<string, unknown> => ({ entity: id, name: MARKER });

const CASES: readonly ListCase[] = [
  { tag: 'fluvy-bars-card', key: 'entities', item: named('sensor.level') },
  { tag: 'fluvy-entities-card', key: 'entities', item: named('light.desk') },
  { tag: 'fluvy-tiles-card', key: 'entities', item: named('light.desk') },
  { tag: 'fluvy-updates-card', key: 'entities', item: { entity: 'update.core' } },
  { tag: 'fluvy-stat-tiles-card', key: 'entities', item: named('sensor.level') },
  { tag: 'fluvy-helpers-card', key: 'entities', item: named('input_boolean.guest') },
  { tag: 'fluvy-distribution-card', key: 'entities', item: named('sensor.power') },
  { tag: 'fluvy-actions-card', key: 'entities', item: named('script.night') },
  { tag: 'fluvy-scenes-card', key: 'entities', item: named('scene.evening') },
  { tag: 'fluvy-openings-card', key: 'entities', item: named('binary_sensor.door') },
  { tag: 'fluvy-chips-card', key: 'chips', item: { name: MARKER, path: '/home' } },
  {
    tag: 'fluvy-map-card',
    key: 'entities',
    item: { entity: 'person.ana' },
    extra: { variant: 'rows' },
  },
  { tag: 'fluvy-people-card', key: 'entities', item: named('person.ana') },
  { tag: 'fluvy-readouts-card', key: 'entities', item: named('sensor.level') },
  {
    tag: 'fluvy-lights-card',
    key: 'entities',
    item: named('light.desk'),
    extra: { variant: 'chips' },
  },
];

/** What auto-entities may hand over around the matches: a section's title and a divider. */
const SECTION = { type: 'section', label: 'Upstairs' };
const DIVIDER = { type: 'divider' };

type Mounted = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  preview: boolean;
  config?: LovelaceCardConfig;
  updateComplete: Promise<boolean>;
  watched(): readonly string[];
  getCardSize(): number;
  connectedWhileHidden?: boolean;
};
type CardClass = {
  layoutHeight(config: LovelaceCardConfig): number;
  getStubConfig?(hass: HomeAssistant, entities: readonly string[]): LovelaceCardConfig;
};

const configOf = (c: ListCase, list: unknown, more: Record<string, unknown> = {}) => ({
  type: `custom:${c.tag}`,
  ...c.extra,
  [c.key]: list,
  ...more,
});

async function mount(c: ListCase, list: unknown, more?: Record<string, unknown>): Promise<Mounted> {
  const card = document.createElement(c.tag) as Mounted;
  card.setConfig(configOf(c, list, more));
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const text = (card: Mounted): string => card.shadowRoot?.textContent ?? '';
/** The panel an empty list draws; the updates card's own is its quiet row. */
const panelOf = (card: Mounted): Element | null | undefined =>
  card.shadowRoot?.querySelector('.fv-empty-state, .in-rows--quiet');
const heightOf = (tag: string, config: LovelaceCardConfig): number =>
  (customElements.get(tag) as unknown as CardClass).layoutHeight(config);
const onGrid = (height: number): boolean =>
  Number.isFinite(height) && height > 0 && height % 4 === 0;

describe('a card of a list with nothing in it (#48)', () => {
  afterEach(() => document.body.replaceChildren());

  it('covers every card of a list in the catalogue', async () => {
    const tags = (await catalogue()).map(([tag]) => tag);
    for (const c of CASES) expect(tags, c.tag).toContain(c.tag);
  });

  it.each(CASES)('$tag: an empty list is its panel, never an error', async (c) => {
    const card = await mount(c, []);
    expect(panelOf(card), c.tag).toBeTruthy();
    expect(text(card)).not.toContain(MARKER);
    expect(card.watched().every((id) => typeof id === 'string')).toBe(true);
    const height = heightOf(c.tag, configOf(c, []));
    expect(onGrid(height), `${c.tag}: ${height}`).toBe(true);
    // a list that is not given at all is an empty one
    expect(onGrid(heightOf(c.tag, { type: `custom:${c.tag}`, ...c.extra }))).toBe(true);
    expect(card.getCardSize()).toBeGreaterThan(0);
  });

  it.each(CASES)('$tag: says its words in the config’s own', async (c) => {
    const card = await mount(c, [], { empty_text: 'All closed' });
    expect(text(card)).toContain('All closed');
  });

  it.each(CASES)('$tag: reads a list of objects, skipping a section and a divider', async (c) => {
    const card = await mount(c, [SECTION, c.item, DIVIDER]);
    expect(panelOf(card)).toBeFalsy();
    expect(text(card)).toContain(MARKER);
    const watched = card.watched();
    expect(watched.every((id) => typeof id === 'string')).toBe(true);
    if (typeof c.item['entity'] === 'string') expect(watched).toContain(c.item['entity']);
    // a section's title or a divider is no row: the card is as tall as with the item alone
    expect(heightOf(c.tag, configOf(c, [SECTION, c.item, DIVIDER]))).toBe(
      heightOf(c.tag, configOf(c, [c.item])),
    );
  });

  it.each(CASES)('$tag: rows, then none, then rows again on one element', async (c) => {
    const card = await mount(c, [c.item]);
    expect(text(card)).toContain(MARKER);
    card.setConfig(configOf(c, []));
    await card.updateComplete;
    // what auto-entities does once its filter matches nothing: the same card, never the rows it had
    expect(text(card)).not.toContain(MARKER);
    expect(panelOf(card)).toBeTruthy();
    card.setConfig(configOf(c, [c.item]));
    await card.updateComplete;
    expect(text(card)).toContain(MARKER);
    expect(panelOf(card)).toBeFalsy();
  });

  it.each(CASES)('$tag: hides while empty when asked, never in the editor', async (c) => {
    // what Home Assistant's wrapper hears
    const heard: boolean[] = [];
    const listen = (event: Event): void => {
      heard.push((event as CustomEvent<{ value: boolean }>).detail.value);
    };
    document.addEventListener(VISIBILITY_EVENT, listen);
    const card = await mount(c, [], { hide_empty: true });
    expect(card.hidden).toBe(true);
    expect(card.connectedWhileHidden).toBe(true);
    card.setConfig(configOf(c, [c.item], { hide_empty: true }));
    await card.updateComplete;
    expect(card.hidden).toBe(false);
    card.preview = true;
    card.setConfig(configOf(c, [], { hide_empty: true }));
    await card.updateComplete;
    expect(card.hidden).toBe(false);
    document.removeEventListener(VISIBILITY_EVENT, listen);
    expect(heard).toEqual([false, true]);
    // left empty without asking, it stays in sight
    const shown = await mount(c, []);
    expect(shown.hidden).toBe(false);
  });

  it.each(CASES)('$tag: a list that is not one is the one error', (c) => {
    const card = document.createElement(c.tag) as Mounted;
    expect(() => card.setConfig(configOf(c, 'sensor.level'))).toThrow('must be a list');
  });

  it.each(CASES)('$tag: its stub in an empty house is a card', (c) => {
    const element = customElements.get(c.tag) as unknown as CardClass;
    const stub = element.getStubConfig?.(empty, []) ?? { type: `custom:${c.tag}` };
    const card = document.createElement(c.tag) as Mounted;
    expect(() => card.setConfig(stub)).not.toThrow();
    expect(onGrid(element.layoutHeight(stub))).toBe(true);
  });
});

describe('auto-entities’ own key', () => {
  afterEach(() => document.body.replaceChildren());

  it('fills the bars’ rows and the stat tiles’ tiles with its `entities`', async () => {
    for (const tag of ['fluvy-bars-card', 'fluvy-stat-tiles-card']) {
      const card = await mount({ tag, key: 'entities', item: {} }, [named('sensor.level')]);
      expect(text(card), tag).toContain(MARKER);
      expect(card.watched(), tag).toContain('sensor.level');
    }
  });
});

describe('every card’s stub in an empty house', () => {
  // a card of one entity still needs one (Home Assistant's own tile does too); a card of a list is held above
  it('is given without an error', async () => {
    for (const [tag, element] of await catalogue()) {
      const stub = (element as unknown as CardClass).getStubConfig;
      expect(() => stub?.call(element, empty, []), tag).not.toThrow();
    }
  });
});
