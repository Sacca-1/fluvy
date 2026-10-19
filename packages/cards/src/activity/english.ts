import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/activity.json';

/** The Activity page's English, in the page's chunk: `view.ts` imports it first, so it is here before the page speaks. */
addEnglish(words);
