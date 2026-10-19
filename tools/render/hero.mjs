#!/usr/bin/env node
/**
 * The README's hero: the playground's `hero` sheet (tiles, a compact thermostat, the energy chart, the player) in
 * one row on the palette's own page colour, without the playground's frame boxes — the same picture in any
 * palette, light or dark.
 *   node hero.mjs --palette blaze --out ../../docs/images/hero-blaze.png     (the playground at $PLAYGROUND, else :5183)
 *   --mode dark  --width 420  --gap 32  --url http://127.0.0.1:5183/
 */
import { chromium } from 'playwright';
import { parseArgs, launchOptions, PLAYGROUND } from './lib.mjs';

const args = parseArgs(process.argv.slice(2), {
  palette: 'linen',
  mode: 'light',
  width: '420',
  gap: '32',
  // another sheet as a wrapping grid of its frames, `columns` to a row: the README's card galleries
  sheet: 'hero',
  columns: '4',
  url: PLAYGROUND,
  out: '',
  at: '2026-09-17T21:47:12',
});
if (!args.out) throw new Error('hero.mjs: --out is required');

const width = Number(args.width);
const gap = Number(args.gap);
const columns = Number(args.columns);
const query = new URLSearchParams({
  sheet: args.sheet,
  width: String(width),
  palette: args.palette,
  mode: args.mode,
  lang: 'en',
  at: args.at,
});
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({
  viewport: { width: columns * width + (columns + 1) * gap, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: args.mode === 'dark' ? 'dark' : 'light',
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`${args.url}?${query}`);
await page.waitForSelector('html[data-ready="1"]');
// the page's colour behind the cards, the frames as plain sections, one row
await page.addStyleTag({
  content: `body { background: var(--fluvy-page); }
.pg-stage { gap: ${gap}px; padding: ${gap}px; flex-wrap: ${args.sheet === 'hero' ? 'nowrap' : 'wrap'}; justify-content: flex-start; align-items: flex-start; }
.pg-frame { padding: 0; background: transparent; box-shadow: none; border-radius: 0; }
[data-stress] { display: none; }`,
});
await page.waitForTimeout(1200);
const stage = page.locator('.pg-stage');
const box = await stage.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.waitForTimeout(300);
await stage.screenshot({ path: args.out });
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `${args.out}: ${Math.ceil(box.width)}×${Math.ceil(box.height)} (${args.palette}, ${args.mode})`,
);
