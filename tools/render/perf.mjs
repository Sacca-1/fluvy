#!/usr/bin/env node
/**
 * Runtime cost on the playground: first paint of a full page of cards, and the per-update cost while
 * every card receives a new `hass` twenty times a second for five seconds (each update touches EVERY
 * entity, the worst case: a real instance changes a handful). Long tasks (> 50 ms) are counted with a
 * PerformanceObserver; the budget is 0 long tasks over 100 ms.
 *   PLAYGROUND=http://127.0.0.1:5184/ node perf.mjs [--sheet home] [--cards 40] [--cpu 4]
 */
import { chromium } from 'playwright';
import { launchOptions, PLAYGROUND } from './lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = PLAYGROUND;
const sheet = arg('sheet', '');
const wanted = Number(arg('cards', 40));
const cpu = Number(arg('cpu', 1));

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const cdp = await page.context().newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

await page.goto(`${BASE}${sheet ? `?sheet=${sheet}` : ''}`);
await page.waitForSelector('html[data-ready="1"]');
const paint = await page.evaluate(() => {
  const p = Object.fromEntries(
    performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]),
  );
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    ...p,
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(nav.loadEventEnd),
    cards: document.querySelectorAll('#stage > section > *').length,
  };
});
console.log(
  `first paint ${paint['first-paint']} ms · first contentful paint ${paint['first-contentful-paint']} ms · DOMContentLoaded ${paint.domContentLoaded} ms · load ${paint.load} ms · ${paint.cards} cards on the page${cpu > 1 ? ` · CPU ×${cpu} slower` : ''}`,
);

const result = await page.evaluate(async (count) => {
  const all = [...document.querySelectorAll('#stage > section > *')].filter(
    (el) => el.hass && el.config,
  );
  const cards = all.slice(0, count);
  const base = window.fluvyMock.hass();
  const longTasks = [];
  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
  });
  observer.observe({ type: 'longtask', buffered: false });
  const updateTimes = [];
  let frames = 0;
  let rafId;
  const countFrames = () => {
    frames++;
    rafId = requestAnimationFrame(countFrames);
  };
  rafId = requestAnimationFrame(countFrames);
  const started = performance.now();
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    // every entity changes: a fresh state object per entity, numbers nudged so the DOM really updates
    const states = {};
    for (const [id, s] of Object.entries(base.states)) {
      const n = Number(s.state);
      states[id] = {
        ...s,
        state:
          Number.isFinite(n) && /\d/.test(s.state)
            ? String(Math.round((n + (i % 2 ? 0.1 : -0.1)) * 100) / 100)
            : s.state,
        last_updated: new Date().toISOString(),
      };
    }
    const next = { ...base, states };
    for (const card of cards) card.hass = next;
    await Promise.all(cards.map((c) => c.updateComplete));
    updateTimes.push(performance.now() - t0);
    const wait = 50 - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  const elapsed = performance.now() - started;
  cancelAnimationFrame(rafId);
  await new Promise((r) => setTimeout(r, 120));
  observer.disconnect();
  for (const card of cards) card.hass = base;
  updateTimes.sort((a, b) => a - b);
  const at = (q) =>
    updateTimes[Math.min(updateTimes.length - 1, Math.floor(q * updateTimes.length))];
  return {
    cards: cards.length,
    elapsed: Math.round(elapsed),
    fps: Math.round((frames / elapsed) * 1000),
    median: at(0.5).toFixed(1),
    p95: at(0.95).toFixed(1),
    max: at(1).toFixed(1),
    mean: (updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length).toFixed(1),
    longTasks,
  };
}, wanted);

const over = result.longTasks.filter((d) => d > 100);
console.log(
  `${result.cards} cards × 100 updates in ${result.elapsed} ms (target 5000) · per update: median ${result.median} ms · mean ${result.mean} ms · p95 ${result.p95} ms · max ${result.max} ms · ${result.fps} fps during the burst`,
);
console.log(
  `long tasks (> 50 ms): ${result.longTasks.length}${result.longTasks.length ? ` [${result.longTasks.join(', ')}]` : ''} · over 100 ms: ${over.length}`,
);
await browser.close();
process.exit(over.length ? 1 : 0);
