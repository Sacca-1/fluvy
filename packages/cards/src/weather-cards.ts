import { registerCard } from '@fluvy/core';
import { WEATHER_FAMILY } from './weather-family.js';
import { FluvyWeatherCard } from './weather/weather-card.js';

/**
 * The weather card's element: this module is its own chunk, fetched at start (`index.ts`) and defined as it lands.
 * Its name, description and height live in `weather-family.ts`, which every page carries.
 */
export const CARDS = WEATHER_FAMILY.map(
  ([tag, name, description]) =>
    [tag, FluvyWeatherCard as CustomElementConstructor, name, description] as const,
);

for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
