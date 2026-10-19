import { FluvyDistributionCard } from '../../../../packages/cards/src/distribution/distribution-card.js';
import { FluvyEnergyCard } from '../../../../packages/cards/src/energy/energy-card.js';
import { FluvyEnergyFlowCard } from '../../../../packages/cards/src/energy-flow/energy-flow-card.js';
import {
  HYBRID_LEVELS,
  HYBRID_STATES,
  hybridIssue49,
  hybridMetersOnly,
  hybridHeavyExport,
  hybridNoBattery,
  hybridTwoBatteries,
  hybridWithPower,
  ISSUE_49_STATES,
} from '../hybrid.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-energy-flow-card'))
  customElements.define('fluvy-energy-flow-card', FluvyEnergyFlowCard);
if (!customElements.get('fluvy-energy-card'))
  customElements.define('fluvy-energy-card', FluvyEnergyCard);
if (!customElements.get('fluvy-distribution-card'))
  customElements.define('fluvy-distribution-card', FluvyDistributionCard);

/** The mock's moment: every reading was reported now, so the cards say "Live · now". */
const NOW = '2026-09-17T21:47:12';

type Attributes = Record<string, unknown>;
const power = (name: string, unit: 'W' | 'kW' = 'W'): Attributes => ({
  friendly_name: name,
  unit_of_measurement: unit,
  device_class: 'power',
  state_class: 'measurement',
});
const level = (name: string): Attributes => ({
  friendly_name: name,
  unit_of_measurement: '%',
  device_class: 'battery',
});
const energy = (name: string): Attributes => ({
  friendly_name: name,
  unit_of_measurement: 'kWh',
  device_class: 'energy',
  state_class: 'total_increasing',
});

/** The #19 house at midday: 3.2 kW of sun on one phase, the grid 1.9 in on two and 0.4 out on the third, the battery charging. */
const house19 = {
  sources: [
    { type: 'solar', power: 'sensor.fl_solar' },
    { type: 'grid', phases: ['sensor.fl_l1', 'sensor.fl_l2', 'sensor.fl_l3'] },
    { type: 'battery', power: 'sensor.fl_battery', level: 'sensor.fl_battery_level' },
  ],
  _now: NOW,
};

/** A day's energy hour by hour (four buckets: night, morning, afternoon, evening) for the period frames. */
const DAY = Date.parse('2026-09-16T22:00:00Z');
const buckets = (values: readonly number[]): { start: number; change: number }[] =>
  values.map((change, i) => ({ start: DAY + i * 6 * 3600_000, change }));
const STATS: Record<string, { start: number; change: number }[]> = {
  'sensor.fl_grid_in_energy': buckets([2.0, 0.3, 0, 1.8]),
  'sensor.fl_grid_out_energy': buckets([0, 0.4, 0.9, 0]),
  'sensor.fl_solar_energy': buckets([0, 4.0, 7.2, 0]),
  'sensor.fl_battery_out_energy': buckets([1.4, 0, 0, 1.0]),
  'sensor.fl_battery_in_energy': buckets([0, 1.6, 1.4, 0]),
};

/**
 * The same day in five-minute buckets up to the sheet's 21:47 (kWh a bucket): a bell of sun from 07:00 to 19:00
 * with the battery filling at midday and the surplus exported, the grid at night, the battery through the evening —
 * each series scaled so the day adds up to the hourly statistics above (sun 11.2, exported 1.3 …), as a recorder's
 * five-minute and hourly statistics do.
 */
function fiveMinutes(id: string): { start: number; change: number }[] {
  const series = shapes()[id];
  if (!series) return [];
  const sum = series.reduce((total, kw) => total + kw / 12, 0);
  const target = (STATS[id] ?? []).reduce((total, b) => total + b.change, 0);
  const factor = sum > 0 ? target / sum : 0;
  return series.map((kw, i) => ({ start: DAY + i * 300_000, change: (kw / 12) * factor }));
}

/** Each power sensor's meters: its five-minute means follow the meters' day, at the meters' scale. */
const POWER_OF: Record<string, { from: string; to?: string }> = {
  'sensor.fl_solar': { from: 'sensor.fl_solar_energy' },
  'sensor.fl_grid_in': { from: 'sensor.fl_grid_in_energy' },
  'sensor.fl_grid_out': { from: 'sensor.fl_grid_out_energy' },
  // signed: discharging is positive, charging negative
  'sensor.fl_battery': { from: 'sensor.fl_battery_out_energy', to: 'sensor.fl_battery_in_energy' },
};

/** The battery's capacity (kWh), as the preferences say, and its charge now (%): the state's 62. */
const CAPACITY = 10;
const LEVEL_NOW = 62;

/**
 * The battery's charge through the day (its five-minute means, %): what went in less what came out, ending on the
 * state the sheet reads now.
 */
function levelMeans(): { start: number; end: number; mean: number }[] {
  const battery = powerMeans('sensor.fl_battery');
  let level = 0;
  const levels = battery.map((b) => (level -= ((b.mean / 12) * 100) / CAPACITY));
  const shift = LEVEL_NOW - (levels[levels.length - 1] ?? 0);
  return battery.map((b, i) => ({
    start: b.start,
    end: b.end,
    mean: Math.min(100, Math.max(0, (levels[i] ?? 0) + shift)),
  }));
}

/** The same day as the power sensors' five-minute means (kW), as the recorder compiles them. */
function powerMeans(id: string): { start: number; end: number; mean: number }[] {
  if (id === 'sensor.fl_battery_level') return levelMeans();
  const of = POWER_OF[id];
  if (!of) return [];
  const kw = (meter: string): number[] => fiveMinutes(meter).map((b) => b.change * 12);
  const from = kw(of.from);
  const to = of.to ? kw(of.to) : [];
  return from.map((value, i) => ({
    start: DAY + i * 300_000,
    end: DAY + (i + 1) * 300_000,
    mean: value - (to[i] ?? 0),
  }));
}

/** The day's shapes in kW, a value a five-minute bucket. */
function shapes(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (let i = 0; i < 262; i++) {
    const h = (i * 5 + 2.5) / 60;
    const sun = 1.35 * Math.max(0, Math.sin(((h - 6.5) / 13) * Math.PI));
    const house =
      0.42 +
      0.35 * Math.exp(-((h - 7.5) ** 2) / 1.5) +
      0.25 * Math.exp(-((h - 13) ** 2) / 2) +
      0.8 * Math.exp(-((h - 20) ** 2) / 3);
    // the battery fills from the late morning, easing in and out, and gives it back through the evening
    const window = h > 9 && h < 14.5 ? Math.sin(((h - 9) / 5.5) * Math.PI) : 0;
    const charge = Math.min(0.9, Math.max(0, sun - house)) * window;
    const discharge = Math.min(house, 0.55 * Math.exp(-((h - 21) ** 2) / 2.5));
    const exported = Math.max(0, sun - house - charge);
    const imported = Math.max(0, house - sun - discharge);
    const kw: Record<string, number> = {
      'sensor.fl_solar_energy': sun,
      'sensor.fl_grid_in_energy': imported,
      'sensor.fl_grid_out_energy': exported,
      'sensor.fl_battery_in_energy': charge,
      'sensor.fl_battery_out_energy': discharge,
    };
    for (const [key, value] of Object.entries(kw)) (out[key] ??= []).push(value);
  }
  return out;
}

export const sheet: SheetSpec = {
  states: [
    ['sensor.fl_solar', '3.2', power('Solar power', 'kW')],
    ['sensor.fl_house', '1.2', power('House power', 'kW')],
    ['sensor.fl_l1', '-0.4', power('Grid L1', 'kW')],
    ['sensor.fl_l2', '1000', power('Grid L2')],
    ['sensor.fl_l3', '0.9', power('Grid L3', 'kW')],
    ['sensor.fl_battery', '-600', power('Battery power')],
    ['sensor.fl_battery_level', '62', level('Battery')],
    ['sensor.fl_self_use', '72', { friendly_name: 'Self-powered', unit_of_measurement: '%' }],
    ['sensor.fl_exported', '1.3', energy('Exported')],
    ['sensor.fl_imported', '4.1', energy('Imported')],
    ['sensor.fl_grid_in', '1.9', power('Grid import', 'kW')],
    ['sensor.fl_grid_out', '400', power('Grid export')],

    /* a wide column: where it goes */
    ['sensor.fl_wide_solar', '4.6', power('Solar power', 'kW')],
    ['sensor.fl_wide_grid', '900', power('Grid power')],
    ['sensor.fl_wide_battery', '300', power('Battery power')],
    ['sensor.fl_wide_level', '48', level('Battery')],
    ['sensor.fl_car', '3.7', power('Car', 'kW')],
    ['sensor.fl_heat_pump', '1200', power('Heat pump')],
    ['sensor.fl_wide_house', '5.8', power('House power', 'kW')],

    /* cheap hours and peak price */
    ['sensor.fl_night_solar', '0', power('Solar power')],
    ['sensor.fl_night_grid', '4.2', power('Grid power', 'kW')],
    ['sensor.fl_night_battery', '-3.6', power('Battery power', 'kW')],
    ['sensor.fl_night_level', '38', level('Battery')],
    ['sensor.fl_peak_grid', '-2.1', power('Grid power', 'kW')],
    ['sensor.fl_peak_battery', '3.0', power('Battery power', 'kW')],
    ['sensor.fl_peak_level', '71', level('Battery')],

    /* two roofs, two batteries */
    ['sensor.fl_east', '2.1', power('East roof', 'kW')],
    ['sensor.fl_west', '1.4', power('West roof', 'kW')],
    ['sensor.fl_many_grid', '300', power('Grid power')],
    ['sensor.fl_garage', '-800', power('Garage battery')],
    ['sensor.fl_garage_level', '72', level('Garage')],
    ['sensor.fl_basement', '500', power('Basement battery')],
    ['sensor.fl_basement_level', '40', level('Basement')],

    /* off grid */
    ['sensor.fl_cabin_solar', '0.8', power('Solar power', 'kW')],
    ['sensor.fl_generator', '2.0', power('Generator', 'kW')],
    ['sensor.fl_cabin_battery', '1.4', power('Battery power', 'kW')],
    ['sensor.fl_cabin_level', '64', level('Battery')],

    /* the grid unreadable */
    ['sensor.fl_down_solar', '1.8', power('Solar power', 'kW')],
    ['sensor.fl_down_grid', 'unavailable', power('Grid power')],
    ['sensor.fl_down_battery', '0.9', power('Battery power', 'kW')],
    ['sensor.fl_down_level', '81', level('Battery')],

    /* nothing new for twelve minutes */
    ['sensor.fl_stale_solar', '3.2', power('Solar power', 'kW'), 720],
    ['sensor.fl_stale_grid', '1.5', power('Grid power', 'kW'), 720],
    ['sensor.fl_stale_battery', '-600', power('Battery power'), 720],

    /* the car powers the house */
    ['sensor.fl_v2h_solar', '0', power('Solar power')],
    ['sensor.fl_v2h_grid', '200', power('Grid power')],
    ['sensor.fl_v2h_car', '2.4', power('Car', 'kW')],
    ['sensor.fl_v2h_level', '58', level('Car')],

    /* the Energy dashboard's meters and power sensors */
    ['sensor.fl_grid_in_energy', '4.1', energy('Grid import')],
    ['sensor.fl_grid_out_energy', '1.3', energy('Grid export')],
    ['sensor.fl_solar_energy', '11.2', energy('Solar')],
    ['sensor.fl_battery_out_energy', '2.4', energy('Battery out')],
    ['sensor.fl_battery_in_energy', '3.0', energy('Battery in')],
    ...[...HYBRID_STATES, ...ISSUE_49_STATES].map(
      ([id, state, name]) => [id, state, power(name, 'kW')] as [string, string, Attributes],
    ),
    ...HYBRID_LEVELS.map(
      ([id, state]) => [id, state, level('Battery')] as [string, string, Attributes],
    ),
  ],

  ws: {
    'energy/get_prefs': () => ({
      energy_sources: [
        {
          type: 'grid',
          stat_energy_from: 'sensor.fl_grid_in_energy',
          stat_energy_to: 'sensor.fl_grid_out_energy',
          power_config: { stat_rate_from: 'sensor.fl_grid_in', stat_rate_to: 'sensor.fl_grid_out' },
        },
        { type: 'solar', stat_energy_from: 'sensor.fl_solar_energy', stat_rate: 'sensor.fl_solar' },
        {
          type: 'battery',
          stat_energy_from: 'sensor.fl_battery_out_energy',
          stat_energy_to: 'sensor.fl_battery_in_energy',
          stat_rate: 'sensor.fl_battery',
          stat_soc: 'sensor.fl_battery_level',
          capacity: CAPACITY,
        },
      ],
      device_consumption: [],
    }),
    'recorder/statistics_during_period': (message) => {
      (window.fluvyAsked ??= []).push(message);
      const mean = ((message['types'] as string[] | undefined) ?? []).includes('mean');
      return Object.fromEntries(
        ((message['statistic_ids'] as string[] | undefined) ?? []).map((id) => [
          id,
          mean
            ? powerMeans(id)
            : message['period'] === '5minute'
              ? fiveMinutes(id)
              : (STATS[id] ?? []),
        ]),
      );
    },
  },

  frames: [
    {
      title: 'The #19 house',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          ...house19,
          readouts: [
            { entity: 'sensor.fl_self_use', name: 'Self-powered' },
            { entity: 'sensor.fl_exported', name: 'Exported' },
            { entity: 'sensor.fl_imported', name: 'Imported' },
          ],
        },
      ],
    },
    {
      title: 'Cross',
      cards: [{ type: 'custom:fluvy-energy-flow-card', ...house19, variant: 'cross' }],
    },
    {
      title: 'Import and export, two sensors',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_solar' },
            { type: 'grid', import: 'sensor.fl_grid_in', export: 'sensor.fl_grid_out' },
          ],
          badge: 'grid',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Where it goes',
      width: 776,
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_wide_solar' },
            { type: 'grid', power: 'sensor.fl_wide_grid' },
            { type: 'battery', power: 'sensor.fl_wide_battery', level: 'sensor.fl_wide_level' },
          ],
          consumers: [
            { entity: 'sensor.fl_car', name: 'Car', icon: 'car' },
            { entity: 'sensor.fl_heat_pump', name: 'Heat pump', icon: 'heater' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Where it goes · a phone',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_wide_solar' },
            { type: 'grid', power: 'sensor.fl_wide_grid' },
            { type: 'battery', power: 'sensor.fl_wide_battery', level: 'sensor.fl_wide_level' },
          ],
          consumers: [
            { entity: 'sensor.fl_car', name: 'Car', icon: 'car' },
            { entity: 'sensor.fl_heat_pump', name: 'Heat pump', icon: 'heater' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Cheap hours',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          variant: 'cross',
          subtitle: 'Cheap hours · until 05:00',
          badge: 'grid',
          sources: [
            { type: 'solar', power: 'sensor.fl_night_solar' },
            { type: 'grid', power: 'sensor.fl_night_grid' },
            { type: 'battery', power: 'sensor.fl_night_battery', level: 'sensor.fl_night_level' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Peak price',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          variant: 'cross',
          subtitle: 'Peak price · 0.42 €/kWh',
          sources: [
            { type: 'solar', power: 'sensor.fl_night_solar' },
            { type: 'grid', power: 'sensor.fl_peak_grid' },
            { type: 'battery', power: 'sensor.fl_peak_battery', level: 'sensor.fl_peak_level' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Two roofs, two batteries',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_east', name: 'East roof' },
            { type: 'solar', power: 'sensor.fl_west', name: 'West roof' },
            { type: 'grid', power: 'sensor.fl_many_grid' },
            {
              type: 'battery',
              power: 'sensor.fl_garage',
              level: 'sensor.fl_garage_level',
              name: 'Garage',
            },
            {
              type: 'battery',
              power: 'sensor.fl_basement',
              level: 'sensor.fl_basement_level',
              name: 'Basement',
            },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Off grid',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Cabin',
          subtitle: 'Off grid',
          sources: [
            { type: 'solar', power: 'sensor.fl_cabin_solar' },
            { type: 'generator', power: 'sensor.fl_generator' },
            { type: 'battery', power: 'sensor.fl_cabin_battery', level: 'sensor.fl_cabin_level' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'The grid unreadable',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_down_solar' },
            { type: 'grid', power: 'sensor.fl_down_grid' },
            { type: 'battery', power: 'sensor.fl_down_battery', level: 'sensor.fl_down_level' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Stale',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_stale_solar' },
            { type: 'grid', power: 'sensor.fl_stale_grid' },
            { type: 'battery', power: 'sensor.fl_stale_battery' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'The car powers the house',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          sources: [
            { type: 'solar', power: 'sensor.fl_v2h_solar' },
            { type: 'grid', power: 'sensor.fl_v2h_grid' },
            { type: 'vehicle', power: 'sensor.fl_v2h_car', level: 'sensor.fl_v2h_level' },
          ],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Today',
      cards: [
        {
          type: 'custom:fluvy-energy-flow-card',
          title: 'Today',
          period: 'day',
          badge: 'self_powered',
          _now: NOW,
        },
      ],
    },
    {
      title: 'House power by source',
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          variant: 'sources',
          entity: 'sensor.fl_house',
          name: 'House power',
          _now: NOW,
        },
      ],
    },
    {
      title: 'By source · a hybrid inverter, with power',
      hass: hybridWithPower,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          variant: 'sources',
          _now: NOW,
        },
      ],
    },
    {
      title: 'By source · a hybrid inverter, meters only',
      hass: hybridMetersOnly,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          variant: 'sources',
          _now: NOW,
        },
      ],
    },
    {
      title: 'The whole house',
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          variant: 'overview',
          entity: 'sensor.fl_house',
          _now: NOW,
        },
      ],
    },
    {
      title: 'The whole house · a hybrid inverter, with power',
      hass: hybridWithPower,
      cards: [{ type: 'custom:fluvy-energy-card', variant: 'overview', _now: NOW }],
    },
    {
      title: 'The whole house · heavy export, a low battery',
      hass: hybridHeavyExport,
      cards: [{ type: 'custom:fluvy-energy-card', variant: 'overview', _now: NOW }],
    },
    {
      title: 'The whole house · meters only',
      hass: hybridMetersOnly,
      cards: [{ type: 'custom:fluvy-energy-card', variant: 'overview', _now: NOW }],
    },
    {
      title: 'The whole house · two batteries without their capacity',
      hass: hybridTwoBatteries,
      cards: [{ type: 'custom:fluvy-energy-card', variant: 'overview', _now: NOW }],
    },
    {
      title: 'The whole house · no battery, no house line',
      hass: hybridNoBattery,
      cards: [
        { type: 'custom:fluvy-energy-card', variant: 'overview', show_house: false, _now: NOW },
      ],
    },
    {
      title: 'Distribution · what is not measured',
      cards: [
        {
          type: 'custom:fluvy-distribution-card',
          title: 'Where it goes',
          total: 'sensor.fl_wide_house',
          entities: [
            { entity: 'sensor.fl_car', name: 'Car' },
            { entity: 'sensor.fl_heat_pump', name: 'Heat pump' },
          ],
        },
      ],
    },
    {
      title: 'From the Energy dashboard',
      cards: [{ type: 'custom:fluvy-energy-flow-card', _now: NOW }],
    },
    {
      title: 'Rail',
      cards: [{ type: 'custom:fluvy-energy-flow-card', ...house19, flow_style: 'rail' }],
    },
    {
      title: 'Legs',
      cards: [{ type: 'custom:fluvy-energy-flow-card', ...house19, flow_style: 'legs' }],
    },
    {
      title: 'Still',
      cards: [{ type: 'custom:fluvy-energy-flow-card', ...house19, motion: 'off' }],
    },
    {
      title: 'A desktop column',
      width: 392,
      cards: [{ type: 'custom:fluvy-energy-flow-card', ...house19 }],
    },
    {
      title: 'The narrowest column',
      width: 328,
      cards: [{ type: 'custom:fluvy-energy-flow-card', ...house19 }],
    },
    {
      title: 'Half a column',
      cards: [
        { type: 'custom:fluvy-energy-flow-card', ...house19, title: 'Energy', cols: 6 },
        {
          type: 'custom:fluvy-energy-flow-card',
          ...house19,
          title: 'Energy',
          variant: 'list',
          cols: 6,
        },
      ],
    },
    /* issue #49: the whole house with its scales and gridlines, at the width of the reporter's screenshot */
    {
      title: 'Issue #49 · the whole house, scaled',
      width: 887,
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Issue #49 · a phone',
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Issue #49 · each source from zero, thin lines',
      width: 887,
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          stack: false,
          line_width: 'thin',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Issue #49 · each source from zero · a phone',
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          stack: false,
          _now: NOW,
        },
      ],
    },
    {
      title: 'Issue #49 · thin lines · a phone',
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          line_width: 'thin',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Issue #49 · half a column',
      width: 532,
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          _now: NOW,
          cols: 6,
        },
      ],
    },
    {
      title: 'Issue #49 · by source',
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'sources',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Issue #49 · no scale, no gridlines',
      hass: hybridIssue49,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          entity: 'sensor.i49_house',
          variant: 'overview',
          show_axis: false,
          show_grid: false,
          _now: NOW,
        },
      ],
    },
    /* an unavailable or missing sensor keeps the card's size (A7) */
    {
      title: 'Energy · live and unavailable',
      width: 776,
      cards: [
        { type: 'custom:fluvy-energy-card', entity: 'sensor.fl_house', _now: NOW, cols: 6 },
        { type: 'custom:fluvy-energy-card', entity: 'sensor.fl_down_grid', _now: NOW, cols: 6 },
      ],
    },
    {
      title: 'Energy · live and not found',
      width: 776,
      cards: [
        { type: 'custom:fluvy-energy-card', entity: 'sensor.fl_house', _now: NOW, cols: 6 },
        { type: 'custom:fluvy-energy-card', entity: 'sensor.fl_nowhere', _now: NOW, cols: 6 },
      ],
    },
    {
      title: 'The whole house · live and unavailable',
      width: 776,
      cards: [
        {
          type: 'custom:fluvy-energy-card',
          variant: 'overview',
          entity: 'sensor.fl_house',
          _now: NOW,
          cols: 6,
        },
        {
          type: 'custom:fluvy-energy-card',
          variant: 'overview',
          entity: 'sensor.fl_down_grid',
          _now: NOW,
          cols: 6,
        },
      ],
    },
  ],
};
