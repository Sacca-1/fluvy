#!/usr/bin/env node
/**
 * The energy balance, the grid and the signed gauge (1.4), on the playground's `balance` and `balance-bare` sheets
 * (real cards, simulated hass). Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5184/ node interactions-balance.mjs
 * What it proves: the balance's two totals agree because the house is the remainder, a grid read per phase shows
 * each phase centred on zero with its direction in the unit, the badge says the grid's way and follows a reading that
 * changes, a period reads the Energy dashboard's meters and money and its chips switch the span; the grid card shows
 * the net with In / Out when the meter tells them apart, each phase's voltage, the price and today's totals, and its
 * taps open more-info; the signed gauge lights zero to the value in the grid's colour and says the direction; an
 * unreadable or missing sensor is "—" and nothing that depends on it is guessed; nothing configured says so.
 */
import { frame, moreInfo, reset, settle, startSuite, tapHead } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
const bare = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, '');
const texts = async (locator) =>
  (await locator.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());

const balance = (page, title, n = 0) =>
  frame(page, title).locator('fluvy-energy-balance-card').nth(n);
const grid = (page, title, n = 0) => frame(page, title).locator('fluvy-grid-card').nth(n);
const gauge = (page, title, n = 0) => frame(page, title).locator('fluvy-gauge-card').nth(n);

/** A block's title, total and legend ("Solar 3.2 kW"). */
const blocks = (card) =>
  card.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-block')]
      .filter((b) => b.querySelector('.en-bar12'))
      .map((b) => ({
        title: b.querySelector('.en-block__title').textContent.trim(),
        total: b.querySelector('.en-block__total').textContent.replace(/\s+/g, ' ').trim(),
        items: [...b.querySelectorAll('.en-legend__item')].map((i) =>
          i.textContent.replace(/\s+/g, ''),
        ),
        bars: [...b.querySelectorAll('.en-bar12 > span')].map(
          (s) => [...s.classList].find((k) => k.startsWith('en-ink--')) ?? s.className,
        ),
      })),
  );

const phases = (card) =>
  card.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-phase')].map((p) => ({
      name: p.querySelector('.en-phase__name').textContent.replace(/\s+/g, ''),
      value: p.querySelector('.en-phase__value').textContent.replace(/\s+/g, ''),
      fill:
        [...(p.querySelector('.en-phase__fill')?.classList ?? [])].find((k) => k.includes('--')) ??
        '',
      width: parseFloat(p.querySelector('.en-phase__fill')?.style.width ?? '0'),
    })),
  );

/* ---------- the balance, live ---------- */
{
  const page = await suite.sheet('balance', { width: 360 });
  const card = balance(page, 'Balance · live, per phase');
  const b = await blocks(card);
  check(
    'balance: what comes in — the sun and the grid’s import, 5.1 kW',
    b[0]?.title === 'Coming in' &&
      b[0]?.total === '5.1kW' &&
      b[0]?.items.join(' | ') === 'Solar3.2kW | Grid1.9kW' &&
      b[0]?.bars.join() === 'en-ink--solar,en-ink--grid',
    JSON.stringify(b[0]),
  );
  check(
    'balance: what goes out — the house the remainder, the battery, the export — agrees at 5.1 kW',
    b[1]?.title === 'Going out' &&
      b[1]?.total === '5.1kW' &&
      b[1]?.items.join(' | ') === 'House4.1kW | Battery0.6kW | Grid0.4kW' &&
      b[1]?.bars.join() === 'en-ink--home,en-ink--battery,en-ink--grid',
    JSON.stringify(b[1]),
  );
  check(
    'balance: the badge says the grid imports and exports at once; the head says how fresh',
    (await text(card.locator('.fv-badge'))) === 'Import + export' &&
      (await text(card.locator('.fv-card__sub'))) === 'Live · now',
  );
  const p = await phases(card);
  check(
    'balance: a phase per row, L1… by order, centred on zero, the direction in the unit',
    p.map((r) => `${r.name} ${r.value} ${r.fill}`).join(' | ') ===
      'L1 0.4kWout en-phase__fill--out | L2 1.0kWin en-phase__fill--in | L3 0.9kWin en-phase__fill--in' &&
      p[1].width > p[2].width &&
      p[2].width > p[0].width &&
      (await texts(card.locator('.en-phase-axis > span'))).join(' · ') === '← out · in →',
    JSON.stringify(p),
  );

  // L1 stops exporting and imports: the grid only imports, every figure follows
  await page.evaluate(() => window.fluvyMock.set('sensor.bl_l1', '0.2'));
  await settle(page);
  const after = await blocks(card);
  check(
    'balance: a reading that changes is drawn at once — the badge, the grid, the house, the phase',
    (await text(card.locator('.fv-badge'))) === 'Importing' &&
      after[0]?.items.join(' | ') === 'Solar3.2kW | Grid2.1kW' &&
      after[1]?.items.join(' | ') === 'House4.7kW | Battery0.6kW' &&
      after[0]?.total === '5.3kW' &&
      after[1]?.total === '5.3kW' &&
      (await phases(card))[0]?.value === '0.2kWin',
    JSON.stringify(after),
  );

  const auto = balance(page, 'Balance · the Energy dashboard’s, live');
  const a = await blocks(auto);
  check(
    'balance: no sources — the Energy dashboard’s (its grid by two sensors) give the same house',
    a[0]?.items.join(' | ') === 'Solar3.2kW | Grid1.9kW' &&
      a[1]?.items[0] === 'House4.1kW' &&
      (await auto.locator('.en-phase').count()) === 0,
    JSON.stringify(a),
  );

  const many = await blocks(
    balance(page, 'Balance · two roofs, two batteries, a generator, a car'),
  );
  check(
    'balance: two roofs and two batteries summed by kind; the car charging goes out; the totals agree',
    many[0]?.items.join(' | ') === 'Solar3.5kW | Battery0.5kW | Generator1.2kW' &&
      many[1]?.items.join(' | ') === 'House0.4kW | Battery0.8kW | Car3.7kW | Grid0.3kW' &&
      many[0]?.total === many[1]?.total,
    JSON.stringify(many),
  );

  const down = balance(page, 'Balance · the grid unreadable');
  const d = await blocks(down);
  // 1.9 (the owner's rule): a grid that cannot be read at all is listed once, among what comes in
  check(
    'balance: a phase unreadable — the grid, both totals and the house are “—”, the bars draw no proportions',
    d[0]?.total === '—' &&
      d[1]?.total === '—' &&
      d[0]?.items.join(' | ') === 'Solar1.8kW | Grid—' &&
      d[1]?.items.join(' | ') === 'House—' &&
      d.every((x) => x.bars.join() === 'en-bar12__track') &&
      (await text(down.locator('.fv-card__sub'))).startsWith('Grid · unavailable · since') &&
      (await phases(down))[1]?.value === '—',
    JSON.stringify(d),
  );
  const missing = balance(page, 'Balance · a missing sensor');
  check(
    'balance: a missing sensor says so in the badge and the head',
    (await text(missing.locator('.fv-badge'))) === 'Unavailable' &&
      (await text(missing.locator('.fv-card__sub'))) === 'Grid · unavailable',
  );
  const stale = balance(page, 'Balance · stale');
  check(
    'balance: stale readings — the head says how old, and no badge claims a way',
    (await text(stale.locator('.fv-card__sub'))) === 'Updated 12 min ago' &&
      (await stale.locator('.fv-badge').count()) === 0,
  );
  await page.close();
}

/* ---------- the balance over a period ---------- */
{
  const page = await suite.sheet('balance', { width: 360 });
  const card = balance(page, 'Balance · today');
  const b = await blocks(card);
  check(
    'a day: the Energy dashboard’s meters summed hour by hour, came in = went out = 17.7 kWh',
    b[0]?.title === 'Came in' &&
      b[0]?.items.join(' | ') === 'Solar11.2kWh | Grid4.1kWh | Battery2.4kWh' &&
      b[1]?.title === 'Went out' &&
      b[1]?.items.join(' | ') === 'House13.4kWh | Battery3.0kWh | Grid1.3kWh' &&
      b[0]?.total === '17.7kWh' &&
      b[1]?.total === '17.7kWh',
    JSON.stringify(b),
  );
  const money = await texts(card.locator('.ef-cols .fv-readout'));
  check(
    'a day: what the grid cost, what feeding it paid (the sensor Home Assistant made), the difference',
    money.join(' | ') === 'Cost 1.27€ | Feed-in 0.10€ | Net 1.17€',
    money.join(' | '),
  );
  check(
    'a day: no badge, the span in the head',
    (await card.locator('.fv-badge').count()) === 0 &&
      (await text(card.locator('.fv-card__sub'))) === 'Today · since midnight',
  );
  await card.locator('.fv-chip').nth(1).click();
  await settle(page);
  check(
    'the period chips switch the span',
    (await text(card.locator('.fv-card__sub'))) === 'Last 7 days' &&
      (await text(card.locator('.fv-chip.is-active'))) === 'Week' &&
      (await blocks(card))[0]?.total === '17.7kWh',
  );
  await page.close();
}

/* ---------- the grid ---------- */
{
  const page = await suite.sheet('balance', { width: 360 });
  const card = grid(page, 'Grid · three phases, the price');
  check(
    'grid: the net import in large, In and Out beside it, the head says the meter',
    (await text(card.locator('.ef-top .fv-readout'))) === 'Net import 1.5kW' &&
      (await bare(card.locator('.en-inout'))) === 'In1.9kWOut0.4kW' &&
      (await text(card.locator('.fv-card__sub'))) === '3 phases · 231 V' &&
      (await text(card.locator('.fv-badge'))) === 'Import + export',
  );
  const p = await phases(card);
  check(
    'grid: each phase with its voltage, centred on zero, the direction in the unit',
    p.map((r) => `${r.name} ${r.value}`).join(' | ') ===
      'L1229V 0.4kWout | L2232V 1.0kWin | L3231V 0.9kWin',
    JSON.stringify(p),
  );
  check(
    'grid: the price now in its own unit, the sensor’s name under it',
    (await text(card.locator('.fv-row__title'))) === 'Price now' &&
      (await text(card.locator('.fv-row__sub'))) === 'Electricity price' &&
      (await text(card.locator('.fv-row__value'))) === '0.31 €/kWh',
  );
  const today = await texts(card.locator('.ef-cols .fv-readout'));
  check(
    'grid: today’s totals from the Energy dashboard’s connection, and its net cost',
    today.join(' | ') === 'Imported 4.1kWh | Exported 1.3kWh | Net cost 1.17€',
    today.join(' | '),
  );
  await reset(page);
  await card.locator('.fv-row').click();
  await tapHead(card, 'icon');
  await settle(page, 200);
  check(
    'grid: the price row and the head’s icon open their sensors’ more-info',
    (await moreInfo(page)).join() === 'sensor.bl_price,sensor.bl_l1',
    (await moreInfo(page)).join(),
  );
  // L2 turns to export 2 kW: the net turns, In / Out and the phase follow
  await page.evaluate(() => window.fluvyMock.set('sensor.bl_l2', '-2000'));
  await settle(page);
  check(
    'grid: a reading that changes turns the net to an export at once',
    (await text(card.locator('.ef-top .fv-readout'))) === 'Net export 1.5kW' &&
      (await bare(card.locator('.en-inout'))) === 'In0.9kWOut2.4kW' &&
      (await phases(card))[1]?.value === '2.0kWout',
  );

  const auto = grid(page, 'Grid · the Energy dashboard’s');
  check(
    'grid: nothing named — the Energy dashboard’s first connection, read by its two sensors',
    (await bare(auto.locator('.en-inout'))) === 'In1.9kWOut0.4kW' &&
      (await text(auto.locator('.fv-card__sub'))) === 'Live · now' &&
      (await auto.locator('.en-phase').count()) === 0,
  );
  const signed = grid(page, 'Grid · one signed sensor, readouts');
  check(
    'grid: one signed sensor says the net alone (it cannot tell in from out), and the readouts asked for',
    (await text(signed.locator('.ef-top .fv-readout'))) === 'Net export 1.8kW' &&
      (await signed.locator('.en-inout').count()) === 0 &&
      (await text(signed.locator('.fv-badge'))) === 'Exporting' &&
      (await texts(signed.locator('.ef-cols .fv-readout__label'))).join() ===
        'Self-powered,Exported,Imported',
  );
  const down = grid(page, 'Grid · a phase unreadable');
  check(
    'grid: a phase unreadable — the net, In and Out are “—”, the phase too; a missing price is “—”',
    (await text(down.locator('.ef-top .fv-readout'))) === 'Net —' &&
      (await bare(down.locator('.en-inout'))) === 'In—Out—' &&
      (await phases(down))[1]?.value === '—' &&
      (await text(down.locator('.fv-card__sub'))).startsWith('Grid · unavailable · since') &&
      (await text(down.locator('.fv-row__value'))) === '—',
  );
  await page.close();
}

/* ---------- the signed gauge ---------- */
{
  const page = await suite.sheet('balance', { width: 360 });
  const lit = (card) =>
    card.evaluate((c) => {
      const ticks = [...c.shadowRoot.querySelectorAll('.en-tick')];
      const on = ticks.filter((t) => t.classList.contains('is-lit'));
      return {
        count: ticks.length,
        lit: on.length,
        stroke: on[0] ? getComputedStyle(on[0]).stroke : '',
        grid: getComputedStyle(c.shadowRoot.querySelector('.en-gauge')).getPropertyValue(
          '--fluvy-state-energy-grid',
        ),
        idle: ticks[0] ? getComputedStyle(ticks[0]).stroke : '',
      };
    });
  const card = gauge(page, 'Gauge · signed, exporting');
  const t = await lit(card);
  check(
    'gauge: 41 ticks over 270°, lit from zero to 1.8 of 5 kW out, in the grid’s colour',
    t.count === 41 && t.lit === 8 && t.stroke !== t.idle,
    JSON.stringify(t),
  );
  check(
    'gauge: the magnitude, its direction in the unit, the label asked for, the ends from ±max',
    (await text(card.locator('.en-gauge__value'))) === '1.8kW out' &&
      (await text(card.locator('.en-gauge__label'))) === 'Net' &&
      (await texts(card.locator('.en-gauge__end'))).join(' | ') === '5 kW out | 5 kW in' &&
      (await text(card.locator('.fv-badge'))) === 'Exporting',
  );
  check(
    'gauge: min, max and average of the day, each with its direction',
    (await texts(card.locator('.so-cols .fv-readout__value')))
      .join(' | ')
      .startsWith('2.2kW out | 0.4kW in'),
    (await texts(card.locator('.so-cols .fv-readout__value'))).join(' | '),
  );
  await page.evaluate(() => window.fluvyMock.set('sensor.bl_grid_net', '2.5'));
  await settle(page);
  check(
    'gauge: the meter turns to import — the other side lights, the words follow',
    (await lit(card)).lit === 11 &&
      (await text(card.locator('.en-gauge__value'))) === '2.5kW in' &&
      (await text(card.locator('.fv-badge'))) === 'Importing',
  );
  await reset(page);
  await tapHead(card, 'icon');
  await settle(page, 200);
  check(
    'gauge: the head’s icon opens the meter’s more-info',
    (await moreInfo(page)).join() === 'sensor.bl_grid_net',
  );
  const scaled = gauge(page, 'Gauge · signed, importing, its scale from the day');
  check(
    'gauge: no max — the day’s largest swing rounded up sets both ends',
    (await texts(scaled.locator('.en-gauge__end'))).join(' | ') === '3.5 kW out | 3.5 kW in',
  );
  const temp = gauge(page, 'Gauge · signed, not power');
  check(
    'gauge: not power — the signed figure, no direction words; each side its own scale',
    (await text(temp.locator('.en-gauge__value'))) === '−4.2°C' &&
      (await texts(temp.locator('.en-gauge__end'))).join(' | ') === '−20 °C | 40 °C' &&
      (await lit(temp)).lit === 5,
  );
  const down = gauge(page, 'Gauge · signed, unavailable');
  check(
    'gauge: unavailable — “—”, nothing lit, the card says so',
    (await text(down.locator('.en-gauge__value'))) === '—' &&
      (await lit(down)).lit === 0 &&
      (await text(down.locator('.fv-badge'))) === 'Unavailable',
  );
  await page.close();
}

/* ---------- nothing configured ---------- */
{
  const page = await suite.sheet('balance-bare', { width: 360 });
  check(
    'nothing configured and no Energy dashboard: each card says what it needs',
    (
      await text(balance(page, 'Balance · nothing configured').locator('.fv-empty-state__text'))
    ).startsWith('No power sensors yet') &&
      (await text(
        balance(page, 'Balance · a period, no Energy dashboard').locator('.fv-empty-state__text'),
      )) === 'No Energy dashboard yet' &&
      (await text(
        balance(page, 'Balance · a period, no Energy dashboard').locator('.fv-empty-state__hint'),
      )) === 'Set up the Energy dashboard to see these totals' &&
      (
        await text(grid(page, 'Grid · nothing configured').locator('.fv-empty-state__text'))
      ).startsWith('No grid sensor yet'),
  );
  await page.close();
}

await suite.finish();
