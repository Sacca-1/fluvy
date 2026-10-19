#!/usr/bin/env node
/**
 * The Activity page at its moments, on the playground's made-up house (clock fixed, no live entries):
 *   node activity-states.mjs --viewport 1440 --height 900 --mode light --lang en --out ../../apps/playground/out/activity
 * Writes <out>-<moment>.png for: top, scrolled (the morning), detail (a row unfolded), burst (the restart unfolded),
 * dates (the date picker), sources (the sheet), scrub (a finger on the rail, mid-drag), end (the rail's End key),
 * bottom (the wheel to the end of the scroll).
 * Prints the page's console errors: the page must never throw.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseArgs, launchOptions, PLAYGROUND } from './lib.mjs';

const args = parseArgs(process.argv.slice(2), {
  viewport: '1440',
  height: '900',
  mode: 'light',
  lang: 'en',
  palette: '',
  card: '',
  at: '2026-09-17T21:47:12',
  url: PLAYGROUND,
  out: '../../apps/playground/out/activity',
  only: '',
  scale: '2',
});
const query = new URLSearchParams({
  activity: '1',
  live: '0',
  at: args.at,
  mode: args.mode,
  lang: args.lang,
  ...(args.palette ? { palette: args.palette } : {}),
  ...(args.card ? { card: '1' } : {}),
});
const browser = await chromium.launch(launchOptions);
const problems = [];
/** Moments the playground reaches itself (`&moment=`), and the page linked from a more-info (`&entity_id=…`). */
const QUERY = {
  week: 'moment=week',
  nomatch: 'moment=nomatch',
  fresh: 'moment=fresh',
  drop: 'moment=drop',
  loading: 'moment=loading',
  empty: 'moment=empty',
  linked: 'entity_id=light.kitchen&start_date=2026-09-16T21%3A47%3A12',
};
const WAIT = { drop: 250, loading: 0, fresh: 1200 };
const moments = {
  top: async () => {},
  ...Object.fromEntries(Object.keys(QUERY).map((name) => [name, async () => {}])),
  scrolled: async (page) => {
    await page.evaluate(() => {
      const view = document.querySelector('fluvy-activity');
      const row = [...view.shadowRoot.querySelectorAll('.av-row')].find((node) =>
        /07:|08:1/.test(node.querySelector('.av-time')?.textContent ?? ''),
      );
      const scroller = view.shadowRoot.querySelector('.av-scroll');
      row.closest('.av-section').style.contentVisibility = 'visible';
      scroller.scrollTop =
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        120;
    });
  },
  detail: async (page) => {
    await page.evaluate(() => {
      const view = document.querySelector('fluvy-activity');
      const rows = [...view.shadowRoot.querySelectorAll('.av-row')];
      rows[1]?.click();
    });
  },
  burst: async (page) => {
    await page.evaluate(() => {
      const view = document.querySelector('fluvy-activity');
      view.shadowRoot.querySelectorAll('.av-filters .fv-chip')[1]?.click(); // everything
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const view = document.querySelector('fluvy-activity');
      const row = [...view.shadowRoot.querySelectorAll('.av-row')].find(
        (node) => node.querySelector('.av-chevron') && /restart|reinici/i.test(node.textContent),
      );
      const scroller = view.shadowRoot.querySelector('.av-scroll');
      row.closest('.av-section').style.contentVisibility = 'visible';
      scroller.scrollTop =
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        60;
      row.click();
    });
  },
  // real clicks (a pointer): a layer opened by a tap shows no focus ring, as on a phone
  dates: async (page) => {
    const pick = page.locator('fluvy-activity .av-day__pick');
    await (
      (await pick.isVisible()) ? pick : page.locator('fluvy-activity .av-day__titles')
    ).click();
  },
  end: async (page) => {
    await page.evaluate(() => {
      const rail = document
        .querySelector('fluvy-activity')
        .shadowRoot.querySelector('fluvy-time-rail');
      rail.focus();
      rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    await page.waitForTimeout(900);
    // the focus ring and the bubble are the keyboard's: blur to see the page at rest
    await page.evaluate(() =>
      document.querySelector('fluvy-activity').shadowRoot.activeElement?.blur(),
    );
  },
  bottom: async (page) => {
    const box = await page.evaluate(() => {
      const r = document
        .querySelector('fluvy-activity')
        .shadowRoot.querySelector('.av-scroll')
        .getBoundingClientRect();
      return { x: r.x + r.width / 3, y: r.y + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(40);
    }
  },
  sources: async (page) => {
    await page.locator('fluvy-activity .av-sources').click();
  },
  scrub: async (page) => {
    const box = await page.evaluate(() => {
      const rail = document
        .querySelector('fluvy-activity')
        .shadowRoot.querySelector('fluvy-time-rail');
      const r = rail.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const x = box.x + box.w - 30;
    await page.mouse.move(x, box.y + box.h * 0.15);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(x, box.y + box.h * (0.15 + i * 0.035));
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);
    await shoot(page, 'scrub');
    await page.mouse.up();
    await page.waitForTimeout(900);
    return 'scrub-settled';
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
  await page.waitForTimeout(QUERY[name] && name !== 'linked' ? 700 : 1200);
  const after = await act(page);
  await page.waitForTimeout(WAIT[name] ?? 700);
  await shoot(page, after ?? name);
  await page.close();
}
await browser.close();
for (const p of problems) console.log(p);
process.exitCode = problems.length ? 1 : 0;
