import type { StateSeed } from '../hass.js';
import type { SheetSpec } from '../scenes.js';

/**
 * A card's actions: `tap_action` answers the head (the card's button: its circle, its name, the line under it) and a
 * tile's whole surface, `hold_action` a still press on either — both more-info by default, both anything Home
 * Assistant's actions are. A hold never also taps, and a hold on a ruler is still its fine scale.
 */
export const sheet: SheetSpec = {
  states: [
    [
      'light.ac_desk',
      'on',
      { friendly_name: 'Desk lamp', brightness: 153, supported_color_modes: ['brightness'] },
    ],
    ['light.ac_hall', 'on', { friendly_name: 'Hall', supported_color_modes: ['brightness'] }],
    ['switch.ac_heater', 'off', { friendly_name: 'Heater' }],
    ['lock.ac_front', 'locked', { friendly_name: 'Front door' }],
    ['person.ac_marta', 'home', { friendly_name: 'Marta' }],
    ['scene.ac_evening', '2026-09-17T20:00:00+00:00', { friendly_name: 'Evening' }],
    [
      'sensor.ac_office',
      '21.5',
      { friendly_name: 'Office', unit_of_measurement: '°C', device_class: 'temperature' },
    ],
    // four appliances on their plugs, the printer's gone (the owner's four large tiles, 1.9)
    ['switch.ac_washer', 'on', { friendly_name: 'Washer' }],
    ['switch.ac_dryer', 'off', { friendly_name: 'Dryer' }],
    ['switch.ac_dishwasher', 'on', { friendly_name: 'Dishwasher' }],
    ['switch.ac_printer', 'unavailable', { friendly_name: '3D printer' }],
    ...(['washer', 'dryer', 'dishwasher', 'printer'] as const).flatMap(
      (name, index): StateSeed[] => [
        [
          `sensor.ac_${name}_power`,
          name === 'printer' ? 'unavailable' : String([1840, 0, 96][index]),
          { friendly_name: `${name} power`, unit_of_measurement: 'W', device_class: 'power' },
        ],
        [
          `sensor.ac_${name}_energy`,
          name === 'printer' ? 'unavailable' : String([0.8, 1.6, 0.4][index]),
          { friendly_name: `${name} energy`, unit_of_measurement: 'kWh', device_class: 'energy' },
        ],
      ],
    ),
  ],
  frames: [
    // the defaults: the icon opens the details, so does a hold on the head (a dimmer alone draws no colour
    // controls: the light card's declared height reserves them, config only)
    {
      title: 'Defaults',
      measure: false,
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.ac_desk' }],
    },
    // chosen: the icon toggles, a hold goes to the room
    {
      title: 'Toggle and go',
      measure: false,
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.ac_hall',
          tap_action: { action: 'toggle' },
          hold_action: { action: 'navigate', navigation_path: '/fluvy-auto/rooms' },
        },
      ],
    },
    // a tile's whole surface: tap toggles, hold navigates; a hold never also toggles
    {
      title: 'Tiles',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          tiles: [
            {
              entity: 'switch.ac_heater',
              hold_action: { action: 'navigate', navigation_path: '/fluvy-auto/rooms' },
            },
            { entity: 'light.ac_desk', tap_action: { action: 'none' } },
          ],
        },
      ],
    },
    // what Home Assistant answers: a tap to be asked about first, and a tap that is a frontend integration's event
    {
      title: 'Asked first',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          tiles: [
            { entity: 'switch.ac_heater', tap_action: { action: 'toggle', confirmation: true } },
            {
              entity: 'light.ac_hall',
              tap_action: {
                action: 'fire-dom-event',
                browser_mod: { service: 'browser_mod.popup', data: { title: 'Hall' } },
              },
            },
          ],
        },
      ],
    },
    // a card of rows: its head holds like any other, and a row answers its own tap
    {
      title: 'Lock',
      cards: [
        {
          type: 'custom:fluvy-lock-card',
          entity: 'lock.ac_front',
          rows: [
            {
              entity: 'switch.ac_heater',
              tap_action: { action: 'navigate', navigation_path: '/fluvy-auto/rooms' },
            },
          ],
        },
      ],
    },
    // a scene tile: a tap runs the scene, a hold goes to the rooms and never also runs it
    {
      title: 'Scene',
      cards: [
        {
          type: 'custom:fluvy-scene-card',
          entity: 'scene.ac_evening',
          hold_action: { action: 'navigate', navigation_path: '/fluvy-auto/rooms' },
        },
      ],
    },
    // a sensor tile: its whole surface taps and holds
    {
      title: 'Sensor tile',
      cards: [
        {
          type: 'custom:fluvy-sensor-card',
          entity: 'sensor.ac_office',
          variant: 'tile',
          tap_action: { action: 'navigate', navigation_path: '/energy' },
          hold_action: { action: 'navigate', navigation_path: '/fluvy-auto/rooms' },
        },
      ],
    },
    // the greeting's avatar is its icon: a tap goes to the profile, a hold to the rooms
    {
      title: 'Greeting',
      cards: [
        {
          type: 'custom:fluvy-hello-card',
          name: 'Marta',
          person: 'person.ac_marta',
          tap_action: { action: 'navigate', navigation_path: '/profile' },
          hold_action: { action: 'navigate', navigation_path: '/fluvy-auto/rooms' },
        },
      ],
    },
    // a large tile (the lone tile card's own size): its surface taps and holds through the button stretched under its
    // switch, which keeps its own tap beside it
    {
      title: 'Tile · large',
      cards: [
        {
          type: 'custom:fluvy-tile-card',
          entity: 'switch.ac_washer',
          readouts: ['sensor.ac_washer_power', 'sensor.ac_washer_energy'],
          tap_action: { action: 'navigate', navigation_path: '/t/tile' },
          hold_action: { action: 'navigate', navigation_path: '/h/tile' },
          cols: 6,
        },
        {
          type: 'custom:fluvy-tile-card',
          entity: 'switch.ac_printer',
          readouts: ['sensor.ac_printer_power', 'sensor.ac_printer_energy'],
          tap_action: { action: 'navigate', navigation_path: '/t/gone' },
          hold_action: { action: 'navigate', navigation_path: '/h/gone' },
          cols: 6,
        },
      ],
    },
    // the owner's four large tiles: the one that cannot be read keeps its size, its readings dashes
    {
      title: 'Tiles · large · one unavailable',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'large',
          tiles: (['washer', 'dryer', 'dishwasher', 'printer'] as const).map((name) => ({
            entity: `switch.ac_${name}`,
            readouts: [`sensor.ac_${name}_power`, `sensor.ac_${name}_energy`],
          })),
        },
      ],
    },
  ],
};
