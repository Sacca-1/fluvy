import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/alerts.json';

/**
 * The alerts family's English, in the family's chunk: `alerts-cards.ts` imports it first, so it is here before the
 * card speaks (the sheet's chunk imports this one's, so the sheet finds it too).
 */
addEnglish(words);
