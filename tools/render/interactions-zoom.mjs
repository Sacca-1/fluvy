#!/usr/bin/env node
/**
 * A size per device (#21) on the playground's dashboard mock: `?dashboard=<sheet>&zoom=125` is Home Assistant's
 * header over a sheet's real cards as the view, the bundle's own `look/zoom.ts` (the address read, remembered and
 * cleaned) and the shell's `device-zoom` sheet on `hui-root`. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-zoom.mjs            (ENGINE=webkit for WebKit)
 * What it proves: the view is zoomed and the header is not (56 tall, the window's width); `?zoom=` is remembered
 * by the device and dropped from the address, a page without it keeps the size, `?zoom=off` ends it and a size
 * not on the list is ignored; the edit mode is unzoomed; a phone's page never scrolls sideways; under the zoom a
 * ruler's knob stays under the finger and a drag lands where the finger lets go (and a tap where it taps), the
 * lock's grip rides under the finger and still only unlocks past the commit point, a dial follows the pointer to
 * the middle of its sweep, a chart reads the same moment under the pointer as at 100 %, a tab row centres the tab
 * chosen, the keypad and the schedule sheet open whole on a phone at 150 %; and no frame gains an ellipsis or a
 * clipped line at 125 or
 * 150 % that it does not have at 100 %.
 */
import { dialTo, dragTo, mousePointer, rulerGeometry } from './lib/gestures.mjs';
import { BASE, calls, ENGINE, frame, reset, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 700 };

/** The dashboard mock at a size (and more of its parameters); every page is its own browser context. */
const open = (sheet, zoom, { viewport = DESKTOP, extra = '' } = {}) =>
  suite.page(`dashboard=${sheet}&zoom=${zoom}${extra}`, { viewport });

/** What the page says of its size: the variable, the view's zoom, the header's box, the device's memory. */
const sized = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('hui-root').shadowRoot;
    const view = root.querySelector('#view > hui-view');
    const header = root.querySelector('.header').getBoundingClientRect();
    return {
      url: window.location.href,
      variable: document.documentElement.style.getPropertyValue('--fluvy-zoom'),
      zoom: Number(getComputedStyle(view).zoom),
      header: { height: header.height, width: header.width },
      device: JSON.parse(localStorage.getItem('fluvy:device') ?? '{}').zoom ?? null,
      pageWidth: document.documentElement.scrollWidth,
    };
  });

/* ---------- the view alone, remembered by the device ---------- */
{
  const page = await open('home', 125, { extra: '&tabs=pills' });
  let s = await sized(page);
  check(
    'the view is zoomed to 1.25 and the header stays 56 tall at the window’s width',
    s.zoom === 1.25 && s.variable === '1.25' && s.header.height === 56 && s.header.width === 1280,
    JSON.stringify(s),
  );
  check(
    '?zoom=125 is remembered by the device and dropped from the address, the rest kept',
    s.device === 125 && s.url === `${BASE}?dashboard=home&tabs=pills`,
    s.url,
  );
  await page.goto(`${BASE}?dashboard=home`);
  await page.waitForSelector('html[data-ready="1"]');
  await settle(page, 300);
  s = await sized(page);
  check(
    'a page without the parameter keeps the remembered size',
    s.zoom === 1.25,
    JSON.stringify(s),
  );
  await page.goto(`${BASE}?dashboard=home&zoom=120`);
  await page.waitForSelector('html[data-ready="1"]');
  await settle(page, 300);
  s = await sized(page);
  check(
    'a size not on the list is ignored, and still dropped from the address',
    s.zoom === 1.25 && s.device === 125 && s.url === `${BASE}?dashboard=home`,
    JSON.stringify(s),
  );
  await page.goto(`${BASE}?dashboard=home&zoom=off`);
  await page.waitForSelector('html[data-ready="1"]');
  await settle(page, 300);
  s = await sized(page);
  check(
    '?zoom=off brings the device back to 100: no variable, no zoom',
    s.zoom === 1 && s.variable === '' && s.device === 100,
    JSON.stringify(s),
  );
  await page.close();
}
{
  const page = await open('home', 125, { extra: '&edit=1' });
  const s = await sized(page);
  check(
    'the edit mode is unzoomed, its header (the toolbar and the tab bar) at the window’s width; the device keeps its size',
    s.zoom === 1 && s.variable === '1.25' && s.header.width === 1280,
    JSON.stringify(s),
  );
  await page.close();
}
{
  const page = await open('home', 150, { viewport: PHONE });
  const s = await sized(page);
  check(
    'a phone at 150 %: the header 56 tall across the screen, the page never scrolls sideways',
    s.zoom === 1.5 && s.header.height === 56 && s.header.width === 390 && s.pageWidth <= 390,
    JSON.stringify(s),
  );
  await page.close();
}

/* ---------- the ruler: the knob under the finger, the value where it lets go ---------- */
{
  const page = await open('slider', 125);
  const card = frame(page, 'On').locator('fluvy-light-card');
  const ruler = card.locator('fluvy-ruler').first().locator('.fv-ruler');
  const knob = card.locator('fluvy-ruler').first().locator('.fv-knob');
  const geo = await rulerGeometry(ruler, knob);
  const pointer = mousePointer(page);
  // the light is at 70 %: grabbed there, the knob rides under the finger to 60
  await pointer.move(geo.at(70), geo.y);
  await pointer.down();
  await pointer.move(geo.at(80), geo.y, 6);
  await pointer.move(geo.at(60), geo.y, 12);
  await settle(page, 80);
  const under = (await geo.knobX()) - geo.at(60);
  await pointer.up();
  await settle(page, 120);
  let c = await calls(page);
  check(
    'ruler: the knob stays under the finger, and the value is where it let go (60 %)',
    Math.abs(under) <= 2 && c.length === 1 && c[0].d.brightness_pct === 60,
    `knob off by ${under.toFixed(1)} px · ${JSON.stringify(c.map((x) => x.d))}`,
  );
  await settle(page, 450);
  await reset(page);
  await dragTo(pointer, geo, { from: 60, via: 70, to: 97 });
  await settle(page, 120);
  c = await calls(page);
  check(
    'ruler: a drag to 97 % lands on exactly 97',
    c.length === 1 && c[0].d.brightness_pct === 97,
    JSON.stringify(c.map((x) => x.d)),
  );
  await settle(page, 450);
  await reset(page);
  await page.mouse.click(geo.at(30), geo.y);
  await settle(page, 120);
  c = await calls(page);
  check(
    'ruler: a tap on the scale goes to the value under it (30 %)',
    c.length === 1 && c[0].d.brightness_pct === 30,
    JSON.stringify(c.map((x) => x.d)),
  );
  await page.close();
}

/* ---------- the lock: the grip rides under the finger ---------- */
{
  const page = await open('devices-security', 125);
  const lock = frame(page, 'Lock').locator('fluvy-lock-card');
  const track = lock.locator('.dv-slide');
  const knob = track.locator('.dv-slide__knob');
  const tb = await track.boundingBox();
  const rest = await knob.boundingBox();
  const y = tb.y + tb.height / 2;
  const start = rest.x + rest.width / 2;
  const span = tb.width - 44 * 1.25; // the knob's box, in the view's pixels
  await page.mouse.move(start, y);
  await page.mouse.down();
  const offsets = [];
  for (const f of [0.3, 0.6]) {
    await page.mouse.move(start + span * f, y, { steps: 8 });
    await settle(page, 80);
    const kb = await knob.boundingBox();
    offsets.push(kb.x + kb.width / 2 - (start + span * f));
  }
  await page.mouse.up();
  await settle(page, 700);
  const back = await knob.boundingBox();
  check(
    'lock: the grip rides under the finger, and letting go at 60 % springs back without a call',
    offsets.every((o) => Math.abs(o) <= 2) &&
      (await calls(page)).length === 0 &&
      Math.abs(back.x - rest.x) < 2,
    `offsets ${offsets.map((o) => o.toFixed(1)).join(', ')} · back ${(back.x - rest.x).toFixed(1)}`,
  );
  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(start + span * 0.95, y, { steps: 14 });
  const ready = (await track.getAttribute('class')).includes('is-ready');
  await page.mouse.up();
  await settle(page, 200);
  const c = await calls(page);
  check(
    'lock: past 85 % the destination lights up and the release unlocks, once',
    ready && c.length === 1 && c[0].s === 'lock.unlock',
    JSON.stringify(c.map((x) => x.s)),
  );
  await page.close();
}

/* ---------- the dial: the knob follows the pointer round the ring ---------- */
{
  const page = await open('climate', 125);
  const card = frame(page, 'Heat').locator('fluvy-thermostat-card');
  const knob = card.locator('fluvy-dial [data-knob="0"]');
  const dial = card.locator('fluvy-dial .fv-dial');
  await dialTo(mousePointer(page), { knob, dial }, { up: 84 * 1.25 });
  await settle(page, 150);
  const db = await dial.boundingBox();
  const kb = await knob.boundingBox();
  const c = await calls(page);
  check(
    "dial: dragging the knob to 12 o'clock sets the mid value, the knob on the ring's top",
    c.length === 1 &&
      c[0].d.temperature === 22.5 &&
      Math.abs(kb.x + kb.width / 2 - (db.x + db.width / 2)) <= 2,
    `${JSON.stringify(c.map((x) => x.d))} · knob off centre by ${(kb.x + kb.width / 2 - (db.x + db.width / 2)).toFixed(1)}`,
  );
  await page.close();
}

/* ---------- a chart: the moment under the pointer, the same at every size ---------- */
{
  const readings = {};
  for (const zoom of [100, 125]) {
    const page = await open('energy', zoom);
    const card = frame(page, 'Energy').locator('fluvy-energy-card').first();
    const chart = card.locator('.ef-chart');
    const box = await chart.boundingBox();
    const x = box.x + box.width * 0.5;
    await page.mouse.move(x, box.y + box.height / 2);
    await settle(page, 150);
    const bubble = await card.locator('.fv-bubble').boundingBox();
    readings[zoom] = {
      label: (await card.locator('.ef-top .fv-readout__label').first().textContent()).trim(),
      off: bubble.x + bubble.width / 2 - x,
    };
    await page.close();
  }
  check(
    'chart: a pointer at the middle reads the same moment at 125 % as at 100 %, the bubble on it',
    /\d{1,2}:\d{2}/.test(readings[100].label) &&
      readings[125].label === readings[100].label &&
      Math.abs(readings[125].off) <= 2,
    JSON.stringify(readings),
  );
}

/* ---------- the history bars: the bar under the pointer, the same at every size ---------- */
{
  const readings = {};
  for (const zoom of [100, 150]) {
    const page = await open('history-bars', zoom);
    const card = frame(page, 'Solar production').locator('fluvy-history-bars-card').first();
    await card.scrollIntoViewIfNeeded();
    await settle(page, 300);
    // the fourth of seven bars, by its own box: the zoom scales the chart and the bars with it
    const bar = await card.locator('.hb-bar').nth(3).boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await settle(page, 150);
    readings[zoom] = {
      label: (await card.locator('.hb-readouts .fv-readout__label').first().textContent()).trim(),
      hovered: await card.evaluate((el) =>
        [...el.shadowRoot.querySelectorAll('.hb-bar')].findIndex((b) =>
          b.classList.contains('is-hover'),
        ),
      ),
    };
    await page.close();
  }
  check(
    'history bars: a pointer on the fourth bar reads 06 October at 150 % as at 100 %, that bar lit',
    readings[100].label === 'Oct 06' &&
      readings[150].label === 'Oct 06' &&
      readings[100].hovered === 3 &&
      readings[150].hovered === 3,
    JSON.stringify(readings),
  );
}

/** A click through the mouse: WebKit's hit test names the root for a point inside a zoomed view. */
async function tap(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/* ---------- a tab row: the tab chosen comes to the middle ---------- */
{
  const page = await open('home-extras', 125);
  const row = frame(page, 'Stress · overflow')
    .locator('fluvy-chips-card')
    .first()
    .locator('.fv-chips');
  await row.scrollIntoViewIfNeeded(); // the page down to the row (the mouse never scrolls on its own)
  // the wheel turns the row (a mouse's way to reach a tab out at the right) until Garage shows under the right
  // fade — a tab in full view is left where it is — and the row is then the person's: the tap centres it
  await row.dispatchEvent('wheel', { deltaY: 240, deltaMode: 0, bubbles: true, cancelable: true });
  await settle(page, 600);
  const turned = await row.evaluate((el) => el.scrollLeft);
  await tap(page, row.locator('.fv-chip').nth(6)); // Garage: with room on both sides once centred
  await settle(page, 700);
  const active = row.locator('.fv-chip.is-active');
  const rb = await row.boundingBox();
  const ab = await active.boundingBox();
  const off = ab.x + ab.width / 2 - (rb.x + rb.width / 2);
  check(
    'chips: the wheel turns the row, and the tab chosen scrolls to the middle of it',
    turned > 200 && (await active.textContent()).trim() === 'Garage' && Math.abs(off) <= 2,
    `turned ${turned.toFixed(0)} · off centre by ${off.toFixed(1)}`,
  );
  await page.close();
}

/* ---------- the keypad: whole on a phone at 150 % ---------- */
{
  const page = await open('devices-security', 150, { viewport: PHONE });
  const alarm = frame(page, 'Alarm').locator('fluvy-alarm-card');
  await alarm.scrollIntoViewIfNeeded();
  // Disarm asks for the code: the first mode, a tile or — on a phone at 150 %, where a word would not hold its
  // tile — a chip (1.7)
  await tap(page, alarm.locator('.fv-option, .fv-chip').nth(0));
  await settle(page, 500);
  const dialog = alarm.locator('fluvy-keypad dialog');
  const sheet = dialog.locator('.fv-sheet');
  const d = await dialog.boundingBox();
  const s = await sheet.boundingBox();
  const keys = await dialog.locator('.dv-key').count();
  const inside = (b) =>
    b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= 390.5 && b.y + b.height <= 700.5;
  check(
    'keypad: the dialog covers the screen and its sheet, with every key, sits inside it',
    d && s && inside(d) && inside(s) && d.width >= 389 && keys === 11,
    `dialog ${JSON.stringify(d)} · sheet ${JSON.stringify(s)} · ${keys} keys`,
  );
  await page.keyboard.press('Escape');
  await page.close();
}

/* ---------- the schedule sheet: whole on a phone at 150 %, scrolling inside ---------- */
{
  const page = await open('automations', 150, { viewport: PHONE });
  const card = frame(page, 'Rows').locator('fluvy-automations-card');
  await card.scrollIntoViewIfNeeded();
  await tap(page, card.locator('.fv-card__head .fv-round'));
  await settle(page, 700);
  const dialog = card.locator('fluvy-schedule-sheet dialog');
  const sheet = dialog.locator('.fv-sheet');
  const d = await dialog.boundingBox();
  const s = await sheet.boundingBox();
  const within = (b) =>
    b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= 390.5 && b.y + b.height <= 700.5;
  const scrolls = await sheet.evaluate((el) => el.scrollHeight > el.clientHeight);
  check(
    'schedule sheet: the dialog covers the phone and the sheet sits inside it, scrolling within',
    d && s && within(d) && within(s) && d.width >= 389 && scrolls,
    `dialog ${JSON.stringify(d)} · sheet ${JSON.stringify(s)} · scrolls ${scrolls}`,
  );
  await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await settle(page, 200);
  const save = await dialog.locator('.ss-footer .fv-btn--accent').boundingBox();
  check(
    'schedule sheet: scrolled to its end, Save is on the phone’s screen',
    save && within(save),
    JSON.stringify(save),
  );
  await page.keyboard.press('Escape');
  await page.close();
}

/* ---------- nothing new is cut: the same frames at 100, 125 and 150 % ---------- */
{
  /**
   * Every one-line box of a frame (nowrap, hidden overflow), named by its frame, its box and its words, with how
   * far its text spills past its edge in the box's own pixels (negative: the room it has to spare).
   */
  const lines = (page) =>
    page.evaluate(() => {
      const found = new Map();
      const walk = (node, title) => {
        for (const el of node.querySelectorAll('*')) {
          if (el.shadowRoot) walk(el.shadowRoot, title);
          if (!(el instanceof window.HTMLElement) || el.clientWidth === 0) continue;
          const style = getComputedStyle(el);
          if (
            style.whiteSpace !== 'nowrap' ||
            (style.overflowX !== 'hidden' && style.overflowX !== 'clip')
          )
            continue;
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
          const key = `${title} | ${el.localName}.${[...el.classList].join('.')} | ${text}`;
          found.set(key, Math.max(found.get(key) ?? -Infinity, el.scrollWidth - el.clientWidth));
        }
      };
      for (const frame of document.querySelectorAll('[data-frame], [data-stress]'))
        walk(frame, frame.dataset.frame ?? frame.dataset.stress);
      return [...found];
    });
  /**
   * A line is cut when its text spills past its edge by more than a pixel. Text does not scale exactly linearly
   * (an engine's hinted advances round at each size), so a line that sits within one grid step (4 px) of its edge
   * at 100 % may cross it by up to a step at another size: that is the engine's rounding, not a fit of ours
   * computed in the wrong pixels, which spills by the zoom's whole share.
   */
  const STEP = 4;
  const fresh = (at, zoom) =>
    at[zoom]
      .filter(([key, spill]) => {
        const before = at[100].get(key);
        if (before === undefined || before > 1) return false; // not there, or cut already
        return spill > 1 && !(before >= -STEP && spill <= STEP);
      })
      .map(([key, spill]) => `${key} (+${spill} px)`);
  for (const sheet of [
    'home',
    'slider',
    'devices-security',
    'climate',
    'energy',
    'media',
    'home-extras',
    'ambient',
  ]) {
    const at = {};
    for (const zoom of [100, 125, 150]) {
      const page = await open(sheet, zoom);
      at[zoom] = zoom === 100 ? new Map(await lines(page)) : await lines(page);
      await page.close();
    }
    const already = [...at[100].values()].filter((spill) => spill > 1).length;
    check(
      `${sheet}: no new ellipsis or clipped line at 125 % (${already} already at 100 %)`,
      fresh(at, 125).length === 0,
      fresh(at, 125).join(' ‖ '),
    );
    check(
      `${sheet}: none at 150 % either`,
      fresh(at, 150).length === 0,
      fresh(at, 150).join(' ‖ '),
    );
  }
}

/* ---------- the greeting on a phone at 150 % ---------- */
// a phone's column at the largest size holds no "Good afternoon": the greeting takes the language's short hello before
// a word of it would be cut
{
  const cut = [];
  for (const lang of ['en', 'de', 'es', 'nl', 'it']) {
    const page = await open('home-extras', 150, {
      viewport: { width: 360, height: 700 },
      extra: `&lang=${lang}`,
    });
    const titles = await page.locator('fluvy-hello-card').evaluateAll((els) =>
      els.map((el) => {
        const t = el.shadowRoot.querySelector('.hm-hello__title');
        return { text: t?.innerText.trim() ?? '', spill: t ? t.scrollWidth - t.clientWidth : 0 };
      }),
    );
    for (const t of titles) if (t.spill > 1) cut.push(`${lang}: "${t.text}" +${t.spill}`);
    if (!titles.length) cut.push(`${lang}: no greeting`);
    await page.close();
  }
  check(
    'the greeting on a 360 phone at 150 %: whole in every language (its short hello where it must)',
    cut.length === 0,
    cut.join(' · '),
  );
}

console.log(`\n(${ENGINE})`);
await suite.finish();
