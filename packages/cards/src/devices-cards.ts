// the family's words first: they are here before anything in its chunk says them
import './devices/english.js';
import { registerCard } from '@fluvy/core';
import { FluvyAlarmCard } from './alarm/alarm-card.js';
import { FluvyCameraCard } from './camera/camera-card.js';
import { DEVICES_FAMILY } from './devices-family.js';
import { FluvyLockCard } from './lock/lock-card.js';
import { FluvyPrinterCard } from './printer/printer-card.js';

/**
 * The devices family's elements: this module is its own chunk, fetched at start (`index.ts`) and defined as it lands.
 * The names, descriptions and heights live in `devices-family.ts`, which every page carries.
 */
const ELEMENTS: Readonly<Record<string, CustomElementConstructor>> = {
  'fluvy-lock-card': FluvyLockCard,
  'fluvy-alarm-card': FluvyAlarmCard,
  'fluvy-camera-card': FluvyCameraCard,
  'fluvy-printer-card': FluvyPrinterCard,
};

export const CARDS = DEVICES_FAMILY.map(
  ([tag, name, description]) =>
    [tag, ELEMENTS[tag] as CustomElementConstructor, name, description] as const,
);

for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
