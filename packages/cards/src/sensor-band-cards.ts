import { registerCard } from '@fluvy/core';
import { SENSOR_BAND_FAMILY } from './sensor-band-family.js';
import { FluvySensorBandCard } from './sensor-band/sensor-band-card.js';

export const CARDS = SENSOR_BAND_FAMILY.map(
  ([tag, name, description]) => [tag, FluvySensorBandCard, name, description] as const,
);
for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
