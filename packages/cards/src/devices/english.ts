import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/devices.json';

/** The devices family's English, in the family's chunk: `devices-cards.ts` imports it first, so it is here before any card speaks. */
addEnglish(words);
