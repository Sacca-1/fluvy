// every language's words are here before a test runs: a lookup never waits on a fetch. A test imports a card's module
// on its own, never the family's chunk that registers its English in the bundle: every English part is registered here
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEnglish, preloadLanguages } from '@fluvy/core';

const english = join(dirname(fileURLToPath(import.meta.url)), '../core/src/i18n/locales/en');
for (const part of readdirSync(english))
  addEnglish(JSON.parse(readFileSync(join(english, part), 'utf8')));
await preloadLanguages();
