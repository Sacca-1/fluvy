#!/usr/bin/env node
/**
 * The cards' variants, in a real Chromium against the playground. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-variants.mjs
 * What it proves: a compact cover, fan and robot are the head and one row — 144 tall, a quarter of a section
 * (`getGridOptions`), with nothing of the full card's below —; the thermostat's three variants ask the grid for
 * what they need; a player without its sources and volume draws neither; a compact lock is the head and the slide
 * and a compact alarm the head and its modes as chips, both 144; an alarm offers the modes it was asked for, in that
 * order; compact entity rows are 48 tall with the name alone, and a row wears its own colour; four readouts stand
 * on one row when asked; a plain heading is its title alone, 24 tall; a greeting can go without its avatar, date
 * and weather; a select's options fill their row unless asked for chips; a to-do list, a timer and a weather card
 * go without their extras when told; scenes stand one a row when asked and a scene tile without its subtitle;
 * a compact energy card and a compact production card are the head, the chart and its axis; a gauge's bar variant
 * is a level, not a dial; a distribution can be rows, one wearing its own colour; a humidity card can drop its trend;
 * a clock reads its older words as the newer ones; a calendar's events wear their calendar's own colour.
 */
import { frame, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const gridOf = (card) => card.evaluate((el) => el.getGridOptions());
const heightOf = async (card) =>
  (await card.locator('article, .fv-card').first().boundingBox())?.height;

/* ---------- compact devices: the head and one row ---------- */
{
  const page = await suite.sheet('devices-motion');
  for (const [title, tag, row, gone] of [
    [
      'Cover · compact',
      'fluvy-cover-card',
      '.fv-actions',
      ['fluvy-ruler', '.fv-chips', '.dv-cover'],
    ],
    [
      'Fan · compact',
      'fluvy-fan-card',
      'fluvy-ruler',
      ['.dv-value', '.dv-rows', '.fv-chips', '.fv-ruler-labels'],
    ],
    [
      'Vacuum · compact',
      'fluvy-vacuum-card',
      '.fv-actions',
      ['fluvy-ruler', '.fv-chips', '.dv-cols'],
    ],
  ]) {
    const card = frame(page, title).locator(tag).first();
    const height = await heightOf(card);
    check(`${title}: 144 tall (the head and one row)`, Math.abs(height - 144) < 1, `${height}`);
    check(`${title}: the row is there`, (await card.locator(row).count()) === 1);
    for (const selector of gone)
      check(
        `${title}: nothing of the full card (${selector})`,
        (await card.locator(selector).count()) === 0,
      );
    const grid = await gridOf(card);
    const least = 6; // half a section at the least: in a third the head left its name no room (1.9)
    check(
      `${title}: half a section, ${least} columns at the least`,
      grid.columns === 6 && grid.min_columns === least,
      JSON.stringify(grid),
    );
  }
  // the full cards still ask for their width
  const full = frame(page, 'Blinds').locator('fluvy-cover-card').first();
  const grid = await gridOf(full);
  check(
    'the full cover asks for two thirds of a section',
    grid.columns === 12 && grid.min_columns === 8,
    JSON.stringify(grid),
  );
  await page.close();
}

/* ---------- the thermostat's variants ---------- */
{
  const page = await suite.sheet('climate');
  const grids = {};
  for (const [title, key] of [
    ['Heat', 'dial'],
    ['Ruler · modes as chips', 'ruler'],
    ['Compact · off', 'compact'],
  ])
    grids[key] = await gridOf(frame(page, title).locator('fluvy-thermostat-card').first());
  // the compact card takes half a section and never less (#46: in a third its stepper was wider than the column)
  check(
    'the dial asks for two thirds, the ruler and the compact half a section at the least',
    grids.dial.min_columns === 8 &&
      grids.ruler.min_columns === 6 &&
      grids.compact.columns === 6 &&
      grids.compact.min_columns === 6,
    JSON.stringify(grids),
  );
  await page.close();
}

/* ---------- a player without its sources and volume ---------- */
{
  const page = await suite.sheet('media');
  const bare = frame(page, 'TV · bare').locator('fluvy-media-card').first();
  const full = frame(page, 'TV · sources').locator('fluvy-media-card').first();
  check(
    'the full player has its sources and its volume',
    (await full.locator('.fv-chips').count()) === 1 &&
      (await full.locator('.md-volume').count()) === 1,
  );
  check(
    'a player told to show neither draws neither',
    (await bare.locator('.fv-chips').count()) === 0 &&
      (await bare.locator('.md-volume').count()) === 0,
  );
  await page.close();
}

/* ---------- security: the compact lock and alarm, the alarm's modes ---------- */
{
  const page = await suite.sheet('devices-security');
  const lock = frame(page, 'Lock · compact').locator('fluvy-lock-card').first();
  const lockHeight = await heightOf(lock);
  check(
    'Lock · compact: 144 tall (the head and the slide)',
    Math.abs(lockHeight - 144) < 1,
    `${lockHeight}`,
  );
  check(
    'Lock · compact: the slide, none of the rows',
    (await lock.locator('.dv-slide').count()) === 1 &&
      (await lock.locator('.fv-row').count()) === 0,
  );
  const lockGrid = await gridOf(lock);
  check(
    'Lock · compact: half a section, and never less',
    lockGrid.columns === 6 && lockGrid.min_columns === 6,
    JSON.stringify(lockGrid),
  );
  const alarm = frame(page, 'Alarm · compact').locator('fluvy-alarm-card').first();
  const alarmHeight = await heightOf(alarm);
  check(
    'Alarm · compact: 144 tall (the head and the chips)',
    Math.abs(alarmHeight - 144) < 1,
    `${alarmHeight}`,
  );
  const full = frame(page, 'Alarm').locator('fluvy-alarm-card').first();
  const tiles = await full.locator('.fv-option').count();
  check(
    'Alarm · compact: one chip per mode, no tiles, no rows',
    (await alarm.locator('.fv-chip').count()) === tiles &&
      tiles === 3 &&
      (await alarm.locator('.fv-option').count()) === 0 &&
      (await alarm.locator('.fv-row').count()) === 0,
    `${await alarm.locator('.fv-chip').count()} chips for ${tiles} modes`,
  );
  const alarmGrid = await gridOf(alarm);
  check(
    'Alarm · compact: half a section, no less',
    alarmGrid.columns === 6 && alarmGrid.min_columns === 6,
    JSON.stringify(alarmGrid),
  );
  // at a phone's width the compact card is 264 wide: its words would wrap, so it keeps one row of named glyphs
  const phone = await suite.page('sheet=devices-security', {
    viewport: { width: 360, height: 1200 },
  });
  const narrow = frame(phone, 'Alarm · compact').locator('fluvy-alarm-card').first();
  const narrowHeight = await heightOf(narrow);
  const named = await narrow
    .locator('.fv-chip')
    .evaluateAll((els) => els.map((el) => [el.getAttribute('aria-label'), el.textContent.trim()]));
  check(
    'Alarm · compact at 360: still 144, its modes as glyphs each named for a reader',
    Math.abs(narrowHeight - 144) < 1 &&
      named.length === 3 &&
      named.every(([name, text]) => name && text === ''),
    `${narrowHeight} · ${JSON.stringify(named)}`,
  );
  await phone.close();
  const labelsOf = async (card) =>
    (await card.locator('.fv-option__label').allTextContents()).map((t) => t.trim());
  const all = await labelsOf(full);
  const asked = await labelsOf(
    frame(page, 'Alarm · two modes').locator('fluvy-alarm-card').first(),
  );
  check(
    'an alarm offers the modes it was asked for, in that order (away, then disarm)',
    asked.length === 2 && asked[0] === all[2] && asked[1] === all[0],
    `${asked.join(' · ')} of ${all.join(' · ')}`,
  );
  await page.close();
}

/* ---------- compact entity rows ---------- */
{
  const page = await suite.sheet('lists');
  const card = frame(page, 'Entities · compact').locator('fluvy-entities-card').first();
  const rows = card.locator('.fv-row');
  const heights = await rows.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  );
  check(
    'compact rows are 48 tall, every one of them',
    heights.length === 5 && heights.every((h) => Math.abs(h - 48) < 1),
    heights.join(' '),
  );
  check('a compact row is the name alone', (await card.locator('.fv-row__sub').count()) === 0);
  const teal = card.locator('.fv-row[data-accent]');
  const accentOf = (locator) =>
    locator.evaluate((el) => getComputedStyle(el).getPropertyValue('--fluvy-accent').trim());
  check(
    "the coloured row wears its own colour, the others the card's",
    (await teal.count()) === 1 && (await accentOf(teal)) !== (await accentOf(rows.nth(1))),
  );
  await page.close();
}

/* ---------- readouts on one row, a plain heading, a bare greeting ---------- */
{
  const page = await suite.sheet('home-extras');
  const tops = async (card) =>
    new Set(
      await card
        .locator('.hm-stat')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top))),
    );
  const row = frame(page, 'E Readouts · row');
  const asRow = await tops(row.locator('fluvy-readouts-card').nth(0));
  const asGrid = await tops(row.locator('fluvy-readouts-card').nth(1));
  check(
    'four readouts stand on one row when asked, two by two when not',
    asRow.size === 1 && asGrid.size === 2,
    `${asRow.size} / ${asGrid.size} rows`,
  );
  const plain = frame(page, 'C Sections · plain').locator('fluvy-heading-card');
  const sectionHeights = await plain
    .locator('.hm-section')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  check(
    'a plain heading is 24 tall, its title alone',
    sectionHeights.length === 3 &&
      sectionHeights.every((h) => Math.abs(h - 24) < 1) &&
      (await plain.locator('.hm-section__meta').count()) === 0,
    sectionHeights.join(' '),
  );
  const bare = frame(page, 'B Greeting · bare').locator('fluvy-hello-card');
  const first = bare.nth(0);
  check(
    'a greeting told to show nothing but its words draws no avatar, date or weather',
    (await first.locator('.hm-avatar').count()) === 0 &&
      (await first.locator('.hm-hello__date').count()) === 0 &&
      (await first.locator('.hm-hello__weather').count()) === 0,
  );
  const second = bare.nth(1);
  check(
    'and one without its avatar keeps its date and weather',
    (await second.locator('.hm-avatar').count()) === 0 &&
      (await second.locator('.hm-hello__date').count()) === 2 &&
      (await second.locator('.hm-hello__weather').count()) === 1,
  );
  await page.close();
}

/* ---------- inputs: options as chips, a bare list, a bare timer ---------- */
{
  const page = await suite.sheet('inputs');
  const full = frame(page, 'Helpers').locator('fluvy-helpers-card').first();
  const asChips = frame(page, 'Helpers · options as chips').locator('fluvy-helpers-card').first();
  check(
    "a select's options fill their row by default, and are content-sized chips when asked",
    (await full.locator('.fv-chips.fv-chips--fill').count()) === 1 &&
      (await asChips.locator('.fv-chips.fv-chips--fill').count()) === 0 &&
      (await asChips.locator('.fv-chips').count()) === 2,
  );
  const list = frame(page, 'Groceries').locator('fluvy-todo-card').first();
  const bare = frame(page, 'To-do · bare').locator('fluvy-todo-card').first();
  check(
    'a bare to-do list has no composer, no due dates and no ticked items',
    (await list.locator('.in-add').count()) === 1 &&
      (await list.locator('.in-todo__row.is-done').count()) > 0 &&
      (await bare.locator('.in-add').count()) === 0 &&
      (await bare.locator('.fv-row__sub').count()) === 0 &&
      (await bare.locator('.in-todo__row.is-done').count()) === 0,
  );
  const timer = frame(page, 'Timer · bare').locator('fluvy-timer-card').first();
  check(
    'a bare timer is its readout alone',
    (await timer.locator('.in-timer__cmds').count()) === 0 &&
      (await timer.locator('.in-gauge').count()) === 0 &&
      (await timer.locator('.fv-readout').count()) === 1,
  );
  await page.close();
}

/* ---------- ambient: the weather hero alone, scenes one a row ---------- */
{
  const page = await suite.sheet('ambient');
  const weather = frame(page, 'Weather').locator('fluvy-weather-card').first();
  const hero = frame(page, 'Weather · no forecast').locator('fluvy-weather-card').first();
  check(
    'a weather card told not to show the forecast keeps its hero alone',
    (await weather.locator('.am-days').count()) === 1 &&
      (await weather.locator('.am-hours').count()) === 1 &&
      (await hero.locator('.am-days').count()) === 0 &&
      (await hero.locator('.am-hours').count()) === 0,
  );
  const colsOf = (card) =>
    card.locator('.fv-grid2').evaluate((el) => el.style.getPropertyValue('--am-cols'));
  check(
    'scenes stand two a row where their names fit, one a row when asked',
    (await colsOf(frame(page, 'Scenes').locator('fluvy-scenes-card').first())) === '2' &&
      (await colsOf(frame(page, 'Scenes · one column').locator('fluvy-scenes-card').first())) ===
        '1',
  );
  await page.close();
}

/* ---------- a scene tile without its subtitle ---------- */
{
  const page = await suite.sheet('home-extras');
  const tiles = frame(page, 'D Scenes · 236').locator('fluvy-scene-card');
  check(
    'a scene tile told not to show its subtitle is its name alone',
    (await tiles.nth(0).locator('.fv-row__sub').count()) === 1 &&
      (await tiles.nth(4).locator('.fv-row__sub').count()) === 0,
  );
  await page.close();
}

/* ---------- energy: the compact chart ---------- */
{
  const page = await suite.sheet('energy');
  const full = frame(page, 'Energy').locator('fluvy-energy-card').first();
  const compact = frame(page, 'Energy · compact').locator('fluvy-energy-card').first();
  const height = await heightOf(compact);
  check(
    'a compact energy card is the head, the chart and its axis',
    (await full.locator('.ef-top').count()) === 1 &&
      (await full.locator('.ef-cols').count()) === 1 &&
      (await compact.locator('.ef-top').count()) === 0 &&
      (await compact.locator('.ef-cols').count()) === 0 &&
      (await compact.locator('.ef-chart').count()) === 1,
    `${height} tall`,
  );
  const grid = await gridOf(compact);
  check(
    'a compact energy card asks for half a section',
    grid.columns === 6 && grid.min_columns === 6,
    JSON.stringify(grid),
  );
  check(
    "the chart wears the card's tone",
    (await compact.locator('.ef-chart.fv-tone--solar').count()) === 1,
  );
  await page.close();
}

/* ---------- solar: the gauge's bar, the compact production, distribution rows, no trend ---------- */
{
  const page = await suite.sheet('solar');
  const ring = frame(page, 'Solar power').locator('fluvy-gauge-card').first();
  const bar = frame(page, 'Gauge · bar').locator('fluvy-gauge-card').first();
  const fill = await bar
    .locator('.fv-bar__fill')
    .first()
    .evaluate((el) => el.style.width);
  check(
    "a gauge's bar variant is a level under the reading, not a dial",
    (await ring.locator('fluvy-dial').count()) === 1 &&
      (await bar.locator('fluvy-dial').count()) === 0 &&
      (await bar.locator('.fv-bar').count()) === 1 &&
      /^\d+%$/.test(fill) &&
      (await bar.locator('.so-cols .fv-readout').count()) === 3,
    `${await heightOf(bar)} tall · level ${fill}`,
  );
  const barGrid = await gridOf(bar);
  check(
    "a gauge's bar asks for half a section, and never less",
    barGrid.columns === 6 && barGrid.min_columns === 6,
    JSON.stringify(barGrid),
  );
  const production = frame(page, 'Production').locator('fluvy-production-card').first();
  const compact = frame(page, 'Production · compact').locator('fluvy-production-card').first();
  check(
    'a compact production card is the head, the bars and their axis',
    (await production.locator('.so-top').count()) === 1 &&
      (await production.locator('.so-cols').count()) === 1 &&
      (await compact.locator('.so-top').count()) === 0 &&
      (await compact.locator('.so-cols').count()) === 0 &&
      (await compact.locator('.so-bars.fv-tone--solar').count()) === 1,
    `${await heightOf(compact)} tall`,
  );
  const stack = frame(page, 'Distribution').locator('fluvy-distribution-card').first();
  const rows = frame(page, 'Distribution · rows').locator('fluvy-distribution-card').first();
  const accentOf = (locator) =>
    locator.evaluate((el) => getComputedStyle(el).getPropertyValue('--fluvy-accent').trim());
  const teal = rows.locator('.fv-row[data-accent]');
  check(
    'a distribution as rows is one row per source, one wearing its own colour',
    (await stack.locator('.fv-stack').count()) === 1 &&
      (await rows.locator('.fv-stack').count()) === 0 &&
      (await rows.locator('.fv-row').count()) === 4 &&
      (await teal.count()) === 1 &&
      (await accentOf(teal)) !== (await accentOf(rows.locator('.fv-row').first())),
  );
  const humidity = frame(page, 'Humidity').locator('fluvy-humidity-card').first();
  const noTrend = frame(page, 'Humidity · no trend').locator('fluvy-humidity-card').first();
  check(
    'a humidity card told not to show its trend keeps its humidifier row alone',
    (await humidity.locator('.so-rows .fv-row').count()) === 2 &&
      (await noTrend.locator('.so-rows .fv-row').count()) === 1,
  );
  await page.close();
}

/* ---------- clocks and calendars: older words read as newer, a calendar's own colour ---------- */
{
  const page = await suite.sheet('clocks');
  const older = frame(page, 'A4 side').locator('fluvy-clock-card').first();
  const newer = frame(page, 'A4 side · newer words').locator('fluvy-clock-card').first();
  check(
    'a clock written in the older words draws the same side face as one in the newer',
    (await older.locator('.ck-side__face').count()) === 1 &&
      (await newer.locator('.ck-side__face').count()) === 1,
  );
  await page.close();
  const calendars = await suite.sheet('calendar');
  const coloured = frame(calendars, 'Calendars · named and coloured')
    .locator('fluvy-calendar-card')
    .first();
  const plain = frame(calendars, 'Agenda').locator('fluvy-calendar-card').first();
  check(
    "a calendar's events wear their calendar's own colour",
    (await coloured.locator('.cd-event__bar[data-accent]').count()) > 0 &&
      (await plain.locator('.cd-event__bar[data-accent]').count()) === 0,
  );
  await calendars.close();
}

await suite.finish();
