#!/usr/bin/env node
/**
 * The history bars, 1.8 (issue #38), on the playground's `history-bars` sheet (real cards, simulated hass). Exit
 * code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5186/ node interactions-history-bars.mjs
 * What it proves: the seven finished days of the mock-up read with their values, their dates and a nice scale, the
 * head's total and daily average add up and sit beside the title on a wide card (on their own row on a phone);
 * a pointer over a bar reads its day in the readouts' place and leaves everything as it was, the keys walk the
 * bars; a fact opens the sensor (its own action when it has one) and the strip folds its circles away on a phone
 * and keeps them on a wide card; thirty days write no values and thin their dates 12 apart; a narrow column folds
 * the readouts and the facts; a mean, the day in progress, a Wh meter read in kWh, everything off; no statistics,
 * unavailable and missing each say so; and the words in German and French. Then 1.9 (#44, #45): a day counter and a
 * monthly rain gauge as Home Assistant counts them and from zero on their cycles, to the tenth; the bar in progress
 * read as "Today"; a reading at the end by month; a lifetime meter after a restart; a sensor read from its history;
 * bars below zero and the one in progress in colours of their own, the sparkline's below zero drawn; today live with
 * no question to the recorder; a failed read asked again a minute on; a headless chart's tap; and what ten cards and
 * five power sensors ask the recorder in a minute, held under a ceiling.
 */
import { BASE, frame, moreInfo, reset, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const open = async (width = 360, lang = 'en') => {
  const page = await suite.sheet('history-bars', { width, lang });
  await page.waitForTimeout(600);
  return page;
};
const card = (page, title) => frame(page, title).locator('fluvy-history-bars-card').first();
const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();

/** The head's readouts as "LABEL value unit", wherever they sit. */
const readouts = (c) =>
  c.evaluate((el) =>
    [...el.shadowRoot.querySelectorAll('.hb-readouts .fv-readout, .hb-cols .fv-readout')].map(
      (r) =>
        `${r.querySelector('.fv-readout__label').textContent.trim()} ${r
          .querySelector('.fv-readout__value')
          .textContent.replace(/\s+/g, '')}`,
    ),
  );
/** The facts as "LABEL value unit", and whether the strip draws its circles and how many columns it takes. */
const facts = (c) =>
  c.evaluate((el) => {
    const strip = el.shadowRoot.querySelector('.hb-facts');
    if (!strip) return null;
    return {
      cells: [...strip.querySelectorAll('.hb-fact')].map(
        (f) =>
          `${f.querySelector('.fv-readout__label').textContent.trim()} ${f
            .querySelector('.fv-readout__value')
            .textContent.replace(/\s+/g, '')}`,
      ),
      circles: strip.querySelectorAll('.fv-ico').length,
      columns: getComputedStyle(strip).gridTemplateColumns.split(' ').length,
    };
  });
/** The bars' geometry: their count, the hovered one, the stubs, and the labels drawn. */
const chart = (c) =>
  c.evaluate((el) => {
    const root = el.shadowRoot;
    const bars = [...root.querySelectorAll('.hb-bar')];
    const dates = [...root.querySelectorAll('.hb-date')].map((t) => ({
      text: t.textContent.trim(),
      ...t.getBoundingClientRect().toJSON(),
    }));
    return {
      bars: bars.length,
      hovered: bars.findIndex((b) => b.classList.contains('is-hover')),
      stubs: bars.filter((b) => b.classList.contains('is-empty')).length,
      values: [...root.querySelectorAll('.hb-value')].map((t) => t.textContent.trim()),
      ticks: [...root.querySelectorAll('.ax-tick')].map((t) => t.textContent.trim()),
      unit: root.querySelector('.ax-unit')?.textContent.trim() ?? '',
      dates,
      scrub: root.querySelector('.hb-chart')?.classList.contains('is-scrub') ?? false,
      inHead: root.querySelector('.fv-card__head .hb-readouts') !== null,
    };
  });

/* ---------- the mock-up's week at a phone's column ---------- */
{
  const page = await open();
  const solar = card(page, 'Solar production');
  const d = await chart(solar);
  check(
    'seven finished days, their values above them, a nice scale with its unit',
    d.bars === 7 &&
      d.values.join(' ') === '35.4 34.4 28.6 26.5 30.2 9.5 26.9' &&
      d.ticks.join(' ') === '0 10 20 30 40' &&
      d.unit === 'kWh',
    JSON.stringify({ bars: d.bars, values: d.values, ticks: d.ticks, unit: d.unit }),
  );
  check(
    'the dates read the days, thinned to what the row holds (every second at 360) and 12 apart',
    d.dates.map((x) => x.text).join(' ') === 'Oct 03 Oct 05 Oct 07 Oct 09' &&
      d.dates.every((x, i) => i === 0 || x.left - d.dates[i - 1].right >= 11.5),
    JSON.stringify(d.dates.map((x) => [x.text, Math.round(x.left), Math.round(x.right)])),
  );
  check(
    'the head reads the total and the daily average on their own row, and the sub the period',
    (await readouts(solar)).join(' | ') === 'Total 191.5kWh | Daily avg 27.4kWh' &&
      !d.inHead &&
      (await text(solar.locator('.fv-card__sub'))) === 'Last 7 days',
    (await readouts(solar)).join(' | '),
  );
  const f = await facts(solar);
  check(
    'the facts strip: the highest, the lowest and the average, two columns with their circles on a phone',
    f.cells.join(' | ') === 'Highest 35.4kWh | Lowest 9.5kWh | Daily avg 27.4kWh' &&
      f.columns === 2 &&
      f.circles === 3,
    JSON.stringify(f),
  );

  // a pointer over the fourth bar reads 06 October in the readouts' place; off the chart, the week is back
  const box = await solar.locator('.hb-chart').boundingBox();
  const inset = await solar.evaluate(
    (el) => el.shadowRoot.querySelector('.hb-bar').getBoundingClientRect().left,
  );
  const slot = (box.x + box.width - inset) / 7;
  await page.mouse.move(inset + slot * 3.5, box.y + box.height * 0.5);
  await page.waitForTimeout(120);
  const during = await chart(solar);
  check(
    'scrub: a pointer over a bar reads its day — "Oct 06 · 26.5 kWh" — in the readouts’ place, the bar full, the rest quiet',
    (await readouts(solar)).join(' | ') === 'Oct 06 26.5kWh' &&
      during.hovered === 3 &&
      during.scrub &&
      (await solar.locator('.hb-chart').getAttribute('aria-label')) === 'Oct 06 · 26.5 kWh',
    JSON.stringify({ readouts: await readouts(solar), hovered: during.hovered }),
  );
  await page.mouse.move(box.x + box.width / 2, box.y - 80);
  await page.waitForTimeout(120);
  check(
    'scrub: leaving the chart brings the week back',
    (await readouts(solar)).join(' | ') === 'Total 191.5kWh | Daily avg 27.4kWh' &&
      !(await chart(solar)).scrub,
  );

  // the keys walk the bars: ← from the end, → forward, Escape lets go
  await solar.locator('.hb-chart').focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(80);
  const first = await readouts(solar);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(80);
  const second = await readouts(solar);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  const third = await readouts(solar);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  check(
    'keys: ← reads the last day, ← the one before, → never past the end, Escape lets go',
    first.join() === 'Oct 09 26.9kWh' &&
      second.join() === 'Oct 08 9.5kWh' &&
      third.join() === 'Oct 09 26.9kWh' &&
      (await readouts(solar)).join(' | ') === 'Total 191.5kWh | Daily avg 27.4kWh',
    JSON.stringify({ first, second, third }),
  );

  // a fact opens the sensor
  await reset(page);
  await solar.locator('.hb-fact').first().click();
  check(
    'a tap on a fact opens the sensor’s more-info',
    JSON.stringify(await moreInfo(page)) === JSON.stringify(['sensor.hb_solar']),
    JSON.stringify(await moreInfo(page)),
  );

  // the other three cards: honest totals from the mock-up's arrays, a share of another sensor, the money, CO₂
  const feed = await facts(card(page, 'Feed-in to grid'));
  check(
    'the feed-in: its share of the solar production, the revenue in the house’s money, the CO₂ avoided',
    feed.cells.join(' | ') ===
      'Share of production 78% | Revenue (est.) 28.54€ | CO₂ avoided 60.1kg',
    feed.cells.join(' | '),
  );
  const imported = await facts(card(page, 'Grid import'));
  check(
    'the import: its cost, the kilometres it would drive, its share of the house',
    imported.cells.join(' | ') ===
      'Costs (est.) 16.41€ | Equivalent to 274km | Share of consumption 31%',
    imported.cells.join(' | '),
  );
  await reset(page);
  await card(page, 'Grid import').locator('.hb-fact').nth(2).click();
  check(
    'a share’s fact opens the sensor it is a share of',
    JSON.stringify(await moreInfo(page)) === JSON.stringify(['sensor.hb_house']),
    JSON.stringify(await moreInfo(page)),
  );
  await page.close();
}

/* ---------- the mock-up's width: the readouts beside the title, the circles in the strip ---------- */
{
  const page = await open();
  const wide = card(page, 'Mock-up · Solar production');
  const d = await chart(wide);
  const f = await facts(wide);
  check(
    'at 760: every date written, the readouts in the head beside the title, the strip with its circles',
    d.dates.map((x) => x.text).join(' ') === 'Oct 03 Oct 04 Oct 05 Oct 06 Oct 07 Oct 08 Oct 09' &&
      d.inHead &&
      f.columns === 3 &&
      f.circles === 3 &&
      f.cells.join(' | ') === 'CO₂ 76.6kg | Equivalent to 3.5trees | Highest 35.4kWh',
    JSON.stringify({ dates: d.dates.map((x) => x.text), inHead: d.inHead, facts: f }),
  );
  await page.close();
}

/* ---------- longer windows, the other layouts, a narrow column ---------- */
{
  const page = await open();
  const month = await chart(card(page, '30 days'));
  check(
    'thirty days: no values (none would hold its slot), the dates thinned and 12 apart, the last day read',
    month.bars === 30 &&
      month.values.length === 0 &&
      month.dates.length >= 3 &&
      month.dates.length < 30 &&
      month.dates.at(-1).text === 'Oct 09' &&
      month.dates.every((x, i) => i === 0 || x.left - month.dates[i - 1].right >= 11.5),
    JSON.stringify(month.dates.map((x) => [x.text, Math.round(x.left), Math.round(x.right)])),
  );
  const weeks = card(page, '12 weeks');
  check(
    'twelve weeks: a bar a week from its Monday, the average a weekly one',
    (await chart(weeks)).bars === 12 &&
      (await readouts(weeks))[1].startsWith('Weekly avg') &&
      (await text(weeks.locator('.fv-card__sub'))) === 'Last 12 weeks',
    JSON.stringify(await readouts(weeks)),
  );
  const months = card(page, '12 months');
  check(
    'twelve months: a bar a month, named by its month',
    (await chart(months)).bars === 12 &&
      (await chart(months)).dates[0].text.length === 3 &&
      (await readouts(months))[1].startsWith('Monthly avg'),
    JSON.stringify((await chart(months)).dates.map((x) => x.text)),
  );
  const compact = card(page, 'Compact');
  const cd = await chart(compact);
  check(
    'compact: the head, its readouts, the bars and their dates — no values, no scale, no strip',
    cd.bars === 7 &&
      cd.values.length === 0 &&
      cd.ticks.length === 0 &&
      cd.dates.length > 0 &&
      (await facts(compact)) === null &&
      (await readouts(compact)).length === 2,
    JSON.stringify(cd),
  );
  const mini = card(page, 'Mini');
  check(
    'mini: the head and one row of the two readouts and a sparkline of the bars',
    (await mini.locator('.hb-chart').count()) === 0 &&
      (await mini.locator('.hb-spark .fv-vbar').count()) === 7 &&
      (await readouts(mini)).join(' | ') === 'Total 191.5kWh | Daily avg 27.4kWh',
    JSON.stringify(await readouts(mini)),
  );
  const narrow = card(page, 'Narrow 232');
  const nf = await facts(narrow);
  const nd = await chart(narrow);
  check(
    'a 232 column: the readouts folded into equal columns, the facts one a row with their circles, the dates still apart',
    nf.columns === 1 &&
      nf.circles === 3 &&
      (await narrow.locator('.hb-cols').count()) === 1 &&
      nd.dates.every((x, i) => i === 0 || x.left - nd.dates[i - 1].right >= 11.5),
    JSON.stringify({ facts: nf, dates: nd.dates.map((x) => x.text) }),
  );
  await page.close();
}

/* ---------- what else a bar can show, and the honest states ---------- */
{
  const page = await open();
  const temperature = card(page, 'Outside temperature · mean');
  const td = await chart(temperature);
  check(
    'a measurement: the mean of each day, the day without one a stub, the head’s average and highest in °C',
    td.bars === 7 &&
      td.stubs === 1 &&
      td.unit === '°C' &&
      (await readouts(temperature)).join(' | ') === 'Daily avg 15.3°C | Highest 17.3°C',
    JSON.stringify({ stubs: td.stubs, unit: td.unit, readouts: await readouts(temperature) }),
  );
  const today = card(page, 'Include today');
  check(
    'the day in progress drawn as the last bar when asked, the sub saying so',
    (await chart(today)).bars === 8 &&
      (await text(today.locator('.fv-card__sub'))) === 'Last 7 days · Today' &&
      (await readouts(today))[0] === 'Total 203.8kWh',
    JSON.stringify(await readouts(today)),
  );
  const own = await facts(card(page, 'Facts of your own'));
  // 1.9: the average is the finished days' (today's half day made it 25.48); the money is on the total, today in it
  check(
    'facts of the person’s own: money at its own price, a template’s text with its unit, an average to two decimals',
    own.cells.join(' | ') === 'Worth 24.46€ | Panels 5.4kWp | A day 27.36kWh',
    own.cells.join(' | '),
  );
  const wh = card(page, 'A lifetime meter in Wh');
  check(
    'a lifetime meter in Wh reads in kWh',
    (await chart(wh)).unit === 'kWh' && (await readouts(wh))[0].endsWith('kWh'),
    JSON.stringify(await readouts(wh)),
  );
  const off = card(page, 'Everything off');
  const od = await chart(off);
  check(
    'everything off: the head and the bars alone',
    od.bars === 7 &&
      od.values.length === 0 &&
      od.ticks.length === 0 &&
      od.dates.length === 0 &&
      (await facts(off)) === null &&
      (await readouts(off)).length === 0,
    JSON.stringify(od),
  );
  const none = card(page, 'No statistics yet');
  check(
    'no statistics: the empty panel says so, the readouts read —, no strip',
    (await text(none.locator('.fv-empty-state__text'))) === 'No statistics yet' &&
      (await readouts(none)).join(' | ') === 'Total — | Daily avg —' &&
      (await facts(none)) === null,
    JSON.stringify(await readouts(none)),
  );
  const dead = card(page, 'Unavailable');
  check(
    'unavailable: the history stays, the dashed ring and the sub say the state',
    (await chart(dead)).bars === 7 &&
      (await dead.locator('.fv-card.is-unavailable').count()) === 1 &&
      (await text(dead.locator('.fv-card__sub'))) === 'Unavailable · Last 7 days',
    await text(dead.locator('.fv-card__sub')),
  );
  // 1.9 (the owner's rule): a sensor that is not there keeps the card's anatomy; the recorder keeps nothing of this one
  const gone = card(page, 'Missing');
  check(
    'missing: the card in the off skin, its line opening with the state, the readouts —, the recorder’s empty panel',
    (await gone.locator('.fv-card--empty').count()) === 0 &&
      (await gone.locator('.fv-card.is-off .fv-ico--off').count()) === 1 &&
      (await text(gone.locator('.fv-card__sub'))) === 'Entity not found · Last 7 days' &&
      (await readouts(gone)).every((r) => r.endsWith(' —')) &&
      (await text(gone.locator('.fv-empty-state__text'))) === 'No history yet',
    `${await text(gone.locator('.fv-card__sub'))} · ${JSON.stringify(await readouts(gone))}`,
  );
  await page.close();
}

/* ---------- the words in German and French ---------- */
{
  const de = await open(360, 'de');
  const solar = card(de, 'Solar production');
  check(
    'de: the sub, the readouts and the facts speak German',
    (await text(solar.locator('.fv-card__sub'))) === 'Letzte 7 Tage' &&
      (await readouts(solar)).join(' | ') === 'Gesamt 191,5kWh | Ø pro Tag 27,4kWh' &&
      (await facts(solar)).cells[0] === 'Höchstwert 35,4kWh',
    JSON.stringify({
      sub: await text(solar.locator('.fv-card__sub')),
      readouts: await readouts(solar),
    }),
  );
  check(
    'de: no statistics says so',
    (await text(card(de, 'No statistics yet').locator('.fv-empty-state__text'))) ===
      'Noch keine Statistiken',
  );
  await de.close();
  const fr = await open(360, 'fr');
  const feed = card(fr, 'Feed-in to grid');
  check(
    'fr: the sub and the readouts speak French, the share names its sensor',
    (await text(feed.locator('.fv-card__sub'))) === '7 derniers jours' &&
      (await readouts(feed))[1].startsWith('Moy. par jour') &&
      (await facts(card(fr, 'Grid import'))).cells[1].startsWith('Équivaut à'),
    JSON.stringify(await readouts(feed)),
  );
  await fr.close();
}

/* ---------- 1.9: the bars tell the truth (#44, #45) ---------- */
{
  const page = await open();
  const counted = card(page, '#45 · a day counter as Home Assistant counts it');
  check(
    '#45 as Home Assistant counts it: the five days before the sensor are stubs, the figures the finished day’s',
    (await chart(counted)).stubs === 5 &&
      (await readouts(counted)).join(' | ') ===
        'Today 51.2kWh | Daily avg 17.0kWh | Total 68.2kWh' &&
      (await facts(counted)).cells.join(' | ') ===
        'Highest 17.0kWh | Lowest 17.0kWh | Daily avg 17.0kWh',
    JSON.stringify({ readouts: await readouts(counted), facts: await facts(counted) }),
  );
  const zero = card(page, '#45 · from zero every day');
  check(
    '#45 from zero every day: its first evening 35.6, today 33.3 — no midnight counted twice',
    (await chart(zero)).values.join(' ') === '35.6 33.3' &&
      (await readouts(zero)).join(' | ') === 'Today 33.3kWh | Daily avg 35.6kWh | Total 68.9kWh',
    JSON.stringify(await readouts(zero)),
  );
  await zero.locator('.hb-chart').focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(80);
  check(
    'the bar in progress reads by its word under the keys: "Today · 33.3 kWh"',
    (await readouts(zero)).join() === 'Today 33.3kWh' &&
      (await zero.locator('.hb-chart').getAttribute('aria-label')) === 'Today · 33.3 kWh' &&
      (await zero.locator('.hb-bar.is-current').count()) === 1,
    JSON.stringify(await readouts(zero)),
  );
  await page.keyboard.press('Escape');

  const gauge = card(page, '#44 · a monthly rain gauge');
  check(
    '#44 as Home Assistant counts it: the reset of a total without last_reset is one bar below zero',
    (await gauge.locator('.hb-bar.is-negative').count()) === 1 &&
      (await readouts(gauge)).join(' | ') === 'Total −30.7mm | Daily avg −1.1mm' &&
      (await facts(gauge)).cells[1] === 'Lowest −51.1mm',
    JSON.stringify({ readouts: await readouts(gauge), facts: await facts(gauge) }),
  );
  const monthly = card(page, '#44 · from zero every month');
  check(
    '#44 from zero every month: no bar below zero, the month’s rain adds up',
    (await monthly.locator('.hb-bar.is-negative').count()) === 0 &&
      (await readouts(monthly)).join(' | ') === 'Total 20.4mm | Daily avg 0.7mm' &&
      (await facts(monthly)).cells.join(' | ') ===
        'Highest 10.9mm | Lowest 0.0mm | Daily avg 0.7mm',
    JSON.stringify({ readouts: await readouts(monthly), facts: await facts(monthly) }),
  );
  const ends = card(page, 'The reading at the end · by month');
  check(
    'the reading at the end by month: each month’s rain, the one in progress so far, and a total',
    (await chart(ends)).values.join(' ') === '54.3 38.2 61.4 12.8 63.0 51.1 16.9' &&
      (await readouts(ends)).join(' | ') === 'Total 297.7mm | Monthly avg 46.8mm',
    JSON.stringify({ values: (await chart(ends)).values, readouts: await readouts(ends) }),
  );
  const lifetime = frame(page, 'A lifetime meter after a restart').locator(
    'fluvy-history-bars-card',
  );
  check(
    'a lifetime meter after a restart: Home Assistant counts its whole reading again, in the unit of its ordinary days (never "0.0 MWh"); read as one that never starts again, a day like the others',
    (await readouts(lifetime.nth(0)))[0] === 'Total 18,448.7kWh' &&
      (await facts(lifetime.nth(0))).cells[1] === 'Lowest 24.1kWh' &&
      (await readouts(lifetime.nth(1)))[0] === 'Total 191.4kWh' &&
      (await chart(lifetime.nth(1))).values.join(' ') === '24.1 31.5 28.2 26.4 22.9 30.8 27.5',
    JSON.stringify([
      await readouts(lifetime.nth(0)),
      (await facts(lifetime.nth(0))).cells,
      await readouts(lifetime.nth(1)),
    ]),
  );
  const tank = card(page, 'From the history');
  const td = await chart(tank);
  check(
    'a sensor with no state class reads its history: the days before it are stubs, each day its last reading',
    td.stubs === 2 && td.values.join(' ') === '405.0 431.0 424.0 417.0 401.0',
    JSON.stringify(td),
  );
  await tank.locator('.hb-chart').focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(80);
  check(
    'a stub reads “—” under the keys',
    (await readouts(tank)).join() === 'Oct 03 —',
    JSON.stringify(await readouts(tank)),
  );
  await page.keyboard.press('Escape');
  const net = frame(page, 'Below zero in its own colour').locator('fluvy-history-bars-card');
  const colours = await net.nth(0).evaluate((el) => {
    const root = el.shadowRoot;
    const negative = [...root.querySelectorAll('.hb-bar.is-negative')];
    const current = root.querySelector('.hb-bar.is-current');
    return {
      negative: negative.length,
      own: new Set(negative.map((bar) => bar.getAttribute('data-accent'))).size,
      paint: negative[0] ? getComputedStyle(negative[0]).fill : '',
      plain: getComputedStyle(root.querySelector('.hb-bar:not(.is-negative)')).fill,
      current: current?.getAttribute('data-accent') ?? '',
      dashed: current ? getComputedStyle(current).strokeDasharray : '',
    };
  });
  check(
    'below zero in its own colour: the three bars below zero wear it, the one in progress its own and a dashed edge',
    colours.negative === 3 &&
      colours.own === 1 &&
      colours.paint !== colours.plain &&
      colours.current.startsWith('#') &&
      colours.dashed !== 'none',
    JSON.stringify(colours),
  );
  check(
    'the mini sparkline draws the days below zero instead of cutting them',
    (await net.nth(1).locator('.hb-spark .fv-vbar.is-negative').count()) === 3,
  );
  const broken = card(page, 'Couldn’t read the recorder');
  check(
    'a recorder that cannot be read says so, and that it asks again',
    (await text(broken.locator('.fv-empty-state__text'))) === 'Couldn’t read the recorder' &&
      (await text(broken.locator('.fv-empty-state__hint'))) === 'Asking again in a minute',
    await text(broken.locator('.hb-empty')),
  );
  await reset(page);
  await card(page, 'Without a head, the chart is the tap').locator('.hb-chart').click();
  check(
    'without a head, a still tap on the chart is the card’s tap',
    JSON.stringify(await moreInfo(page)) === JSON.stringify(['sensor.hb_solar']),
    JSON.stringify(await moreInfo(page)),
  );
  await page.close();
}

/* ---------- today live, and a read that failed asked again ---------- */
{
  const page = await suite.sheet('history-bars', { clock: true });
  const live = card(page, 'Live today');
  await live.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const figure = async () => Number((await readouts(live))[0].replace(/^Today |kWh$/g, ''));
  const before = await figure();
  const asked = (id) =>
    page.evaluate(
      (sensor) =>
        window.fluvyMock.wsCalls.filter((call) =>
          [call.message.statistic_ids, call.message.statistic_id, call.message.entity_ids]
            .flat()
            .includes(sensor),
        ).length,
      id,
    );
  await reset(page);
  const reading = await page.evaluate(() =>
    Number(window.fluvyMock.hass().states['sensor.hb_live'].state),
  );
  await page.evaluate(
    (value) => window.fluvyMock.set('sensor.hb_live', String(value)),
    reading + 0.6,
  );
  await page.waitForTimeout(200);
  const after = await figure();
  check(
    'today is live: the sensor 0.6 kWh on reads 0.6 more, the last bar with it, and the recorder is not asked',
    Math.abs(after - before - 0.6) < 0.051 &&
      (await chart(live)).values.at(-1) === after.toFixed(1) &&
      (await asked('sensor.hb_live')) === 0,
    JSON.stringify({ before, after, asked: await asked('sensor.hb_live') }),
  );

  const broken = card(page, 'Couldn’t read the recorder');
  await broken.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const first = await asked('sensor.hb_broken');
  await page.clock.runFor(30_000);
  const soon = await asked('sensor.hb_broken');
  await page.clock.runFor(31_000);
  await page.waitForTimeout(200);
  check(
    'a read that failed is never kept: the recorder is asked again a minute on, not before',
    soon === first &&
      (await asked('sensor.hb_broken')) > first &&
      (await text(broken.locator('.fv-empty-state__text'))) === 'Couldn’t read the recorder',
    JSON.stringify({ first, soon, then: await asked('sensor.hb_broken') }),
  );
  await page.close();
}

/* ---------- what the recorder is asked: ten cards and five power sensors, an hour on ---------- */
{
  /**
   * Questions a minute the fixture's fifteen cards may ask the recorder at most, on screen and live: the four with
   * today as Home Assistant counts it ask twice every five minutes (24 an hour each), every card once an hour, a
   * minute after it turns — 111 an hour, 1.85 a minute. The hour runs from a morning of the sheets' day, never over
   * midnight: a day that turned would have every card ask its windows again, and the count would depend on the hour
   * the suite ran at.
   */
  const CEILING = 2;
  const page = await suite.page('sheet=recorder-load&width=760', {
    clock: { time: new Date(2026, 8, 17, 10, 0, 0) },
    viewport: { width: 1400, height: 2000 },
  });
  await reset(page);
  await page.clock.runFor(60 * 60_000);
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() =>
    window.fluvyMock.wsCalls.filter((call) => /^(recorder|history)\//.test(call.type)),
  );
  const byType = {};
  for (const call of calls) byType[call.type] = (byType[call.type] ?? 0) + 1;
  const perMinute = calls.length / 60;
  check(
    `the recorder's load: ten history bars and five power sensors ask ${perMinute.toFixed(2)} questions a minute (ceiling ${CEILING})`,
    calls.length > 0 && perMinute <= CEILING,
    JSON.stringify(byType),
  );
  await page.close();
}

/* ---------- a card leaves nothing running ---------- */
{
  const page = await suite.page('sheet=history-bars&width=360');
  const before = await page.evaluate(() => window.__intervals());
  await page.evaluate(() =>
    document.querySelectorAll('fluvy-history-bars-card').forEach((c) => c.remove()),
  );
  const after = await page.evaluate(() => window.__intervals());
  check(
    'removed, the cards leave no clock behind',
    after <= before && after <= 1,
    `${before} → ${after}`,
  );
  await page.close();
}

void BASE;
await suite.finish();
