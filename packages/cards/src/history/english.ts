import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/history.json';

/** The History page's English, in the page's chunk: `view.ts` imports it first, so it is here before the page speaks. */
addEnglish(words);
