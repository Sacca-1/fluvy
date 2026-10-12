import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Fluvy's one version and licence: the root package.json's (tokens and theme read the same)
const { version, license } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string; license: string };

/**
 * Lit `css` literals are written for reading (Prettier lays them out rule by rule); the bundle carries them
 * compact. Only their static text changes — comments go, whitespace runs become one space, none is kept
 * beside `{`, `}` or `;` — never an interpolation, and only in fluvy's own sources.
 */
function compactCssLiterals(): Plugin {
  const compact = (text: string): string =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{};])\s*/g, '$1');
  return {
    name: 'fluvy-compact-css-literals',
    transform(code, id) {
      if (!id.includes('/packages/') || id.includes('/node_modules/') || !code.includes('css`'))
        return null;
      const out = code.replace(/\bcss`((?:[^`\\]|\\.)*)`/g, (_whole, body: string) => {
        const parts = body.split(/(\$\{[^}]*\})/);
        return `css\`${parts
          .map((part) => (part.startsWith('${') ? part : compact(part)))
          .join('')
          .trim()}\``;
      });
      return { code: out, map: null };
    },
  };
}

/**
 * What the pages and the settings panel share and a dashboard never needs: the date picker both pages open, the
 * time field inside it, the dropdown. Fetched with whichever of them opens first; core must not reach for any of
 * it (a static import from core would drag the chunk onto every dashboard — `finish.mjs` refuses such a build).
 */
const PAGES =
  /\/packages\/(cards\/src\/shared\/date-picker\.ts|ui\/src\/controls\/(time-field|select)\.ts)/;

/** What only the Activity page uses (all of its folder but the takeover): fetched the first time `/logbook` is opened. */
const ACTIVITY =
  /\/packages\/(cards\/src\/activity\/(?!takeover\.ts)|core\/src\/activity\/|ui\/src\/controls\/time-(rail|field)\.ts)/;

/**
 * What only the History page uses (its folder but the takeover, and the window it reads — not `series.ts`, which the
 * sensor and energy cards draw their sparklines from): fetched the first time `/history` is opened.
 */
const HISTORY =
  /\/packages\/(cards\/src\/history\/(?!takeover\.ts)|core\/src\/history\/(?!series\.ts))/;

/** Fluvy's settings panel (all of its folder but the switch that fetches it), the community palettes its gallery lists and the little house its preview answers taps with: fetched when `/fluvy` is opened. */
const PANEL =
  /\/packages\/(cards\/src\/panel\/(?!on-demand\.ts)|tokens\/src\/palettes\/community\/|demo-home\/src\/simulate\.ts)/;

/** The automatic dashboard's strategy (all of its folder but the definer): fetched when a dashboard asks for it. */
const STRATEGY = /\/packages\/cards\/src\/strategy\/(?!define\.ts)/;

/** Wall mode (the controller in core — its switch stays in core's chunk — and the screensaver, corner and toast in cards): fetched only on a device that is a wall. */
const WALL = /\/packages\/(core\/src\/wall\/(?!start\.ts)|cards\/src\/wall\/)/;

/**
 * The energy family (its cards, the flow's drawing and motion, the model they share, every `energy/` helper but the
 * head's fitting, which the other cards use): fetched as the bundle starts —
 * `index.ts` announces the cards and imports this without waiting — and defined as it lands. Home Assistant builds
 * a card again the moment its tag is defined, so a dashboard with energy on it shows it; one without never waits.
 */
const ENERGY =
  /\/packages\/cards\/src\/(energy-cards\.ts|energy\/(?!head\.ts)|energy-flow\/|energy-model\/|energy-devices\/|production\/|history-bars\/|balance\/|grid\/|batteries\/|ev-charger\/|sankey\/|score\/|meters\/)/;

/**
 * The media family (the player and the now-playing strip, and what only they share): fetched as the bundle starts
 * and defined as it lands, as the energy family is (`media-family.ts` stays in core: the names, the heights).
 */
/** The weather card (its forecast strips and rows): fetched as the bundle starts and defined as it lands. */
const WEATHER = /\/packages\/cards\/src\/(weather-cards\.ts|weather\/)/;

const MEDIA = /\/packages\/cards\/src\/(media-cards\.ts|media\/|now-playing\/|shared\/media\.ts)/;

/**
 * The devices family (the lock, the alarm and its keypad, the camera, the 3D printer): fetched as the bundle starts and defined as it
 * lands, as the energy family is (`devices-family.ts` stays in core: the names, the heights; so do the rows the lock
 * shares with the entities card, `lock/rows.ts`).
 */
const DEVICES =
  /\/packages\/cards\/src\/(devices-cards\.ts|camera\/|alarm\/|lock\/lock-card\.ts|printer\/)/;

/**
 * The schedule sheet (its targets, day chips and moment rows): fetched the first time a schedule is opened or added,
 * never by a dashboard that only lists; it reaches the page controls (the time field) through the pages chunk.
 */
const AUTOMATIONS_SHEET = /\/packages\/cards\/src\/automations\/sheet\//;

/**
 * The automations family (the card, its words' layout, the schedule model and the store): fetched as the bundle
 * starts and defined as it lands, as the devices family is (`automations-family.ts` stays in core: the name, the height).
 */
const AUTOMATIONS = /\/packages\/cards\/src\/(automations-cards\.ts|automations\/)/;

/** The light card's colour controls (the quick colours' table and row, the hue maths): fetched by the first colour bulb drawn. */
const LIGHT_COLOUR = /\/packages\/cards\/src\/light\/colour\.ts/;

/** The icons a view's name says, for a tab row asked for icons whose views have none: fetched the first time it is. */
const VIEW_ICONS = /\/packages\/core\/src\/look\/view-icons\.ts/;

/** The cards' visual editor (the rows editor every card's `getConfigElement` builds): fetched the first time a card is edited. */
const EDITOR = /\/packages\/cards\/src\/shared\/rows-editor\.ts/;

/** A language's catalogue (English ships in core): fetched the first time that language is spoken. */
const LANGUAGE = /\/packages\/core\/src\/i18n\/locales\/(?!en\.json)([\w-]+)\.json/;

/**
 * Where each module goes, first match wins: a language's catalogue, the page controls, the Activity page, the History
 * page, the settings panel, the strategy, the wall, the media, energy, devices and automations families (the schedule
 * sheet on its own), the cards' editor, and everything else
 * (Fluvy's packages and Lit) in `core`. The bundle's own entry stays in `fluvy.js`. Rolldown processes the groups in this order; the priorities
 * only say so out loud.
 */
const GROUPS: ReadonlyArray<{
  name: string | ((id: string) => string);
  test: RegExp | ((id: string) => boolean);
}> = [
  { name: (id) => `lang-${LANGUAGE.exec(id)?.[1]}`, test: LANGUAGE },
  { name: 'pages', test: PAGES },
  { name: 'activity', test: ACTIVITY },
  { name: 'history', test: HISTORY },
  { name: 'panel', test: PANEL },
  { name: 'strategy', test: STRATEGY },
  { name: 'wall', test: WALL },
  { name: 'weather', test: WEATHER },
  { name: 'media', test: MEDIA },
  { name: 'energy', test: ENERGY },
  { name: 'devices', test: DEVICES },
  { name: 'automations-sheet', test: AUTOMATIONS_SHEET },
  { name: 'automations', test: AUTOMATIONS },
  { name: 'light-colour', test: LIGHT_COLOUR },
  { name: 'editor', test: EDITOR },
  { name: 'view-icons', test: VIEW_ICONS },
  { name: 'core', test: (id) => !id.includes('/packages/bundle/src/') },
];

/**
 * The build Home Assistant loads (the integration serves it from `custom_components/fluvy/frontend`, under a URL
 * named after the build) and what it shares with the pages loaded on demand. The entry keeps only its own code and
 * imports the rest from `chunks/core-<hash>.js`; the pages fetched on demand (Activity, History, the settings panel)
 * import the same file, so they all reach one copy of everything. Chunk names carry their content hash: they never
 * go stale. Lit is bundled (pinned to Home Assistant's 3.3.3).
 */
export default defineConfig({
  plugins: [compactCssLiterals()],
  define: { __FLUVY_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2022',
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'fluvy.js' },
    outDir: '../../custom_components/fluvy/frontend',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: { format: { comments: /^!/ }, compress: { passes: 2 } },
    rolldownOptions: {
      // the entry's exports stay as written (the loader reads `version`); a group may then hold only what its test names
      preserveEntrySignatures: 'allow-extension',
      output: {
        inlineDynamicImports: false,
        chunkFileNames: 'chunks/[name]-[hash].js',
        codeSplitting: {
          // a group holds what its test names, nothing it imports: the imports keep their own chunk (the old Rollup rule)
          includeDependenciesRecursively: false,
          groups: GROUPS.map((group, index) => ({ ...group, priority: GROUPS.length - index })),
        },
        banner: `/*! Fluvy v${version} · a theme and card library for Home Assistant · SPDX-License-Identifier: ${license} · https://github.com/acosta290/fluvy */`,
      },
    },
    sourcemap: false,
    reportCompressedSize: false,
  },
});
