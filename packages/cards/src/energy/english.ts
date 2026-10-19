import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/energy.json';

/** The energy family's English, in the family's chunk: `energy-cards.ts` imports it first, so it is here before any card speaks. */
addEnglish(words);
