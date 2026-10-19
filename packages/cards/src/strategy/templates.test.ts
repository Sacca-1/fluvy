// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// the cards register their heights with core: the strategy lays columns out with them
import { catalogue } from '../index.js';

const CATALOGUE = await catalogue();
import { FluvyHomeStrategy } from './home-strategy.js';
import { generate, generateWith } from './generate.js';
import {
  HOME_TEMPLATE,
  strategyOptions,
  TEMPLATES,
  templateById,
  templateOf,
} from './templates.js';
import type { View } from './types.js';
import type { HomeAssistant } from '@fluvy/core';
import {
  hcDishwasher,
  houseOf,
  lgFridge,
  plugWasher,
  tuyaKettle,
} from '../appliance/fixtures/index.js';

import {
  DEMO_ENERGY_SOURCES,
  DEMO_EXTRAS,
  DEMO_HEAT_PUMP_READINGS,
  DEMO_ROOMS,
  demoHass,
  type DemoEntity,
} from '@fluvy/demo-home';

const house = (more: readonly DemoEntity[] = [], consumption?: readonly string[]) =>
  demoHass({ more, ...(consumption ? { consumption } : {}) }) as never;
/** The moment the appliances' fixtures are read at. */
const APPLIANCES_AT = Date.parse('2026-09-17T19:47:00Z');
/** The demo home with one of everything the library has a card for, appliances large and small among them (#47). */
const everything = () =>
  houseOf(
    [
      lgFridge(APPLIANCES_AT),
      hcDishwasher(APPLIANCES_AT),
      plugWasher(APPLIANCES_AT),
      tuyaKettle(APPLIANCES_AT),
    ],
    APPLIANCES_AT,
    demoHass({
      more: [...DEMO_EXTRAS, ...DEMO_ROOMS],
      consumption: ['sensor.washing_machine_energy_today', 'sensor.dryer_energy_today'],
      sources: DEMO_ENERGY_SOURCES,
    }) as unknown as Partial<HomeAssistant>,
  ) as never;
const cardsOf = (views: readonly View[]) =>
  views.flatMap((v) => v.sections.flatMap((s) => s.cards));

/** Every `entity` a card config names, however deep, and every id of its `entities`. */
function entitiesOf(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) entitiesOf(item, out);
  else if (value && typeof value === 'object')
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'entity') out.push(inner);
      else if (key === 'entities' && Array.isArray(inner))
        for (const item of inner) {
          if (typeof item === 'string' || typeof item !== 'object') out.push(item);
          else entitiesOf(item, out);
        }
      else entitiesOf(inner, out);
    }
  return out;
}

describe('the dashboard templates', () => {
  it('name every entity by its id: a card is never handed a flag for an entity', async () => {
    for (const template of TEMPLATES)
      for (const hass of [house(), everything()]) {
        const { views } = await generate({ type: template.type }, hass);
        const named = entitiesOf(cardsOf(views));
        expect(named.length, template.id).toBeGreaterThan(0);
        expect(
          named.filter((id) => typeof id !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(id)),
          template.id,
        ).toEqual([]);
      }
  });

  it('are found by their strategy type, and nothing else is', () => {
    expect(templateOf('custom:fluvy-energy')?.id).toBe('energy');
    expect(templateOf('custom:fluvy-home')).toBe(HOME_TEMPLATE);
    expect(templateOf('custom:button-card')).toBeUndefined();
    expect(templateOf(undefined)).toBeUndefined();
  });

  it('generate the same dashboard for the demo home, template by template (golden file)', async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    for (const template of TEMPLATES.filter((t) => t.id !== 'home'))
      expect(await generate({ type: template.type }, hass)).toMatchSnapshot(template.id);
  });

  it('lay a room’s appliances across its subview, on the wall across its two columns (golden file, #47)', async () => {
    const hass = everything() as unknown as HomeAssistant;
    // the kitchen holds the dishwasher and the kettle
    (hass.devices['hc-dish'] as { area_id: string | null }).area_id = 'kitchen';
    (hass.devices['tuya-kettle'] as { area_id: string | null }).area_id = 'kitchen';
    for (const template of [templateById('rooms'), templateById('wall')]) {
      const kitchen = (await generate({ type: template.type }, hass as never)).views.find(
        (view) => view.path === 'room-kitchen',
      )!;
      const across = kitchen.sections.filter((section) => section.column_span);
      expect(across.map((section) => section.column_span)).toEqual([template.columns]);
      expect(kitchen).toMatchSnapshot(template.id);
    }
  });

  it('build the home dashboard exactly as the home strategy always did', async () => {
    const hass = house();
    const config = { type: 'custom:fluvy-home' as const, tile_size: 'compact' as const };
    expect(await generate(config, hass)).toEqual(await FluvyHomeStrategy.generate(config, hass));
    expect(await generateWith(HOME_TEMPLATE, config, hass)).toEqual(
      await FluvyHomeStrategy.generate(config, hass),
    );
  });

  it('write only configs their cards accept', async () => {
    const rejected: string[] = [];
    for (const hass of [house(), everything()])
      for (const template of TEMPLATES) {
        const { views } = await generate({ type: template.type }, hass);
        for (const card of cardsOf(views)) {
          const Card = customElements.get(card.type.replace(/^custom:/, '')) as
            (new () => HTMLElement & { setConfig(config: unknown): void }) | undefined;
          if (!Card) {
            rejected.push(`${template.id} ${card.type}: not defined`);
            continue;
          }
          try {
            new Card().setConfig(card);
          } catch (error) {
            rejected.push(`${template.id} ${card.type}: ${(error as Error).message}`);
          }
        }
      }
    expect(rejected).toEqual([]);
  });

  it('put every card of the library to use, between them, in a house that has one of everything', async () => {
    const used = new Set<string>();
    for (const template of TEMPLATES)
      for (const card of cardsOf((await generate({ type: template.type }, everything())).views))
        used.add(card.type);
    // the automations card is placed by hand (1.8): the automatic dashboards do not put it on a view; the appliance
    // card is drawn by the appliances card, which lays the strategy's out whole (#47)
    const byHand = new Set(['custom:fluvy-automations-card', 'custom:fluvy-appliance-card']);
    expect(
      CATALOGUE.map(([tag]) => `custom:${tag}`).filter(
        (type) => !used.has(type) && !byHand.has(type),
      ),
    ).toEqual([]);
  });

  it('give every view the template’s columns: three, and two on the wall', async () => {
    for (const template of TEMPLATES) {
      const { views } = await generate({ type: template.type }, everything());
      expect(views.length).toBeGreaterThan(0);
      for (const view of views) {
        expect(view.max_columns).toBe(template.columns);
        // the columns, then a band across all of them where the view has one (the appliances)
        const across = view.sections.filter((section) => section.column_span);
        expect(view.sections.length - across.length).toBe(template.columns);
        expect(view.sections.slice(template.columns)).toEqual(across);
        for (const band of across) expect(band.column_span).toBe(template.columns);
      }
    }
  });

  it('open with the greeting (and the tabs, when asked), except the wall, which opens with its own composition', async () => {
    for (const template of TEMPLATES) {
      // by default the header's tabs lead between the views: no chips under the greeting
      const plain = await generate({ type: template.type }, everything());
      expect(
        plain.views[0]!.sections[0]!.cards.some(
          (c) =>
            c.type === 'custom:fluvy-chips-card' &&
            (c['chips'] as { path?: string }[]).every((chip) => chip.path !== undefined),
        ),
      ).toBe(false);
      const { views } = await generate(
        { type: template.type, greeting_tabs: 'show' },
        everything(),
      );
      const first = views[0]!.sections[0]!.cards;
      expect(first[0]!.type).toBe('custom:fluvy-hello-card');
      const tabs = first.filter(
        (c) =>
          c.type === 'custom:fluvy-chips-card' &&
          (c['chips'] as { path?: string }[]).every((chip) => chip.path !== undefined),
      );
      // the tabs only when there is more than one; a wall has none (its chips are its scenes)
      if (template.header === 'hello' && views.filter((v) => !v.subview).length > 1)
        expect(first[1]).toBe(tabs[0]);
      else expect(tabs).toEqual([]);
    }
  });

  it('keep the subviews out of the tabs and give each a way back', async () => {
    for (const template of TEMPLATES) {
      const { views } = await generate({ type: template.type }, everything());
      const tabs = views.filter((v) => !v.subview).map((v) => v.path);
      const rooms = views.filter((v) => v.subview);
      for (const room of rooms) {
        // a room, or every appliance (Home's)
        expect(room.path.startsWith('room-') || room.path === 'appliances').toBe(true);
        expect(room.back_path).toBeDefined();
        const chips = cardsOf(views).filter(
          (c) => c.type === 'custom:fluvy-chips-card',
        ) as unknown as {
          chips: { path?: string }[];
        }[];
        for (const card of chips)
          expect(card.chips.some((chip) => chip.path?.endsWith(`/${room.path}`))).toBe(false);
      }
      // the home opens a room from its Rooms view, the rooms and the wall always
      if (template.id === 'rooms' || template.id === 'wall')
        expect(rooms.length).toBeGreaterThan(0);
      if (template.id === 'home')
        expect(rooms.some((room) => room.path.startsWith('room-'))).toBe(tabs.includes('rooms'));
    }
  });

  it('leave out the views `hide` names, never the first', async () => {
    const energy = templateById('energy');
    const all = (await generate({ type: energy.type }, everything())).views
      .filter((v) => !v.subview)
      .map((v) => v.path);
    expect(all[0]).toBe('now');
    expect(all.length).toBeGreaterThan(2);
    const kept = (
      await generate({ type: energy.type, hide: ['now', 'meters', all[1]!] }, everything())
    ).views.map((v) => v.path);
    expect(kept[0]).toBe('now');
    expect(kept).not.toContain('meters');
    expect(kept).not.toContain(all[1]);
  });

  it('give the wall the rooms asked for that exist, in that order, and every room without a choice', async () => {
    const wall = templateById('wall');
    const roomsOf = (views: readonly View[]) => views.filter((v) => v.subview).map((v) => v.path);
    // an attic with nothing in it: never a room by itself, kept when the wall asks for it
    const house = () => {
      const hass = everything() as { areas: Record<string, unknown> };
      hass.areas['attic'] = { area_id: 'attic', name: 'Attic' };
      return hass as never;
    };
    const all = roomsOf((await generate({ type: wall.type }, house())).views);
    expect(all.length).toBeGreaterThan(2);
    expect(all).not.toContain('room-attic');
    const chosen = (
      await generate(
        { type: wall.type, areas: ['kitchen', 'attic', 'living_room', 'nowhere'] },
        house(),
      )
    ).views;
    expect(roomsOf(chosen)).toEqual(['room-kitchen', 'room-attic', 'room-living_room']);
    const wallView = chosen[0]!;
    const roomCards = wallView.sections[0]!.cards.filter(
      (c) => c.type === 'custom:fluvy-room-card',
    );
    expect(roomCards.map((c) => c['area'])).toEqual(['kitchen', 'attic', 'living_room']);
    expect(roomCards.every((c) => c['variant'] === 'tile')).toBe(true);
    expect(wallView.back_path).toBeUndefined();
    expect(chosen[1]!.back_path).toBe('/fluvy-home/wall');
  });

  it('give the rooms dashboard a tab a floor when the house has two, and a room its floor’s tab to come back to', async () => {
    const rooms = templateById('rooms');
    const { views } = await generate({ type: rooms.type }, everything());
    const tabs = views.filter((v) => !v.subview);
    expect(tabs.map((v) => v.path)).toEqual(['floor-ground', 'floor-upstairs', 'rooms']);
    expect(tabs.map((v) => v.title)).toEqual(['Ground floor', 'Upstairs', 'Other rooms']);
    const bedroom = views.find((v) => v.path === 'room-bedroom')!;
    expect(bedroom.back_path).toBe('/fluvy-home/floor-upstairs');
    const garden = views.find((v) => v.path === 'room-garden')!;
    expect(garden.back_path).toBe('/fluvy-home/rooms');
  });

  it('draw the security cameras at the refresh asked for, and the wall’s scenes up to the number asked for', async () => {
    const security = templateById('security');
    const { views } = await generate({ type: security.type, camera_refresh: 30 }, everything());
    const cameras = cardsOf(views).filter((c) => c.type === 'custom:fluvy-camera-card');
    expect(cameras.length).toBeGreaterThan(0);
    expect(cameras.every((c) => c['refresh'] === 30)).toBe(true);
    const wall = templateById('wall');
    const chips = cardsOf(
      (await generate({ type: wall.type, scenes_max: 4 }, everything())).views,
    ).find((c) => c.type === 'custom:fluvy-chips-card') as unknown as { chips: unknown[] };
    expect(chips.chips.length).toBeLessThanOrEqual(4);
  });

  it('keep only the options a template knows, each well formed', () => {
    expect(
      strategyOptions(
        {
          thermostat_variant: 'ruler',
          tile_size: 'huge',
          flow_style: 'rail',
          hide: ['media', 'home', 'nowhere', 'media'],
          weather: 'weather.home',
          areas: ['kitchen'],
        },
        HOME_TEMPLATE,
      ),
    ).toEqual({ thermostat_variant: 'ruler', flow_style: 'rail', hide: ['media'] });
    expect(
      strategyOptions(
        { camera_refresh: 30, hide: ['cameras'], flow_style: 'rail', areas: ['kitchen'] },
        templateById('security'),
      ),
    ).toEqual({ camera_refresh: 30, hide: ['cameras'] });
    expect(
      strategyOptions(
        { areas: ['kitchen', '', 7, 'kitchen'], scenes_max: 5 },
        templateById('wall'),
      ),
    ).toEqual({ areas: ['kitchen'] });
    expect(strategyOptions('nonsense', HOME_TEMPLATE)).toEqual({});
  });
});
