#!/usr/bin/env node
/**
 * Where it went and the energy score, 1.4, on the playground's `sankey` sheet (real cards, simulated hass). Exit
 * code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5186/ node interactions-sankey.mjs
 * What it proves: the sankey reads the Energy dashboard's meters and devices (the figures its dashboard shows), one
 * px-per-kWh scale for every bar and ribbon, the house's ribbons in its ink at 24 %, a device inside another left
 * out and the rest "not measured", dashed; rows reordered when the grid charges the battery; words packed apart
 * inside the column; a period switch asks the statistics again; a tap opens a meter's more-info; a meter down, a
 * device missing, no Energy dashboard and unreadable statistics each say so. The score's rings are Home Assistant's
 * gauges (the fossil energy asked the way the Energy dashboard asks it), a ring the house cannot have is left out
 * and the rest stay centred, the net says its way, and taps open the grid's meter and the CO₂ signal.
 */
import { BASE, frame, moreInfo, reset, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const open = async (width = 360) => {
  const page = await suite.sheet('sankey', { width });
  await page.waitForTimeout(600);
  return page;
};
const sankey = (page, title, n = 0) =>
  frame(page, title).locator('fluvy-energy-sankey-card').nth(n);
const score = (page, title, n = 0) => frame(page, title).locator('fluvy-energy-score-card').nth(n);
const text = async (locator) => ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();

/** Every label of a sankey: its key, words and box, and whether a tap opens something. */
const labels = (card) =>
  card.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-sk-label')].map((l) => {
      const r = l.getBoundingClientRect();
      return {
        key: l.dataset.key,
        name: l.querySelector('.en-sk-name').textContent.trim(),
        value: l.querySelector('.en-sk-value').textContent.replace(/\s+/g, ''),
        button: l.getAttribute('role') === 'button',
        x: r.left,
        y: r.top,
        w: r.width,
        right: r.right,
      };
    }),
  );

/** The bars: key → width, and the ribbons' fills by ink. */
const drawing = (card) =>
  card.evaluate((c) => {
    const root = c.shadowRoot;
    const bars = Object.fromEntries(
      [...root.querySelectorAll('rect.en-node-bar[data-key]')].map((b) => [
        b.dataset.key,
        { w: Number(b.getAttribute('width')), dashed: b.classList.contains('is-dashed') },
      ]),
    );
    const ribbons = [...root.querySelectorAll('path.en-ribbon')].map((p) => ({
      key: p.dataset.key,
      ink: [...p.classList].find((k) => k.startsWith('en-ink--')),
      fill: getComputedStyle(p).fill,
    }));
    const card = root.querySelector('.en-sankey').getBoundingClientRect();
    return { bars, ribbons, width: card.width };
  });

/* ---------- the Energy dashboard's day, as its dashboard counts it ---------- */
{
  const page = await open();
  const card = sankey(page, 'Where it went');
  const l = await labels(card);
  const said = Object.fromEntries(l.map((x) => [x.name, x.value]));
  check(
    'the sources, what they fed and the house’s devices, the Energy dashboard’s figures',
    said['Grid'] === '4.1kWh' &&
      said['Battery'] === '2.4kWh' &&
      said['Solar'] === '11.2kWh' &&
      said['House'] === '13.4kWh' &&
      said['Charged'] === '3.0kWh' &&
      said['Exported'] === '1.3kWh' &&
      said['Heat pump'] === '5.1kWh' &&
      said['Car'] === '3.8kWh' &&
      said['Kitchen'] === '2.1kWh' &&
      said['Not measured'] === '2.4kWh',
    JSON.stringify(said),
  );
  check(
    'the oven is inside the kitchen’s figure: not drawn twice',
    !('Oven' in said),
    Object.keys(said).join(', '),
  );
  check(
    'the head: the period and every source’s energy',
    (await text(card.locator('.fv-card__sub'))) === 'Since midnight · 17.7 kWh',
  );
  const d = await drawing(card);
  const perKwh = Object.entries({
    grid: 4.1,
    battery: 2.4,
    solar: 11.2,
    house: 13.4,
    charged: 3.0,
    exported: 1.3,
    'device:0': 5.1,
    'device:1': 3.8,
    'device:2': 2.1,
    unmeasured: 2.4,
  }).map(([key, kwh]) => (d.bars[key]?.w ?? 0) / kwh);
  check(
    'one px-per-kWh scale for every bar',
    perKwh.every((s) => Math.abs(s - perKwh[0]) < 0.05) && perKwh[0] > 17,
    perKwh.map((s) => s.toFixed(2)).join(' '),
  );
  check(
    'what no device accounts for is dashed',
    d.bars.unmeasured?.dashed === true && d.bars['device:0']?.dashed === false,
  );
  const house = d.ribbons.filter((r) => r.key.startsWith('house-'));
  const fed = d.ribbons.filter((r) => !r.key.startsWith('house-'));
  check(
    'the sources’ ribbons wear their origin’s colour; the house’s its ink, quieter (24 % against 40 %)',
    house.length === 4 &&
      house.every((r) => r.ink === 'en-ink--home') &&
      fed.find((r) => r.key === 'solar-exported')?.ink === 'en-ink--solar' &&
      fed.find((r) => r.key === 'grid-house')?.ink === 'en-ink--grid' &&
      house[0].fill !== fed[0].fill,
    JSON.stringify(d.ribbons.map((r) => `${r.key} ${r.ink} ${r.fill}`)),
  );
  // words: inside the column, 16 apart on a tier
  const clash = [];
  for (const a of l)
    for (const b of l)
      if (a !== b && Math.abs(a.y - b.y) < 1 && a.x < b.x && b.x - a.right < 15.5)
        clash.push(`${a.name} / ${b.name}`);
  const first = l[0].x;
  check(
    'every word inside the column and 16 apart from its neighbour',
    clash.length === 0 && l.every((x) => x.x >= first - 0.5 && x.right <= first + d.width + 0.5),
    clash.join(', '),
  );

  // a tap on a meter's words opens it; a figure that is worked out opens nothing
  await reset(page);
  await card.locator('.en-sk-label[data-key="grid"]').click();
  await card.locator('.en-sk-label[data-key="device:0"]').click();
  check(
    'a tap on the grid’s and a device’s words opens their meters',
    JSON.stringify(await moreInfo(page)) ===
      JSON.stringify(['sensor.fl_grid_in_energy', 'sensor.sk_heat_pump_energy']),
    JSON.stringify(await moreInfo(page)),
  );
  check(
    'the house and “not measured” are not buttons: nothing to open',
    !l.find((x) => x.key === 'house')?.button && !l.find((x) => x.key === 'unmeasured')?.button,
  );

  // a meter goes down while the card is on screen: the head says so
  await page.evaluate(() => window.fluvyMock.set('sensor.fl_grid_in_energy', 'unavailable'));
  await page.waitForTimeout(300);
  check(
    'a meter that stops reading, live: the head says which and since when',
    /^Grid · unavailable · since \d\d:\d\d$/.test(await text(card.locator('.fv-card__sub'))),
    await text(card.locator('.fv-card__sub')),
  );
  await page.close();
}

/* ---------- the period chips ask the statistics again ---------- */
{
  const page = await open();
  const card = sankey(page, 'Devices of its own');
  // every question the card asks from here on is kept
  await card.evaluate((c) => {
    window.__ws = [];
    const hass = c.hass;
    c.hass = {
      ...hass,
      callWS: (message) => {
        window.__ws.push(message);
        return hass.callWS(message);
      },
    };
  });
  await card.locator('.fv-chip').nth(1).click();
  await page.waitForTimeout(500);
  const asked = await page.evaluate(() =>
    window.__ws.filter((m) => m.type === 'recorder/statistics_during_period'),
  );
  const start = asked[0] ? new Date(asked[0].start_time) : null;
  // the house's midnight six days back, in the browser's own zone (a runner in UTC and a desk in Madrid differ)
  const weekStart = await page.evaluate(() => new Date(2026, 8, 11).toISOString());
  check(
    'Week: the chip is chosen, the head says so, and the last 7 days are asked for day by day',
    (await text(card.locator('.fv-chip.is-active'))) === 'Week' &&
      (await text(card.locator('.fv-card__sub'))).startsWith('Last 7 days · ') &&
      asked.length === 1 &&
      asked[0].period === 'day' &&
      start?.toISOString() === weekStart,
    JSON.stringify(asked.map((m) => [m.period, m.start_time])),
  );
  const said = Object.fromEntries((await labels(card)).map((x) => [x.name, x.value]));
  check(
    'devices of its own: past three, the smallest two are “other devices”; the oven is in the kitchen',
    said['Heat pump'] === '5.1kWh' &&
      said['Other devices'] === '1.3kWh' &&
      said['Not measured'] === '1.1kWh' &&
      !('Oven' in said),
    JSON.stringify(said),
  );
  await page.close();
}

/* ---------- the hard cases ---------- */
{
  const page = await open();
  const night = await labels(sankey(page, 'The grid charges the battery'));
  const top = night
    .filter((x) => ['grid', 'battery', 'solar'].includes(x.key))
    .sort((a, b) => a.x - b.x);
  check(
    'the grid charging the battery: the battery goes first, so only the one crossing no order avoids is left',
    top.map((x) => x.key).join() === 'battery,grid,solar' &&
      night.find((x) => x.key === 'charged')?.value === '6.0kWh',
    top.map((x) => x.key).join(),
  );
  const grid = await labels(sankey(page, 'The grid alone'));
  check(
    'the grid alone: no battery, no sun, no charge, no export; its boiler and the rest of the house',
    grid.map((x) => x.key).join() === 'grid,house,device:0,unmeasured',
    grid.map((x) => x.key).join(),
  );
  check(
    'a meter down: the head says which and since when',
    (await text(sankey(page, 'A meter down').locator('.fv-card__sub'))) ===
      'Grid · unavailable · since 21:35',
  );
  const missing = sankey(page, 'A device that is not there');
  check(
    'a device that is not there: left out of the drawing, named in the head',
    (await text(missing.locator('.fv-card__sub'))).endsWith('· unavailable') &&
      (await labels(missing)).map((x) => x.key).join() ===
        'grid,battery,solar,house,charged,exported,device:0,unmeasured',
  );
  const bare = frame(page, 'Nothing configured');
  check(
    'no Energy dashboard: both cards say how to get one, and offer no chips',
    (await text(bare.locator('fluvy-energy-sankey-card .fv-empty-state__text'))) ===
      'No Energy dashboard yet' &&
      (await text(bare.locator('fluvy-energy-sankey-card .fv-empty-state__hint'))) ===
        'Set up the Energy dashboard to see these totals' &&
      (await text(bare.locator('fluvy-energy-score-card .fv-empty-state__text'))) ===
        'No Energy dashboard yet' &&
      (await bare.locator('.fv-chip').count()) === 0,
  );
  const unread = frame(page, 'Statistics that cannot be read');
  const dashes = await unread
    .locator('fluvy-energy-score-card .en-score__value, fluvy-energy-score-card .fv-readout__value')
    .allTextContents();
  check(
    'statistics that cannot be read: the sankey says so, the score reads "—" and draws no arc',
    (await text(unread.locator('fluvy-energy-sankey-card .fv-empty-state__text'))) ===
      'Statistics unavailable' &&
      (await text(unread.locator('fluvy-energy-sankey-card .fv-empty-state__hint'))) ===
        'The Energy dashboard’s statistics cannot be read right now' &&
      dashes.length === 6 &&
      dashes.every((t) => t.trim() === '—') &&
      (await unread.locator('fluvy-energy-score-card .en-score__arc').count()) === 0,
    dashes.join(' | '),
  );
  await page.close();
}

/* ---------- the score: Home Assistant's gauges ---------- */
{
  const page = await open();
  const card = score(page, 'Energy score · as approved');
  const rings = await card.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-score')].map((r) => ({
      key: r.dataset.ring,
      value: r.querySelector('.en-score__value').textContent.replace(/\s+/g, ''),
      label: r.querySelector('.en-score__label').textContent.trim(),
    })),
  );
  check(
    'three rings: self-powered 1 − 4.1 ÷ 13.4, the sun followed through the battery, low-carbon 1 − 1.8 ÷ 14.0',
    rings.map((r) => `${r.label} ${r.value}`).join(' | ') ===
      'Self-powered 69% | Sun used 86% | Low-carbon 87%',
    JSON.stringify(rings),
  );
  const readouts = await card.evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.fv-readout')].map(
      (r) =>
        `${r.querySelector('.fv-readout__label').textContent.trim()} ${r
          .querySelector('.fv-readout__value')
          .textContent.replace(/\s+/g, '')}`,
    ),
  );
  check(
    'imported, exported, and the net with its way in the unit’s slot',
    readouts.join(' | ') === 'Imported 4.1kWh | Exported 1.3kWh | Net 2.8kWhin',
    readouts.join(' | '),
  );

  // each readout sits under its ring, to the pixel, in a phone's column and a desktop's
  const aligned = async (c) =>
    c.evaluate((el) => {
      const root = el.shadowRoot;
      const mid = (r) => r.left + r.width / 2;
      const rings = [...root.querySelectorAll('.en-score svg')].map((s) =>
        mid(s.getBoundingClientRect()),
      );
      const cols = [...root.querySelectorAll('.fv-readout')].map((r) =>
        mid(r.getBoundingClientRect()),
      );
      return rings.map((x, i) => Math.abs(x - (cols[i] ?? Infinity)));
    });
  const phone = await aligned(card);
  const desktop = await aligned(score(page, 'A desktop column'));
  check(
    'every readout centred under its ring, in a 360 column and a 392 one',
    phone.length === 3 && [...phone, ...desktop].every((d) => d < 0.5),
    JSON.stringify({ phone, desktop }),
  );

  // the fossil energy, asked the way the Energy dashboard asks it
  await card.evaluate((c) => {
    window.__ws = [];
    const hass = c.hass;
    c.hass = {
      ...hass,
      callWS: (message) => {
        window.__ws.push(message);
        return hass.callWS(message);
      },
    };
  });
  const month = score(page, 'Energy score');
  await month.evaluate((c) => {
    const hass = c.hass;
    c.hass = {
      ...hass,
      callWS: (message) => {
        window.__ws.push(message);
        return hass.callWS(message);
      },
    };
  });
  await month.locator('.fv-chip').nth(2).click();
  await page.waitForTimeout(500);
  const fossil = await page.evaluate(() =>
    window.__ws.filter((m) => m.type === 'energy/fossil_energy_consumption'),
  );
  const monthStart = await page.evaluate(() => new Date(2026, 8, 1).toISOString());
  check(
    'Month: energy/fossil_energy_consumption with the grid’s import meters, the house’s CO₂ signal, day by day from the 1st',
    (await text(month.locator('.fv-card__sub'))) === 'This month' &&
      fossil.length === 1 &&
      JSON.stringify(fossil[0].energy_statistic_ids) === '["sensor.fl_grid_in_energy"]' &&
      fossil[0].co2_statistic_id === 'sensor.sk_co2' &&
      fossil[0].period === 'day' &&
      fossil[0].start_time === monthStart &&
      typeof fossil[0].end_time === 'string',
    JSON.stringify(fossil),
  );

  await reset(page);
  await card.locator('[data-ring="low_carbon"]').click();
  await card.locator('.en-tap').first().click();
  check(
    'a tap on low-carbon opens the CO₂ signal, on Imported the grid’s meter',
    JSON.stringify(await moreInfo(page)) ===
      JSON.stringify(['sensor.sk_co2', 'sensor.fl_grid_in_energy']),
    JSON.stringify(await moreInfo(page)),
  );

  // a ring the house cannot have is left out, the rest stay centred
  const centred = await score(page, 'No battery, no CO₂ signal').evaluate((c) => {
    const root = c.shadowRoot;
    const box = root.querySelector('.en-scores').getBoundingClientRect();
    const rings = [...root.querySelectorAll('.en-score svg')].map((s) => s.getBoundingClientRect());
    return {
      keys: [...root.querySelectorAll('.en-score')].map((r) => r.dataset.ring),
      left: rings[0].left - box.left,
      right: box.right - rings[rings.length - 1].right,
      net: root.querySelectorAll('.fv-readout__value')[2].textContent.replace(/\s+/g, ''),
    };
  });
  check(
    'no CO₂ signal: no low-carbon ring, the other two centred; a net exporter says "out"',
    centred.keys.join() === 'self_powered,sun_used' &&
      Math.abs(centred.left - centred.right) < 0.5 &&
      centred.net === '0.5kWhout',
    JSON.stringify(centred),
  );
  const noSun = await score(page, 'No sun').evaluate((c) =>
    [...c.shadowRoot.querySelectorAll('.en-score')].map((r) => r.dataset.ring),
  );
  check('no sun: no “sun used”', noSun.join() === 'self_powered,low_carbon', noSun.join());
  const cabin = score(page, 'Off grid');
  check(
    'off grid: self-powered alone, and no grid to import from or export to',
    (await cabin.locator('.en-score').count()) === 1 &&
      (await text(cabin.locator('.en-score__value'))).replace(/\s+/g, '') === '100%' &&
      (await cabin.locator('.fv-readout').count()) === 0,
  );
  check(
    'a meter down: the score’s head says so too',
    (await text(score(page, 'The score with a meter down').locator('.fv-card__sub'))) ===
      'Grid · unavailable · since 21:35',
  );
  await page.close();
}

/* ---------- a card leaves nothing running ---------- */
{
  const page = await suite.page('sheet=sankey&width=360');
  const before = await page.evaluate(() => window.__intervals());
  await page.evaluate(() =>
    document
      .querySelectorAll('fluvy-energy-sankey-card, fluvy-energy-score-card')
      .forEach((c) => c.remove()),
  );
  const after = await page.evaluate(() => window.__intervals());
  check(
    'removed, the cards stop their clocks',
    after < before && after <= 1,
    `${before} → ${after}`,
  );
  await page.close();
}

void BASE;
await suite.finish();
