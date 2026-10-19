#!/usr/bin/env node
/**
 * Interaction tests for the media cards: media (transport, seek, volume, sources, the power round, the mini row's
 * controls, the clock) and now-playing (its strip, with power) — the seek bar and volume send once per gesture,
 * bursts coalesce.
 * Real cards on the playground's simulated hass. Exit code 1 on any failure.
 *   node interactions-media.mjs            (expects the playground dev server on :5183)
 */
import { mousePointer, seekTo } from './lib/gestures.mjs';
import {
  calls,
  frame,
  moreInfo,
  PAGE_INTERVALS,
  reset,
  settle,
  startSuite,
  tapHead,
} from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;
const open = (sheet, options) => suite.sheet(sheet, options);

/* ---------- media: transport, seek, volume, sources, the clock ---------- */
{
  const page = await open('media');
  const card = frame(page, 'Playing').locator('fluvy-media-card');
  const play = card.locator('.md-controls .fv-round').nth(2);
  await play.click();
  check(
    'media: play/pause flips the glyph at once',
    (await play.getAttribute('aria-label')) === 'Play',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and sends media_play_pause once',
    c.length === 1 && c[0].s === 'media_player.media_play_pause',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await card.locator('.md-controls .fv-round').nth(0).click(); // shuffle
  await card.locator('.md-controls .fv-round').nth(1).click(); // prev
  await card.locator('.md-controls .fv-round').nth(3).click(); // next
  await card.locator('.md-controls .fv-round').nth(4).click(); // repeat
  await settle(page, 300);
  c = await calls(page);
  check(
    'media: shuffle · prev · next · repeat each send their service',
    c.map((x) => x.s).join() ===
      'media_player.shuffle_set,media_player.media_previous_track,media_player.media_next_track,media_player.repeat_set' &&
      c[0].d.shuffle === true &&
      c[3].d.repeat === 'all',
    JSON.stringify(c),
  );
  await reset(page);

  // seek: one drag → one media_seek at the release point; the knob never leaves the column
  const seek = card.locator('.md-progress');
  const sb = await seek.boundingBox();
  const sy = sb.y + sb.height / 2;
  let during = null;
  await seekTo(mousePointer(page), sb, {
    from: 0.3,
    via: 0.5,
    to: 0.75,
    phase: async () => {
      during = await seek.locator('.fv-knob').boundingBox();
    },
  });
  await settle(page, 200);
  c = await calls(page);
  const target = Math.round(0.75 * 222);
  check(
    'media: a seek drag sends one media_seek at the release point',
    c.length === 1 &&
      c[0].s === 'media_player.media_seek' &&
      Math.abs(c[0].d.seek_position - target) <= 2,
    JSON.stringify(c.map((x) => x.d)),
  );
  check(
    '…and the knob followed the finger while dragging',
    Math.abs(during.x + during.width / 2 - (sb.x + sb.width * 0.75)) < 3,
    `knob at ${(during.x + during.width / 2 - sb.x).toFixed(1)} of ${sb.width}`,
  );
  await reset(page);
  await page.mouse.move(sb.x + sb.width * 0.2, sy);
  await page.mouse.down();
  await page.mouse.move(sb.x, sy, { steps: 6 });
  await page.mouse.move(sb.x - 60, sy, { steps: 6 });
  const atStart = await seek.locator('.fv-knob').boundingBox();
  await page.mouse.up();
  await settle(page, 200);
  check(
    'media: at the start the seek knob stays flush with the column (4 px overhang, not half outside)',
    atStart.x >= sb.x - 4.5 && atStart.x <= sb.x - 3,
    `left overhang ${(sb.x - atStart.x).toFixed(1)} px`,
  );
  await reset(page);
  await seek.focus();
  await page.keyboard.press('ArrowRight');
  await settle(page, 200);
  c = await calls(page);
  check(
    'media: the keyboard seeks by 10 s',
    c.length === 1 && c[0].s === 'media_player.media_seek' && c[0].d.seek_position === 10,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);

  const vol = card.locator('.md-volume fluvy-ruler .fv-ruler');
  const vb = await vol.boundingBox();
  await page.mouse.click(vb.x + vb.width * 0.5, vb.y + vb.height / 2);
  await settle(page, 200);
  c = await calls(page);
  check(
    'media: the volume ruler sends volume_set as a 0–1 level, once',
    c.length === 1 &&
      c[0].s === 'media_player.volume_set' &&
      Math.abs(c[0].d.volume_level - 0.5) <= 0.02,
    JSON.stringify(c.map((x) => x.d)),
  );
  await reset(page);
  await card.locator('.md-volume .fv-round').click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'media: mute sends volume_mute true',
    c.length === 1 && c[0].s === 'media_player.volume_mute' && c[0].d.is_volume_muted === true,
    JSON.stringify(c),
  );
  await reset(page);

  const tv = frame(page, 'TV · sources').locator('fluvy-media-card');
  await tv.locator('.fv-chip').nth(1).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'media: a source chip sends select_source',
    c.length === 1 && c[0].s === 'media_player.select_source' && c[0].d.source === 'Netflix',
    JSON.stringify(c),
  );
  await reset(page);

  const mini = frame(page, 'Mini').locator('fluvy-media-card').first();
  await mini.locator('.fv-round').first().click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'media: the mini row play/pause sends media_play_pause',
    c.length === 1 && c[0].s === 'media_player.media_play_pause',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);

  /* ---------- the power round, the mini row's controls, the strip: first what they show ---------- */
  const powerOf = (locator) =>
    locator.locator('.fv-round[aria-label="Turn off"], .fv-round[aria-label="Turn on"]');
  const labels = async (card) =>
    card
      .locator('.md-mini__row .fv-round')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  const stripLabels = async (card) =>
    card
      .locator('.hm-transport .fv-round')
      .evaluateAll((els) =>
        els.map((el) => `${el.getAttribute('aria-label')}${el.disabled ? '×' : ''}`),
      );
  const kitchen = frame(page, 'Playing').locator('fluvy-media-card');
  const headPower = kitchen.locator('.md-now .fv-round');
  check(
    'media: the head’s trailing round is power on a player that can be switched',
    (await headPower.count()) === 1 && (await headPower.getAttribute('aria-label')) === 'Turn off',
    `${await headPower.count()} rounds, "${await headPower.first().getAttribute('aria-label')}"`,
  );
  const off = frame(page, 'Power · off').locator('fluvy-media-card');
  const wake = off.locator('.md-now .fv-round');
  check(
    'media: a player that is off offers "Turn on" in the primary fill and no dead transport',
    (await wake.getAttribute('aria-label')) === 'Turn on' &&
      (await wake.evaluate((el) => el.classList.contains('fv-round--accent'))) &&
      (await off.locator('.md-controls').count()) === 0,
  );
  const noPower = frame(page, 'No power').locator('fluvy-media-card');
  check(
    'media: no power round on a player that cannot be switched, nor with show_power off',
    (await powerOf(noPower).count()) === 0 &&
      (await noPower.locator('.md-now .fv-round[aria-label="More"]').count()) === 2,
  );
  check(
    'media: the hero wears the power round in its corner',
    (await frame(page, 'Hero').locator('.md-hero__power[aria-label="Turn off"]').count()) === 1,
  );
  // every control asked for: the row holds three beside the title at 360, in the order named
  const minis = frame(page, 'Mini · controls').locator('fluvy-media-card');
  check(
    'media: the mini row draws what fits in the order asked; next and previous give way before play',
    (await labels(minis.nth(0))).join() === 'Turn off,Pause,Mute',
    (await labels(minis.nth(0))).join(),
  );
  check(
    'media: an off mini row keeps the power round (and its volume), never a play round',
    (await labels(minis.nth(1))).join() === 'Turn on,Mute',
    (await labels(minis.nth(1))).join(),
  );
  check(
    'media: a mini row of a player without power offers no power round',
    (await labels(minis.nth(2))).join() === 'Previous,Pause,Volume',
    (await labels(minis.nth(2))).join(),
  );
  check(
    'media: the volume control mutes where it can, and opens the dialog where it cannot',
    (await labels(minis.nth(3))).join() === 'Pause,Mute' &&
      (await labels(minis.nth(4))).join() === 'Pause,Volume',
    `${await labels(minis.nth(3))} · ${await labels(minis.nth(4))}`,
  );
  const halves = frame(page, 'Mini · half').locator('fluvy-media-card');
  check(
    'media: half a column lets the art go before the last round, and keeps play',
    (await labels(halves.nth(0))).join() === 'Pause' &&
      (await labels(halves.nth(1))).join() === 'Pause' &&
      (await halves.locator('.md-mini__row :is(.fv-art, .fv-ico)').count()) === 0 &&
      (await halves.locator('.md-mini__row .fv-card__tap').count()) === 2,
    `${await labels(halves.nth(0))} · ${await labels(halves.nth(1))}`,
  );
  const strips = frame(page, 'Now playing · power').locator('fluvy-now-playing-card');
  check(
    'now-playing: power on the left edge, the transport centred, volume on the right',
    (await stripLabels(strips.nth(0))).join() === 'Turn off,Previous,Pause,Next,Volume · 24 %' &&
      (await strips
        .nth(0)
        .locator('.hm-transport__power')
        .evaluate((el) => el.offsetLeft)) === 0,
    (await stripLabels(strips.nth(0))).join(),
  );
  check(
    'now-playing: off, the strip is power (in the primary fill) and volume, no dead transport',
    (await stripLabels(strips.nth(1))).join() === 'Turn on,Volume · 20 %' &&
      (await strips
        .nth(1)
        .locator('.hm-transport__power')
        .evaluate((el) => el.classList.contains('fv-round--accent'))),
    (await stripLabels(strips.nth(1))).join(),
  );
  check(
    'now-playing: no power round without support; a half column keeps power and play',
    (await stripLabels(strips.nth(2))).join() === 'Previous,Pause,Next,Volume · 50 %' &&
      (await stripLabels(strips.nth(3))).join() === 'Turn off,Pause',
    `${await stripLabels(strips.nth(2))} · ${await stripLabels(strips.nth(3))}`,
  );

  /* ---------- then what they do (each tap changes the player the frames share) ---------- */
  await headPower.click();
  check(
    'media: power flips the card to off at once',
    (await headPower.getAttribute('aria-label')) === 'Turn on' &&
      (await kitchen.locator('.md-controls').count()) === 0,
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends media_player.turn_off to the player',
    c.length === 1 &&
      c[0].s === 'media_player.turn_off' &&
      c[0].t?.entity_id === 'media_player.kitchen',
    JSON.stringify(c),
  );
  await reset(page);
  await wake.click();
  check(
    'media: waking flips the card at once',
    (await wake.getAttribute('aria-label')) === 'Turn off',
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends media_player.turn_on to the player',
    c.length === 1 &&
      c[0].s === 'media_player.turn_on' &&
      c[0].t?.entity_id === 'media_player.tv_off',
    JSON.stringify(c),
  );
  await reset(page);
  await minis.nth(0).locator('.fv-round').nth(1).click(); // pause
  await minis.nth(0).locator('.fv-round').nth(2).click(); // mute
  await minis.nth(2).locator('.fv-round').nth(0).click(); // the radio's previous
  await settle(page, 300);
  c = await calls(page);
  check(
    'media: each mini control sends its service to its player',
    c.map((x) => `${x.s}@${x.t?.entity_id}`).join() ===
      'media_player.media_play_pause@media_player.tv,media_player.volume_mute@media_player.tv,media_player.media_previous_track@media_player.radio' &&
      c[1].d.is_volume_muted === true,
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await tapHead(halves.nth(0), '.md-mini__row .fv-row__title');
  check(
    'media: where the art has given way, the row’s words open the dialog',
    (await moreInfo(page)).join() === 'media_player.tv' && (await calls(page)).length === 0,
  );
  await reset(page);
  await minis.nth(4).locator('.fv-round').nth(1).click(); // volume without mute
  check(
    'media: the volume round of a player without mute opens its dialog, no service',
    (await moreInfo(page)).join() === 'media_player.radio' && (await calls(page)).length === 0,
  );
  await reset(page);
  await strips.nth(0).locator('.hm-transport__power').click();
  check(
    'now-playing: power flips the strip at once, and the transport goes with it',
    (await stripLabels(strips.nth(0))).join() === 'Turn on,Volume · muted',
    (await stripLabels(strips.nth(0))).join(),
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends media_player.turn_off to the player',
    c.length === 1 && c[0].s === 'media_player.turn_off' && c[0].t?.entity_id === 'media_player.tv',
    JSON.stringify(c),
  );
  await reset(page);
  // the television is off now: the mini row's power round wakes it, and the row offers its play again
  await minis.nth(0).locator('.fv-round').first().click();
  check(
    'media: the mini row’s power round wakes a player that is off, and the row follows at once',
    (await labels(minis.nth(0))).join() === 'Turn off,Play,Unmute',
    (await labels(minis.nth(0))).join(),
  );
  await settle(page, 300);
  c = await calls(page);
  check(
    '…and sends media_player.turn_on to the player',
    c.length === 1 && c[0].s === 'media_player.turn_on' && c[0].t?.entity_id === 'media_player.tv',
    JSON.stringify(c),
  );
  await reset(page);

  // the position clock: only playing cards tick; a removed card leaves no interval behind
  const before = await page.evaluate(() => window.__intervals());
  await page.evaluate(() => {
    document
      .querySelectorAll('fluvy-media-card, fluvy-now-playing-card')
      .forEach((el) => el.remove());
  });
  await settle(page, 200);
  const after = await page.evaluate(() => window.__intervals());
  check(
    'media: removing every media card releases every interval',
    before > 0 && after === PAGE_INTERVALS,
    `${before} → ${after}`,
  );
  // a hass update after removal (the dashboard still pushes one) must not start a clock nobody stops
  await page.evaluate(() => {
    window.fluvyMock.calls.length = 0;
  });
  await page.evaluate(() =>
    window.fluvyMock
      .hass()
      .callService(
        'media_player',
        'volume_set',
        { volume_level: 0.5 },
        { entity_id: 'media_player.kitchen' },
      ),
  );
  await settle(page, 400);
  check(
    'media: a hass update after removal starts no interval',
    (await page.evaluate(() => window.__intervals())) === PAGE_INTERVALS,
  );
  await page.close();
}

/* ---------- now-playing ---------- */
{
  const page = await open('home-extras');
  const card = frame(page, 'A Home').locator('fluvy-now-playing-card');
  const rounds = card.locator('.hm-transport .fv-round');
  await rounds.nth(1).click();
  check(
    'now-playing: play/pause flips at once',
    (await rounds.nth(1).getAttribute('aria-label')) === 'Play',
  );
  await settle(page, 300);
  let c = await calls(page);
  check(
    '…and sends one media_play_pause',
    c.length === 1 && c[0].s === 'media_player.media_play_pause',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await rounds.nth(0).click();
  await rounds.nth(2).click();
  await settle(page, 300);
  c = await calls(page);
  check(
    'now-playing: previous and next send their services',
    c.map((x) => x.s).join() === 'media_player.media_previous_track,media_player.media_next_track',
    JSON.stringify(c.map((x) => x.s)),
  );
  await reset(page);
  await rounds.nth(3).click();
  check(
    'now-playing: the volume round opens more-info, no service',
    (await moreInfo(page)).join() === 'media_player.kitchen_speaker' &&
      (await calls(page)).length === 0,
  );
  const radio = frame(page, 'F Player').locator('fluvy-now-playing-card').nth(1);
  check(
    'now-playing: unsupported previous / next are disabled',
    (await radio.locator('.hm-transport .fv-round').nth(0).isDisabled()) &&
      (await radio.locator('.hm-transport .fv-round').nth(2).isDisabled()),
  );
  const before = await page.evaluate(() => window.__intervals());
  await page.evaluate(() => {
    document.querySelectorAll('fluvy-now-playing-card').forEach((el) => el.remove());
  });
  await settle(page, 200);
  check(
    'now-playing: removing the cards releases their clocks',
    before > 0 && (await page.evaluate(() => window.__intervals())) === PAGE_INTERVALS,
    `${before} → ${await page.evaluate(() => window.__intervals())}`,
  );
  await page.close();
}

await suite.finish();
