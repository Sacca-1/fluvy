import { addEnglish } from '@fluvy/core';

/**
 * Every part of English, registered before any sheet draws. In the bundle a lazy family's part arrives with the
 * family's chunk, which defines its cards after it; a sheet here defines a family's cards itself, straight from their
 * modules (as the tests do), so the playground speaks every part from the start. What a page says before a chunk has
 * landed is the bundle's guards' to hold (`packages/bundle/src/english.test.ts`, `finish.mjs`), not the playground's.
 */
const parts = import.meta.glob<Parameters<typeof addEnglish>[0]>(
  '../../../packages/core/src/i18n/locales/en/*.json',
  { eager: true, import: 'default' },
);
for (const part of Object.values(parts)) addEnglish(part);
