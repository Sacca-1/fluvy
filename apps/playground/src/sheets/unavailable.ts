import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import type { StateSeed } from '../hass.js';
import { outOfReachView } from '../out-of-reach.js';
import { mergeWs, type FrameSpec, type SheetSpec } from '../scenes.js';
import { sheet as actions } from './actions.js';
import { sheet as ambient } from './ambient.js';
import { sheet as automations } from './automations.js';
import { sheet as calendar } from './calendar.js';
import { sheet as climate } from './climate.js';
import { sheet as clocks } from './clocks.js';
import { sheet as motion } from './devices-motion.js';
import { sheet as security } from './devices-security.js';
import { sheet as historyBars } from './history-bars.js';
import { sheet as inputs } from './inputs.js';
import { sheet as lights } from './lights.js';
import { sheet as media } from './media.js';
import { sheet as printer } from './printer.js';
import { sheet as rooms } from './rooms.js';
import { sheet as slider } from './slider.js';
import { sheet as solar } from './solar.js';

/**
 * An unavailable card keeps its configured size (the owner's rule, 1.9): only its colours change; its anatomy — the
 * circle, the name, the state line, the readouts' slots with "—", its controls disabled — stays where it was. First the
 * owner's case: four large tiles side by side, the 3D printer's gone (it collapsed to a short row beside its live
 * neighbours). Then a family at a time, its cards live and, in the frame after, the same cards with every entity they
 * read out of reach as Home Assistant writes it (`out-of-reach.ts`). The appliances' pair is in their own sheet ("Live ·
 * its twin out of reach next", "Out of reach"). The suite `interactions-unavailable.mjs` holds every card of the
 * catalogue to it, in every variant, unavailable, unknown and missing.
 */

/** The sheets the families' cards come from: their house is this sheet's. */
const SOURCES: readonly SheetSpec[] = [
  actions,
  slider,
  lights,
  climate,
  solar,
  motion,
  security,
  ambient,
  calendar,
  clocks,
  media,
  historyBars,
  printer,
  automations,
  inputs,
  rooms,
];

/** A card of another sheet's frame, as that sheet draws it (its columns are this sheet's to give). */
function from(source: SheetSpec, title: string, index = 0): LovelaceCardConfig {
  const card = source.frames.find((f) => f.title === title)?.cards[index];
  if (!card) throw new Error(`unavailable: no card ${index} in "${title}"`);
  return Object.fromEntries(
    Object.entries(card).filter(([key]) => key !== 'cols'),
  ) as LovelaceCardConfig;
}

/** Their states, the first sheet's where two say one entity (the thermostat's, not the automations' climate). */
const states = new Map<string, StateSeed>();
for (const source of SOURCES)
  for (const seed of source.states) if (!states.has(seed[0])) states.set(seed[0], seed);
const registry = {
  entities: Object.assign({}, ...SOURCES.map((s) => s.registry?.entities)) as NonNullable<
    HomeAssistant['entities']
  >,
  devices: Object.assign({}, ...SOURCES.map((s) => s.registry?.devices)) as NonNullable<
    HomeAssistant['devices']
  >,
  areas: Object.assign({}, ...SOURCES.map((s) => s.registry?.areas)) as NonNullable<
    HomeAssistant['areas']
  >,
  floors: Object.assign({}, ...SOURCES.map((s) => s.registry?.floors)) as NonNullable<
    HomeAssistant['floors']
  >,
};

/** Every entity a config names (an id, its rows', its readouts'), as the house has it. */
const named = (value: unknown): string[] =>
  typeof value === 'string'
    ? states.has(value)
      ? [value]
      : []
    : Array.isArray(value)
      ? value.flatMap(named)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(named)
        : [];
/** Every entity of a device. */
const ofDevice = (device: string): string[] =>
  Object.values(registry.entities)
    .filter((entry) => entry.device_id === device)
    .map((entry) => entry.entity_id);
/** Every entity of an area: its own, and its devices'. */
const inArea = (area: string): string[] =>
  Object.values(registry.entities)
    .filter(
      (entry) =>
        entry.area_id === area ||
        (!entry.area_id && entry.device_id && registry.devices[entry.device_id]?.area_id === area),
    )
    .map((entry) => entry.entity_id);

/** A family's cards live, then the same cards with every entity they read out of reach (and `also`'s). */
function pair(
  title: string,
  cards: ReadonlyArray<LovelaceCardConfig & { cols?: number }>,
  also: readonly string[] = [],
): FrameSpec[] {
  const ids = [...new Set([...cards.flatMap(named), ...also])];
  return [
    { title, cards },
    { title: `${title} · out of reach`, cards, hass: outOfReachView(ids) },
  ];
}

/** The owner's four appliances on their plugs, each a large tile with its power and energy; the printer's gone. */
const APPLIANCES = (['washer', 'dryer', 'dishwasher', 'printer'] as const).map((name) => ({
  entity: `switch.ac_${name}`,
  readouts: [`sensor.ac_${name}_power`, `sensor.ac_${name}_energy`],
}));

const frames: FrameSpec[] = [
  // the owner's case: four large tiles, the 3D printer out of reach keeps the size of its neighbours
  {
    title: 'Four large tiles · the printer out of reach',
    cards: [{ type: 'custom:fluvy-tiles-card', size: 'large', tiles: APPLIANCES }],
  },
  {
    title: 'Four large tile cards · the printer out of reach',
    cards: APPLIANCES.map((tile) => ({ type: 'custom:fluvy-tile-card', ...tile, cols: 6 })),
  },
  ...pair('Lights', [from(slider, 'On'), from(lights, 'A desktop column', 1)]),
  ...pair('Climate', [from(climate, 'Heat')]),
  ...pair('Covers and fans', [from(motion, 'Blinds'), from(motion, 'Ceiling fan')]),
  ...pair('Locks, alarms and cameras', [
    from(security, 'Lock'),
    from(security, 'Alarm'),
    from(security, 'Camera'),
  ]),
  ...pair('Sensors', [
    from(ambient, 'Sensors · two on one chart'),
    {
      type: 'custom:fluvy-gauge-card',
      entity: 'sensor.so_solar_power',
      max_entity: 'sensor.so_solar_capacity',
    },
  ]),
  ...pair('Weather, calendars and clocks', [
    from(ambient, 'Weather'),
    from(calendar, 'Month'),
    { ...from(clocks, 'A1 hero'), weather: 'weather.home' },
  ]),
  ...pair('Media', [
    from(media, 'Playing'),
    { type: 'custom:fluvy-now-playing-card', entity: 'media_player.kitchen' },
  ]),
  ...pair('Energy', [from(solar, 'Production'), from(historyBars, '30 days')]),
  ...pair('3D printer', [from(printer, 'Bambu Lab · printing')], ofDevice('d-p1s')),
  ...pair('Automations', [from(automations, 'Rows')]),
  ...pair('Helpers, timers and lists', [
    from(inputs, 'Helpers'),
    from(inputs, 'Timer'),
    from(inputs, 'Groceries'),
  ]),
  ...pair(
    'People and rooms',
    [from(ambient, 'Who is home'), from(rooms, 'Room · photo')],
    inArea('rm_living'),
  ),
];

export const sheet: SheetSpec = {
  states: [...states.values()],
  registry,
  history: Object.assign({}, ...SOURCES.map((s) => s.history)) as NonNullable<SheetSpec['history']>,
  statistics: Object.assign({}, ...SOURCES.map((s) => s.statistics)) as NonNullable<
    SheetSpec['statistics']
  >,
  issues: SOURCES.flatMap((s) => s.issues ?? []),
  data: {
    user: Object.assign({}, ...SOURCES.map((s) => s.data?.user)) as Record<string, unknown>,
    system: Object.assign({}, ...SOURCES.map((s) => s.data?.system)) as Record<string, unknown>,
  },
  ws: mergeWs(SOURCES.map((s) => s.ws)),
  api: (method, path, body) => {
    for (const source of SOURCES) {
      const answer = source.api?.(method, path, body);
      if (answer !== undefined) return answer;
    }
    return undefined;
  },
  frames,
};
