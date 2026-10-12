import { FluvyHistoryBarsCard } from '../../../../packages/cards/src/history-bars/history-bars-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-history-bars-card'))
  customElements.define('fluvy-history-bars-card', FluvyHistoryBarsCard);

/**
 * The history bars (1.8, issue #38): the mock-up's four cards with their very numbers — solar production, the
 * house, the feed-in and the import over the seven finished days before Saturday 10 October 2026 — then thirty
 * days, twelve weeks, twelve months, the compact and mini layouts, a narrow column, a temperature's means, every
 * part switched off, the day in progress, a lifetime meter in Wh, and the honest states: no statistics yet, a
 * sensor that is unavailable, one that is not there.
 */

/** The sheet's moment: Saturday 10 October 2026 at noon, so the seven finished days read 03–09 October. */
const NOW = '2026-10-10T12:00:00';
const NOW_MS = new Date(2026, 9, 10, 12).getTime();
const DAY = 86_400_000;

const KWH = { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' };
const WH = { unit_of_measurement: 'Wh', device_class: 'energy', state_class: 'total_increasing' };
const CELSIUS = {
  unit_of_measurement: '°C',
  device_class: 'temperature',
  state_class: 'measurement',
};

/** A sensor's day `daysAgo` days back (0 today, 1 yesterday): what it gained, or its mean; null for a day it has no row. */
type Daily = (daysAgo: number) => number | null;

/** A quiet, repeatable series around a typical day: the same number for the same day on every run. */
const noise = (k: number): number => {
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/** The mock-up's last seven days (oldest first) for the finished week, a typical day with its swing before them, and today so far. */
const series = (
  last7: ReadonlyArray<number | null>,
  typical: number,
  swing: number,
  today: number,
): Daily => {
  return (k) => {
    if (k === 0) return today;
    if (k <= 7) return last7[7 - k] ?? null;
    return Math.round((typical + swing * noise(k)) * 10) / 10;
  };
};

const SENSORS: Record<
  string,
  { readonly daily: Daily; readonly mean?: boolean; readonly scale?: number }
> = {
  'sensor.hb_solar': { daily: series([35.4, 34.4, 28.6, 26.5, 30.2, 9.5, 26.9], 24, 12, 12.3) },
  'sensor.hb_house': { daily: series([22.1, 25.3, 28.7, 24.6, 23.9, 26.4, 22.8], 24, 5, 9.8) },
  'sensor.hb_export': { daily: series([28.4, 27.6, 22.1, 19.8, 24.7, 6.2, 21.4], 17, 10, 7.1) },
  'sensor.hb_import': { daily: series([4.8, 6.9, 9.1, 5.6, 4.3, 16.8, 7.2], 7, 5, 2.4) },
  'sensor.hb_outside': {
    daily: series([14.2, 15.8, 13.1, null, 16.0, 17.3, 15.1], 15, 4, 13.0),
    mean: true,
  },
  'sensor.hb_dead': { daily: series([1.2, 1.1, 1.3, 1.2, 0, 1.4, 1.2], 1.2, 0.3, 0.4) },
  // a lifetime meter in Wh: the same solar days a thousand times over, read in kWh by the card
  'sensor.hb_wh': {
    daily: series([35.4, 34.4, 28.6, 26.5, 30.2, 9.5, 26.9], 24, 12, 12.3),
    scale: 1000,
  },
};

/** The next bucket's start in the browser's own calendar (the mock's house reads the browser's clock). */
const next = (d: Date, period: string): Date =>
  period === 'month'
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() + (period === 'week' ? 7 : 1));

const TODAY = new Date(2026, 9, 10).getTime();
const daysAgo = (day: Date): number => Math.round((TODAY - day.getTime()) / DAY);

interface Row {
  readonly start: number;
  readonly end: number;
  readonly change?: number;
  readonly mean?: number;
  readonly max?: number;
  readonly min?: number;
}

/**
 * The recorder's rows for a question: one per bucket from the start asked, each the sum (or the mean) of the days
 * in it up to now; a bucket whose days all have no row has none either.
 */
const rows = (message: Record<string, unknown>, id: string): Row[] => {
  const sensor = SENSORS[id];
  if (!sensor) return [];
  const period = String(message['period'] ?? 'day');
  const out: Row[] = [];
  let start = new Date(Date.parse(String(message['start_time'])));
  while (start.getTime() < NOW_MS) {
    const end = next(start, period);
    const days: number[] = [];
    for (
      let day = new Date(start);
      day.getTime() < Math.min(end.getTime(), NOW_MS);
      day = next(day, 'day')
    ) {
      const value = sensor.daily(daysAgo(day));
      if (value !== null) days.push(value * (sensor.scale ?? 1));
    }
    if (days.length) {
      const sum = days.reduce((a, b) => a + b, 0);
      out.push(
        sensor.mean
          ? {
              start: start.getTime(),
              end: end.getTime(),
              mean: Math.round((sum / days.length) * 100) / 100,
              max: Math.max(...days),
              min: Math.min(...days),
            }
          : { start: start.getTime(), end: end.getTime(), change: Math.round(sum * 1000) / 1000 },
      );
    }
    start = end;
  }
  return out;
};

/** The solar meter with the card's default colour (the palette's accent): what the other frames are drawn with. */
const plain = {
  type: 'custom:fluvy-history-bars-card',
  entity: 'sensor.hb_solar',
  icon: 'sun',
  _now: NOW,
};
/** The mock-up's four cards wear its own colours (the issue's hexes: a palette's named amber reads khaki on Linen). */
const solar = { ...plain, color: '#C9A063' };
const house = {
  type: 'custom:fluvy-history-bars-card',
  entity: 'sensor.hb_house',
  icon: 'home',
  color: '#7E9FD0',
  _now: NOW,
};
const feedIn = {
  type: 'custom:fluvy-history-bars-card',
  entity: 'sensor.hb_export',
  icon: 'up',
  color: '#86B98C',
  price: 0.19,
  facts: [
    { kind: 'share', of: 'sensor.hb_solar', name: 'Share of production', icon: 'tower' },
    { kind: 'money', name: 'Revenue (est.)' },
    { kind: 'co2', name: 'CO₂ avoided' },
  ],
  _now: NOW,
};
const gridImport = {
  type: 'custom:fluvy-history-bars-card',
  entity: 'sensor.hb_import',
  icon: 'down',
  color: '#EE9A86',
  price: 0.3,
  facts: [
    { kind: 'money', name: 'Costs (est.)' },
    { kind: 'km' },
    { kind: 'share', of: 'sensor.hb_house', name: 'Share of consumption' },
  ],
  _now: NOW,
};

export const sheet: SheetSpec = {
  states: [
    ['sensor.hb_solar', '18342.7', { friendly_name: 'Solar production', ...KWH }],
    ['sensor.hb_house', '21877.2', { friendly_name: 'House consumption', ...KWH }],
    ['sensor.hb_export', '9210.4', { friendly_name: 'Feed-in to grid', ...KWH }],
    ['sensor.hb_import', '6032.9', { friendly_name: 'Grid import', ...KWH }],
    ['sensor.hb_outside', '13.0', { friendly_name: 'Outside temperature', ...CELSIUS }],
    ['sensor.hb_dead', 'unavailable', { friendly_name: 'Pool pump energy', ...KWH }],
    ['sensor.hb_fresh', '0.4', { friendly_name: 'Heat pump energy', ...KWH }],
    ['sensor.hb_wh', '18342700', { friendly_name: 'Lifetime production', ...WH }],
    ['sensor.hb_panels', '5.4', { friendly_name: 'Panels', unit_of_measurement: 'kWp' }],
  ],

  ws: {
    'recorder/statistics_during_period': (message) =>
      Object.fromEntries(
        ((message['statistic_ids'] as string[] | undefined) ?? [])
          .filter((id) => id in SENSORS)
          .map((id) => [id, rows(message, id)]),
      ),
  },

  frames: [
    /* ---- the mock-up's cards at a phone's column ---- */
    { title: 'Solar production', cards: [solar] },
    { title: 'House consumption', cards: [house] },
    { title: 'Feed-in to grid', cards: [feedIn] },
    { title: 'Grid import', cards: [gridImport] },

    /* ---- the mock-up's four cards at the mock-up's width: the readouts beside the title, the circles in the strip ---- */
    {
      title: 'Mock-up · Solar production',
      width: 760,
      cards: [{ ...solar, facts: ['co2', 'trees', 'highest'] }],
    },
    {
      title: 'Mock-up · House consumption',
      width: 760,
      cards: [{ ...house, facts: ['lowest', 'highest', 'average'] }],
    },
    { title: 'Mock-up · Feed-in to grid', width: 760, cards: [feedIn] },
    { title: 'Mock-up · Grid import', width: 760, cards: [gridImport] },

    /* ---- longer windows ---- */
    { title: '30 days', cards: [{ ...plain, days: 30 }] },
    { title: '12 weeks', cards: [{ ...plain, period: 'week', days: 12 }] },
    { title: '12 months', cards: [{ ...plain, period: 'month', days: 12 }] },

    /* ---- the other layouts ---- */
    { title: 'Compact', cards: [{ ...house, variant: 'compact' }] },
    { title: 'Mini', cards: [{ ...plain, variant: 'mini' }] },
    { title: 'Narrow 232', width: 232, cards: [plain] },

    /* ---- what else a bar can show ---- */
    {
      title: 'Outside temperature · mean',
      cards: [{ ...plain, entity: 'sensor.hb_outside', icon: 'thermo', tone: 'cool' }],
    },
    {
      title: 'Facts of your own',
      cards: [
        {
          ...plain,
          include_today: true,
          head: ['total', { kind: 'today', name: 'So far today' }],
          facts: [
            {
              kind: 'money',
              factor: 0.12,
              name: 'Worth',
              icon: 'tag',
              color: 'green',
              tap_action: { action: 'none' },
            },
            {
              kind: 'template',
              name: 'Panels',
              template: '{{ states("sensor.hb_panels") }}',
              unit: 'kWp',
              icon: 'grid',
            },
            { kind: 'average', decimals: 2, name: 'A day' },
          ],
        },
      ],
    },
    {
      title: 'Everything off',
      cards: [
        {
          ...plain,
          show_values: false,
          show_axis: false,
          show_grid: false,
          show_dates: false,
          show_facts: false,
          head: [],
        },
      ],
    },
    { title: 'Include today', cards: [{ ...plain, include_today: true }] },
    {
      title: 'A lifetime meter in Wh',
      cards: [{ ...plain, entity: 'sensor.hb_wh', icon: 'bolt', days: 14 }],
    },

    /* ---- the honest states ---- */
    {
      title: 'No statistics yet',
      cards: [{ ...plain, entity: 'sensor.hb_fresh', icon: 'heater' }],
    },
    { title: 'Unavailable', cards: [{ ...plain, entity: 'sensor.hb_dead', icon: 'drop' }] },
    { title: 'Missing', cards: [{ ...plain, entity: 'sensor.hb_none' }] },
  ],
};
