#!/usr/bin/env node
/**
 * The batteries and the car charger, 1.4, on the playground's `storage` sheet (real cards, simulated hass). Exit
 * code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5185/ node interactions-storage.mjs
 * What it proves: the group's state of charge is weighted by capacity, "full in" and "empty in" are counted at the
 * power of now (to the reserve), the badge follows the net and says when a battery cannot be read, a charge that
 * cannot be read is "—" with the ruler asleep, the Energy dashboard's batteries are read, the reserve and the target
 * are marked on their rulers; the car's badge is its power while it charges and says when it powers the house, its
 * readouts are what is configured, the target and the time come from numbers or entities; a mode is chosen from its
 * tiles or chips through `select_option`; readings change live; taps open more-info; the words follow the language.
 */
import { calls, frame, moreInfo, reset, settle, startSuite, tapHead } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const batteries = (page, title, n = 0) => frame(page, title).locator('fluvy-batteries-card').nth(n);
const charger = (page, title, n = 0) => frame(page, title).locator('fluvy-ev-charger-card').nth(n);

/** What a card says: its head, its readouts, its rows, its ruler's labels and mark, its modes. */
const read = (card) =>
  card.evaluate((c) => {
    const root = c.shadowRoot;
    const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const gauge = root.querySelector('.ef-gauge');
    const ruler = root.querySelector('fluvy-ruler');
    return {
      title: t(root.querySelector('.fv-card__title')),
      sub: t(root.querySelector('.fv-card__sub')),
      badge: t(root.querySelector('.fv-card__head .fv-badge')),
      // a readout's figure and its units are spans side by side: "64" + "%" reads "64 %", "2" + "h" + " 10" + "min" "2 h 10 min"
      readouts: [...root.querySelectorAll('.fv-readout')].map((r) =>
        t(r).replace(/(\d)([^\d\s.,:])/g, '$1 $2'),
      ),
      rows: [...root.querySelectorAll('.ef-rows .fv-row')].map((r) => ({
        title: t(r.querySelector('.fv-row__title')),
        sub: t(r.querySelector('.fv-row__sub')),
        value: t(r.querySelector('.fv-row__value')),
        off: Boolean(r.querySelector('.fv-ico--off')),
      })),
      labels: [...root.querySelectorAll('.en-mark-label')].map((l) => t(l)),
      mark: gauge?.classList.contains('en-mark') ? gauge.style.getPropertyValue('--at') : null,
      ruler: ruler ? { value: ruler.value, inactive: ruler.inactive, marker: ruler.marker } : null,
      tiles: [...root.querySelectorAll('.fv-option')].map((o) => ({
        label: t(o.querySelector('.fv-option__label')),
        value: t(o.querySelector('.fv-option__value')),
        active: o.classList.contains('is-active'),
      })),
      chips: [...root.querySelectorAll('.fv-chip')].map((o) => ({
        label: t(o),
        active: o.classList.contains('is-active'),
      })),
      empty: t(root.querySelector('.fv-empty, .fv-empty-state')),
    };
  });

/* ---------- batteries ---------- */
{
  const page = await suite.sheet('storage', { width: 360 });

  const two = await read(batteries(page, 'Batteries'));
  check(
    'two batteries: one state of charge weighted by capacity, full in 2 h 10 min at 3.3 kW',
    two.title === 'Batteries' &&
      two.sub === '2 batteries · 20 kWh' &&
      two.badge === 'Charging' &&
      two.readouts[0] === 'State of charge 64 %' &&
      two.readouts[1] === 'Full in 2 h 10 min',
    JSON.stringify([two.sub, two.badge, two.readouts]),
  );
  check(
    'two batteries: a row each, its charge as the figure and the bar, its capacity and power in words',
    two.rows.length === 2 &&
      two.rows[0].title === 'Garage' &&
      two.rows[0].value === '72 %' &&
      two.rows[0].sub === '10 kWh · charging 2.2 kW' &&
      two.rows[1].sub === '10 kWh · charging 1.1 kW',
    JSON.stringify(two.rows),
  );
  check(
    'the ruler: a read-only marker at the charge, the reserve marked at 20 % with its word',
    two.ruler?.marker === true &&
      two.ruler.value === 64 &&
      two.mark === '64px' &&
      two.labels.join('|') === '0|Reserve|50|100',
    JSON.stringify([two.ruler, two.mark, two.labels]),
  );

  const one = await read(batteries(page, 'One battery'));
  check(
    'one battery: named "Battery", no rows, empty in counted down to the reserve',
    one.title === 'Battery' &&
      one.rows.length === 0 &&
      one.badge === 'Discharging' &&
      one.sub === '13.5 kWh · 1.2 kW' &&
      one.readouts[1] === 'Empty in 6 h 52 min',
    JSON.stringify(one),
  );

  const dash = await read(batteries(page, 'From the Energy dashboard'));
  check(
    'no batteries given: the Energy dashboard’s, their charge weighted by their capacity',
    dash.sub === '2 batteries · 18.5 kWh' &&
      dash.readouts[0] === 'State of charge 54 %' &&
      dash.rows.map((r) => r.title).join('|') === 'Powerwall|Garage battery',
    JSON.stringify(dash),
  );

  const mix = await read(batteries(page, 'Charging and discharging at once'));
  check(
    'one charging while the other discharges: the badge says the net, and no time (the group never fills)',
    mix.badge === 'Charging' &&
      mix.rows[1].sub === '5 kWh · discharging 500 W' &&
      mix.readouts[0] === 'State of charge 62 %' &&
      mix.readouts.length === 1,
    JSON.stringify(mix),
  );

  const plain = await read(batteries(page, 'No capacity'));
  check(
    'no capacity: the group’s charge is not guessed (a mean would assume them equal), no total, no time',
    plain.readouts.length === 1 &&
      plain.readouts[0] === 'State of charge —' &&
      plain.ruler?.inactive === true &&
      plain.sub === '2 batteries',
    JSON.stringify(plain),
  );

  const down = await read(batteries(page, 'A power unavailable'));
  // 1.9 (the owner's rule): the time keeps its place beside the charge, "—" in it
  check(
    'a power that cannot be read: the badge says so, its row too, and no time is guessed',
    down.badge === 'Unavailable' &&
      down.rows[0].sub === '10 kWh · unavailable' &&
      down.readouts.length === 2 &&
      down.readouts[1] === 'Full in —',
    JSON.stringify(down),
  );

  const blind = await read(batteries(page, 'The charge unavailable'));
  check(
    'a charge that cannot be read: "—", the ruler asleep, the reserve still marked',
    blind.readouts[0] === 'State of charge —' &&
      blind.ruler?.inactive === true &&
      blind.mark === '64px' &&
      blind.readouts[1] === 'Full in —',
    JSON.stringify(blind),
  );

  const gone = await read(batteries(page, 'A missing sensor'));
  check(
    'a missing sensor: its row says "—" and "Unavailable", and the group’s charge is not guessed',
    gone.rows[2]?.value === '—' &&
      gone.rows[2]?.sub?.startsWith('Unavailable') &&
      gone.rows[2]?.off === true &&
      gone.readouts[0] === 'State of charge —',
    JSON.stringify(gone),
  );

  // live: the garage turns to discharging while the basement still charges — the net discharges, and no time is
  // given (the group never empties at these powers); then the basement discharges too
  await page.evaluate(() => {
    window.fluvyMock.set('sensor.st_garage', '1500');
  });
  await settle(page);
  const live = await read(batteries(page, 'Batteries'));
  await page.evaluate(() => {
    window.fluvyMock.set('sensor.st_basement', '0.5');
  });
  await settle(page);
  const both = await read(batteries(page, 'Batteries'));
  check(
    'a reading that changes is drawn at once: the net discharges; a time only once both go the same way',
    live.badge === 'Discharging' &&
      live.rows[0].sub === '10 kWh · discharging 1.5 kW' &&
      live.readouts.length === 1 &&
      both.rows[1].sub === '10 kWh · discharging 0.5 kW' &&
      both.readouts[1] === 'Empty in 4 h 24 min',
    JSON.stringify([live.badge, live.rows[0], live.readouts, both.rows[1], both.readouts]),
  );

  // a row opens its charge's more-info; the head opens the first battery's
  await reset(page);
  await batteries(page, 'Batteries').locator('.ef-rows .fv-row').nth(1).click();
  await tapHead(batteries(page, 'Batteries'), 'icon');
  await settle(page, 200);
  check(
    'a row opens its battery’s charge, the head the first battery',
    JSON.stringify(await moreInfo(page)) ===
      JSON.stringify(['sensor.st_basement_level', 'sensor.st_garage_level']),
    JSON.stringify(await moreInfo(page)),
  );

  // the mode: three chips, the chosen one lit; a tap chooses through select_option
  const mode = await read(batteries(page, 'Its mode'));
  check(
    'the batteries’ mode as a chip row, the chosen one lit',
    mode.chips.map((c) => c.label).join('|') === 'Self use|Backup|Force charge' &&
      mode.chips[0].active,
    JSON.stringify(mode.chips),
  );
  await reset(page);
  await batteries(page, 'Its mode').locator('.fv-chip', { hasText: 'Backup' }).click();
  await settle(page);
  const chosen = await calls(page);
  const after = await read(batteries(page, 'Its mode'));
  check(
    'a mode chip calls select.select_option and lights at once',
    chosen.length === 1 &&
      chosen[0].s === 'select.select_option' &&
      chosen[0].d.option === 'backup' &&
      chosen[0].t.entity_id === 'select.st_battery_mode' &&
      after.chips[1].active,
    JSON.stringify([chosen, after.chips]),
  );
  await reset(page);
  await batteries(page, 'Four programs').locator('.fv-chip', { hasText: 'Time of use' }).click();
  await settle(page);
  const program = await calls(page);
  check(
    'an input_select is chosen through input_select.select_option',
    program.length === 1 &&
      program[0].s === 'input_select.select_option' &&
      program[0].d.option === 'Time of use',
    JSON.stringify(program),
  );
  await page.close();
}

/* ---------- the car charger ---------- */
{
  const page = await suite.sheet('storage', { width: 360 });

  const car = await read(charger(page, 'Car charger'));
  check(
    'the wallbox: its power as the badge, the status and the car as the sub',
    car.title === 'Wallbox' && car.badge === '7.4 kW' && car.sub === 'Charging · Model 3',
    JSON.stringify([car.title, car.badge, car.sub]),
  );
  check(
    'the car’s charge, and 80 % by 07:00 beside it; the target marked at 80 % with its word',
    car.readouts[0] === 'Car 64 %' &&
      car.readouts[1] === '80 % by 07:00' &&
      car.mark === '256px' &&
      car.labels.join('|') === '0|50|Target|100',
    JSON.stringify([car.readouts, car.mark, car.labels]),
  );
  check(
    'what the session added, for how long it has charged, how much came from the sun',
    car.readouts.slice(2).join('|') === 'Added 12.4 kWh|For 2 h 03 min|From the sun 96 %',
    JSON.stringify(car.readouts),
  );
  check(
    'the mode as tiles with their glyph and meaning, the sun lit',
    car.tiles.map((t) => `${t.label}/${t.value}`).join('|') ===
      'Off/Paused|Solar/Surplus|Fast/Full power' && car.tiles[1].active,
    JSON.stringify(car.tiles),
  );
  await reset(page);
  await charger(page, 'Car charger').locator('.fv-option', { hasText: 'Fast' }).click();
  await settle(page);
  const fast = await calls(page);
  const lit = await read(charger(page, 'Car charger'));
  check(
    'a mode tile calls select.select_option and lights at once',
    fast.length === 1 &&
      fast[0].s === 'select.select_option' &&
      fast[0].d.option === 'fast' &&
      fast[0].t.entity_id === 'select.st_wallbox_mode' &&
      lit.tiles[2].active,
    JSON.stringify([fast, lit.tiles]),
  );

  const v2h = await read(charger(page, 'The car powers the house'));
  check(
    'a car feeding the house: the badge is its power in the car’s colour, the sub says the way',
    /kW$/.test(v2h.badge) && v2h.sub.startsWith('Discharging'),
    JSON.stringify(v2h),
  );

  const waiting = await read(charger(page, 'Plugged in, waiting'));
  check(
    'plugged in, not charging: no badge, no "for", the target and the time still there',
    waiting.badge === '' &&
      waiting.sub === 'Connected · ID.4' &&
      waiting.readouts.length === 2 &&
      waiting.readouts[1] === '80 % by 07:30',
    JSON.stringify(waiting),
  );

  const ent = await read(charger(page, 'The target and the time from entities'));
  check(
    'the target from a number entity and the time from a timestamp; four modes worded, a mixed one its name on the value’s line',
    /^90 % by \d\d:\d\d$/.test(ent.readouts[1] ?? '') &&
      ent.mark === '288px' &&
      ent.labels.join('|') === '0|50|Target' &&
      ent.tiles.map((t) => `${t.label}/${t.value}`).join('|') ===
        'Off/Paused|PV/Surplus|/Min PV|Now/Full power' &&
      ent.tiles[1].active,
    JSON.stringify(ent),
  );

  const bare = await read(charger(page, 'Just the power'));
  check(
    'just the power: it is the figure, and the badge does not repeat it',
    bare.readouts.join('|') === 'Power 7.4 kW' && bare.badge === '' && bare.ruler === null,
    JSON.stringify(bare),
  );

  const dead = await read(charger(page, 'The charger unavailable'));
  check(
    'a charger that cannot be read says so; the car’s charge is still drawn',
    dead.badge === 'Unavailable' && dead.readouts[0] === 'Car 77 %',
    JSON.stringify(dead),
  );

  const dark = await read(charger(page, 'The car’s charge unavailable'));
  check(
    'a car whose charge cannot be read: "—", the ruler asleep, the target still marked',
    dark.readouts[0] === 'Car —' && dark.ruler?.inactive === true && dark.mark === '256px',
    JSON.stringify(dark),
  );

  const missing = [
    await read(charger(page, 'A missing charger', 0)),
    await read(charger(page, 'A missing charger', 1)),
  ];
  // 1.9 (the owner's rule): a charger that is not there keeps the card, its badge saying so
  check(
    'a charger that is not there is the card with its badge saying so; none configured, the empty card says which',
    missing[0].empty === '' &&
      missing[0].title === 'Car charger' &&
      missing[0].badge === 'Entity not found' &&
      missing[0].readouts.join('|') === 'Power —' &&
      missing[1].empty === 'Choose an entity',
    JSON.stringify(missing),
  );

  // live: the car turns to feed the house, then charges faster
  await page.evaluate(() => window.fluvyMock.set('sensor.st_wallbox', '-3.0'));
  await settle(page);
  const feeding = await read(charger(page, 'Car charger'));
  await page.evaluate(() => window.fluvyMock.set('sensor.st_wallbox', '11'));
  await settle(page);
  const faster = await read(charger(page, 'Car charger'));
  check(
    'a reading that changes is drawn at once: V2H, then 11 kW',
    /kW$/.test(feeding.badge) && faster.badge === '11.0 kW',
    `${feeding.badge} → ${faster.badge}`,
  );

  await reset(page);
  await tapHead(charger(page, 'Car charger'), 'icon');
  await settle(page, 200);
  check(
    'the head opens the charger’s more-info',
    JSON.stringify(await moreInfo(page)) === JSON.stringify(['sensor.st_wallbox']),
    JSON.stringify(await moreInfo(page)),
  );
  // half a column: the modes are chips, the chosen one in the mode's own tone, as its tile is
  const toneOf = (el) =>
    [...el.classList]
      .find((c) => c.startsWith('fv-tone--') || c.startsWith('fv-option--'))
      ?.replace(/^fv-(tone|option)--/, '');
  const tile = await charger(page, 'Car charger').evaluate((c, f) => {
    const el = c.shadowRoot.querySelector('.fv-option.is-active');
    return el ? new Function(`return (${f})`)()(el) : null;
  }, toneOf.toString());
  const halfChip = await charger(page, 'The car · half a column').evaluate((c, f) => {
    const el = c.shadowRoot.querySelector('.fv-chip.is-active');
    return el ? new Function(`return (${f})`)()(el) : null;
  }, toneOf.toString());
  // paused: the chosen "Off" chip is a raised plate, never the page fill an unchosen chip has
  const paused = await charger(page, 'The car · paused, half a column').evaluate((c) => {
    const pill = (sel) => {
      const el = c.shadowRoot.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      chosen: pill('.fv-chip.is-active .fv-chip__pill'),
      other: pill('.fv-chip:not(.is-active) .fv-chip__pill'),
    };
  });
  check(
    'paused, half a column: the chosen Off chip stands apart from the others',
    paused.chosen !== null && paused.other !== null && paused.chosen !== paused.other,
    JSON.stringify(paused),
  );
  check(
    'half a column: the chosen mode is a chip in the tone its tile takes',
    typeof tile === 'string' && halfChip === tile,
    JSON.stringify({ tile, halfChip }),
  );
  await page.close();
}

/* ---------- the words follow the language ---------- */
{
  const page = await suite.sheet('storage', { width: 360, lang: 'de' });
  await settle(page, 600);
  const two = await read(batteries(page, 'Batteries'));
  const car = await read(charger(page, 'Car charger'));
  check(
    'in German: Ladezustand, Voll in, Reserve; 80 % bis 07:00, Geladen, Von der Sonne',
    two.title === 'Batterien' &&
      two.readouts[0] === 'Ladezustand 64 %' &&
      two.readouts[1] === 'Voll in 2 h 10 min' &&
      two.rows[0].sub === '10 kWh · lädt 2,2 kW' &&
      car.readouts[1] === '80 % bis 07:00' &&
      car.readouts[2] === 'Geladen 12,4 kWh' &&
      car.readouts[4] === 'Von der Sonne 96 %' &&
      car.tiles[0].value === 'Pausiert',
    JSON.stringify([two.title, two.readouts, two.rows[0], car.readouts, car.tiles[0]]),
  );
  await page.close();
  const tr = await suite.sheet('storage', { width: 360, lang: 'tr' });
  await settle(tr, 600);
  const turkish = await read(charger(tr, 'Car charger'));
  check(
    'in Turkish the percent sign comes first: %80 hazır',
    turkish.readouts[1] === '%80 hazır 07:00',
    JSON.stringify(turkish.readouts),
  );
  await tr.close();
}

await suite.finish();
