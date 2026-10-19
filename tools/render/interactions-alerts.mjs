#!/usr/bin/env node
/**
 * The alerts card, 1.9 (issue #48), on the playground's `alerts` sheet (real cards, simulated hass). Exit code 1 on any
 * failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-alerts.mjs
 * What it proves: a tile opens its alert's sheet as a modal, Escape closes it and the focus goes back to the tile; a
 * row opens its entity's details once, the sheet stepping aside first; a row's Install installs that update alone;
 * Home Assistant's alert is acknowledged through Home Assistant; "Lock all" asks in the sheet first and then locks every
 * match in one call; a snooze is one write of the person's data and the alert goes; a `for` reached on the page's clock
 * shows the card, its match gone hides it again (said to the dashboard both ways); the banner turns, holds under a
 * pointer and holds still without motion (saying how many more); a tile's hold opens the overview, its snoozed alert
 * with Wake; and the cards leave no interval behind.
 */
import { contrastRatio, toHex } from './lib/colour.mjs';
import {
  BASE,
  calls,
  frame,
  moreInfo,
  PAGE_INTERVALS,
  reset,
  settle,
  startSuite,
} from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const card = (page, title) => frame(page, title).locator('fluvy-alerts-card').first();
const tile = (c, name) => c.locator('.al-tile', { hasText: name }).first();
const dialog = (c) => c.locator('fluvy-alerts-sheet dialog');
const ws = (page) => page.evaluate(() => window.fluvyMock.wsCalls.map((call) => call.type));

const page = await suite.sheet('alerts');

/* ---------- a tile opens its sheet; Escape closes it and the focus goes back ---------- */
{
  const tiles = card(page, 'Tiles');
  await tile(tiles, 'Low batteries').locator('.fv-tile__tap').click();
  await settle(page, 500);
  const open = await dialog(tiles).evaluate((el) => el.open && el.matches(':modal'));
  const rows = await dialog(tiles).locator('.as-rows .fv-row').count();
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const closed = (await dialog(tiles).count()) === 0;
  const focus = await tiles.evaluate(
    (el) => el.shadowRoot.activeElement?.closest('.al-tile')?.textContent ?? '',
  );
  check(
    'a tile opens its alert’s sheet as a modal (its four batteries), Escape closes it and the focus goes back to the tile',
    open && rows === 4 && closed && /Low batteries/.test(focus),
    JSON.stringify({ open, rows, closed, focus: focus.replace(/\s+/g, ' ').trim() }),
  );
}

/* ---------- a row's tap: the entity's details, once, the sheet out of the way ---------- */
{
  await reset(page);
  const tiles = card(page, 'Tiles');
  await tile(tiles, 'Low batteries').locator('.fv-tile__tap').click();
  await settle(page, 500);
  await dialog(tiles).locator('.as-rows .fv-row .fv-tile__tap').first().click();
  await settle(page, 500);
  const asked = await moreInfo(page);
  check(
    'a row opens its entity’s details once, the sheet closing first',
    asked.length === 1 &&
      asked[0] === 'sensor.al_bath_leak_battery' &&
      (await dialog(tiles).count()) === 0,
    JSON.stringify(asked),
  );
}

/* ---------- a row's button: Install that update alone ---------- */
{
  await reset(page);
  const tiles = card(page, 'Tiles');
  await tile(tiles, 'Updates').locator('.fv-tile__tap').click();
  await settle(page, 500);
  const buttons = await dialog(tiles).locator('.as-hit').count();
  await dialog(tiles).locator('.as-hit').first().click();
  await settle(page, 300);
  const done = await calls(page);
  check(
    'Install stands on each update that can be installed (not on one installing) and installs that one alone',
    buttons === 2 &&
      done.length === 1 &&
      done[0].s === 'update.install' &&
      JSON.stringify(done[0].t) === JSON.stringify({ entity_id: ['update.al_zigbee'] }),
    JSON.stringify({ buttons, done }),
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
}

/* ---------- Home Assistant's alert, acknowledged through Home Assistant ---------- */
{
  await reset(page);
  const own = card(page, 'Repairs and Home Assistant alerts');
  await tile(own, 'Freezer door open').locator('.fv-tile__tap').click();
  await settle(page, 500);
  await dialog(own).locator('.as-actions .fv-btn', { hasText: 'Acknowledge' }).click();
  await settle(page, 300);
  const done = await calls(page);
  check(
    'Home Assistant’s alert is acknowledged through Home Assistant (alert.turn_off on it)',
    done.length === 1 &&
      done[0].s === 'alert.turn_off' &&
      JSON.stringify(done[0].t) === JSON.stringify({ entity_id: ['alert.al_freezer'] }),
    JSON.stringify(done),
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
}

/* ---------- Lock all: asked in the sheet, then every match in one call ---------- */
{
  await reset(page);
  const locks = card(page, 'Escalated');
  await tile(locks, 'Unlocked').locator('.fv-tile__tap').click();
  await settle(page, 500);
  // the alert's own button: the accent, then armed
  const all = dialog(locks).locator('.as-actions .fv-btn:not(.fv-btn--quiet)');
  await all.click();
  await settle(page, 200);
  const asked = (await all.textContent()).trim();
  // its words read on its fill with the pointer still on it, and moved away
  const ink = () =>
    all.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  const ratio = ([fg, bg]) => +contrastRatio(toHex(fg), toHex(bg)).toFixed(2);
  const hovered = ratio(await ink());
  await page.mouse.move(0, 0);
  await settle(page, 300);
  const away = ratio(await ink());
  const before = await calls(page);
  await all.click();
  await settle(page, 300);
  const done = await calls(page);
  const ids = (done[0]?.t?.entity_id ?? []).slice().sort();
  check(
    '"Lock all" asks in the sheet first, then locks every unlocked lock in one call',
    asked === 'Tap again to confirm' &&
      before.length === 0 &&
      done.length === 1 &&
      done[0].s === 'lock.lock' &&
      JSON.stringify(ids) === JSON.stringify(['lock.al_back_door', 'lock.al_shed']),
    JSON.stringify({ asked, before, done }),
  );
  check(
    'armed, its words read at 4.5 on its own fill, the pointer on it and away',
    hovered >= 4.5 && away >= 4.5,
    JSON.stringify({ hovered, away }),
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
}

/* ---------- the hold: the overview, the snoozed alert with Wake (before a write prunes the seeded snooze) ---------- */
{
  const tiles = card(page, 'Tiles');
  const cover = tile(tiles, 'Hazards').locator('.fv-tile__tap');
  await cover.evaluate((el) => el.fvHold());
  await settle(page, 500);
  const titles = await dialog(tiles).locator('.as-rows .fv-row__title').allTextContents();
  check(
    'a hold opens the overview of every alert',
    titles.length === 7 && titles[0] === 'Hazards',
    JSON.stringify(titles),
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
  const overview = card(page, 'Sheet · overview');
  const wake = overview.locator('fluvy-alerts-sheet .fv-row', { hasText: 'Lights unavailable' });
  const said = (await wake.locator('.fv-row__sub').textContent()).trim();
  await wake.locator('.as-hit').click();
  await settle(page, 400);
  const after = await overview
    .locator('fluvy-alerts-sheet .fv-row', { hasText: 'Lights unavailable' })
    .locator('.fv-row__value')
    .textContent();
  check(
    'the overview says until when an alert is snoozed, and Wake brings it back',
    /^Snoozed until /.test(said) && after?.trim() === '2',
    JSON.stringify({ said, after }),
  );
}

/* ---------- a snooze: one write of the person's data, the alert gone ---------- */
{
  await reset(page);
  const live = card(page, 'Live · snooze');
  const heard = await live.evaluate((el) => {
    window.__seen = [];
    el.addEventListener('card-visibility-changed', (event) =>
      window.__seen.push(event.detail.value),
    );
    return true;
  });
  await tile(live, 'Errors').locator('.fv-tile__tap').click();
  await settle(page, 500);
  await dialog(live).locator('.as-actions .fv-btn', { hasText: 'Snooze' }).click();
  await settle(page, 200);
  await dialog(live).locator('.as-snooze .fv-chip', { hasText: '1 h' }).click();
  await settle(page, 600);
  const writes = (await ws(page)).filter((type) => type === 'frontend/set_user_data');
  const hidden = await live.evaluate((el) => el.hidden);
  const seen = await page.evaluate(() => window.__seen);
  check(
    'Snooze 1 h is one write of the person’s data, and the alert goes (the card steps aside, and says so)',
    heard && writes.length === 1 && hidden && JSON.stringify(seen) === JSON.stringify([false]),
    JSON.stringify({ writes, hidden, seen }),
  );
}

/* ---------- the banner: it turns, holds under a pointer ---------- */
{
  const banner = card(page, 'Live · banner');
  await banner.scrollIntoViewIfNeeded();
  const name = () => banner.locator('.fv-tile__name').textContent();
  const first = await name();
  await settle(page, 1600);
  const next = await name();
  await banner.locator('.al-tile').hover();
  const held = await name();
  await settle(page, 1600);
  const still = await name();
  await page.mouse.move(0, 0);
  check(
    'the banner turns to the next alert by itself, and holds while a pointer is on it',
    first !== next && held === still,
    JSON.stringify({ first, next, held, still }),
  );
}

/* ---------- the cards leave no interval behind ---------- */
{
  const left = await page.evaluate(() => {
    for (const el of document.querySelectorAll('fluvy-alerts-card')) el.remove();
    return window.__intervals();
  });
  check('the cards leave no interval behind', left <= PAGE_INTERVALS, `${left} live`);
}
await page.close();

/* ---------- a `for` reached on the page's clock; the match gone ---------- */
{
  const live = await suite.page('sheet=alerts&width=360', { clock: true });
  const patio = card(live, 'Live · for');
  await patio.evaluate((el) => {
    window.__seen = [];
    el.addEventListener('card-visibility-changed', (event) =>
      window.__seen.push(event.detail.value),
    );
  });
  const hidden = await patio.evaluate((el) => el.hidden);
  await live.evaluate(() => window.fluvyMock.set('binary_sensor.al_patio_door', 'on'));
  await live.clock.runFor(4 * 60_000);
  const early = await patio.evaluate((el) => el.hidden);
  await live.clock.runFor(61_000);
  await settle(live, 200);
  const shown = await patio.evaluate((el) => !el.hidden);
  await live.evaluate(() => window.fluvyMock.set('binary_sensor.al_patio_door', 'off'));
  await live.clock.runFor(1000);
  await settle(live, 200);
  const gone = await patio.evaluate((el) => el.hidden);
  const seen = await live.evaluate(() => window.__seen);
  check(
    'a door open five minutes shows the card at the fifth minute, not before; closed, the card steps aside again',
    hidden && early && shown && gone && JSON.stringify(seen) === JSON.stringify([true, false]),
    JSON.stringify({ hidden, early, shown, gone, seen }),
  );
  await live.close();
}

/* ---------- rows in half a section: the end gives way, the count into the line ---------- */
{
  const half = await suite.browser.newPage({ viewport: { width: 1400, height: 1000 } });
  // a phone's section of 320: its halves 152
  await half.goto(`${BASE}?sheet=alerts&width=320`);
  await half.waitForSelector('html[data-ready="1"]');
  await settle(half, 900);
  const read = (title) =>
    card(half, title).evaluate((el) => {
      const rows = [...el.shadowRoot.querySelectorAll('.al-rows .fv-row')];
      const low = rows.find(
        (row) => row.querySelector('.fv-row__title')?.textContent === 'Low batteries',
      );
      return {
        width: Math.round(el.getBoundingClientRect().width),
        chevrons: el.shadowRoot.querySelectorAll('.fv-row__chevron').length,
        values: el.shadowRoot.querySelectorAll('.al-value').length,
        line: (low?.querySelector('.fv-row__sub')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        // every name has the row: its title box as wide as the row
        whole: rows.every(
          (row) =>
            row.querySelector('.fv-row__title').getBoundingClientRect().width >=
            row.getBoundingClientRect().width - 1,
        ),
      };
    });
  const narrow = await read('Rows · half');
  const wide = await read('Rows');
  check(
    'rows in half a section give their count and chevron to the names: the count said in the line, every name the row’s',
    narrow.width <= 160 &&
      narrow.chevrons === 0 &&
      narrow.values === 0 &&
      narrow.line === '4 devices' &&
      narrow.whole &&
      wide.chevrons === 7 &&
      wide.values > 0,
    JSON.stringify({ narrow, wide }),
  );
  await half.close();
}

/* ---------- without motion the banner holds the gravest, and says how many more ---------- */
{
  const still = await suite.browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await still.emulateMedia({ reducedMotion: 'reduce' });
  await still.goto(`${BASE}?sheet=alerts&width=360`);
  await still.waitForSelector('html[data-ready="1"]');
  await settle(still, 900);
  const banner = card(still, 'Live · banner');
  const first = await banner.locator('.fv-tile__name').textContent();
  await settle(still, 1600);
  const later = await banner.locator('.fv-tile__name').textContent();
  const line = (await banner.locator('.fv-tile__state').textContent()).replace(/\s+/g, ' ').trim();
  check(
    'without motion the banner holds the gravest alert and says how many more there are',
    first === later && first === 'Hazards' && /6 more$/.test(line),
    JSON.stringify({ first, later, line }),
  );
  await still.close();
}

await suite.finish();
