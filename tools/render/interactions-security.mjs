#!/usr/bin/env node
/**
 * Interaction tests for the security cards: lock (slide to unlock), alarm and its keypad, camera — slide-to-unlock only
 * commits past 85 % on a real release, the keypad never shows or keeps the code, and the camera loop stops off-screen,
 * in a hidden tab and when the card is removed.
 * Real cards on the playground's simulated hass. Exit code 1 on any failure.
 *   node interactions-security.mjs            (expects the playground dev server on :5183)
 */
import { calls, frame, moreInfo, PAGE_INTERVALS, reset, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;
const open = (sheet, options) => suite.sheet(sheet, options);

/* ---------- lock: slide to unlock ---------- */
{
  const page = await open('devices-security');
  const lock = frame(page, 'Lock').locator('fluvy-lock-card');
  const track = lock.locator('.dv-slide');
  const knob = track.locator('.dv-slide__knob');
  const tb = await track.boundingBox();
  const y = tb.y + tb.height / 2;
  const start = tb.x + 4 + 18;
  const span = tb.width - 44;

  await page.mouse.click(start, y);
  await settle(page, 500);
  check('lock: a tap on the knob does nothing', (await calls(page)).length === 0);
  await page.mouse.click(tb.x + tb.width / 2, y);
  await settle(page, 300);
  check('lock: a tap on the track does nothing', (await calls(page)).length === 0);

  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(start + span * 0.6, y, { steps: 12 });
  await page.mouse.up();
  await settle(page, 700);
  let kb = await knob.boundingBox();
  check(
    'lock: letting go at 60 % springs back and calls nothing',
    (await calls(page)).length === 0 && Math.abs(kb.x - (tb.x + 4)) < 2,
    `knob left ${(kb.x - tb.x).toFixed(1)}`,
  );

  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(start + span * 0.95, y, { steps: 14 });
  const ready = (await track.getAttribute('class')).includes('is-ready');
  await page.mouse.up();
  await settle(page, 100);
  let c = await calls(page);
  check(
    'lock: past 85 % the destination lights up, and the release unlocks — one call',
    ready && c.length === 1 && c[0].s === 'lock.unlock',
    JSON.stringify(c.map((x) => x.s)),
  );
  check(
    '…and the badge reads Unlocked before Home Assistant answers',
    (await lock.locator('.fv-badge').textContent()).trim() === 'Unlocked',
  );
  await settle(page, 700);
  await reset(page);
  kb = await knob.boundingBox();
  check(
    'lock: unlocked, the knob rests at the far end and the control mirrors',
    Math.abs(kb.x - (tb.x + tb.width - 40)) < 2 &&
      (await track.getAttribute('class')).includes('dv-slide--reverse'),
    `knob left ${(kb.x - tb.x).toFixed(1)} of ${tb.width}`,
  );

  // a cancelled touch (the page starts scrolling) never decides, even past the commit point
  const end = tb.x + tb.width - 4 - 18;
  await track.dispatchEvent('pointerdown', {
    pointerId: 7,
    pointerType: 'touch',
    clientX: end,
    clientY: y,
    button: 0,
    isPrimary: true,
    bubbles: true,
  });
  for (let i = 1; i <= 10; i++)
    await track.dispatchEvent('pointermove', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: end - span * 0.95 * (i / 10),
      clientY: y,
      bubbles: true,
    });
  await track.dispatchEvent('pointercancel', {
    pointerId: 7,
    pointerType: 'touch',
    clientX: end - span * 0.95,
    clientY: y,
    bubbles: true,
  });
  await settle(page, 700);
  check(
    'lock: a cancelled touch past the commit point locks nothing and springs back',
    (await calls(page)).length === 0 &&
      Math.abs((await knob.boundingBox()).x - (tb.x + tb.width - 40)) < 2,
  );

  await track.focus();
  await page.keyboard.press('Enter');
  check(
    'lock: the first keyboard press only asks',
    (await calls(page)).length === 0 &&
      (await track.locator('.dv-slide__hint').textContent()).includes('Press again'),
  );
  await page.keyboard.press('Enter');
  await settle(page, 200);
  c = await calls(page);
  check(
    'lock: the second press within 2 s locks',
    c.length === 1 && c[0].s === 'lock.lock',
    JSON.stringify(c.map((x) => x.s)),
  );
  await settle(page, 500);
  await reset(page);

  const coded = frame(page, 'Lock · needs a code').locator('fluvy-lock-card');
  const ct = coded.locator('.dv-slide');
  const cb = await ct.boundingBox();
  await page.mouse.move(cb.x + 22, cb.y + 22);
  await page.mouse.down();
  await page.mouse.move(cb.x + 22 + (cb.width - 44) * 0.95, cb.y + 22, { steps: 12 });
  await page.mouse.up();
  await settle(page, 400);
  const keypad = coded.locator('fluvy-keypad');
  const dialog = keypad.locator('dialog');
  check(
    'lock: a lock with a code opens the keypad instead of calling',
    (await calls(page)).length === 0 &&
      (await dialog.count()) === 1 &&
      (await dialog.locator('.dv-key').count()) === 11,
  );
  check(
    '…and the knob went home to wait',
    Math.abs((await ct.locator('.dv-slide__knob').boundingBox()).x - (cb.x + 4)) < 2,
  );
  const primary = dialog.locator('.fv-btn--accent');
  check('lock: Unlock is inert until the code is complete', await primary.isDisabled());
  for (const d of ['1', '2', '3']) await dialog.locator('.dv-key', { hasText: d }).click();
  check('…three digits of a four-digit code are not enough', await primary.isDisabled());
  await dialog.locator('.dv-key', { hasText: '4' }).click();
  check(
    '…four digits enable it, and the code appears nowhere in the DOM',
    !(await primary.isDisabled()) &&
      !(await keypad.evaluate((el) => el.shadowRoot.innerHTML.includes('1234'))) &&
      (await dialog.locator('.dv-code__dot.is-on').count()) === 4,
  );
  await page.waitForTimeout(400); // past the opening guard
  await primary.click();
  await settle(page, 400);
  c = await calls(page);
  check(
    'lock: the keypad sends lock.unlock with the code, once, and closes',
    c.length === 1 &&
      c[0].s === 'lock.unlock' &&
      c[0].d.code === '1234' &&
      (await dialog.count()) === 0,
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);

  const latch = frame(page, 'Lock · unlocked, with a latch').locator('fluvy-lock-card');
  await latch.locator('.dv-open .fv-btn').click();
  await settle(page, 300);
  const ld = latch.locator('fluvy-keypad dialog');
  check(
    'lock: the latch asks in a sheet first (no keys, no call yet)',
    (await calls(page)).length === 0 &&
      (await ld.count()) === 1 &&
      (await ld.locator('.dv-key').count()) === 0,
  );
  await page.waitForTimeout(400);
  await ld.locator('.fv-btn--accent').click();
  await settle(page, 400);
  c = await calls(page);
  check(
    '…and confirming sends lock.open',
    c.length === 1 && c[0].s === 'lock.open' && (await ld.count()) === 0,
    JSON.stringify(c.map((x) => x.s)),
  );
  await page.close();
}

/* ---------- alarm + keypad ---------- */
{
  const page = await open('devices-security');
  const alarm = frame(page, 'Alarm').locator('fluvy-alarm-card');
  const tiles = alarm.locator('.fv-option');
  await tiles.nth(2).click(); // Away — no code needed for arming on this panel
  check(
    'alarm: arming lights the chosen tile at once',
    (await tiles.nth(2).getAttribute('aria-pressed')) === 'true',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and sends alarm_arm_away without a code',
    c.length === 1 && c[0].s === 'alarm_control_panel.alarm_arm_away' && c[0].d.code === undefined,
    JSON.stringify(c),
  );
  await reset(page);
  await tiles.nth(0).click();
  await settle(page, 300); // Disarm → keypad
  const keypad = alarm.locator('fluvy-keypad');
  const dialog = keypad.locator('dialog');
  check(
    'alarm: disarming opens the keypad and calls nothing',
    (await calls(page)).length === 0 && (await dialog.count()) === 1,
  );
  const disarm = dialog.locator('.fv-btn--accent');
  check('alarm: Disarm is inert with no digits', await disarm.isDisabled());
  await page.keyboard.type('2580');
  check(
    'alarm: typed digits fill the dots, the code is nowhere in the DOM',
    (await dialog.locator('.dv-code__dot.is-on').count()) === 4 &&
      !(await keypad.evaluate((el) => el.shadowRoot.innerHTML.includes('2580'))) &&
      !(await keypad.evaluate((el) => el.shadowRoot.textContent.includes('2580'))),
  );
  await page.keyboard.press('Backspace');
  check(
    'alarm: backspace removes one digit',
    (await dialog.locator('.dv-code__dot.is-on').count()) === 3,
  );
  await page.keyboard.type('0');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await settle(page, 400);
  c = await calls(page);
  check(
    'alarm: Enter sends alarm_disarm with the code, once, and the sheet closes',
    c.length === 1 &&
      c[0].s === 'alarm_control_panel.alarm_disarm' &&
      c[0].d.code === '2580' &&
      (await dialog.count()) === 0,
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);

  // the scrim closes and forgets; a reopened keypad starts empty
  await settle(page, 300);
  await tiles.nth(1).click();
  await settle(page, 300); // Home (needs the code? no: code_arm_required false) → direct
  c = await calls(page);
  check(
    'alarm: arming home on a panel that needs no arm code sends directly',
    c.length === 1 && c[0].s === 'alarm_control_panel.alarm_arm_home',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await settle(page, 300);
  await tiles.nth(0).click();
  await settle(page, 300);
  await page.keyboard.type('12');
  check('alarm: two digits in', (await dialog.locator('.dv-code__dot.is-on').count()) === 2);
  await page.waitForTimeout(400);
  await page.mouse.click(20, 20);
  await settle(page, 400); // the scrim
  check('alarm: tapping the scrim closes the sheet', (await dialog.count()) === 0);
  await tiles.nth(0).click();
  await settle(page, 300);
  check(
    'alarm: a reopened keypad has forgotten the digits',
    (await dialog.locator('.dv-code__dot.is-on').count()) === 0,
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check('alarm: Escape closes the sheet', (await dialog.count()) === 0);

  const resting = frame(page, 'Alarm · disarmed, arming needs the code').locator(
    'fluvy-alarm-card',
  );
  await resting.locator('.fv-option').nth(2).click();
  await settle(page, 300);
  const rd = resting.locator('fluvy-keypad dialog');
  check(
    'alarm: a panel that needs a code to arm asks for it',
    (await calls(page)).length === 0 &&
      (await rd.count()) === 1 &&
      (await rd.locator('.dv-key').count()) === 11,
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);

  const gone = frame(page, 'Alarm · unavailable').locator('fluvy-alarm-card');
  await gone.locator('.fv-option').nth(1).click({ force: true });
  await settle(page, 200);
  check('alarm: an unavailable panel ignores its tiles', (await calls(page)).length === 0);
  await page.close();
}

/* ---------- keypad: the 30 s timeout forgets the digits and closes ---------- */
{
  const page = await open('devices-security', { clock: true });
  const alarm = frame(page, 'Alarm').locator('fluvy-alarm-card');
  await alarm.locator('.fv-option').nth(0).click();
  await page.clock.runFor(400);
  const dialog = alarm.locator('fluvy-keypad dialog');
  await page.keyboard.type('99');
  await page.clock.runFor(1000);
  const sub = (await dialog.locator('.fv-card__sub').textContent()).trim();
  check('keypad: the countdown runs from 30 s', /29 s$/.test(sub), sub);
  await page.clock.runFor(31_000);
  await page.waitForTimeout(300);
  check(
    'keypad: after 30 s of silence the sheet closes and the digits are gone',
    (await dialog.count()) === 0 &&
      (await alarm.evaluate((el) => el.shadowRoot.querySelector('fluvy-keypad').count_)) === 0,
  );
  await alarm.locator('.fv-option').nth(0).click();
  await page.clock.runFor(400);
  await page.keyboard.type('1');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(300);
  await page.waitForTimeout(200);
  check(
    'keypad: hiding the tab closes the sheet and forgets the digit',
    (await dialog.count()) === 0 &&
      (await alarm.evaluate((el) => el.shadowRoot.querySelector('fluvy-keypad').count_)) === 0,
  );
  await page.close();
}

/* ---------- keypad: a code typed and sent at the floor as at the design width ---------- */
// at 211 the head's line gives way ("Enter your code · 29 s" keeps "Enter your code"); the line is fitted before it is
// drawn, never written over the text the sheet draws — written over, every tick threw and no key reached the code
for (const width of [211, 360]) {
  const page = await open('devices-security', { width });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 120)));
  await settle(page, 1300); // a tick or two of the countdown
  const keypad = frame(page, 'Alarm · keypad sheet').locator('fluvy-keypad');
  const keys = keypad.locator('.dv-key');
  await reset(page);
  for (const index of [4, 7, 9]) await keys.nth(index).click(); // the demo's 1 2, then 5 8 0
  await settle(page, 1100);
  const line = await keypad.locator('.fv-sheet__head .fv-card__sub').evaluate((el) => ({
    text: el.textContent.trim(),
    whole: el.scrollWidth <= el.clientWidth + 0.5,
  }));
  check(
    `keypad at ${width}: each digit lights its dot, and the line holds whole ("${line.text}")`,
    (await keypad.locator('.dv-code__dot.is-on').count()) === 5 &&
      line.whole &&
      /^Enter your code/.test(line.text),
    JSON.stringify(line),
  );
  const disarm = keypad.locator('.dv-actions .fv-btn--accent');
  const ready = !(await disarm.isDisabled());
  await disarm.click();
  await settle(page, 300);
  const sent = await calls(page);
  check(
    `keypad at ${width}: Disarm sends the code typed, once, and nothing throws`,
    ready &&
      sent.length === 1 &&
      sent[0].s === 'alarm_control_panel.alarm_disarm' &&
      sent[0].d.code === '12580' &&
      errors.length === 0,
    JSON.stringify({ sent, errors: errors.slice(0, 2) }),
  );
  await page.close();
}

/* ---------- camera: the refresh loop ---------- */
{
  const page = await open('devices-security');
  const cam = frame(page, 'Camera').locator('fluvy-camera-card');
  const srcs = () =>
    cam.evaluate((el) =>
      Array.from(el.shadowRoot.querySelectorAll('.fv-plate__img')).map(
        (i) => i.getAttribute('src') ?? '',
      ),
    );
  const stamp = (list) =>
    list.map((s) => (s.match(/[?&#]_?=?(\d+)$/) ?? s.match(/(\d+)$/) ?? [])[1] ?? '').join('|');
  await cam.evaluate((el) => el.scrollIntoView({ block: 'center' })); // the camera sits at the foot of this sheet
  await page.waitForTimeout(900);
  const first = await srcs();
  check(
    'camera: on screen and in front, the first frame is requested and shown',
    first.some(Boolean) &&
      (await cam.locator('.fv-plate__img.is-on').count()) === 1 &&
      (await cam.locator('.dv-cam__live').count()) === 1,
  );
  await cam.evaluate((el) => {
    el.config = { ...el.config, refresh: 1 };
    el.setConfig({ ...el.config, refresh: 1 });
  });
  await page.waitForTimeout(2600);
  const after = await srcs();
  check(
    'camera: with refresh 1 s a new still arrives every second, alternating the two images',
    stamp(after) !== stamp(first) && after.every(Boolean),
    `${stamp(first)} → ${stamp(after)}`,
  );
  const running = await page.evaluate(() => window.__intervals());

  await page.evaluate(() => window.scrollTo(0, 0)); // the camera sits at the foot: the top of the page is away from it
  await page.waitForTimeout(600);
  const offA = await srcs();
  await page.waitForTimeout(1600);
  const offB = await srcs();
  const scrolledOut = await cam.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom < 0 || r.top > innerHeight;
  });
  check(
    'camera: off screen the loop stops (no new still in 1.6 s) and the LIVE pill fades',
    scrolledOut &&
      stamp(offA) === stamp(offB) &&
      (await cam.locator('.dv-cam__live.is-stale').count()) === 1,
    `${stamp(offA)} → ${stamp(offB)}`,
  );
  await cam.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1600);
  const back = await srcs();
  check(
    'camera: back on screen it resumes',
    stamp(back) !== stamp(offB) && (await cam.locator('.dv-cam__live.is-stale').count()) === 0,
    `${stamp(offB)} → ${stamp(back)}`,
  );

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const hidA = await srcs();
  await page.waitForTimeout(1600);
  const hidB = await srcs();
  check(
    'camera: in a hidden tab the loop stops',
    stamp(hidA) === stamp(hidB),
    `${stamp(hidA)} → ${stamp(hidB)}`,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1600);
  check('camera: it resumes when the tab returns', stamp(await srcs()) !== stamp(hidB));

  await cam.locator('.dv-cam__actions .fv-round').nth(0).click();
  check(
    'camera: the snapshot round opens more-info',
    (await moreInfo(page)).join() === 'camera.driveway',
  );
  const before = await page.evaluate(() => window.__intervals());
  await page.evaluate(() => {
    document.querySelectorAll('fluvy-camera-card').forEach((el) => el.remove());
  });
  await page.waitForTimeout(200);
  const left = await page.evaluate(() => window.__intervals());
  check(
    'camera: removing the cards releases the loop',
    running > 0 && before > 0 && left === PAGE_INTERVALS,
    `${before} → ${left}`,
  );
  await page.close();
}

/* ---------- camera: its shape, its fit, half a second, the stream (issue #26) ---------- */
{
  const page = await open('devices-security');
  const plate = (title) =>
    frame(page, title)
      .locator('fluvy-camera-card')
      .evaluate((el) => {
        const box = el.shadowRoot.querySelector('.dv-cam');
        const img = el.shadowRoot.querySelector('.fv-plate__img.is-on');
        return {
          w: box.getBoundingClientRect().width,
          h: box.getBoundingClientRect().height,
          fit: img ? getComputedStyle(img).objectFit : '',
          stream: Boolean(el.shadowRoot.querySelector('ha-camera-stream')),
          stills: el.shadowRoot.querySelectorAll('.fv-plate__img').length,
          time: el.shadowRoot.querySelectorAll('.dv-cam__time').length,
          refresh: el.config.refresh,
        };
      });
  const on4 = (v) => Math.round(v / 4) * 4;
  for (const title of [
    'Camera · 180°, its own shape',
    'Camera · 180° in 16:9, the whole picture',
    'Camera · 4:3, half a second',
    'Camera · live',
  ])
    await frame(page, title).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const wide = await plate('Camera · 180°, its own shape');
  check(
    'camera: `native` takes the camera’s own shape (a 180° camera’s 3:1), on the 4 px grid',
    wide.h === on4(wide.w / 3),
    JSON.stringify(wide),
  );
  const whole = await plate('Camera · 180° in 16:9, the whole picture');
  check(
    'camera: `contain` shows the whole picture in the 16:9 plate',
    whole.fit === 'contain' && whole.h === on4((whole.w * 9) / 16),
    JSON.stringify(whole),
  );
  const quick = await plate('Camera · 4:3, half a second');
  check(
    'camera: 4:3 is 4:3, and half a second is allowed',
    quick.h === on4((quick.w * 3) / 4) && quick.refresh === 0.5,
    JSON.stringify(quick),
  );
  const live = await plate('Camera · live');
  check(
    'camera: `live` shows Home Assistant’s stream in the plate, no stills under it and no time pill',
    live.stream && live.stills === 0 && live.time === 0,
    JSON.stringify(live),
  );

  // issue #28: one stream session for the card's life — not one per scroll, nor one per tab switch
  const liveCard = frame(page, 'Camera · live').locator('fluvy-camera-card');
  const sessions = () => page.evaluate(() => ({ ...window.pgStreams }));
  const node = () =>
    liveCard.evaluate((el) => {
      const stream = el.shadowRoot.querySelector('ha-camera-stream');
      if (stream && !stream.dataset.pg) stream.dataset.pg = String(Date.now());
      return stream?.dataset.pg ?? null;
    });
  const tagged = await node();
  const opened = (await sessions()).connected;
  await page.evaluate(() => window.scrollTo(0, 0)); // the live card sits at the foot: the top of the page is away from it
  await page.waitForTimeout(1200);
  const away = await liveCard.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom < 0 || r.top > innerHeight;
  });
  const whileAway = await node();
  await liveCard.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  check(
    'camera: scrolled away and back, the stream is the same element and no new session was opened',
    away &&
      tagged !== null &&
      whileAway === tagged &&
      (await node()) === tagged &&
      (await sessions()).connected === opened,
    JSON.stringify([tagged, whileAway, await node(), opened, await sessions()]),
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(600);
  const hidden = await node();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  check(
    'camera: a hidden tab is left to Home Assistant’s players: the element stays put',
    hidden === tagged && (await sessions()).connected === opened,
    JSON.stringify([hidden, await sessions()]),
  );
  const closed = (await sessions()).disconnected;
  await liveCard.evaluate((el) => el.setConfig({ ...el.config, camera_view: 'auto' }));
  await page.waitForTimeout(600);
  check(
    'camera: back to stills, the stream element is gone and its session closed',
    (await liveCard.locator('ha-camera-stream').count()) === 0 &&
      (await sessions()).disconnected === closed + 1 &&
      (await liveCard.locator('.fv-plate__img').count()) === 2,
    JSON.stringify(await sessions()),
  );
  const failed = await plate('Camera · live, no stream');
  check(
    'camera: a stream that cannot play gives way to the stills, with no stream element left in the plate',
    !failed.stream && failed.stills === 2 && failed.time === 1,
    JSON.stringify(failed),
  );
  const asked = await frame(page, 'Camera')
    .locator('fluvy-camera-card')
    .first()
    .evaluate((el) => {
      const view = el.hass.states['camera.driveway'];
      el.hass = {
        ...el.hass,
        states: {
          ...el.hass.states,
          'camera.driveway': {
            ...view,
            attributes: {
              ...view.attributes,
              entity_picture: '/api/camera_proxy/camera.driveway?token=t',
            },
          },
        },
      };
      el.inFlight = 0;
      el.pull();
      const srcs = [...el.shadowRoot.querySelectorAll('.fv-plate__img')].map(
        (i) => i.getAttribute('src') ?? '',
      );
      return { srcs, want: Math.ceil(el.contentWidth * (window.devicePixelRatio || 1)) };
    });
  await page.waitForTimeout(100);
  const proxied = await frame(page, 'Camera')
    .locator('fluvy-camera-card')
    .first()
    .evaluate((el) =>
      [...el.shadowRoot.querySelectorAll('.fv-plate__img')].map((i) => i.getAttribute('src') ?? ''),
    );
  check(
    'camera: a still is asked at the plate’s width in device pixels, its signed token kept',
    proxied.some((src) => src.includes('token=t') && src.includes(`width=${asked.want}&`)),
    JSON.stringify(proxied),
  );
  await page.close();
}

/* ---------- "Live" in every language: one line, inside its pill, its dot whole ---------- */
{
  const pills = [];
  for (const lang of ['en', 'es', 'de', 'nl', 'fr', 'it', 'pt-BR', 'tr']) {
    const page = await suite.sheet('devices-security', { extra: `&lang=${lang}` });
    // a camera fetches its stills on screen only: each is brought into view
    const cameras = page.locator('fluvy-camera-card');
    for (let i = 0; i < (await cameras.count()); i++) {
      await cameras.nth(i).scrollIntoViewIfNeeded();
      await settle(page, 250);
    }
    const read = await page.evaluate(() => {
      const out = [];
      for (const card of document.querySelectorAll('fluvy-camera-card')) {
        const live = card.shadowRoot?.querySelector('.dv-cam__live');
        if (!live || live.classList.contains('is-dot')) continue;
        const box = live.getBoundingClientRect();
        const dot = live.querySelector('i')?.getBoundingClientRect();
        out.push({
          h: Math.round(box.height),
          fits: live.scrollWidth <= live.clientWidth + 0.5,
          dot: Math.round(dot?.width ?? 0),
        });
      }
      return out;
    });
    pills.push({
      lang,
      ok: read.length > 0 && read.every((p) => p.h === 24 && p.fits && p.dot === 8),
    });
    await page.close();
  }
  check(
    'camera: "Live" on one line inside its pill, its dot whole, in all eight languages',
    pills.every((p) => p.ok),
    JSON.stringify(pills),
  );
}

/* ---------- the device rows in narrow columns, every language ---------- */
// the camera's, the lock's and the alarm's rows give their circles together where a name would get less than its 96
// beside what ends its row; an age takes its short form, one form a list; a state's word is never an age; nothing cut
// but a name, and a name only as names may (96 beside its circle, 40 once the circle is given)
{
  const cut = [];
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt-BR', 'tr']) {
    for (const width of [204, 211, 232, 256]) {
      const page = await open('devices-security', { width, lang });
      const found = await page.evaluate(() => {
        const out = [];
        for (const card of document.querySelectorAll(
          'fluvy-camera-card, fluvy-lock-card, fluvy-alarm-card',
        )) {
          const root = card.shadowRoot;
          const rows = [...root.querySelectorAll('.dv-rows .fv-row')];
          const ages = new Set();
          for (const row of rows) {
            const bare = row.classList.contains('fv-row--bare');
            for (const el of row.querySelectorAll('.fv-row__title, .fv-row__sub, .fv-row__value')) {
              if (!el.getBoundingClientRect().width) continue;
              const clipped = el.scrollWidth > el.clientWidth + 1;
              const name = el.classList.contains('fv-row__title');
              if (clipped && (!name || el.clientWidth < (bare ? 40 : 95)))
                out.push(
                  `${card.localName.slice(6)}: "${el.textContent.trim()}" ${el.clientWidth}/${el.scrollWidth}`,
                );
            }
            // a value ends inside its row: never past its edge, never over the next row
            const value = row.querySelector('.fv-row__value');
            if (value) {
              const v = value.getBoundingClientRect();
              const r = row.getBoundingClientRect();
              if (v.right > r.right + 0.5 || v.bottom > r.bottom + 0.5)
                out.push(
                  `${card.localName.slice(6)}: "${value.textContent.trim()}" leaves its row`,
                );
            }
            const sub = row.querySelector('.fv-row__sub')?.textContent.trim() ?? '';
            if (/\d/.test(sub) && !/:/.test(sub))
              ages.add(/^\d+ \S+$/.test(sub) ? 'short' : 'long');
          }
          if (ages.size > 1) out.push(`${card.localName.slice(6)}: ages in two forms`);
        }
        return out;
      });
      for (const f of found) cut.push(`${lang} ${width} ${f}`);
      await page.close();
    }
  }
  check(
    'device rows at 204, 211, 232 and 256 in eight languages: circles give way together, ages one form, nothing cut but a name as names may',
    cut.length === 0,
    cut.slice(0, 8).join(' · '),
  );
}

await suite.finish();
