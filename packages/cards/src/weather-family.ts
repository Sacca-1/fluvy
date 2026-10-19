import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import type { FamilyEntry } from './energy-family.js';

/**
 * The weather card, announced at start and defined when its chunk lands (`weather-cards.ts`), as the energy and media
 * families are: what the picker lists and how tall it is at a 360 column, without the card itself.
 */

/** A day's row; the hero with the card's padding; a strip of columns (84) with the 16 above it; the compact head. */
export const WEATHER_ROW = 60;
export const WEATHER_HERO = 128;
export const WEATHER_STRIP = 100;
export const WEATHER_COMPACT_HEAD = 84;

/** What a config draws under the hero: a mode, or nothing when the forecast is not shown. */
export function forecastModeOf(
  config: LovelaceCardConfig | undefined,
): 'daily' | 'hourly' | 'both' | 'none' {
  if (config?.['show_forecast'] === false) return 'none';
  const mode = config?.['forecast'];
  return mode === 'hourly' || mode === 'both' ? mode : 'daily';
}

/** The days a config asks for, one to ten (five by default). */
export function forecastDaysOf(config: LovelaceCardConfig | undefined): number {
  const days = config?.['days'];
  return Math.min(10, Math.max(1, Math.round(typeof days === 'number' ? days : 5)));
}

/** The forecasts a weather entity offers (`supported_features`): daily 1, hourly 2 (Home Assistant's bits). */
const FORECAST_DAILY = 1;
const FORECAST_HOURLY = 2;

/**
 * The card at a 360 column: the hero (or the compact head), then a strip per forecast or the days' rows. Given the
 * house, a forecast the entity does not offer (its features say which) draws nothing and counts nothing.
 */
export function weatherHeight(config: LovelaceCardConfig, hass?: HomeAssistant): number {
  const mode = forecastModeOf(config);
  const id = config['entity'];
  const state = typeof id === 'string' ? hass?.states?.[id] : undefined;
  const features = state?.attributes['supported_features'];
  const offers = (bit: number): boolean => typeof features !== 'number' || (features & bit) !== 0;
  const hours = (mode === 'hourly' || mode === 'both') && offers(FORECAST_HOURLY) ? 1 : 0;
  const days = (mode === 'daily' || mode === 'both') && offers(FORECAST_DAILY) ? 1 : 0;
  if (config['variant'] === 'compact') return WEATHER_COMPACT_HEAD + WEATHER_STRIP * (hours + days);
  return (
    WEATHER_HERO + WEATHER_STRIP * hours + (days ? 16 + WEATHER_ROW * forecastDaysOf(config) : 0)
  );
}

export const WEATHER_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-weather-card',
    'Fluvy · Weather',
    'Condition, temperature, feels-like, wind and the daily or hourly forecast.',
    weatherHeight,
  ],
];
