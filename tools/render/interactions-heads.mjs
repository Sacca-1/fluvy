#!/usr/bin/env node
/**
 * Narrow heads (#42), in a real Chromium against the playground's `heads` sheet: one card of each family whose head is
 * fitted, under a long name, its tap going to `/t/<card>` and its hold to `/h/<card>`, at the card widths a phone
 * gives (152 and 172: half a section) and the full card's floor (211). Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-heads.mjs
 * What it proves, for every card at every width: a click where a finger lands — the name, the line under it — runs
 * the tap action and nothing else (the name hit-tests to the head's button, whose row is at least 44 tall); a still
 * press there runs the hold action and never the tap; a mouse that drags from the name runs nothing; from the
 * keyboard the head is one stop, Enter taps, Shift+F10 holds and the focus ring goes round the row; a switch in the
 * head flips its device alone. In half a section the lamp's circle has given way to its name, and its tap has not.
 */
import { calls, frame, reset, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

/** The parts each card's head is read by: its name, the line under it, and its button. */
const HEAD = {
  title: '.fv-card__head .fv-card__title',
  sub: '.fv-card__head .fv-card__sub',
  button: '.fv-card__tap',
};
const PARTS = {
  media: { title: '.md-now .md-title', sub: '.md-now .fv-card__sub', button: '.fv-card__tap' },
  mini: {
    title: '.md-mini__row .fv-row__title',
    sub: '.md-mini__row .fv-row__sub',
    button: '.fv-card__tap',
  },
  greeting: {
    title: '.hm-hello__title',
    sub: '.hm-hello__meta',
    button: '.hm-hello__text .fv-tile__tap',
  },
};
/** The cards in the sheet's order (`apps/playground/src/sheets/heads.ts`), and the switch a head keeps beside it. */
const FULL = [
  'light',
  'fan',
  'thermostat',
  'lock',
  'sensor',
  'gauge',
  'production',
  'openings',
  'people',
  'lights',
  'automations',
  'weather',
  'media',
  'mini',
  'greeting',
];
const HALF = ['light', 'fan', 'lock', 'weather', 'mini'];
const SWITCHED = { light: 'light.turn_', fan: 'fan.turn_', lights: 'light.turn_' };

const WIDTHS = [
  { card: 152, page: 320, frame: 'Half a section', keys: HALF },
  { card: 172, page: 360, frame: 'Half a section', keys: HALF },
  { card: 211, page: 211, frame: 'A full card', keys: FULL },
];

/** Every navigation the cards ask for (`location-changed`), as the path they went to. */
const watchNavigation = (page) =>
  page.evaluate(() => {
    window.__navigations = [];
    window.addEventListener('location-changed', () =>
      window.__navigations.push(window.location.pathname),
    );
  });
const navigations = (page) => page.evaluate(() => window.__navigations.splice(0));

const centre = async (locator) => {
  if (!(await locator.count())) return null;
  const box = await locator.first().boundingBox();
  return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

for (const { card: width, page: pageWidth, frame: title, keys } of WIDTHS) {
  const page = await suite.sheet('heads', { width: pageWidth });
  await watchNavigation(page);
  const cards = frame(page, title).locator(':scope > *');
  const count = await cards.count();
  check(`${width}: the sheet draws every card of the frame`, count === keys.length, `${count}`);
  for (const [index, key] of keys.entries()) {
    const card = cards.nth(index);
    const parts = PARTS[key] ?? HEAD;
    const at = `${key} @ ${width}`;
    await card.scrollIntoViewIfNeeded();
    const drawn = await card.evaluate((el) => el.getBoundingClientRect().width);
    const name = await centre(card.locator(parts.title));
    if (!name) {
      check(`${at}: a name to tap`, false);
      continue;
    }

    // a finger on the name: the head's button, nothing else
    await reset(page);
    await page.mouse.click(name.x, name.y);
    await settle(page, 250);
    const tapped = await navigations(page);
    const called = await calls(page);
    const hit = await card.evaluate(
      (el, { x, y, button }) => {
        const root = el.shadowRoot;
        const found = root.elementFromPoint(x, y);
        const tap = root.querySelector(button);
        const row = tap?.closest('.fv-card__head, .md-now, .md-mini__row, .hm-hello__text');
        return {
          on: Boolean(found && tap && (found === tap || tap.contains(found))),
          tall: row ? row.getBoundingClientRect().height : 0,
        };
      },
      { ...name, button: parts.button },
    );
    check(
      `${at}: a tap on the name runs the tap action, and nothing else`,
      tapped.join() === `/t/${key}` && called.length === 0 && hit.on && hit.tall >= 44,
      `${tapped.join(' ')} · ${called.length} calls · hit ${hit.on} · ${hit.tall} tall · ${drawn} wide`,
    );

    // the line under it is the button too
    const line = await centre(card.locator(parts.sub));
    if (line) {
      await page.mouse.click(line.x, line.y);
      await settle(page, 250);
      const sub = await navigations(page);
      check(`${at}: and a tap on the line under it`, sub.join() === `/t/${key}`, sub.join(' '));
    }

    // a still press: the hold, never also the tap
    await page.mouse.move(name.x, name.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await settle(page, 300);
    const held = await navigations(page);
    check(
      `${at}: a still press on the name runs the hold action and never the tap`,
      held.join() === `/h/${key}` && (await calls(page)).length === 0,
      held.join(' '),
    );

    // a mouse that drags from the name runs nothing (a selection, a scroll by hand)
    await page.mouse.move(name.x, name.y);
    await page.mouse.down();
    await page.mouse.move(name.x + 24, name.y + 2, { steps: 4 });
    await page.mouse.up();
    await settle(page, 250);
    const dragged = await navigations(page);
    check(`${at}: a drag from the name runs nothing`, dragged.length === 0, dragged.join(' '));

    // the keyboard: one stop, Enter taps, Shift+F10 holds, the ring round the row
    await card.locator(parts.button).first().focus();
    await page.keyboard.press('Enter');
    await settle(page, 200);
    const entered = await navigations(page);
    const ring = await card.evaluate((el, button) => {
      const tap = el.shadowRoot.querySelector(button);
      const after = getComputedStyle(tap, '::after');
      const own = getComputedStyle(tap);
      return tap.matches(':focus-visible')
        ? after.outlineStyle === 'solid' || own.outlineStyle === 'solid'
        : false;
    }, parts.button);
    await page.keyboard.press('Shift+F10');
    await settle(page, 200);
    const keyHeld = await navigations(page);
    check(
      `${at}: from the keyboard, Enter taps, Shift+F10 holds, and the ring is drawn`,
      entered.join() === `/t/${key}` && keyHeld.join() === `/h/${key}` && ring,
      `${entered.join(' ')} · ${keyHeld.join(' ')} · ring ${ring}`,
    );

    // a switch in the head flips its device alone
    if (SWITCHED[key]) {
      await reset(page);
      const knob = await centre(card.locator('.fv-card__head .fv-hit'));
      await page.mouse.click(knob.x, knob.y);
      await settle(page, 300);
      const flipped = await calls(page);
      const went = await navigations(page);
      check(
        `${at}: the switch beside the name flips the device alone`,
        flipped.length === 1 && flipped[0].s.startsWith(SWITCHED[key]) && went.length === 0,
        `${flipped.map((c) => c.s).join(' ')} · ${went.join(' ')}`,
      );
    }
  }

  // the reporter's case: half a phone's section has no room for the lamp's circle beside its switch
  if (width < 211) {
    const lamp = cards.nth(0);
    check(
      `${width}: the lamp's circle has given way to its name, and its tap is still the head's`,
      (await lamp.locator('.fv-card__head .fv-ico').count()) === 0 &&
        (await lamp.locator('.fv-card__tap').count()) === 1,
    );
  }
  await page.close();
}

// the reporter's lamps asking for their circle (`show_icon: always`): in half a phone's section (152, 172) not even the
// smaller circle leaves the name its floor beside the switch, so it gives way; half a 416 section (200) holds the
// smaller one; never an empty name or a stump ("L", "O"), the long name read whole on hover
for (const [width, pageWidth, circle] of [
  [152, 320, 0],
  [172, 360, 0],
  [200, 416, 40],
]) {
  const page = await suite.sheet('heads', { width: pageWidth });
  const cards = frame(page, 'show_icon: always · half a section').locator(':scope > *');
  for (const [index, key] of ['light', 'fan'].entries()) {
    const seen = await cards.nth(index).evaluate((el) => {
      const tap = el.shadowRoot.querySelector('.fv-card__tap');
      const ico = el.shadowRoot.querySelector('.fv-card__head > .fv-ico');
      return {
        card: Math.round(el.getBoundingClientRect().width),
        name: Math.round(tap.getBoundingClientRect().width),
        circle: ico ? Math.round(ico.getBoundingClientRect().width) : 0,
        whole: tap.getAttribute('title'),
      };
    });
    check(
      `${key} @ ${width}, show_icon always: the name keeps its floor (40) beside the switch, the circle ${circle ? `the smaller ${circle}` : 'given way'}`,
      seen.card === width && seen.name >= 40 && seen.circle === circle && Boolean(seen.whole),
      JSON.stringify(seen),
    );
  }
  await page.close();
}

await suite.finish();
