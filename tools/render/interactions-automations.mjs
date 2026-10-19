#!/usr/bin/env node
/**
 * Interaction tests for the automations card and its schedule sheet, on the playground's simulated hass and its
 * in-memory config API. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-automations.mjs
 * What it proves: a switch flips under the finger and calls `automation.turn_off` once; a tap on a schedule opens
 * the sheet without a call; a changed start saves as one POST with the new `at`, the sheet closes and the row reads
 * the new window; `+` opens a new schedule whose Save stays disabled until a target and a verb are chosen, then
 * POSTs under a fresh `fluvy_` id and the row appears; a `!fail` alias shows Home Assistant's message and adds no
 * row; Delete arms on the first tap and DELETEs on the second; a plain automation's details Run `automation.trigger`
 * with `skip_condition` and Traces navigates to its trace; a still press opens more-info; a guest sees no `+`,
 * reads no config and gets more-info on tap; Escape closes the sheet and the focus returns to the row; the cards
 * leave no interval behind. A card for one lamp (`targets`) lists its schedule and the plain automation Home Assistant
 * relates to it, says when it next turns on, opens its `+` straight onto the lamp (Save at once, nothing asked of the
 * search the moment it lands), keeps Escape and a touch from the popup it sits in; a few targets are chips that press
 * where they stand; an end takes its quick spans; German long words wrap in the empty panel and the mode chips go
 * two and one.
 */
import {
  apiCalls,
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
const open = (options) => suite.sheet('automations', options);
const SCHEDULE_ID = /^config\/automation\/config\/(fluvy_[0-9a-f]{12})$/;

/* ---------- the rows: the switch, the sheet, a save, a new one, a refusal, a delete ---------- */
{
  const page = await open();
  const card = frame(page, 'Rows').locator('fluvy-automations-card');
  const row = (name) => card.locator('.fv-row', { hasText: name });
  const sheet = card.locator('fluvy-schedule-sheet');
  const dialog = sheet.locator('dialog');
  const save = dialog.locator('.ss-footer .fv-btn--accent');
  const posts = async () => (await apiCalls(page)).filter((c) => c.method === 'POST');
  // the Filters frame lists the whole house: what is saved or deleted comes and goes there (Rows lists a subset)
  const house = frame(page, 'Filters').locator('fluvy-automations-card');

  // the switch
  const sw = row('Good morning').locator('.fv-switch');
  check('rows: Good morning is on', (await sw.getAttribute('aria-checked')) === 'true');
  await reset(page);
  await row('Good morning').locator('.fv-hit').click();
  check(
    'rows: the thumb flips before the mock answers',
    (await sw.getAttribute('aria-checked')) === 'false',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and one automation.turn_off is called',
    c.length === 1 &&
      c[0].s === 'automation.turn_off' &&
      c[0].t.entity_id === 'automation.good_morning',
    JSON.stringify(c),
  );
  await reset(page);

  // a schedule's sheet
  check(
    'rows: a schedule says its days, its window and its next run (in fewer words beside the switch)',
    /^Workdays · 06:45–08:00 · (Next in|In) \d+ h$/.test(
      await row('Good morning').locator('.fv-row__sub').textContent(),
    ),
    await row('Good morning').locator('.fv-row__sub').textContent(),
  );
  // the Blinds row: a sun window gives way in its order, whole — never a segment cut with an ellipsis
  const whole = (sub) =>
    sub.evaluate((el) => ({
      text: el.textContent.trim(),
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
    }));
  const blinds = await whole(row('Blinds').locator('.fv-row__sub'));
  check(
    'rows: the Blinds sun window gives way to "Sunrise–Sunset" at 360, whole',
    blinds.text === 'Every day · Sunrise–Sunset' && !blinds.clipped,
    JSON.stringify(blinds),
  );
  const narrow = await whole(
    frame(page, 'Narrow 232')
      .locator('fluvy-automations-card')
      .locator('.fv-row', { hasText: 'Blinds' })
      .locator('.fv-row__sub'),
  );
  check(
    'rows: at 232 the Blinds line keeps the days and the sun’s word, whole, never cut',
    narrow.text === 'Every day · Sunrise' && !narrow.clipped,
    JSON.stringify(narrow),
  );
  await row('Good morning').locator('.fv-row__title').click();
  await settle(page, 600);
  check(
    'rows: a tap on a schedule opens the sheet, calling nothing',
    (await dialog.count()) === 1 && (await calls(page)).length === 0,
  );
  check(
    '…on the schedule as it is: Turn on at 70 %, Workdays by the sensor, until 08:00',
    (await dialog.locator('.ss-do .fv-option.is-active').textContent()).includes('70 %') &&
      (await dialog.locator('.ss-when > .fv-options .fv-option.is-active').textContent()).includes(
        'Workday sensor',
      ) &&
      (await dialog.locator('.ss-until .fv-row__sub').textContent()) === '06:45–08:00',
  );
  // the start: an hour up on the hours, a step of five on the minutes
  await dialog.locator('.ss-start fluvy-time-field .tf__seg[data-seg="h"]').focus();
  await page.keyboard.press('ArrowUp');
  await dialog.locator('.ss-start fluvy-time-field .tf__seg[data-seg="m"]').focus();
  await page.keyboard.press('ArrowUp');
  await settle(page, 200);
  check(
    'sheet: the arrows move the start to 07:50 (the minutes by the step of five)',
    (await dialog.locator('.ss-until .fv-row__sub').textContent()) === '07:50–08:00',
    await dialog.locator('.ss-until .fv-row__sub').textContent(),
  );
  await page.waitForTimeout(400); // past the opening guard
  await save.click();
  await settle(page, 500);
  let api = await posts();
  check(
    'sheet: Save posts the schedule once, with the new start, and closes',
    api.length === 1 &&
      api[0].path === 'config/automation/config/fluvy_a1b2c3d4e5f6' &&
      api[0].body.triggers[0].at === '07:50:00' &&
      api[0].body.id === 'fluvy_a1b2c3d4e5f6' &&
      (await dialog.count()) === 0,
    JSON.stringify(api.map((x) => [x.path, x.body?.triggers])),
  );
  await settle(page, 500);
  check(
    '…and the row reads the new window',
    (await row('Good morning').locator('.fv-row__sub').textContent()).includes('07:50–08:00'),
    await row('Good morning').locator('.fv-row__sub').textContent(),
  );

  // a new schedule from the head's +
  await reset(page);
  await card.locator('.fv-card__head .fv-round').click();
  await settle(page, 500);
  check(
    '+: the sheet opens on a new schedule, Save disabled',
    (await dialog.count()) === 1 &&
      (await dialog.locator('.fv-sheet__title').textContent()).trim() === 'New schedule' &&
      (await save.isDisabled()),
  );
  await dialog.locator('.ss-search input').fill('kitchen');
  await settle(page, 200);
  check(
    '+: the search narrows the candidates to the kitchen lamp',
    (await dialog.locator('.ss-candidates .fv-row').count()) === 1,
  );
  await dialog.locator('.ss-candidates .fv-row', { hasText: 'Kitchen lamp' }).click();
  await settle(page, 200);
  check(
    '+: a target alone is not whole (Save stays disabled), and it is a chip now',
    (await save.isDisabled()) && (await dialog.locator('.ss-chosen .fv-chip').count()) === 1,
  );
  await dialog.locator('.ss-do .fv-option', { hasText: 'Turn on' }).click();
  await settle(page, 200);
  check('+: a verb makes it whole', !(await save.isDisabled()));
  check(
    '+: the name suggests itself from what it does',
    (await dialog.locator('input[data-field="alias"]').inputValue()).startsWith(
      'Kitchen lamp · Every day',
    ),
    await dialog.locator('input[data-field="alias"]').inputValue(),
  );
  await page.waitForTimeout(400);
  await save.click();
  await settle(page, 600);
  api = await posts();
  const match = api[0] && SCHEDULE_ID.exec(api[0].path);
  check(
    '+: Save posts once under a fresh fluvy id, turning the lamp on',
    api.length === 1 &&
      match !== null &&
      api[0].body.id === match[1] &&
      api[0].body.actions[0].action === 'light.turn_on' &&
      (await dialog.count()) === 0,
    JSON.stringify(api.map((x) => x.path)),
  );
  check(
    '…and the row appears the moment its entity does, on a card listing the house',
    (await house.locator('.fv-row', { hasText: 'Kitchen lamp · Every day' }).count()) === 1 &&
      (await row('Kitchen lamp · Every day').count()) === 0, // a listed subset stays the subset
  );

  // a refusal
  await reset(page);
  await card.locator('.fv-card__head .fv-round').click();
  await settle(page, 500);
  await dialog.locator('.ss-search input').fill('hall');
  await settle(page, 200);
  await dialog.locator('.ss-candidates .fv-row', { hasText: 'Hall light' }).click();
  await settle(page, 200);
  await dialog.locator('.ss-do .fv-option', { hasText: 'Turn off' }).click();
  await settle(page, 200);
  await dialog.locator('input[data-field="alias"]').fill('!fail');
  await page.keyboard.press('Enter');
  await settle(page, 200);
  const before = await card.locator('.fv-row').count();
  await page.waitForTimeout(400);
  await save.click();
  await settle(page, 500);
  check(
    '!fail: Home Assistant’s message shows under the footer and the sheet stays',
    (await dialog.count()) === 1 &&
      (await dialog.locator('.ss-error').textContent()).includes('Message malformed'),
    await dialog.locator('.ss-error').textContent(),
  );
  check(
    '…Save is live again, and no row was added',
    !(await save.isDisabled()) && (await card.locator('.fv-row').count()) === before,
  );
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check('Escape closes the refused sheet', (await dialog.count()) === 0);

  // delete
  await reset(page);
  await row('Blinds').locator('.fv-row__title').click();
  await settle(page, 500);
  const del = dialog.locator('.ss-delete');
  await page.waitForTimeout(400);
  await del.click();
  await settle(page, 200);
  check(
    'delete: the first tap arms, deleting nothing',
    (await del.textContent()).trim() === 'Tap again to delete' &&
      (await apiCalls(page)).every((x) => x.method !== 'DELETE'),
  );
  await del.click();
  await settle(page, 500);
  api = (await apiCalls(page)).filter((x) => x.method === 'DELETE');
  check(
    '…the second deletes, once, and the sheet closes',
    api.length === 1 &&
      api[0].path === 'config/automation/config/fluvy_0b1a2d3e4f50' &&
      (await dialog.count()) === 0,
    JSON.stringify(api),
  );
  await settle(page, 500);
  check(
    '…and the row is gone from the card listing the house',
    (await house.locator('.fv-row', { hasText: 'Blinds' }).count()) === 0,
  );

  // details
  await reset(page);
  await row('Leak alert').locator('.fv-row__title').click();
  await settle(page, 500);
  check(
    'details: a plain automation opens its details, with its two links',
    (await dialog.locator('.fv-sheet__title').textContent()).trim() === 'Leak alert' &&
      (await dialog.locator('.ss-links .fv-row').count()) === 2,
  );
  await page.waitForTimeout(400);
  const run = dialog.locator('.dv-actions .fv-btn--accent');
  await run.click();
  await settle(page, 200);
  c = await calls(page);
  check(
    'details: Run triggers the automation, skipping its conditions, and reads Done for a beat',
    c.length === 1 &&
      c[0].s === 'automation.trigger' &&
      c[0].d.skip_condition === true &&
      c[0].t.entity_id === 'automation.leak_alert' &&
      (await run.textContent()).trim() === 'Done',
    JSON.stringify(c),
  );
  await dialog.locator('.ss-links .fv-row', { hasText: 'Traces' }).click();
  await settle(page, 400);
  check(
    'details: Traces navigates to the automation’s trace and closes the sheet',
    (await page.evaluate(() => window.location.pathname)) ===
      '/config/automation/trace/1690000000001' && (await dialog.count()) === 0,
    await page.evaluate(() => window.location.pathname),
  );

  // a still press
  await reset(page);
  const title = row('Leak alert').locator('.fv-row__title');
  const box = await title.boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await settle(page, 300);
  check(
    'rows: a still press opens more-info, never the sheet',
    (await moreInfo(page)).includes('automation.leak_alert') && (await dialog.count()) === 0,
    JSON.stringify(await moreInfo(page)),
  );

  // Escape and the focus
  await row('Good morning').locator('.fv-row__title').click();
  await settle(page, 500);
  check('rows: the sheet is open again', (await dialog.count()) === 1);
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const focused = await page.evaluate(() => {
    const card = document.querySelector('[data-frame$="/Rows"] fluvy-automations-card');
    const active = card?.shadowRoot?.activeElement;
    return active ? `${active.className} · ${active.textContent?.trim().slice(0, 12)}` : '';
  });
  check(
    'Escape closes the sheet and the focus returns to the row',
    (await dialog.count()) === 0 && focused.includes('fv-row') && focused.includes('Good morning'),
    focused,
  );
  await page.close();
}

/* ---------- a guest ---------- */
{
  const page = await open();
  const guest = frame(page, 'Guest').locator('fluvy-automations-card');
  check('guest: no + in the head', (await guest.locator('.fv-card__head .fv-round').count()) === 0);
  check(
    'guest: a schedule is a plain row (its last run, not its days)',
    !(
      await guest
        .locator('.fv-row', { hasText: 'Good morning' })
        .locator('.fv-row__sub')
        .textContent()
    ).includes('Workdays'),
  );
  const reads = await page.evaluate(() => window.__guestApi ?? []);
  check('guest: no config is ever read', reads.length === 0, JSON.stringify(reads));
  await reset(page);
  await guest.locator('.fv-row', { hasText: 'Leak alert' }).locator('.fv-row__title').click();
  await settle(page, 400);
  check(
    'guest: a tap opens more-info, never the sheet',
    (await moreInfo(page)).includes('automation.leak_alert') &&
      (await guest.locator('fluvy-schedule-sheet').count()) === 0,
  );
  await guest.locator('.fv-row', { hasText: 'Leak alert' }).locator('.fv-hit').click();
  await settle(page, 300);
  const c = await calls(page);
  check(
    'guest: the switch still works',
    c.length === 1 && c[0].s === 'automation.turn_off',
    JSON.stringify(c),
  );
  await page.close();
}

/* ---------- filters and tiles ---------- */
{
  const page = await open();
  const filters = frame(page, 'Filters').locator('fluvy-automations-card');
  const names = async () =>
    (await filters.locator('.fv-row .fv-row__title').allTextContents()).map((t) => t.trim());
  check(
    'filters: sorted by the next run, the schedules come first',
    (await names()).slice(0, 2).join(' · ') === 'Good morning · Blinds',
    (await names()).join(' · '),
  );
  await filters.locator('.fv-chip', { hasText: 'Schedules' }).click();
  await settle(page, 300);
  check(
    'filters: Schedules keeps the three schedules alone',
    (await names()).length === 3 && (await names()).every((n) => !n.includes('Leak')),
    (await names()).join(' · '),
  );
  await filters.locator('.fv-chip', { hasText: 'On' }).click();
  await settle(page, 300);
  check(
    'filters: On drops the ones that are off',
    !(await names()).includes('Vacation lights') && (await names()).includes('Leak alert'),
    (await names()).join(' · '),
  );
  const tiles = frame(page, 'Tiles').locator('fluvy-automations-card');
  check(
    'tiles: two a row, each its name and its next or last run, the on ones lit',
    (await tiles.locator('.fv-option').count()) === 7 &&
      (await tiles.locator('.fv-option.is-active').count()) === 4 &&
      (await tiles.locator('.fv-option', { hasText: 'Good morning' }).textContent()).includes(
        'Next',
      ),
  );
  await tiles.locator('.fv-option', { hasText: 'Good morning' }).click();
  await settle(page, 500);
  const dialog = tiles.locator('fluvy-schedule-sheet dialog');
  check(
    'tiles: a tap opens the sheet, whose head carries the switch',
    (await dialog.count()) === 1 &&
      (await dialog.locator('.fv-sheet__head .fv-switch').count()) === 1,
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
  const left = await page.evaluate(() => {
    for (const el of document.querySelectorAll('fluvy-automations-card')) el.remove();
    return window.__intervals();
  });
  check('the cards leave no interval behind', left <= PAGE_INTERVALS, `${left} live`);
  await page.close();
}

/* ---------- one lamp (`targets`), a popup's card ---------- */
{
  const page = await open();
  const lamp = frame(page, 'One lamp').locator('fluvy-automations-card');
  const names = async (card) =>
    (await card.locator('.fv-row .fv-row__title').allTextContents()).map((t) => t.trim());
  const related = () =>
    page.evaluate(
      () => window.fluvyMock.wsCalls.filter((call) => call.type === 'search/related').length,
    );
  check(
    'one lamp: its schedule and the plain automation Home Assistant relates to it, nothing else',
    (await names(lamp)).join(' · ') === 'Good morning · Vacation lights',
    (await names(lamp)).join(' · '),
  );
  const sub = (await lamp.locator('.fv-card__head .fv-card__sub').textContent()).trim();
  check(
    'one lamp: the head says when the lamp next turns on',
    /^Turns on in \d+ h · 1 of 2 on$/.test(sub),
    sub,
  );

  // nothing yet; a guest (before the save below adds a schedule the guest's card lists too)
  check(
    'empty: the lamp says nothing is scheduled for it',
    (
      await frame(page, 'One lamp · empty').locator('.fv-empty-state__text').textContent()
    ).trim() === 'Nothing scheduled for Fountain yet',
  );
  const guest = frame(page, 'One lamp · guest').locator('fluvy-automations-card');
  const reads = await page.evaluate(() => window.__guestApi ?? []);
  check(
    'guest: the lamp’s rows, no +, no config read',
    (await names(guest)).join(' · ') === 'Good morning · Vacation lights' &&
      (await guest.locator('.fv-card__head .fv-round').count()) === 0 &&
      reads.length === 0,
    JSON.stringify(reads),
  );

  // the +: straight onto the lamp
  await reset(page);
  const dialog = lamp.locator('fluvy-schedule-sheet dialog');
  const save = dialog.locator('.ss-footer .fv-btn--accent');
  await lamp.locator('.fv-card__head .fv-round').click();
  await settle(page, 500);
  check(
    '+: no search, the lamp a fixed row, Turn on chosen, Save ready',
    (await dialog.count()) === 1 &&
      (await dialog.locator('.ss-search').count()) === 0 &&
      (await dialog.locator('.ss-fixed .fv-row__title').textContent()).trim() === 'Kitchen lamp' &&
      (await dialog.locator('.ss-do .fv-option.is-active').textContent()).includes('Turn on') &&
      !(await save.isDisabled()),
  );
  const fixed = await dialog
    .locator('.ss-fixed .fv-row__title')
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  check('+: the fixed row’s name is whole', fixed);
  // Escape stays in the sheet: a popup listening on the window never hears it
  await page.evaluate(() => {
    window.__escapes = 0;
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') window.__escapes += 1;
    });
  });
  const before = await related();
  await page.waitForTimeout(400); // past the opening guard
  await save.click();
  await settle(page, 60);
  const posts = (await apiCalls(page)).filter((c) => c.method === 'POST');
  check(
    'Save posts once, under a fresh fluvy id, turning the lamp alone on',
    posts.length === 1 &&
      SCHEDULE_ID.test(posts[0].path) &&
      JSON.stringify(posts[0].body.actions[0].target) ===
        JSON.stringify({ entity_id: ['light.kitchen'] }),
    JSON.stringify(posts.map((x) => [x.path, x.body?.actions])),
  );
  check(
    '…and asks Home Assistant nothing the moment it lands (it reloads after answering)',
    (await related()) === before,
    `${(await related()) - before} asked`,
  );
  await settle(page, 600);
  check(
    '…the new schedule lists on the lamp’s card and on the card of the house',
    (await names(lamp)).filter((n) => n.startsWith('Kitchen lamp · Every day')).length === 1 &&
      (await frame(page, 'Filters')
        .locator('.fv-row', { hasText: 'Kitchen lamp · Every day' })
        .count()) === 1,
    (await names(lamp)).join(' · '),
  );
  await lamp.locator('.fv-row', { hasText: 'Good morning' }).locator('.fv-row__title').click();
  await settle(page, 500);
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Escape closes the sheet alone: a window listener never hears it',
    (await dialog.count()) === 0 && (await page.evaluate(() => window.__escapes)) === 0,
    `${await page.evaluate(() => window.__escapes)} heard`,
  );
  await lamp.locator('.fv-row', { hasText: 'Good morning' }).locator('.fv-row__title').click();
  await settle(page, 500);
  const touched = await page.evaluate(() => {
    const card = document.querySelector('[data-frame$="/One lamp"] fluvy-automations-card');
    const holder = card.parentElement;
    let heard = 0;
    holder.addEventListener('touchstart', () => (heard += 1));
    const inside = card.shadowRoot
      .querySelector('fluvy-schedule-sheet')
      .shadowRoot.querySelector('.ss-do .fv-option');
    inside.dispatchEvent(new Event('touchstart', { bubbles: true, composed: true }));
    return heard;
  });
  check('a touch in the sheet never reaches the popup around it', touched === 0, `${touched}`);
  await page.keyboard.press('Escape');
  await settle(page, 400);

  // a few targets: chips that press where they stand
  const few = frame(page, 'Sheet · a few');
  const chips = few.locator('.ss-targets .fv-chip');
  const boxes = async () =>
    JSON.stringify(
      await chips.evaluateAll((els) =>
        els.map((el) => {
          // against the row, which a click may scroll
          const row = el.parentElement.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return [box.x - row.x, box.y - row.y, box.width, box.height].map(Math.round);
        }),
      ),
    );
  const at = await boxes();
  await chips.nth(1).click();
  await settle(page, 200);
  check(
    'a few: a chip presses where it stands, its neighbours still',
    (await chips.nth(1).getAttribute('aria-pressed')) === 'true' && (await boxes()) === at,
  );
  const whole = await chips.evaluateAll((els) =>
    els.every((el) => {
      const name = el.querySelector('.fv-chip__name');
      return !name || name.scrollWidth <= name.clientWidth;
    }),
  );
  check('a few: every name whole', whole);

  // an end's quick spans
  const until = frame(page, 'Sheet · until');
  check(
    'until: the quick spans, the hour pressed for a window that starts on the hour',
    (await until.locator('.ss-spans .fv-chip').allTextContents())
      .map((t) => t.trim())
      .join(' · ') === '15 min · 30 min · 1 h · 2 h' &&
      (await until.locator('.ss-spans .fv-chip[aria-pressed="true"]').textContent()).trim() ===
        '1 h',
  );
  await until.locator('.ss-spans .fv-chip', { hasText: '2 h' }).click();
  await settle(page, 200);
  check(
    'until: two hours after the start',
    (await until.locator('.ss-until .fv-row__sub').textContent()) === '22:00–00:00',
    await until.locator('.ss-until .fv-row__sub').textContent(),
  );
  await page.close();
}

/* ---------- German: long words in narrow places ---------- */
{
  const page = await open({ lang: 'de' });
  const text = frame(page, 'One lamp · long name').locator('.fv-empty-state__text');
  const held = await text.evaluate((el) => {
    const panel = el.closest('.fv-empty-state').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return box.left >= panel.left && box.right <= panel.right && el.scrollWidth <= el.clientWidth;
  });
  check('de: a long name breaks inside the empty panel at 211, never past it', held);
  const modes = frame(page, 'Sheet · until').locator('.ss-start .fv-chip');
  const rows = await modes.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  check(
    'de: the start’s three mode chips go two and one where three would cut a word',
    rows.length === 3 && rows[0] === rows[1] && rows[2] > rows[0],
    JSON.stringify(rows),
  );
  await page.close();
}

await suite.finish();
