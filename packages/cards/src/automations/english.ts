import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/automations.json';

/**
 * The automations family's English, in the family's chunk: `automations-cards.ts` imports it first, so it is here
 * before the card speaks (the schedule sheet's chunk imports this one's, so the sheet finds it too).
 */
addEnglish(words);
