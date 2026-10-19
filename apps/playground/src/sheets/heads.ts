import type { LovelaceCardConfig } from '@fluvy/core';
import type { FrameSpec, SheetSpec } from '../scenes.js';
import { sheet as ambient } from './ambient.js';
import { sheet as automations } from './automations.js';
import { sheet as climate } from './climate.js';
import { sheet as motion } from './devices-motion.js';
import { sheet as security } from './devices-security.js';
import { sheet as lights } from './lights.js';
import { sheet as media } from './media.js';
import { sheet as slider } from './slider.js';
import { sheet as solar } from './solar.js';

/**
 * The head is the card's button (#42): one card of each family whose head is fitted — a name too long for its column
 * beside a switch, a badge or a round — each with a tap and a hold that say where they went (`/t/<card>`,
 * `/h/<card>`), in half a section (the reporter's two lamps on a phone's line: 152 or 172 a card) and as a full card
 * (from the 211 floor). The circle gives way to the name; the tap never does. The suite `interactions-heads.mjs` taps,
 * holds, drags and keys each of them; `interactions-actions.mjs` holds the defaults.
 */

/** A card of another sheet's frame, as that sheet draws it. */
function from(source: SheetSpec, title: string, index = 0): LovelaceCardConfig {
  const frame = source.frames.find((f) => f.title === title);
  const card = frame?.cards[index];
  if (!card) throw new Error(`heads: no card ${index} in "${title}"`);
  // its own columns stay its frame's: this sheet gives each card its own
  return Object.fromEntries(
    Object.entries(card).filter(([key]) => key !== 'cols'),
  ) as LovelaceCardConfig;
}

/** Each family's card under a long name, its tap and its hold going to a path of its own. */
const CARDS: ReadonlyArray<readonly [key: string, config: LovelaceCardConfig]> = [
  ['light', { ...from(slider, 'On'), name: 'Living room ceiling' }],
  [
    'fan',
    {
      type: 'custom:fluvy-fan-card',
      entity: 'fan.ceiling',
      variant: 'compact',
      name: 'Bedroom ceiling fan',
    },
  ],
  ['thermostat', { ...from(climate, 'Heat'), variant: 'compact', name: 'Living room heating' }],
  [
    'lock',
    {
      type: 'custom:fluvy-lock-card',
      entity: 'lock.front_door',
      variant: 'compact',
      name: 'Front door deadbolt',
    },
  ],
  ['sensor', { ...from(ambient, 'Sensors', 2), name: 'Living room climate' }],
  [
    'gauge',
    {
      type: 'custom:fluvy-gauge-card',
      entity: 'sensor.so_solar_power',
      max_entity: 'sensor.so_solar_capacity',
      name: 'Solar inverter output',
    },
  ],
  ['production', { ...from(solar, 'Production'), name: 'Rooftop solar today' }],
  ['openings', { ...from(ambient, 'Openings · each its own name'), title: 'Doors and windows' }],
  ['people', { ...from(ambient, 'Who is home'), title: 'Who is at home now' }],
  ['lights', { ...from(lights, 'Chips'), name: 'Living room lamps' }],
  ['automations', { ...from(automations, 'Rows'), title: 'Morning routines' }],
  ['weather', { ...from(ambient, 'Weather · compact'), name: 'Weather at home' }],
  ['media', { ...from(media, 'Playing'), name: 'Kitchen speaker' }],
  ['mini', { ...from(media, 'Mini'), name: 'Kitchen speaker' }],
  ['greeting', { type: 'custom:fluvy-hello-card', name: 'Marta', show_avatar: false }],
];

const acted = (key: string, config: LovelaceCardConfig): LovelaceCardConfig => ({
  ...config,
  tap_action: { action: 'navigate', navigation_path: `/t/${key}` },
  hold_action: { action: 'navigate', navigation_path: `/h/${key}` },
});

/** The cards drawn for half a section (the reporter's two lamps on a line): the others are full cards. */
const HALF = new Set(['light', 'fan', 'lock', 'weather', 'mini']);

const frames: FrameSpec[] = [
  // half a section: two cards on a line, 152 a card in a 320 section, 172 in a 360 one
  {
    title: 'Half a section',
    cards: CARDS.filter(([key]) => HALF.has(key)).map(([key, config]) => ({
      ...acted(key, config),
      cols: 6,
    })),
  },
  // a full card: from the 211 floor up
  { title: 'A full card', cards: CARDS.map(([key, config]) => acted(key, config)) },
  // the reporter's lamps asking for their circle (`show_icon: always`): the name keeps its floor beside the switch —
  // the smaller circle first, then none — and never vanishes
  {
    title: 'show_icon: always · half a section',
    cards: CARDS.filter(([key]) => key === 'light' || key === 'fan').map(([key, config]) => ({
      ...acted(key, config),
      show_icon: 'always',
      cols: 6,
    })),
  },
];

export const sheet: SheetSpec = {
  states: [
    ...slider.states,
    ...climate.states,
    ...motion.states,
    ...security.states,
    ...solar.states,
    ...ambient.states,
    ...lights.states,
    ...automations.states,
    ...media.states,
  ],
  registry: {
    entities: {
      ...security.registry?.entities,
      ...ambient.registry?.entities,
      ...lights.registry?.entities,
      ...automations.registry?.entities,
    },
    devices: {
      ...security.registry?.devices,
      ...ambient.registry?.devices,
      ...lights.registry?.devices,
      ...automations.registry?.devices,
    },
    areas: {
      ...security.registry?.areas,
      ...ambient.registry?.areas,
      ...lights.registry?.areas,
      ...automations.registry?.areas,
    },
    floors: { ...security.registry?.floors, ...ambient.registry?.floors },
  },
  history: { ...solar.history, ...ambient.history },
  ws: { ...solar.ws, ...ambient.ws },
  ...(automations.api ? { api: automations.api } : {}),
  frames,
};
