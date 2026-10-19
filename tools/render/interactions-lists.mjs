#!/usr/bin/env node
/**
 * A card of a list with nothing in it (#48), in a real Chromium against the playground. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-lists.mjs
 * What it proves: every card of a list draws its head and the empty panel where its list would be, as tall as it
 * says it is (`layoutHeight`); auto-entities' way — the same element handed its matches, none, then matches again —
 * draws rows, the panel, then the rows, never an error and never the rows it had; a section's title and a divider
 * among the matches are no rows; a card asked to `hide_empty` steps out of the page and tells its wrapper, never in
 * the editor; the panel stands on the page in the page's other fill and in a card in the page's, 16 under its head
 * and 20 above the card's foot in every card of a list (20 all round where it has no head); the card's own words and
 * every language's.
 */
import { frame, startSuite } from './lib/suite.mjs';

const suite = await startSuite();
const { check } = suite;

const EMPTY = [
  'Empty · rows',
  'Empty · people',
  'Empty · figures',
  'Empty · actions',
  'Empty · on the page',
];

/** The cards of a frame, each with what it draws and how tall it says it is at this column. */
const cardsOf = (page, title) =>
  frame(page, title).evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((el) => el.localName.startsWith('fluvy-') && el.localName.endsWith('-card'))
      .map((el) => {
        const box = [...el.renderRoot.children].find((node) => node.localName !== 'style');
        // where the panel stands in its card: under the head (or the card's top) and above the card's foot
        const panel = el.renderRoot.querySelector('.fv-empty-state:not(.fv-empty-state--page)');
        const head = el.renderRoot.querySelector('.fv-card__head')?.getBoundingClientRect();
        const p = panel?.getBoundingClientRect();
        const b = box?.getBoundingClientRect();
        return {
          tag: el.localName,
          place:
            p && b
              ? [
                  Math.round(p.top - (head?.bottom ?? b.top)),
                  Math.round(b.bottom - p.bottom),
                  Boolean(head),
                ]
              : null,
          panel: Boolean(el.renderRoot.querySelector('.fv-empty-state, .in-rows--quiet')),
          rows: el.renderRoot.querySelectorAll('.fv-row:not(.in-rows--quiet .fv-row)').length,
          height: box?.getBoundingClientRect().height ?? 0,
          declared: el.constructor.layoutHeight(el.config, el.hass),
        };
      }),
  );

/* ---------- every card of a list, empty: its panel, at the height it says ---------- */
{
  const page = await suite.sheet('lists');
  for (const title of EMPTY)
    for (const card of await cardsOf(page, title)) {
      check(`${title}: ${card.tag} draws its panel, no row`, card.panel && card.rows === 0);
      check(
        `${title}: ${card.tag} is as tall as it says (${card.declared})`,
        Math.abs(card.height - card.declared) < 0.5,
        `${card.height}`,
      );
      // every list's panel sits alike: 16 under the head, the card's 20 under it (20 all round without a head)
      if (card.place) {
        const [above, below, head] = card.place;
        check(
          `${title}: ${card.tag}'s panel stands ${head ? '16 under its head' : '20 in from the card'} and 20 above its foot`,
          above === (head ? 16 : 20) && below === 20,
          `${above} · ${below}`,
        );
      }
    }

  // the panel on the page wears the page's other fill; in a card, the page's own
  const fills = await frame(page, 'Empty · on the page').evaluate((root) => {
    const fill = (tag) => {
      const panel = root.querySelector(tag).renderRoot.querySelector('.fv-empty-state');
      return getComputedStyle(panel).backgroundColor;
    };
    const card = root.querySelector('fluvy-entities-card');
    const token = (name) =>
      getComputedStyle(card.renderRoot.querySelector('.fv-card')).getPropertyValue(name).trim();
    return {
      tiles: fill('fluvy-tiles-card'),
      chips: fill('fluvy-chips-card'),
      inCard: fill('fluvy-entities-card'),
      alt: token('--fluvy-page-alt'),
      page: token('--fluvy-page'),
    };
  });
  const probe = await page.evaluate(
    ([alt, own]) => {
      const el = document.createElement('div');
      document.body.append(el);
      el.style.background = alt;
      const a = getComputedStyle(el).backgroundColor;
      el.style.background = own;
      const b = getComputedStyle(el).backgroundColor;
      el.remove();
      return [a, b];
    },
    [fills.alt, fills.page],
  );
  check(
    'on the page, the panel takes the page’s other fill; in a card, the page’s',
    fills.tiles === probe[0] && fills.chips === probe[0] && fills.inCard === probe[1],
    JSON.stringify(fills),
  );

  // the card's own words for what nothing means here
  const own = await frame(page, 'Empty · own words').evaluate((root) =>
    [...root.querySelectorAll('fluvy-openings-card, fluvy-people-card')].map(
      (el) => el.renderRoot.querySelector('.fv-empty-state__text')?.textContent.trim() ?? '',
    ),
  );
  check(
    'empty_text says what the card was told to',
    own.join(' · ') === 'All closed · Nobody home',
    own.join(' · '),
  );
  await page.close();
}

/* ---------- auto-entities' way: one element, its matches, none, its matches again ---------- */
{
  const page = await suite.sheet('lists');
  const run = (tag) =>
    frame(page, 'Auto-entities').evaluate(async (root, tag) => {
      const el = root.querySelector(tag);
      const config = el.config;
      const key = el.config.rows ? 'rows' : el.config.tiles ? 'tiles' : 'entities';
      const matches = config[key];
      const seen = [];
      const look = async () => {
        await el.updateComplete;
        seen.push({
          rows: el.renderRoot.querySelectorAll('.fv-row, .fv-option, .fv-tile').length,
          panel: Boolean(el.renderRoot.querySelector('.fv-empty-state')),
          watched: el.watched(),
        });
      };
      try {
        await look();
        // auto-entities builds the card's config afresh, under its own key, each time its filter changes
        el.setConfig({ type: config.type, title: config.title, entities: [] });
        await look();
        el.setConfig({ type: config.type, title: config.title, entities: matches });
        await look();
        return { seen, same: root.querySelector(tag) === el, error: '' };
      } catch (error) {
        return { seen, same: true, error: String(error) };
      }
    }, tag);
  for (const tag of [
    'fluvy-bars-card',
    'fluvy-stat-tiles-card',
    'fluvy-entities-card',
    'fluvy-tiles-card',
  ]) {
    const { seen, same, error } = await run(tag);
    const [before, none, after] = seen;
    check(`${tag}: handed none, then its matches again, it never throws`, !error && same, error);
    check(
      `${tag}: rows, then the panel and no row, then the rows`,
      before?.rows > 0 &&
        !before.panel &&
        none?.rows === 0 &&
        none.panel &&
        after?.rows === before.rows &&
        !after.panel,
      JSON.stringify(seen.map(({ rows, panel }) => ({ rows, panel }))),
    );
    check(
      `${tag}: watches ids only, a section's title and a divider skipped`,
      seen.every(({ watched }) =>
        watched.every((id) => typeof id === 'string' && id.includes('.')),
      ),
      JSON.stringify(after?.watched),
    );
  }
  await page.close();
}

/* ---------- hide_empty: out of the page while empty, back with a match, never in the editor ---------- */
{
  const page = await suite.sheet('lists');
  const result = await frame(page, 'Empty · on the page').evaluate(async (root) => {
    const el = root.querySelector('fluvy-tiles-card');
    const heard = [];
    document.addEventListener('card-visibility-changed', (event) => heard.push(event.detail.value));
    const state = async () => {
      await el.updateComplete;
      return { hidden: el.hidden, display: getComputedStyle(el).display };
    };
    el.setConfig({ type: 'custom:fluvy-tiles-card', entities: [], hide_empty: true });
    const asked = await state();
    el.setConfig({
      type: 'custom:fluvy-tiles-card',
      entities: ['switch.kitchen_light'],
      hide_empty: true,
    });
    const matched = await state();
    el.preview = true;
    el.setConfig({ type: 'custom:fluvy-tiles-card', entities: [], hide_empty: true });
    const editing = await state();
    return { asked, matched, editing, heard, kept: el.connectedWhileHidden };
  });
  check(
    'asked to, an empty card steps out of the page and stays connected',
    result.asked.hidden && result.asked.display === 'none' && result.kept === true,
    JSON.stringify(result.asked),
  );
  check(
    'a match brings it back',
    !result.matched.hidden && result.matched.display !== 'none',
    JSON.stringify(result.matched),
  );
  check('in the editor it never hides', !result.editing.hidden, JSON.stringify(result.editing));
  check(
    'its wrapper hears each turn once',
    JSON.stringify(result.heard) === '[false,true]',
    JSON.stringify(result.heard),
  );
  await page.close();
}

/* ---------- every language: the panel's words ---------- */
{
  const page = await suite.sheet('lists', { lang: 'de' });
  const words = await frame(page, 'Empty · people').evaluate((root) =>
    [...root.querySelectorAll('fluvy-people-card, fluvy-map-card')].map(
      (el) => el.renderRoot.querySelector('.fv-empty-state__text')?.textContent.trim() ?? '',
    ),
  );
  check(
    'German: “Keine Personen”',
    words.every((word) => word === 'Keine Personen'),
    words.join(' · '),
  );
  await page.close();
}

await suite.finish();
