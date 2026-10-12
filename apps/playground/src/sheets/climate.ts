import type { SheetSpec } from '../scenes.js';

const THERMO = {
  min_temp: 15,
  max_temp: 30,
  target_temp_step: 0.5,
  hvac_modes: ['heat', 'cool', 'heat_cool'],
};

export const sheet: SheetSpec = {
  states: [
    [
      'climate.living',
      'heat',
      {
        friendly_name: 'Thermostat',
        ...THERMO,
        temperature: 21.5,
        current_temperature: 20.8,
        current_humidity: 46,
        hvac_action: 'heating',
        preset_modes: ['eco', 'comfort', 'away', 'boost'],
        preset_mode: 'comfort',
        fan_modes: ['auto', 'low', 'mid', 'high'],
        fan_mode: 'auto',
      },
    ],
    [
      'climate.cooling',
      'cool',
      {
        friendly_name: 'Thermostat',
        ...THERMO,
        temperature: 24,
        current_temperature: 26.1,
        hvac_action: 'cooling',
      },
    ],
    [
      'climate.range',
      'heat_cool',
      {
        friendly_name: 'Thermostat',
        ...THERMO,
        temperature: null,
        target_temp_low: 20,
        target_temp_high: 24,
        current_temperature: 21.8,
        hvac_action: 'idle',
      },
    ],
    [
      'climate.off',
      'off',
      {
        friendly_name: 'Thermostat',
        ...THERMO,
        hvac_modes: ['off', 'heat', 'cool'],
        temperature: null,
        current_temperature: 20.8,
        hvac_action: 'off',
      },
    ],
    // the device of #31: off, with presets and seven fan speeds that would otherwise fill the card
    [
      'climate.standby',
      'off',
      {
        friendly_name: 'Thermostat',
        ...THERMO,
        hvac_modes: ['off', 'heat', 'cool'],
        temperature: 22,
        current_temperature: 19.6,
        hvac_action: 'off',
        preset_modes: ['none', 'away', 'eco', 'boost'],
        preset_mode: 'none',
        fan_modes: ['auto', 'silence', '1', '2', '3', '4', '5'],
        fan_mode: 'auto',
      },
    ],
    [
      'water_heater.tank',
      'eco',
      {
        friendly_name: 'Water heater',
        min_temp: 40,
        max_temp: 65,
        temperature: 50,
        current_temperature: 48,
        operation_list: ['off', 'eco', 'performance'],
      },
    ],
    [
      'humidifier.bedroom',
      'on',
      {
        friendly_name: 'Humidifier',
        min_humidity: 30,
        max_humidity: 70,
        humidity: 50,
        current_humidity: 46,
        available_modes: ['auto', 'sleep'],
        mode: 'auto',
      },
    ],
    ['climate.nulls', 'unavailable', { friendly_name: 'Bedroom AC' }],
  ],
  frames: [
    { title: 'Heat', cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.living' }] },
    { title: 'Cool', cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.cooling' }] },
    { title: 'Range', cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.range' }] },
    { title: 'Off', cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.off' }] },
    {
      title: 'Water heater',
      cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'water_heater.tank' }],
    },
    {
      title: 'Humidifier',
      cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'humidifier.bedroom' }],
    },
    {
      title: 'Unavailable',
      cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.nulls' }],
    },
    {
      title: 'Compact · off, heat, cool · fan full width',
      cards: [
        {
          type: 'custom:fluvy-thermostat-card',
          entity: 'climate.living',
          variant: 'compact',
          modes: ['off', 'heat', 'cool'],
          fan_style: 'full',
          preset_style: 'full',
        },
      ],
    },
    {
      title: 'Ruler · modes as chips',
      cards: [
        {
          type: 'custom:fluvy-thermostat-card',
          entity: 'climate.cooling',
          variant: 'ruler',
          modes_style: 'chips',
        },
      ],
    },
    {
      title: 'Ruler · range',
      cards: [
        {
          type: 'custom:fluvy-thermostat-card',
          entity: 'climate.range',
          variant: 'ruler',
          modes_style: 'full',
        },
      ],
    },
    {
      title: 'Compact · off',
      cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.off', variant: 'compact' }],
    },
    // off: everything (the default) against the essentials; on, `when_off` changes nothing
    {
      title: 'Off · presets and fan',
      measure: false,
      cards: [{ type: 'custom:fluvy-thermostat-card', entity: 'climate.standby' }],
    },
    {
      title: 'Off · essentials',
      measure: false,
      cards: [
        { type: 'custom:fluvy-thermostat-card', entity: 'climate.standby', when_off: 'essentials' },
      ],
    },
    {
      title: 'Heat · essentials',
      cards: [
        { type: 'custom:fluvy-thermostat-card', entity: 'climate.living', when_off: 'essentials' },
      ],
    },
  ],
};
