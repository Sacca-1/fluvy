#!/usr/bin/env node
/**
 * The History page at its moments, on the playground's made-up house (nothing live):
 *   node history-states.mjs --viewport 1440 --height 1000 --mode light --lang en --out ../../apps/playground/out/history
 * Writes <out>-<moment>.png for: plain (the last day), week and month (the statistics, with the band), states (a
 * house of things only), many (more series than a chart draws), opened (the rest of them), empty, loading, sources
 * (the drawer), dates (the popover or the sheet), scrub (a finger across a chart) and bottom (the state lines).
 * Prints the page's console errors: the page must never throw.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseArgs, launchOptions, PLAYGROUND } from './lib.mjs';

const args = parseArgs(process.argv.slice(2), {
  viewport: '1440',
  height: '1000',
  mode: 'light',
  lang: 'en',
  palette: '',
  url: PLAYGROUND,
  out: '../../apps/playground/out/history',
  only: '',
  scale: '2',
});
const query = new URLSearchParams({
  history: '1',
  live: '0',
  mode: args.mode,
  lang: args.lang,
  ...(args.palette ? { palette: args.palette } : {}),
});
const browser = await chromium.launch(launchOptions);
const problems = [];

/** The moments the playground reaches itself. */
const QUERY = {
  week: 'moment=week',
  month: 'moment=month',
  states: 'moment=states',
  many: 'moment=many',
  opened: 'moment=many',
  empty: 'moment=empty',
  loading: 'moment=loading',
  sources: 'moment=sources',
  dates: 'moment=dates',
  scrub: 'moment=scrub',
};
const WAIT = { loading: 0 };

const root = (page) =>
  page.evaluate(() => document.querySelector('fluvy-history').shadowRoot.innerHTML.length);

const moments = {
  plain: async () => {},
  ...Object.fromEntries(Object.keys(QUERY).map((name) => [name, async () => {}])),
  // the series a legend folds away, opened
  opened: async (page) => {
    await page.locator('fluvy-history .hs-legend__more').first().click();
  },
  // the state lines at the foot of the page
  bottom: async (page) => {
    const box = await page.evaluate(() => {
      const r = document
        .querySelector('fluvy-history')
        .shadowRoot.querySelector('.hs-scroll')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(40);
    }
  },
};

let current = '';
async function shoot(page, name) {
  const out = resolve(`${args.out}-${name}.png`);
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(out);
}

for (const [name, act] of Object.entries(moments)) {
  if (args.only && !args.only.split(',').includes(name)) continue;
  current = name;
  const page = await browser.newPage({
    viewport: { width: Number(args.viewport), height: Number(args.height) },
    deviceScaleFactor: Number(args.scale),
    colorScheme: args.mode === 'dark' ? 'dark' : 'light',
  });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${current}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${current}: pageerror ${e.message}`));
  await page.goto(`${args.url}?${query}${QUERY[name] ? `&${QUERY[name]}` : ''}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
  await page.waitForTimeout(1400);
  await root(page);
  await act(page);
  await page.waitForTimeout(WAIT[name] ?? 700);
  await shoot(page, name);
  await page.close();
}
await browser.close();
for (const p of problems) console.log(p);
process.exitCode = problems.length ? 1 : 0;
