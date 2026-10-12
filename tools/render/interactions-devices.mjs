#!/usr/bin/env node
/**
 * Interaction tests for the cards that wire the controls: tile, light, thermostat, entities, cover, fan and vacuum —
 * every switch / action / chip sends its one service (optimistically where it can), the cover holds its target while
 * travelling, fan steps land on the fan's own speeds.
 * Real cards on the playground's simulated hass. Exit code 1 on any failure.
 *   node interactions-devices.mjs            (expects the playground dev server on :5183)
 */
import { calls, frame, moreInfo, reset, settle, startSuite, taps } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;
const open = (sheet, options) => suite.sheet(sheet, options);

/* ---------- tile: the foot ruler and the tap surface ---------- */
{
  const page = await open('home');
  const tiles = page.locator('fluvy-tile-card');
  const ceiling = tiles.nth(0);
  const ruler = ceiling.locator('fluvy-ruler .fv-ruler');
  const b = await ruler.boundingBox();
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2); // a tap on the scale goes there
  await settle(page, 200);
  let c = await calls(page);
  check(
    'tile: tapping the foot ruler sets the brightness once and does not open more-info',
    c.length === 1 &&
      c[0].s === 'light.turn_on' &&
      typeof c[0].d.brightness_pct === 'number' &&
      (await moreInfo(page)).length === 0,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  const blinds = tiles.nth(3);
  const rb = await blinds.locator('fluvy-ruler .fv-ruler').boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.75, rb.y + rb.height / 2);
  await settle(page, 200);
  c = await calls(page);
  check(
    'tile: a cover tile sends set_cover_position',
    c.length === 1 &&
      c[0].s === 'cover.set_cover_position' &&
      c[0].d.position >= 70 &&
      c[0].d.position <= 80,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  await ceiling.locator('.fv-tile__name').click();
  check(
    'tile: tapping the body opens more-info for the entity',
    (await moreInfo(page)).join() === 'light.ceiling' && (await calls(page)).length === 0,
  );
  await reset(page);
  await ceiling.locator('.fv-tile').focus();
  await page.keyboard.press('Enter');
  check(
    'tile: the tile is a keyboard entry to more-info',
    (await moreInfo(page)).join() === 'light.ceiling',
  );
  await reset(page);
  await page.close();
}

/* ---------- light: colour temperature, live update, off ---------- */
{
  const page = await open('slider');
  const on = frame(page, 'On').locator('fluvy-light-card');
  const temp = on.locator('fluvy-ruler').nth(1).locator('.fv-ruler');
  const tb = await temp.boundingBox();
  await page.mouse.click(tb.x + tb.width * 0.5, tb.y + tb.height / 2);
  await settle(page, 200);
  let c = await calls(page);
  check(
    'light: the colour-temperature ruler sends turn_on with color_temp_kelvin',
    c.length === 1 &&
      c[0].s === 'light.turn_on' &&
      c[0].d.color_temp_kelvin > 4000 &&
      c[0].d.color_temp_kelvin < 4700,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  const sw = on.locator('.fv-card__head .fv-switch');
  await on.locator('.fv-card__head .fv-hit').click();
  check(
    'light: the head switch flips at once',
    (await sw.getAttribute('aria-checked')) === 'false',
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends turn_off once',
    c.length === 1 && c[0].s === 'light.turn_off',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);

  // live update: while dragging the lamp follows (throttled), and the release does not repeat the last value
  const live = frame(page, 'Live update').locator('fluvy-light-card');
  const lr = live.locator('fluvy-ruler').first().locator('.fv-ruler');
  const lb = await lr.boundingBox();
  const ly = lb.y + lb.height / 2;
  await page.mouse.move(lb.x + lb.width * 0.7, ly);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width * 0.8, ly, { steps: 8 });
  await page.waitForTimeout(220);
  await page.mouse.move(lb.x + lb.width * 0.9, ly, { steps: 8 });
  await page.waitForTimeout(220);
  await page.mouse.up();
  await settle(page, 200);
  c = await calls(page);
  const values = c.map((x) => x.d.brightness_pct);
  check(
    'light: live_update sends while dragging, throttled',
    c.length >= 2 && c.length <= 5 && c.every((x) => x.s === 'light.turn_on'),
    JSON.stringify(values),
  );
  check(
    '…and the release never repeats the value already sent',
    new Set(values).size === values.length,
    JSON.stringify(values),
  );
  await reset(page);
  await page.close();
}

/* ---------- a house in Fahrenheit: the thermostat steps a whole degree, every figure says °F ---------- */
{
  const page = await open('imperial');
  const card = frame(page, 'Fahrenheit · a thermostat stepping whole degrees').locator(
    'fluvy-thermostat-card',
  );
  const unit = await card.evaluate((el) =>
    (el.shadowRoot.querySelector('fluvy-dial')?.shadowRoot?.textContent ?? '').replace(/\s+/g, ' '),
  );
  await reset(page);
  await card.locator('.fv-stepper__half').nth(1).click();
  await settle(page, 900);
  const c = await calls(page);
  check(
    'Fahrenheit: the thermostat says °F and, with no step of its own, steps a whole degree (70 → 71)',
    /°F/.test(unit) &&
      c.length === 1 &&
      c[0].s === 'climate.set_temperature' &&
      c[0].d.temperature === 71,
    JSON.stringify({ unit, c }),
  );
  const printer = await frame(page, 'Fahrenheit · a printer')
    .locator('fluvy-printer-card')
    .evaluate((el) =>
      [...el.shadowRoot.querySelectorAll('.pr-stat .fv-readout')].map((r) =>
        r.textContent.replace(/\s+/g, ' ').trim(),
      ),
    );
  check(
    'Fahrenheit: a printer’s heaters and chamber in °F — 9° off its target says both, at its target alone',
    printer.join('|') === 'Nozzle 437 / 446°F|Bed 140°F|Chamber 104°F',
    JSON.stringify(printer),
  );
  await page.close();
}

/* ---------- thermostat: modes and chips ---------- */
{
  const page = await open('climate');
  const card = frame(page, 'Heat').locator('fluvy-thermostat-card');
  await card.locator('.fv-option').nth(1).click(); // Cool
  const pressed = await card.locator('.fv-option').nth(1).getAttribute('aria-pressed');
  check(
    'thermostat: the chosen mode tile lights before Home Assistant answers',
    pressed === 'true',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and one set_hvac_mode goes out',
    c.length === 1 && c[0].s === 'climate.set_hvac_mode' && c[0].d.hvac_mode === 'cool',
    JSON.stringify(c),
  );
  await reset(page);
  await card.locator('.fv-chips').first().locator('.fv-chip').nth(0).click(); // Eco
  await card.locator('.fv-chips').nth(1).locator('.fv-chip').nth(3).click(); // High
  await settle(page, 300);
  c = await calls(page);
  check(
    'thermostat: preset and fan chips send their services',
    c.length === 2 &&
      c[0].s === 'climate.set_preset_mode' &&
      c[0].d.preset_mode === 'eco' &&
      c[1].s === 'climate.set_fan_mode' &&
      c[1].d.fan_mode === 'high',
    JSON.stringify(c),
  );
  await reset(page);
  const hum = frame(page, 'Humidifier').locator('fluvy-thermostat-card');
  await hum.locator('.fv-option').nth(0).click(); // Off
  await settle(page, 300);
  c = await calls(page);
  check(
    'thermostat: the humidifier off tile turns it off',
    c.length === 1 && c[0].s === 'humidifier.turn_off',
    JSON.stringify(c),
  );
  await reset(page);

  // off: the default keeps presets and fan speeds; `when_off: essentials` keeps the modes alone, and a mode tapped
  // brings the chips back before Home Assistant answers
  check(
    'thermostat: off with the default when_off keeps its preset and fan chips',
    (await frame(page, 'Off · presets and fan')
      .locator('fluvy-thermostat-card')
      .locator('.fv-chips')
      .count()) === 2,
  );
  const standby = frame(page, 'Off · essentials').locator('fluvy-thermostat-card');
  check(
    'thermostat: off with when_off: essentials shows its three modes and no chips',
    (await standby.locator('.fv-chips').count()) === 0 &&
      (await standby.locator('.fv-option').count()) === 3,
  );
  await standby.locator('.fv-option').nth(1).click(); // Heat
  check(
    '…tapping Heat shows the preset and fan chips at once',
    (await standby.locator('.fv-chips').count()) === 2,
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and one set_hvac_mode goes out',
    c.length === 1 && c[0].s === 'climate.set_hvac_mode' && c[0].d.hvac_mode === 'heat',
    JSON.stringify(c),
  );
  await page.close();
}

/* ---------- entities: one trailing element per row ---------- */
{
  const page = await open('lists');
  const card = page.locator('fluvy-entities-card');
  const rows = card.locator('.fv-row');
  await rows.nth(1).locator('.fv-hit').click(); // washing machine, off
  check(
    'entities: a row switch flips at once',
    (await rows.nth(1).locator('.fv-switch').getAttribute('aria-checked')) === 'true',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and sends one turn_on for that entity',
    c.length === 1 && c[0].s === 'switch.turn_on' && c[0].t.entity_id === 'switch.washer',
    JSON.stringify(c),
  );
  await reset(page);
  check(
    'entities: a lock row shows its state, never a switch',
    (await rows.nth(5).locator('.fv-switch').count()) === 0 &&
      (await rows.nth(5).locator('.fv-row__value').textContent()).trim() === 'Locked',
  );
  await rows.nth(4).click();
  check(
    'entities: tapping a row opens more-info',
    (await moreInfo(page)).join() === 'sensor.hall_temperature' && (await calls(page)).length === 0,
  );
  await rows.nth(5).focus();
  await page.keyboard.press('Enter');
  check('…also from the keyboard', (await moreInfo(page)).slice(-1).join() === 'lock.front_door');
  await page.close();
}
/* ---------- cover: the row, the ruler, the tilt stepper, favourites ---------- */
{
  const page = await open('devices-motion');
  const blinds = frame(page, 'Blinds').locator('fluvy-cover-card');
  const actions = blinds.locator('.fv-action');
  await actions.nth(0).click(); // open
  check(
    'cover: Open is answered at once: the badge says Opening, the Open cell goes inert',
    (await blinds.locator('.fv-badge').textContent()).trim() === 'Opening' &&
      (await actions.nth(0).isDisabled()),
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and one open_cover goes out',
    c.length === 1 && c[0].s === 'cover.open_cover',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await actions.nth(1).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'cover: Stop sends stop_cover',
    c.length === 1 && c[0].s === 'cover.stop_cover',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await actions.nth(2).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'cover: Close sends close_cover',
    c.length === 1 && c[0].s === 'cover.close_cover',
    JSON.stringify(c.map((x) => x.s)),
  );
  await settle(page, 300);
  await reset(page);

  const ruler = blinds.locator('fluvy-ruler .fv-ruler');
  await ruler.evaluate((el) => el.scrollIntoView({ block: 'center' })); // raw mouse coordinates only work on screen
  const rb = await ruler.boundingBox();
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height * 0.25); // 75 % up the scale
  await settle(page, 60);
  const shown = (
    await blinds.locator('.dv-cover__side .fv-readout__value span').first().textContent()
  ).trim();
  await settle(page, 200);
  c = await calls(page);
  check(
    'cover: a tap on the vertical ruler sends set_cover_position and the readout shows it at once',
    c.length === 1 &&
      c[0].s === 'cover.set_cover_position' &&
      Math.abs(c[0].d.position - 75) <= 2 &&
      Number(shown) === c[0].d.position,
    `${shown} · ${JSON.stringify(c.map((x) => x.d))}`,
  );
  await reset(page);

  const tilt = blinds.locator('.dv-cover__tilt .fv-stepper__half');
  await taps(tilt.nth(1), 3);
  const tiltShown = (
    await blinds.locator('.dv-cover__tilt .fv-readout__value span').first().textContent()
  ).trim();
  await settle(page, 900);
  c = await calls(page);
  check(
    'cover: three quick tilt taps show 30° at once and become one set_cover_tilt_position',
    tiltShown === '30' &&
      c.length === 1 &&
      c[0].s === 'cover.set_cover_tilt_position' &&
      c[0].d.tilt_position === 33,
    `${tiltShown}° · ${JSON.stringify(c.map((x) => x.d))}`,
  );
  await reset(page);
  await settle(page, 300);

  await blinds.locator('.fv-chip').nth(0).click();
  await settle(page, 300); // Morning · 60 %
  c = await calls(page);
  check(
    'cover: a favourite sends the position it stores',
    c.length === 1 && c[0].s === 'cover.set_cover_position' && c[0].d.position === 60,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  await blinds.locator('.fv-chip').nth(1).click();
  await settle(page, 300); // Night · closed (position 0, tilt 0)
  c = await calls(page);
  check(
    'cover: a favourite with position and tilt sends both',
    c.map((x) => x.s).join() === 'cover.set_cover_position,cover.set_cover_tilt_position' &&
      c[0].d.position === 0 &&
      c[1].d.tilt_position === 0,
    JSON.stringify(c),
  );
  await reset(page);

  const valve = frame(page, 'Valve').locator('fluvy-cover-card');
  await valve.locator('.fv-action').nth(2).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'cover: a valve closes with close_valve',
    c.length === 1 && c[0].s === 'valve.close_valve',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  const gone = frame(page, 'Cover · unavailable').locator('fluvy-cover-card');
  await gone.locator('.fv-chip').first().click({ force: true });
  await settle(page, 200);
  check('cover: an unavailable cover ignores its favourites', (await calls(page)).length === 0);

  // the tilt stepper walks in 5° steps when held (through the current handler, then stops on release)
  const shade = frame(page, 'Cover · fully open, tilt in %').locator('fluvy-cover-card');
  const half = shade.locator('.dv-cover__tilt .fv-stepper__half').nth(1);
  await half.evaluate((el) => el.scrollIntoView({ block: 'center' })); // raw mouse coordinates only work on screen
  const hb = await half.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  const held = Number(
    (await shade.locator('.dv-cover__tilt .fv-readout__value span').first().textContent()).trim(),
  );
  await page.waitForTimeout(400);
  const after = Number(
    (await shade.locator('.dv-cover__tilt .fv-readout__value span').first().textContent()).trim(),
  );
  await settle(page, 700);
  c = await calls(page);
  check(
    'cover: holding the tilt stepper repeats and stops on release, one call with the final tilt',
    held >= 80 && after === held && c.length === 1 && c[0].d.tilt_position === held,
    `50 → ${held} → ${after} · ${JSON.stringify(c.map((x) => x.d))}`,
  );
  await page.close();
}

/* ---------- fan: speeds, rows, presets ---------- */
{
  const page = await open('devices-motion');
  const fan = frame(page, 'Ceiling fan').locator('fluvy-fan-card');
  const plus = fan.locator('.dv-value .fv-stepper__half').nth(1);
  await taps(plus, 3);
  const shown = (
    await fan.locator('.dv-value .fv-readout__value span').first().textContent()
  ).trim();
  await settle(page, 900);
  let c = await calls(page);
  check(
    'fan: three quick steps show 63 % at once and send one set_percentage',
    shown === '63' && c.length === 1 && c[0].s === 'fan.set_percentage' && c[0].d.percentage === 63,
    `${shown} · ${JSON.stringify(c.map((x) => x.d))}`,
  );
  await reset(page);
  const ruler = fan.locator('fluvy-ruler .fv-ruler');
  await ruler.evaluate((el) => el.scrollIntoView({ block: 'center' })); // raw mouse coordinates only work on screen
  const rb = await ruler.boundingBox();
  await page.mouse.click(rb.x + rb.width * 0.25, rb.y + rb.height / 2);
  await settle(page, 300);
  c = await calls(page);
  check(
    'fan: a tap on the ruler sends set_percentage at once (no coalescing wait)',
    c.length === 1 && c[0].s === 'fan.set_percentage' && Math.abs(c[0].d.percentage - 25) <= 1,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  await fan.locator('.fv-card__head .fv-hit').click();
  check(
    'fan: the head switch flips at once',
    (await fan.locator('.fv-card__head .fv-switch').getAttribute('aria-checked')) === 'false',
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends turn_off',
    c.length === 1 && c[0].s === 'fan.turn_off',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  const rows = fan.locator('.dv-rows .fv-row');
  await rows.nth(0).locator('.fv-hit').click();
  check(
    'fan: the oscillate switch flips at once',
    (await rows.nth(0).locator('.fv-switch').getAttribute('aria-checked')) === 'false',
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends oscillate false',
    c.length === 1 && c[0].s === 'fan.oscillate' && c[0].d.oscillating === false,
    JSON.stringify(c),
  );
  await reset(page);
  await rows.nth(1).click();
  check(
    'fan: the direction row flips the direction at once',
    (await rows.nth(1).locator('.fv-row__sub').textContent()).trim() === 'Reverse',
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends set_direction reverse',
    c.length === 1 && c[0].s === 'fan.set_direction' && c[0].d.direction === 'reverse',
    JSON.stringify(c),
  );
  await reset(page);

  const tower = frame(page, 'Fan · three speeds, no presets').locator('fluvy-fan-card');
  await taps(tower.locator('.dv-value .fv-stepper__half').nth(1), 1);
  await settle(page, 900);
  c = await calls(page);
  check(
    'fan: a three-speed fan steps to its next stop (66 → 100)',
    c.length === 1 && c[0].d.percentage === 100,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  await taps(tower.locator('.dv-value .fv-stepper__half').nth(0), 2);
  await settle(page, 900);
  c = await calls(page);
  check(
    'fan: …and two steps down land on the floor of the middle stop (33)',
    c.length === 1 && c[0].d.percentage === 33,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  const labels = await tower.locator('.fv-ruler-labels span').allTextContents();
  check(
    'fan: a three-speed fan names its stops',
    labels.join(' ') === 'Off Low Mid High',
    labels.join(' '),
  );

  // off with `when_off: essentials`: the switch and the ruler alone; the switch brings the rows and the chips back at once
  const bare = frame(page, 'Fan · off, essentials').locator('fluvy-fan-card');
  check(
    'fan: off with when_off: essentials shows neither rows nor chips, its switch off',
    (await bare.locator('.dv-rows').count()) === 0 &&
      (await bare.locator('.fv-chips').count()) === 0 &&
      (await bare.locator('.fv-card__head .fv-switch').getAttribute('aria-checked')) === 'false',
  );
  await bare.locator('.fv-card__head .fv-hit').click();
  check(
    '…the head switch brings the two rows and the preset chips back at once',
    (await bare.locator('.dv-rows .fv-row').count()) === 2 &&
      (await bare.locator('.fv-chips').count()) === 1,
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends one turn_on',
    c.length === 1 && c[0].s === 'fan.turn_on',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);

  const bedroom = frame(page, 'Fan · off, presets').locator('fluvy-fan-card');
  await bedroom.locator('.fv-chip').nth(2).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'fan: a preset chip sends set_preset_mode',
    c.length === 1 && c[0].s === 'fan.set_preset_mode' && c[0].d.preset_mode === 'boost',
    JSON.stringify(c),
  );
  check(
    '…and lights at once',
    (await bedroom.locator('.fv-chip').nth(2).getAttribute('aria-pressed')) === 'true',
  );
  await page.close();
}

/* ---------- vacuum ---------- */
{
  const page = await open('devices-motion');
  const robot = frame(page, 'Vacuum').locator('fluvy-vacuum-card');
  const actions = robot.locator('.fv-action');
  await actions.nth(0).click(); // pause while cleaning
  check(
    'vacuum: Pause is answered at once (badge Paused, the cell becomes Start)',
    (await robot.locator('.fv-badge').textContent()).trim() === 'Paused' &&
      (await actions.nth(0).getAttribute('aria-label')) === 'Start',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and one vacuum.pause goes out',
    c.length === 1 && c[0].s === 'vacuum.pause',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await actions.nth(0).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'vacuum: Start sends vacuum.start',
    c.length === 1 && c[0].s === 'vacuum.start',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await actions.nth(1).click();
  await actions.nth(3).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'vacuum: Stop and Locate send their services',
    c.map((x) => x.s).join() === 'vacuum.stop,vacuum.locate',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await actions.nth(2).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'vacuum: Return to dock sends return_to_base and goes inert while returning',
    c.length === 1 && c[0].s === 'vacuum.return_to_base' && (await actions.nth(2).isDisabled()),
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await robot.locator('.fv-chip').nth(2).click(); // turbo
  check(
    'vacuum: a suction chip lights at once',
    (await robot.locator('.fv-chip').nth(2).getAttribute('aria-pressed')) === 'true',
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends set_fan_speed',
    c.length === 1 && c[0].s === 'vacuum.set_fan_speed' && c[0].d.fan_speed === 'turbo',
    JSON.stringify(c),
  );
  await reset(page);
  const mower = frame(page, 'Lawn mower').locator('fluvy-vacuum-card');
  await mower.locator('.fv-action').nth(1).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'vacuum: a lawn mower docks with lawn_mower.dock',
    c.length === 1 && c[0].s === 'lawn_mower.dock',
    JSON.stringify(c.map((x) => x.s)),
  );
  await page.close();
}

await suite.finish();
