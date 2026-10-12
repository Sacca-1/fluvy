/**
 * The harness every interaction suite shares: one browser, a pass / fail line per check, the playground's mock
 * (its service calls, its more-info requests) and the exit code. A suite opens its pages with `sheet()` (a design
 * sheet's real cards) or its own URL through `page()`.
 *
 *   const suite = await startSuite();
 *   const page = await suite.sheet('devices', { width: 360 });
 *   suite.check('the switch flips', ok, detail);
 *   await suite.finish();
 *
 * Chromium by default; `ENGINE=webkit` (or `firefox`) runs a suite in another engine Playwright ships, for what
 * the engines do differently (a zoomed view's geometry).
 */
import { chromium, firefox, webkit } from 'playwright';
import { launchOptions } from '../lib.mjs';

export const BASE = process.env.PLAYGROUND ?? 'http://127.0.0.1:5183/';
export const ENGINE = process.env.ENGINE ?? 'chromium';

/** The engine `ENGINE` names, launched as every tool launches it (Chromium's flags are Chromium's alone). */
export function launch() {
  const engine = { chromium, firefox, webkit }[ENGINE];
  if (!engine) throw new Error(`ENGINE must be chromium, webkit or firefox, not "${ENGINE}"`);
  return engine.launch(ENGINE === 'chromium' ? launchOptions : {});
}

/** Counts live intervals and listens for more-info requests, before any card is created. */
const INIT = `(() => {
  const live = new Set();
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = (...a) => { const id = si(...a); live.add(id); return id; };
  window.clearInterval = (id) => { live.delete(id); return ci(id); };
  window.__intervals = () => live.size;
  window.__moreInfo = [];
  window.addEventListener('hass-more-info', (e) => window.__moreInfo.push(e.detail.entityId));
})()`;

export async function startSuite() {
  const browser = await launch();
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  };
  /** A playground page at `query`, ready (its cards defined and settled). */
  const page = async (
    query,
    { viewport = { width: 1400, height: 1000 }, clock = false, wait = 900 } = {},
  ) => {
    const p = await browser.newPage({ viewport });
    await p.addInitScript(INIT);
    if (clock) await p.clock.install();
    await p.goto(`${BASE}?${query}`);
    await p.waitForSelector('html[data-ready="1"]');
    await p.waitForTimeout(wait);
    return p;
  };
  /** A design sheet's real cards, at a frame width (the sheets' 360 by default). */
  const sheet = (name, { width = 360, lang = 'en', clock = false, extra = '' } = {}) =>
    page(`sheet=${name}&width=${width}&lang=${lang}${extra}`, { clock });
  const finish = async () => {
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exitCode = failed.length ? 1 : 0;
  };
  return { browser, check, page, sheet, finish, results };
}

/** The services the cards called on the mock, since the last reset. */
export const calls = (page) =>
  page.evaluate(() =>
    window.fluvyMock.calls.map((c) => ({ s: `${c.domain}.${c.service}`, d: c.data, t: c.target })),
  );

/** The REST calls the cards made on the mock (their method, path and body), since the last reset. */
export const apiCalls = (page) => page.evaluate(() => window.fluvyMock.apiCalls.slice());

/** Forgets the calls, the REST calls and the more-info requests seen so far. */
export const reset = (page) =>
  page.evaluate(() => {
    window.fluvyMock.calls.length = 0;
    window.fluvyMock.apiCalls.length = 0;
    if (window.__moreInfo) window.__moreInfo.length = 0;
  });

/** The more-info requests the cards made. */
export const moreInfo = (page) => page.evaluate(() => window.__moreInfo.slice());

export const settle = (page, ms = 400) => page.waitForTimeout(ms);

/** The card of a sheet's frame by title, so the tests read like the sheets. */
export const frame = (page, title) =>
  page.locator(`[data-frame$="/${title}"], [data-stress$="/${title}"]`);

/** Quick taps on a stepper half (pointer events, like a finger). */
export async function taps(half, n = 3) {
  for (let i = 0; i < n; i++) {
    await half.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
    await half.dispatchEvent('pointerup');
    await half.page().waitForTimeout(50);
  }
}

/** The dev server's own client keeps one interval alive on every page; a card must leave no more than that. */
export const PAGE_INTERVALS = 1;
