/**
 * A new language's catalogue, key for key from English (every part of it: a language other than English is one file),
 * every string left in English to be translated (the check reports how many are still English); its naming words
 * (`words/<code>.json`) start empty and take the language's own stems.
 *
 *   pnpm i18n scaffold nl
 */
import { readCatalogue, writeCatalogue, type Table, type Words } from './lib.js';

const code = process.argv[2];
if (!code || code === 'en' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(code)) {
  console.error('usage: pnpm i18n scaffold <code>   (es, pt-BR)');
  process.exit(2);
}
const english = await readCatalogue('en');
const scaffold: Record<string, Table | Words> = {};
for (const [namespace, table] of Object.entries(english))
  scaffold[namespace] =
    namespace === 'words'
      ? Object.fromEntries(Object.keys(table).map((category) => [category, []]))
      : table;
const files = await writeCatalogue(code, scaffold);
console.log(
  `${files.join(', ')}: ${Object.keys(scaffold).length - 1} namespaces and the naming words, in English — translate them, then add the language to languages.ts`,
);
