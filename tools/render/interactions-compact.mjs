#!/usr/bin/env node
/**
 * The compact variants of 1.5 — bars, stat tiles, weather — on the playground's `solar` and `ambient` sheets (real
 * cards, simulated hass). Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-compact.mjs
 * What it proves: a compact bar row is 48 tall with its 40 circle, the name and the value on one line and the 4 px bar
 * under the name from the text column to the content edge; a plain row is a 48 compact list row without a bar, and in
 * the full card a plain row is 60 among the 76; compact stat tiles are 64 tall without a glyph, three a row (four as
 * two by two, two when a label would not fit three, one in half a column), their rows 48; a compact weather card is one
 * head row — the condition circle, the name, "condition · high / low" and the temperature — over the hours and the
 * days ahead as columns, as many as the width holds (fewer for figures below zero, two in half a column), the circle
 * giving way before a name or the condition would; a row squeezed under what holds its name gives its circle to the
 * name (every row of the list with it, the bar and the hairline starting the row); a dead compact row says its state
 * as its value ("Unavailable", "Unknown", "Not found" — the dash where the word would not leave the name its room), a
 * missing entity draws the `ban` glyph, and a dead stat tile wears the dashed hairline in both variants; and every
 * card's declared `layoutHeight` is the height it measures at a 360 column.
 */
import { frame, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
const texts = async (locator) =>
  (await locator.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const rect = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  });
const rects = (locator) =>
  locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    }),
  );
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const distinct = (values) => new Set(values.map((v) => Math.round(v))).size;

/** The card's declared height against the one it measures (its own article, at a 360 column). */
async function sameHeight(name, card) {
  const declared = await card.evaluate((el) => el.constructor.layoutHeight(el.config, el.hass));
  const box = await card.locator('article').first().boundingBox();
  check(
    `${name}: layoutHeight ${declared} is the height measured`,
    box !== null && near(box.width, 360) && near(box.height, declared),
    `${declared} vs ${box?.height} (${box?.width} wide)`,
  );
}

/** A glyph's own markup, read in the page: Lit's marker comments, which differ per page, left out. */
const STRIP = (el) =>
  el.innerHTML
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/* the `ban` glyph as the library draws it: the weather card's unavailable head is one */
const BAN = await (async () => {
  const page = await suite.sheet('ambient');
  const markup = await frame(page, 'Weather · compact · edges')
    .locator('fluvy-weather-card')
    .nth(4)
    .locator('.fv-card__head .fv-ico svg')
    .evaluate(STRIP);
  await page.close();
  return markup;
})();

/* ---------------------------------------------------------------- bars */
{
  const page = await suite.sheet('solar');
  const card = frame(page, 'Bars · compact').locator('fluvy-bars-card');
  const rows = card.locator('.fv-row');
  const rowBoxes = await rects(rows);
  check(
    'bars · compact: four rows, 48 tall every one',
    rowBoxes.length === 4 && rowBoxes.every((r) => near(r.h, 48)),
    rowBoxes.map((r) => r.h).join(' '),
  );
  check(
    'bars · compact: three bar rows and a plain one, every one compact, none with a second line',
    (await card.locator('.fv-row--bar.fv-row--compact').count()) === 3 &&
      (await card.locator('.fv-row--compact:not(.fv-row--bar)').count()) === 1 &&
      (await card.locator('.fv-row--compact:not(.fv-row--bar) .fv-bar').count()) === 0 &&
      (await card.locator('.fv-row__sub').count()) === 0,
  );
  const first = rows.first();
  const row = await rect(first);
  const circle = await rect(first.locator('.fv-ico'));
  const title = await rect(first.locator('.fv-row__title'));
  const value = await rect(first.locator('.fv-row__value'));
  const bar = await rect(first.locator('.fv-bar'));
  check(
    'bars · compact: a 40 circle on the row (4 from its top)',
    near(circle.w, 40) && near(circle.h, 40) && near(circle.y - row.y, 4),
    `${circle.w}×${circle.h} at ${circle.y - row.y}`,
  );
  check(
    'bars · compact: the name and the value on one line, 12 from the top',
    near(title.y - row.y, 12) &&
      near(value.y - row.y, 11, 1) &&
      near(title.h, 20) &&
      near(value.h, 20),
    `title ${title.y - row.y} value ${value.y - row.y}`,
  );
  check(
    'bars · compact: the 4 px bar under the name, from the text column (52) to the content edge, 36 from the top',
    near(bar.h, 4) &&
      near(bar.y - row.y, 36) &&
      near(bar.x - row.x, 52) &&
      near(bar.right, row.right) &&
      bar.y >= title.bottom,
    `${bar.x - row.x}..${row.right - bar.right} at ${bar.y - row.y}, ${bar.h} tall`,
  );
  check(
    'bars · compact: the shaded string reads warning, the values as the full card writes them',
    (await texts(card.locator('.fv-row__value'))).join('|') === '1.4 kW|1.5 kW|0.3 kW|3.2 kW' &&
      (await card.locator('.fv-row__value--warning').count()) === 1 &&
      (await text(card.locator('.fv-badge'))) === '1 shaded',
    (await texts(card.locator('.fv-row__value'))).join('|'),
  );

  const fullDead = frame(page, 'Bars · one row, a dead row, batteries')
    .locator('fluvy-bars-card')
    .nth(1);
  check(
    'bars: in the full card a dead and a missing row fade with the dashed ring, the missing one drawing the ban glyph, the word under the name',
    (await fullDead.locator('.fv-row.is-unavailable').count()) === 2 &&
      (await fullDead.locator('.fv-row').nth(3).locator('.fv-ico svg').evaluate(STRIP)) === BAN &&
      (await texts(fullDead.locator('.fv-row__sub'))).slice(2).join('|') ===
        '5 panels · unavailable|Entity not found' &&
      (await texts(fullDead.locator('.fv-row__value'))).slice(2).join() === '—,—',
    (await texts(fullDead.locator('.fv-row__sub'))).join('|'),
  );

  const mixed = frame(page, 'Bars · plain rows among bar rows').locator('fluvy-bars-card');
  const mixedHeights = (await rects(mixed.locator('.fv-row'))).map((r) => Math.round(r.h));
  check(
    'bars: a plain row is 60 among the 76 bar rows',
    mixedHeights.join() === '76,60,76,60',
    mixedHeights.join(),
  );

  const edges = frame(
    page,
    'Bars · compact · a dead row, an unknown one, a missing one, many rows',
  );
  const strings = edges.locator('fluvy-bars-card').first();
  check(
    'bars · compact: a dead and a missing row wear the dashed ring and fade, an unknown one the neutral circle; each says its state as its value',
    (await strings.locator('.fv-row .fv-ico--off').count()) === 2 &&
      (await strings.locator('.fv-row.is-unavailable').count()) === 2 &&
      (await strings.locator('.fv-row').nth(3).locator('.fv-ico--neutral').count()) === 1 &&
      (await texts(strings.locator('.fv-row__value'))).slice(2, 5).join() ===
        'Unavailable,Unknown,Not found',
    (await texts(strings.locator('.fv-row__value'))).join('|'),
  );
  check(
    'bars · compact: a missing entity draws the ban glyph, never a sensor\u2019s trend',
    (await strings.locator('.fv-row').nth(4).locator('.fv-ico svg').evaluate(STRIP)) === BAN &&
      (await strings.locator('.fv-row').nth(2).locator('.fv-ico svg').evaluate(STRIP)) !== BAN,
  );
  const many = edges.locator('fluvy-bars-card').nth(1);
  check(
    'bars · compact: eight rows of 48, every one',
    (await rects(many.locator('.fv-row'))).every((r) => near(r.h, 48)) &&
      (await many.locator('.fv-row').count()) === 8,
  );

  const halfBars = frame(page, 'Bars · compact · half a column').locator('fluvy-bars-card');
  const halfRows = halfBars.first().locator('.fv-row');
  const halfRow = await rect(halfRows.first());
  const halfBar = await rect(halfRows.first().locator('.fv-bar'));
  const halfTitles = await halfRows.locator('.fv-row__title').evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent.trim(),
      cut: el.scrollWidth > el.clientWidth,
      w: el.getBoundingClientRect().width,
    })),
  );
  const longTitles = await halfBars
    .nth(1)
    .locator('.fv-row__title')
    .evaluateAll((els) =>
      els.map((el) => ({
        cut: el.scrollWidth > el.clientWidth,
        w: el.getBoundingClientRect().width,
      })),
    );
  check(
    'bars · compact · half a column: the rows give their circles to the names, which read whole; the bar starts the row',
    (await halfBars.first().locator('.fv-row.fv-row--bare').count()) === 3 &&
      (await halfBars.first().locator('.fv-row .fv-ico').count()) === 0 &&
      halfTitles.every((t) => !t.cut) &&
      halfTitles.map((t) => t.text).join() === 'Monstera,Ficus,Basil' &&
      near(halfBar.x, halfRow.x) &&
      near(halfBar.right, halfRow.right) &&
      near(halfBar.y - halfRow.y, 36),
    `${halfTitles.map((t) => `${t.text}${t.cut ? '…' : ''}`).join(' ')} bar ${halfBar.x - halfRow.x}..${halfRow.right - halfBar.right}`,
  );
  check(
    'bars · compact · half a column: a name longer than its room ends in an ellipsis only after 72 px of it',
    longTitles.length === 3 && longTitles.every((t) => t.cut && t.w >= 72),
    longTitles.map((t) => `${Math.round(t.w)}${t.cut ? '…' : ''}`).join(' '),
  );
  check(
    'bars · compact: in a column that holds them, the rows keep their circles',
    (await card.locator('.fv-row--bare').count()) === 0 &&
      (await card.locator('.fv-row .fv-ico').count()) === 4,
  );
  const halfHairline = await halfRows
    .nth(1)
    .evaluate((el) => getComputedStyle(el, '::before').left);
  check(
    'bars · compact · half a column: the hairline starts with the words',
    halfHairline === '0px',
    halfHairline,
  );

  for (const [title, index] of [
    ['Bars · compact', 0],
    ['Plants', 0],
    ['Strings & inverter', 0],
    ['Bars · plain rows among bar rows', 0],
    ['Bars · compact · a dead row, an unknown one, a missing one, many rows', 0],
    ['Bars · compact · a dead row, an unknown one, a missing one, many rows', 1],
  ])
    await sameHeight(
      `${title} [${index}]`,
      frame(page, title).locator('fluvy-bars-card').nth(index),
    );

  /* ---------------------------------------------------------------- stat tiles */
  const tiles = frame(page, 'Tiles · compact').locator('fluvy-stat-tiles-card');
  const tileBoxes = await rects(tiles.locator('.fv-option'));
  const content = await rect(tiles.locator('.so-tiles'));
  check(
    'tiles · compact: six tiles of 64, compact, without a glyph row',
    tileBoxes.length === 6 &&
      tileBoxes.every((r) => near(r.h, 64)) &&
      (await tiles.locator('.fv-option--compact').count()) === 6 &&
      (await tiles.locator('.fv-option__glyph').count()) === 0,
    tileBoxes.map((r) => r.h).join(' '),
  );
  check(
    'tiles · compact: three a row filling the column, 4 apart (3 × 104 + 2 × 4 = 320)',
    distinct(tileBoxes.slice(0, 3).map((r) => r.y)) === 1 &&
      distinct(tileBoxes.slice(0, 3).map((r) => r.x)) === 3 &&
      near(tileBoxes[0].x, content.x) &&
      near(tileBoxes[2].right, content.right) &&
      near(tileBoxes[1].x - tileBoxes[0].right, 4) &&
      near(tileBoxes[3].y - tileBoxes[0].bottom, 4) &&
      near(tileBoxes[0].w, 104),
    tileBoxes.map((r) => `${r.x},${r.y},${r.w}`).join(' '),
  );
  check(
    'tiles · compact: the rows are 48 and the name alone',
    (await rects(tiles.locator('.fv-row'))).every((r) => near(r.h, 48)) &&
      (await tiles.locator('.fv-row').count()) === 2 &&
      (await tiles.locator('.fv-row__sub').count()) === 0,
  );
  check(
    'tiles · compact: the label over the value, the highlighted tile filled',
    (
      await texts(
        tiles.locator('.fv-option').first().locator('.fv-option__label, .fv-option__value'),
      )
    ).join('|') === 'Solar output|3.2 kW' &&
      (await tiles.locator('.fv-option.is-active').count()) === 1,
  );

  const auto = frame(page, 'Tiles · compact · three, four, long labels').locator(
    'fluvy-stat-tiles-card',
  );
  const three = await rects(auto.nth(0).locator('.fv-option'));
  const four = await rects(auto.nth(1).locator('.fv-option'));
  const long = await rects(auto.nth(2).locator('.fv-option'));
  const longContent = await rect(auto.nth(2).locator('.so-tiles'));
  check(
    'tiles · compact · auto: three on one row, four as two by two',
    three.length === 3 &&
      distinct(three.map((r) => r.y)) === 1 &&
      four.length === 4 &&
      distinct(four.map((r) => r.y)) === 2 &&
      distinct(four.map((r) => r.x)) === 2,
  );
  check(
    'tiles · compact · auto: a label too long for three falls to two, the last tile taking the row',
    long.length === 3 &&
      near(long[0].y, long[1].y) &&
      long[2].y > long[0].bottom &&
      near(long[2].w, longContent.w),
    long.map((r) => `${r.x},${r.y},${r.w}`).join(' '),
  );

  const asked = frame(page, 'Tiles · compact · columns asked for').locator('fluvy-stat-tiles-card');
  const askedThree = await rects(asked.nth(0).locator('.fv-option'));
  const askedTwo = await rects(asked.nth(1).locator('.fv-option'));
  const fullThree = await rects(asked.nth(2).locator('.fv-option'));
  check(
    'tiles: columns asked for are laid out — three with the long names cut, two with a wider last tile',
    askedThree.length === 3 &&
      distinct(askedThree.map((r) => r.y)) === 1 &&
      askedTwo.length === 3 &&
      askedTwo[2].y > askedTwo[0].bottom &&
      askedTwo[2].w > askedTwo[0].w,
  );
  check(
    'tiles: the full variant takes three a row too, 84 tall with their glyphs',
    fullThree.length === 3 &&
      distinct(fullThree.map((r) => r.y)) === 1 &&
      fullThree.every((r) => near(r.h, 84)) &&
      (await asked.nth(2).locator('.fv-option__glyph').count()) === 3,
    fullThree.map((r) => r.h).join(' '),
  );

  const half = frame(page, 'Tiles · compact · half a column')
    .locator('fluvy-stat-tiles-card')
    .first();
  const halfTiles = await rects(half.locator('.fv-option'));
  const halfContent = await rect(half.locator('.so-tiles'));
  check(
    'tiles · compact: in half a column, where two cells cannot hold a value, one a row (a value never wraps)',
    halfTiles.length === 3 &&
      distinct(halfTiles.map((r) => r.y)) === 3 &&
      halfTiles.every((r) => near(r.w, halfContent.w) && near(r.h, 64)),
    halfTiles.map((r) => `${r.w}×${r.h}`).join(' '),
  );

  const dashed = (locator) =>
    locator.evaluateAll((els) => els.map((el) => getComputedStyle(el).outlineStyle === 'dashed'));
  const deadCompact = frame(
    page,
    'Tiles · compact · readout, a dead tile, a missing tile, dead rows',
  ).locator('fluvy-stat-tiles-card');
  const deadFull = frame(page, 'Tiles · readout, odd count, a dead tile').locator(
    'fluvy-stat-tiles-card',
  );
  check(
    'tiles: a dead tile wears the Unavailable surface (the dashed hairline) in both variants, a live one does not',
    (await dashed(deadCompact.locator('.fv-option.is-unavailable'))).join() === 'true,true' &&
      (await dashed(deadCompact.locator('.fv-option:not(.is-unavailable)'))).join() === 'false' &&
      (await dashed(deadFull.nth(0).locator('.fv-option.is-unavailable'))).join() === 'true' &&
      (await dashed(deadFull.nth(1).locator('.fv-option.is-unavailable'))).join() === 'true,true',
  );
  check(
    'tiles · compact: the dead rows say their state as their value, the missing one with the ban glyph',
    (await texts(deadCompact.locator('.fv-row__value'))).join() ===
      'Unavailable,Unknown,Not found' &&
      (await deadCompact.locator('.fv-row').nth(2).locator('.fv-ico svg').evaluate(STRIP)) ===
        BAN &&
      (await deadCompact.locator('.fv-option').nth(2).locator('.fv-option__glyph').count()) === 0,
    (await texts(deadCompact.locator('.fv-row__value'))).join(),
  );
  const halfDead = frame(page, 'Tiles · compact · half a column')
    .locator('fluvy-stat-tiles-card')
    .nth(1);
  const halfDeadTitle = await halfDead.locator('.fv-row__title').evaluate((el) => ({
    cut: el.scrollWidth > el.clientWidth,
    w: el.getBoundingClientRect().width,
  }));
  check(
    'tiles · compact · half a column: a dead row gives its circle to its name and keeps the dash where the word would not leave the name its room',
    (await halfDead.locator('.fv-row.fv-row--bare.is-unavailable').count()) === 1 &&
      (await halfDead.locator('.fv-row .fv-ico').count()) === 0 &&
      (await text(halfDead.locator('.fv-row__value'))) === '—' &&
      halfDeadTitle.w >= 72,
    `${Math.round(halfDeadTitle.w)}${halfDeadTitle.cut ? '…' : ''} ${await text(halfDead.locator('.fv-row__value'))}`,
  );

  for (const [title, index] of [
    ['Tiles · compact', 0],
    ['Total capacity', 0],
    ['Tiles · readout, odd count, a dead tile', 0],
    ['Tiles · readout, odd count, a dead tile', 1],
    ['Tiles · compact · three, four, long labels', 0],
    ['Tiles · compact · three, four, long labels', 1],
    ['Tiles · compact · columns asked for', 0],
    ['Tiles · compact · columns asked for', 1],
    ['Tiles · compact · columns asked for', 2],
  ])
    await sameHeight(
      `${title} [${index}]`,
      frame(page, title).locator('fluvy-stat-tiles-card').nth(index),
    );
  await page.close();
}

/* ---------------------------------------------------------------- weather */
{
  const page = await suite.sheet('ambient');
  const cards = frame(page, 'Weather · compact').locator('fluvy-weather-card');
  const daily = cards.nth(0);
  check(
    'weather · compact: one head row, no hero — the condition circle (44), the name, the second line, the temperature',
    (await daily.locator('.fv-card__head').count()) === 1 &&
      (await daily.locator('.am-weather__hero').count()) === 0 &&
      near((await rect(daily.locator('.fv-card__head .fv-ico'))).w, 44) &&
      (await text(daily.locator('.fv-card__title'))) === 'Outside' &&
      (await text(daily.locator('.fv-card__sub'))) === 'Sunny · 22° / 13° · Feels 16°' &&
      (await text(daily.locator('.am-weather__temp'))) === '18°',
    `${await text(daily.locator('.fv-card__sub'))} / ${await text(daily.locator('.am-weather__temp'))}`,
  );
  const dayStrip = daily.locator('[data-forecast="daily"]');
  check(
    'weather · compact: the days ahead as five columns of 64 (the head says today), the weekday, the glyph, high and low',
    (await dayStrip.count()) === 1 &&
      (await daily.locator('[data-forecast="hourly"]').count()) === 0 &&
      (await dayStrip.locator('.am-hour').count()) === 5 &&
      (await texts(dayStrip.locator('.am-hour__t'))).join() === 'Fri,Sat,Sun,Mon,Tue' &&
      (await texts(dayStrip.locator('.am-hour__v'))).join('|') ===
        '23° 12°|20° 13°|17° 11°|19° 12°|2° -3°' &&
      (await rects(dayStrip.locator('.am-hour'))).every((r) => near(r.w, 64)) &&
      (await dayStrip.locator('.am-hour svg').count()) === 5 &&
      (await dayStrip.locator('.am-hour__low').count()) === 5,
    `${(await texts(dayStrip.locator('.am-hour__t'))).join()} / ${(await texts(dayStrip.locator('.am-hour__v'))).join('|')}`,
  );
  const hourly = cards.nth(1);
  check(
    'weather · compact · hourly: the hour strip alone, the second line without a high / low',
    (await hourly.locator('[data-forecast="hourly"] .am-hour').count()) === 5 &&
      (await hourly.locator('[data-forecast="daily"]').count()) === 0 &&
      (await text(hourly.locator('.fv-card__sub'))) === 'Partly cloudy · Feels 16°' &&
      (await text(hourly.locator('.am-weather__temp'))) === '17.6°',
    await text(hourly.locator('.fv-card__sub')),
  );
  const both = cards.nth(2);
  const strips = await both
    .locator('.am-hours')
    .evaluateAll((els) => els.map((el) => el.dataset.forecast));
  check(
    'weather · compact · both: the hours, then three days (as asked) as columns',
    strips.join() === 'hourly,daily' &&
      (await both.locator('[data-forecast="daily"] .am-hour').count()) === 3 &&
      (await texts(both.locator('[data-forecast="daily"] .am-hour__t'))).join() === 'Fri,Sat,Sun',
    strips.join(),
  );

  const halves = frame(page, 'Weather · compact · half a column').locator('fluvy-weather-card');
  check(
    'weather · compact: half a column holds two of the seven days asked, and the circle gives way so the name and the condition read whole',
    (await halves.nth(0).locator('[data-forecast="daily"] .am-hour').count()) === 2 &&
      (await halves.nth(0).locator('.fv-card__head .fv-ico').count()) === 0 &&
      (await text(halves.nth(0).locator('.fv-card__title'))) === 'Outside' &&
      (await text(halves.nth(0).locator('.fv-card__sub'))) === 'Sunny' &&
      (await halves.nth(1).locator('[data-forecast="hourly"] .am-hour').count()) === 3,
    `${await halves.nth(0).locator('[data-forecast="daily"] .am-hour').count()} days, sub "${await text(halves.nth(0).locator('.fv-card__sub'))}"`,
  );

  const edges = frame(page, 'Weather · compact · edges').locator('fluvy-weather-card');
  const cold = edges.nth(0);
  const coldValues = await texts(cold.locator('[data-forecast="daily"] .am-hour__v'));
  check(
    'weather · compact: figures below zero take wider columns — four of 80, each pair whole',
    coldValues.length === 4 &&
      coldValues.every((v) => /^[-−]?\d+° [-−]?\d+°$/.test(v)) &&
      (await rects(cold.locator('[data-forecast="daily"] .am-hour'))).every((r) => near(r.w, 80)),
    coldValues.join('|'),
  );
  check(
    'weather · compact: an entity without forecasts is the head alone',
    (await edges.nth(1).locator('.am-hours').count()) === 0 &&
      (await text(edges.nth(1).locator('.fv-card__sub'))) === 'Cloudy · Humidity 71 %',
  );
  const named = edges.nth(2);
  check(
    'weather · compact: a long name no column holds keeps its circle (giving it would not make it whole) and ends in an ellipsis, read whole on hover; the second line is never cut',
    (await named.locator('.fv-card__head .fv-ico').count()) === 1 &&
      (await named.locator('.fv-card__tap').evaluate((el) => el.scrollWidth > el.clientWidth)) &&
      (await named.locator('.fv-card__tap').getAttribute('title')) ===
        (await named.locator('.fv-card__tap').evaluate((el) => el.textContent.trim())) &&
      (await named.locator('.fv-card__sub').evaluate((el) => el.scrollWidth <= el.clientWidth)) &&
      (await text(named.locator('.fv-card__sub'))) === 'Sunny · Feels 16°',
    await text(named.locator('.fv-card__sub')),
  );
  // 1.9 (the owner's rule): missing is the dashed card too, its strips kept with nothing forecast
  check(
    'weather · compact: unknown is a live neutral head, unavailable and missing the dashed card with "—" and its strips',
    (await edges.nth(3).locator('.fv-ico--neutral').count()) === 1 &&
      (await text(edges.nth(3).locator('.fv-card__sub'))) === 'Unknown' &&
      (await edges.nth(4).locator('article.is-off').count()) === 1 &&
      (await text(edges.nth(4).locator('.am-weather__temp'))) === '—' &&
      (await edges.nth(5).locator('.fv-card--empty').count()) === 0 &&
      (await edges.nth(5).locator('article.is-off').count()) === 1 &&
      (await text(edges.nth(5).locator('.fv-card__sub'))) === 'Not found' &&
      (await edges.nth(5).locator('.am-hour__v').count()) > 0,
  );

  for (const [title, index] of [
    ['Weather · compact', 0],
    ['Weather · compact', 1],
    ['Weather · compact', 2],
    ['Weather · compact · edges', 0],
    ['Weather', 0],
    ['Weather · modes', 0],
    ['Weather · modes', 1],
  ])
    await sameHeight(
      `${title} [${index}]`,
      frame(page, title).locator('fluvy-weather-card').nth(index),
    );
  await page.close();
}

await suite.finish();
