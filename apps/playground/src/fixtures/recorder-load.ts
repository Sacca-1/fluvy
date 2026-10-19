import { FluvyHistoryBarsCard } from '../../../../packages/cards/src/history-bars/history-bars-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-history-bars-card'))
  customElements.define('fluvy-history-bars-card', FluvyHistoryBarsCard);

/**
 * What the history bars cost the recorder (`?sheet=recorder-load`; a fixture, not a sheet of the sweeps): ten cards on
 * the page's own clock — meters as Home Assistant counts them, four with today live, day counters read from zero, a
 * measurement, a month's readings — and five plain power sensors with no state class, read from their history.
 * tools/render/interactions-history-bars.mjs runs the clock on and counts the questions they ask in a minute.
 */

const KWH = { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' };
const POWER = { unit_of_measurement: 'W', device_class: 'power' };

/** A counter's hours over thirty days, ending at the last full hour (the house's statistics). */
const counter = (rate: number): number[] =>
  Array.from({ length: 30 * 24 }, (_, i) => Math.round((1_000 + i * rate) * 100) / 100);
/** A power sensor's states over any window asked, spread evenly (the house's history). */
const power = (base: number): number[] =>
  Array.from({ length: 96 }, (_, i) => Math.round(base + base * 0.4 * Math.sin(i / 7)));

const METERS = Array.from({ length: 8 }, (_, i) => `sensor.load_meter_${i + 1}`);
const PLUGS = Array.from({ length: 5 }, (_, i) => `sensor.load_plug_${i + 1}`);

const card = (entity: string, own: Record<string, unknown> = {}) => ({
  type: 'custom:fluvy-history-bars-card',
  entity,
  variant: 'mini',
  cols: 6,
  ...own,
});

export const sheet: SheetSpec = {
  states: [
    ...METERS.map((id, i): [string, string, Record<string, unknown>] => [
      id,
      String(1_000 + 30 * 24 * (0.5 + i / 10) + 0.4),
      { friendly_name: `Meter ${i + 1}`, ...KWH },
    ]),
    [
      'sensor.load_temperature',
      '21.4',
      {
        friendly_name: 'Living room',
        unit_of_measurement: '°C',
        device_class: 'temperature',
        state_class: 'measurement',
      },
    ],
    [
      'sensor.load_rain',
      '16.9',
      { friendly_name: 'Rain', unit_of_measurement: 'mm', state_class: 'total' },
    ],
    ...PLUGS.map((id, i): [string, string, Record<string, unknown>] => [
      id,
      String(120 + i * 40),
      { friendly_name: `Plug ${i + 1}`, ...POWER },
    ]),
  ],
  statistics: {
    ...Object.fromEntries(
      METERS.map((id, i) => [id, { kind: 'counter' as const, hourly: counter(0.5 + i / 10) }]),
    ),
    'sensor.load_temperature': {
      kind: 'measurement',
      hourly: Array.from({ length: 30 * 24 }, (_, i) => 21 + Math.sin(i / 4)),
    },
    'sensor.load_rain': { kind: 'counter', hourly: counter(0.02) },
  },
  history: Object.fromEntries(PLUGS.map((id, i) => [id, power(120 + i * 40)])),
  frames: [
    {
      title: 'Ten history bars and five power sensors, live',
      width: 760,
      cards: [
        // as Home Assistant counts them, today live: its count every five minutes
        ...METERS.slice(0, 4).map((id) => card(id, { include_today: true })),
        // as it counts them, the finished days only: once an hour
        ...METERS.slice(4, 6).map((id) => card(id)),
        // day counters from zero, by the hour: once an hour, today carried on live
        ...METERS.slice(6, 8).map((id) => card(id, { reset: 'day', include_today: true })),
        card('sensor.load_temperature'),
        card('sensor.load_rain', { stat: 'state', period: 'month', reset: 'month' }),
        // plain power sensors: their history, once an hour
        ...PLUGS.map((id) => card(id, { stat: 'mean', include_today: true })),
      ],
    },
  ],
};
