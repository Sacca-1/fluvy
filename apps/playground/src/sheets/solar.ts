import { FluvyBarsCard } from '../../../../packages/cards/src/bars/bars-card.js';
import { FluvyDistributionCard } from '../../../../packages/cards/src/distribution/distribution-card.js';
import { FluvyGaugeCard } from '../../../../packages/cards/src/gauge/gauge-card.js';
import { FluvyHumidityCard } from '../../../../packages/cards/src/humidity/humidity-card.js';
import { FluvyProductionCard } from '../../../../packages/cards/src/production/production-card.js';
import { FluvyStatTilesCard } from '../../../../packages/cards/src/stat-tiles/stat-tiles-card.js';
import type { SheetSpec } from '../scenes.js';
import './energy.js'; // the 12-hour stand-in

/* The lead registers these in `packages/cards/src/index.ts`; here they are defined for the playground only. */
if (!customElements.get('fluvy-gauge-card'))
  customElements.define('fluvy-gauge-card', FluvyGaugeCard);
if (!customElements.get('fluvy-stat-tiles-card'))
  customElements.define('fluvy-stat-tiles-card', FluvyStatTilesCard);
if (!customElements.get('fluvy-production-card'))
  customElements.define('fluvy-production-card', FluvyProductionCard);
if (!customElements.get('fluvy-bars-card')) customElements.define('fluvy-bars-card', FluvyBarsCard);
if (!customElements.get('fluvy-distribution-card'))
  customElements.define('fluvy-distribution-card', FluvyDistributionCard);
if (!customElements.get('fluvy-humidity-card'))
  customElements.define('fluvy-humidity-card', FluvyHumidityCard);

/* Every id carries `so_`: other sheets own `sensor.solar_power` and `sensor.living_humidity` with other units. */
const W = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
const KW = { unit_of_measurement: 'kW', device_class: 'power', state_class: 'measurement' };
const KWH = { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' };
const PCT = { unit_of_measurement: '%' };
const CELSIUS = { unit_of_measurement: '°C', device_class: 'temperature' };
const HUMIDITY = { unit_of_measurement: '%', device_class: 'humidity' };
const MOISTURE = { unit_of_measurement: '%', device_class: 'moisture' };
const BATTERY = { unit_of_measurement: '%', device_class: 'battery' };

const HOUR = 3_600_000;

/* The design sheet's day, frozen at 14:12: what each finished hour produced, 0.5 kWh into the hour in progress. */
const SHEET_NOW = '2026-09-17T14:12:00';
const PRODUCED = [0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.5, 1.0, 1.5, 2.0, 2.9, 2.5];
const IN_PROGRESS = 0.5;
/** The sheet's forecast, hour by hour (Σ 18.4). Up to 14:12 it expected 10.55, which the day beat by 6 %. */
const FORECAST = [
  0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.45, 0.9, 1.4, 1.9, 2.7, 2.4, 2.5, 2.0, 1.6, 1.2, 0.7, 0.3, 0, 0, 0,
  0,
];

/** A day of solar power in W, half-hourly: min 400, max 4100, average 1388 → 0.4 / 4.1 / 1.4 kW. */
const POWER_DAY = [
  400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 600, 900, 1300, 1700, 2100, 2500,
  2900, 3300, 3700, 4100, 4000, 3900, 3800, 3600, 3400, 3100, 2800, 2400, 2000, 1600, 1200, 900,
  700, 500, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400,
];

/** The same day read off the meter every minute from midnight to 14:12, for the card that has no statistics. */
const METER = Array.from({ length: 853 }, (_unused, index) => {
  const hours = index / 60;
  const whole = Math.floor(hours);
  const done = PRODUCED.slice(0, whole).reduce((total, value) => total + value, 0);
  const running =
    whole < PRODUCED.length
      ? (PRODUCED[whole] ?? 0) * (hours - whole)
      : IN_PROGRESS * Math.min(1, (hours - whole) / 0.2);
  return Math.round((done + running) * 1000) / 1000;
});

interface Row {
  start: number;
  end: number;
  change: number;
  state: number;
}

/** Hourly statistics rows for the day the request asks about: `hours` maps an hour to what it produced, a missing hour has no row. */
const rows = (
  message: Record<string, unknown>,
  hours: Record<number, number>,
  opening = 0,
): Row[] => {
  const midnight = new Date(String(message['start_time'])).getTime() + HOUR; // the card asks from 23:00 the evening before
  let state = opening;
  const out: Row[] = [{ start: midnight - HOUR, end: midnight, change: 0, state }];
  for (const [hour, change] of Object.entries(hours)
    .map(([key, value]) => [Number(key), value] as const)
    .sort((a, b) => a[0] - b[0])) {
    state = Math.round((state + change) * 1000) / 1000;
    out.push({ start: midnight + hour * HOUR, end: midnight + (hour + 1) * HOUR, change, state });
  }
  return out;
};

const STATISTICS: Record<string, (message: Record<string, unknown>) => Row[]> = {
  'sensor.so_energy_today': (message) =>
    rows(message, Object.fromEntries(PRODUCED.map((value, hour) => [hour, value]))),
  // before sunrise: five finished hours, nothing in any of them
  'sensor.so_energy_dawn': (message) => rows(message, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }),
  // an inverter that sleeps at night leaves no rows for those hours; a lifetime meter in Wh
  'sensor.so_energy_lifetime': (message) =>
    rows(
      message,
      {
        7: 300,
        8: 900,
        9: 1800,
        10: 2600,
        11: 3300,
        12: 3900,
        13: 3700,
        14: 3100,
        15: 2300,
        16: 1200,
        17: 350,
      },
      15_234_000,
    ),
};

export const sheet: SheetSpec = {
  states: [
    ['sensor.so_solar_power', '3200', { friendly_name: 'Solar power', ...W }],
    ['sensor.so_solar_power_night', '0', { friendly_name: 'Solar power', ...W }],
    ['sensor.so_solar_power_dead', 'unavailable', { friendly_name: 'Solar power', ...W }],
    ['sensor.so_solar_power_unknown', 'unknown', { friendly_name: 'Solar power', ...W }],
    ['sensor.so_solar_capacity', '5.4', { friendly_name: 'Rated power', ...KW }],
    [
      'sensor.so_wind_speed',
      '27.4',
      { friendly_name: 'Wind', unit_of_measurement: 'km/h', device_class: 'wind_speed' },
    ],
    [
      'input_number.so_tank',
      '640',
      { friendly_name: 'Rain tank', unit_of_measurement: 'L', min: 0, max: 1000, step: 10 },
    ],

    ['sensor.so_grid_export', '250', { friendly_name: 'Grid export', ...W }],
    ['sensor.so_battery_charge', '1.1', { friendly_name: 'To battery', ...KW }],
    ['sensor.so_self_use', '88', { friendly_name: 'Self-use', ...PCT }],
    ['sensor.so_health', '92', { friendly_name: 'Health', ...PCT }],
    ['sensor.so_co2', '142', { friendly_name: 'CO₂ avoided', unit_of_measurement: 'kg' }],
    ['sensor.so_battery_level', '64', { friendly_name: 'Home battery', ...BATTERY }],
    ['sensor.so_battery_power_dead', 'unavailable', { friendly_name: 'Battery power', ...W }],

    ['sensor.so_energy_today', '11.2', { friendly_name: 'Production', ...KWH }],
    ['sensor.so_energy_nostats', '0', { friendly_name: 'Production', ...KWH }],
    ['sensor.so_energy_history', '11.2', { friendly_name: 'Production', ...KWH }],
    ['sensor.so_energy_dawn', '0', { friendly_name: 'Production', ...KWH }],
    [
      'sensor.so_energy_lifetime',
      'unavailable',
      {
        friendly_name: 'Production',
        unit_of_measurement: 'Wh',
        device_class: 'energy',
        state_class: 'total_increasing',
      },
    ],
    [
      'sensor.so_forecast_today',
      '18.4',
      { friendly_name: 'Forecast today', ...KWH, hourly: FORECAST },
    ],
    ['sensor.so_forecast_total', '18.4', { friendly_name: 'Forecast today', ...KWH }],
    ['sensor.so_peak_today', '4100', { friendly_name: 'Peak today', ...W }],

    ['sensor.so_string_east', '1400', { friendly_name: 'East', ...W }],
    ['sensor.so_string_south', '1.5', { friendly_name: 'South', ...KW }],
    ['sensor.so_string_west', '300', { friendly_name: 'West', ...W }],
    ['sensor.so_string_north', 'unavailable', { friendly_name: 'North', ...W }],
    ['sensor.so_string_east_temperature', '38', { friendly_name: 'East temperature', ...CELSIUS }],
    [
      'sensor.so_string_south_temperature',
      '41',
      { friendly_name: 'South temperature', ...CELSIUS },
    ],
    ['sensor.so_string_west_note', 'Shaded until 14:30', { friendly_name: 'West shading' }],
    ['sensor.so_inverter_power', '3200', { friendly_name: 'Inverter', ...W }],
    ['sensor.so_inverter_note', '41 °C · 97 % efficiency', { friendly_name: 'Inverter status' }],

    ['sensor.so_heat_pump_power', '900', { friendly_name: 'Heat pump', ...W }],
    ['sensor.so_dishwasher_power', '1.4', { friendly_name: 'Dishwasher', ...KW }],
    ['sensor.so_media_power', '100', { friendly_name: 'Media', ...W }],
    ['sensor.so_fridge_power', '100', { friendly_name: 'Fridge', ...W }],
    ['sensor.so_oven_power', '2100', { friendly_name: 'Oven', ...W }],
    ['sensor.so_washer_power', '650', { friendly_name: 'Washing machine', ...W }],
    ['sensor.so_dryer_power', '480', { friendly_name: 'Dryer', ...W }],
    ['sensor.so_server_power', '95', { friendly_name: 'Server', ...W }],
    ['sensor.so_lights_power', '60', { friendly_name: 'Lights', ...W }],
    ['sensor.so_idle_power', '0', { friendly_name: 'Workshop', ...W }],
    ['sensor.so_kettle_power', 'unavailable', { friendly_name: 'Kettle', ...W }],
    ['sensor.so_charger_power', '7.4', { friendly_name: 'Car charger', ...KW }],
    [
      'sensor.so_long_name_power',
      '1.2',
      { friendly_name: 'Car charger in the garage under the stairs', ...KW },
    ],

    ['sensor.so_living_humidity', '46', { friendly_name: 'Humidity', ...HUMIDITY }],
    [
      'sensor.so_living_temperature',
      '21.5',
      { friendly_name: 'Living room temperature', ...CELSIUS },
    ],
    ['sensor.so_cellar_humidity', '82', { friendly_name: 'Humidity', ...HUMIDITY }],
    ['sensor.so_study_humidity', '18', { friendly_name: 'Humidity', ...HUMIDITY }],
    ['sensor.so_attic_humidity', 'unavailable', { friendly_name: 'Humidity', ...HUMIDITY }],
    ['sensor.so_porch_humidity', 'unknown', { friendly_name: 'Humidity', ...HUMIDITY }],
    [
      'humidifier.so_living',
      'on',
      { friendly_name: 'Humidifier', humidity: 50, min_humidity: 30, max_humidity: 80 },
    ],
    [
      'humidifier.so_cellar',
      'off',
      { friendly_name: 'Dehumidifier', humidity: 55, device_class: 'dehumidifier' },
    ],
    ['switch.so_attic_humidifier', 'unavailable', { friendly_name: 'Attic humidifier' }],

    ['sensor.so_plant_monstera', '62', { friendly_name: 'Monstera', ...MOISTURE }],
    ['sensor.so_plant_ficus', '18', { friendly_name: 'Ficus', ...MOISTURE }],
    ['sensor.so_plant_basil', '45', { friendly_name: 'Basil', ...MOISTURE }],
    ['sensor.so_plant_olive', '38', { friendly_name: 'Olive', ...MOISTURE }],
    ['sensor.so_remote_battery', '12', { friendly_name: 'Living room remote', ...BATTERY }],
    ['sensor.so_door_battery', '9', { friendly_name: 'Front door sensor', ...BATTERY }],
    ['sensor.so_thermostat_battery', '74', { friendly_name: 'Thermostat', ...BATTERY }],
  ],

  history: {
    'sensor.so_solar_power': POWER_DAY,
    'sensor.so_solar_power_night': [0, 0, 0, 0, 0, 0, 0, 0],
    'sensor.so_wind_speed': [8, 11, 9, 14, 19, 23, 31, 38, 35, 29, 27.4],
    'input_number.so_tank': [420, 420, 480, 560, 640, 640],
    'sensor.so_energy_history': METER,
    'sensor.so_living_humidity': [43, 43, 44, 44, 45, 45, 46],
    'sensor.so_cellar_humidity': [88, 87, 86, 85, 84, 83, 82],
    'sensor.so_study_humidity': [18, 18, 18, 18],
  },

  ws: {
    'recorder/statistics_during_period': (message) => {
      const id = ((message['statistic_ids'] as string[] | undefined) ?? [])[0] ?? '';
      const answer = STATISTICS[id];
      return answer ? { [id]: answer(message) } : {}; // no long-term statistics for anything else
    },
  },

  frames: [
    /* ---- the seven cards of the design sheet, with the sheet's own numbers ---- */
    {
      title: 'Solar power',
      cards: [
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power',
          icon: 'sun',
          subtitle: 'South roof · 5.4 kWp',
          max_entity: 'sensor.so_solar_capacity',
        },
      ],
    },
    // the reading over a level bar, for a half column
    {
      title: 'Gauge · bar',
      width: 392,
      cards: [
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power',
          icon: 'sun',
          variant: 'bar',
          subtitle: 'South roof · 5.4 kWp',
          max_entity: 'sensor.so_solar_capacity',
        },
      ],
    },
    {
      title: 'Total capacity',
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Total capacity',
          subtitle: '18 panels · 5.4 kWp',
          icon: 'bolt',
          tone: 'solar',
          badge_entity: 'sensor.so_health',
          badge_label: 'Health',
          tiles: [
            {
              entity: 'sensor.so_solar_power',
              name: 'Solar output',
              icon: 'sun',
              tone: 'solar',
              highlight: true,
            },
            { entity: 'sensor.so_grid_export', name: 'Grid export', icon: 'bolt', tone: 'grid' },
            { entity: 'sensor.so_self_use', name: 'Self-use', icon: 'home', tone: 'accent' },
            {
              entity: 'sensor.so_battery_charge',
              name: 'To battery',
              icon: 'battery',
              tone: 'water',
            },
          ],
          rows: [{ entity: 'sensor.so_co2', icon: 'leaf', secondary: 'This month' }],
        },
      ],
    },
    {
      title: 'Production',
      cards: [
        {
          type: 'custom:fluvy-production-card',
          entity: 'sensor.so_energy_today',
          forecast_entity: 'sensor.so_forecast_today',
          peak_entity: 'sensor.so_peak_today',
          _now: SHEET_NOW,
        },
      ],
    },
    // the head, the bars and their axis: half a section
    {
      title: 'Production · compact',
      width: 392,
      cards: [
        {
          type: 'custom:fluvy-production-card',
          entity: 'sensor.so_energy_today',
          forecast_entity: 'sensor.so_forecast_today',
          variant: 'compact',
          _now: SHEET_NOW,
        },
      ],
    },
    {
      title: 'Strings & inverter',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Strings & inverter',
          subtitle: 'SolarEdge · 3 strings',
          icon: 'sliders',
          tone: 'solar',
          badge_warn: '{count} shaded',
          rows: [
            {
              entity: 'sensor.so_string_east',
              icon: 'sun',
              tone: 'solar',
              sub: '6 panels',
              sub_entity: 'sensor.so_string_east_temperature',
              max: 1800,
              low: 500,
            },
            {
              entity: 'sensor.so_string_south',
              icon: 'sun',
              tone: 'solar',
              sub: '8 panels',
              sub_entity: 'sensor.so_string_south_temperature',
              max: 2.42,
              low: 0.5,
            },
            {
              entity: 'sensor.so_string_west',
              icon: 'sun',
              tone: 'solar',
              sub: '4 panels',
              sub_entity: 'sensor.so_string_west_note',
              max: 1360,
              low: 500,
            },
            {
              entity: 'sensor.so_inverter_power',
              icon: 'bolt',
              tone: 'solar',
              plain: true,
              sub_entity: 'sensor.so_inverter_note',
            },
          ],
        },
      ],
    },
    {
      title: 'Distribution',
      cards: [
        {
          type: 'custom:fluvy-distribution-card',
          entities: [
            'sensor.so_heat_pump_power',
            'sensor.so_dishwasher_power',
            'sensor.so_media_power',
            'sensor.so_fridge_power',
          ],
        },
      ],
    },
    // a row per source, its share under its name; a source can wear its own colour
    {
      title: 'Distribution · rows',
      cards: [
        {
          type: 'custom:fluvy-distribution-card',
          variant: 'rows',
          entities: [
            'sensor.so_heat_pump_power',
            'sensor.so_dishwasher_power',
            { entity: 'sensor.so_media_power', color: 'teal' },
            'sensor.so_fridge_power',
          ],
        },
      ],
    },
    {
      title: 'Humidity',
      cards: [
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_living_humidity',
          subtitle: 'Living room',
          temperature_entity: 'sensor.so_living_temperature',
          humidifier_entity: 'humidifier.so_living',
        },
      ],
    },
    // the band and its humidifier, no trend
    {
      title: 'Humidity · no trend',
      cards: [
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_living_humidity',
          show_trend: false,
          humidifier_entity: 'humidifier.so_living',
        },
      ],
    },
    {
      title: 'Plants',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Plants',
          subtitle: '4 plants · Living room',
          icon: 'leaf',
          badge_warn: '{count} dry',
          rows: [
            { entity: 'sensor.so_plant_monstera', sub: 'Watered 3 days ago' },
            { entity: 'sensor.so_plant_ficus', sub: 'Water today' },
            { entity: 'sensor.so_plant_basil', sub: 'Watered yesterday' },
            { entity: 'sensor.so_plant_olive', sub: 'Watered 6 days ago' },
          ],
        },
      ],
    },

    /* ---- the hard states ---- */
    {
      title: 'Gauge · night and no scale',
      cards: [
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power_night',
          icon: 'sun',
          subtitle: 'South roof · 5.4 kWp',
          max: 5400,
        },
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power_night',
          icon: 'sun',
          name: 'No ceiling',
        },
      ],
    },
    {
      title: 'Gauge · unavailable, unknown, missing',
      cards: [
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power_dead',
          icon: 'sun',
          subtitle: 'South roof · 5.4 kWp',
          max: 5400,
        },
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power_unknown',
          icon: 'sun',
          subtitle: 'South roof · 5.4 kWp',
          max: 5400,
        },
        { type: 'custom:fluvy-gauge-card', entity: 'sensor.so_not_there' },
      ],
    },
    {
      title: 'Gauge · any sensor',
      cards: [
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power',
          icon: 'sun',
          name: 'Derived ceiling',
          hours: 12,
        },
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_wind_speed',
          icon: 'wind',
          tone: 'cool',
          subtitle: 'Roof mast',
          max: 120,
          badge: 'Fresh breeze',
        },
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'input_number.so_tank',
          icon: 'drop',
          tone: 'water',
          label: 'Level',
        },
      ],
    },
    {
      title: 'Tiles · readout, odd count, a dead tile',
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          entity: 'sensor.so_energy_today',
          name: 'Produced today',
          title: 'Solar',
          subtitle: 'South roof',
          icon: 'sun',
          tone: 'solar',
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output', icon: 'sun', highlight: true },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
            { entity: 'sensor.so_battery_power_dead', name: 'Battery power' },
          ],
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Battery',
          tiles: ['sensor.so_battery_power_dead', 'sensor.so_not_there'],
          rows: ['sensor.so_battery_power_dead'],
        },
      ],
    },
    {
      title: 'Production · no statistics, history only',
      cards: [
        {
          type: 'custom:fluvy-production-card',
          entity: 'sensor.so_energy_nostats',
          title: 'Production',
          _now: SHEET_NOW,
        },
        {
          type: 'custom:fluvy-production-card',
          entity: 'sensor.so_energy_history',
          title: 'Production',
          forecast_entity: 'sensor.so_forecast_total',
          _now: SHEET_NOW,
        },
      ],
    },
    {
      title: 'Production · 12-hour clock',
      cards: [
        {
          type: 'pg-twelve-hour',
          card: 'fluvy-production-card',
          entity: 'sensor.so_energy_today',
          forecast_entity: 'sensor.so_forecast_today',
          peak_entity: 'sensor.so_peak_today',
          _now: SHEET_NOW,
        },
      ],
    },
    {
      title: 'Production · before sunrise, inverter asleep',
      cards: [
        {
          type: 'custom:fluvy-production-card',
          entity: 'sensor.so_energy_dawn',
          title: 'Production',
          forecast_entity: 'sensor.so_forecast_today',
          _now: '2026-09-17T05:40:00',
        },
        {
          type: 'custom:fluvy-production-card',
          entity: 'sensor.so_energy_lifetime',
          title: 'Production',
          _now: '2026-09-17T22:30:00',
        },
        { type: 'custom:fluvy-production-card', entity: 'sensor.so_not_there' },
      ],
    },
    {
      title: 'Bars · one row, a dead row, batteries',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Plants',
          subtitle: 'Kitchen',
          icon: 'leaf',
          badge_warn: '{count} dry',
          rows: [{ entity: 'sensor.so_plant_basil', sub: 'Watered yesterday' }],
        },
        {
          type: 'custom:fluvy-bars-card',
          title: 'Strings',
          subtitle: 'No ceilings set',
          icon: 'sliders',
          tone: 'solar',
          rows: [
            { entity: 'sensor.so_string_east', icon: 'sun', tone: 'solar', sub: '6 panels' },
            { entity: 'sensor.so_string_south', icon: 'sun', tone: 'solar', sub: '8 panels' },
            { entity: 'sensor.so_string_north', icon: 'sun', tone: 'solar', sub: '5 panels' },
            { entity: 'sensor.so_not_there', name: 'Carport' },
          ],
        },
        {
          type: 'custom:fluvy-bars-card',
          title: 'Batteries',
          icon: 'battery',
          rows: [
            'sensor.so_remote_battery',
            'sensor.so_door_battery',
            'sensor.so_thermostat_battery',
          ],
        },
      ],
    },
    {
      title: 'Distribution · nine loads, nothing, the dead',
      cards: [
        {
          type: 'custom:fluvy-distribution-card',
          entities: [
            'sensor.so_oven_power',
            'sensor.so_dishwasher_power',
            'sensor.so_heat_pump_power',
            'sensor.so_washer_power',
            'sensor.so_dryer_power',
            'sensor.so_media_power',
            'sensor.so_fridge_power',
            'sensor.so_server_power',
            'sensor.so_lights_power',
          ],
        },
        { type: 'custom:fluvy-distribution-card', entities: ['sensor.so_idle_power'] },
        {
          type: 'custom:fluvy-distribution-card',
          title: 'Garage',
          entities: [
            { entity: 'sensor.so_charger_power', tone: 'accent' },
            'sensor.so_kettle_power',
            { entity: 'sensor.so_idle_power', name: 'Workshop' },
            'sensor.so_server_power',
          ],
        },
        {
          type: 'custom:fluvy-distribution-card',
          entities: ['sensor.so_kettle_power', 'sensor.so_not_there'],
        },
      ],
    },
    {
      title: 'Distribution · a name that cannot fit (ellipsis by design)',
      measure: false,
      cards: [
        {
          type: 'custom:fluvy-distribution-card',
          entities: ['sensor.so_long_name_power', 'sensor.so_server_power'],
        },
      ],
    },
    {
      title: 'Humidity · dry, humid, bare',
      cards: [
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_study_humidity',
          subtitle: 'Study',
          temperature_entity: 'sensor.so_living_temperature',
        },
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_cellar_humidity',
          subtitle: 'Cellar',
          humidifier_entity: 'humidifier.so_cellar',
        },
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_living_humidity',
          subtitle: 'Narrow band',
          low: 45,
          high: 50,
          trend_hours: 0,
        },
      ],
    },
    {
      title: 'Humidity · unavailable, unknown, missing',
      cards: [
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_attic_humidity',
          subtitle: 'Attic',
          temperature_entity: 'sensor.so_living_temperature',
          humidifier_entity: 'switch.so_attic_humidifier',
        },
        {
          type: 'custom:fluvy-humidity-card',
          entity: 'sensor.so_porch_humidity',
          subtitle: 'Porch',
          trend_hours: 0,
        },
        { type: 'custom:fluvy-humidity-card', entity: 'sensor.so_not_there' },
      ],
    },

    /* ---- the compact variants (1.5): bars at 48 a row, stat tiles at 64 three a row ---- */
    {
      title: 'Bars · compact',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Strings & inverter',
          subtitle: 'SolarEdge · 3 strings',
          icon: 'sliders',
          tone: 'solar',
          variant: 'compact',
          badge_warn: '{count} shaded',
          rows: [
            { entity: 'sensor.so_string_east', icon: 'sun', tone: 'solar', max: 1800, low: 500 },
            { entity: 'sensor.so_string_south', icon: 'sun', tone: 'solar', max: 2.42, low: 0.5 },
            { entity: 'sensor.so_string_west', icon: 'sun', tone: 'solar', max: 1360, low: 500 },
            { entity: 'sensor.so_inverter_power', icon: 'bolt', tone: 'solar', plain: true },
          ],
        },
      ],
    },
    {
      title: 'Bars · compact · desktop',
      width: 392,
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Plants',
          subtitle: '4 plants · Living room',
          icon: 'leaf',
          variant: 'compact',
          badge_warn: '{count} dry',
          rows: [
            'sensor.so_plant_monstera',
            'sensor.so_plant_ficus',
            'sensor.so_plant_basil',
            'sensor.so_plant_olive',
          ],
        },
      ],
    },
    // two compact cards side by side: the rows give their circles to the names, which read whole; the values and
    // the bars never give way
    {
      title: 'Bars · compact · half a column',
      width: 360, // the sheet's own width: two 172 cards (a half column shrinks with a narrower frame)
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Plants',
          icon: 'leaf',
          variant: 'compact',
          rows: ['sensor.so_plant_monstera', 'sensor.so_plant_ficus', 'sensor.so_plant_basil'],
          cols: 6,
        },
        {
          type: 'custom:fluvy-bars-card',
          title: 'Batteries',
          icon: 'battery',
          variant: 'compact',
          rows: [
            'sensor.so_remote_battery',
            'sensor.so_door_battery',
            'sensor.so_thermostat_battery',
          ],
          cols: 6,
        },
      ],
    },
    {
      title: 'Bars · compact · a dead row, an unknown one, a missing one, many rows',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Strings',
          subtitle: 'No ceilings set',
          icon: 'sliders',
          tone: 'solar',
          variant: 'compact',
          rows: [
            { entity: 'sensor.so_string_east', icon: 'sun', tone: 'solar' },
            { entity: 'sensor.so_string_south', icon: 'sun', tone: 'solar' },
            { entity: 'sensor.so_string_north', icon: 'sun', tone: 'solar' },
            { entity: 'sensor.so_solar_power_unknown', name: 'Carport', icon: 'sun' },
            { entity: 'sensor.so_not_there', name: 'Shed' },
            { entity: 'sensor.so_inverter_power', icon: 'bolt', tone: 'solar', plain: true },
          ],
        },
        {
          type: 'custom:fluvy-bars-card',
          title: 'Levels',
          icon: 'sliders',
          variant: 'compact',
          rows: [
            'sensor.so_remote_battery',
            'sensor.so_door_battery',
            'sensor.so_thermostat_battery',
            'sensor.so_battery_level',
            'sensor.so_plant_monstera',
            'sensor.so_plant_ficus',
            'sensor.so_plant_basil',
            'sensor.so_plant_olive',
          ],
        },
      ],
    },
    // a plain row is 60 among the 76 bar rows, and the card knows it
    {
      title: 'Bars · plain rows among bar rows',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Inverter',
          subtitle: 'Strings and totals',
          icon: 'bolt',
          tone: 'solar',
          rows: [
            {
              entity: 'sensor.so_string_east',
              icon: 'sun',
              tone: 'solar',
              sub: '6 panels',
              max: 1800,
            },
            {
              entity: 'sensor.so_inverter_power',
              icon: 'bolt',
              plain: true,
              sub_entity: 'sensor.so_inverter_note',
            },
            {
              entity: 'sensor.so_string_south',
              icon: 'sun',
              tone: 'solar',
              sub: '8 panels',
              max: 2.42,
            },
            {
              entity: 'sensor.so_grid_export',
              icon: 'bolt',
              tone: 'grid',
              plain: true,
              sub: 'To the grid',
            },
          ],
        },
      ],
    },
    {
      title: 'Tiles · compact',
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Total capacity',
          subtitle: '18 panels · 5.4 kWp',
          icon: 'bolt',
          tone: 'solar',
          variant: 'compact',
          badge_entity: 'sensor.so_health',
          badge_label: 'Health',
          tiles: [
            {
              entity: 'sensor.so_solar_power',
              name: 'Solar output',
              tone: 'solar',
              highlight: true,
            },
            { entity: 'sensor.so_grid_export', name: 'Grid export' },
            { entity: 'sensor.so_self_use', name: 'Self-use' },
            { entity: 'sensor.so_battery_charge', name: 'To battery' },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
            { entity: 'sensor.so_co2', name: 'CO₂ avoided' },
          ],
          rows: [
            { entity: 'sensor.so_energy_today', name: 'Produced today', icon: 'sun' },
            { entity: 'sensor.so_co2', icon: 'leaf', secondary: 'This month' },
          ],
        },
      ],
    },
    // auto: three a row, four as two by two, two when a label would not fit three
    {
      title: 'Tiles · compact · three, four, long labels',
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Solar',
          variant: 'compact',
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output', highlight: true },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
            { entity: 'sensor.so_battery_charge', name: 'To battery' },
          ],
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Solar',
          variant: 'compact',
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output' },
            { entity: 'sensor.so_grid_export', name: 'Export' },
            { entity: 'sensor.so_self_use', name: 'Self-use' },
            { entity: 'sensor.so_battery_charge', name: 'To battery' },
          ],
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'House',
          variant: 'compact',
          tiles: [
            { entity: 'sensor.so_washer_power', name: 'Washing machine' },
            { entity: 'sensor.so_long_name_power', name: 'Car charger in the garage' },
            { entity: 'sensor.so_heat_pump_power', name: 'Heat pump' },
          ],
        },
      ],
    },
    // columns asked for: three with names that end in an ellipsis, two with a wider last tile, three full tiles
    {
      title: 'Tiles · compact · columns asked for',
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'House',
          variant: 'compact',
          columns: 3,
          tiles: [
            { entity: 'sensor.so_washer_power', name: 'Washing machine' },
            { entity: 'sensor.so_long_name_power', name: 'Car charger in the garage' },
            { entity: 'sensor.so_heat_pump_power', name: 'Heat pump' },
          ],
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Solar',
          variant: 'compact',
          columns: 2,
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output' },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
            { entity: 'sensor.so_battery_charge', name: 'To battery' },
          ],
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Solar',
          columns: 3,
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output', icon: 'sun', highlight: true },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
            { entity: 'sensor.so_battery_charge', name: 'To battery', icon: 'battery' },
          ],
        },
      ],
    },
    {
      title: 'Tiles · compact · desktop',
      width: 392,
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Total capacity',
          subtitle: '18 panels · 5.4 kWp',
          icon: 'bolt',
          tone: 'solar',
          variant: 'compact',
          tiles: [
            {
              entity: 'sensor.so_solar_power',
              name: 'Solar output',
              tone: 'solar',
              highlight: true,
            },
            { entity: 'sensor.so_grid_export', name: 'Grid export' },
            { entity: 'sensor.so_self_use', name: 'Self-use' },
            { entity: 'sensor.so_battery_charge', name: 'To battery' },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
          ],
          rows: [{ entity: 'sensor.so_co2', icon: 'leaf' }],
        },
      ],
    },
    {
      title: 'Tiles · compact · half a column',
      width: 360, // the sheet's own width: two 172 cards (a half column shrinks with a narrower frame)
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Solar',
          variant: 'compact',
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output', highlight: true },
            { entity: 'sensor.so_battery_level', name: 'Battery' },
            { entity: 'sensor.so_battery_charge', name: 'To battery' },
          ],
          cols: 6,
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          title: 'Battery',
          variant: 'compact',
          tiles: ['sensor.so_battery_level', 'sensor.so_battery_power_dead'],
          rows: ['sensor.so_battery_power_dead'],
          cols: 6,
        },
      ],
    },
    {
      title: 'Tiles · compact · readout, a dead tile, a missing tile, dead rows',
      cards: [
        {
          type: 'custom:fluvy-stat-tiles-card',
          entity: 'sensor.so_energy_today',
          name: 'Produced today',
          title: 'Solar',
          subtitle: 'South roof',
          icon: 'sun',
          tone: 'solar',
          variant: 'compact',
          tiles: [
            { entity: 'sensor.so_solar_power', name: 'Output', highlight: true },
            { entity: 'sensor.so_battery_power_dead', name: 'Battery power' },
            { entity: 'sensor.so_not_there', name: 'Carport' },
          ],
          rows: [
            'sensor.so_battery_power_dead',
            { entity: 'sensor.so_solar_power_unknown', name: 'Carport' },
            { entity: 'sensor.so_not_there', name: 'Shed' },
          ],
        },
      ],
    },
    // the bar at its own size: half a section
    {
      title: 'Gauge · bar · half a section',
      cards: [
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power',
          icon: 'sun',
          variant: 'bar',
          subtitle: 'South roof · 5.4 kWp',
          max_entity: 'sensor.so_solar_capacity',
          cols: 6,
        },
        {
          type: 'custom:fluvy-gauge-card',
          entity: 'sensor.so_solar_power_night',
          icon: 'sun',
          variant: 'bar',
          max_entity: 'sensor.so_solar_capacity',
          cols: 6,
        },
      ],
    },
  ],
};
