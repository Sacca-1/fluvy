#!/usr/bin/env node
/**
 * The README's motion clips, recorded on the playground (the real cards, the simulated hass, the clock pinned) with
 * the gestures the interaction suites prove: the precision dimmer, the energy flow changing pace, a palette applied
 * in the settings panel, a scrub across the History charts. Each clip becomes a GIF (what GitHub and HACS show) and
 * an mp4 beside it, in `docs/media/`.
 *
 *   node tools/render/clip.mjs                                 every clip (the playground at $PLAYGROUND, else :5183)
 *   node tools/render/clip.mjs --clip dimmer,palette --out docs/media
 *   --url http://127.0.0.1:5183/  --fps 30  --gif-fps 20  --max-gif-kb 4096  --keep-frames 1
 *
 * Frames are the screencast's, at CSS pixels (Chromium delivers no more, whatever the device scale factor): the
 * GIF is shown at that size and stays crisp; the mp4 is the same picture.
 *
 * Exit code 1 when a page throws, a clip cannot find its target, or a GIF is over budget.
 */
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseArgs, launchOptions, PLAYGROUND } from './lib.mjs';
import { encode, ffmpegVersion, record } from './lib/capture.mjs';
import {
  driftDrag,
  holdForFine,
  leaveChart,
  relativeDrag,
  rulerGeometry,
  scrubPlot,
} from './lib/gestures.mjs';
import { touchPointer } from './lib/pointer.mjs';

const args = parseArgs(process.argv.slice(2), {
  clip: '',
  url: PLAYGROUND,
  out: 'docs/media',
  fps: '30',
  'gif-fps': '20',
  'max-gif-kb': '4096',
  'keep-frames': '0',
});

/** The moment every sheet shows (Thursday 17 September 2026, 21:47): the clips say the same time as the stills. */
const AT = '2026-09-17T21:47:12';

/** A tap through the pointer: the ring travels there, presses and lets go. */
async function tap(pointer, locator, { travel = 12 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`nothing to tap at ${locator}`);
  await pointer.move(box.x + box.width / 2, box.y + box.height / 2, travel);
  await pointer.wait(140);
  await pointer.down();
  await pointer.wait(90);
  await pointer.up();
}

/**
 * Each clip: the playground query, the viewport, what to crop to (`target`, a selector; the frame's siblings are
 * hidden so it sits alone at the top), how much room around it, and the gesture.
 */
const CLIPS = {
  dimmer: {
    query: `sheet=slider&width=360&at=${AT}`,
    viewport: { width: 600, height: 640 },
    target: '[data-frame="slider/On"]',
    only: true,
    pad: 16,
    async run(page, pointer) {
      const card = page.locator('fluvy-light-card').first();
      const ruler = card.locator('fluvy-ruler').first();
      const geo = await rulerGeometry(ruler.locator('.fv-ruler'), ruler.locator('.fv-knob'));
      await pointer.move(geo.at(30), geo.y + 90);
      await pointer.wait(500);
      // a relative drag: grab anywhere on the scale, the value moves with the finger
      await relativeDrag(pointer, geo, { grab: 30, to: 45, steps: [4, 18] });
      await pointer.wait(800);
      // sliding away from the ruler makes the drag finer; coming back never leaps
      await driftDrag(pointer, geo, {
        from: 85,
        to: 50,
        drift: 60,
        far: 130,
        travel: 24,
        pause: 500,
      });
      await pointer.wait(800);
      // hold before moving: the 1 % scale, anchored under the finger
      await holdForFine(pointer, geo, { hold: 700, travel: 10, steps: 18, settle: 700 });
      await pointer.hide();
      await pointer.wait(500);
    },
  },
  'energy-flow': {
    query: `sheet=flow&width=360&at=${AT}`,
    viewport: { width: 600, height: 720 },
    target: '[data-frame="flow/The #19 house"]',
    only: true,
    pad: 16,
    async run(page) {
      // a day on the #19 house: midday, importing on two phases while the third exports; then all sun, the battery
      // filling and the surplus going out; then the evening, the battery running the house — every lane in its
      // origin's colour, the pulses' pace following the power, the arcs sliding to the new mix
      const readings = (solar, l1, l2, l3, battery) =>
        page.evaluate(
          ([s, a, b, c, d]) => {
            window.fluvyMock.set('sensor.fl_solar', s);
            window.fluvyMock.set('sensor.fl_l1', a);
            window.fluvyMock.set('sensor.fl_l2', b);
            window.fluvyMock.set('sensor.fl_l3', c);
            window.fluvyMock.set('sensor.fl_battery', d);
          },
          [solar, l1, l2, l3, battery],
        );
      await page.waitForTimeout(3200);
      await readings('4.8', '-2.1', '100', '0.1', '-1400');
      await page.waitForTimeout(3600);
      await readings('0', '0.1', '150', '0.15', '1200');
      await page.waitForTimeout(3600);
    },
  },
  palette: {
    query: `panel=appearance&at=${AT}`,
    viewport: { width: 1280, height: 800 },
    target: null,
    pad: 0,
    gifWidth: 720,
    async run(page, pointer) {
      const swatch = (name) =>
        page.locator('.pn-swatch', { has: page.locator('.pn-swatch__name', { hasText: name }) });
      await pointer.move(640, 560);
      await pointer.wait(400);
      await tap(pointer, swatch('Volt'));
      await pointer.wait(1300);
      await tap(pointer, swatch('Blaze'));
      await pointer.wait(1300);
      await tap(pointer, page.locator('.pn-custom'));
      await pointer.wait(900);
      await tap(pointer, page.locator('.pn-dot').nth(8));
      await pointer.wait(1300);
      await tap(pointer, page.locator('.pn-bar button', { hasText: 'Apply to the house' }));
      await pointer.wait(1600);
      await pointer.hide();
      await pointer.wait(400);
    },
  },
  'history-scrub': {
    query: `history=1&live=0&lang=en&at=${AT}`,
    viewport: { width: 1024, height: 720 },
    target: null,
    pad: 0,
    gifWidth: 720,
    async ready(page) {
      await page.waitForFunction(
        () =>
          document.querySelector('fluvy-history')?.shadowRoot?.querySelector('.hs-main') !== null,
        null,
        { timeout: 20000 },
      );
    },
    async run(page, pointer) {
      const box = await page.locator('fluvy-history .hs-plot').first().boundingBox();
      await pointer.move(box.x + box.width * 0.3, box.y + box.height + 80);
      await pointer.wait(500);
      await scrubPlot(pointer, box, { from: 0.3, to: 0.62, steps: 44 });
      await pointer.wait(1200);
      await pointer.move(box.x + box.width * 0.85, box.y + box.height / 2, 36);
      await pointer.wait(1100);
      await leaveChart(pointer, box, { above: 80, steps: 14 });
      await pointer.hide();
      await pointer.wait(900);
    },
  },
};

const wanted = args.clip ? args.clip.split(',') : Object.keys(CLIPS);
for (const name of wanted)
  if (!CLIPS[name])
    throw new Error(`Unknown clip "${name}". Known: ${Object.keys(CLIPS).join(', ')}`);

console.log(await ffmpegVersion());
const out = resolve(args.out);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(launchOptions);
let failed = false;

for (const name of wanted) {
  const clip = CLIPS[name];
  const page = await browser.newPage({
    viewport: clip.viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${args.url}?${clip.query}`);
  await page.waitForSelector('html[data-ready="1"]');
  if (clip.ready) await clip.ready(page);
  await page.waitForTimeout(900);
  let box = { x: 0, y: 0, width: clip.viewport.width, height: clip.viewport.height };
  if (clip.target) {
    const target = page.locator(clip.target).first();
    if (clip.only)
      await target.evaluate((el) => {
        for (const frame of document.querySelectorAll('.pg-frame'))
          if (frame !== el) frame.style.display = 'none';
      });
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    const found = await target.boundingBox();
    if (!found) throw new Error(`${name}: ${clip.target} is not on the page`);
    box = found;
  }
  // the crop: the target and its room, kept inside the viewport, in frame pixels
  const x0 = Math.max(0, box.x - clip.pad);
  const y0 = Math.max(0, box.y - clip.pad);
  const x1 = Math.min(clip.viewport.width, box.x + box.width + clip.pad);
  const y1 = Math.min(clip.viewport.height, box.y + box.height + clip.pad);
  const pointer = await touchPointer(page);
  const dir = await mkdtemp(join(tmpdir(), `fluvy-clip-${name}-`));
  const {
    frames,
    times,
    scale: captured,
  } = await record(page, { dir }, () => clip.run(page, pointer));
  const crop = {
    x: x0 * captured,
    y: y0 * captured,
    width: (x1 - x0) * captured,
    height: (y1 - y0) * captured,
  };
  const seconds = times.length > 1 ? times[times.length - 1] - times[0] : 0;
  try {
    const outputs = await encode({
      frames,
      times,
      crop,
      mp4: join(out, `${name}.mp4`),
      gif: join(out, `${name}.gif`),
      fps: Number(args.fps),
      gifFps: Number(args['gif-fps']),
      gifWidth: clip.gifWidth ?? Math.round(x1 - x0),
      maxGifKb: Number(args['max-gif-kb']),
    });
    const sizes = await Promise.all(
      outputs.map(
        async (file) =>
          `${file.split('/').pop()} ${((await stat(file)).size / 1024).toFixed(0)} KB`,
      ),
    );
    console.log(
      `✓ ${name}: ${frames.length} frames over ${seconds.toFixed(1)} s (${(frames.length / Math.max(seconds, 0.001)).toFixed(0)} fps) → ${sizes.join(' · ')}`,
    );
  } catch (error) {
    failed = true;
    console.error(`✗ ${name}: ${error.message}`);
  }
  if (errors.length) {
    failed = true;
    console.error(`✗ ${name}: the page reported errors\n  ${errors.join('\n  ')}`);
  }
  if (args['keep-frames'] === '1') console.log(`  frames kept in ${dir}`);
  else await rm(dir, { recursive: true, force: true });
  await page.close();
}

await browser.close();
process.exitCode = failed ? 1 : 0;
