#!/usr/bin/env node
/**
 * The measurer's self-test. The playground's fixtures (`?sheet=measurer`, apps/playground/src/fixtures/measurer.ts)
 * hold a frame per rule drawn to break it and one drawn to break none; a frame's title names its rule
 * (`overlap · a figure under its stepper`). Each frame must break its rule, and the `clean · …` frame nothing at all:
 * a rule that stops seeing what it is for, or starts seeing what is not there, fails here before it fails a sweep.
 *   PLAYGROUND=http://127.0.0.1:5183/ node tools/render/measure-fixtures.mjs [--out out/measure]
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYGROUND } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const at = process.argv.indexOf('--out');
const out = resolve(here, '..', '..', at >= 0 ? process.argv[at + 1] : 'out/measure', 'fixtures');

const code = await new Promise((done) => {
  const child = spawn(
    process.execPath,
    [
      join(here, 'measure.mjs'),
      '--page',
      `${PLAYGROUND}?sheet=measurer`,
      '--frame',
      '[data-frame]',
      '--width',
      '1400',
      '--out',
      `${out}.json`,
      '--md',
      `${out}.md`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  child.on('close', done);
});
const report = await readFile(`${out}.json`, 'utf8')
  .then((body) => JSON.parse(body))
  .catch(() => null);
if (!report?.frames.length) {
  console.error(`✗ no fixtures measured (measure.mjs exited ${code})`);
  process.exit(1);
}

let failed = 0;
for (const frame of report.frames) {
  const title = String(frame.label).replace(/^measurer\//, '');
  const rule = title.split(' · ')[0];
  const rules = [...new Set(frame.violations.map((v) => v.rule))];
  const ok =
    rule === 'clean'
      ? frame.violations.length === 0
      : frame.violations.some((v) => v.rule === rule);
  if (!ok) failed += 1;
  const found = rules.length ? rules.join(', ') : 'nothing';
  console.log(`${ok ? '✓' : '✗'} ${title} — ${rule === 'clean' ? 'breaks' : 'found'} ${found}`);
  if (!ok)
    for (const v of frame.violations) console.log(`    ${v.rule} ${v.selector} — ${v.detail}`);
}
console.log(`\n${report.frames.length - failed}/${report.frames.length} fixtures hold`);
process.exit(failed ? 1 : 0);
