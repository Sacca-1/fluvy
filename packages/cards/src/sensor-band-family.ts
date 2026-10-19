import type { FamilyEntry } from './energy-family.js';

/** Announce the card immediately while keeping its implementation out of the shared bundle. */
export const SENSOR_BAND_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-sensor-band-card',
    'Fluvy · Sensor band',
    'A current sensor reading on a ruler with colour bands and labelled reference markers.',
    () => 236,
  ],
];
