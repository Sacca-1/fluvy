import { addEnglish } from '@fluvy/core';
import words from '@fluvy/core/locales/en/panel.json';

/** The settings panel's English, in the panel's chunk: `panel.ts` imports it first, so it is here before the panel speaks. */
addEnglish(words);
