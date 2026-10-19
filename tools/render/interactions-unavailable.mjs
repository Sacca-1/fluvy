#!/usr/bin/env node
/**
 * An unavailable card keeps its configured size (the owner's rule, 1.9): for every card of the catalogue and each of
 * its variants (the `variant` its editor offers, or a tile's `size`), in a real Chromium against the playground, two
 * twins side by side — from the card's stub in the house of every sheet (`?frames=none`), and from a playground frame
 * in that frame's own house where the stub leaves out what the card is for (`SOURCES`) — the second in a house where
 * every entity the card reads (what it watches, and every id its config names) is out of reach as Home Assistant writes
 * it (`@fluvy/demo-home/out-of-reach`, the playground's `fluvyOutOfReach`):
 *   unavailable  the state `unavailable`; the name, the icon, the picture, the features, the class, the unit and the
 *                capability attributes (a thermostat's modes and range, a fan's presets, a light's colour modes and
 *                effects, a select's options) kept; the state's own attributes (a temperature now, a brightness, a
 *                humidity, a position) gone;
 *   unknown      the state `unknown`, the same attributes kept and the state's own written as null;
 *   missing      not in `hass.states` at all;
 *   never        (asked for: `--states never`) never read by the page: every id its config names renamed to one the
 *                house has never had (an id renamed, an integration still starting when the dashboard opened), so
 *                the card cannot know what the entity could do. It draws what it declares where the house is not
 *                there to say (`layoutHeight`: a fan's speed and both rows, a cover's position and commands, a
 *                robot's commands and battery) — held to that declared height where it speaks (a drift where the
 *                live twin is off its own too), and to no quiet line at any width; its height is not the live
 *                twin's, which knows its presets and its features.
 * A variant that asks for half a section (6 columns or fewer) is drawn at card widths 152 and 172, any other at 211, 266
 * and 360. It fails when the twins' heights differ by more than 0.5 px, when the broken twin draws its one quiet line
 * or hides itself while the live one does not, when the twins say different sizes (`getCardSize`), or, where the
 * declared height speaks (`layoutHeight`: the 360 column, so a full card at 360 and a half card at 172), when the broken
 * twin is off it by more than heights.mjs allows while the live twin is not. Twins that agree but are both off their
 * declared height are a drift of the declaration, said at the end and never failed (heights.mjs holds it). A card that
 * shows no entity, hides itself while live or draws its quiet line while live (a stub that finds nothing) is listed
 * with the reason instead. A card that finds what it shows (`FOUND`: a room in its area, the house's automations) has
 * only what its config names taken out of the house when missing: what it finds and the house no longer has is not
 * its own. Where a card's rows are what its entities say (`BY_CONTENT`), the broken twin is held to everything but the
 * live one's height, with the reason said. Exit code 1 on any failure.
 *   PLAYGROUND=http://127.0.0.1:5183/ node interactions-unavailable.mjs [--cards light,tile,fluvy-fan-card]
 *     [--states unavailable,unknown,missing] [--widths 211,360] [--json out/unavailable.json]
 * `--cards` takes a card's tag or its short name (`light` for `fluvy-light-card`): a sweep runs its own cards alone.
 * `--json` writes every failure, every listed card and every drift, for a report. `visual.mjs` leaves this suite out
 * now that every card keeps its size out of reach (1.9 A7).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from './lib.mjs';
import { startSuite } from './lib/suite.mjs';

const args = parseArgs(process.argv.slice(2), {
  cards: '',
  states: 'unavailable,unknown,missing',
  widths: '',
  json: '',
});
const listOf = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const tagOf = (name) => (name.startsWith('fluvy-') ? name : `fluvy-${name}-card`);
const wanted = new Set(listOf(args.cards).map(tagOf));
const KINDS = listOf(args.states);
for (const kind of KINDS)
  if (!['unavailable', 'unknown', 'missing', 'never'].includes(kind))
    throw new Error(`--states takes unavailable, unknown, missing and never, not "${kind}"`);
const only = new Set(listOf(args.widths).map(Number));

/** Half a section (the card asks for 6 columns or fewer): a phone's 320 and a desktop's 360 section halved. */
const HALF = [152, 172];
/** A full card: the floor, a phone's tablet column and the design width. */
const FULL = [211, 266, 360];
/** Where `layoutHeight` speaks: the 360 column, which a half card shares with its neighbour. */
const DECLARED_AT = { half: 172, full: 360 };
/** What the twins may differ by; what the broken one may be off its declared height (heights.mjs's tolerance). */
const TWINS = 0.5;
const DECLARED = 8;

/**
 * Where a card's twins come from: its stub (`'stub'`, in the house of every sheet), and where the stub leaves out what
 * the card is for — a cover without a position, a player with nothing playing, a calendar without events, a list of
 * the Energy dashboard's — or misses a case worth its own twins (the owner's switch with its readouts beside a lamp's
 * ruler), a playground frame's config: [sheet, frame title, index of the card in the frame], in that sheet's house.
 * A card not named here is drawn from its stub alone.
 */
const SOURCES = {
  'fluvy-tile-card': ['stub', ['actions', 'Tile · large', 0]],
  'fluvy-tiles-card': ['stub', ['actions', 'Tiles · large · one unavailable', 0]],
  'fluvy-light-card': ['stub', ['slider', 'On', 0]],
  'fluvy-thermostat-card': [['climate', 'Heat', 0]],
  'fluvy-cover-card': [['devices-motion', 'Blinds', 0]],
  'fluvy-fan-card': [['devices-motion', 'Ceiling fan', 0]],
  'fluvy-vacuum-card': [['devices-motion', 'Vacuum', 0]],
  'fluvy-sensor-card': [['ambient', 'Sensors · two on one chart', 0]],
  'fluvy-readouts-card': [['home-extras', 'E Readouts', 0]],
  'fluvy-hello-card': [['home-extras', 'A Home', 0]],
  // its stub only goes somewhere (listed: it shows no entity); a section's chips have a blind among them
  'fluvy-chips-card': ['stub', ['home-extras', 'C Sections', 4]],
  'fluvy-room-card': [['rooms', 'Room · photo', 0]],
  'fluvy-map-card': [['ambient', 'Map · zones', 0]],
  'fluvy-calendar-card': [['calendar', 'Agenda', 0]],
  'fluvy-weather-card': [['ambient', 'Weather', 0]],
  'fluvy-media-card': [['media', 'Playing', 0]],
  'fluvy-now-playing-card': [['home-extras', 'F Player', 0]],
  'fluvy-energy-balance-card': [['balance', 'Balance · live, per phase', 0]],
  'fluvy-production-card': [['solar', 'Production', 0]],
  'fluvy-history-bars-card': [['history-bars', '30 days', 0]],
  'fluvy-batteries-card': [['storage', 'Batteries', 0]],
  'fluvy-energy-sankey-card': [['sankey', 'Where it went', 0]],
  'fluvy-energy-score-card': [['sankey', 'Energy score', 0]],
  'fluvy-alarm-card': [['devices-security', 'Alarm', 0]],
  'fluvy-printer-card': [['printer', 'Bambu Lab · printing', 0]],
  'fluvy-automations-card': [['automations', 'Rows', 0]],
  'fluvy-appliances-card': [['appliances', 'Appliances · rows', 0]],
};

/**
 * Cards that find what they show — a room in its area, the automations of the house — instead of being told: missing,
 * an entity is gone from the house, and so from the room or the house's list (#39, #48), so only what their config
 * names is taken out of the house for that twin. Unavailable and unknown, everything they read is.
 */
const FOUND = {
  'fluvy-room-card':
    'finds what it holds in its area: one gone from the house is not in the room (#39)',
  'fluvy-automations-card':
    'lists the house’s automations unless told which: one gone from the house is not one of them',
  'fluvy-appliances-card':
    'finds the house’s appliances in its registries unless told which (#47): their entities gone from the house keep each its card, its roles the registry’s',
};

/**
 * Where a card's rows are what its entities say, out of reach as well — by card, the variants (all when none are
 * named) and the states — the broken twin keeps every row (`unavailable.test.ts` holds its parts), never draws its
 * quiet line nor hides, says the same size and is held to its declared height as any twin is, but its height is not
 * the live one's: it cannot know what the live rows say.
 */
const BY_CONTENT = {
  'fluvy-updates-card': {
    states: ['unavailable', 'unknown', 'missing'],
    reason:
      'its rows are what waits and what installs (an installing row is taller, one up to date is left out): one that cannot be read keeps its row, as the configured list does',
  },
  'fluvy-automations-card': {
    variants: ['variant=rows'],
    states: ['missing'],
    reason:
      'a schedule gone from the house says nothing of its line: its row is one line where the least of a schedule’s took two in a narrow column',
  },
};
const byContent = (tag, variant, kind) => {
  const entry = BY_CONTENT[tag];
  return entry &&
    entry.states.includes(kind) &&
    (!entry.variants || entry.variants.includes(variant))
    ? entry.reason
    : '';
};

const suite = await startSuite();
const { check } = suite;

/** One page per house: the house of every sheet for the stubs, a sheet's own for its frames. */
const pages = new Map();
async function house(sheet = '') {
  if (!pages.has(sheet)) {
    const page = await suite.page(sheet ? `sheet=${sheet}&frames=none` : 'frames=none', {
      wait: 300,
    });
    // no entrance: a card mid-way through its rise (a scale) is not its height
    await page.emulateMedia({ reducedMotion: 'reduce' });
    pages.set(sheet, page);
  }
  return pages.get(sheet);
}

/** The catalogue's tags, in its order. */
const tags = await (
  await house()
).evaluate(async () => (await window.fluvyCatalogue()).map(([tag]) => tag));
const strangers = [...wanted].filter((tag) => !tags.includes(tag));
if (strangers.length) throw new Error(`--cards: no card ${strangers.join(', ')}`);

/**
 * Each variant of a card: its config (the stub's, or the frame's) with the variant written over it, and the widths
 * it is drawn at; or why it cannot be drawn.
 */
const plan = (page, tag, source) =>
  page.evaluate(
    async ({ tag, source, HALF, FULL }) => {
      const card = window.customElements.get(tag);
      const hass = window.fluvyMock.hass();
      let base;
      try {
        if (source) {
          const [sheet, title, index] = source;
          const frame = window.fluvySheets[sheet]?.frames.find((f) => f.title === title);
          // its own columns stay its frame's: the twins are given theirs
          const config = Object.fromEntries(
            Object.entries(frame?.cards[index] ?? {}).filter(([key]) => key !== 'cols'),
          );
          if (config.type !== `custom:${tag}`)
            return { error: `no ${tag} at ${source.join(' / ')}` };
          base = config;
        } else
          base = {
            ...((await card.getStubConfig?.(hass, Object.keys(hass.states))) ?? {}),
            type: `custom:${tag}`,
          };
      } catch (error) {
        return { error: `its stub throws: ${error?.message ?? error}` };
      }
      const fields = (schema) =>
        schema.flatMap((item) => (item.schema ? fields(item.schema) : item.name ? [item] : []));
      const form = fields(card.getConfigForm?.().schema ?? []);
      const axis = form.find((f) => f.name === 'variant') ?? form.find((f) => f.name === 'size');
      const options = axis?.selector?.select?.options?.map((o) => o.value ?? o) ?? [];
      const variants = options.length
        ? options.map((value) => ({
            variant: `${axis.name}=${value}`,
            config: { ...base, [axis.name]: value },
          }))
        : [{ variant: 'default', config: base }];
      return {
        variants: variants.map(({ variant, config }) => {
          const el = document.createElement(tag);
          try {
            el.setConfig(config);
          } catch (error) {
            return { variant, error: `setConfig throws: ${error?.message ?? error}` };
          }
          let columns = 12;
          try {
            columns = el.getGridOptions?.().columns ?? 12;
          } catch {
            // a card that cannot say takes the section
          }
          const half = typeof columns === 'number' && columns <= 6;
          return { variant, config, half, widths: half ? HALF : FULL };
        }),
      };
    },
    { tag, source, HALF, FULL },
  );

/**
 * Mounts every case's twins — the live one first, then the other in its broken house — lets them settle and measures
 * both: the card's own box (what it renders at its root, as heights.mjs reads it), whether it hid itself or drew its
 * quiet line, its `getCardSize`, and its declared height.
 */
const measure = (page, tag, source, cases) =>
  page.evaluate(
    async ({ tag, source, cases, found }) => {
      const frame =
        source && window.fluvySheets[source[0]]?.frames.find((f) => f.title === source[1]);
      const live = (frame?.hass ?? ((hass) => hass))(window.fluvyMock.hass());
      /**
       * Every entity the card reads: what it watches, and every id its config names — only the latter for a card that
       * finds the rest, missing.
       */
      const entitiesOf = (el, config, named = false) => {
        const ids = new Set();
        try {
          if (!named) for (const id of el.watched?.() ?? []) if (live.states[id]) ids.add(id);
        } catch {
          // a card that cannot say: its config names them
        }
        const walk = (value) => {
          if (typeof value === 'string') {
            if (live.states[value]) ids.add(value);
          } else if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') Object.values(value).forEach(walk);
        };
        walk(config);
        return [...ids].sort();
      };
      const box = (el) => {
        const root = [...(el.renderRoot?.children ?? [])].find((n) => n.localName !== 'style');
        return root ? root.getBoundingClientRect().height : 0;
      };
      const read = async (el) => ({
        height: Math.round(box(el) * 100) / 100,
        hidden: el.hidden || getComputedStyle(el).display === 'none',
        quiet: Boolean(el.renderRoot?.querySelector('.fv-card--empty')),
        size: await el.getCardSize?.(),
      });
      const frames = () =>
        new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

      const stage = document.getElementById('stage');
      stage.replaceChildren();
      const pairs = cases.map((c) => {
        // a section of two columns, each the card's width; neither twin stretched to the other's height
        const section = document.createElement('section');
        section.className = 'pg-frame';
        section.dataset['stress'] = `unavailable/${tag} · ${c.variant} · ${c.kind} · ${c.width}`;
        section.style.width = `${c.width * 2 + 16}px`;
        section.style.gridTemplateColumns = `${c.width}px ${c.width}px`;
        section.style.alignItems = 'start';
        stage.append(section);
        const make = () => {
          const el = document.createElement(tag);
          el.style.gridColumn = 'auto';
          el.setConfig(c.config);
          return el;
        };
        const a = make();
        a.hass = live;
        section.append(a);
        return { c, section, a, make };
      });
      await Promise.all(pairs.map(({ a }) => a.updateComplete));
      await frames();
      /** A config with every id in `ids` renamed to one the house has never had: this page never reads it. */
      const unread = (value, ids) =>
        typeof value === 'string'
          ? ids.includes(value)
            ? `${value}_never_read`
            : value
          : Array.isArray(value)
            ? value.map((item) => unread(item, ids))
            : value && typeof value === 'object'
              ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unread(v, ids)]))
              : value;
      for (const pair of pairs) {
        const never = pair.c.kind === 'never';
        pair.ids = entitiesOf(pair.a, pair.c.config, never || (found && pair.c.kind === 'missing'));
        // broken from its first frame, as a dashboard opened while the device is away
        pair.b = never ? document.createElement(tag) : pair.make();
        if (never) {
          pair.b.style.gridColumn = 'auto';
          pair.b.setConfig(unread(pair.c.config, pair.ids));
          pair.b.hass = live;
        } else pair.b.hass = window.fluvyOutOfReach(pair.ids, pair.c.kind)(live);
        pair.section.append(pair.b);
      }
      await Promise.all(pairs.map(({ b }) => b.updateComplete));
      await document.fonts.ready;
      // their width taken, the house's answers in (history, statistics, forecasts: 30 ms), drawn again
      await new Promise((done) => setTimeout(done, 700));
      await frames();
      const out = [];
      for (const { c, a, b, ids } of pairs) {
        const declared = a.constructor.layoutHeight?.(a.config, a.hass);
        // never read, the card declares what it draws where the house is not there to say
        const unread =
          c.kind === 'never' ? b.constructor.layoutHeight?.(b.config, b.hass) : declared;
        out.push({
          variant: c.variant,
          kind: c.kind,
          width: c.width,
          half: c.half,
          ids,
          declared: typeof declared === 'number' ? declared : null,
          unread: typeof unread === 'number' ? unread : null,
          live: await read(a),
          twin: await read(b),
        });
      }
      stage.replaceChildren();
      return out;
    },
    { tag, source, cases, found: tag in FOUND },
  );

/** What failed, what is listed and why, and the declarations that drift, for `--json`. */
const failing = [];
const listed = [];
const drifts = new Set();
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
const round = (n) => Math.round(n * 10) / 10;
/** A card listed with its reason, said once for all the states it is listed in. */
const list = (entry, words) => {
  const same = listed.find(
    (e) => e.card === entry.card && e.variant === entry.variant && e.reason === entry.reason,
  );
  if (same) {
    if (entry.state) same.states.push(entry.state);
    return;
  }
  const { state, ...rest } = entry;
  listed.push({ ...rest, states: state ? [state] : [] });
  console.log(`– ${[entry.card, entry.variant].filter(Boolean).join(' · ')}: ${words}`);
};

/** One source of one card: its variants' twins at each width, one check per variant and state over its widths. */
async function hold(tag, source) {
  const card = source === 'stub' ? tag : `${tag} (${source[0]} / ${source[1]})`;
  const frame = source === 'stub' ? undefined : source;
  const page = await house(frame?.[0]);
  const planned = await plan(page, tag, frame);
  if (planned.error) {
    list({ card, reason: planned.error }, `listed, ${planned.error}`);
    return;
  }
  const cases = [];
  for (const v of planned.variants) {
    if (v.error) {
      list({ card, variant: v.variant, reason: v.error }, `listed, ${v.error}`);
      continue;
    }
    for (const width of v.widths)
      if (!only.size || only.has(width))
        for (const kind of KINDS) cases.push({ ...v, width, kind });
  }
  if (!cases.length) return;
  const rows = await measure(page, tag, frame, cases);

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.variant} · ${row.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [key, group] of groups) {
    const at = `${card} · ${key}`;
    const { variant, kind, ids } = group[0];
    const entry = { card, variant, state: kind };
    if (!ids.length) {
      const why = kind === 'missing' ? FOUND[tag] : undefined;
      if (why) list({ ...entry, reason: why }, `listed missing, it ${why}`);
      else list({ ...entry, reason: 'shows no entity' }, 'listed, it shows no entity');
      continue;
    }
    if (group.every((row) => row.live.hidden)) {
      list({ ...entry, reason: 'hides itself while live' }, 'listed, it hides itself while live');
      continue;
    }
    if (group.every((row) => row.live.quiet)) {
      list(
        { ...entry, reason: 'draws its quiet line while live' },
        `listed, it draws its quiet line while live (${ids.join(', ')}): a fuller config is due`,
      );
      continue;
    }
    if (group.every((row) => row.twin.hidden)) {
      list(
        { ...entry, reason: `hides itself while ${kind} (hide_empty)` },
        `listed, it hides itself while its entities are ${kind}`,
      );
      continue;
    }
    const wrong = [];
    const content = byContent(tag, variant, kind);
    // never read, the card cannot know what the live one does (its presets, its features): it is held to what it
    // declares, not to its twin's height or size
    const never = kind === 'never';
    for (const row of group) {
      const said = [];
      const delta = round(row.twin.height - row.live.height);
      if (Math.abs(delta) > TWINS && !content && !never)
        said.push(
          `live ${round(row.live.height)} · ${kind} ${round(row.twin.height)} (${sign(delta)})`,
        );
      if (row.twin.quiet && !row.live.quiet) said.push('draws its one quiet line');
      if (row.twin.hidden !== row.live.hidden)
        said.push(row.twin.hidden ? 'hides itself' : 'shows itself');
      if (row.twin.size !== row.live.size && !never)
        said.push(`getCardSize ${row.live.size} → ${row.twin.size}`);
      if (
        row.width === DECLARED_AT[row.half ? 'half' : 'full'] &&
        row.unread !== null &&
        row.declared !== null &&
        Math.abs(row.twin.height - row.unread) > DECLARED
      ) {
        // off its declared height while the live twin is not: the state moved it; both alike: the declaration drifts
        const drift = Math.abs(row.live.height - row.declared) > DECLARED;
        if (!drift) said.push(`declared ${row.unread}, ${kind} ${round(row.twin.height)}`);
        else if (Math.abs(delta) <= TWINS || never)
          drifts.add(
            `${card} · ${variant} @ ${row.width}: declared ${row.declared}, drawn ${round(row.live.height)}`,
          );
      }
      if (said.length) {
        wrong.push(`${row.width}: ${said.join(', ')}`);
        failing.push({ ...entry, width: String(row.width), detail: said.join(', ') });
      }
    }
    check(
      content
        ? `${at}: keeps its rows, its height its content's — ${content} (${group.map((row) => row.width).join(', ')})`
        : never
          ? `${at}: draws what it declares, never one quiet line (${group.map((row) => row.width).join(', ')})`
          : `${at}: keeps its size (${group.map((row) => row.width).join(', ')})`,
      !wrong.length,
      wrong.join(' · '),
    );
  }
}

for (const tag of tags)
  if (!wanted.size || wanted.has(tag))
    for (const source of SOURCES[tag] ?? ['stub']) await hold(tag, source);

if (drifts.size) {
  console.log(`\n${drifts.size} declared heights drift, live and broken alike (advisory):`);
  for (const drift of drifts) console.log(`  ${drift}`);
}
console.log(`\n${listed.length} listed`);
if (args.json) {
  const file = resolve(args.json);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ failing, listed, drifts: [...drifts] }, null, 2)}\n`);
  console.log(`written to ${file}`);
}
await suite.finish();
