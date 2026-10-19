import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/media.json';

/** The media family's English, in the family's chunk: `media-cards.ts` imports it first, so it is here before any card speaks. */
addEnglish(words);
