import type { LovelaceCardConfig } from '@fluvy/core';
import type { SheetSpec } from '../scenes.js';
import { sheet as climate } from './climate.js';
import { sheet as motion } from './devices-motion.js';
import { sheet as security } from './devices-security.js';
import { sheet as rooms } from './rooms.js';
import { sheet as slider } from './slider.js';
import { sheet as solar } from './solar.js';

/** Three cards on a line: four columns each. */
const thirds = (cards: readonly LovelaceCardConfig[]): SheetSpec['frames'][number]['cards'] =>
  cards.map((card) => ({ ...card, cols: 4 }));

/**
 * Narrow columns, as Home Assistant lays them out and not as the design does: the cards that take half a section by
 * default, given a third of one (four columns) — what their `min_columns` allowed until 1.9, which raised it to six
 * (Home Assistant holds a card to its own minimum, and so does the playground: these frames draw at six, as a stored
 * four-column card does) — and half-section cards at Home Assistant's own 8 px gap, where a 320 section gives 156 a
 * card; and a half-section frame a suite of its own sheet would trip on. Not on the demo (no family names it): a
 * third of a section is a layout these cards are not drawn for.
 */
export const sheet: SheetSpec = {
  states: [
    ...climate.states,
    ...slider.states,
    ...motion.states,
    ...security.states,
    ...solar.states,
    ...rooms.states,
  ],
  registry: {
    entities: { ...security.registry?.entities, ...rooms.registry?.entities },
    devices: { ...security.registry?.devices, ...rooms.registry?.devices },
    areas: { ...security.registry?.areas, ...rooms.registry?.areas },
    floors: { ...security.registry?.floors, ...rooms.registry?.floors },
  },
  history: { ...solar.history },
  ws: { ...solar.ws },
  frames: [
    // the compact lock at its own size: the zoom suite (interactions-zoom.mjs, which walks devices-security) finds its
    // sub cut at 150 % here — still 5 px after 1.9's head (A2): its one segment, fitted to the column at 100 %, spills
    // at 150 % — and it joins its sheet once that holds
    {
      title: 'Lock · compact · half a section',
      cards: [
        { type: 'custom:fluvy-lock-card', entity: 'lock.front_door', variant: 'compact', cols: 6 },
        { type: 'custom:fluvy-lock-card', entity: 'lock.back_door', variant: 'compact', cols: 6 },
      ],
    },
    {
      title: 'Thermostat · compact · four columns',
      cards: thirds(
        ['climate.living', 'climate.cooling', 'climate.off'].map((entity) => ({
          type: 'custom:fluvy-thermostat-card',
          entity,
          variant: 'compact',
        })),
      ),
    },
    {
      title: 'Light · compact · four columns',
      cards: thirds(
        ['light.ceiling', 'light.reading', 'light.lamp'].map((entity) => ({
          type: 'custom:fluvy-light-card',
          entity,
          variant: 'compact',
        })),
      ),
    },
    {
      title: 'Fan · compact · four columns',
      cards: thirds(
        ['fan.ceiling', 'fan.bedroom', 'fan.tower'].map((entity) => ({
          type: 'custom:fluvy-fan-card',
          entity,
          variant: 'compact',
        })),
      ),
    },
    {
      title: 'Lock · compact · four columns',
      cards: thirds(
        ['lock.front_door', 'lock.back_door', 'lock.garage'].map((entity) => ({
          type: 'custom:fluvy-lock-card',
          entity,
          variant: 'compact',
        })),
      ),
    },
    {
      title: 'Gauge · bar · four columns',
      cards: thirds(
        ['sensor.so_solar_power', 'sensor.so_solar_power_night', 'sensor.so_solar_power'].map(
          (entity) => ({
            type: 'custom:fluvy-gauge-card',
            entity,
            icon: 'sun',
            variant: 'bar',
            max_entity: 'sensor.so_solar_capacity',
          }),
        ),
      ),
    },
    {
      title: 'Room · rows · four columns',
      cards: thirds(
        ['rm_living', 'rm_bedroom', 'rm_kitchen'].map((area) => ({
          type: 'custom:fluvy-room-card',
          area,
          variant: 'row',
        })),
      ),
    },
    // Home Assistant's own gap: a 320 section gives each half 156, not Fluvy's 152
    {
      title: "Half a section · Home Assistant's 8 px gaps",
      gap: 8,
      cards: [
        {
          type: 'custom:fluvy-thermostat-card',
          entity: 'climate.living',
          variant: 'compact',
          cols: 6,
        },
        {
          type: 'custom:fluvy-thermostat-card',
          entity: 'climate.off',
          variant: 'compact',
          cols: 6,
        },
        { type: 'custom:fluvy-light-card', entity: 'light.ceiling', variant: 'compact', cols: 6 },
        { type: 'custom:fluvy-lock-card', entity: 'lock.front_door', variant: 'compact', cols: 6 },
      ],
    },
  ],
};
