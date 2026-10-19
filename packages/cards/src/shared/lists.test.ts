// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the index fetches the families: they land before this file's page goes
afterAll(() => familiesDefined);

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
  states: {
    'update.core': entity('update.core', 'on', { title: 'Core', latest_version: '2026.11' }),
    'update.os': entity('update.os', 'off', { title: 'OS' }),
    'person.ana': entity('person.ana', 'home'),
    'zone.home': entity('zone.home', '1'),
    'light.desk': entity('light.desk', 'on'),
    'light.hall': entity('light.hall', 'off'),
  },
  entities: {},
  devices: {},
  areas: {},
  config: { unit_system: { temperature: '°C', length: 'km' } },
  user: { id: 'u1', name: 'Ana', is_admin: true },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
} as unknown as HomeAssistant;

type Mounted = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
  watched(): readonly string[];
};

async function mount(tag: string, config: Record<string, unknown>): Promise<Mounted> {
  const card = document.createElement(tag) as Mounted;
  card.setConfig({ type: `custom:${tag}`, ...config });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** What auto-entities hands a card: objects with options of their own, and a section's title among them. */
const handed = (...ids: string[]): unknown[] => [
  { type: 'section', label: 'Found' },
  ...ids.map((id) => ({ entity: id, secondary_info: 'last-changed' })),
];

describe('a list of objects, as auto-entities hands it', () => {
  afterEach(() => document.body.replaceChildren());

  it('is read by its ids: the updates card lists what waits and watches strings', async () => {
    const card = await mount('fluvy-updates-card', {
      entities: handed('update.core', 'update.os'),
    });
    expect(card.watched()).toEqual(['update.core', 'update.os']);
    expect(card.shadowRoot?.querySelectorAll('.fv-row').length).toBeGreaterThan(0);
  });

  it('places the map’s people by their ids', async () => {
    const card = await mount('fluvy-map-card', { variant: 'rows', entities: handed('person.ana') });
    expect(card.watched()).toEqual(['person.ana', 'zone.home']);
    expect(card.shadowRoot?.textContent).toContain('person.ana');
  });

  it('counts the heading’s entities by their ids', async () => {
    const card = await mount('fluvy-heading-card', {
      title: 'Lights',
      entities: handed('light.desk', 'light.hall'),
    });
    expect(card.watched()).toEqual(['light.desk', 'light.hall']);
    expect(card.shadowRoot?.textContent).toMatch(/1\D+2/);
  });
});
