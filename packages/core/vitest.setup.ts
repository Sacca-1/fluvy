// every language's words are here before a test runs: a lookup never waits on a fetch. English's family parts are
// registered by their chunks in the bundle: every English part is registered here
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEnglish, preloadLanguages } from './src/i18n/index.js';

const english = join(dirname(fileURLToPath(import.meta.url)), 'src/i18n/locales/en');
for (const part of readdirSync(english))
  addEnglish(JSON.parse(readFileSync(join(english, part), 'utf8')));
await preloadLanguages();
