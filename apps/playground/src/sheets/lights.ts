import { FluvyLightsCard } from '../../../../packages/cards/src/lights/lights-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-lights-card'))
  customElements.define('fluvy-lights-card', FluvyLightsCard);

type Attributes = Record<string, unknown>;
/** A white lamp that dims (its level in %). */
const white = (name: string, level?: number): Attributes => ({
  friendly_name: name,
  supported_color_modes: ['color_temp'],
  color_mode: 'color_temp',
  // lit, its colour as Home Assistant reports it beside its temperature
  ...(level !== undefined
    ? {
        brightness: Math.round((level / 100) * 255),
        hs_color: [28.4, 65.7],
        rgb_color: [255, 167, 87],
      }
    : {}),
  color_temp_kelvin: 2700,
});
/** A coloured bulb, on in `rgb`. */
const colour = (name: string, rgb: readonly number[], level: number): Attributes => ({
  friendly_name: name,
  supported_color_modes: ['hs', 'color_temp'],
  color_mode: 'hs',
  brightness: Math.round((level / 100) * 255),
  rgb_color: rgb,
});
/** A lamp that only switches. */
const plain = (name: string): Attributes => ({
  friendly_name: name,
  supported_color_modes: ['onoff'],
});

const lights = (config: Record<string, unknown>) => ({
  type: 'custom:fluvy-lights-card',
  ...config,
});

const LIVING = ['light.lt_ceiling', 'light.lt_floor', 'light.lt_reading'];
const SIX = [
  'light.lt_ceiling',
  'light.lt_floor',
  'light.lt_reading',
  'light.lt_shelf',
  'light.lt_strip',
  'light.lt_sconce',
];

export const sheet: SheetSpec = {
  states: [
    ['light.lt_ceiling', 'on', white('Ceiling', 70)],
    ['light.lt_floor', 'on', colour('Floor lamp', [255, 140, 70], 55)],
    ['light.lt_reading', 'off', white('Reading lamp')],
    ['light.lt_shelf', 'on', plain('Shelf')],
    ['light.lt_strip', 'on', colour('TV strip', [110, 120, 255], 40)],
    ['light.lt_sconce', 'off', white('Sconce')],
    ['light.lt_island', 'on', white('Island', 90)],
    ['light.lt_pendants', 'off', white('Pendants')],
    ['light.lt_off_one', 'off', white('Ceiling')],
    ['light.lt_off_two', 'off', white('Floor lamp')],
    ['light.lt_gone', 'unavailable', { friendly_name: 'Garden string' }],
    ['light.lt_porch', 'on', white('Porch', 35)],
    ['light.lt_full', 'on', white('Desk lamp', 100)],
    ['light.lt_plug_a', 'on', plain('Fairy lights')],
    ['light.lt_plug_b', 'off', plain('Salt lamp')],
    ['light.lt_long', 'on', white('The big paper lantern over the dining table in the corner', 60)],
  ],
  registry: {
    entities: {
      'light.lt_island': { entity_id: 'light.lt_island', area_id: 'lt_kitchen' },
      'light.lt_pendants': { entity_id: 'light.lt_pendants', area_id: 'lt_kitchen' },
    },
    areas: {
      lt_kitchen: { area_id: 'lt_kitchen', name: 'Kitchen' },
      lt_attic: { area_id: 'lt_attic', name: 'Attic' },
    },
  },
  frames: [
    {
      title: 'Living room',
      cards: [lights({ name: 'Living room', lights: LIVING })],
    },
    {
      title: 'From the area',
      cards: [lights({ area: 'lt_kitchen' })],
    },
    {
      title: 'All off',
      cards: [
        lights({
          name: 'Bedroom',
          lights: ['light.lt_off_one', 'light.lt_off_two'],
        }),
      ],
    },
    {
      title: 'Four lights',
      cards: [
        lights({
          name: 'Living room',
          lights: ['light.lt_ceiling', 'light.lt_floor', 'light.lt_reading', 'light.lt_shelf'],
        }),
      ],
    },
    {
      title: 'Six lights',
      cards: [lights({ name: 'Living room', lights: SIX })],
    },
    {
      title: 'Their own colours and icons',
      cards: [
        lights({
          name: 'Living room',
          lights: [
            { entity: 'light.lt_ceiling', icon: 'fluvy:sun', color: 'amber' },
            { entity: 'light.lt_floor', icon: 'fluvy:moon' },
            { entity: 'light.lt_shelf', icon: 'fluvy:sparkle', color: 'teal' },
          ],
        }),
      ],
    },
    {
      title: 'Chips',
      cards: [
        lights({
          name: 'Living room',
          variant: 'chips',
          lights: ['light.lt_ceiling', 'light.lt_floor', 'light.lt_reading', 'light.lt_shelf'],
        }),
      ],
    },
    {
      title: 'Chips · one brightness',
      cards: [
        lights({
          name: 'Living room',
          variant: 'chips',
          show_brightness: true,
          lights: LIVING,
        }),
      ],
    },
    {
      title: 'Tiles',
      cards: [
        lights({
          name: 'Living room',
          variant: 'tiles',
          lights: ['light.lt_ceiling', 'light.lt_floor', 'light.lt_reading', 'light.lt_strip'],
        }),
      ],
    },
    {
      title: 'Tiles · one brightness',
      cards: [
        lights({
          name: 'Kitchen',
          variant: 'tiles',
          show_brightness: true,
          area: 'lt_kitchen',
        }),
      ],
    },
    {
      title: 'A light unavailable',
      cards: [
        lights({ name: 'Garden', lights: ['light.lt_porch', 'light.lt_gone'] }),
        lights({
          name: 'Garden',
          variant: 'chips',
          lights: ['light.lt_porch', 'light.lt_gone'],
        }),
      ],
    },
    {
      title: 'Nothing can be read',
      cards: [lights({ name: 'Shed', lights: ['light.lt_gone'] })],
    },
    {
      title: 'Long names',
      cards: [
        lights({
          name: 'The living room with the long window on the garden side',
          lights: ['light.lt_long', 'light.lt_reading'],
        }),
        lights({
          name: 'Dining room',
          variant: 'chips',
          lights: ['light.lt_long', 'light.lt_reading', 'light.lt_floor'],
        }),
      ],
    },
    {
      title: 'Three tiles',
      cards: [lights({ name: 'Living room', variant: 'tiles', lights: LIVING })],
    },
    {
      title: 'Five chips',
      cards: [
        lights({
          name: 'Living room',
          variant: 'chips',
          lights: [
            'light.lt_ceiling',
            'light.lt_floor',
            'light.lt_reading',
            'light.lt_shelf',
            'light.lt_strip',
          ],
        }),
      ],
    },
    {
      title: 'No level shown',
      cards: [lights({ name: 'Living room', show_level: false, lights: LIVING })],
    },
    {
      title: 'Lights that only switch, one at full',
      cards: [
        lights({ name: 'Study', lights: ['light.lt_plug_a', 'light.lt_plug_b', 'light.lt_full'] }),
      ],
    },
    {
      title: 'One brightness on the row',
      cards: [lights({ name: 'Living room', show_brightness: true, lights: LIVING })],
    },
    {
      title: 'An area with no lights',
      cards: [lights({ area: 'lt_attic' })],
    },
    {
      title: 'A desktop column',
      width: 392,
      cards: [
        lights({ name: 'Living room', lights: LIVING }),
        lights({ name: 'Living room', variant: 'chips', lights: LIVING }),
      ],
    },
    {
      title: 'Half a column',
      cards: [
        lights({
          name: 'Bedroom',
          lights: ['light.lt_ceiling', 'light.lt_floor'],
          cols: 6,
        }),
        lights({ name: 'Hall', lights: ['light.lt_porch'], cols: 6 }),
        lights({ name: 'Kitchen', variant: 'chips', area: 'lt_kitchen', cols: 6 }),
        lights({ name: 'Living', variant: 'tiles', lights: LIVING.slice(0, 2), cols: 6 }),
      ],
    },
  ],
};
