#!/usr/bin/env node
/**
 * The value row (#46) in a real Chromium against the playground. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-value-rows.mjs
 * What it proves: the reporter's two thermostats in half a section (157 of content, Home Assistant's gaps) stack the
 * figure at l over a centred stepper, nothing under the stepper, and 9,5 beside 19,5 draws one size; a step from 9,5
 * to 10,0 and the Off chip move nothing (the class, the card's height, the stepper still there); the French and Italian
 * labels are whole at 197; a range gives its stepper to the end pressed; without its stepper the readout is the card's
 * tap, and the dial is 56 shorter; the modes are drawn in the order the config lists them; and the light, the fan,
 * the cover and the timer keep their controls inside a 211 card.
 */
import { calls, frame, moreInfo, reset, settle, startSuite, taps } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

/** The geometry of a card's value row: the row's class and box, the readout's words and the control's box. */
const rowOf = (card) =>
  card.evaluate((el) => {
    const root = el.shadowRoot;
    const row = root.querySelector('.fv-value-row');
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const article = root.querySelector('article');
    const style = getComputedStyle(article);
    const content = article.getBoundingClientRect();
    const words = [...row.querySelectorAll('.fv-readout__label, .fv-readout__value > span')];
    const control = row.querySelector('.fv-stepper, .in-timer__cmds');
    return {
      cls: row.className.replace(/\s+/g, ' ').trim(),
      size: row.querySelector('.fv-readout')?.className.match(/fv-readout--(\w+)/)?.[1],
      label: row.querySelector('.fv-readout__label')?.textContent.trim(),
      labelCut: [...row.querySelectorAll('.fv-readout__label')].some(
        (n) => n.scrollWidth > n.clientWidth + 0.5,
      ),
      figure: row.querySelector('.fv-readout__value')?.textContent.replace(/\s+/g, ' ').trim(),
      row: box(row),
      readout: box(row.querySelector('.fv-readout')),
      words: words.map(box),
      control: box(control),
      disabled: [...row.querySelectorAll('.fv-stepper__half')].map((half) => half.disabled),
      card: box(article),
      inner: {
        left: content.left + parseFloat(style.paddingLeft),
        right: content.right - parseFloat(style.paddingRight),
      },
    };
  });

/** No word of the readout lies over its control; stacked, the control is 12 under it and centred with it. */
const clear = (g) =>
  !g.control ||
  g.words.every(
    (w) =>
      w.right <= g.control.x + 0.5 ||
      w.x >= g.control.right - 0.5 ||
      w.bottom <= g.control.y + 0.5 ||
      w.y >= g.control.bottom - 0.5,
  );
const centred = (g) =>
  Math.abs(g.control.x + g.control.w / 2 - (g.readout.x + g.readout.w / 2)) <= 0.5 &&
  g.control.y - g.readout.bottom >= 11.5;
const inside = (g) =>
  [g.readout, g.control, ...g.words]
    .filter(Boolean)
    .every((b) => b.x >= g.inner.left - 0.5 && b.right <= g.inner.right + 0.5);

/* ---------- #46: two thermostats in half a section at Home Assistant's gaps ---------- */
{
  const page = await suite.sheet('climate', { width: 402, lang: 'de' });
  const cards = frame(page, 'Compact · half a section (#46)').locator('fluvy-thermostat-card');
  const garderobe = cards.nth(0);
  const atelier = cards.nth(1);
  let g = await rowOf(garderobe);
  const a = await rowOf(atelier);
  check(
    '#46: a 197 card stacks the figure at l over its stepper, centred 12 under it',
    g.cls.includes('fv-value-row--stack') && g.size === 'l' && centred(g),
    JSON.stringify({ cls: g.cls, size: g.size, readout: g.readout, control: g.control }),
  );
  check('#46: no word of the readout under the stepper', clear(g) && clear(a));
  check(
    '#46: "ZIEL · JETZT 20,6°" over "19,5 °C", whole',
    /^Ziel · Jetzt 20,6°$/i.test(g.label) && g.figure === '19,5°C' && !g.labelCut,
    `${g.label} | ${g.figure}`,
  );
  check(
    '#46: 9,5 beside 19,5 draws one size and one height',
    a.size === g.size && a.cls === g.cls && Math.abs(a.row.h - g.row.h) < 0.5,
    `${a.size}/${g.size} ${a.row.h}/${g.row.h}`,
  );
  const modes = async (card) =>
    (await card.locator('.fv-chip, .fv-option__label').allTextContents()).map((t) => t.trim());
  check(
    'the modes in the order each config lists them: Aus · Auto, then Auto · Aus',
    (await modes(garderobe)).join(',') === 'Aus,Auto' &&
      (await modes(atelier)).join(',') === 'Auto,Aus',
    `${await modes(garderobe)} | ${await modes(atelier)}`,
  );

  // + from 9,5 to 10,0: one digit more, and nothing moves
  const before = await rowOf(atelier);
  await taps(atelier.locator('.fv-stepper__half').nth(1), 1);
  await settle(page, 100);
  const after = await rowOf(atelier);
  check(
    '+ from 9,5 to 10,0 keeps the row’s class, its size and the card’s height',
    after.figure === '10,0°C' &&
      after.cls === before.cls &&
      after.size === before.size &&
      Math.abs(after.card.h - before.card.h) < 0.5,
    `${before.figure} → ${after.figure} · ${before.card.h} → ${after.card.h}`,
  );
  await settle(page, 800);
  await reset(page);

  // the Off chip: the device goes off and the stepper stays, still, where it was
  const height = (await rowOf(garderobe)).card.h;
  await garderobe.locator('.fv-chip').first().click();
  await settle(page, 200);
  g = await rowOf(garderobe);
  check(
    'the Off chip keeps the card’s height and leaves the stepper in place, still',
    g.figure === 'Aus' &&
      Math.abs(g.card.h - height) < 0.5 &&
      g.disabled.length === 2 &&
      g.disabled.every(Boolean),
    `${g.figure} · ${height} → ${g.card.h} · ${JSON.stringify(g.disabled)}`,
  );
  await page.close();
}

/* ---------- the target's word, whole in French and Italian at 197 ---------- */
for (const [lang, word] of [
  ['fr', 'Consigne'],
  ['it', 'Obiettivo'],
]) {
  const page = await suite.sheet('climate', { width: 402, lang });
  const card = frame(page, 'Compact · half a section (#46)')
    .locator('fluvy-thermostat-card')
    .first();
  const g = await rowOf(card);
  check(
    `${lang}: "${word.toUpperCase()}" whole at 197, clear of the stepper`,
    g.label.toLowerCase().startsWith(word.toLowerCase()) && !g.labelCut && clear(g) && inside(g),
    g.label,
  );
  await page.close();
}

/* ---------- a range: the stepper drives the end pressed ---------- */
{
  const page = await suite.sheet('climate', { width: 320 });
  const card = frame(page, 'Compact · half a section at the floor')
    .locator('fluvy-thermostat-card')
    .nth(1);
  const ends = card.locator('.cl-end');
  const pressed = async () =>
    (await ends.evaluateAll((all) => all.map((end) => end.getAttribute('aria-pressed')))).join(',');
  check(
    'a range at 112: the low end drives the stepper at first',
    (await pressed()) === 'true,false',
  );
  await ends.nth(1).click();
  await settle(page, 100);
  check('…a tap on the high end gives it the stepper', (await pressed()) === 'false,true');
  await taps(card.locator('.fv-stepper__half').nth(1), 1);
  await settle(page, 900);
  const c = await calls(page);
  check(
    '…and + sends the high end a step up, the low one where it was',
    c.length === 1 &&
      c[0].s === 'climate.set_temperature' &&
      c[0].d.target_temp_low === 20 &&
      c[0].d.target_temp_high === 24.5,
    JSON.stringify(c.map((x) => x.d)),
  );
  const g = await rowOf(card);
  check('…a range at the floor is whole, its words clear of the stepper', clear(g) && inside(g));
  await page.close();
}

/* ---------- without the stepper: the readout is the card's tap; the dial 56 shorter ---------- */
{
  const page = await suite.sheet('climate');
  const cards = frame(page, 'Compact · without − and +').locator('fluvy-thermostat-card');
  check('show_stepper: false draws no stepper', (await cards.locator('.fv-stepper').count()) === 0);
  const tap = cards.first().locator('.cl-value .fv-tile__tap');
  check(
    '…its readout is a button named by what it says',
    (await tap.getAttribute('aria-label'))?.startsWith('Garderobe · Target') === true,
    await tap.getAttribute('aria-label'),
  );
  await tap.click();
  await settle(page, 100);
  check(
    '…a tap on it opens the details',
    (await moreInfo(page)).includes('climate.garderobe'),
    JSON.stringify(await moreInfo(page)),
  );
  check(
    'show_modes: false hides the modes and their label',
    (await cards.nth(1).locator('.fv-option, .fv-chip, .fv-label').count()) === 0,
  );
  const dialHeight = (title) =>
    frame(page, title)
      .locator('fluvy-thermostat-card fluvy-dial')
      .first()
      .evaluate((dial) => dial.getBoundingClientRect().height);
  const bare = await dialHeight('Dial · without − and +');
  const full = await dialHeight('Heat');
  check(
    'a dial without its stepper is 56 shorter, and has none',
    full - bare === 56 &&
      (await frame(page, 'Dial · without − and +').locator('.fv-dial__stepper').count()) === 0,
    `${full} → ${bare}`,
  );
  await page.close();
}

/* ---------- the light, the fan, the cover and the timer at the full-card floor ---------- */
{
  const page = await suite.sheet('slider', { width: 360 });
  const cards = frame(page, 'Full · half a section').locator('fluvy-light-card');
  const lit = await rowOf(cards.first());
  const bare = await rowOf(cards.nth(1));
  check(
    'a full light in half a section: its stepper under the level, inside the card',
    lit.cls.includes('fv-value-row--stack') && centred(lit) && clear(lit) && inside(lit),
    lit.cls,
  );
  check(
    '…without its stepper, the level is the card’s tap',
    !bare.control && (await cards.nth(1).locator('.sl-value .fv-tile__tap').count()) === 1,
  );
  await page.close();
}
for (const [sheet, title, tag, lang] of [
  ['devices-motion', 'Ceiling fan', 'fluvy-fan-card', 'de'],
  ['devices-motion', 'Cover · tilt only', 'fluvy-cover-card', 'fr'],
  ['inputs', 'Timer', 'fluvy-timer-card', 'en'],
]) {
  const page = await suite.sheet(sheet, { width: 211, lang });
  const g = await rowOf(frame(page, title).locator(tag).first());
  check(
    `${title} at 211 (${lang}): the control inside the card, clear of the words`,
    Boolean(g.control) && clear(g) && inside(g),
    `${g.cls} · ${JSON.stringify(g.control)}`,
  );
  await page.close();
}
{
  // the cover's side column beside its ruler: the ruler's words give way before the tilt's stepper leaves the card
  const page = await suite.sheet('devices-motion', { width: 211, lang: 'fr' });
  const card = frame(page, 'Blinds').locator('fluvy-cover-card').first();
  const side = await card.evaluate((el) => {
    const root = el.shadowRoot;
    const article = root.querySelector('article').getBoundingClientRect();
    const stepper = root.querySelector('.dv-cover__tilt .fv-stepper')?.getBoundingClientRect();
    return {
      words: getComputedStyle(root.querySelector('.dv-vlabels')).display,
      inside: Boolean(stepper) && stepper.right <= article.right - 20 + 0.5,
    };
  });
  check(
    'Blinds at 211 (fr): the tilt’s stepper under its readout, inside the card; the ruler’s words give way',
    side.inside && side.words === 'none',
    JSON.stringify(side),
  );
  const wide = await suite.sheet('devices-motion', { width: 360, lang: 'fr' });
  check(
    '…at 360 the ruler keeps its words',
    (await frame(wide, 'Blinds')
      .locator('fluvy-cover-card')
      .first()
      .evaluate((el) => getComputedStyle(el.shadowRoot.querySelector('.dv-vlabels')).display)) !==
      'none',
  );
  await wide.close();
  await page.close();
}

await suite.finish();
