#!/usr/bin/env node
/**
 * Screenshots the playground (the real cards on a simulated hass).
 *   node shot.mjs --sheet home --mode dark --width 392 --out ../../apps/playground/out/home-dark.png
 *   node shot.mjs --sheet home --palette volt --shape round --pills soft   (the live palette engine; see the playground's main.ts)
 *   node shot.mjs --panel appearance --state pending,guest     (the settings panel at a moment of its own)
 *   node shot.mjs --activity 1 --viewport 1440 --height 900     (the Activity page; the clock at --at, no live entries)
 *   node shot.mjs --history 1 --moment week --viewport 1440      (the History page at one of its moments)
 * Prints console errors from the page: a card that throws must never pass silently.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseArgs, launchOptions, PLAYGROUND } from './lib.mjs';

const args = parseArgs(process.argv.slice(2), {
  sheet: '',
  mode: 'light',
  width: '392',
  lang: 'en',
  theme: '',
  palette: '',
  shape: '',
  pills: '',
  compare: '',
  panel: '',
  state: '',
  activity: '',
  history: '',
  moment: '',
  at: '2026-09-17T21:47:12',
  height: '900',
  out: '',
  url: PLAYGROUND,
  scale: '2',
  viewport: '1400',
  // 1: the window is as tall as the page, so what sticks to its foot (the panel's apply bar) is shown there
  fit: '0',
});
const query = new URLSearchParams({
  ...(args.sheet ? { sheet: args.sheet } : {}),
  mode: args.mode,
  width: args.width,
  lang: args.lang,
  ...(args.theme ? { theme: args.theme } : {}),
  ...(args.palette ? { palette: args.palette } : {}),
  ...(args.shape ? { shape: args.shape } : {}),
  ...(args.pills ? { pills: args.pills } : {}),
  ...(args.compare ? { compare: args.compare } : {}),
  ...(args.panel ? { panel: args.panel } : {}),
  ...(args.state ? { state: args.state } : {}),
  ...(args.activity ? { activity: '1', live: '0', at: args.at } : {}),
  ...(args.history ? { history: '1', live: '0' } : {}),
  ...(args.moment ? { moment: args.moment } : {}),
});
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({
  viewport: { width: Number(args.viewport), height: Number(args.height) },
  deviceScaleFactor: Number(args.scale),
  colorScheme: args.mode === 'dark' ? 'dark' : 'light',
});
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`${args.url}?${query}`);
await page.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
// scroll through the page like a reader would: cards that only work on screen (camera stills) get their turn
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += 700) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(120);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1400); // entrance and draw-in animations settle
if (args.fit === '1') {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: Number(args.viewport), height });
  await page.waitForTimeout(400);
}
const out = resolve(
  args.out || `../../apps/playground/out/${args.sheet || 'all'}-${args.mode}.png`,
);
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
for (const p of problems) console.log(p);
process.exitCode = problems.some((p) => p.startsWith('pageerror') || p.startsWith('error')) ? 1 : 0;
