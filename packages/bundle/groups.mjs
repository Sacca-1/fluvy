/*
 * Where each module of the build goes: the bundle's chunk groups, shared by `vite.config.ts` and the tests that hold a
 * family's words to its chunk (`src/english.test.ts`). A group holds what its test names and nothing it imports
 * (`includeDependenciesRecursively: false`); everything no group names lands in `core`, which every page loads — so a
 * family's English part (`core/src/i18n/locales/en/<part>.json`) is named by the family's group, or core keeps it.
 */

/** A language's catalogue (English is in parts: its core part ships in core, a family's with the family): fetched the first time that language is spoken. */
const LANGUAGE = /\/packages\/core\/src\/i18n\/locales\/([\w-]+)\.json/;

/**
 * What the pages and the settings panel share and a dashboard never needs: the date picker both pages open, the
 * time field inside it, the dropdown. Fetched with whichever of them opens first; core must not reach for any of
 * it (a static import from core would drag the chunk onto every dashboard — `finish.mjs` refuses such a build).
 */
const PAGES =
  /\/packages\/(cards\/src\/shared\/date-picker\.ts|ui\/src\/controls\/(time-field|select)\.ts)/;

/** What only the Activity page uses (all of its folder but the takeover, and its English): fetched the first time `/logbook` is opened. */
const ACTIVITY =
  /\/packages\/(cards\/src\/activity\/(?!takeover\.ts)|core\/src\/activity\/|ui\/src\/controls\/time-(rail|field)\.ts|core\/src\/i18n\/locales\/en\/activity\.json)/;

/**
 * What only the History page uses (its folder but the takeover, the window it reads — not `series.ts`, which the
 * sensor and energy cards draw their sparklines from — and its English): fetched the first time `/history` is opened.
 */
const HISTORY =
  /\/packages\/(cards\/src\/history\/(?!takeover\.ts)|core\/src\/history\/(?!series\.ts)|core\/src\/i18n\/locales\/en\/history\.json)/;

/** Fluvy's settings panel (all of its folder but the switch that fetches it, and its English), the community palettes its gallery lists and the little house its preview answers taps with: fetched when `/fluvy` is opened. */
const PANEL =
  /\/packages\/(cards\/src\/panel\/(?!on-demand\.ts)|tokens\/src\/palettes\/community\/|demo-home\/src\/simulate\.ts|core\/src\/i18n\/locales\/en\/panel\.json)/;

/** The automatic dashboard's strategy (all of its folder but the definer): fetched when a dashboard asks for it. */
const STRATEGY = /\/packages\/cards\/src\/strategy\/(?!define\.ts)/;

/** Wall mode (the controller in core — its switch stays in core's chunk — and the screensaver, corner and toast in cards; their words are core's `wall`): fetched only on a device that is a wall. */
const WALL = /\/packages\/(core\/src\/wall\/(?!start\.ts)|cards\/src\/wall\/)/;

/** The weather card (its forecast strips and rows): fetched as the bundle starts and defined as it lands. */
const WEATHER = /\/packages\/cards\/src\/(weather-cards\.ts|weather\/)/;

/**
 * The media family (the player and the now-playing strip, what only they share, and their English): fetched as the
 * bundle starts and defined as it lands, as the energy family is (`media-family.ts` stays in core: the names, the
 * heights).
 */
const MEDIA =
  /\/packages\/(cards\/src\/(media-cards\.ts|media\/|now-playing\/|shared\/media\.ts)|core\/src\/i18n\/locales\/en\/media\.json)/;

/** The history bars' readings (`readings.ts`, the resets and the steps; `history.ts`, the recorder's history): fetched by the first card that needs them. */
const HISTORY_BARS_READINGS = /\/packages\/cards\/src\/history-bars\/(readings|history)\.ts/;

/**
 * The energy family (its cards, the flow's drawing and motion, the model they share, every `energy/` helper but the
 * head's fitting, which the other cards use, and the family's English): fetched as the bundle starts — `index.ts`
 * announces the cards and imports this without waiting — and defined as it lands. Home Assistant builds a card again
 * the moment its tag is defined, so a dashboard with energy on it shows it; one without never waits.
 */
const ENERGY =
  /\/packages\/(cards\/src\/(energy-cards\.ts|energy\/(?!head\.ts)|energy-flow\/|energy-model\/|energy-devices\/|production\/|history-bars\/|balance\/|grid\/|batteries\/|ev-charger\/|sankey\/|score\/|meters\/)|core\/src\/i18n\/locales\/en\/energy\.json)/;

/**
 * The devices family (the lock, the alarm and its keypad, the camera, the 3D printer, the job's times the appliances
 * share, and their English): fetched as the bundle starts and defined as it lands, as the energy family is
 * (`devices-family.ts` stays in core: the names, the heights; so do the rows the lock shares with the entities card,
 * `lock/rows.ts`).
 */
const DEVICES =
  /\/packages\/(cards\/src\/(devices-cards\.ts|devices\/|camera\/|alarm\/|lock\/lock-card\.ts|printer\/|shared\/job-time\.ts)|core\/src\/i18n\/locales\/en\/(devices|job)\.json)/;

/** The appliances' pictures (one product drawing a kind): fetched by the first card that draws one, never at start. */
const APPLIANCE_ART = /\/packages\/cards\/src\/appliance\/art\//;

/** The appliances family (the washer, the dryer, the dishwasher and their kin, and their English): fetched as the bundle starts and defined as it lands. */
const APPLIANCES =
  /\/packages\/(cards\/src\/(appliances-cards\.ts|appliance\/)|core\/src\/i18n\/locales\/en\/appliances\.json)/;

/**
 * The schedule sheet (its targets, day chips and moment rows): fetched the first time a schedule is opened or added,
 * never by a dashboard that only lists; it reaches the page controls (the time field) through the pages chunk.
 */
const AUTOMATIONS_SHEET = /\/packages\/cards\/src\/automations\/sheet\//;

/**
 * The automations family (the card, its words' layout, the schedule model, the store and the family's English):
 * fetched as the bundle starts and defined as it lands, as the devices family is (`automations-family.ts` stays in
 * core: the name, the height).
 */
const AUTOMATIONS =
  /\/packages\/(cards\/src\/(automations-cards\.ts|automations\/)|core\/src\/i18n\/locales\/en\/automations\.json)/;

/** The alerts' sheet: fetched the first time it is opened, never by a dashboard that only lists. */
const ALERTS_SHEET = /\/packages\/cards\/src\/alerts\/sheet(\.ts|\/)/;

/** The alerts family (the card, what it watches, and its English): fetched as the bundle starts and defined as it lands. */
const ALERTS =
  /\/packages\/(cards\/src\/(alerts-cards\.ts|alerts\/)|core\/src\/i18n\/locales\/en\/alerts\.json)/;

/** The light card's colour controls (the quick colours' table and row, the hue maths): fetched by the first colour bulb drawn. */
const LIGHT_COLOUR = /\/packages\/cards\/src\/light\/colour\.ts/;

/** The icons a view's name says, for a tab row asked for icons whose views have none: fetched the first time it is. */
const VIEW_ICONS = /\/packages\/core\/src\/look\/view-icons\.ts/;

/** The cards' visual editor (the rows editor every card's `getConfigElement` builds): fetched the first time a card is edited. */
const EDITOR = /\/packages\/cards\/src\/shared\/rows-editor\.ts/;

/**
 * @typedef {object} Group
 * @property {string | ((id: string) => string)} name the chunk's name (`chunks/<name>-<hash>.js`)
 * @property {RegExp | ((id: string) => boolean)} test whether a module (its absolute path) belongs to it
 */

/**
 * Where each module goes, first match wins: a language's catalogue, the page controls, the Activity page, the History
 * page, the settings panel, the strategy, the wall, the weather card, the media, energy (the history bars' readings on
 * their own), devices, appliances (their pictures on their own), automations and alerts families (each sheet on its
 * own), the cards' editor, and everything else (Fluvy's packages and Lit) in `core`. The bundle's own entry stays in
 * `fluvy.js`. Rolldown processes the groups in this order; the priorities only say so out loud.
 * @type {readonly Group[]}
 */
export const GROUPS = [
  { name: (id) => `lang-${LANGUAGE.exec(id)?.[1]}`, test: LANGUAGE },
  { name: 'pages', test: PAGES },
  { name: 'activity', test: ACTIVITY },
  { name: 'history', test: HISTORY },
  { name: 'panel', test: PANEL },
  { name: 'strategy', test: STRATEGY },
  { name: 'wall', test: WALL },
  { name: 'weather', test: WEATHER },
  { name: 'media', test: MEDIA },
  { name: 'history-bars-readings', test: HISTORY_BARS_READINGS },
  { name: 'energy', test: ENERGY },
  { name: 'devices', test: DEVICES },
  { name: 'appliance-art', test: APPLIANCE_ART },
  { name: 'appliances', test: APPLIANCES },
  { name: 'automations-sheet', test: AUTOMATIONS_SHEET },
  { name: 'automations', test: AUTOMATIONS },
  { name: 'alerts-sheet', test: ALERTS_SHEET },
  { name: 'alerts', test: ALERTS },
  { name: 'light-colour', test: LIGHT_COLOUR },
  { name: 'editor', test: EDITOR },
  { name: 'view-icons', test: VIEW_ICONS },
  { name: 'core', test: (id) => !id.includes('/packages/bundle/src/') },
];

/** The chunk a module lands in (its absolute path), by the first group that names it; the bundle's entry is `fluvy.js`. */
export function chunkOf(id) {
  const group = GROUPS.find(({ test }) => (typeof test === 'function' ? test(id) : test.test(id)));
  if (!group) return 'fluvy.js';
  return typeof group.name === 'function' ? group.name(id) : group.name;
}
