#!/usr/bin/env node
/**
 * Colour per card, in a real Chromium against the playground's `colours` sheet. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-colours.mjs
 * What it proves: a card's `color` becomes its accent — six charts in six colours, each line the computed accent
 * of its own card, all distinct, each at least 3:1 on the card; a card without a colour keeps the palette's; a red
 * card's lit light turns red (the accent's twin) while its fan keeps its tone and its off light stays quiet; the
 * colours are derived again in dark mode and on another palette; a page without the theme derives on Linen, as
 * the theme would; a warning of the house's own (fluvy's settings → Status colours) is the warning on a reminder's
 * words and an alert's glyph, legible, the other statuses the palette's.
 */
import { contrastRatio, toHex } from './lib/colour.mjs';
import { frame, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

/** A computed custom property on the first child of a card's shadow root (where a card's colour is written). */
const varOf = (card, name) =>
  card.evaluate((el, prop) => {
    const inner = el.shadowRoot?.firstElementChild;
    return inner ? getComputedStyle(inner).getPropertyValue(prop).trim() : '';
  }, name);
const styleOf = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);

/* ---------- six charts, six colours ---------- */
{
  const page = await suite.sheet('colours', { width: 412 });
  const cards = frame(page, 'Six colours').locator('fluvy-sensor-card');
  check('six sensor cards', (await cards.count()) === 6);
  const accents = [];
  for (let i = 0; i < 6; i += 1) {
    const card = cards.nth(i);
    const accent = toHex(await varOf(card, '--fluvy-accent'));
    const surface = toHex(await varOf(card, '--fluvy-card'));
    const line = toHex(await styleOf(card.locator('.curve-line').first(), 'stroke'));
    const dot = toHex(await styleOf(card.locator('.curve-dot').first(), 'fill'));
    const ico = toHex(await styleOf(card.locator('.fv-ico').first(), 'color'));
    check(`chart ${i + 1}: the line is the card's accent`, line === accent, `${line} vs ${accent}`);
    check(
      `chart ${i + 1}: the dot and the icon circle too`,
      dot === accent && ico === accent,
      `${dot} ${ico}`,
    );
    check(
      `chart ${i + 1}: readable on the card (≥ 3:1)`,
      accent && surface && contrastRatio(accent, surface) >= 3,
      `${accent} on ${surface}: ${accent && surface ? contrastRatio(accent, surface).toFixed(2) : '?'}`,
    );
    accents.push(accent);
  }
  check('six different accents', new Set(accents).size === 6, accents.join(' '));
  const plain = frame(page, 'No colour').locator('fluvy-sensor-card');
  const palette = toHex(await varOf(plain, '--fluvy-accent'));
  const pageAccent = toHex(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--fluvy-accent'),
    ),
  );
  check(
    'a card without a colour keeps the palette’s accent',
    palette === pageAccent,
    `${palette} vs ${pageAccent}`,
  );
  check(
    'the coloured cards differ from it',
    accents.every((a) => a !== palette),
  );
  // the card reads which palette it wears from the page
  check(
    'the page says which palette it wears',
    (await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--fluvy-palette').trim(),
    )) === 'linen',
  );
  await page.close();
}

/* ---------- the light card's quick colours read on every palette (issue #32) ---------- */
for (const mode of ['linen', 'dark', 'volt']) {
  const page = await suite.sheet('slider', {
    extra: mode === 'linen' ? '' : mode === 'dark' ? '&mode=dark' : '&palette=volt',
  });
  const card = frame(page, 'Colour · hs mode').locator('fluvy-light-card');
  await card.locator('.lc-swatch').first().waitFor({ timeout: 5000 });
  const surface = toHex(await varOf(card, '--fluvy-card'));
  // a mixed colour computes as `color(srgb …)`: painted on a canvas and read back as what it is
  const swatches = await card.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const hex = (css) => {
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    };
    return [...el.shadowRoot.querySelectorAll('.lc-swatch')].map((b) => {
      const style = getComputedStyle(b);
      return {
        fill: hex(style.backgroundColor),
        edge: hex(style.borderTopColor),
        ink: hex(style.color),
        active: b.classList.contains('is-active'),
      };
    });
  });
  check(
    `${mode}: every quick colour's edge stands off the card (≥ 1.2) and the check reads on its swatch (≥ 3)`,
    swatches.every((s) => contrastRatio(toHex(s.edge), surface) >= 1.2) &&
      swatches
        .filter((s) => s.active)
        .every((s) => contrastRatio(toHex(s.ink), toHex(s.fill)) >= 3),
    JSON.stringify(
      swatches.map((s) => [
        contrastRatio(toHex(s.edge), surface).toFixed(2),
        s.active ? contrastRatio(toHex(s.ink), toHex(s.fill)).toFixed(2) : '',
      ]),
    ),
  );
  await page.close();
}

/* ---------- a colour for the whole card (issue #34) ---------- */
for (const mode of ['linen', 'dark', 'volt']) {
  const page = await suite.sheet('colours', {
    extra: mode === 'linen' ? '' : mode === 'dark' ? '&mode=dark' : '&palette=volt',
  });
  const tinted = frame(page, 'Colour per card').locator('fluvy-tiles-card').first();
  const chart = frame(page, 'Colour per card').locator('fluvy-sensor-card');
  const plain = frame(page, 'Colour per card').locator('fluvy-tiles-card').nth(1);
  const surface = toHex(await varOf(tinted, '--fluvy-card'));
  const plainSurface = toHex(await varOf(plain, '--fluvy-card'));
  // a tiles card's surface is its tiles: an off tile is painted with the wash; the chart card paints its article
  const painted = toHex(
    await styleOf(tinted.locator('.fv-tile:not(.is-on)').first(), 'backgroundColor'),
  );
  const chartPainted = toHex(await styleOf(chart.locator('.fv-card'), 'backgroundColor'));
  const edge = toHex(await varOf(tinted, '--fluvy-border'));
  const plainEdge = toHex(await varOf(plain, '--fluvy-border'));
  const title = toHex(await styleOf(chart.locator('.fv-card__title').first(), 'color'));
  check(
    `${mode}: the card's fill is a wash of its colour, and the card is painted with it`,
    surface !== plainSurface &&
      painted === surface &&
      chartPainted === toHex(await varOf(chart, '--fluvy-card')),
    `${surface} vs ${plainSurface}, painted ${painted}, chart ${chartPainted}`,
  );
  check(
    `${mode}: the card's edge is the colour's hairline, a plain card keeps the palette's`,
    edge !== plainEdge,
    `${edge} vs ${plainEdge}`,
  );
  const accent = toHex(await varOf(chart, '--fluvy-accent'));
  const chartSurface = toHex(await varOf(chart, '--fluvy-card'));
  check(
    `${mode}: the title reads on the wash at 4.5 or more`,
    contrastRatio(title, chartSurface) >= 4.5,
    `${title} on ${chartSurface}: ${contrastRatio(title, chartSurface).toFixed(2)}`,
  );
  const line = toHex(await styleOf(chart.locator('.curve-line').first(), 'stroke'));
  check(
    `${mode}: the surface and the accent are two choices: a blue card draws its teal line`,
    chartSurface !== plainSurface && line === accent && accent !== surface,
    `${line} on ${chartSurface}`,
  );
  const inner = frame(page, 'Colour per card · tiles inside').locator('fluvy-tiles-card');
  const innerSurface = toHex(await varOf(inner, '--fluvy-card'));
  const lit = toHex(await styleOf(inner.locator('.fv-tile.is-on').first(), 'backgroundColor'));
  const rest = toHex(await styleOf(inner.locator('.fv-tile.is-tinted').first(), 'backgroundColor'));
  check(
    `${mode}: inside, a lit tile keeps its full fill and a tinted one its own rest wash, neither the card's wash`,
    lit !== innerSurface && rest !== innerSurface && lit !== rest,
    `lit ${lit}, rest ${rest}, wash ${innerSurface}`,
  );
  const gone = frame(page, 'Colour per card · unavailable').locator('fluvy-light-card');
  const goneSkin = toHex(await styleOf(gone.locator('.fv-card'), 'backgroundColor'));
  check(
    `${mode}: an unavailable card keeps the neutral skin`,
    goneSkin === toHex(await varOf(plain, '--fluvy-page')) || goneSkin === plainSurface,
    `${goneSkin}`,
  );
  await page.close();
}

/* ---------- a red card: the lit light turns red, the fan keeps its tone ---------- */
{
  const page = await suite.sheet('colours');
  const red = frame(page, 'Red tiles').locator('fluvy-tiles-card');
  const plain = frame(page, 'Plain tiles').locator('fluvy-tiles-card');
  const lightFill = toHex(await varOf(red, '--fluvy-state-light-active-fill'));
  const plainLightFill = toHex(await varOf(plain, '--fluvy-state-light-active-fill'));
  const redLamp = red.locator('.fv-tile--light.is-on').first();
  const plainLamp = plain.locator('.fv-tile--light.is-on').first();
  check(
    'the red card’s lit light fills with its own colour',
    toHex(await styleOf(redLamp, 'backgroundColor')) === lightFill && lightFill !== plainLightFill,
    `${lightFill} vs ${plainLightFill}`,
  );
  check(
    'the plain card’s lit light keeps the palette’s',
    toHex(await styleOf(plainLamp, 'backgroundColor')) === plainLightFill,
  );
  const redFan = red.locator('.fv-tile--fan.is-on').first();
  const plainFan = plain.locator('.fv-tile--fan.is-on').first();
  const fanFill = toHex(await styleOf(redFan, 'backgroundColor'));
  check(
    'a fan that is on has a fill of its own tone',
    fanFill !== null && fanFill !== toHex(await varOf(red, '--fluvy-card')),
    `${fanFill}`,
  );
  check(
    'the fan’s tone is not the card’s colour',
    fanFill === toHex(await styleOf(plainFan, 'backgroundColor')) && fanFill !== lightFill,
  );
  const off = red.locator('.fv-tile--light:not(.is-on)').first();
  check('an off light stays quiet', toHex(await styleOf(off, 'backgroundColor')) !== lightFill);
  await page.close();
}

/* ---------- a tile's own colour ---------- */
{
  const page = await suite.sheet('colours');
  const group = frame(page, 'Tiles with their own colours').locator('fluvy-tiles-card');
  const coloured = group.locator('[data-accent]');
  check('a tile with a colour carries it as data-accent', (await coloured.count()) === 2);
  // a colour without a tone is the accent: the coloured lamp and speaker are accent tiles in their own colours
  const lamp = coloured.nth(0);
  const speaker = coloured.nth(1);
  const ownFill = (tile) =>
    tile.evaluate((el) => getComputedStyle(el).getPropertyValue('--fluvy-accent-fill').trim());
  const groupFill = toHex(await varOf(group, '--fluvy-accent-fill'));
  for (const [name, tile] of [
    ['lamp', lamp],
    ['speaker', speaker],
  ]) {
    const fill = toHex(await styleOf(tile, 'backgroundColor'));
    check(
      `the ${name} is drawn in its own colour (an accent tile, filled with its own accent fill)`,
      (await tile.evaluate(
        (el) => el.classList.contains('fv-tile--accent') && el.classList.contains('is-on'),
      )) &&
        fill === toHex(await ownFill(tile)) &&
        fill !== groupFill,
      `${fill} vs group ${groupFill}`,
    );
  }
  check('the two colours differ', (await ownFill(lamp)) !== (await ownFill(speaker)));
  const fan = group.locator('.fv-tile--fan.is-on').first();
  check(
    'the fan keeps its tone',
    toHex(await styleOf(fan, 'backgroundColor')) ===
      toHex(await varOf(group, '--fluvy-state-climate-fan-fill')),
  );
  await page.close();
}

/* ---------- a status under a colour ---------- */
{
  const page = await suite.sheet('colours');
  const tile = await frame(page, 'A status under a colour')
    .locator('fluvy-tiles-card .fv-tile')
    .first()
    .evaluate((el) => [...el.classList].filter((c) => /^fv-tile--|^is-/.test(c)));
  const rows = await frame(page, 'A status under a colour')
    .locator('fluvy-entities-card .fv-row .fv-ico')
    .evaluateAll((els) => els.map((el) => [...el.classList].find((c) => /^fv-ico--/.test(c))));
  check(
    'an open window stays the warning’s under a colour (tile and row); a tone asked for by name is honoured',
    tile.includes('fv-tile--warning') &&
      tile.includes('is-on') &&
      rows[0] === 'fv-ico--warning' &&
      rows[1] === 'fv-ico--accent',
    JSON.stringify({ tile, rows }),
  );
  await page.close();
}

/* ---------- derived again: dark mode, another palette, no theme ---------- */
{
  const light = await suite.sheet('colours', { width: 412 });
  const dark = await suite.sheet('colours', { width: 412, extra: '&mode=dark' });
  const volt = await suite.sheet('colours', { width: 412, extra: '&palette=volt' });
  // a dashboard that does not wear the look: the cards' own tokens are the house's (Volt here), the page has none
  const off = await suite.sheet('colours', { width: 412, extra: '&theme=off&fallback=volt' });
  const first = (page) => frame(page, 'Six colours').locator('fluvy-sensor-card').first();
  const on = {
    light: toHex(await varOf(first(light), '--fluvy-accent')),
    dark: toHex(await varOf(first(dark), '--fluvy-accent')),
    volt: toHex(await varOf(first(volt), '--fluvy-accent')),
    off: toHex(await varOf(first(off), '--fluvy-accent')),
  };
  check(
    'dark mode derives the colour again',
    on.dark !== on.light && on.dark !== null,
    JSON.stringify(on),
  );
  check('another palette derives it again', on.volt !== on.light && on.volt !== null);
  check(
    'a page without the theme derives on its fallback’s palette, as the theme would (#40)',
    on.off === on.volt && on.off !== on.light,
    JSON.stringify(on),
  );
  const darkLine = toHex(await styleOf(first(dark).locator('.curve-line').first(), 'stroke'));
  check('the dark line is the dark accent', darkLine === on.dark);
  const darkCard = toHex(await varOf(first(dark), '--fluvy-card'));
  check(
    'and readable on the dark card',
    contrastRatio(on.dark, darkCard) >= 3,
    `${on.dark} on ${darkCard}`,
  );
  for (const page of [light, dark, volt, off]) await page.close();
}

/* ---------- tint: an item's colour at rest (the comment on issue #26) ---------- */
for (const mode of ['light', 'dark', 'volt']) {
  const page = await suite.sheet('colours', {
    width: 412,
    extra: mode === 'dark' ? '&mode=dark' : mode === 'volt' ? '&palette=volt' : '',
  });
  const surfaces = (title, card, item) =>
    frame(page, title)
      .locator(card)
      .first()
      .evaluate(
        (el, selector) =>
          [...el.shadowRoot.querySelectorAll(selector)].map((node) => {
            const style = getComputedStyle(node);
            return {
              cls: node.className,
              bg: style.backgroundColor,
              edge: style.boxShadow,
            };
          }),
        item,
      );
  const tiles = await surfaces('Tint · tiles at rest', 'fluvy-tiles-card', '.fv-tile');
  const plain = await surfaces('Plain tiles', 'fluvy-tiles-card', '.fv-tile');
  const lit = tiles[0];
  const rest = tiles[1];
  const plainOff = plain.find((t) => !t.cls.includes('is-on'));
  check(
    `tint (${mode}): a tile with a colour washes it at rest (the wash its words read on), a hairline of it round; on it keeps the full fill, never alike`,
    !lit.cls.includes('is-tinted') &&
      rest.cls.includes('is-tinted') &&
      rest.bg !== plainOff?.bg &&
      rest.bg !== lit.bg &&
      rest.edge !== plainOff?.edge &&
      !plain.some((t) => t.cls.includes('is-tinted')),
    JSON.stringify({ lit: lit.bg, rest: rest.bg, plain: plainOff?.bg }),
  );
  const scenes = await surfaces('Tint · scenes and tabs', 'fluvy-scenes-card', '.am-scene');
  check(
    `tint (${mode}): every scene in its own colour at rest, the last run full`,
    new Set(scenes.map((t) => t.bg)).size === scenes.length &&
      scenes.some((t) => t.cls.includes('is-on')),
    JSON.stringify(scenes.map((t) => t.bg)),
  );
  const pills = await surfaces('Tint · scenes and tabs', 'fluvy-chips-card', '.fv-chip__pill');
  check(
    `tint (${mode}): a tab with a colour washes it at rest; one without stays the card’s`,
    pills.length === 3 && pills[1].bg !== pills[2].bg && pills[0].bg !== pills[1].bg,
    JSON.stringify(pills.map((t) => t.bg)),
  );
  await page.close();
}

/* ---------- the first frame where no look reaches a card (issue #40) ---------- */
/** A tiles card with a colour, a surface and items of their own, as the editor would make it. */
const FRESH = {
  type: 'custom:fluvy-tiles-card',
  size: 'compact',
  color: 'red',
  card_color: 'blue',
  tiles: [
    { entity: 'light.co_hall', color: 'black' },
    { entity: 'light.co_lamp', color: 'teal' },
    { entity: 'light.co_porch', color: 'white' },
    { entity: 'light.co_hall' },
  ],
};
/**
 * Makes a card as Home Assistant's editor does (a new element for each config, its `hass` before it is attached),
 * reads its colours on the first frame it is drawn in, then attaches it again where it was and reads them once more.
 */
const freshCard = (page, configs) =>
  page.evaluate(async (configs) => {
    const frameDone = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const hass = document.querySelector('fluvy-tiles-card').hass;
    const holder = document.createElement('section');
    holder.className = 'pg-frame';
    holder.style.width = '412px';
    document.getElementById('stage').append(holder);
    const read = (card) => {
      const root = card.shadowRoot;
      const inner = getComputedStyle(root.firstElementChild);
      return {
        accent: inner.getPropertyValue('--fluvy-accent').trim(),
        card: inner.getPropertyValue('--fluvy-card').trim(),
        tiles: [...root.querySelectorAll('.fv-tile')].map((tile) => ({
          accent: tile.getAttribute('data-accent'),
          fill: getComputedStyle(tile).getPropertyValue('--fluvy-accent-fill').trim(),
          disc: getComputedStyle(tile.querySelector('.fv-ico')).backgroundColor,
        })),
      };
    };
    const frames = [];
    for (const config of configs) {
      const card = document.createElement(config.type.replace('custom:', ''));
      card.setConfig(config);
      card.hass = hass;
      holder.replaceChildren(card);
      await frameDone();
      const first = read(card);
      card.remove();
      holder.append(card);
      await frameDone();
      frames.push({ first, again: read(card) });
    }
    holder.remove();
    return frames;
  }, configs);

{
  const pages = {
    linen: await suite.sheet('colours', { width: 412 }),
    linenDark: await suite.sheet('colours', { width: 412, extra: '&mode=dark' }),
    mistOff: await suite.sheet('colours', { width: 412, extra: '&theme=off&fallback=mist' }),
    mist: await suite.sheet('colours', { width: 412, extra: '&palette=mist' }),
    mistDarkOff: await suite.sheet('colours', {
      width: 412,
      extra: '&theme=off&fallback=mist&mode=dark',
    }),
    mistDark: await suite.sheet('colours', { width: 412, extra: '&palette=mist&mode=dark' }),
    voltOff: await suite.sheet('colours', { width: 412, extra: '&theme=off&fallback=volt' }),
    volt: await suite.sheet('colours', { width: 412, extra: '&palette=volt' }),
  };
  check(
    'a page without the look has no palette of ours, as Home Assistant draws one',
    (await pages.mistOff.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--fluvy-palette').trim(),
    )) === '',
  );
  const [linenLight] = await freshCard(pages.linen, [FRESH]);
  const [linenDark] = await freshCard(pages.linenDark, [FRESH]);
  const accents = (frame) => frame.tiles.map((tile) => tile.accent).join(' ');
  for (const [name, off, worn, linen] of [
    ['mist', 'mistOff', 'mist', linenLight],
    ['mist dark', 'mistDarkOff', 'mistDark', linenDark],
    ['volt', 'voltOff', 'volt', linenLight],
  ]) {
    const [fresh] = await freshCard(pages[off], [FRESH]);
    const [reference] = await freshCard(pages[worn], [FRESH]);
    check(
      `${name}: a new card draws on its first frame what it draws once attached again`,
      JSON.stringify(fresh.first) === JSON.stringify(fresh.again),
      JSON.stringify({ first: fresh.first.accent, again: fresh.again.accent }),
    );
    check(
      `${name}: its colour, surface and items' are the palette's, as on a dashboard that wears it — not Linen's`,
      fresh.first.accent === reference.first.accent &&
        fresh.first.card === reference.first.card &&
        accents(fresh.first) === accents(reference.first) &&
        accents(fresh.first) !== accents(linen.first),
      `${accents(fresh.first)} vs ${accents(reference.first)} (Linen ${accents(linen.first)})`,
    );
    check(
      `${name}: the black tile's resting circle is its palette's black, not Linen's`,
      fresh.first.tiles[0].disc === reference.first.tiles[0].disc &&
        fresh.first.tiles[0].disc !== linen.first.tiles[0].disc,
      `${fresh.first.tiles[0].disc} vs Linen ${linen.first.tiles[0].disc}`,
    );
  }

  // Home Assistant's editor makes a new card on every edit: each one right on its first frame
  const edits = await freshCard(pages.mistOff, [
    FRESH,
    { ...FRESH, color: 'grey', card_color: 'amber' },
    { ...FRESH, color: '#00b894', card_color: undefined, tiles: FRESH.tiles.slice(1) },
  ]);
  const worn = await freshCard(pages.mist, [
    FRESH,
    { ...FRESH, color: 'grey', card_color: 'amber' },
    { ...FRESH, color: '#00b894', card_color: undefined, tiles: FRESH.tiles.slice(1) },
  ]);
  check(
    'the editor recreates the card on every edit: every new card right on its first frame',
    edits.every(
      (edit, i) =>
        JSON.stringify(edit.first) === JSON.stringify(edit.again) &&
        edit.first.accent === worn[i].first.accent &&
        accents(edit.first) === accents(worn[i].first),
    ),
    JSON.stringify(edits.map((edit) => edit.first.accent)),
  );

  // every card on four sheets: what it drew first is what it draws once attached again
  for (const sheetName of ['colours', 'lists', 'nested', 'home']) {
    const page = await suite.sheet(sheetName, { width: 412, extra: '&theme=off&fallback=mist' });
    const drift = await page.evaluate(async () => {
      const frameDone = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const cards = [...document.querySelectorAll('[data-frame] > *, [data-stress] > *')].filter(
        (el) => el.localName.startsWith('fluvy-') && el.shadowRoot?.firstElementChild,
      );
      const read = () =>
        cards.map((card) => {
          const inner = getComputedStyle(card.shadowRoot.firstElementChild);
          return [
            card.localName,
            inner.getPropertyValue('--fluvy-accent').trim(),
            inner.getPropertyValue('--fluvy-card').trim(),
            ...[...card.shadowRoot.querySelectorAll('[data-accent]')].map((el) =>
              getComputedStyle(el).getPropertyValue('--fluvy-accent-fill').trim(),
            ),
          ].join(' ');
        });
      const before = read();
      for (const card of cards) {
        const { parentNode, nextSibling } = card;
        card.remove();
        parentNode.insertBefore(card, nextSibling);
      }
      await frameDone();
      await frameDone();
      const after = read();
      return {
        count: cards.length,
        moved: before.filter((line, i) => line !== after[i]).map((line, i) => [line, after[i]]),
      };
    });
    check(
      `${sheetName}: all ${drift.count} cards keep their colours when attached again (no look: Mist's fallback)`,
      drift.count > 0 && drift.moved.length === 0,
      JSON.stringify(drift.moved.slice(0, 3)),
    );
    await page.close();
  }

  // the chips card reads the look's mark at once: its rooms hold one highlight from the first frame
  const chips = await pages.voltOff.evaluate(async () => {
    const card = document.createElement('fluvy-chips-card');
    card.setConfig({
      type: 'custom:fluvy-chips-card',
      chips: [
        { name: 'Home', path: '/' },
        { name: 'Garden', path: '/garden' },
      ],
    });
    card.hass = document.querySelector('fluvy-tiles-card').hass;
    document.getElementById('stage').append(card);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const beside = card.shadowRoot.querySelector('.hm-rooms')?.classList.contains('is-beside-mark');
    card.remove();
    return beside;
  });
  check(
    'volt without the look: a new chips card is beside the mark on its first frame',
    chips === true,
  );

  // the grey ladder: each grey's lamp on and off; at rest only white is an outlined disc, and only in light
  for (const [mode, page] of [
    ['light', pages.mist],
    ['dark', pages.mistDark],
  ]) {
    const greys = await frame(page, 'Greys')
      .locator('fluvy-tiles-card')
      .evaluate((card) =>
        [...card.shadowRoot.querySelectorAll('.fv-tile')].map((tile) => {
          const disc = getComputedStyle(tile.querySelector('.fv-ico'));
          return {
            on: tile.classList.contains('is-on'),
            fill: getComputedStyle(tile).backgroundColor,
            disc: disc.backgroundColor,
            ring: /rgba\(0, 0, 0, 0\)|transparent|none/.test(disc.boxShadow) ? '' : disc.boxShadow,
          };
        }),
      );
    const lit = greys.filter((tile) => tile.on);
    const rest = greys.filter((tile) => !tile.on);
    check(
      `greys (${mode}): six lit plates and six resting circles, each unlike the others`,
      lit.length === 6 &&
        new Set(lit.map((tile) => tile.fill)).size === 6 &&
        new Set(rest.map((tile) => tile.disc)).size === 6,
      JSON.stringify(rest.map((tile) => tile.disc)),
    );
    check(
      `greys (${mode}): ${mode === 'light' ? 'white alone is an outlined disc at rest' : 'no disc is outlined'}`,
      rest.every((tile, i) => (mode === 'light' && i === 5 ? tile.ring !== '' : tile.ring === '')),
      JSON.stringify(rest.map((tile) => tile.ring)),
    );
  }
  for (const page of Object.values(pages)) await page.close();
}

/* ---------- a lit light card shows its colour, on every palette (#41) ---------- */
/**
 * What a light card draws on its lit surface (the whole fill, a wash, the rest wash), read as the eye gets it: each
 * colour painted over the surface (its opacity and its alpha folded in) and measured against it.
 */
const litCard = (card) =>
  card.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const hex = ([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    const root = el.shadowRoot;
    const article = root.querySelector('article');
    const surface = hex(rgba(getComputedStyle(article).backgroundColor));
    /** A colour as it lands on the surface: its own alpha and every opacity up to the card folded in. */
    const over = (css, node) => {
      const [r, g, b, a] = rgba(css);
      let k = a / 255;
      for (let n = node; n && n !== el; n = n.parentElement ?? n.getRootNode().host)
        k *= Number(getComputedStyle(n).opacity);
      const [R, G, B] = rgba(surface);
      return hex([r * k + R * (1 - k), g * k + G * (1 - k), b * k + B * (1 - k)].map(Math.round));
    };
    const ink = (selector) =>
      [...root.querySelectorAll(selector)].map((node) => over(getComputedStyle(node).color, node));
    const ruler = root.querySelector('fluvy-ruler').shadowRoot;
    const off = ruler.querySelector('.tk-off');
    const knob = ruler.querySelector('.fv-knob');
    const stepper = root.querySelector('.fv-stepper');
    const temperature = [...root.querySelectorAll('fluvy-ruler')].find(
      (r) => r.tint === 'warm-cool',
    );
    const tint = temperature?.shadowRoot.querySelector('.tk-tint');
    return {
      cls: article.className,
      surface,
      plain: hex(rgba(getComputedStyle(el).getPropertyValue('--fluvy-card').trim())),
      words: ink(
        '.fv-card__title, .fv-card__sub, .fv-readout__value, .fv-readout__label, .fv-label',
      ),
      labels: ink('.fv-ruler-labels span'),
      off: off ? over(getComputedStyle(off).stroke, off) : null,
      // a resting ruler draws no knob
      ring: knob ? hex(rgba(getComputedStyle(knob).getPropertyValue('--tone-ink'))) : null,
      hairline: hex(rgba(getComputedStyle(stepper).getPropertyValue('--fluvy-border'))),
      pill: hex(rgba(getComputedStyle(stepper).backgroundColor)),
      ends: tint
        ? ['.tint-a', '.tint-b'].map((stop) =>
            over(getComputedStyle(temperature.shadowRoot.querySelector(stop)).stopColor, tint),
          )
        : [],
      edges: [...root.querySelectorAll('.lc-swatch')].map((b) =>
        hex(rgba(getComputedStyle(b).borderTopColor)),
      ),
    };
  });

for (const [name, extra] of [
  ['linen', ''],
  ['dark', '&mode=dark'],
  ['volt', '&palette=volt'],
  ['volt dark', '&palette=volt&mode=dark'],
  ['mint', '&palette=mint'],
  ['mint dark', '&palette=mint&mode=dark'],
  ['noir', '&palette=noir'],
  ['noir dark', '&palette=noir&mode=dark'],
]) {
  const page = await suite.sheet('slider', { extra });
  const cards = async (title) => {
    const list = frame(page, title).locator('fluvy-light-card');
    await list
      .first()
      .locator('.lc-swatch')
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    return Promise.all(Array.from({ length: await list.count() }, (_, i) => litCard(list.nth(i))));
  };
  const drawn = [
    ...(await cards('Tint · colour')),
    ...(await cards('Tint · white')),
    ...(await cards('Tint · dim and bright')),
    ...(await cards('Tint · white, soft')),
    ...(await cards('Tint · always at rest')),
  ];
  const on = (fg, card) => contrastRatio(fg, card.surface);
  const worst = (values) => Math.min(...values).toFixed(2);
  const all = (pick, gate) => drawn.every((card) => pick(card).every((value) => value >= gate));
  const full = drawn.filter((card) => card.cls.includes('is-lit'));
  const washed = drawn.filter((card) => !card.cls.includes('is-lit'));
  check(
    `${name}: a lit light card stands off a plain card, its words read on it (≥ 4.5), its rulers’ labels too (≥ 3)`,
    full.length === 2 &&
      drawn.every((card) => card.surface !== card.plain) &&
      all((card) => card.words.map((ink) => on(ink, card)), 4.5) &&
      all((card) => card.labels.map((ink) => on(ink, card)), 3),
    `words ${worst(drawn.flatMap((c) => c.words.map((i) => on(i, c))))}, labels ${worst(drawn.flatMap((c) => c.labels.map((i) => on(i, c))))}`,
  );
  check(
    `${name}: on it the resting ticks (≥ 1.35), the knob’s ring (≥ 3), the temperature ruler’s ends (≥ 1.35) and the quick colours’ edges (≥ 1.2)`,
    all((card) => [on(card.off, card)], 1.35) &&
      drawn
        .filter((card) => /is-lit|is-glow/.test(card.cls))
        .every((card) => on(card.ring, card) >= 3) &&
      all((card) => card.ends.map((end) => on(end, card)), 1.35) &&
      all((card) => card.edges.map((edge) => on(edge, card)), 1.2),
    `ticks ${worst(drawn.map((c) => on(c.off, c)))}, ends ${worst(drawn.flatMap((c) => c.ends.map((e) => on(e, c))))}, edges ${worst(drawn.flatMap((c) => c.edges.map((e) => on(e, c))))}`,
  );
  check(
    `${name}: the stepper stands off it — its hairline on a wash (≥ 1.35), its plain pill on the whole fill (≥ 1.15)`,
    washed.every((card) => on(card.hairline, card) >= 1.35) &&
      full.every((card) => on(card.pill, card) >= 1.15),
    `hairline ${worst(washed.map((c) => on(c.hairline, c)))}, pill ${worst(full.map((c) => on(c.pill, c)))}`,
  );
  await page.close();
}

/* ---------- a lit colour bulb's tile in its colour (#41) ---------- */
{
  const page = await suite.sheet('slider');
  const tiles = await frame(page, 'Tiles · bulb colours')
    .locator('fluvy-tiles-card')
    .evaluate((card) =>
      [...card.shadowRoot.querySelectorAll('.fv-tile')].map((tile) => {
        const style = getComputedStyle(tile);
        return {
          on: tile.classList.contains('is-on'),
          accent: tile.dataset.accent ?? '',
          fill: style.backgroundColor,
          family: style.getPropertyValue('--fluvy-state-light-active-fill').trim(),
        };
      }),
    );
  const [lamp, strip, white] = tiles;
  check(
    'a lit colour bulb’s tile fills with its own family’s fill, unlike the palette’s lit light (a white’s)',
    lamp.accent === '#ff9800' &&
      strip.accent === '#2196f3' &&
      toHex(lamp.fill) === toHex(lamp.family) &&
      toHex(lamp.fill) !== toHex(white.fill) &&
      toHex(strip.fill) !== toHex(lamp.fill) &&
      white.on &&
      white.accent === '',
    JSON.stringify(tiles),
  );
  await page.close();
}

/* ---------- the house's status colours (1.9): a warning of its own, on every card that says one ---------- */
for (const mode of ['light', 'dark']) {
  const page = await suite.sheet('appliances', { width: 392, extra: `&mode=${mode}` });
  /** A frame's warning: the dishwasher's "Refill" (a reminder due), the salt alert's circle, the frame's token. */
  const warningOf = async (title) => {
    const box = frame(page, title);
    const value = box.locator('fluvy-appliance-card .ap-item.is-warning .ap-item__value').first();
    const circle = box.locator('fluvy-alerts-card .fv-ico--warning').first();
    return {
      token: toHex(
        await box.evaluate((el) => getComputedStyle(el).getPropertyValue('--fluvy-warning')),
      ),
      text: toHex(await styleOf(value, 'color')),
      card: toHex(
        await value.evaluate((el) =>
          getComputedStyle(el.closest('.fv-card') ?? el).getPropertyValue('--fluvy-card'),
        ),
      ),
      glyph: toHex(await styleOf(circle, 'color')),
      danger: toHex(
        await styleOf(box.locator('fluvy-alerts-card .fv-ico--danger').first(), 'color'),
      ),
    };
  };
  const auto = await warningOf('Statuses · the palette’s');
  const own = await warningOf('Statuses · a warning of the house’s own');
  check(
    `${mode}: the palette’s warning where the house picked none, on the reminder and the alert`,
    auto.text === auto.token && auto.glyph === auto.token,
    JSON.stringify(auto),
  );
  check(
    `${mode}: the house’s orange on the same cards, the reminder’s words and the alert’s glyph`,
    own.text === own.token && own.glyph === own.token && own.token !== auto.token,
    JSON.stringify(own),
  );
  check(
    `${mode}: an orange that reads as text on its card (≥ 4.5:1), as orange as it may be (#47’s "Reinigen")`,
    contrastRatio(own.text, own.card) >= 4.5 && (mode === 'dark' ? own.text === '#dc630b' : true),
    `${own.text} on ${own.card}: ${contrastRatio(own.text, own.card).toFixed(2)}`,
  );
  check(`${mode}: the danger is the palette’s still`, own.danger === auto.danger, own.danger);
  await page.close();
}

await suite.finish();
