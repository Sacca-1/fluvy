#!/usr/bin/env node
/**
 * Interaction tests of the History page on the playground, in a real Chromium (what a test DOM cannot show: a finger
 * dragged across a chart, layout-measured columns, a popover that closes on Escape). Exit code 1 on any failure.
 *   node interactions-history.mjs            (expects the playground dev server on :5183)
 * What it proves: pointing at one chart reads every chart at the same instant; the search narrows what is drawn and
 * says so when nothing matches; moving the window reads it again (a week comes back summarised); the legend opens
 * the series that did not fit; the dates popover and the sources drawer open and leave; nothing is cut at a phone's
 * width, and the page measures its own column.
 */
import { leaveChart, mousePointer, scrubPlot } from './lib/gestures.mjs';
import { startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

/** The History page on the playground's made-up house, nothing live — waited for, never guessed at. */
const open = async (query = '', width = 1440, height = 1000) => {
  // the clock pinned to the sheets' evening: the canned day's stretches (an unavailable one among them) never depend on the hour the suite runs at
  const page = await suite.page(`history=1&live=0&at=2026-09-17T21:47:12&${query}`, {
    viewport: { width, height },
    wait: 200,
  });
  await page.waitForFunction(
    () => document.querySelector('fluvy-history')?.shadowRoot?.querySelector('.hs-main') !== null,
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(900);
  return page;
};

const inside = (page, fn) =>
  page.evaluate(
    ({ body }) => new Function('root', body)(document.querySelector('fluvy-history').shadowRoot),
    { body: fn },
  );

/* ---------- one cursor: pointing at a chart reads every chart ---------- */
{
  const page = await open('lang=en');
  const plots = await page.locator('fluvy-history .hs-plot').count();
  check('a chart per measure is drawn', plots >= 2, `${plots} plots`);
  const box = await page.locator('fluvy-history .hs-plot').first().boundingBox();
  const pointer = mousePointer(page);
  await scrubPlot(pointer, box, { from: 0.3, to: 0.62 });
  await page.waitForTimeout(220);
  const read = await inside(
    page,
    `const cursors = [...root.querySelectorAll('.hs-cursor')].map((l) => Number(l.getAttribute('x1')) / l.closest('svg').viewBox.baseVal.width);
     return {
       cursors,
       when: root.querySelector('.hs-card__when')?.textContent.trim() ?? '',
       bubbles: root.querySelectorAll('.fv-bubble').length,
     };`,
  );
  const spread = Math.max(...read.cursors) - Math.min(...read.cursors);
  check('every chart reads the same instant', spread < 0.01, `spread ${spread.toFixed(4)}`);
  check('the head says when, not "now"', /\d/.test(read.when), read.when);
  check('a single curve gets its bubble', read.bubbles >= 1, `${read.bubbles} bubbles`);
  // a mouse keeps the reading until it leaves the chart (a finger lets go at once)
  await leaveChart(pointer, box);
  await page.waitForTimeout(260);
  const back = await inside(
    page,
    `return root.querySelector('.hs-card__when')?.textContent.trim() ?? '';`,
  );
  check('letting go reads now again', back === 'now', back);
  await page.close();
}

/* ---------- the search narrows what is drawn ---------- */
{
  const page = await open('lang=en');
  await page.locator('fluvy-history #hs-search').fill('terrace');
  await page.waitForTimeout(400);
  const narrowed = await inside(
    page,
    `return {
       series: root.querySelectorAll('.hs-series').length,
       cards: [...root.querySelectorAll('.fv-card__title')].map((n) => n.textContent.trim()),
       sub: root.querySelector('.hs-head__sub').textContent.trim(),
     };`,
  );
  check(
    'only what matches is drawn',
    narrowed.series === 1 &&
      narrowed.cards.join() === 'Temperature' &&
      /1 measure/.test(narrowed.sub),
    `${narrowed.series} series · ${narrowed.cards.join(', ')} · ${narrowed.sub}`,
  );
  await page.locator('fluvy-history #hs-search').fill('zzzz');
  await page.waitForTimeout(400);
  const nothing = await inside(
    page,
    `return root.querySelector('.hs-empty')?.textContent.trim() ?? '';`,
  );
  check('a search with no answer says so', /name/i.test(nothing), nothing.slice(0, 60));
  await page.close();
}

/* ---------- moving the window reads it again ---------- */
{
  const page = await open('lang=en&moment=week');
  const week = await inside(
    page,
    `return {
       title: root.querySelector('.hs-head__title').textContent.trim(),
       sub: root.querySelector('.fv-card__sub')?.textContent.trim() ?? '',
       points: (root.querySelector('path.hs-line')?.getAttribute('d')?.match(/[CL]/g) ?? []).length,
     };`,
  );
  check('a week names its days', /–/.test(week.title), week.title);
  check('a week is drawn from the statistics', /average/i.test(week.sub), week.sub);
  check('a week draws a full curve', week.points > 40, `${week.points} points`);
  await page.close();
}

/* ---------- the legend opens the series that did not fit ---------- */
{
  const page = await open('lang=en&moment=many');
  const before = await inside(page, `return root.querySelectorAll('.hs-legend__row').length;`);
  await page.locator('fluvy-history .hs-legend__more').first().click();
  await page.waitForTimeout(300);
  const after = await inside(
    page,
    `return { rows: root.querySelectorAll('.hs-legend__row').length, more: root.querySelectorAll('.hs-legend__more').length };`,
  );
  check(
    'the rest of the series are one tap away',
    after.rows > before && after.more === 0,
    `${before} → ${after.rows}`,
  );
  await page.close();
}

/* ---------- nothing is read past what has happened ---------- */
{
  const page = await open('lang=en');
  // the window the page opens on ends at now: its last quarter is drawn, and nothing beyond it is
  const box = await page.locator('fluvy-history .hs-plot').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
  await page.waitForTimeout(220);
  const end = await inside(
    page,
    `const svg = root.querySelector('.hs-plot svg');
     const line = svg.querySelector('.hs-cursor');
     const dot = svg.querySelector('.hs-dot');
     const path = svg.querySelector('path.hs-line').getAttribute('d');
     const last = Number(path.slice(path.lastIndexOf('C')).split(' ').pop().split(',')[0]);
     return { cursor: Number(line.getAttribute('x1')), dot: dot ? Number(dot.getAttribute('cx')) : null, last };`,
  );
  check(
    'the cursor stops where the record does',
    end.cursor <= end.last + 1 && (end.dot === null || end.dot <= end.last + 1),
    `cursor ${end.cursor.toFixed(1)} · dot ${end.dot?.toFixed(1)} · drawn to ${end.last.toFixed(1)}`,
  );
  await page.mouse.up();
  await page.close();
}

/* ---------- a series keeps its colour through a search ---------- */
{
  const page = await open('lang=en&moment=many');
  const colourOf = () =>
    inside(
      page,
      `const out = {};
       for (const row of root.querySelectorAll('.hs-legend__row')) {
         const name = row.querySelector('.hs-legend__name').textContent.trim();
         out[name] = getComputedStyle(row.querySelector('.hs-legend__dot')).backgroundColor;
       }
       return out;`,
    );
  const before = await colourOf();
  await page.locator('fluvy-history #hs-search').fill('o');
  await page.waitForTimeout(400);
  const after = await colourOf();
  const moved = Object.keys(after).filter((name) => before[name] && before[name] !== after[name]);
  check('a keystroke never recolours a line', moved.length === 0, moved.join(', '));
  await page.close();
}

/* ---------- a state line says more than on and off, and opens the ones it folded ---------- */
{
  const page = await open('lang=en&moment=states');
  const tones = await inside(
    page,
    `return {
       quiet: root.querySelectorAll('.hs-span.is-quiet').length,
       away: root.querySelectorAll('.hs-span.is-away').length,
       rows: root.querySelectorAll('.hs-line-row').length,
       more: root.querySelectorAll('.hs-more').length,
     };`,
  );
  check(
    'a stretch can say paused, and can say nothing was known',
    tones.quiet > 0 && tones.away > 0,
    `${tones.quiet} quiet · ${tones.away} away`,
  );
  check('the lines it cannot draw are offered', tones.more === 1, `${tones.rows} rows`);
  await page.locator('fluvy-history .hs-more').click();
  await page.waitForTimeout(300);
  const opened = await inside(
    page,
    `return { rows: root.querySelectorAll('.hs-line-row').length, more: root.querySelectorAll('.hs-more').length };`,
  );
  check(
    'and one tap draws them',
    opened.rows > tones.rows && opened.more === 0,
    `${tones.rows} → ${opened.rows}`,
  );
  await page.close();
}

/* ---------- the keys read a chart without a pointer ---------- */
{
  const page = await open('lang=en');
  await page.locator('fluvy-history .hs-plot').first().focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(250);
  const home = await inside(
    page,
    `return { when: root.querySelector('.hs-card__when')?.textContent.trim() ?? '', tail: root.querySelector('.fv-bubble')?.style.getPropertyValue('--tail') ?? '' };`,
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const moved = await inside(
    page,
    `return root.querySelector('.hs-card__when')?.textContent.trim() ?? '';`,
  );
  check('Home reads the start of the window', /\d/.test(home.when), home.when);
  check('an arrow moves the reading on', moved !== home.when, `${home.when} → ${moved}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const let_go = await inside(
    page,
    `return root.querySelector('.hs-card__when')?.textContent.trim() ?? '';`,
  );
  check('Escape lets the chart go', let_go === 'now', let_go);
  await page.close();
}

/* ---------- the layers open and leave ---------- */
{
  const page = await open('lang=en');
  await page.locator('fluvy-history .hs-pick').click();
  await page.waitForTimeout(400);
  check(
    'the calendar opens a popover',
    (await page.locator('fluvy-history .fv-popover').count()) === 1,
  );
  // the picker's words are the pages' shared ones: since 1.8.0 this page said the raw "from" and "to"
  const times = await page
    .locator('fluvy-history fluvy-date-picker .ad-time > span')
    .allTextContents();
  check('its times say From and To', times.join() === 'From,To', times.join());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes it', (await page.locator('fluvy-history .fv-popover').count()) === 0);
  await page.locator('fluvy-history .hs-sources').click();
  await page.waitForTimeout(400);
  check(
    'the sources open a drawer',
    (await page.locator('fluvy-history .fv-drawer').count()) === 1,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the drawer', (await page.locator('fluvy-history .fv-drawer').count()) === 0);
  await page.close();
}

/* ---------- the picker in another language: its words, never its keys ---------- */
{
  const page = await open('lang=de');
  await page.locator('fluvy-history .hs-pick').click();
  await page.waitForTimeout(400);
  const times = await page
    .locator('fluvy-history fluvy-date-picker .ad-time > span')
    .allTextContents();
  check('de: its times say Von and Bis', times.join() === 'Von,Bis', times.join());
  await page.close();
}

/* ---------- a phone: nothing cut, its own column measured ---------- */
for (const width of [320, 412]) {
  const page = await open('lang=es', width, 900);
  const cut = await inside(
    page,
    `const out = [];
     for (const node of root.querySelectorAll('.hs-head__title, .hs-head__sub, .fv-btn, .hs-legend__value, .hs-line__state, .fv-readout__value, .fv-axis span')) {
       const box = node.getBoundingClientRect();
       if (!box.width) continue;
       if (node.scrollWidth > node.clientWidth + 1) out.push(node.className + ': ' + node.textContent.trim());
     }
     const main = root.querySelector('.hs-main');
     return { out: [...new Set(out)], main: main.clientWidth };`,
  );
  const measured = await page.evaluate(() => document.querySelector('fluvy-history').mainWidth);
  check(
    `${width} es: no value or title cut`,
    cut.out.length === 0,
    cut.out.slice(0, 3).join(' · '),
  );
  check(
    `${width}: measured with its own column`,
    cut.main === measured,
    `${measured} of ${cut.main}`,
  );
  await page.close();
}

await suite.finish();
