import {
  applianceTile,
  balanced,
  deviceRow,
  energyFlow,
  entityRow,
  flowed,
  full,
  hasSources,
  headed,
  heading,
  sizedTile,
  thermostat,
  tileRows,
  when,
} from '../layout.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';
import { LIGHT_WORDS, OUTDOOR, TODAY, type HomeRegistry } from '../home-registry.js';
import { roomsOf, roomsView } from '../rooms.js';
import { liveCards, metersCards, todayCards } from './energy.js';

/*
 * The views of the home dashboard (`custom:fluvy-home`), in the layout of the approved `/fluvy-home`: each one is
 * a small builder from the house (`HomeRegistry`) to sections of fluvy cards. Every list is capped so a big house
 * still reads. The other templates borrow these builders.
 */

export function homeView(ctx: StrategyContext): Section[] {
  const { home, t, base, weather, energy } = ctx;
  const { lights, appliances, climate, temperatures } = home;
  const secured = [...home.domain('lock'), ...home.openings];
  // the controls, the climate and the day, the energy and the house's state, in reading order; the
  // single-purpose cards fill the columns' feet
  return flowed(
    ctx.header,
    [
      ...when(lights.length, () =>
        headed(
          heading(t('strategy.lights'), 'fluvy:bulb', lights, `${base}/lights`),
          tileRows(lights.slice(0, 6).map((id) => sizedTile(id, home.named(id), ctx.style))),
        ),
      ),
      ...when(appliances.length, () =>
        headed(
          heading(t('strategy.appliances'), 'fluvy:plug', appliances),
          tileRows(appliances.slice(0, 4).map((id) => applianceTile(home, id))),
        ),
      ),
      when(home.covers.length, () => [
        heading(t('strategy.covers'), 'fluvy:blinds', home.covers),
        full('tiles', {
          size: 'compact',
          columns: 2,
          tiles: home.covers.slice(0, 6).map((id) => ({ entity: id, ...home.named(id) })),
        }),
      ]),
      when(climate[0], (id) => [thermostat(id, ctx.style)]),
      when(temperatures.length, () => [
        {
          type: 'custom:fluvy-readouts-card',
          rows: temperatures.slice(0, 3).map((id) => ({ entity: id, name: home.placeName(id) })),
        },
      ]),
      ...(weather
        ? [[full('weather', { entity: weather })], [full('clock', { variant: 'digital', weather })]]
        : [[full('clock', { variant: 'digital' })]]),
      when(hasSources(energy), () => [energyFlow(energy, ctx.style)]),
      energy.solarPower
        ? [full('energy', { entity: energy.solarPower, title: t('energy.solar') })]
        : energy.homePower
          ? [full('energy', { entity: energy.homePower })]
          : [],
      when(secured.length, () => [
        full('entities', {
          title: t('strategy.security'),
          rows: secured.slice(0, 5).map((id) => entityRow(home, id)),
        }),
      ]),
    ],
    [
      ...when(home.first('media_player'), (id) => [
        full('media', { entity: id, variant: 'mini', ...home.named(id) }),
      ]),
      ...when(home.first('vacuum'), (id) => [full('vacuum', { entity: id, ...home.named(id) })]),
      // every printer, compact: an overview's card (the camera and the buttons are a tap away, on the device)
      ...home.printers.map((device) => full('printer', { device, variant: 'compact' })),
      ...when(home.first('todo'), (id) => [full('todo', { entity: id })]),
      // the house's first scene, one tap away
      ...when(home.scenes[0], (id) => [full('scene', { entity: id, ...home.named(id) })]),
    ],
  );
}

/** By area when areas are assigned, else indoor / outdoor; the biggest group first; light automations as scenes last. */
export function lightsView(ctx: StrategyContext): Section[] {
  const { home, t } = ctx;
  const groups = new Map<string, string[]>();
  for (const id of home.lights) {
    const key =
      home.areaName(home.areaOf(id)) ??
      (home.outdoor(id) ? t('strategy.outdoor') : t('strategy.indoor'));
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  // a room of two lights or more starts with all of them on one card (the room in one tap, a round a light); a
  // dimmable light is a full card (a row of its own); the switches after it are tiles, two a row
  const blocks = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .flatMap(([name, ids]) =>
      headed(heading(name, OUTDOOR.test(name) ? 'fluvy:moon' : 'fluvy:bulb', ids), [
        ...(ids.length > 1 ? [[full('lights', { lights: ids })]] : []),
        ...ids
          .filter((id) => home.dimmable(id))
          .map((id) => [full('light', { entity: id, ...home.named(id) })]),
        ...tileRows(
          ids
            .filter((id) => !home.dimmable(id))
            .map((id) => sizedTile(id, home.named(id), ctx.style)),
        ),
      ]),
    );
  const scenes = [...home.scenes, ...home.automations.filter((id) => LIGHT_WORDS.test(id))].slice(
    0,
    6,
  );
  if (scenes.length) blocks.push([full('scenes', { title: t('strategy.automations'), scenes })]);
  return flowed(ctx.header, blocks);
}

/** Thermostats first, then the forecast, humidity and temperatures, shared out so the three columns end level. */
export function climateView(ctx: StrategyContext): Section[] {
  const { home } = ctx;
  return balanced(ctx.header, [
    ...home.climate.slice(0, 4).map((id) => thermostat(id, ctx.style)),
    ...home.fans.slice(0, 2).map((id) => full('fan', { entity: id, ...home.named(id) })),
    ...home.weather.slice(0, 1).map((id) => full('weather', { entity: id })),
    ...home.humidities.slice(0, 3).map((id) => {
      const temperature = home.temperatureBeside(id);
      return full('humidity', {
        entity: id,
        name: home.placeName(id),
        ...(temperature ? { temperature_entity: temperature } : {}),
      });
    }),
    ...home.temperatures
      .slice(0, 4)
      .map((id) => full('sensor', { entity: id, name: home.placeName(id) })),
  ]);
}

/**
 * The house's energy, shared out over three level columns: the live cards first (the flow, the balance, the day by
 * source, the grid, the batteries, the charger), then the day's totals, what the sun makes, what the house draws,
 * and water and gas.
 */
export function energyView(ctx: StrategyContext): Section[] {
  const { home, t, energy } = ctx;
  const { solarPower, gridPower, solarToday, consumption, consumptionPowers } = energy;
  return balanced(ctx.header, [
    ...liveCards(ctx),
    ...(energy.prefsMeters
      ? []
      : solarPower
        ? [full('energy', { entity: solarPower, title: t('energy.solar') })]
        : gridPower
          ? [full('energy', { entity: gridPower, title: t('energy.grid') })]
          : []),
    ...todayCards(ctx),
    ...when(
      home.energies.filter((id) => TODAY.test(home.label(id))),
      (todays) =>
        todays.length >= 2
          ? [full('stat-tiles', { title: t('strategy.today'), tiles: todays.slice(0, 4) })]
          : [],
    ),
    ...when(solarPower, (id) => [full('gauge', { entity: id })]),
    ...when(solarToday, (id) => [full('production', { entity: id })]),
    ...when(solarToday, (id) => [full('history-bars', { entity: id, color: 'amber' })]),
    ...when(consumptionPowers.length >= 2, () => [
      full('distribution', {
        title: t('strategy.consumption'),
        entities: consumptionPowers.slice(0, 8),
        ...(energy.homePower ? { total: energy.homePower } : {}),
      }),
    ]),
    ...when(consumption.length, () => [
      full('energy-devices', {
        title: t('strategy.appliances'),
        rows: consumption.slice(0, 8).map((id) => deviceRow(home, id)),
      }),
    ]),
    ...metersCards(ctx),
  ]);
}

/** Whether the house has a security view: an alarm, a lock, a camera or a way in (the openings then move there). */
export const secured = (home: HomeRegistry): boolean =>
  Boolean(home.alarms.length || home.locks.length || home.cameras.length || home.gateways.length);

/** The alarm first, then what opens (locks, garage doors and gates), what is open, and the cameras. */
export function securityView(ctx: StrategyContext): Section[] {
  const { home, t } = ctx;
  return balanced(ctx.header, [
    ...home.alarms.slice(0, 2).map((id) => full('alarm', { entity: id, ...home.named(id) })),
    ...home.locks.slice(0, 4).map((id) => full('lock', { entity: id, ...home.named(id) })),
    ...home.gateways.slice(0, 2).map((id) => full('cover', { entity: id, ...home.named(id) })),
    ...when(home.openings.length, () => [
      full('openings', { title: t('strategy.sensors'), entities: home.openings.slice(0, 8) }),
    ]),
    ...home.cameras.slice(0, 4).map((id) => full('camera', { entity: id })),
  ]);
}

/** What plays now (only while something does), then every other player of the house. */
export function mediaView(ctx: StrategyContext): Section[] {
  const { home } = ctx;
  const players = home.players.slice(0, 6);
  const playing =
    players.find((id) => home.state(id) === 'playing') ??
    players.find((id) => home.state(id) === 'paused');
  return balanced(ctx.header, [
    ...when(playing, (id) => [full('now-playing', { entity: id, ...home.named(id) })]),
    ...players
      .filter((id) => id !== playing)
      .map((id) => full('media', { entity: id, ...home.named(id) })),
  ]);
}

/** The calendars, the lists, the timers and what a person runs by hand. */
export function agendaView(ctx: StrategyContext): Section[] {
  const { home, t } = ctx;
  return balanced(ctx.header, [
    ...when(home.calendars.length, () => [
      full('calendar', { entities: home.calendars.slice(0, 3), view: 'month-day' }),
    ]),
    ...home.lists.slice(0, 3).map((id) => full('todo', { entity: id })),
    ...home.timers.slice(0, 3).map((id) => full('timer', { entity: id, ...home.named(id) })),
    ...when(home.runnables.length, () => [
      full('actions', { title: t('strategy.actions'), entities: home.runnables.slice(0, 6) }),
    ]),
  ]);
}

export function sensorsView(ctx: StrategyContext): Section[] {
  const { home, t } = ctx;
  const zones = home.zones.filter((id) => id !== 'zone.home');
  const { batteries, phones, openings, plants, helpers, people, updates } = home;
  // what runs on batteries, who is home, what is open, then the helpers and the updates
  return flowed(ctx.header, [
    when(batteries.length, () => [
      full('bars', {
        title: t('strategy.batteries'),
        rows: batteries.slice(0, 8).map((id) => deviceRow(home, id)),
      }),
    ]),
    when(phones.length, () => [
      full('bars', {
        title: t('strategy.phones'),
        rows: phones.slice(0, 8).map((id) => deviceRow(home, id)),
      }),
    ]),
    when(people.length, () => [
      full('people', { title: t('strategy.people'), entities: [...people] }),
      ...(zones.length && home.people.length
        ? [
            {
              type: 'custom:fluvy-map-card',
              entities: [...home.people],
              variant: 'zones',
              grid_options: { columns: 12 },
            } as Card,
          ]
        : []),
    ]),
    // with a security view the openings live there
    when(!secured(home) && openings.length, () => [
      full('openings', { title: t('strategy.sensors'), entities: openings.slice(0, 8) }),
    ]),
    when(plants.length, () => [
      full('bars', { title: t('strategy.plants'), rows: plants.slice(0, 4) }),
    ]),
    when(helpers.length, () => [
      full('helpers', { title: t('strategy.helpers'), entities: helpers.slice(0, 6) }),
    ]),
    when(updates.length, () => [
      full('updates', { title: t('strategy.updates'), entities: updates.slice(0, 8) }),
    ]),
    when(home.first('camera'), (id) => [full('camera', { entity: id })]),
  ]);
}

/** The home dashboard's views in tab order. Home is always there; the others only when the house has what they show. */
export const HOME_VIEWS: readonly ViewSpec[] = [
  { key: 'home', icon: 'fluvy:home', title: 'strategy.home', build: homeView, when: () => true },
  {
    key: 'rooms',
    icon: 'fluvy:door',
    title: 'strategy.rooms',
    build: roomsView,
    // one room is the home view; the rooms need two to be a view
    when: ({ home }) => roomsOf(home).length >= 2,
  },
  {
    key: 'lights',
    icon: 'fluvy:bulb',
    title: 'strategy.lights',
    build: lightsView,
    when: ({ home }) => home.lights.length > 0,
  },
  {
    key: 'climate',
    icon: 'fluvy:thermo',
    title: 'strategy.climate',
    build: climateView,
    when: ({ home, weather }) =>
      Boolean(home.climate.length || home.temperatures.length || weather),
  },
  {
    key: 'energy',
    icon: 'fluvy:bolt',
    title: 'strategy.energy',
    build: energyView,
    when: ({ energy }) => energy.any,
  },
  {
    key: 'security',
    icon: 'fluvy:shield',
    title: 'strategy.security',
    build: securityView,
    when: ({ home }) => secured(home),
  },
  {
    key: 'media',
    icon: 'fluvy:speaker',
    title: 'strategy.media',
    build: mediaView,
    when: ({ home }) => home.players.length > 0,
  },
  {
    key: 'agenda',
    icon: 'fluvy:calendar',
    title: 'strategy.agenda',
    build: agendaView,
    // one to-do list already lives on the home view
    when: ({ home }) =>
      Boolean(
        home.calendars.length ||
        home.timers.length ||
        home.runnables.length ||
        home.lists.length > 1,
      ),
  },
  { key: 'sensors', icon: 'fluvy:signal', title: 'strategy.sensors', build: sensorsView },
];
