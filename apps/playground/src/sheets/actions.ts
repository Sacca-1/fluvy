import type { SheetSpec } from '../scenes.js';

/**
 * A card's actions: `tap_action` answers the icon circle (a tile's whole surface), `hold_action` a still press on the
 * head — both more-info by default, both anything Home Assistant's actions are. A hold never also taps, and a hold
 * on a ruler is still its fine scale.
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
  ],
};
