#!/usr/bin/env node
/**
 * After `vite build`: copy the fonts and the loader next to the bundle, and write a manifest with sizes and hashes —
 * the entry, its chunks (what every page loads, and what a page fetches on demand), the loader and the fonts. The
 * manifest's `build` stamp names the folder the integration serves the build from, so any changed byte changes the
 * URL. The budget holds for what every page loads: the entry and the chunks it imports statically.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// the build lives inside the integration, which serves it: custom_components/fluvy/frontend
const dist = join(root, '..', '..', 'custom_components', 'fluvy', 'frontend');
const fonts = join(root, '..', 'fonts', 'files');
// Fluvy's one version: the root package.json's
const { version } = JSON.parse(await readFile(join(root, '..', '..', 'package.json'), 'utf8'));

await mkdir(join(dist, 'fonts'), { recursive: true });
for (const file of ['inter-variable.woff2', 'inter-italic-variable.woff2', 'OFL-Inter.txt'])
  await cp(join(fonts, file), join(dist, 'fonts', file));
// the module Home Assistant loads on every page: it imports the build beside it (see src/loader.js)
await cp(join(root, 'src', 'loader.js'), join(dist, 'loader.js'));

const chunks = (await readdir(join(dist, 'chunks'))).map((f) => `chunks/${f}`);
const files = {};
for (const name of [
  'fluvy.js',
  ...chunks,
  'loader.js',
  ...(await readdir(join(dist, 'fonts'))).map((f) => `fonts/${f}`),
]) {
  const data = await readFile(join(dist, name));
  files[name] = {
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    ...(name.endsWith('.js') ? { gzip: gzipSync(data).length } : {}),
  };
}
// a compressed sidecar next to a script would be served in its place by aiohttp, stale or not
const sidecars = Object.keys(files).filter((name) => /\.(gz|br)$/.test(name));
if (sidecars.length > 0) {
  console.error(`compressed sidecars must not ship: ${sidecars.join(', ')}`);
  process.exit(1);
}
const build = createHash('sha256')
  .update(
    Object.keys(files)
      .sort()
      .map((name) => `${name} ${files[name].sha256}\n`)
      .join(''),
  )
  .digest('hex')
  .slice(0, 8);
await writeFile(
  join(dist, 'manifest.json'),
  `${JSON.stringify({ name: 'fluvy', version, build, files }, null, 2)}\n`,
);

/** The chunks a file imports statically (`from"./chunks/…"`, `from"./…"` inside a chunk). */
const statics = async (name) => {
  const code = await readFile(join(dist, name), 'utf8');
  const base = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
  return [...code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => `${base}${m[1]}`);
};
const initial = new Set(['fluvy.js']);
for (const name of initial) for (const next of await statics(name)) initial.add(next);
const gzip = (names) => [...names].reduce((sum, name) => sum + files[name].gzip, 0);
const onDemand = chunks.filter((name) => !initial.has(name));
// page controls live in the chunks a page fetches, the cards' editor in the one the card editor fetches: one of
// them in what every dashboard loads is a leak (the energy cards read the Energy dashboard's preferences themselves)
const NEVER_INITIAL = [
  'fluvy-select',
  'fluvy-time-field',
  'fluvy-panel',
  'fluvy-wall-corner',
  'fluvy-wall-back',
  'fluvy-keypad',
  'fluvy-rows-editor',
  'fluvy-schedule-sheet',
];
for (const name of initial) {
  const code = await readFile(join(dist, name), 'utf8');
  const leaked = NEVER_INITIAL.find(
    (tag) => code.includes(`"${tag}"`) || code.includes(`'${tag}'`),
  );
  if (leaked) {
    console.error(
      `${name} carries ${leaked}: a page control leaked into what every dashboard loads`,
    );
    process.exit(1);
  }
}
// 224 KB since 1.8 (the automations family's announcement and words, the light's own colours): 222 KB in 1.7, 220 before
const BUDGET = 224 * 1024;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(
  `Fluvy v${version} · build ${build} · every page ${kb(gzip(initial))} gzip (budget ${BUDGET / 1024} KB: ${[...initial].join(' + ')})`,
);
for (const name of onDemand) console.log(`  on demand · ${name} · ${kb(files[name].gzip)} gzip`);
if (gzip(initial) > BUDGET) {
  console.error('bundle is over its gzip budget');
  process.exit(1);
}
