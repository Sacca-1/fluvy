#!/usr/bin/env node
/**
 * The room and the map, in a real Chromium against the playground. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-rooms.mjs
 * What it proves: a room's photo cross-fades in once decoded; its rows and its hero go to the room's path; a
 * compact tile inside it toggles before the mock answers; a room without a path shows no chevron; a missing
 * area says so; #39's rooms read what they hold — the sensors an area names even diagnostic, a thermostat alone,
 * the working sensor past a dead one, a sensor that comes late — and an empty one keeps its photo, its way in and,
 * for an administrator only, why it is empty; a room counts what is on once (its readout and its rows alike); at 211
 * a tile head gives its circle to a name that would be cut and the hint runs three lines at most, in every language;
 * the map's zones hold the right faces, a person nobody can place stands in Unknown, the rows say
 * the distance only for someone away with a fix, and Home Assistant's map, which the playground cannot make,
 * gives way to the zones silently.
 */
import { calls, frame, reset, settle, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const watchNavigation = (page) =>
  page.evaluate(() => {
    window.__navigations = [];
    window.addEventListener('location-changed', () =>
      window.__navigations.push(window.location.pathname),
    );
  });
const navigations = (page) => page.evaluate(() => window.__navigations.splice(0));

/* ---------- the room ---------- */
{
  const page = await suite.sheet('rooms');
  await watchNavigation(page);
  const photo = frame(page, 'Room · photo').locator('fluvy-room-card').first();
  await settle(page, 600);
  check(
    'the photo is on the hero, shown once decoded',
    (await photo.locator('.rm-hero .fv-plate__img.is-on').count()) === 1 &&
      (await photo.locator('.am-area__badge').textContent()).includes('Living room'),
  );
  check(
    'the readouts say the climate and what is on',
    (await photo.locator('.am-area__stats .fv-readout').count()) === 3,
  );
  const rows = photo.locator('.am-rows .fv-row');
  check('the category rows: lights, climate, media, every device', (await rows.count()) === 4);
  await rows.first().click();
  await settle(page, 200);
  let went = await navigations(page);
  check(
    'a row goes to the room',
    went.length === 1 && went[0] === '/fluvy-auto/room-rm_living',
    went.join(' '),
  );
  await photo.locator('.rm-hero').click();
  await settle(page, 200);
  went = await navigations(page);
  check('so does the hero', went.length === 1 && went[0] === '/fluvy-auto/room-rm_living');

  const tiles = frame(page, 'Room · tiles').locator('fluvy-room-card').first();
  check(
    'the controls as tiles: the lights first, four at most',
    (await tiles.locator('.rm-controls .fv-tile').count()) === 4,
  );
  await reset(page);
  await tiles.locator('.rm-controls .fv-tile').nth(1).click(); // the reading lamp, off
  await settle(page, 200);
  const sent = await calls(page);
  check(
    'a tile inside the room toggles at once and sends one call',
    sent.length === 1 &&
      sent[0].s === 'light.turn_on' &&
      (await tiles.locator('.rm-controls .fv-tile').nth(1).getAttribute('class')).includes('is-on'),
    JSON.stringify(sent.map((x) => x.s)),
  );

  const bare = frame(page, 'Room · no photo').locator('fluvy-room-card').first();
  check(
    'without a picture the hero is the gradient',
    (await bare.locator('.fv-plate__img').count()) === 0,
  );
  await bare.locator('.am-rows .fv-row').first().click();
  await settle(page, 200);
  went = await navigations(page);
  check(
    "without a path an admin's rows go to the area's settings",
    went.length === 1 && went[0] === '/config/areas/area/rm_kitchen',
    went.join(' '),
  );
  const empty = frame(page, 'Room · empty, missing').locator('fluvy-room-card');
  check(
    'an empty area says so; an area that is not there says that',
    (await empty.nth(0).locator('.fv-empty-state__text').textContent()).trim() ===
      'Nothing in this room yet' &&
      (await empty.nth(1).locator('.fv-empty').textContent()).trim() === 'Area not found',
  );

  /* #39: a room finds what is in it */
  const values = (card) =>
    card
      .locator('.am-area__stats .fv-readout__value')
      .allTextContents()
      .then((all) => all.map((text) => text.replace(/\s+/g, '')));
  const reported = frame(page, 'Room · four areas, two sensors each (#39)').locator(
    'fluvy-room-card',
  );
  const [garten, gaste, kuche] = await Promise.all([0, 1, 2].map((n) => values(reported.nth(n))));
  check(
    'the plain rooms read their two sensors, and the kitchen the diagnostic ones its area names',
    garten.join() === '16.4°C,92%' &&
      gaste.join() === '22.1°C,53%' &&
      kuche.join() === '21.3°C,48%',
    `${garten} | ${gaste} | ${kuche}`,
  );
  const living = reported.nth(3);
  check(
    'a room whose sensors are hidden keeps its photo and says it is empty',
    (await living.locator('.rm-hero').count()) === 1 &&
      (await living.locator('.fv-empty-state__text').textContent()).trim() ===
        'Nothing in this room yet',
  );
  const why = frame(page, 'Room · hidden sensors, why it is empty').locator('fluvy-room-card');
  const hint = (await why.nth(0).locator('.fv-empty-state__hint').textContent()).trim();
  check(
    'an administrator reads why, and where to choose its sensors',
    hint === '2 hidden or diagnostic entities · choose its sensors in the area’s settings',
    hint,
  );
  await why.nth(0).locator('.rm-hero').click();
  await settle(page, 200);
  went = await navigations(page);
  check(
    'the empty room still opens: its photo',
    went.length === 1 && went[0] === '/fluvy-auto/room-rm_wohnzimmer',
    went.join(' '),
  );
  await why.nth(1).locator('.fv-head__open').click();
  await settle(page, 200);
  went = await navigations(page);
  check(
    'and its chevron',
    went.length === 1 && went[0] === '/fluvy-auto/room-rm_wohnzimmer',
    went.join(' '),
  );
  const guest = frame(page, 'Room · hidden sensors, not an administrator').locator(
    'fluvy-room-card',
  );
  check(
    'someone who is not an administrator sees the panel without the hint',
    (await guest.locator('.fv-empty-state').count()) === 1 &&
      (await guest.locator('.fv-empty-state__hint').count()) === 0,
  );
  const store = frame(page, 'Room · registry without state').locator('fluvy-room-card');
  check(
    'entries without a state are neither shown nor counted',
    (await store.locator('.fv-empty-state').count()) === 1 &&
      (await store.locator('.fv-empty-state__hint').count()) === 0,
  );
  const alone = frame(page, 'Room · thermostat only').locator('fluvy-room-card');
  check(
    'a thermostat alone gives the room its readings, and is the one device on in its readout as in its rows',
    (await values(alone)).join() === '20.5°C,44%,1of1' &&
      (
        await alone.locator('.am-rows .fv-row').last().locator('.fv-row__sub').textContent()
      ).trim() === '1 of 1 on',
    (await values(alone)).join(),
  );
  check(
    'the working sensor is read when the first one is dead',
    (await values(frame(page, 'Room · unavailable first').locator('fluvy-room-card'))).join() ===
      '19.8°C',
  );
  const late = frame(page, 'Room · a sensor that arrives late').locator('fluvy-room-card');
  const before = await late.locator('.fv-empty-state').count();
  await page.evaluate(() =>
    window.fluvyMock.add([
      'sensor.rm_late_temperature',
      '19.6',
      { device_class: 'temperature', unit_of_measurement: '°C' },
    ]),
  );
  await settle(page, 300);
  check(
    'a sensor that comes late fills its room, with the same registries',
    before === 1 &&
      (await late.locator('.fv-empty-state').count()) === 0 &&
      (await values(late)).join() === '19.6°C',
    (await values(late)).join(),
  );
  await page.close();
}

/* ---------- the room at 211, every language: its tile head and its hint ---------- */
{
  const heads = [];
  const hints = [];
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt-BR', 'tr']) {
    const page = await suite.sheet('rooms', { width: 211, lang });
    const found = await page.evaluate(() =>
      [...document.querySelectorAll('fluvy-room-card')].map((card) => {
        const root = card.shadowRoot;
        const name = root.querySelector('.fv-card__head .fv-card__title');
        const hint = root.querySelector('.fv-empty-state__hint');
        return {
          frame: card.closest('[data-frame]').dataset.frame.split('/')[1],
          name: name?.textContent.trim(),
          cut: name ? name.scrollWidth > name.clientWidth + 0.5 : false,
          circle: Boolean(root.querySelector('.fv-card__head .fv-ico')),
          hint: hint?.textContent.trim(),
          lines: hint
            ? Math.round(
                hint.getBoundingClientRect().height / parseFloat(getComputedStyle(hint).lineHeight),
              )
            : 0,
        };
      }),
    );
    for (const card of found) {
      // a name cut beside its circle: the circle had to give way first
      if (card.cut && card.circle) heads.push(`${lang} "${card.name}" cut beside its circle`);
      if (card.hint !== undefined && (card.lines > 3 || !/^2 /.test(card.hint)))
        hints.push(`${lang} ${card.lines} lines: "${card.hint}"`);
    }
    if (lang === 'en' || lang === 'de')
      for (const name of ['Living room', 'Wohnzimmer', 'Storeroom'])
        if (!found.some((card) => card.name === name && !card.cut && !card.circle))
          heads.push(`${lang} "${name}" not whole without its circle`);
    await page.close();
  }
  check(
    'at 211 a tile head gives its circle to a name that would be cut: "Living room", "Wohnzimmer", "Storeroom" whole',
    heads.length === 0,
    heads.slice(0, 6).join(' · '),
  );
  check(
    'at 211 an administrator’s hint keeps its why in three lines at most, in eight languages',
    hints.length === 0,
    hints.slice(0, 6).join(' · '),
  );
}

/* ---------- the map ---------- */
{
  const page = await suite.sheet('ambient');
  const zones = frame(page, 'Map · zones').locator('fluvy-map-card').first();
  const labels = await zones.locator('.mp-zone__label').allTextContents();
  const faces = await zones
    .locator('.mp-zone')
    .evaluateAll((columns) =>
      columns.map((column) => column.querySelectorAll('.mp-face:not(.mp-more)').length),
    );
  check(
    'the zones as columns: home, the zone Ona is in, away, and unknown for Noa — two faces at home, one elsewhere',
    labels.map((l) => l.trim().toLowerCase()).join(',') === 'home,school,away,unknown' &&
      faces.join(',') === '2,1,1,1' &&
      (await zones.locator('.mp-more').count()) === 0,
    `${labels.join(',')} · ${faces.join(',')}`,
  );
  const rows = frame(page, 'Map · rows').locator('fluvy-map-card').first();
  const words = await rows.locator('.fv-row__value').allTextContents();
  check(
    'the rows say where each person is, and how far only for someone away with a fix',
    words.length === 5 &&
      words[0].trim() === 'Home' &&
      words[1].trim() === 'School' &&
      /^Away · \d+(\.\d)? km$/.test(words[2].trim()) &&
      words[3].trim() === 'Unknown' &&
      words[4].trim() === 'Unknown',
    words.join(' | '),
  );
  const map = frame(page, 'Map · map').locator('fluvy-map-card').first();
  await settle(page, 400);
  check(
    "Home Assistant's map cannot be made here: the zones stand in, silently",
    (await map.locator('.mp-zones').count()) === 1 &&
      (await map.locator('.mp-plate').count()) === 0,
  );
  const chosen = frame(page, 'Map · chosen zones, empty ones kept')
    .locator('fluvy-map-card')
    .first();
  const chosenLabels = await chosen.locator('.mp-zone__label').allTextContents();
  check(
    'the zones asked for, in that order and by the names given, the empty one kept',
    chosenLabels.map((l) => l.trim().toLowerCase()).join(',') === 'home,office,school',
    chosenLabels.join(','),
  );
  await page.close();
}

await suite.finish();
