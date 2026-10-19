import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from '@fluvy/core';
import { FluvyClockCard } from '../../../../packages/cards/src/clock/clock-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-clock-card'))
  customElements.define('fluvy-clock-card', FluvyClockCard);

/**
 * The clock sheet, frame for frame: 21:47:12 on Thursday 17 September, a clear night at 18 °C.
 * `_now` freezes every card on that instant so a screenshot can be held against the design render
 * (it also places the hands instead of sweeping them); the last frame runs on the real clock.
 */
const NOW = '2026-09-17T21:47:12';
const CLOCK = { type: 'custom:fluvy-clock-card', _now: NOW } as const;

/** The mock has one sun and it is down. This stand-in shows its clock the same house at 13:05 on a sunny day. */
class ClocksByDay extends HTMLElement implements LovelaceCard {
  private readonly card = document.createElement('fluvy-clock-card') as LovelaceCard;

  connectedCallback(): void {
    this.style.display = 'block';
    this.append(this.card);
  }

  setConfig(config: LovelaceCardConfig): void {
    this.card.setConfig({ ...config, type: 'custom:fluvy-clock-card' });
  }

  getCardSize(): number | Promise<number> {
    return this.card.getCardSize();
  }

  set hass(hass: HomeAssistant) {
    const sun = hass.states['sun.sun'];
    const weather = hass.states['weather.home'];
    this.card.hass = {
      ...hass,
      states: {
        ...hass.states,
        ...(sun ? { 'sun.sun': { ...sun, state: 'above_horizon' } } : {}),
        ...(weather
          ? {
              'weather.home': {
                ...weather,
                state: 'partlycloudy',
                attributes: { ...weather.attributes, temperature: 24, apparent_temperature: 25 },
              },
            }
          : {}),
      },
    };
  }
}
if (!customElements.get('pg-clocks-by-day')) customElements.define('pg-clocks-by-day', ClocksByDay);
const DAY = { type: 'pg-clocks-by-day', _now: '2026-09-17T13:05:40' } as const;

const FORECAST = [
  { datetime: '2026-09-17T00:00:00', condition: 'partlycloudy', temperature: 24, templow: 13 },
  { datetime: '2026-09-18T00:00:00', condition: 'sunny', temperature: 23, templow: 14 },
  { datetime: '2026-09-19T00:00:00', condition: 'rainy', temperature: 19, templow: 12 },
];

/** Two tiles share a column with a 16 gap: on a multiple of 8 both land on the 4 px grid (300 → 296). */
const column = Number(new URLSearchParams(location.search).get('width') ?? 360);
const TILES = Math.floor(column / 8) * 8;

export const sheet: SheetSpec = {
  states: [
    [
      'weather.home',
      'clear-night',
      {
        friendly_name: 'Home',
        supported_features: 3,
        temperature: 18,
        temperature_unit: '°C',
        apparent_temperature: 16,
        humidity: 62,
        wind_speed: 12,
        wind_speed_unit: 'km/h',
        wind_bearing: 315,
      },
    ],
    ['weather.rooftop', 'unavailable', { friendly_name: 'Rooftop' }],
    // an integration without a daily forecast: the row never comes, the weather stands beside the time
    [
      'weather.balcony',
      'rainy',
      {
        friendly_name: 'Balcony',
        supported_features: 2,
        temperature: 14.6,
        temperature_unit: '°C',
      },
    ],
    [
      'sun.sun',
      'below_horizon',
      {
        friendly_name: 'Sun',
        next_rising: '2026-09-18T07:31:00',
        next_setting: '2026-09-18T20:12:00',
        elevation: -12.4,
      },
    ],
  ],
  ws: {
    'weather/subscribe_forecast': (message) => ({
      type: 'daily',
      forecast: message['entity_id'] === 'weather.home' ? FORECAST : null,
    }),
  },
  frames: [
    /* --- the design sheet, in its own order --- */
    { title: 'A1 hero', cards: [{ ...CLOCK, variant: 'analog' }] },
    { title: 'D1 hero', cards: [{ ...CLOCK, variant: 'digital' }] },
    { title: 'A2 quarters', cards: [{ ...CLOCK, variant: 'analog', numerals: 'quarters' }] },
    {
      title: 'D2 seconds + week',
      cards: [{ ...CLOCK, variant: 'digital', seconds: true, week: true }],
    },
    { title: 'A3 all numerals', cards: [{ ...CLOCK, variant: 'analog', numerals: 'all' }] },
    { title: 'D3 12 h', cards: [{ ...CLOCK, variant: 'digital', hour12: true }] },
    { title: 'A4 side', cards: [{ ...CLOCK, variant: 'analog', layout: 'side' }] },
    // the same side clock in the newer words (the other frames keep the older ones: they are read as before)
    {
      title: 'A4 side · newer words',
      cards: [{ ...CLOCK, face: 'analog', variant: 'side', show_seconds: false, show_week: true }],
    },
    {
      title: 'D4 weather beside the date',
      cards: [{ ...CLOCK, variant: 'digital', weather: 'weather.home', forecast: false }],
    },
    {
      title: 'A5 weather',
      cards: [
        { ...CLOCK, variant: 'analog', numerals: 'quarters', weather: 'weather.home', date: false },
      ],
    },
    { title: 'D5 weather row', cards: [{ ...CLOCK, variant: 'digital', weather: 'weather.home' }] },
    {
      title: 'A6 side weather',
      cards: [{ ...CLOCK, variant: 'analog', layout: 'side', weather: 'weather.home' }],
    },
    {
      title: 'D6 tiles',
      width: TILES,
      cards: [
        { ...CLOCK, variant: 'digital', layout: 'tile', cols: 6 },
        { ...CLOCK, variant: 'digital', layout: 'tile', weather: 'weather.home', cols: 6 },
        { ...CLOCK, variant: 'analog', layout: 'tile', cols: 6 },
        { ...CLOCK, variant: 'analog', layout: 'tile', numerals: 'quarters', cols: 6 },
      ],
    },
    /* --- hard states --- */
    {
      title: 'Weather unavailable / missing',
      cards: [
        { ...CLOCK, variant: 'digital', weather: 'weather.rooftop' },
        { ...CLOCK, variant: 'analog', layout: 'side', weather: 'weather.ghost' },
        { ...CLOCK, variant: 'analog', numerals: 'quarters', weather: 'weather.rooftop' },
      ],
    },
    {
      title: 'Unavailable tiles · no daily forecast',
      width: TILES,
      cards: [
        { ...CLOCK, variant: 'digital', layout: 'tile', weather: 'weather.rooftop', cols: 6 },
        { ...CLOCK, variant: 'digital', layout: 'tile', weather: 'weather.balcony', cols: 6 },
        { ...CLOCK, variant: 'digital', weather: 'weather.balcony' },
        { ...CLOCK, variant: 'analog', layout: 'side', weather: 'weather.balcony' },
      ],
    },
    /* one big time per frame: the measurer reads the sheet's `d` baseline group frame-wide */
    {
      title: '12 h',
      cards: [
        { ...CLOCK, variant: 'digital', hour12: true, seconds: true, weather: 'weather.home' },
        { ...CLOCK, variant: 'analog', layout: 'side', hour12: true },
      ],
    },
    {
      title: '12 h · no room beside the time',
      cards: [
        {
          ...CLOCK,
          variant: 'digital',
          hour12: true,
          seconds: true,
          weather: 'weather.home',
          forecast: false,
        },
      ],
    },
    {
      title: '12 h tiles',
      width: TILES,
      cards: [
        { ...CLOCK, variant: 'digital', layout: 'tile', hour12: true, cols: 6 },
        {
          ...CLOCK,
          variant: 'digital',
          layout: 'tile',
          hour12: true,
          weather: 'weather.home',
          cols: 6,
        },
      ],
    },
    {
      title: 'Another time zone',
      cards: [
        { ...CLOCK, variant: 'digital', time_zone: 'America/New_York', title: 'New York' },
        {
          ...CLOCK,
          variant: 'analog',
          layout: 'side',
          time_zone: 'Asia/Tokyo',
          title: 'Tokyo',
          numerals: 'quarters',
        },
        {
          ...CLOCK,
          variant: 'digital',
          layout: 'side',
          time_zone: 'Europe/London',
          title: 'London',
          week: true,
        },
      ],
    },
    {
      title: 'Day sky: solar tone',
      cards: [
        { ...DAY, variant: 'analog', numerals: 'quarters', weather: 'weather.home', date: false },
        { ...DAY, variant: 'digital', weather: 'weather.home', forecast: false },
      ],
    },
    // it ticks: a second hand and a seconds figure are never where the last look left them (for the eye only)
    {
      title: 'Live (the real clock)',
      measure: false,
      cards: [
        { type: 'custom:fluvy-clock-card', variant: 'analog', layout: 'side', seconds: true },
        { type: 'custom:fluvy-clock-card', variant: 'digital', seconds: true, week: true },
      ],
    },
  ],
};
