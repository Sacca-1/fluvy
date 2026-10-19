#!/usr/bin/env node
/**
 * The built bundle, not the playground: what a page says before the settings panel or the Activity page was ever
 * opened. The playground registers every part of English at start; the bundle registers a lazy family's part only
 * when the family's chunk lands, so this is where a word said outside its chunk shows — as a key. Serves
 * `custom_components/fluvy/frontend` (run `pnpm build` first) on a dashboard's address under a bare stand-in Home
 * Assistant, in English and in German, and proves:
 * - a wall's pieces (its way back, its corner both ways, its toast both ways) say their words, and the panel's chunk
 *   never loaded;
 * - the schedule sheet's details say "Open in Home Assistant" and "Traces", and the Activity page's chunk never
 *   loaded.
 *
 *   node interactions-built.mjs        (`pnpm visual` runs it with the suites)
 */
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = join(ROOT, 'custom_components', 'fluvy', 'frontend');
const LOCALES = join(ROOT, 'packages', 'core', 'src', 'i18n', 'locales');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await readJson(join(FRONTEND, 'manifest.json')).catch(() => {
  console.error(`${FRONTEND}: no build (run pnpm build)`);
  process.exit(1);
});
/** A chunk's file by its name (`chunks/wall-<hash>.js`). */
const chunk = (name) =>
  Object.keys(manifest.files).find((file) =>
    new RegExp(`^chunks/${name}-[\\w-]{8}\\.js$`).test(file),
  );

/** The words each language must say: English from all its parts, German from its catalogue. */
const english = {};
for (const part of await readdir(join(LOCALES, 'en')))
  Object.assign(english, await readJson(join(LOCALES, 'en', part)));
const WORDS = { en: english, de: await readJson(join(LOCALES, 'de.json')) };

/** A dashboard's page: the bundle and nothing else, in the language asked for (`?lang=`). */
const page = (lang) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body><script type="module" src="/fluvy.js"></script></body></html>`;
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/lovelace/')) {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(page(url.searchParams.get('lang') ?? 'en'));
    return;
  }
  const file = join(FRONTEND, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launch();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * In the page, before the bundle: the bare Home Assistant a piece needs (a language, an administrator, one
 * automation), and every word a piece shows — its text and its labels, through the shadow roots.
 */
function standIn() {
  window.standInHass = (language) => ({
    language,
    locale: { language, number_format: 'language', time_format: 'language' },
    config: { time_zone: 'UTC', unit_system: { temperature: '°C' } },
    user: { is_admin: true, name: 'Ada' },
    states: {
      'automation.morning': {
        entity_id: 'automation.morning',
        state: 'on',
        attributes: { friendly_name: 'Morning', id: 'morning' },
        last_changed: '2026-10-17T06:00:00Z',
        last_updated: '2026-10-17T06:00:00Z',
        context: { id: '', parent_id: null, user_id: null },
      },
    },
    entities: {},
    devices: {},
    areas: {},
    themes: { darkMode: false },
    localize: (key) => key,
  });
  window.shownWords = () => {
    const out = [];
    const walk = (root) => {
      for (let node = root.firstChild; node; node = node.nextSibling) {
        // 3: a text, 1: an element
        if (node.nodeType === 3) out.push(node.textContent.trim());
        if (node.nodeType !== 1) continue;
        for (const name of ['aria-label', 'title'])
          if (node.hasAttribute(name)) out.push(node.getAttribute(name));
        if (node.shadowRoot) walk(node.shadowRoot);
        walk(node);
      }
    };
    walk(document.body);
    return out.filter(Boolean);
  };
}

for (const lang of ['en', 'de']) {
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(String(error)));
  await tab.addInitScript(standIn);
  await tab.goto(`${BASE}/lovelace/home?lang=${lang}`);
  // the bundle running (`window.__fluvy`), its families defined, the language it speaks here
  await tab.waitForFunction(() => Boolean(window.__fluvy), null, { timeout: 15000 });
  await tab.waitForFunction(() => Boolean(window.customElements.get('fluvy-automations-card')));
  if (lang !== 'en')
    await tab.waitForFunction(
      (name) => performance.getEntriesByType('resource').some((e) => e.name.includes(name)),
      `/chunks/lang-${lang}-`,
    );
  await tab.waitForTimeout(300);
  const fetched = () =>
    tab.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));

  // the wall's pieces, as the controller mounts them on a device that is a wall
  const wall = await tab.evaluate(
    async ({ file, lang }) => {
      await import(`/${file}`);
      const hass = window.standInHass(lang);
      const make = (tag, props) => Object.assign(document.createElement(tag), { hass, ...props });
      document.body.replaceChildren(
        make('fluvy-wall-back', {}),
        make('fluvy-wall-corner', { mode: 'button' }),
        make('fluvy-wall-corner', { mode: 'hold' }),
        make('fluvy-wall-toast', { kind: 'paused' }),
        make('fluvy-wall-toast', { kind: 'left' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      return window.shownWords();
    },
    { file: chunk('wall'), lang },
  );
  const words = WORDS[lang];
  const wallWords = ['back', 'leave_tap', 'leave', 'paused', 'resume', 'left', 'return'].map(
    (key) => words.wall[key],
  );
  const missing = wallWords.filter((word) => !wall.includes(word));
  check(`${lang}: a wall's pieces say their words`, missing.length === 0, missing.join(', '));
  check(
    `${lang}: …without the settings panel's chunk`,
    !(await fetched()).some((name) => name.includes('/chunks/panel-')),
  );

  // the schedule sheet's details of an automation, as the automations card opens them
  const sheet = await tab.evaluate(
    async ({ file, lang }) => {
      await import(`/${file}`);
      const element = Object.assign(document.createElement('fluvy-schedule-sheet'), {
        hass: window.standInHass(lang),
      });
      document.body.replaceChildren(element);
      await element.updateComplete;
      const nothing = () => undefined;
      element.open({
        entity: 'automation.morning',
        alias: 'Morning',
        configId: 'morning',
        run: nothing,
        toggle: nothing,
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      return window.shownWords();
    },
    { file: chunk('automations-sheet'), lang },
  );
  const links = [words.automations.open_in_ha, words.common.trace];
  check(
    `${lang}: the schedule sheet's details say ${links.map((w) => `"${w}"`).join(' and ')}`,
    links.every((word) => sheet.includes(word)),
    sheet.slice(0, 12).join(' · '),
  );
  check(
    `${lang}: …without the Activity page's chunk`,
    !(await fetched()).some((name) => name.includes('/chunks/activity-')),
  );
  check(`${lang}: no page error`, errors.length === 0, errors.join(' | '));
  await tab.close();
}

await browser.close();
server.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
