import type { StateSeed } from '../hass.js';
import type { SheetSpec } from '../scenes.js';

/**
 * Colour per card: a card's `color` (a Home Assistant colour name or a hex) stands in for the palette's accent
 * inside it — its chart, its lit light, its gauge — derived on the palette the page wears, in its mode.
 */
const sensor = (
  id: string,
  name: string,
  state: string,
  unit: string,
  deviceClass: string,
): StateSeed => [
  `sensor.${id}`,
  state,
  {
    friendly_name: name,
    unit_of_measurement: unit,
    device_class: deviceClass,
    state_class: 'measurement',
  },
];

/** Home Assistant's six greys, darkest first, as its picker names them. */
const GREYS = [
  ['black', 'Black'],
  ['dark-grey', 'Dark grey'],
  ['blue-grey', 'Blue grey'],
  ['grey', 'Grey'],
  ['light-grey', 'Light grey'],
  ['white', 'White'],
] as const;

const walk = (from: number, step: number, n = 24): number[] =>
  Array.from({ length: n }, (_, i) =>
    Number((from + Math.sin(i / 3) * step + (i % 5) * step * 0.1).toFixed(1)),
  );

export const sheet: SheetSpec = {
  states: [
    sensor('co_water', 'Water temperature', '38.5', '°C', 'temperature'),
    sensor('co_pool', 'Pool', '26.1', '°C', 'temperature'),
    sensor('co_oven', 'Oven', '180', '°C', 'temperature'),
    sensor('co_power', 'House power', '640', 'W', 'power'),
    sensor('co_lux', 'Light level', '312', 'lx', 'illuminance'),
    sensor('co_dust', 'Fine dust', '9', 'µg/m³', 'pm25'),
    sensor('co_humidity', 'Cellar humidity', '61', '%', 'humidity'),
    ['binary_sensor.co_window', 'on', { friendly_name: 'Studio window', device_class: 'window' }],
    [
      'light.co_lamp',
      'on',
      { friendly_name: 'Reading lamp', brightness: 204, supported_color_modes: ['brightness'] },
    ],
    ['light.co_hall', 'off', { friendly_name: 'Hall', supported_color_modes: ['brightness'] }],
    ['light.co_porch', 'off', { friendly_name: 'Porch', supported_color_modes: ['onoff'] }],
    ['light.co_gone', 'unavailable', { friendly_name: 'Attic' }],
    ['switch.co_kettle', 'off', { friendly_name: 'Kettle' }],
    ['scene.co_evening', '2026-09-17T19:40:00+00:00', { friendly_name: 'Evening' }],
    ['scene.co_cinema', '2026-09-16T21:00:00+00:00', { friendly_name: 'Cinema' }],
    ['scene.co_morning', '2026-09-17T07:00:00+00:00', { friendly_name: 'Morning' }],
    ['fan.co_fan', 'on', { friendly_name: 'Ceiling fan', percentage: 66, supported_features: 1 }],
    [
      'media_player.co_player',
      'playing',
      {
        friendly_name: 'Kitchen speaker',
        media_title: 'Blue in Green',
        media_artist: 'Miles Davis',
        volume_level: 0.4,
        supported_features: 4,
      },
    ],
  ],
  history: {
    'sensor.co_water': walk(38, 1.2),
    'sensor.co_pool': walk(26, 0.6),
    'sensor.co_oven': walk(160, 25),
    'sensor.co_power': walk(600, 180),
    'sensor.co_lux': walk(300, 120),
    'sensor.co_dust': walk(9, 4),
    'sensor.co_humidity': walk(60, 5),
  },
  frames: [
    // six charts, six colours: a name of Home Assistant's, a hex typed, a grey
    {
      title: 'Six colours',
      width: 412,
      cards: [
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_water',
          variant: 'chart',
          hours: 6,
          color: 'blue',
        },
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_pool',
          variant: 'chart',
          hours: 6,
          color: 'teal',
        },
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_oven',
          variant: 'chart',
          hours: 6,
          color: 'deep-orange',
        },
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_power',
          variant: 'chart',
          hours: 6,
          color: 'purple',
        },
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_lux',
          variant: 'chart',
          hours: 6,
          color: '#c6ff00',
        },
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_dust',
          variant: 'chart',
          hours: 6,
          color: 'grey',
        },
      ],
    },
    // the same chart in the palette's own accent: what a card without a colour is
    {
      title: 'No colour',
      cards: [
        { type: 'custom:fluvy-sensor-card', entity: 'sensor.co_water', variant: 'chart', hours: 6 },
      ],
    },
    // a red card: its lit light turns red (the accent's twin), the fan and the speaker keep their tones
    {
      title: 'Red tiles',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          color: 'red',
          tiles: ['light.co_lamp', 'fan.co_fan', 'media_player.co_player', 'light.co_hall'],
        },
      ],
    },
    // a tile's own colour: the lamp red and the speaker a green typed, each drawn in its colour; the fan as it is
    {
      title: 'Tiles with their own colours',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          tiles: [
            { entity: 'light.co_lamp', color: 'red' },
            'fan.co_fan',
            { entity: 'media_player.co_player', color: '#00b894' },
          ],
        },
      ],
    },
    // `tint: always`: a tile with a colour shows it at rest too — a wash and its hairline; on, the full fill as ever
    {
      title: 'Tint · tiles at rest',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'compact',
          tint: 'always',
          tiles: [
            { entity: 'light.co_lamp', color: 'red' },
            { entity: 'light.co_hall', color: 'red' },
            { entity: 'light.co_porch', color: 'teal' },
            { entity: 'switch.co_kettle', color: '#e17055' },
          ],
        },
      ],
    },
    // a colour stands in for the accent, never for a status: an open window stays the warning's under a colour; a tone
    // asked for by name is the house's choice
    {
      title: 'A status under a colour',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'compact',
          tiles: [{ entity: 'binary_sensor.co_window', color: 'teal' }],
        },
        {
          type: 'custom:fluvy-entities-card',
          title: 'Windows',
          rows: [
            { entity: 'binary_sensor.co_window', color: 'teal' },
            { entity: 'binary_sensor.co_window', name: 'Studio window (accent)', tone: 'accent' },
          ],
        },
      ],
    },
    {
      title: 'Tint · scenes and tabs',
      cards: [
        {
          type: 'custom:fluvy-scenes-card',
          tint: 'always',
          scenes: [
            { entity: 'scene.co_evening', color: 'deep-orange' },
            { entity: 'scene.co_cinema', color: 'indigo' },
            { entity: 'scene.co_morning', color: 'amber' },
          ],
        },
        {
          type: 'custom:fluvy-chips-card',
          tint: 'always',
          chips: [
            { name: 'Home', path: '/', color: 'teal' },
            { name: 'Garden', path: '/garden', color: 'green' },
            { name: 'Garage', path: '/garage' },
          ],
        },
      ],
    },
    {
      title: 'Plain tiles',
      cards: [{ type: 'custom:fluvy-tiles-card', tiles: ['light.co_lamp', 'fan.co_fan'] }],
    },
    // a colour for the whole card (issue #34): the surface a quiet wash of it, the edge and the dividers in it; the
    // items inside keep their own fills, a status card without one keeps the palette's card
    {
      title: 'Colour per card',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          card_color: 'amber',
          tiles: ['light.co_lamp', 'light.co_hall', 'light.co_porch'],
        },
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.co_water',
          variant: 'chart',
          hours: 6,
          card_color: 'blue',
          color: 'teal',
        },
        { type: 'custom:fluvy-tiles-card', tiles: ['binary_sensor.co_window', 'fan.co_fan'] },
      ],
    },
    // the inner tiles keep the page's ground: a lit light differs from the wash, an off one from the card
    {
      title: 'Colour per card · tiles inside',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'compact',
          card_color: 'teal',
          tint: 'always',
          tiles: [
            { entity: 'light.co_lamp', color: 'red' },
            'fan.co_fan',
            { entity: 'light.co_hall', color: 'blue' },
          ],
        },
      ],
    },
    // a card that cannot be read keeps the neutral skin: a state is never covered
    {
      title: 'Colour per card · unavailable',
      measure: false,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.co_gone', card_color: 'purple' },
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.co_power',
          max: 3000,
          card_color: 'indigo',
        },
      ],
    },
    // a gauge's ring is drawn in the accent: an indigo card's is indigo
    {
      title: 'Indigo gauge',
      cards: [
        { type: 'custom:fluvy-gauge-card', entity: 'sensor.co_power', max: 3000, color: 'indigo' },
      ],
    },
    // (a dimmer alone: the light card's declared height reserves its colour controls, config only)
    {
      title: 'Red light',
      measure: false,
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.co_lamp', color: 'red' }],
    },
    {
      title: 'Cyan humidity',
      cards: [
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.co_humidity',
          hours: 6,
          color: 'cyan',
        },
      ],
    },
    // the grey ladder (#40): black, the greys and white, each lamp on (its plate) beside one off (its resting circle)
    {
      title: 'Greys',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'compact',
          tiles: GREYS.flatMap(([color, name]) => [
            { entity: 'light.co_lamp', color, name },
            { entity: 'light.co_hall', color, name },
          ]),
        },
      ],
    },
  ],
};
