import type { SheetSpec } from '../scenes.js';

/** A colour bulb's lit colour, Home Assistant's own orange: what `rgb_color` says beside its `hs_color`. */
const ORANGE = { hs_color: [36, 100], rgb_color: [255, 152, 0] };

export const sheet: SheetSpec = {
  states: [
    // the ceiling: a colour bulb in its white (the default config draws the temperature ruler and the quick colours)
    [
      'light.ceiling',
      'on',
      {
        friendly_name: 'Ceiling',
        brightness: 178,
        supported_color_modes: ['hs', 'color_temp'],
        color_mode: 'color_temp',
        color_temp_kelvin: 3200,
        min_color_temp_kelvin: 2200,
        max_color_temp_kelvin: 6500,
      },
    ],
    // the lamp: the same bulb glowing a colour (the hue ruler takes the slot, the card wears the orange)
    [
      'light.lamp',
      'on',
      {
        friendly_name: 'Lamp',
        brightness: 200,
        supported_color_modes: ['hs', 'color_temp'],
        color_mode: 'hs',
        ...ORANGE,
        min_color_temp_kelvin: 2200,
        max_color_temp_kelvin: 6500,
      },
    ],
    // a bulb of colours alone, no white to set: the quick colours are colours alone
    [
      'light.strip',
      'on',
      {
        friendly_name: 'Strip',
        brightness: 120,
        supported_color_modes: ['rgb'],
        color_mode: 'rgb',
        rgb_color: [33, 150, 243],
      },
    ],
    ['light.reading', 'off', { friendly_name: 'Reading', supported_color_modes: ['brightness'] }],
    [
      'light.porch',
      'unavailable',
      { friendly_name: 'Porch light', supported_color_modes: ['brightness'] },
    ],
  ],
  frames: [
    { title: 'On', cards: [{ type: 'custom:fluvy-light-card', entity: 'light.ceiling' }] },
    // a dimmer alone draws no ruler slot and no quick colours: the declared height reserves them (config only)
    {
      title: 'Off',
      measure: false,
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.reading' }],
    },
    {
      title: 'Unavailable',
      measure: false,
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.porch' }],
    },
    {
      title: 'Live update',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.ceiling',
          live_update: true,
          show_temperature: false,
        },
      ],
    },
    // issue #32: a bulb in a colour — the hue ruler in the slot, its colour on the card and checked in the row
    {
      title: 'Colour · hs mode',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp' }],
    },
    // the house's own quick colours: eight, so the row wraps six and two
    {
      title: 'Colour · custom swatches',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: ['warm', 'cool', '#ff2d55', 'amber', 'teal', 'purple', 'pink', 'blue'],
        },
      ],
    },
    // the house's own list with the picker: three colours and any other — the lamp's orange is none of the three, so
    // the picker's round holds it, inside its ring of the hues
    {
      title: 'Colour · with the picker',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: ['red', 'blue', 'purple', 'picker'],
        },
      ],
    },
    // colours alone: no white among the quick colours, the hue ruler whatever the mode
    {
      title: 'Colour · colours alone',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.strip' }],
    },
    {
      title: 'Colour hidden',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp', show_color: false }],
    },
    // half a section each: the compact layout by width (the head says the level, the ruler stands alone)
    {
      title: 'Two on a line',
      width: 480,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.ceiling', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.reading', cols: 6 },
      ],
    },
    {
      title: 'Two on a phone',
      measure: false,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.lamp', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.porch', cols: 6 },
      ],
    },
    // the compact layout on the colour bulb: nothing of the colour controls, the worn colour alone
    {
      title: 'Compact by choice',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp', variant: 'compact' }],
    },
  ],
};
