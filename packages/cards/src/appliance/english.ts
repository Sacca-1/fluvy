import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/appliances.json';

/** The appliances family's English, in the family's chunk: its entry imports it first, so it is here before any card speaks. */
addEnglish(words);
