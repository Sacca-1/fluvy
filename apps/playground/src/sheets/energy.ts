import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from '@fluvy/core';
import { FluvyEnergyCard } from '../../../../packages/cards/src/energy/energy-card.js';
import { FluvyEnergyDevicesCard } from '../../../../packages/cards/src/energy-devices/energy-devices-card.js';
import { FluvyEnergyFlowCard } from '../../../../packages/cards/src/energy-flow/energy-flow-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-energy-card'))
  customElements.define('fluvy-energy-card', FluvyEnergyCard);
if (!customElements.get('fluvy-energy-flow-card'))
  customElements.define('fluvy-energy-flow-card', FluvyEnergyFlowCard);
if (!customElements.get('fluvy-energy-devices-card'))
  customElements.define('fluvy-energy-devices-card', FluvyEnergyDevicesCard);

/** The design sheet's moment: 21:47 on the 24 h axis, so the curve can be held against the render. */
const SHEET_NOW = '2026-09-17T21:47:12';

/**
 * The mock's profile reads a 24-hour clock. This stand-in shows the card it wraps (`card`) to a
 * 12-hour user: the axes must read "12 AM … 12 AM" on one line each.
 */
export class TwelveHour extends HTMLElement implements LovelaceCard {
  private inner: LovelaceCard | undefined;

  setConfig(config: LovelaceCardConfig): void {
    const { card, ...rest } = config as LovelaceCardConfig & { card: string };
    this.inner = document.createElement(card) as LovelaceCard;
    this.inner.setConfig({ ...rest, type: `custom:${card}` });
    this.style.display = 'block';
    this.replaceChildren(this.inner);
  }

  getCardSize(): number | Promise<number> {
    return this.inner?.getCardSize() ?? 1;
  }

  set hass(hass: HomeAssistant) {
    if (this.inner) this.inner.hass = { ...hass, locale: { ...hass.locale, time_format: '12' } };
  }
}
if (!customElements.get('pg-twelve-hour')) customElements.define('pg-twelve-hour', TwelveHour);

type Attributes = Record<string, unknown>;
const power = (name: string, unit: 'W' | 'kW' = 'W'): Attributes => ({
  friendly_name: name,
  unit_of_measurement: unit,
  device_class: 'power',
  state_class: 'measurement',
});
const energy = (name: string, unit: 'Wh' | 'kWh' | 'MJ' = 'kWh'): Attributes => ({
  friendly_name: name,
  unit_of_measurement: unit,
  device_class: 'energy',
  state_class: 'total_increasing',
});

/** The sheet draws its curves through a dozen points; a recorder returns many more. Same shape, eased between the points. */
const dense = (points: readonly number[], scale: number, per = 8): number[] =>
  points.flatMap((value, i) => {
    const next = points[i + 1];
    if (next === undefined) return [Math.round(value * scale)];
    return Array.from({ length: per }, (_, step) =>
      Math.round((value + ((next - value) * (1 - Math.cos((step / per) * Math.PI))) / 2) * scale),
    );
  });

/**
 * Marta’s flat as the energy sheet draws it: solar 3.2 kW, the grid importing 0.4 kW, the battery
 * charging at 1.1 kW, the house on 2.5 kW. Every id carries `ef_`: other sheets have a house too.
 */
export const sheet: SheetSpec = {
  states: [
    /* the house — on purpose in W, the unit most inverters report, beside a second integration in kW */
    ['sensor.ef_house_power', '2500', power('House power')],
    ['sensor.ef_solar_power', '3.2', power('Solar power', 'kW')],
    ['sensor.ef_grid_power', '400', power('Grid power')],
    ['sensor.ef_battery_power', '-1100', power('Battery power')], // negative = charging
    [
      'sensor.ef_battery_level',
      '78',
      { friendly_name: 'Battery', unit_of_measurement: '%', device_class: 'battery' },
    ],
    ['sensor.ef_cost_now', '0.27', { friendly_name: 'Energy cost', unit_of_measurement: '€/h' }],

    /* today's totals */
    ['sensor.ef_grid_today', '4.1', energy('Grid')],
    ['sensor.ef_solar_today', '5700', energy('Solar', 'Wh')],
    ['sensor.ef_peak_today', '2800', power('Peak')],
    ['sensor.ef_self_use', '88', { friendly_name: 'Self-use', unit_of_measurement: '%' }],
    ['sensor.ef_exported_today', '1.3', energy('Exported')],
    ['sensor.ef_imported_today', '4.1', energy('Imported')],

    /* a flat without solar; a house that exports through a meter that signs export as positive */
    ['sensor.ef_flat_grid_power', '1.4', power('Grid power', 'kW')],
    ['sensor.ef_flat_house_power', '1400', power('House power')],
    ['sensor.ef_export_grid_power', '1800', power('Grid power')],

    /* an evening on the battery: no sun, the battery discharging, a trickle from the grid, no house meter */
    ['sensor.ef_night_solar_power', '-4', power('Solar power')], // the inverter's own standby draw
    ['sensor.ef_night_grid_power', '35', power('Grid power')],
    ['sensor.ef_night_battery_power', '820', power('Battery power')], // positive = discharging
    [
      'sensor.ef_night_battery_level',
      '41.6',
      { friendly_name: 'Battery', unit_of_measurement: '%', device_class: 'battery' },
    ],

    /* appliances drawing now (the sheet's list), in two units */
    ['sensor.ef_dishwasher_power', '1.4', power('Dishwasher', 'kW')],
    ['sensor.ef_heat_pump_power', '900', power('Heat pump')],
    ['sensor.ef_media_power', '96', power('Media')],
    ['sensor.ef_fridge_power', '104', power('Fridge')],

    /* appliances today, in three units, one with its cost, one asleep, one gone, one that is not energy at all */
    ['sensor.ef_dishwasher_energy', '1.42', energy('Dishwasher')],
    ['sensor.ef_heat_pump_energy', '13.7', energy('Heat pump', 'MJ')],
    ['sensor.ef_media_energy', '420', energy('Kitchen speaker', 'Wh')],
    ['sensor.ef_fridge_energy', '0.9', energy('Fridge')],
    ['sensor.ef_oven_energy', '0', energy('Oven')],
    [
      'sensor.ef_dishwasher_cost',
      '0.3',
      { friendly_name: 'Dishwasher cost', unit_of_measurement: '€', device_class: 'monetary' },
    ],
    ['sensor.ef_dryer_energy', 'unavailable', energy('Dryer')],
    [
      'sensor.ef_tap_water',
      '84',
      { friendly_name: 'Kitchen tap', unit_of_measurement: 'L', device_class: 'water' },
    ],

    /* hard states */
    ['sensor.ef_quiet_power', '1200', power('Utility room power')], // no history at all
    ['sensor.ef_dead_power', 'unavailable', power('House power')],
    ['sensor.ef_dead_solar', 'unavailable', power('Solar power')],
    ['sensor.ef_dead_grid', 'unknown', power('Grid power')],
    ['sensor.ef_dead_energy', 'unavailable', energy('Grid')],
  ],

  /* the mock spreads each series evenly over whatever window the card asks for */
  history: {
    'sensor.ef_house_power': dense(
      [0.6, 0.4, 0.3, 0.3, 0.5, 1.4, 2.1, 1.6, 1.2, 1.9, 2.8, 2.2, 2.5],
      1000,
    ),
    'sensor.ef_flat_house_power': dense([0.9, 0.7, 1.8, 1.1, 0.9, 1.5, 2.2, 1.6, 1.4], 1000),
    'sensor.ef_dead_power': [900, 850, 800, 780, 1100, 1400],
  },

  frames: [
    {
      title: 'Energy',
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_house_power',
          title: 'Energy',
          cost_entity: 'sensor.ef_cost_now',
          _now: SHEET_NOW,
          legend: [
            { entity: 'sensor.ef_grid_today', label: 'Grid' },
            { entity: 'sensor.ef_solar_today', label: 'Solar' },
            { entity: 'sensor.ef_peak_today', label: 'Peak' },
          ],
        },
      ],
    },
    // the head, the chart and its axis: half a section
    {
      title: 'Energy · compact',
      width: 392,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_house_power',
          variant: 'compact',
          _now: SHEET_NOW,
        },
      ],
    },
    {
      title: 'Flow',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          subtitle: 'Live · 5 s ago', // the sheet's words; the other frames leave the card to say how fresh its readings are
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_grid_power',
          battery_power: 'sensor.ef_battery_power',
          battery_level: 'sensor.ef_battery_level',
          home_power: 'sensor.ef_house_power',
          readouts: [
            { entity: 'sensor.ef_self_use', label: 'Self-use' },
            { entity: 'sensor.ef_exported_today', label: 'Exported' },
            { entity: 'sensor.ef_imported_today', label: 'Imported' },
          ],
        },
      ],
    },
    {
      title: 'Appliances',
      cards: [
        {
          type: 'custom:fluvy-energy-devices-card',
          rows: [
            { entity: 'sensor.ef_fridge_power', icon: 'plug' },
            { entity: 'sensor.ef_dishwasher_power', icon: 'plug' },
            { entity: 'sensor.ef_media_power', icon: 'speaker', tone: 'media' },
            { entity: 'sensor.ef_heat_pump_power', icon: 'thermo', tone: 'heat' },
          ],
        },
      ],
    },
    {
      title: 'Appliances today',
      cards: [
        {
          type: 'custom:fluvy-energy-devices-card',
          title: 'Consumption',
          icon: 'home',
          rows: [
            {
              entity: 'sensor.ef_dishwasher_energy',
              icon: 'plug',
              cost_entity: 'sensor.ef_dishwasher_cost',
            },
            { entity: 'sensor.ef_heat_pump_energy', icon: 'thermo', tone: 'heat' },
            { entity: 'sensor.ef_media_energy', name: 'Media', icon: 'speaker', tone: 'media' },
            { entity: 'sensor.ef_fridge_energy', icon: 'plug' },
            { entity: 'sensor.ef_oven_energy', icon: 'flame' },
            { entity: 'sensor.ef_dryer_energy', icon: 'plug' },
            { entity: 'sensor.ef_tap_water' },
          ],
        },
      ],
    },
    {
      title: 'No solar',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          grid_power: 'sensor.ef_flat_grid_power',
          home_power: 'sensor.ef_flat_house_power',
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Legs',
          flow_style: 'legs',
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_grid_power',
          home_power: 'sensor.ef_house_power',
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Rail',
          flow_style: 'rail',
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_grid_power',
          home_power: 'sensor.ef_house_power',
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Rail · lone source',
          flow_style: 'rail',
          grid_power: 'sensor.ef_flat_grid_power',
          home_power: 'sensor.ef_flat_house_power',
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Narrow',
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_grid_power',
          home_power: 'sensor.ef_house_power',
          cols: 6,
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Narrow rail',
          flow_style: 'rail',
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_grid_power',
          battery_power: 'sensor.ef_battery_power',
          home_power: 'sensor.ef_house_power',
          cols: 6,
        },
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_flat_house_power',
          title: 'Energy',
          hours: 6,
        },
      ],
    },
    {
      title: '12-hour clock · mixed units',
      cards: [
        {
          type: 'pg-twelve-hour',
          card: 'fluvy-energy-card',
          entity: 'sensor.ef_house_power',
          title: 'Energy',
          _now: SHEET_NOW,
          legend: ['sensor.ef_media_energy', 'sensor.ef_grid_today', 'sensor.ef_peak_today'],
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Totals in one unit',
          subtitle: 'Live · 5 s ago',
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_grid_power',
          readouts: [
            'sensor.ef_media_energy',
            'sensor.ef_exported_today',
            'sensor.ef_imported_today',
          ],
        },
      ],
    },
    {
      title: 'Exporting',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          solar_power: 'sensor.ef_solar_power',
          grid_power: 'sensor.ef_export_grid_power',
          grid_invert: true,
        },
      ],
    },
    {
      title: 'On the battery',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          solar_power: 'sensor.ef_night_solar_power',
          grid_power: 'sensor.ef_night_grid_power',
          battery_power: 'sensor.ef_night_battery_power',
          battery_level: 'sensor.ef_night_battery_level',
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Battery',
          subtitle: 'Garage · 10 kWh',
          battery_power: 'sensor.ef_battery_power',
          battery_invert: true,
          battery_level: 'sensor.ef_battery_level',
        },
      ],
    },
    {
      title: 'Nothing to show',
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_quiet_power',
          title: 'Utility room',
        },
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_dead_power',
          title: 'Energy',
          cost_entity: 'sensor.ef_cost_now',
          legend: ['sensor.ef_dead_energy', { entity: 'sensor.ef_missing_energy', label: 'Solar' }],
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          solar_power: 'sensor.ef_dead_solar',
          grid_power: 'sensor.ef_dead_grid',
          home_power: 'sensor.ef_dead_power',
        },
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Half known',
          solar_power: 'sensor.ef_dead_solar',
          grid_power: 'sensor.ef_grid_power',
        },
        {
          type: 'custom:fluvy-energy-devices-card',
          rows: [
            { entity: 'sensor.ef_dryer_energy' },
            { entity: 'sensor.ef_dead_energy', name: 'Washer' },
          ],
        },
        { type: 'custom:fluvy-energy-card', entity: 'sensor.ef_not_there' },
      ],
    },
    // the compact chart at its own size: half a section
    {
      title: 'Energy · compact · half a section',
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_house_power',
          variant: 'compact',
          _now: SHEET_NOW,
          cols: 6,
        },
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.ef_solar_power',
          variant: 'compact',
          _now: SHEET_NOW,
          cols: 6,
        },
      ],
    },
  ],
};
