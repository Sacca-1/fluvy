#!/usr/bin/env node
/**
 * The release invariants, as a check that fails loudly:
 *
 *   node tools/release/check.mjs                 what `pnpm check` runs: the versions and the metadata agree
 *   node tools/release/check.mjs --release       before a release is built: the integration folder is complete too
 *   node tools/release/check.mjs --tag v1.2.0    in CI, on a tag: the tag names the same version
 *
 * - one version: the root package.json, every workspace package.json and custom_components/fluvy/manifest.json;
 * - one set of metadata (license, author, homepage, repository, bugs, engines) on every workspace package;
 * - with --release: the build the integration ships is present (frontend/manifest.json with its build stamp,
 *   fluvy.js, loader.js, the theme, the icons) and no compressed sidecar lies beside a script.
 */
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, workspaceManifests } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const release = args.includes('--release') || args.includes('--tag');

/** Each chunk's gzip budget in bytes (`core` is what every page loads; the rest come on demand). */
const BUDGETS = {
  'fluvy.js': 2048,
  // 222 KB since 1.7 (the light's colour wiring, the surface colour, the essentials while off): 220 before
  core: 227_328,
  panel: 40_960,
  strategy: 24_576,
  wall: 16_384,
  // the energy family: every energy card, the flow's drawing and motion, the model they share
  energy: 65_536,
  // the media family: the player and the now-playing strip
  media: 16_384,
  // the devices family: the lock, the alarm and its keypad, the camera, the printer
  devices: 32_768,
  // the light card's colour controls: the quick colours' table and row, fetched by the first colour bulb
  'light-colour': 4096,
  // the weather card
  weather: 12_288,
  editor: 8192,
  'view-icons': 4096,
  pages: 8192,
  activity: 32_768,
  history: 16_384,
  lang: 16_384,
  'rolldown-runtime': 2048,
  'loader.js': 4096,
};
const tag = args[args.indexOf('--tag') + 1];
const problems = [];
const problem = (text) => problems.push(text);

const rootManifest = await readJson(join(root, 'package.json'));
const { version } = rootManifest;
const META = ['license', 'author', 'homepage', 'repository', 'bugs', 'engines'];

for (const file of await workspaceManifests(root)) {
  const manifest = await readJson(file);
  const name = relative(root, file);
  if (manifest.version !== version) problem(`${name}: version ${manifest.version} ≠ ${version}`);
  for (const key of META) {
    const expected =
      key === 'repository' && file !== join(root, 'package.json')
        ? { ...rootManifest.repository, directory: relative(root, dirname(file)) }
        : rootManifest[key];
    if (JSON.stringify(manifest[key]) !== JSON.stringify(expected))
      problem(`${name}: "${key}" differs from the root package.json`);
  }
}

const integration = join(root, 'custom_components', 'fluvy');
const haManifest = await readJson(join(integration, 'manifest.json'));
if (haManifest.version !== version)
  problem(`custom_components/fluvy/manifest.json: version ${haManifest.version} ≠ ${version}`);
if (args.includes('--tag') && tag !== `v${version}`) problem(`tag ${tag} ≠ v${version}`);

if (release) {
  const exists = async (path) =>
    stat(join(integration, path))
      .then(() => true)
      .catch(() => false);
  for (const path of [
    'frontend/fluvy.js',
    'frontend/loader.js',
    'frontend/manifest.json',
    'frontend/fonts/inter-variable.woff2',
    'themes/fluvy.yaml',
    'brand/icon.png',
    'brand/icon@2x.png',
  ])
    if (!(await exists(path)))
      problem(`custom_components/fluvy/${path} is missing (run pnpm build)`);
  if (await exists('frontend/manifest.json')) {
    const built = await readJson(join(integration, 'frontend', 'manifest.json'));
    if (built.version !== version)
      problem(`frontend/manifest.json: version ${built.version} ≠ ${version}`);
    if (!/^[0-9a-f]{8}$/.test(built.build ?? '')) problem('frontend/manifest.json: no build stamp');
    // every script under its budget (gzip): what a page pays for what it opens. A chunk is named before its
    // eight-character hash (`chunks/strategy-6-wdQvpS.js` → `strategy`; a language's catalogue is `lang`); the
    // fonts are not scripts and have no budget here
    for (const [file, { gzip }] of Object.entries(built.files ?? {})) {
      if (!/^(fluvy\.js|loader\.js|chunks\/.+\.js)$/.test(file)) continue;
      const name = file.replace(/^chunks\//, '').replace(/-[\w-]{8}\.js$/, '');
      const budget = BUDGETS[name.startsWith('lang-') ? 'lang' : name];
      if (budget === undefined)
        problem(`${file}: no budget for this chunk (tools/release/check.mjs)`);
      else if (gzip > budget) problem(`${file}: ${gzip} B gzip over its budget of ${budget} B`);
    }
  }
  const sidecars = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(gz|br)$/.test(entry.name)) sidecars.push(relative(root, path));
    }
  };
  await walk(integration);
  for (const file of sidecars)
    problem(`${file}: a compressed sidecar would be served in place of its script`);
}

if (problems.length > 0) {
  for (const text of problems) console.error(`✗ ${text}`);
  process.exit(1);
}
console.log(
  `✓ Fluvy ${version}: versions and metadata agree${release ? ', the integration folder is complete' : ''}`,
);
