#!/usr/bin/env node
/**
 * The room's lights on one card, 1.4, on the playground's `lights` sheet (real cards, simulated hass). Exit code 1 on
 * any failure.
 *   PLAYGROUND=http://127.0.0.1:5185/ node interactions-lights.mjs
 * What it proves: a tap on the card turns the whole room off when a light is on and on when none is, in one call; a
 * tap on a round turns its light alone, never the room; a hold on a round opens its light; a lit round wears its
 * bulb's colour and a ring of its level; the line says how many are on and their level; an area gives its lights;
 * rounds that leave the name too little take their own line; chips and tiles do the same as rounds; the room's ruler
 * sets what is on; a light that cannot be read is a dashed ring that takes no tap; the words follow the language.
 */
import { calls, frame, moreInfo, reset, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const card = (page, title, n = 0) => frame(page, title).locator('fluvy-lights-card').nth(n);

/** What a card says: its line, its rounds (on, accent, ring), its chips, its tiles. */
const read = (c) =>
  c.evaluate((el) => {
    const root = el.shadowRoot;
    const t = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      title: t(root.querySelector('.fv-card__title')),
      sub: t(root.querySelector('.fv-card__sub')),
      icon: Boolean(
        root.querySelector('.fv-card__head > .fv-ico, .fv-card__head .fv-ico:not(.lt-bulb)'),
      ),
      line: Boolean(root.querySelector('.lt-bulbs--line')),
      rounds: [...root.querySelectorAll('.lt-bulb')].map((b) => ({
        name: b.getAttribute('aria-label'),
        on: b.classList.contains('is-on'),
        accent: b.dataset.accent ?? null,
        ring: Boolean(b.querySelector('.lt-ring')),
        off: b.classList.contains('fv-ico--off'),
      })),
      chips: [...root.querySelectorAll('.fv-chip')].map((b) => ({
        label: t(b),
        on: b.classList.contains('is-active'),
        disabled: b.disabled,
      })),
      tiles: [...root.querySelectorAll('.fv-tile')].map((b) => ({
        name: t(b.querySelector('.fv-tile__name')),
        on: b.classList.contains('is-on'),
      })),
      empty: t(root.querySelector('.fv-empty-state__text')),
    };
  });

const ids = (call) => [].concat(call?.d?.entity_id ?? call?.t?.entity_id ?? []);

/* ---------- the row ---------- */
{
  const page = await suite.sheet('lights', { width: 360 });
  const living = await read(card(page, 'Living room'));
  check(
    'the room on one line: its name, "2 of 3 on · 63 %", a round a light beside the name',
    living.title === 'Living room' &&
      living.sub === '2 of 3 on · 63 %' &&
      !living.line &&
      living.rounds.map((r) => r.name).join('|') === 'Ceiling|Floor lamp|Reading lamp',
    JSON.stringify(living),
  );
  check(
    'a lit round wears its bulb’s colour when it has one (the floor lamp’s orange), a ring of its level; an off one neither',
    living.rounds[0].on &&
      living.rounds[0].accent === null &&
      living.rounds[0].ring &&
      living.rounds[1].on &&
      living.rounds[1].accent === '#ff8c46' &&
      living.rounds[1].ring &&
      !living.rounds[2].on &&
      !living.rounds[2].ring,
    JSON.stringify(living.rounds),
  );

  // a round is its light alone: one call for it, none for the room
  await reset(page);
  await card(page, 'Living room').locator('.lt-bulb').nth(2).click();
  await settle(page, 200);
  const one = await calls(page);
  const afterOne = await read(card(page, 'Living room'));
  check(
    'a tap on a round turns its light on, and only it',
    one.length === 1 &&
      one[0].s === 'light.turn_on' &&
      ids(one[0]).join() === 'light.lt_reading' &&
      afterOne.rounds[2].on,
    JSON.stringify(one),
  );

  // the card is the room: a light is on, so every light goes off, in one call
  await reset(page);
  const box = await card(page, 'Living room').locator('.fv-card__title').boundingBox();
  await page.mouse.click(box.x + 4, box.y + 4);
  await settle(page, 200);
  const room = await calls(page);
  const dark = await read(card(page, 'Living room'));
  check(
    'a tap on the card turns the whole room off in one call, and every round goes dark at once',
    room.length === 1 &&
      room[0].s === 'light.turn_off' &&
      ids(room[0]).sort().join() === 'light.lt_ceiling,light.lt_floor,light.lt_reading' &&
      dark.rounds.every((r) => !r.on) &&
      dark.sub === 'Off',
    JSON.stringify([room, dark.sub]),
  );

  // and on again: nothing is on, so everything comes on
  await reset(page);
  await page.mouse.click(box.x + 4, box.y + 4);
  await settle(page, 200);
  const back = await calls(page);
  check(
    'with every light off, a tap turns the whole room on',
    back.length === 1 && back[0].s === 'light.turn_on' && ids(back[0]).length === 3,
    JSON.stringify(back),
  );

  // a hold on a round opens its light, and neither turns it nor the room
  await reset(page);
  const round = await card(page, 'Living room').locator('.lt-bulb').nth(0).boundingBox();
  await page.mouse.move(round.x + 22, round.y + 22);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await settle(page, 200);
  check(
    'a hold on a round opens its light’s details and calls nothing',
    JSON.stringify(await moreInfo(page)) === JSON.stringify(['light.lt_ceiling']) &&
      (await calls(page)).length === 0,
    JSON.stringify([await moreInfo(page), await calls(page)]),
  );

  // the keyboard and a screen reader: the room is its own button, each light its own switch beside it (never inside)
  await reset(page);
  await card(page, 'All off').locator('.lt-room').focus();
  await page.keyboard.press('Enter');
  await settle(page, 200);
  const key = await calls(page);
  const roles = await card(page, 'All off').evaluate((el) => {
    const root = el.shadowRoot;
    return {
      card: root.querySelector('.lt-card').getAttribute('role'),
      nested: Boolean(root.querySelector('.lt-room .lt-bulb, .lt-bulb .lt-room')),
      switches: root.querySelectorAll('.lt-bulb[role="switch"]').length,
    };
  });
  check(
    'Enter on the room’s button turns the room; the card is a group of the room’s button and a switch a light',
    key.length === 1 &&
      key[0].s === 'light.turn_on' &&
      roles.card === 'group' &&
      !roles.nested &&
      roles.switches === 2,
    JSON.stringify([key, roles]),
  );

  // a near miss between two rounds switches nothing
  await reset(page);
  const first = await card(page, 'Living room').locator('.lt-bulb').nth(0).boundingBox();
  const second = await card(page, 'Living room').locator('.lt-bulb').nth(1).boundingBox();
  await page.mouse.click((first.x + first.width + second.x) / 2, first.y + 22);
  await settle(page, 200);
  const miss = await calls(page);
  check(
    'a tap between two rounds never switches the room (the rounds’ hits reach into the gap)',
    miss.every((c) => ids(c).length === 1),
    JSON.stringify(miss),
  );

  const kitchen = await read(card(page, 'From the area'));
  check(
    'an area gives its lights, in name order, and its name',
    kitchen.title === 'Kitchen' &&
      kitchen.rounds.map((r) => r.name).join('|') === 'Island|Pendants',
    JSON.stringify(kitchen),
  );

  const six = await read(card(page, 'Six lights'));
  check(
    'six rounds leave the name too little: they take their own line',
    six.line && six.rounds.length === 6,
    JSON.stringify(six),
  );

  const garden = await read(card(page, 'A light unavailable'));
  await reset(page);
  await card(page, 'A light unavailable').locator('.lt-bulb').nth(1).click({ force: true });
  await settle(page, 200);
  check(
    'a light that cannot be read is a dashed ring that takes no tap (a hold still opens it)',
    garden.rounds[1].off && !garden.rounds[1].on && (await calls(page)).length === 0,
    JSON.stringify(garden.rounds),
  );

  const shed = await read(card(page, 'Nothing can be read'));
  check('nothing can be read: the card says so', shed.sub === 'Unavailable', JSON.stringify(shed));

  const attic = await read(card(page, 'An area with no lights'));
  check('an area with no lights says so', attic.empty === 'No lights yet', JSON.stringify(attic));

  const plain = await read(card(page, 'Lights that only switch, one at full'));
  const quiet = await read(card(page, 'No level shown'));
  check(
    'every lit round has its ring (all the way round when it does not dim or its level is not shown); an off one none',
    plain.rounds.map((r) => `${r.on}:${r.ring}`).join() === 'true:true,false:false,true:true' &&
      quiet.rounds.filter((r) => r.on).every((r) => r.ring) &&
      quiet.sub === '2 of 3 on',
    JSON.stringify([plain.rounds, quiet.sub]),
  );

  const hall = await read(card(page, 'Half a column', 1));
  const bedroom = await read(card(page, 'Half a column', 0));
  check(
    'half a column: one round stays beside the name (the icon gives way), two take their own line',
    !hall.line && !hall.icon && bedroom.line,
    JSON.stringify([hall, bedroom]),
  );
  await page.close();
}

/* ---------- chips, tiles and the room's ruler ---------- */
{
  const page = await suite.sheet('lights', { width: 360 });
  const three = await card(page, 'Three tiles').evaluate((el) => {
    const tiles = [...el.shadowRoot.querySelectorAll('.fv-tile')].map((t) =>
      t.getBoundingClientRect(),
    );
    return {
      widths: tiles.map((r) => Math.round(r.width)),
      heights: tiles.map((r) => Math.round(r.height)),
    };
  });
  check(
    'three tiles: the odd last one takes the whole row; an inner tile is 84 tall',
    three.widths[2] > three.widths[0] * 1.5 && three.heights.every((h) => h === 84),
    JSON.stringify(three),
  );
  const tiles = await read(card(page, 'Tiles'));
  check(
    'tiles: a light a compact tile, the lit ones on',
    tiles.tiles.map((t) => `${t.on ? 'on' : 'off'}`).join() === 'on,on,off,on',
    JSON.stringify(tiles.tiles),
  );

  // the room's ruler: what is on goes to the level asked, in one call
  await reset(page);
  const ruler = card(page, 'Chips · one brightness').locator('fluvy-ruler').locator('.fv-ruler');
  await ruler.focus();
  await page.keyboard.press('End');
  await settle(page, 300);
  const level = await calls(page);
  check(
    'the room’s ruler sets every light that is on, in one call',
    level.length === 1 &&
      level[0].s === 'light.turn_on' &&
      level[0].d?.brightness_pct === 100 &&
      ids(level[0]).sort().join() === 'light.lt_ceiling,light.lt_floor',
    JSON.stringify(level),
  );
  const chips = await read(card(page, 'Chips'));
  check(
    'chips: a light a chip with its name, the lit ones chosen',
    chips.chips.map((c) => `${c.label}:${c.on ? 'on' : 'off'}`).join('|') ===
      'Ceiling:on|Floor lamp:on|Reading lamp:off|Shelf:on',
    JSON.stringify(chips.chips),
  );
  await reset(page);
  await card(page, 'Chips').locator('.fv-chip').nth(1).click();
  await settle(page, 200);
  const chip = await calls(page);
  check(
    'a tap on a chip turns its light alone',
    chip.length === 1 && chip[0].s === 'light.turn_off' && ids(chip[0]).join() === 'light.lt_floor',
    JSON.stringify(chip),
  );
  await reset(page);
  await card(page, 'Chips')
    .locator('.fv-card__head .fv-switch, .fv-card__head [role="switch"]')
    .first()
    .click();
  await settle(page, 200);
  const all = await calls(page);
  check(
    'the head’s switch is the whole room',
    all.length === 1 && all[0].s === 'light.turn_off' && ids(all[0]).length === 4,
    JSON.stringify(all),
  );

  await reset(page);
  await card(page, 'A light unavailable', 1).locator('.fv-chip').nth(1).click({ force: true });
  await settle(page, 200);
  const unread = await card(page, 'A light unavailable', 1).evaluate((el) => {
    const chip = el.shadowRoot.querySelectorAll('.fv-chip')[1];
    return {
      unavailable: chip.classList.contains('is-unavailable'),
      aria: chip.getAttribute('aria-disabled'),
    };
  });
  check(
    'a chip of a light that cannot be read is the dashed ring and takes no tap',
    unread.unavailable && unread.aria === 'true' && (await calls(page)).length === 0,
    JSON.stringify(unread),
  );

  await page.close();
}

/* ---------- the words follow the language ---------- */
{
  const page = await suite.sheet('lights', { width: 360, lang: 'es' });
  await settle(page, 600);
  const living = await read(card(page, 'Living room'));
  const attic = await read(card(page, 'An area with no lights'));
  check(
    'in Spanish: "2 de 3 encendidas", "Aún no hay luces"',
    /^2 de 3/.test(living.sub) && attic.empty === 'Aún no hay luces',
    JSON.stringify([living.sub, attic.empty]),
  );
  await page.close();
}

/* ---------- the light card's colour (issue #32), on the `slider` sheet ---------- */
{
  const page = await suite.sheet('slider');
  const light = (title) => frame(page, title).locator('fluvy-light-card').first();
  const readLight = (title) =>
    light(title).evaluate((el) => {
      const root = el.shadowRoot;
      const article = root.querySelector('article');
      const rulers = [...root.querySelectorAll('fluvy-ruler')];
      return {
        rulers: rulers.length,
        tints: rulers.map((r) => r.tint ?? ''),
        swatches: [...root.querySelectorAll('.lc-swatch')].map((b) => ({
          label: b.getAttribute('aria-label'),
          active: b.classList.contains('is-active'),
          width: Math.round(b.getBoundingClientRect().width),
          height: Math.round(b.getBoundingClientRect().height),
          top: Math.round(b.getBoundingClientRect().top),
          left: Math.round(b.getBoundingClientRect().left),
        })),
        accent: article?.dataset.accent ?? '',
        picker: root.querySelector('.lc-swatch--picker input')?.value ?? '',
        icon: getComputedStyle(root.querySelector('.fv-card__head .fv-ico')).color,
        accentVar: getComputedStyle(article).getPropertyValue('--fluvy-accent').trim(),
        height: Math.round(article.getBoundingClientRect().height),
      };
    });
  // the colour controls arrive with their module: wait for the row
  await light('On').locator('.lc-swatch').first().waitFor({ timeout: 5000 });
  const white = await readLight('On');
  check(
    'a colour bulb in its white: the brightness and the temperature rulers, six quick colours (two whites first), the warm one checked at 3200 K',
    white.rulers === 2 &&
      white.tints[1] === 'warm-cool' &&
      white.swatches.length === 6 &&
      white.swatches.every((s) => s.width === 44 && s.height === 44) &&
      white.swatches[0].active &&
      white.accent === '',
    JSON.stringify(white),
  );
  const amber = await readLight('Colour · hs mode');
  check(
    'a bulb glowing a colour: the hue ruler takes the slot, the card wears the bulb’s colour (its icon in it), the orange swatch checked',
    amber.rulers === 2 &&
      amber.tints[1] === 'hue' &&
      amber.accent === '#ff9800' &&
      amber.swatches.find((s) => s.active)?.label === 'Orange' &&
      amber.accentVar !== '',
    JSON.stringify(amber),
  );
  const alone = await readLight('Colour · colours alone');
  check(
    'a bulb of colours alone: no whites among its quick colours, the hue ruler, the blue checked',
    alone.swatches.length === 6 &&
      alone.swatches.every((s) => !/warm|cool/i.test(s.label)) &&
      alone.tints[1] === 'hue' &&
      alone.swatches.find((s) => s.active)?.label === 'Blue',
    JSON.stringify(alone),
  );
  const custom = await readLight('Colour · custom swatches');
  check(
    'the house’s own quick colours, eight of them, in its order: words and hexes alike',
    custom.swatches.map((s) => s.label).join('|') ===
      'Warm|Cool|#ff2d55|Amber|Teal|Purple|Pink|Blue',
    JSON.stringify(custom.swatches.map((s) => s.label)),
  );
  // issue #37: names of your own on the rounds — a hex, a triplet and a Home Assistant colour named, a colour name
  // as words, a white, and the picker; the lamp's orange is none of them, so the picker is the one checked
  const named = await readLight('Colour · named custom');
  check(
    'the house’s own colours with names: each round says its name, a bare Home Assistant colour reads as words, and the picker holds the bulb’s colour',
    named.swatches.map((s) => s.label).join('|') ===
      'Lila|Teal|Honey|Deep purple|Warm|Colour picker' &&
      named.swatches.findIndex((s) => s.active) === 5 &&
      named.picker === '#ff9800',
    JSON.stringify(named.swatches.map((s) => [s.label, s.active])),
  );
  // any number, any mix, any order: twelve rounds wrap into two rows of six, 52 apart, the picker in the middle
  // checked; three make one short row from the left; the card's height follows the rows
  const twelve = await readLight('Colour · twelve');
  const three = await readLight('Colour · three');
  check(
    'twelve quick colours: two rows of six (the second 52 under the first), every round 44, the picker in the middle checked',
    twelve.swatches.length === 12 &&
      twelve.swatches.every((s) => s.width === 44 && s.height === 44) &&
      twelve.swatches.slice(0, 6).every((s) => s.top === twelve.swatches[0].top) &&
      twelve.swatches.slice(6).every((s) => s.top === twelve.swatches[0].top + 52) &&
      twelve.swatches[6].left === twelve.swatches[0].left &&
      twelve.swatches.findIndex((s) => s.active) === 5 &&
      twelve.swatches[5].label === 'Colour picker',
    JSON.stringify(twelve.swatches.map((s) => [s.label, s.top, s.left, s.active])),
  );
  check(
    'three quick colours: one short row from the left, 52 apart, the orange checked; the card a row (52) shorter than with twelve',
    three.swatches.length === 3 &&
      three.swatches.every((s) => s.top === three.swatches[0].top) &&
      three.swatches[1].left === three.swatches[0].left + 52 &&
      three.swatches[2].left === three.swatches[0].left + 104 &&
      three.swatches.find((s) => s.active)?.label === 'Orange' &&
      twelve.height - three.height === 52,
    JSON.stringify([
      three.swatches.map((s) => [s.label, s.top, s.left, s.active]),
      twelve.height,
      three.height,
    ]),
  );
  const hidden = await readLight('Colour hidden');
  const dimmer = await readLight('Off');
  check(
    'show_color off, and a bulb with no colour: no swatches, no hue ruler; the dimmer keeps its one ruler',
    hidden.swatches.length === 0 &&
      hidden.tints.join() === ',warm-cool' &&
      dimmer.swatches.length === 0 &&
      dimmer.rulers === 1,
    JSON.stringify([hidden, dimmer]),
  );
  // taps: a colour swatch sends rgb_color and is checked at once; a white sends the temperature; the ruler a hue
  await reset(page);
  await light('On').locator('.lc-swatch').nth(2).click();
  await settle(page, 200);
  const afterRed = await calls(page);
  const checkedNow = await readLight('On');
  check(
    'a tap on a colour swatch calls light.turn_on with its rgb_color once, and the check moves to it before the bulb answers',
    afterRed.length === 1 &&
      afterRed[0].s === 'light.turn_on' &&
      JSON.stringify(afterRed[0].d.rgb_color) === '[244,67,54]' &&
      checkedNow.swatches.find((s) => s.active)?.label === 'Red' &&
      checkedNow.tints[1] === 'hue',
    JSON.stringify([afterRed, checkedNow.swatches]),
  );
  await reset(page);
  await light('Colour · hs mode').locator('.lc-swatch').nth(1).click();
  await settle(page, 200);
  const afterCool = await calls(page);
  check(
    'a tap on a white swatch calls light.turn_on with its color_temp_kelvin, and the slot goes back to the temperature ruler',
    afterCool.length === 1 &&
      afterCool[0].d.color_temp_kelvin === 5000 &&
      (await readLight('Colour · hs mode')).tints[1] === 'warm-cool',
    JSON.stringify(afterCool),
  );
  await reset(page);
  const hueRuler = light('Colour · colours alone').locator('fluvy-ruler').nth(1);
  await hueRuler.evaluate((r) =>
    r.dispatchEvent(new CustomEvent('fluvy-change', { detail: { value: 120 } })),
  );
  await settle(page, 200);
  const afterHue = await calls(page);
  check(
    'the hue ruler’s release calls light.turn_on with hs_color at the bulb’s saturation (100 where it says none)',
    afterHue.length === 1 && JSON.stringify(afterHue[0].d.hs_color) === '[120,100]',
    JSON.stringify(afterHue),
  );
  await reset(page);
  const tempRuler = light('On').locator('fluvy-ruler').nth(1);
  await light('On').locator('.lc-swatch').nth(0).click(); // back to a white: the temperature ruler
  await settle(page, 200);
  await reset(page);
  await tempRuler.evaluate((r) =>
    r.dispatchEvent(new CustomEvent('fluvy-change', { detail: { value: 4000 } })),
  );
  await settle(page, 200);
  const afterKelvin = await calls(page);
  check(
    'the temperature ruler still sends color_temp_kelvin',
    afterKelvin.length === 1 && afterKelvin[0].d.color_temp_kelvin === 4000,
    JSON.stringify(afterKelvin),
  );
  const compact = await readLight('Compact by choice');
  check(
    'the compact layout on a colour bulb: no colour controls, the worn colour alone',
    compact.rulers === 1 && compact.swatches.length === 0 && compact.accent === '#ff9800',
    JSON.stringify(compact),
  );
  // the picker's round: last of the house's list, 44, named; it holds the lamp's orange (none of red, blue, purple)
  // and is checked, its input opening on that colour
  const withPicker = await readLight('Colour · with the picker');
  check(
    'the picker round holds the bulb’s colour, checked, when the bulb is on none of the other rounds',
    withPicker.swatches.length === 4 &&
      withPicker.swatches[3].label === 'Colour picker' &&
      withPicker.swatches[3].active &&
      withPicker.swatches[3].width === 44 &&
      withPicker.swatches[3].height === 44 &&
      !withPicker.swatches.slice(0, 3).some((s) => s.active) &&
      withPicker.picker === '#ff9800',
    JSON.stringify(withPicker.swatches.concat(withPicker.picker)),
  );
  await reset(page);
  const input = light('Colour · with the picker').locator('.lc-swatch--picker input');
  await input.evaluate((el) => {
    el.value = '#00ff00';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle(page, 600);
  const afterPicked = await calls(page);
  const pickedNow = await readLight('Colour · with the picker');
  check(
    'a colour chosen in the picker calls light.turn_on with its rgb_color once (input and change together), and the round takes it',
    afterPicked.length === 1 &&
      afterPicked[0].s === 'light.turn_on' &&
      JSON.stringify(afterPicked[0].d.rgb_color) === '[0,255,0]' &&
      pickedNow.swatches[3].active &&
      pickedNow.accent === '#00ff00',
    JSON.stringify([afterPicked, pickedNow.swatches[3], pickedNow.accent]),
  );
  await page.close();
}

await suite.finish();
