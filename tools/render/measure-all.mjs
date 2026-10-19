/**
 * Every measurable page at every probe, one report each: the playground's sheets (`[data-frame]`) and the settings
 * panel's tabs (`fluvy-panel`), including the moments that change what a tab shows (the language menu, with and
 * without the Popover API; a custom palette; the house's palettes; its status colours; every template's dashboard; this
 * device a wall).
 * Reports land in `--out` (default `out/measure`); the violations are then held against the known ones, and the exit
 * code is 1 when one is new or a known one is gone — after every page has been measured, so one report never hides
 * another.
 *
 *   PLAYGROUND=http://127.0.0.1:5183/ node tools/render/measure-all.mjs [--out out/measure] [--only home,climate]
 *     [--lang en,de | all] [--widths 360,412,1400] [--cards 152,172,211,266] [--jobs 4]
 *     [--known tools/render/known-violations.json | none] [--write-known]
 *
 * A probe is a card's width, drawn the way the interaction suites draw it: the frame's own width (`&width=`), in a
 * viewport that leaves the page's chrome (a 32 stage and a 16 frame on each side, 96 in all) room and nothing more, so
 * a frame with a width of its own is squeezed to the probe like any other.
 *   `--widths`  a phone or a desktop: a phone V wide gives its section V − 32 (Fluvy's 16 on each side), never more
 *               than a desktop's 360. So 360 draws a 328 card (its halves 156), 412 a 380 card (halves 182) and
 *               1400 a 360 card (halves 172). Every frame, and the panel's tabs at the viewport itself.
 *   `--cards`   one card. Under the full-card floor (211) it is half a section: the frames that hold a half card
 *               (`cols: 6`) are drawn at twice that and a gap (152 → a 320 section, 172 → 360), so their halves are
 *               that wide. From 211 up, the frames whose every card spans the section are drawn at that width.
 * With neither flag, all seven; with one, only what it names. `--lang` takes the languages to measure, `all` every one
 * the catalogue speaks (a word that fits in English may not in German, French or Portuguese, and not at 211).
 *
 * The known violations (`tools/render/known-violations.json`) are the ones a later block owns: each names its page,
 * frame, rule and selector, the widths it is seen at in each language, and its owner. A run passes when what it sees
 * is known, and fails when a known one is no longer seen at a probe and language it measured: the file only shrinks.
 * `--write-known` rewrites it to what this run saw (within what it measured), keeping the owners; a new entry's owner
 * is `triage`, to be named by hand.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYGROUND } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const args = process.argv.slice(2).filter((token) => token !== '--');
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const list = (name, fallback = '') =>
  option(name, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const numbers = (name) =>
  list(name)
    .map(Number)
    .filter((n) => n > 0);

const outDir = resolve(root, option('--out', 'out/measure'));
const only = list('--only');
/** Every language the catalogue speaks: English's folder and the others' files. */
const catalogue = join(root, 'packages', 'core', 'src', 'i18n', 'locales');
const everyLanguage = async () =>
  (await readdir(catalogue, { withFileTypes: true }))
    .map((entry) => (entry.isDirectory() ? entry.name : entry.name.replace(/\.json$/, '')))
    .sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
const langs = list('--lang', 'en').includes('all') ? await everyLanguage() : list('--lang', 'en');
const jobs = Math.max(1, Number(option('--jobs', '1')) || 1);
const knownFile = option('--known', join(here, 'known-violations.json'));
const writeKnown = args.includes('--write-known');

/** The full-card floor: a card under it is half a section. */
const FLOOR = 211;
/** The chrome around a frame: the stage's 32 and the frame's 16, on each side. */
const CHROME = 96;
/** A desktop's section: what the sheets are drawn at. */
const SECTION = 360;
/** A phone's section is its width less Fluvy's 16 on each side. */
const PHONE_SIDES = 32;
/** The gap between two cards of a section. */
const GAP = 16;

const pageWidths = numbers('--widths');
const cardWidths = numbers('--cards');
const named = pageWidths.length || cardWidths.length;
const WIDTHS = named ? pageWidths : [360, 412, 1400];
const CARDS = named ? cardWidths : [152, 172, 211, 266];
const shared = WIDTHS.filter((width) => CARDS.includes(width));
if (shared.length) {
  console.error(`${shared.join(', ')}: a probe is a page's width or a card's, not both`);
  process.exit(2);
}

const sheets = (await readdir(join(root, 'apps', 'playground', 'src', 'sheets')))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.replace(/\.ts$/, ''))
  .sort();
const PANEL = [
  ['appearance', ''],
  ['appearance-custom', 'appearance&state=custom'],
  ['appearance-palettes', 'appearance&state=custom,palettes'],
  // the house's status colours made its own: a status's colours, its field and the line that says two are close
  ['appearance-statuses', 'appearance&state=statuses'],
  ['scope', 'scope'],
  ['dashboard', 'dashboard&state=dashboards'],
  ['wall', 'wall&state=wall'],
  ['wall-night', 'wall&state=wall,night'],
  ['preferences', 'preferences'],
  ['preferences-menu', 'preferences&state=menu'],
];

/** The pages to measure: `{ name, query, panel }`; a page may keep to some page widths of its own. */
const pages = [
  ...sheets.map((sheet) => ({ name: sheet, query: `sheet=${sheet}`, panel: false })),
  ...PANEL.map(([name, tab]) => ({
    name: `panel-${name}`,
    query: `panel=${tab || 'appearance'}`,
    panel: true,
  })),
  // the menu without the Popover API (an older WebView), on a phone only
  {
    name: 'panel-preferences-nopopover',
    query: 'panel=preferences&state=menu&nopopover=1',
    panel: true,
    widths: [360],
  },
].filter((page) => !only.length || only.includes(page.name));

/**
 * How a probe draws a page: the frames' width, the viewport and which frames are measured. The playground marks every
 * frame with its narrowest card's span (`data-span`, after Home Assistant's clamp to the card's own minimum).
 */
const plan = (page, probe) => {
  if (page.panel) return { query: page.query, viewport: probe.width, frame: 'fluvy-panel' };
  if (probe.kind === 'page') {
    const frame = Math.min(probe.width - PHONE_SIDES, SECTION);
    return {
      query: `${page.query}&width=${frame}`,
      viewport: Math.max(probe.width, frame + CHROME),
      frame: '[data-frame]',
    };
  }
  const half = probe.width < FLOOR;
  const frame = half ? 2 * probe.width + GAP : probe.width;
  return {
    query: `${page.query}&width=${frame}`,
    viewport: frame + CHROME,
    frame: half ? '[data-frame][data-span="6"]' : '[data-frame][data-span="12"]',
  };
};

const tasks = [];
for (const lang of langs)
  for (const page of pages) {
    for (const width of named ? WIDTHS : (page.widths ?? WIDTHS))
      tasks.push({ page, lang, probe: { kind: 'page', width } });
    if (!page.panel)
      for (const width of CARDS) tasks.push({ page, lang, probe: { kind: 'card', width } });
  }

/** One page at one probe, measured by measure.mjs in its own browser: its report, or null when it gave none. */
const run = async ({ page, lang, probe }) => {
  const { query, viewport, frame } = plan(page, probe);
  const out = join(outDir, `${page.name}-${probe.width}${lang === 'en' ? '' : `-${lang}`}`);
  await rm(`${out}.json`, { force: true }); // an earlier run's report is never this one's
  const text = await new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        join(here, 'measure.mjs'),
        '--page',
        `${PLAYGROUND}?${query}${lang === 'en' ? '' : `&lang=${lang}`}`,
        '--frame',
        frame,
        '--width',
        String(viewport),
        '--grid',
        '4',
        '--empty',
        probe.kind === 'card' ? 'pass' : 'fail',
        '--out',
        `${out}.json`,
        '--md',
        `${out}.md`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let said = '';
    child.stdout.on('data', (chunk) => (said += chunk));
    child.stderr.on('data', (chunk) => (said += chunk));
    child.on('close', () => done(said));
  });
  const report = await readFile(`${out}.json`, 'utf8')
    .then((body) => JSON.parse(body))
    .catch(() => null);
  return { report, text };
};

/* ------------------------------------------------------------------ the known violations */

/** What the known file says about itself (JSON has no comments). */
const ABOUT = [
  'Violations a later block owns: measure-all passes while what it sees is listed here, and fails when a listed one is no longer seen (remove it: this file only shrinks).',
  'An entry is a page, a frame, a rule and a selector; `at` holds the widths it is seen at per language (page widths 360/412/1400, card widths 152/172/211/266); `owner` is the block that removes it.',
  'Rewrite it with `node tools/render/measure-all.mjs --write-known` (new entries are `triage`); see docs/development.md.',
];
const keyOf = (v) => [v.sheet, v.frame, v.rule, v.selector].join('\u0000');
const readKnown = async () => {
  if (knownFile === 'none') return [];
  const body = await readFile(resolve(root, knownFile), 'utf8').catch(() => null);
  return body ? JSON.parse(body).violations : [];
};
const known = await readKnown();
const knownBy = new Map(known.map((entry) => [keyOf(entry), entry]));
const isKnown = (v, width, lang) => knownBy.get(keyOf(v))?.at?.[lang]?.includes(width) ?? false;

/* ------------------------------------------------------------------------------- run */

await mkdir(outDir, { recursive: true });
const started = Date.now();
const results = new Array(tasks.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      const task = tasks[index];
      const result = await run(task);
      results[index] = result;
      const label = `${task.page.name} @ ${task.probe.kind === 'card' ? 'card ' : ''}${task.probe.width}${task.lang === 'en' ? '' : ` (${task.lang})`}`;
      const found = result.report?.frames.flatMap((frame) => frame.violations) ?? [];
      if (!result.report) console.log(`✗ ${label} — no report`);
      else if (!result.report.frames.length) console.log(`– ${label} — no frame to measure`);
      else if (!found.length) console.log(`✓ ${label}`);
      else console.log(`· ${label} — ${found.length} violations`);
    }
  }),
);

/** Every violation this run saw, as the known file names them. */
const seen = [];
const measured = new Set(); // `${sheet}|${width}|${lang}`: what this run covered
const broken = [];
tasks.forEach((task, index) => {
  const { report, text } = results[index];
  const width = task.probe.width;
  if (!report) {
    // what it said: its error, else its last line
    const said = text.trim().split('\n');
    const why = said.find((line) => /Error:|ERR_/.test(line)) ?? said.at(-1) ?? '';
    broken.push(`${task.page.name} @ ${width} (${task.lang}): ${why.trim()}`);
    return;
  }
  measured.add(`${task.page.name}|${width}|${task.lang}`);
  for (const frame of report.frames)
    for (const v of frame.violations)
      seen.push({
        sheet: task.page.name,
        frame: String(frame.label).replace(`${task.page.name}/`, ''),
        rule: v.rule,
        selector: v.selector,
        detail: v.detail,
        width,
        lang: task.lang,
      });
});

const fresh = seen.filter((v) => !isKnown(v, v.width, v.lang));
const seenAt = new Set(seen.map((v) => `${keyOf(v)}|${v.width}|${v.lang}`));
/** A known violation at a probe and language this run measured, and did not see there. */
const gone = known.flatMap((entry) =>
  Object.entries(entry.at ?? {}).flatMap(([lang, widths]) =>
    widths
      .filter(
        (width) =>
          measured.has(`${entry.sheet}|${width}|${lang}`) &&
          !seenAt.has(`${keyOf(entry)}|${width}|${lang}`),
      )
      .map((width) => ({ ...entry, width, lang })),
  ),
);

if (writeKnown) await rewriteKnown();

const total = tasks.length;
console.log(
  `\n${total - broken.length}/${total} pages measured, ${seen.length} violations (${seen.length - fresh.length} known) in ${Math.round((Date.now() - started) / 1000)} s → ${outDir}`,
);
for (const line of broken) console.log(`  no report: ${line}`);
const shown = (v) =>
  `${v.sheet} · ${v.frame} @ ${v.width}${v.lang === 'en' ? '' : ` (${v.lang})`}: ${v.rule} ${v.selector} — ${v.detail}`;
if (fresh.length) {
  console.log(`\n${fresh.length} new violations:`);
  for (const v of fresh.slice(0, 200)) console.log(`  ${shown(v)}`);
  if (fresh.length > 200)
    console.log(`  … and ${fresh.length - 200} more (the reports have them all)`);
}
if (gone.length && !writeKnown) {
  console.log(`\n${gone.length} known violations no longer seen: remove them from ${knownFile}`);
  for (const v of gone.slice(0, 200))
    console.log(`  ${shown({ ...v, detail: `owner ${v.owner}` })}`);
}
const failed = broken.length || (!writeKnown && (fresh.length || gone.length));
process.exit(failed ? 1 : 0);

/**
 * The known file as this run saw it: within what the run measured, an entry keeps the probes and languages it was
 * seen at (none left: the entry goes) and gains the new ones; outside it, nothing changes. New entries are `triage`'s.
 */
async function rewriteKnown() {
  const entries = new Map(
    known.map((entry) => [
      keyOf(entry),
      {
        ...entry,
        at: Object.fromEntries(
          Object.entries(entry.at ?? {}).map(([lang, widths]) => [lang, [...widths]]),
        ),
      },
    ]),
  );
  for (const v of gone) {
    const entry = entries.get(keyOf(v));
    entry.at[v.lang] = entry.at[v.lang].filter((width) => width !== v.width);
    if (!entry.at[v.lang].length) delete entry.at[v.lang];
  }
  for (const v of fresh) {
    const key = keyOf(v);
    if (!entries.has(key))
      entries.set(key, {
        sheet: v.sheet,
        frame: v.frame,
        rule: v.rule,
        selector: v.selector,
        detail: v.detail,
        owner: 'triage',
        at: {},
      });
    const entry = entries.get(key);
    entry.at[v.lang] = [...new Set([...(entry.at[v.lang] ?? []), v.width])];
  }
  const ordered = [...entries.values()]
    .filter((entry) => Object.keys(entry.at).length)
    .map(({ sheet, frame, rule, selector, detail, owner, at }) => ({
      sheet,
      frame,
      rule,
      selector,
      detail,
      owner,
      at: Object.fromEntries(
        Object.keys(at)
          .sort()
          .map((lang) => [lang, [...at[lang]].sort((a, b) => a - b)]),
      ),
    }))
    .sort((a, b) =>
      [a.sheet, a.frame, a.rule, a.selector].join('\u0000') <
      [b.sheet, b.frame, b.rule, b.selector].join('\u0000')
        ? -1
        : 1,
    );
  const prettier = await import('prettier');
  const file = resolve(
    root,
    knownFile === 'none' ? join(here, 'known-violations.json') : knownFile,
  );
  const body = JSON.stringify({ about: ABOUT, violations: ordered });
  const config = (await prettier.resolveConfig(file)) ?? {};
  await writeFile(file, await prettier.format(body, { ...config, filepath: file }));
  console.log(`\n${file}: ${ordered.length} entries`);
}
