#!/usr/bin/env node
/**
 * Interaction tests on the playground (real cards, simulated hass). Exit code 1 on any failure.
 *   node interactions.mjs            (expects the playground dev server on :5183)
 * What it proves: a drag lands on an exact value (97 %), sliding away slows the drag, holding raises
 * the fine scale, the keyboard works, a switch flips before Home Assistant answers, and five taps on
 * a stepper become one service call.
 */
import {
  dialTo,
  dragTo,
  driftDrag,
  holdForFine,
  mousePointer,
  relativeDrag,
  rulerGeometry,
} from './lib/gestures.mjs';
import { BASE, calls, frame, reset, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { browser, check } = suite;

async function open(sheet, width = 360) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`${BASE}?sheet=${sheet}&width=${width}`);
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForTimeout(900);
  return page;
}

/* ---------- the precision ruler ---------- */
{
  const page = await open('slider');
  const card = page.locator('fluvy-light-card').first();
  const ruler = card.locator('fluvy-ruler').first().locator('.fv-ruler');
  const knob = card.locator('fluvy-ruler').first().locator('.fv-knob');
  const readout = card.locator('.fv-readout--l .fv-readout__value span').first();
  const geo = await rulerGeometry(ruler, knob);
  const { box, y, knobX } = geo;
  const pointer = mousePointer(page);
  const settle = () => page.waitForTimeout(450);

  await dragTo(pointer, geo, { from: 70, via: 80, to: 97 });
  await page.waitForTimeout(80);
  let c = await calls(page);
  check(
    'drag lands on exactly 97 %',
    c.length === 1 && c[0].s === 'light.turn_on' && c[0].d.brightness_pct === 97,
    JSON.stringify(c.map((x) => x.d)),
  );
  await settle();
  await reset(page);

  // grabbing away from the knob never jumps: the drag is relative
  await relativeDrag(pointer, geo, { grab: 20, to: 10 });
  await page.waitForTimeout(80);
  c = await calls(page);
  check(
    'drag is relative (grab at 20 %, move −10 % → 87 %)',
    c.length === 1 && c[0].d.brightness_pct === 87,
    JSON.stringify(c.map((x) => x.d)),
  );
  await settle();
  await reset(page);

  // THE PHONE BUG: a thumb drifts vertically while sliding. Drifting must not move the value at all,
  // and coming back to the axis must not make it leap.
  const value = async () => (await readout.textContent()).trim();
  let beforeDrift = '';
  let duringDrift = '';
  let far = 0;
  await driftDrag(pointer, geo, {
    phase: async (name) => {
      if (name === 'onAxis') beforeDrift = await value();
      if (name === 'drifted') duringDrift = await value();
      if (name === 'returned') {
        const afterDrift = await value();
        check(
          'vertical drift does not change the value',
          beforeDrift === '50' && duringDrift === '50' && afterDrift === '50',
          `${beforeDrift} → ${duringDrift} → ${afterDrift}`,
        );
      }
      // sliding away makes it finer: 20 % of travel far from the axis moves only a little
      if (name === 'far') {
        far = Number(await value());
        check(
          'sliding away makes the drag finer',
          far > 50 && far <= 56,
          `50 → ${far} for 20 % of travel`,
        );
      }
      // …and the finger coming back to the axis keeps that value (no re-scaling of the whole gesture)
      if (name === 'back')
        check(
          'returning to the axis does not leap',
          Number(await value()) === far,
          `${far} → ${await value()}`,
        );
      // a pause in the middle of a drag must NOT raise the fine scale
      if (name === 'paused') {
        const midLabels = await card
          .locator('.fv-ruler-labels')
          .first()
          .locator('span')
          .allTextContents();
        check(
          'pausing mid-drag keeps the full scale',
          midLabels.join(' ') === '0 25 50 75 100',
          midLabels.join(' '),
        );
      }
    },
  });
  await page.waitForTimeout(60);
  await reset(page);

  // a second drag that starts before Home Assistant has answered continues from what is on screen
  const shownBefore = Number((await readout.textContent()).trim());
  const x0 = await knobX();
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x0 + box.width * 0.1, y, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(x0 + box.width * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(x0 + box.width * 0.2, y, { steps: 8 });
  await page.mouse.up(); // immediately: the mock answers after 140 ms
  await page.waitForTimeout(60);
  c = await calls(page);
  check(
    'back-to-back drags add up (no snap back to a stale state)',
    c.length === 2 && c[1].d.brightness_pct === shownBefore + 20,
    `${shownBefore} → ${JSON.stringify(c.map((x) => x.d.brightness_pct))}`,
  );
  await settle();
  await reset(page);

  // press-and-hold BEFORE moving raises the fine scale, anchored: the knob does not move a pixel
  let vHold = 0;
  await holdForFine(pointer, geo, {
    phase: async (name, xHold) => {
      if (name === 'held') {
        const xFine = await knobX();
        const fineLabels = await card
          .locator('.fv-ruler-labels')
          .first()
          .locator('span')
          .allTextContents();
        check(
          'holding raises the fine scale without moving the knob',
          Math.abs(xFine - xHold) < 0.6 &&
            fineLabels.length >= 3 &&
            fineLabels.every((t) => /^\d+$/.test(t)),
          `Δ ${(xFine - xHold).toFixed(2)} px · ${fineLabels.join(' ')}`,
        );
        vHold = Number(await value());
      }
      if (name === 'moved')
        check(
          'fine scale: 10 % of travel = 1 %',
          Number(await value()) === vHold + 1,
          `${vHold} → ${await value()}`,
        );
      if (name === 'released') {
        const xBack = await knobX();
        check(
          '…and the knob glides back to the value on the full scale',
          Math.abs(xBack - (box.x + (box.width * (vHold + 1)) / 100)) < 2.5,
          `${xBack.toFixed(1)} vs ${(box.x + (box.width * (vHold + 1)) / 100).toFixed(1)}`,
        );
      }
    },
  });
  await reset(page);

  await ruler.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(80);
  c = await calls(page);
  check(
    'keyboard steps by one',
    c.length === 1 && c[0].s === 'light.turn_on' && c[0].d.brightness_pct === vHold,
    JSON.stringify(c.map((x) => x.d)),
  );
  await settle();
  await reset(page);

  // stepper: holding repeats, releasing STOPS (no runaway), a burst is one call counted from the screen
  const plus = card.locator('.fv-stepper__half').nth(1);
  const pb = await plus.boundingBox();
  const v0 = Number((await readout.textContent()).trim());
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  const v1 = Number((await readout.textContent()).trim());
  await page.waitForTimeout(700);
  const v2 = Number((await readout.textContent()).trim());
  c = await calls(page);
  check(
    'holding the stepper repeats and releasing stops it',
    v1 - v0 >= 4 && v2 === v1,
    `${v0} → ${v1} → ${v2}`,
  );
  check(
    '…and the burst is one service call with the final value',
    c.length === 1 && c[0].d.brightness_pct === v1,
    JSON.stringify(c.map((x) => x.d)),
  );
  await settle();
  await reset(page);

  // at the ends the knob stays flush with the column (4 px optical overhang at rest), never half outside
  await page.mouse.move(await knobX(), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 80, y, { steps: 20 });
  await page.mouse.up();
  await settle();
  const kb = await knob.boundingBox();
  check(
    'knob rests flush with the column at the end of the scale',
    kb.x + kb.width <= box.x + box.width + 4.5 && kb.x + kb.width >= box.x + box.width + 3,
    `right overhang ${(kb.x + kb.width - box.x - box.width).toFixed(1)} px`,
  );
  const tileRuler = page.locator('fluvy-light-card').nth(1); // the light that is off
  check(
    'a light that is off draws no knob at zero',
    (await tileRuler.locator('fluvy-ruler').first().locator('.fv-knob').count()) === 0,
  );
  await page.close();
}

/* ---------- two lamps on a phone's line: the switch is never what the column costs ---------- */
for (const width of [360, 412]) {
  const page = await open('slider', width);
  const lamp = frame(page, 'Two on a phone').locator('fluvy-light-card').first();
  const box = await lamp.boundingBox();
  const toggle = lamp.locator('[role="switch"]');
  check(
    `half a column at ${width}: the lamp keeps its switch beside its name`,
    (await toggle.count()) === 1 && (await lamp.locator('.fv-card__title').count()) === 1,
    `card ${Math.round(box?.width ?? 0)} wide`,
  );
  check(
    `…and its name is whole (the icon circle gave it the room)`,
    await lamp
      .locator('.fv-card__title')
      .evaluate((title) => title.scrollWidth <= title.clientWidth),
  );
  await lamp.locator('.fv-hit').click();
  await page.waitForTimeout(80);
  const c = await calls(page);
  check(
    `…a tap on it turns the lamp off`,
    c.length === 1 && c[0].s === 'light.turn_off',
    JSON.stringify(c.map((x) => x.s)),
  );
  await page.close();
}

/* ---------- colour temperature: tinted ticks, a tinted dot, off on request ---------- */
{
  const page = await open('slider');
  const card = page.locator('fluvy-light-card').first();
  const temp = card.locator('fluvy-ruler').nth(1);
  check(
    'the colour-temperature ruler tints its ticks warm → cool',
    (await temp.locator('.tk-tint').count()) >= 8 &&
      (await temp.locator('linearGradient stop').count()) === 2,
  );
  check(
    '…and its knob dot takes the colour under it',
    ((await temp.locator('.fv-knob').getAttribute('style')) ?? '').includes('--knob-dot'),
  );
  check(
    'the brightness ruler stays neutral',
    (await card.locator('fluvy-ruler').first().locator('.tk-tint').count()) === 0,
  );
  await page.close();
}

/* ---------- optimistic switch ---------- */
{
  const page = await open('home');
  const tile = page.locator('fluvy-tile-card').nth(1); // Reading, off
  await tile.locator('.fv-hit').click();
  const immediately = await tile.locator('.fv-switch').getAttribute('aria-checked');
  check('a switch flips before Home Assistant answers', immediately === 'true');
  await page.waitForTimeout(400);
  const c = await calls(page);
  check(
    '…and one service call goes out',
    c.length === 1 && c[0].s === 'light.turn_on',
    JSON.stringify(c.map((x) => x.s)),
  );
  check(
    'tile takes the active tone after confirmation',
    (await tile.locator('article').getAttribute('class')).includes('is-on'),
  );
  await page.close();
}

/* ---------- compact and mini tiles: tap toggles, hold opens, keyboard taps ---------- */
{
  const page = await open('home');
  await page.evaluate(() => {
    window.__moreInfo = [];
    document.addEventListener(
      'hass-more-info',
      (e) => window.__moreInfo.push(e.detail?.entityId),
      true,
    );
  });
  const opened = () => page.evaluate(() => window.__moreInfo.splice(0));
  // the frames are found by their titles: the home sheet gains frames, and a position would move
  const compact = frame(page, 'Compact tiles');
  const group = compact.locator('fluvy-tiles-card').first();
  const hall = group.locator('article').nth(1); // Hall, off
  await hall.click();
  check(
    'a compact tile takes the fill under the finger',
    (await hall.getAttribute('class')).includes('is-on'),
  );
  await page.waitForTimeout(400);
  let c = await calls(page);
  check(
    '…and toggles with one domain call',
    c.length === 1 && c[0].s === 'switch.turn_on' && c[0].t?.entity_id === 'switch.hall',
    JSON.stringify(c),
  );
  check('a tap does not open the details', (await opened()).length === 0);
  await reset(page);

  const kitchen = group.locator('article').nth(0); // Kitchen, on
  const box = await kitchen.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const held = await opened();
  c = await calls(page);
  check(
    'holding a compact tile opens its details and does not toggle',
    held.length === 1 && held[0] === 'switch.kitchen' && c.length === 0,
    `${JSON.stringify(held)} calls=${c.length}`,
  );

  // a press that travels is a scroll, never a hold
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 80, { steps: 5 });
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(120);
  check('a press that moves 50 px is not a hold', (await opened()).length === 0);
  await reset(page);

  const sensors = compact.locator('fluvy-tiles-card').nth(2);
  await sensors.locator('article').first().click();
  await page.waitForTimeout(100);
  const sensorOpened = await opened();
  check(
    'a sensor tile opens its details on tap',
    sensorOpened.length === 1 &&
      sensorOpened[0] === 'sensor.living_temperature' &&
      (await calls(page)).length === 0,
    JSON.stringify(sensorOpened),
  );

  const mini = frame(page, 'Mini tiles')
    .locator('fluvy-tiles-card')
    .nth(1)
    .locator('article')
    .nth(0); // Office mini, off
  await mini.locator('.fv-tile__tap').focus(); // the tile's button, laid over it
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  c = await calls(page);
  check(
    'Enter on a mini tile toggles it once',
    c.length === 1 && c[0].s === 'switch.turn_on' && c[0].t?.entity_id === 'switch.office',
    JSON.stringify(c),
  );
  await reset(page);
  await page.close();
}

/* ---------- dial: stepper coalescing + knob drag ---------- */
{
  const page = await open('climate');
  const card = page.locator('fluvy-thermostat-card').first();
  const plus = card.locator('fluvy-dial .fv-stepper__half').nth(1);
  for (let i = 0; i < 3; i++) {
    await plus.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
    await plus.dispatchEvent('pointerup');
    await page.waitForTimeout(60);
  }
  const shown = await card.locator('.fv-dial__value span').first().textContent();
  check('dial shows the stepped value at once', shown.trim() === '23.0', shown);
  await page.waitForTimeout(900);
  let c = await calls(page);
  check(
    'three taps, one service call',
    c.length === 1 && c[0].s === 'climate.set_temperature' && c[0].d.temperature === 23,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);

  // straight up = the middle of the sweep = 22.5
  await dialTo(mousePointer(page), {
    knob: card.locator('fluvy-dial [data-knob="0"]'),
    dial: card.locator('fluvy-dial .fv-dial'),
  });
  await page.waitForTimeout(120);
  c = await calls(page);
  check(
    "dragging the knob to 12 o'clock sets the mid value",
    c.length === 1 && c[0].d.temperature === 22.5,
    JSON.stringify(c.map((x) => x.d)),
  );
  await page.close();
}

/* ---------- thermostat variants: compact stepper, ruler commit, mode subset, row-filling chips ---------- */
{
  const page = await open('climate');
  const compact = page.locator('fluvy-thermostat-card').nth(7); // Compact · off, heat, cool · fan full width
  check(
    'compact thermostat shows only the modes asked for',
    (await compact.locator('.fv-option').count()) === 2 &&
      (await compact.locator('.fv-option__label').allTextContents()).join(',') === 'Heat,Cool',
  );
  check(
    '…and its fan speeds fill the row',
    (await compact.locator('.fv-chips--fill').count()) === 2 &&
      (await compact.locator('.fv-chips--fill .fv-chip[data-fit]').count()) === 0,
  );
  const plus = compact.locator('.cl-value .fv-stepper__half').nth(1);
  for (let i = 0; i < 3; i++) {
    await plus.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
    await plus.dispatchEvent('pointerup');
    await page.waitForTimeout(60);
  }
  const shown = (
    await compact.locator('.cl-value .fv-readout__value span').first().textContent()
  ).trim();
  check('compact thermostat shows the stepped target at once', shown === '23.0', shown);
  await page.waitForTimeout(900);
  let c = await calls(page);
  check(
    '…three taps, one service call',
    c.length === 1 && c[0].s === 'climate.set_temperature' && c[0].d.temperature === 23,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);

  const ruler = page.locator('fluvy-thermostat-card').nth(8); // Ruler · modes as chips (cooling, 24 °C)
  check(
    'ruler thermostat draws modes as chips',
    (await ruler.locator('.fv-chips .fv-chip').count()) === 3 &&
      (await ruler.locator('.fv-option').count()) === 0,
  );
  await ruler.scrollIntoViewIfNeeded(); // raw mouse coordinates never scroll: the card must be on screen first
  const band = ruler.locator('fluvy-ruler .fv-ruler').first();
  const box = await band.boundingBox();
  const knob = await ruler.locator('fluvy-ruler .fv-knob').first().boundingBox();
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  await page.mouse.move(knob.x + knob.width / 2 + 40, knob.y + knob.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  c = await calls(page);
  check(
    'dragging the ruler sets the target once',
    c.length === 1 &&
      c[0].s === 'climate.set_temperature' &&
      c[0].d.temperature > 24 &&
      c[0].d.temperature <= 30,
    JSON.stringify(c.map((x) => x.d)),
  );
  void box;
  await page.close();
}

await suite.finish();
