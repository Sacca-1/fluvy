// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// the cards register their heights with core: the strategy lays columns out with them
import '../index.js';
import { FluvyHomeStrategy } from './home-strategy.js';
import {
  hcCoffee,
  hcDishwasher,
  hcOven,
  houseOf,
  lgDryer,
  lgFridge,
  lgWasher,
  mieleHob,
  plugWasher,
  tuyaKettle,
} from '../appliance/fixtures/index.js';
import type { HomeAssistant } from '@fluvy/core';

import {
  DEMO_ENERGY_SOURCES,
  DEMO_EXTRAS,
  DEMO_HEAT_PUMP_READINGS,
  DEMO_ROOMS,
  demoHass,
  type DemoEntity,
} from '@fluvy/demo-home';

/** The demo home as a strategy sees it, with what a test adds on top. */
function house(more: readonly DemoEntity[] = [], consumption?: readonly string[]) {
  return demoHass({ more, ...(consumption ? { consumption } : {}) }) as never;
}

const entity = (
  id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  registry: Record<string, unknown> = {},
): DemoEntity => ({ id, state, attributes, registry });

const types = (cards: readonly { type: string }[]): string[] =>
  cards.map((c) => c.type.replace('custom:fluvy-', '').replace('-card', ''));

describe("custom:fluvy-home strategy — the grid meter's sign", () => {
  /** A grid meter found by its words, negative while the house imports at night. */
  const withMeter = (hourly: number) => {
    const hass = house([
      entity('sensor.solar_inverter_power', '0', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Solar inverter power',
      }),
      entity('sensor.grid_meter_power', '-1286', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid meter power',
      }),
    ]) as unknown as { callWS: (msg: { type: string }) => Promise<unknown> };
    const prefs = hass.callWS;
    hass.callWS = async (msg) =>
      msg.type === 'recorder/statistics_during_period'
        ? {
            'sensor.grid_meter_power': Array.from({ length: 24 }, (_, i) => ({
              start: i,
              mean: hourly,
            })),
            'sensor.solar_inverter_power': Array.from({ length: 24 }, (_, i) => ({
              start: i,
              mean: 0,
            })),
          }
        : prefs(msg);
    return hass as never;
  };
  const flow = (views: Awaited<ReturnType<typeof FluvyHomeStrategy.generate>>['views']) =>
    views
      .flatMap((v) => v.sections.flatMap((s) => s.cards))
      .find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as Record<
      string,
      unknown
    >;

  it('inverts a meter that reads negative through the dark hours', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withMeter(-1200),
    );
    expect(flow(views)?.['sources']).toContainEqual({
      type: 'grid',
      power: 'sensor.grid_meter_power',
      invert: true,
    });
  });

  it('keeps a meter that imports as positive', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withMeter(1200),
    );
    expect(flow(views)?.['sources']).toContainEqual({
      type: 'grid',
      power: 'sensor.grid_meter_power',
    });
  });
});

/** The moment the appliances' fixtures are read at. */
const APPLIANCES_AT = Date.parse('2026-09-17T19:47:00Z');
/** A house with the reporter's kitchen and laundry (#47): a large appliance of every kind, a kettle and a plug's washer. */
const withAppliances = (base: Record<string, unknown> = demoHass() as never) =>
  houseOf(
    [
      hcCoffee(APPLIANCES_AT),
      mieleHob(APPLIANCES_AT),
      hcOven(APPLIANCES_AT),
      lgDryer(APPLIANCES_AT),
      lgWasher(APPLIANCES_AT),
      hcDishwasher(APPLIANCES_AT),
      lgFridge(APPLIANCES_AT),
      tuyaKettle(APPLIANCES_AT),
      plugWasher(APPLIANCES_AT),
    ],
    APPLIANCES_AT,
    base as Partial<HomeAssistant>,
  ) as never;

/** The demo home with one of everything the library has a card for. */
const everything = () =>
  withAppliances(
    demoHass({
      more: [...DEMO_EXTRAS, ...DEMO_ROOMS],
      consumption: ['sensor.washing_machine_energy_today', 'sensor.dryer_energy_today'],
      sources: DEMO_ENERGY_SOURCES,
    }) as never,
  );

describe('custom:fluvy-home strategy', () => {
  it('writes only configs its cards accept', async () => {
    await (await import('../index.js')).catalogue(); // the energy family too
    const rejected: string[] = [];
    for (const hass of [house(), everything()]) {
      const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
      for (const card of views.flatMap((v) => v.sections.flatMap((s) => s.cards))) {
        const Card = customElements.get(card.type.replace(/^custom:/, '')) as
          (new () => HTMLElement & { setConfig(config: unknown): void }) | undefined;
        if (!Card) {
          rejected.push(`${card.type}: not defined`);
          continue;
        }
        try {
          new Card().setConfig(card);
        } catch (error) {
          rejected.push(`${card.type}: ${(error as Error).message}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it('draws the cards in the style the dashboard asks for', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      {
        type: 'custom:fluvy-home',
        thermostat_variant: 'compact',
        tile_size: 'compact',
        flow_style: 'rail',
      },
      house(),
    );
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const of = (type: string) => cards.filter((c) => c.type === `custom:fluvy-${type}-card`);
    expect(of('thermostat').every((c) => c['variant'] === 'compact')).toBe(true);
    expect(of('energy-flow').every((c) => c['flow_style'] === 'rail')).toBe(true);
    const lights = views.find((v) => v.path === 'lights')!.sections.flatMap((s) => s.cards);
    const tiles = lights.filter((c) => c.type === 'custom:fluvy-tile-card');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((c) => c['size'] === 'compact')).toBe(true);
  });

  it('puts every card of the library to use in a house that has one of everything', async () => {
    const CATALOGUE = await (await import('../index.js')).catalogue();
    // the views as chips under the greeting too: the chips card is in use
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      everything(),
    );
    const used = new Set(
      views.flatMap((v) => v.sections.flatMap((s) => s.cards.map((c) => c.type))),
    );
    // the automations card is placed by hand (1.8): the automatic dashboards do not put it on a view; the appliance
    // card is drawn by the appliances card, which lays the strategy's out whole (#47)
    // Sensor bands require user-chosen scales and references; automatic dashboards must not invent them.
    const byHand = new Set([
      'custom:fluvy-automations-card',
      'custom:fluvy-appliance-card',
      'custom:fluvy-sensor-band-card',
    ]);
    expect(
      CATALOGUE.map(([tag]) => `custom:${tag}`).filter(
        (type) => !used.has(type) && !byHand.has(type),
      ),
    ).toEqual([]);
  });

  it('builds a view for each thing the house has, with the greeting (and the tabs, when asked) on every one', async () => {
    // by default the header's tabs are the way between the views: the greeting stands alone
    const plain = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    for (const v of plain.views)
      expect(types(v.sections[0]!.cards).slice(0, 2)).not.toContain('chips');
    expect(types(plain.views[0]!.sections[0]!.cards)[0]).toBe('hello');
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      house(),
    );
    expect(views.filter((v) => !v.subview).map((v) => v.path)).toEqual([
      'home',
      'rooms',
      'lights',
      'climate',
      'energy',
      'media',
      'sensors',
    ]);
    for (const v of views)
      expect(types(v.sections[0]!.cards).slice(0, 2)).toEqual(['hello', 'chips']);
    const chips = views[0]!.sections[0]!.cards[1] as unknown as {
      chips: { label: string; path: string; icon: string }[];
    };
    expect(chips.chips.map((c) => c.label)).toEqual([
      'Home',
      'Rooms',
      'Lights',
      'Climate',
      'Energy',
      'Media',
      'Sensors',
    ]);
    expect(chips.chips[2]!.path.endsWith('/lights')).toBe(true);
    expect(chips.chips.every((c) => c.icon.startsWith('fluvy:'))).toBe(true);
  });

  it('generates the same dashboard for the demo home (golden file: a change here is a change of the dashboard)', async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    expect(await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass)).toMatchSnapshot();
  });

  it('puts the running thermostat and the home forecast first, greets whoever looks, and keeps valves out of appliances', async () => {
    const hass = house([
      entity('climate.aa_idle_ac', 'off', { temperature: 24 }),
      entity('weather.met_service', 'sunny'),
      entity('weather.forecast_house', 'sunny'),
      entity('person.me', 'home', { user_id: 'u-1' }),
      entity('switch.sink_water_valve', 'on', { friendly_name: 'Sink water valve' }),
      entity('update.zigbee', 'on', {}, { entity_category: 'config' }),
    ]) as unknown as Record<string, unknown>;
    hass['user'] = { id: 'u-1', name: 'Me', is_admin: true };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const home = views[0]!.sections.flatMap((section) => section.cards);
    expect(home.find((c) => c.type === 'custom:fluvy-thermostat-card')?.['entity']).toBe(
      'climate.heat_pump',
    );
    expect(home.find((c) => c.type === 'custom:fluvy-weather-card')?.['entity']).not.toBe(
      'weather.met_service',
    ); // the home's forecast (home / forecast_home) before the national service
    // the greeting names no one: each person who opens the dashboard is greeted (a saved copy too)
    const hello = home.find((c) => c.type === 'custom:fluvy-hello-card');
    expect(hello).toBeDefined();
    expect(hello?.['person']).toBeUndefined();
    expect(home.some((c) => c['entity'] === 'switch.sink_water_valve')).toBe(false);
    const sensors = views
      .find((v) => v.path === 'sensors')!
      .sections.flatMap((section) => section.cards);
    expect(
      (
        sensors.find((c) => c.type === 'custom:fluvy-updates-card')?.['entities'] as string[]
      ).includes('update.zigbee'),
    ).toBe(true);
  });

  it('adds a Rooms view when the house has two rooms with something in them, and a subview per room', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      house(DEMO_ROOMS),
    );
    const rooms = views.find((view) => view.path === 'rooms');
    expect(rooms).toBeDefined();
    const cards = rooms!.sections.flatMap((section) => section.cards);
    const areas = cards
      .filter((card) => card.type === 'custom:fluvy-room-card')
      .map((card) => card['area']);
    expect(areas).toEqual(['kitchen', 'living_room', 'bedroom', 'garden']); // ground floor, upstairs, then the garden on no floor
    expect(
      cards
        .filter((card) => card.type === 'custom:fluvy-heading-card')
        .map((card) => card['title']),
    ).toEqual(['Ground floor', 'Upstairs', 'Rooms']);
    const subviews = views.filter((view) => view.subview);
    expect(subviews.map((view) => view.path)).toEqual(areas.map((area) => `room-${area}`));
    expect(subviews[0]?.back_path).toBe('/fluvy-home/rooms');
    // a subview is not a tab
    const tabs = views[0]!.sections[0]!.cards.find(
      (card) => card.type === 'custom:fluvy-chips-card',
    ) as unknown as { chips: { path: string }[] };
    expect(tabs.chips.some((chip) => chip.path.includes('room-'))).toBe(false);
    // a room's subview opens with the way back to every room, then what the room holds
    const living = subviews.find((view) => view.path === 'room-living_room')!;
    const livingCards = living.sections
      .flatMap((section) => section.cards)
      .filter(
        (card) =>
          card.type !== 'custom:fluvy-hello-card' && card.type !== 'custom:fluvy-chips-card',
      );
    expect(livingCards[0]).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'All rooms',
      path: '/fluvy-home/rooms',
    });
    expect(
      livingCards.some(
        (card) =>
          card.type === 'custom:fluvy-tile-card' && card['entity'] === 'light.living_room_lamp',
      ),
    ).toBe(true);
  });

  it('makes a room of what the room card draws: an area that names its hidden sensors, and the reading it names alone (#39)', async () => {
    const hass = house([
      ...DEMO_ROOMS,
      entity(
        'sensor.cellar_temperature',
        '14.2',
        { device_class: 'temperature', unit_of_measurement: '°C' },
        { area_id: 'cellar', hidden: true },
      ),
      entity(
        'sensor.loft_humidity',
        '61',
        { device_class: 'humidity', unit_of_measurement: '%' },
        { area_id: 'loft', entity_category: 'diagnostic' },
      ),
      entity('switch.attic_led', 'on', {}, { area_id: 'attic', entity_category: 'config' }),
    ]) as { areas: Record<string, unknown> };
    hass.areas['cellar'] = {
      area_id: 'cellar',
      name: 'Cellar',
      temperature_entity_id: 'sensor.cellar_temperature',
    };
    hass.areas['loft'] = {
      area_id: 'loft',
      name: 'Loft',
      humidity_entity_id: 'sensor.loft_humidity',
    };
    hass.areas['attic'] = { area_id: 'attic', name: 'Attic' };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const areas = views
      .find((view) => view.path === 'rooms')!
      .sections.flatMap((section) => section.cards)
      .filter((card) => card.type === 'custom:fluvy-room-card')
      .map((card) => card['area']);
    expect(areas).toContain('cellar');
    expect(areas).toContain('loft');
    expect(areas).not.toContain('attic');
    const loft = views
      .find((view) => view.path === 'room-loft')!
      .sections.flatMap((section) => section.cards)
      .find((card) => card.type === 'custom:fluvy-readouts-card');
    expect(loft?.['rows']).toEqual([{ entity: 'sensor.loft_humidity', name: 'Loft' }]);
  });

  it('puts the map beside the people once the house has a zone', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      house(DEMO_ROOMS),
    );
    const sensors = views.find((view) => view.path === 'sensors')!;
    const cards = sensors.sections.flatMap((section) => section.cards);
    expect(cards.some((card) => card.type === 'custom:fluvy-map-card')).toBe(true);
  });

  it('gives every view three columns, so the header never moves between tabs', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    for (const v of views) {
      expect(v.max_columns).toBe(3);
      expect(v.sections.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('tells lights from appliances by their words and gives plugs their readings', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const home = views[0]!.sections.flatMap((section) => section.cards); // wherever the columns cut
    const lights = home.find((c) => c.type === 'custom:fluvy-heading-card') as unknown as {
      entities: string[];
    };
    expect(lights.entities).toEqual([
      'light.living_room_lamp',
      'switch.kitchen_light',
      'switch.patio_light',
    ]);
    const washer = home.find((c) => c['entity'] === 'switch.washing_machine') as unknown as {
      readouts?: string[];
    };
    expect(washer.readouts).toEqual([
      'sensor.washing_machine_power',
      'sensor.washing_machine_energy_today',
    ]);
    expect(
      home.some(
        (c) => c['entity'] === 'switch.heat_pump_boost' || c['entity'] === 'switch.plug_beep',
      ),
    ).toBe(false);
  });

  it('groups the lights by area, dimmable ones as light cards', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const lights = views.find((v) => v.path === 'lights')!;
    const headings = lights.sections.flatMap((s) =>
      s.cards.filter((c) => c.type === 'custom:fluvy-heading-card').map((c) => c['title']),
    );
    expect(headings).toEqual(['Living room', 'Kitchen', 'Outdoor']);
    expect(
      lights.sections[0]!.cards.some(
        (c) => c.type === 'custom:fluvy-light-card' && c['entity'] === 'light.living_room_lamp',
      ),
    ).toBe(true);
  });

  it('pairs the tiles and closes an odd run with a compact tile across the column', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const columns = (card: { grid_options?: unknown }) =>
      (card.grid_options as { columns?: number } | undefined)?.columns;
    const runs: number[] = [];
    for (const cards of views.flatMap((v) => v.sections.map((s) => s.cards))) {
      let run = 0;
      for (const card of [...cards, {}]) {
        if (columns(card) === 6) run++;
        else {
          if (run) runs.push(run);
          run = 0;
        }
      }
    }
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.filter((n) => n % 2)).toEqual([]);
    const compact = views.flatMap((v) =>
      v.sections.flatMap((s) => s.cards.filter((c) => c['size'] === 'compact')),
    );
    expect(compact.length).toBeGreaterThan(0);
    expect(compact.every((c) => columns(c) === 12)).toBe(true);
  });

  it("leaves the weather service's sensors out of the climate view and pairs humidity with its temperature", async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const climate = views.find((v) => v.path === 'climate')!.sections.flatMap((s) => s.cards);
    expect(climate.some((c) => c['entity'] === 'sensor.met_temperature')).toBe(false);
    const humidity = climate.find((c) => c.type === 'custom:fluvy-humidity-card') as unknown as {
      temperature_entity?: string;
    };
    expect(humidity.temperature_entity).toBe('sensor.garden_temperature');
  });

  it("finds solar and grid power for the flow and the energy dashboard's devices", async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const energy = views.find((v) => v.path === 'energy')!.sections.flatMap((s) => s.cards);
    const flow = energy.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: { type: string; power: string }[];
    };
    expect(flow.sources.map((s) => [s.type, s.power])).toEqual([
      ['solar', 'sensor.solar_inverter_power'],
      ['grid', 'sensor.grid_meter_power'],
    ]);
    expect(
      energy.some(
        (c) =>
          c.type === 'custom:fluvy-production-card' &&
          c['entity'] === 'sensor.solar_inverter_daily_yield',
      ),
    ).toBe(true);
    const devices = energy.find(
      (c) => c.type === 'custom:fluvy-energy-devices-card',
    ) as unknown as { rows: { entity: string }[] };
    expect(devices.rows.map((r) => r.entity)).toEqual(['sensor.washing_machine_energy_today']);
  });

  it('reads an export meter as the grid’s second sensor, never as the grid', async () => {
    const hass = house([
      entity('sensor.grid_import_power', '1900', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid import power',
      }),
      entity('sensor.grid_export_power', '400', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid export power',
      }),
    ]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const flow = cards.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: Record<string, unknown>[];
    };
    // the ordinary house's own meter is named for the grid too: the one named for the export is never it
    expect(JSON.stringify(flow.sources)).not.toContain('"power":"sensor.grid_export_power"');
    expect(flow.sources).toContainEqual({
      type: 'grid',
      import: expect.any(String),
      export: 'sensor.grid_export_power',
    });
  });

  it('reads a grid named by its phases as one source summed per phase', async () => {
    const phase = (n: number, w: string) =>
      entity(`sensor.grid_power_l${n}`, w, {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: `Grid power L${n}`,
      });
    const hass = house([phase(1, '-400'), phase(2, '1000'), phase(3, '900')]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const flow = cards.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: Record<string, unknown>[];
    };
    expect(flow.sources).toContainEqual({
      type: 'grid',
      phases: ['sensor.grid_power_l1', 'sensor.grid_power_l2', 'sensor.grid_power_l3'],
    });
    expect(cards.find((c) => c.type === 'custom:fluvy-grid-card')).toMatchObject({
      phases: ['sensor.grid_power_l1', 'sensor.grid_power_l2', 'sensor.grid_power_l3'],
    });
  });

  it("draws the distribution of the energy dashboard's devices from the power sensor beside each statistic", async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const energy = views.find((v) => v.path === 'energy')!.sections.flatMap((s) => s.cards);
    const distribution = energy.find(
      (c) => c.type === 'custom:fluvy-distribution-card',
    ) as unknown as { entities: string[] } | undefined;
    expect(distribution?.entities).toEqual([
      'sensor.washing_machine_power',
      'sensor.heat_pump_power',
    ]);
  });

  it('splits batteries into devices and phones, and keeps connectivity sensors out of openings', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const sensors = views.find((v) => v.path === 'sensors')!.sections.flatMap((s) => s.cards);
    const bars = sensors.filter((c) => c.type === 'custom:fluvy-bars-card') as unknown as {
      title: string;
      rows: { entity: string }[];
    }[];
    expect(bars.map((b) => [b.title, b.rows.map((r) => r.entity)])).toEqual([
      ['Batteries', ['sensor.garden_battery']],
      ['Phones', ['sensor.phone_battery_level']],
    ]);
    const openings = sensors.find((c) => c.type === 'custom:fluvy-openings-card') as unknown as {
      entities: string[];
    };
    expect(openings.entities).toEqual(['binary_sensor.kitchen_leak']);
  });

  it("speaks the dashboard's language and leaves out hidden views", async () => {
    const hass = house() as unknown as { language: string };
    hass.language = 'es';
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', hide: ['energy', 'media'] },
      hass as never,
    );
    expect(views.filter((v) => !v.subview).map((v) => v.title)).toEqual([
      'Inicio',
      'Habitaciones',
      'Luces',
      'Clima',
      'Sensores',
    ]);
  });
});

describe('custom:fluvy-home strategy — the appliances, as the reporter of #47 drew them', () => {
  const band = (views: readonly { path: string; sections: readonly Section[] }[], path: string) =>
    views.find((view) => view.path === path)!.sections.filter((section) => section.column_span);
  type Section = { column_span?: number; cards: Record<string, unknown>[] };

  it('lays them across Home under its columns: the large ones as whole cards, then the small ones as rows', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(),
    );
    const home = views[0]!;
    // the columns first (the greeting in the first), then the band across them
    expect(home.sections.slice(0, 3).every((section) => !section.column_span)).toBe(true);
    const [across, ...more] = band(views, 'home');
    expect(more).toEqual([]);
    expect(across?.column_span).toBe(3);
    const [large, largeCards, small, smallCards] = across!.cards;
    expect(large).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Large appliances',
      icon: 'fluvy:dishwasher',
      subtitle: 'All appliances',
      path: '/fluvy-home/appliances',
    });
    // what keeps food cold, what cleans, what cooks, the coffee — the reporter's order
    expect(largeCards).toMatchObject({
      type: 'custom:fluvy-appliances-card',
      variant: 'cards',
      grid_options: { columns: 'full' },
    });
    expect((largeCards!['appliances'] as { kind: string }[]).map((item) => item.kind)).toEqual([
      'fridge',
      'dishwasher',
      'washer',
      'washer',
      'dryer',
      'oven',
      'hob',
      'coffee',
    ]);
    expect(small).toMatchObject({ title: 'Small appliances', subtitle: 'Show all' });
    expect(smallCards!['appliances']).toEqual([{ device: 'tuya-kettle', kind: 'kettle' }]);
  });

  it('takes the appliances out of the plug tiles and the room readings, never out of the energy views', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(),
    );
    const cards = (path: string, of = views) =>
      of.find((view) => view.path === path)!.sections.flatMap((section) => section.cards);
    // the washer on its plug is an appliance card now, not a tile; the demo's own plug stays a tile
    const tiles = cards('home').filter((card) => card.type === 'custom:fluvy-tile-card');
    expect(tiles.some((card) => card['entity'] === 'switch.waschmaschine_keller')).toBe(false);
    expect(tiles.some((card) => card['entity'] === 'switch.washing_machine')).toBe(true);
    // an oven's or a fridge's temperature is not a room's
    expect(JSON.stringify(cards('climate'))).not.toMatch(/backofen|kuhlschrank|fridge/);
    // without devices in the energy dashboard, its consumption reads every plug's power as it did: the appliance's too
    const unlisted = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(demoHass({ consumption: [] }) as never),
    );
    expect(
      cards('energy', unlisted.views).find(
        (card) => card.type === 'custom:fluvy-distribution-card',
      )?.['entities'],
    ).toEqual(['sensor.waschmaschine_keller_leistung', 'sensor.washing_machine_power']);
  });

  it('opens every appliance on a subview of its own, back to Home, never a tab', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      withAppliances(),
    );
    const all = views.find((view) => view.path === 'appliances')!;
    expect(all).toMatchObject({ subview: true, back_path: '/fluvy-home/home', max_columns: 3 });
    // the greeting keeps the first column; the bands lead nowhere further, every appliance in them
    expect(all.sections[0]!.cards[0]!.type).toBe('custom:fluvy-hello-card');
    const [across] = band(views, 'appliances');
    expect(across!.cards.filter((card) => card['path'])).toEqual([]);
    expect((across!.cards[1]!['appliances'] as unknown[]).length).toBe(8);
    const tabs = views[0]!.sections[0]!.cards.find(
      (card) => card.type === 'custom:fluvy-chips-card',
    ) as unknown as { chips: { path: string }[] };
    expect(tabs.chips.some((chip) => chip.path.endsWith('/appliances'))).toBe(false);
    // golden file: Home and the subview of a house with appliances (a change here is a change of the dashboard)
    const plain = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, withAppliances());
    expect(
      plain.views.filter((view) => view.path === 'home' || view.path === 'appliances'),
    ).toMatchSnapshot();
  });

  it('shows Home two rows of four large ones and a row of five small ones; the rest on the subview', async () => {
    const extra = Array.from({ length: 6 }, (_, i) => {
      const id = `plug-${i}`;
      return [
        id,
        {
          id,
          name: `Toaster ${i + 1}`,
          name_by_user: null,
          area_id: null,
          model: null,
          manufacturer: null,
          via_device_id: null,
        },
      ] as const;
    });
    const hass = withAppliances() as unknown as HomeAssistant;
    for (const [id, device] of extra) {
      (hass.devices as Record<string, unknown>)[id] = device;
      const slug = id.replace('-', '_');
      hass.entities[`switch.${slug}`] = {
        entity_id: `switch.${slug}`,
        device_id: id,
        platform: 'shelly',
      };
      hass.entities[`sensor.${slug}_power`] = {
        entity_id: `sensor.${slug}_power`,
        device_id: id,
        platform: 'shelly',
      };
      hass.states[`switch.${slug}`] = {
        entity_id: `switch.${slug}`,
        state: 'off',
        attributes: {},
        last_changed: '',
        last_updated: '',
      };
      hass.states[`sensor.${slug}_power`] = {
        entity_id: `sensor.${slug}_power`,
        state: '0',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
        last_changed: '',
        last_updated: '',
      };
    }
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const count = (path: string, index: number) =>
      (band(views, path)[0]!.cards[index]!['appliances'] as unknown[]).length;
    expect([count('home', 1), count('home', 3)]).toEqual([8, 5]);
    expect([count('appliances', 1), count('appliances', 3)]).toEqual([8, 7]);
  });

  it('gives a room its own appliances across under what it holds', async () => {
    const hass = withAppliances(
      demoHass({ more: DEMO_ROOMS }) as never,
    ) as unknown as HomeAssistant;
    (hass.devices['hc-dish'] as { area_id: string | null }).area_id = 'kitchen';
    hass.entities['sensor.wasserkocher_status'] = {
      ...hass.entities['sensor.wasserkocher_status']!,
      area_id: 'kitchen',
    };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const kitchen = band(views, 'room-kitchen');
    expect(kitchen).toHaveLength(1);
    // in the room the bands name what they hold and lead nowhere: every appliance of the room is in them
    expect(kitchen[0]!.cards.map((card) => [card['title'], card['path']])).toEqual([
      ['Large appliances', undefined],
      [undefined, undefined],
      ['Small appliances', undefined],
      [undefined, undefined],
    ]);
    expect(band(views, 'room-living_room')).toEqual([]);
  });

  it('leaves a house without appliances as it was: no band, no subview', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    expect(views.some((view) => view.sections.some((section) => section.column_span))).toBe(false);
    expect(views.some((view) => view.path === 'appliances')).toBe(false);
  });
});
