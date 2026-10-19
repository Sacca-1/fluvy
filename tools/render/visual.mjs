#!/usr/bin/env node
/**
 * Every interaction suite, one after the other, in a real Chromium against the playground on :5183 (start it with
 * `FLUVY_NO_HMR=1 pnpm --filter @fluvy/playground dev`). Each suite prints its own pass / fail lines; this prints one
 * line per suite at the end and exits 1 when any suite failed — what `pnpm visual` and CI run.
 *   node visual.mjs                 every tools/render/interactions*.mjs
 *   node visual.mjs panel history   only those (the part of the file name after "interactions-")
 */
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wanted = process.argv.slice(2);
const keyOf = (name) => name.replace(/^interactions-?|\.mjs$/g, '') || 'base';
const suites = (await readdir(here))
  .filter((name) => /^interactions(-[\w-]+)?\.mjs$/.test(name))
  .filter((name) => !wanted.length || wanted.includes(keyOf(name)))
  .sort();
if (!suites.length) {
  console.error(`no suite matches ${wanted.join(', ')}`);
  process.exit(1);
}

const run = (name) =>
  new Promise((resolve) => {
    const started = Date.now();
    console.log(`\n━━ ${name}`);
    const child = spawn(process.execPath, [join(here, name)], { stdio: 'inherit' });
    child.on('close', (code) =>
      resolve({ name, code: code ?? 1, seconds: (Date.now() - started) / 1000 }),
    );
  });

const results = [];
for (const suite of suites) results.push(await run(suite));

console.log('\n━━ summary');
for (const { name, code, seconds } of results)
  console.log(`${code === 0 ? '✓' : '✗'} ${name} (${seconds.toFixed(0)} s)`);
const failed = results.filter((r) => r.code !== 0).length;
console.log(`${results.length - failed}/${results.length} suites passed`);
process.exit(failed ? 1 : 0);
