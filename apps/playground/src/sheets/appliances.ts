import type {
  DeviceRegistryEntry,
  EntityRegistryDisplayEntry,
  HassEntity,
  HomeAssistant,
  LovelaceCardConfig,
} from '@fluvy/core';
import { FluvyApplianceCard } from '../../../../packages/cards/src/appliance/appliance-card.js';
import { FluvyAppliancesCard } from '../../../../packages/cards/src/appliance/appliances-card.js';
import { FluvyAlertsCard } from '../../../../packages/cards/src/alerts/alerts-card.js';
import {
  allFixtures,
  laterFixtures,
  plugFridge,
  reporterAtWork,
} from '../../../../packages/cards/src/appliance/fixtures/index.js';
import type { StateSeed } from '../hass.js';
import { NOW } from '../now.js';
import type { FrameSpec, SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-appliance-card'))
  customElements.define('fluvy-appliance-card', FluvyApplianceCard);
if (!customElements.get('fluvy-appliances-card'))
  customElements.define('fluvy-appliances-card', FluvyAppliancesCard);
if (!customElements.get('fluvy-alerts-card'))
  customElements.define('fluvy-alerts-card', FluvyAlertsCard);

/*
 * Issue #47's appliances, one of each integration as their registries and states say them (the cards' own fixtures, a
 * German house's ids): LG's washer spinning, its dryer done and switched off, its fridge by its setpoints alone; Home
 * Connect's dishwasher out of salt, its oven preheating, its coffee machine asking to be descaled, its fridge freezer
 * with a door open; Miele's washer rinsing, its fridge super cooling, its hob with two plates on; SmartThings' washer
 * with its upper drum at rest and its oven's two cavities; Matter's dishwasher and paused washer; Whirlpool's dryer and
 * double oven; Tuya's kettle; the community's hOn, AEG and SmartThinQ washers; a washer and a dryer on smart plugs (their
 * power's history answered here). Then every variant, the list of the house's appliances, an appliance out of reach
 * beside its live twin, a failure that says why, and a house in Fahrenheit. The state words are Home Assistant's in the
 * page's language (`lang`), as its translations say them. Last, the reporter's own LG house as he dumped it (#47): his
 * four appliances on both integrations he runs, at rest and at work, whole, compact and as rows — the words of LG's
 * states left to the card, as the older integration's plain English would be. And the house's status colours (1.9):
 * the four statuses on an alerts card and on a dishwasher due its salt, the palette's own and then a warning of the
 * house's own (#47's orange), light or dark as the page is.
 */

const now = NOW.getTime();
const at = NOW.toISOString();
const FIXTURES = [...allFixtures(now)];
const LATER = laterFixtures(now);

/** A plug's device and its two entities, its switch and its power. */
const plug = (id: string, name: string, slug: string) => ({
  device: {
    id,
    name,
    name_by_user: null,
    area_id: null,
    model: 'Shelly Plus Plug S',
    manufacturer: 'Shelly',
    via_device_id: null,
  } satisfies DeviceRegistryEntry,
  entities: [
    { entity_id: `switch.${slug}`, device_id: id, platform: 'shelly' },
    { entity_id: `sensor.${slug}_leistung`, device_id: id, platform: 'shelly' },
  ] satisfies EntityRegistryDisplayEntry[],
});

/** A washer and a dryer on plugs the cards read by their power: the washer's runs, the dryer's finished. */
const PLUGS = {
  dryer: {
    device: {
      id: 'plug-dryer',
      name: 'Trockner Keller',
      name_by_user: null,
      area_id: null,
      model: 'Shelly Plus Plug S',
      manufacturer: 'Shelly',
      via_device_id: null,
    } satisfies DeviceRegistryEntry,
    entities: [
      { entity_id: 'switch.trockner_keller', device_id: 'plug-dryer', platform: 'shelly' },
      { entity_id: 'sensor.trockner_keller_leistung', device_id: 'plug-dryer', platform: 'shelly' },
    ] satisfies EntityRegistryDisplayEntry[],
  },
};

/** A plug's power over the last hours, as the recorder keeps it: [minutes before now, watts]. */
const POWER: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  // the washer: heating its water 42 minutes ago, washing, a soak under the threshold, washing again
  'sensor.waschmaschine_keller_leistung': [
    [600, 0.4],
    [42, 2050],
    [30, 380],
    [22, 2.1],
    [20, 410],
    [6, 520],
  ],
  // the dryer: ran an hour and a half, then fell to its standby 48 minutes ago
  'sensor.trockner_keller_leistung': [
    [600, 0.3],
    [138, 2400],
    [96, 1800],
    [52, 600],
    [48, 0.4],
  ],
};

/** The washer's meter over the same hours, kWh: what this cycle used is its gain since the cycle started. */
const METER: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  'sensor.waschmaschine_keller_energie': [
    [600, 181.56],
    [42, 181.56],
    [30, 181.98],
    [6, 182.31],
  ],
};

/** The recorder's raw states for the plugs, laid back from the moment the card asks to (its `_now`). */
function history(message: Record<string, unknown>): Record<string, unknown[]> {
  const end = Date.parse(String(message['end_time'] ?? at));
  const ids = (message['entity_ids'] as string[] | undefined) ?? [];
  return Object.fromEntries(
    ids.flatMap((id) => {
      const series = POWER[id] ?? METER[id];
      if (!series) return [];
      return [
        [id, series.map(([ago, value]) => ({ s: String(value), lu: (end - ago * 60_000) / 1000 }))],
      ];
    }),
  );
}

/** Home Assistant's words for the appliances' states, by language: a state a card must hold whole, however long. */
const WORDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    run: 'Running',
    running: 'Running',
    in_use: 'In use',
    rinses: 'Rinsing',
    cycle_rinsing: 'Rinsing',
    spin: 'Spinning',
    end: 'Programme finished',
    complete: 'Complete',
    power_off: 'Power off',
    delayedstart: 'Delayed start',
    heating: 'Heating',
    not_running: 'Not running',
    on: 'On',
    off: 'Off',
    plate_step_0: 'Off',
    plate_step_3: '3',
    plate_step_7: '7',
    cottons: 'Cottons',
    dishcare_dishwasher_program_eco_50: 'Eco 50°',
    dishcare_dishwasher_program_auto_2: 'Auto 45–65°',
    dishcare_dishwasher_program_quick_45: 'Quick 45°',
    cooking_oven_program_heating_mode_hot_air: '3D hot air',
    cooking_oven_program_heating_mode_top_bottom_heating: 'Top/bottom heat',
    consumer_products_coffee_maker_program_beverage_espresso: 'Espresso',
    consumer_products_coffee_maker_program_beverage_coffee: 'Coffee',
    consumer_products_coffee_maker_program_beverage_cappuccino: 'Cappuccino',
    consumer_products_coffee_maker_program_beverage_latte_macchiato: 'Latte macchiato',
    Table_00_Course_5B: 'Cotton',
    boiling_quick: 'Quick boil',
    bake: 'Bake',
    convection_bake: 'Convection bake',
    unbalanced_load_error: 'Unbalanced load',
  },
  de: {
    spinning: 'Schleudern',
    spin: 'Schleudern',
    cycle_rinsing: 'Spülen',
    rinses: 'Spülen',
    rinsing: 'Spülen',
    in_use: 'In Betrieb',
    run: 'Läuft',
    running: 'Läuft',
    heating: 'Heizt auf',
    preheating: 'Vorheizen',
    pause: 'Pausiert',
    paused: 'Pausiert',
    finished: 'Programmende',
    end: 'Programmende',
    complete: 'Fertig',
    power_off: 'Ausgeschaltet',
    delayedstart: 'Startvorwahl',
    ready: 'Bereitschaft',
    inactive: 'Inaktiv',
    on: 'Ein',
    off: 'Aus',
    not_running: 'Nicht aktiv',
    drying: 'Trocknen',
    cottons: 'Baumwolle',
    eco: 'Eco',
    dishcare_dishwasher_program_eco_50: 'Eco 50°',
    bake: 'Ober-/Unterhitze',
    plate_step_0: 'Aus',
    plate_step_3: '3',
    plate_step_7: '7',
    cooking_oven_program_heating_mode_hot_air: '3D-Heißluft',
    Table_00_Course_5B: 'Baumwolle',
    boiling_quick: 'Schnellkochen',
    unbalanced_load_error: 'Unwucht',
  },
  fr: {
    spinning: 'Essorage',
    spin: 'Essorage',
    cycle_rinsing: 'Rinçage',
    rinses: 'Rinçage',
    rinsing: 'Rinçage',
    in_use: 'En marche',
    run: 'En cours',
    running: 'En cours',
    heating: 'Chauffe',
    preheating: 'Préchauffage',
    pause: 'En pause',
    paused: 'En pause',
    finished: 'Terminé',
    end: 'Terminé',
    complete: 'Terminé',
    power_off: 'Éteint',
    delayedstart: 'Départ différé',
    ready: 'Prêt',
    inactive: 'Inactif',
    on: 'Marche',
    off: 'Arrêt',
    not_running: 'À l’arrêt',
    drying: 'Séchage',
    cottons: 'Coton',
    eco: 'Éco',
    dishcare_dishwasher_program_eco_50: 'Éco 50°',
    bake: 'Chaleur tournante',
    plate_step_0: 'Arrêt',
    plate_step_3: '3',
    plate_step_7: '7',
    cooking_oven_program_heating_mode_hot_air: 'Chaleur tournante 3D',
    Table_00_Course_5B: 'Coton',
    boiling_quick: 'Ébullition rapide',
    unbalanced_load_error: 'Charge déséquilibrée',
  },
  es: {
    spinning: 'Centrifugando',
    cycle_rinsing: 'Aclarando',
    rinses: 'Aclarado',
    in_use: 'En uso',
    run: 'En marcha',
    pause: 'En pausa',
    finished: 'Terminado',
    power_off: 'Apagado',
    preheating: 'Precalentando',
    cottons: 'Algodón',
  },
  tr: {
    spinning: 'Sıkma',
    cycle_rinsing: 'Durulama',
    rinses: 'Durulama',
    in_use: 'Kullanımda',
    run: 'Çalışıyor',
    pause: 'Duraklatıldı',
    finished: 'Bitti',
    power_off: 'Kapalı',
    preheating: 'Ön ısıtma',
    cottons: 'Pamuklu',
  },
};

/** The coffee machine's programmes, its drinks (Home Connect's select of them): what the whole card offers. */
const DRINKS = [
  'consumer_products_coffee_maker_program_beverage_espresso',
  'consumer_products_coffee_maker_program_beverage_coffee',
  'consumer_products_coffee_maker_program_beverage_cappuccino',
  'consumer_products_coffee_maker_program_beverage_latte_macchiato',
];
const COFFEE_PROGRAM = {
  entity_id: 'select.kaffeevollautomat_ausgewahltes_programm',
  device_id: 'hc-coffee',
  platform: 'home_connect',
  translation_key: 'selected_program',
} satisfies EntityRegistryDisplayEntry;

/** The appliances' entities: the states the page's language words as Home Assistant does. */
const OURS = new Set([
  ...[...FIXTURES, ...LATER].flatMap((fixture) => fixture.entities.map((entry) => entry.entity_id)),
  COFFEE_PROGRAM.entity_id,
]);

/** The house as the appliances' frames see it: their states in the page's language. */
const speaking = (hass: HomeAssistant): HomeAssistant => {
  const words = WORDS[hass.language] ?? {};
  const english = WORDS['en'] ?? {};
  const format = hass.formatEntityState;
  const word = (raw: string): string | undefined => words[raw] ?? english[raw];
  return {
    ...hass,
    formatEntityState: (stateObj: HassEntity, state?: string) => {
      const raw = state ?? stateObj.state;
      const said = OURS.has(stateObj.entity_id) ? word(raw) : undefined;
      return said ?? format?.({ ...stateObj, state: raw }) ?? raw;
    },
    // an event's type in the house's words (LG's error and notification events)
    formatEntityAttributeValue: (stateObj: HassEntity, attribute: string, value?: unknown) => {
      const raw = String(value ?? stateObj.attributes[attribute] ?? '');
      return word(raw) ?? raw.replace(/_/g, ' ');
    },
  } as HomeAssistant;
};

/** The house with some states changed, its states in the page's language. */
const changed =
  (
    changes: Readonly<Record<string, Partial<HassEntity>>>,
    config?: Partial<HomeAssistant['config']>,
  ) =>
  (hass: HomeAssistant): HomeAssistant =>
    speaking({
      ...hass,
      ...(config ? { config: { ...hass.config, ...config } } : {}),
      states: {
        ...hass.states,
        ...Object.fromEntries(
          Object.entries(changes).map(([id, change]) => [
            id,
            {
              ...(hass.states[id] as HassEntity),
              ...change,
              attributes: { ...hass.states[id]?.attributes, ...change.attributes },
            },
          ]),
        ),
      },
    } as HomeAssistant);

/** Every entity of a device out of reach. */
const unavailable = (device: string): Readonly<Record<string, Partial<HassEntity>>> =>
  Object.fromEntries(
    [...FIXTURES, ...LATER]
      .filter((fixture) => fixture.device.id === device)
      .flatMap((fixture) =>
        fixture.entities.map((entry) => [entry.entity_id, { state: 'unavailable' }]),
      ),
  );

/**
 * A fridge on a plug (#47), alone in its frame's house (the list of the house's appliances never sees it): its
 * compressor resting or running, as `watts` says.
 */
const fridgePlug =
  (watts: string) =>
  (hass: HomeAssistant): HomeAssistant => {
    const fixture = plugFridge(now);
    return speaking({
      ...hass,
      devices: { ...hass.devices, [fixture.device.id]: fixture.device },
      entities: {
        ...hass.entities,
        ...Object.fromEntries(fixture.entities.map((entry) => [entry.entity_id, entry])),
      },
      states: {
        ...hass.states,
        ...Object.fromEntries(
          fixture.states.map(([id, state, attributes = {}]) => [
            id,
            {
              entity_id: id,
              state: id.endsWith('_leistung') ? watts : state,
              attributes: { friendly_name: id, ...attributes },
              last_changed: at,
              last_updated: at,
            } satisfies HassEntity,
          ]),
        ),
      },
    } as HomeAssistant);
  };

/** The reporter's devices with a cycle under way: their states over the house as he dumped it. */
const AT_WORK: Readonly<Record<string, Partial<HassEntity>>> = Object.fromEntries(
  reporterAtWork(now).flatMap((fixture) =>
    fixture.states.map(([id, state, attributes = {}]) => [id, { state, attributes }] as const),
  ),
);

/** The reporter's four appliances on one of his integrations, each a card. */
const reporter = (
  platform: 'older' | 'core',
  more: Record<string, unknown> = {},
): LovelaceCardConfig[] =>
  ['rep-dish', 'rep-washer', 'rep-oven', 'rep-fridge'].map((id) =>
    card(platform === 'core' ? `${id}-thinq` : id, more),
  );

/** An appliance card on a device, at the sheet's moment. */
const card = (device: string, more: Record<string, unknown> = {}): LovelaceCardConfig => ({
  type: 'custom:fluvy-appliance-card',
  device,
  _now: at,
  ...more,
});
const list = (more: Record<string, unknown> = {}): LovelaceCardConfig => ({
  type: 'custom:fluvy-appliances-card',
  _now: at,
  ...more,
});

/** A frame whose states speak the page's language. */
const frame = (spec: FrameSpec): FrameSpec => ({ hass: speaking, ...spec });

/**
 * The four statuses at once: an alerts card's rows — the fridge door open (critical: the danger), the dishwasher's salt
 * (a warning), the coffee machine to descale (info: the notice) — beside the dishwasher at work on its Eco programme
 * (the success's green), its salt due (the warning's words at a row's end).
 */
const STATUSES: readonly LovelaceCardConfig[] = [
  {
    type: 'custom:fluvy-alerts-card',
    _now: at,
    variant: 'rows',
    alerts: [
      {
        name: 'Fridge door',
        entity: 'binary_sensor.kuhl_gefrier_kombination_kuhlschranktur',
        state: 'on',
        severity: 'critical',
        icon: 'door',
      },
      {
        name: 'Dishwasher salt',
        entity: 'sensor.geschirrspuler_salzmangel',
        state: 'present',
        severity: 'warning',
      },
      {
        name: 'Descale the coffee machine',
        entity: 'sensor.kaffeevollautomat_entkalken',
        state: 'present',
        severity: 'info',
      },
    ],
  },
  card('hc-dish', { row_values: 'end' }),
];

/** An entity's name as Home Assistant writes it where a fixture gives none: its id's words ("Kaffeevollautomat kaffees"). */
const named = ([id, state, attributes, ago]: StateSeed): StateSeed => {
  const words = id.slice(id.indexOf('.') + 1).replace(/_/g, ' ');
  const friendly = attributes?.['friendly_name'] ?? words.charAt(0).toUpperCase() + words.slice(1);
  const seed: StateSeed = [id, state, { ...attributes, friendly_name: friendly }];
  if (ago !== undefined) seed[3] = ago;
  return seed;
};

/** The small appliances on their plugs (#47's): a toaster at work, a blender off. */
const SMALL = [
  plug('plug-toaster', 'Toaster', 'toaster_kuche'),
  plug('plug-blender', 'Standmixer', 'standmixer'),
];

const SEEDS: StateSeed[] = [
  ...FIXTURES.flatMap((fixture) => (fixture.states as StateSeed[]).map(named)),
  [COFFEE_PROGRAM.entity_id, DRINKS[0] ?? '', { options: DRINKS }],
  ['switch.toaster_kuche', 'on'],
  ['sensor.toaster_kuche_leistung', '870', { device_class: 'power', unit_of_measurement: 'W' }, 90],
  ['switch.standmixer', 'off'],
  ['sensor.standmixer_leistung', '0', { device_class: 'power', unit_of_measurement: 'W' }, 3600],
  ['switch.trockner_keller', 'on'],
  [
    'sensor.trockner_keller_leistung',
    '0.4',
    { device_class: 'power', unit_of_measurement: 'W' },
    48 * 60,
  ],
];

/** The washer on its plug draws what its history ends at. */
const washerPower = SEEDS.findIndex(([id]) => id === 'sensor.waschmaschine_keller_leistung');
if (washerPower >= 0)
  SEEDS[washerPower] = [
    'sensor.waschmaschine_keller_leistung',
    '520',
    { device_class: 'power', unit_of_measurement: 'W' },
    6 * 60,
  ];

export const sheet: SheetSpec = {
  states: SEEDS,
  registry: {
    devices: Object.fromEntries([
      ...FIXTURES.map((fixture) => [fixture.device.id, fixture.device] as const),
      [PLUGS.dryer.device.id, PLUGS.dryer.device] as const,
      ...SMALL.map((small) => [small.device.id, small.device] as const),
    ]),
    entities: Object.fromEntries([
      ...FIXTURES.flatMap((fixture) =>
        fixture.entities.map((entry) => [entry.entity_id, entry] as const),
      ),
      ...PLUGS.dryer.entities.map((entry) => [entry.entity_id, entry] as const),
      ...SMALL.flatMap((small) => small.entities.map((entry) => [entry.entity_id, entry] as const)),
      [COFFEE_PROGRAM.entity_id, COFFEE_PROGRAM] as const,
    ]),
  },
  ws: { 'history/history_during_period': history },
  frames: [
    // LG ThinQ, the reporter's: the washer spinning, the dryer that switched itself off when done, the fridge
    frame({ title: 'LG · washer spinning', cards: [card('lg-washer')] }),
    frame({ title: 'LG · dryer done, switched off', cards: [card('lg-dryer')] }),
    frame({ title: 'LG · fridge by its setpoints, the door ajar', cards: [card('lg-fridge')] }),
    frame({ title: 'LG · dishwasher, rinse aid low', cards: [card('lg-dish')] }),
    // Home Connect
    frame({ title: 'Home Connect · dishwasher, salt out', cards: [card('hc-dish')] }),
    frame({ title: 'Home Connect · oven preheating', cards: [card('hc-oven')] }),
    frame({ title: 'Home Connect · coffee machine, descale', cards: [card('hc-coffee')] }),
    frame({ title: 'Home Connect · fridge freezer, a door open', cards: [card('hc-fridge')] }),
    // Miele
    frame({ title: 'Miele · washer rinsing', cards: [card('miele-washer')] }),
    frame({ title: 'Miele · fridge freezer, super cooling', cards: [card('miele-fridge')] }),
    frame({ title: 'Miele · hob, two plates on', cards: [card('miele-hob')] }),
    frame({ title: 'Miele · coffee system at rest', cards: [card('miele-coffee')] }),
    // SmartThings, Matter, Whirlpool, Tuya
    frame({ title: 'SmartThings · washer, its upper drum', cards: [card('st-washer')] }),
    frame({ title: 'SmartThings · oven, two cavities', cards: [card('st-oven')] }),
    frame({ title: 'SmartThings · fridge, a door open', cards: [card('st-fridge')] }),
    frame({ title: 'Matter · dishwasher washing', cards: [card('matter-dish')] }),
    frame({ title: 'Matter · washer paused', cards: [card('matter-washer')] }),
    frame({ title: 'Whirlpool · dryer done', cards: [card('wp-dryer')] }),
    frame({ title: 'Whirlpool · double oven', cards: [card('wp-oven')] }),
    frame({ title: 'Tuya · kettle heating', cards: [card('tuya-kettle')] }),
    // the community's integrations: read, never written to
    frame({ title: 'hOn · washer, by its numbers', cards: [card('hon-washer')] }),
    frame({ title: 'hOn · dishwasher, its start delayed', cards: [card('hon-dish')] }),
    frame({ title: 'AEG · washer by its ids', cards: [card('aeg-washer')] }),
    frame({ title: 'SmartThinQ · washer rinsing', cards: [card('stq-washer')] }),
    // on a plug: running (its power's history), and done, waiting to be unloaded
    frame({ title: 'A washer on a plug · running', cards: [card('plug-washer')] }),
    frame({ title: 'A dryer on a plug · done', cards: [card('plug-dryer')] }),
    // a fridge on a plug: in operation whether its compressor rests or runs, never done, no bell; switching it off
    // asks first, whatever its compressor does
    frame({
      title: 'A fridge on a plug · its compressor resting',
      cards: [card('plug-fridge'), card('plug-fridge', { variant: 'row' })],
      hass: fridgePlug('0.9'),
    }),
    frame({
      title: 'A fridge on a plug · its compressor running',
      cards: [card('plug-fridge'), card('plug-fridge', { variant: 'row' })],
      hass: fridgePlug('85'),
    }),
    // the variants
    frame({
      title: 'Compact · half a section',
      cards: [
        card('lg-washer', { variant: 'compact', cols: 6 }),
        card('hc-oven', { variant: 'compact', cols: 6 }),
        card('lg-fridge', { variant: 'compact', cols: 6 }),
        card('plug-washer', { variant: 'compact', cols: 6 }),
      ],
    }),
    frame({
      title: 'Ring',
      cards: [
        card('hc-dish', { variant: 'ring' }),
        card('hc-oven', { variant: 'ring' }),
        card('miele-fridge', { variant: 'ring' }),
        card('plug-washer', { variant: 'ring' }),
      ],
    }),
    frame({
      title: 'Rows',
      cards: [
        card('lg-washer', { variant: 'row' }),
        card('lg-dryer', { variant: 'row' }),
        card('matter-washer', { variant: 'row' }),
        card('lg-fridge', { variant: 'row' }),
        card('hc-oven', { variant: 'row' }),
      ],
    }),
    // the row at its own size: half of a section of its own (the suites draw this sheet at a half column's width)
    frame({
      title: 'Rows · half a section',
      width: 360,
      cards: [
        card('miele-washer', { variant: 'row', cols: 6 }),
        card('lg-dryer', { variant: 'row', cols: 6 }),
      ],
    }),
    // what to look after, as rows of their own: what to do at the end, or as one phrase (a hold resets where the
    // integration lets a card)
    frame({
      title: 'Reminders · as rows',
      cards: [
        card('hc-dish', { rows: ['salt', 'rinse_aid', 'machine_care'], row_values: 'end' }),
        card('lg-fridge', { row_values: 'end' }),
      ],
    }),
    frame({
      title: 'Programmes to choose · at rest',
      cards: [
        card('miele-coffee', { show_programs: true }),
        card('hc-coffee', { show_programs: true }),
      ],
    }),
    // the card's own: its readouts, its name, colour and icon, its compartments named
    frame({
      title: 'Its own · readouts, colour, compartments',
      cards: [
        card('miele-washer', {
          name: 'Washer',
          color: 'teal',
          readouts: ['program', 'spin', 'elapsed', 'total'],
          time: 'end',
        }),
        card('miele-fridge', {
          zones: [
            {
              entity: 'climate.kuhl_gefrierkombination_gefrierschrank',
              name: 'Freezer',
              icon: 'snow',
            },
          ],
          setpoint_style: 'readout',
          modes_style: 'tiles',
        }),
      ],
    }),
    // out of reach beside its live twin (the frame before): the same size, its values a dash
    frame({
      title: 'Live · its twin out of reach next',
      cards: [card('hc-dish'), card('lg-fridge', { variant: 'compact', cols: 6 })],
    }),
    frame({
      title: 'Out of reach',
      cards: [card('hc-dish'), card('lg-fridge', { variant: 'compact', cols: 6 })],
      hass: changed({ ...unavailable('hc-dish'), ...unavailable('lg-fridge') }),
    }),
    frame({
      title: 'Failed · says why',
      cards: [card('lg-washer')],
      hass: changed({
        'event.waschmaschine_fehler': {
          state: new Date(now - 4 * 60_000).toISOString(),
          attributes: { event_type: 'unbalanced_load_error' },
        },
      }),
    }),
    // the house's appliances
    frame({ title: 'Appliances · rows', cards: [list()] }),
    frame({
      title: 'Appliances · compact and tiles',
      cards: [list({ variant: 'compact', max_rows: 4 }), list({ variant: 'tiles', max_rows: 6 })],
    }),
    frame({
      title: 'Appliances · the busy ones, named',
      cards: [
        list({
          show: 'active',
          appliances: [
            'lg-washer',
            { device: 'hc-dish', name: 'Dishwasher', color: 'teal' },
            'hc-oven',
            'plug-washer',
            'lg-fridge',
          ],
        }),
      ],
    }),
    frame({
      title: 'Appliances · none',
      cards: [list({ appliances: [] }), list({ show: 'active', appliances: ['miele-coffee'] })],
    }),
    // a house in Fahrenheit: a fridge at 37 °F and 0 °F, an oven to 350 °F
    frame({
      title: 'Fahrenheit · fridge and oven',
      cards: [card('lg-fridge'), card('hc-oven')],
      hass: changed(
        {
          'number.kuhlschrank_fridge_temperatur': {
            state: '37',
            attributes: { min: 33, max: 45, step: 1, unit_of_measurement: '°F' },
          },
          'number.kuhlschrank_freezer_temperatur': {
            state: '0',
            attributes: { min: -8, max: 5, step: 1, unit_of_measurement: '°F' },
          },
          'sensor.backofen_aktuelle_garraumtemperatur': {
            state: '286',
            attributes: { unit_of_measurement: '°F' },
          },
          'number.backofen_temperatur': {
            state: '350',
            attributes: { min: 85, max: 480, step: 5, unit_of_measurement: '°F' },
          },
        },
        { unit_system: { temperature: '°F', length: 'mi' } } as Partial<HomeAssistant['config']>,
      ),
    }),
    // a start the appliance does not allow from afar: the cell disabled, saying why
    frame({ title: 'SmartThings · dishwasher done, its remote off', cards: [card('st-dish')] }),
    // a reminder whose integration lets a card reset it: a hold asks first
    frame({
      title: 'SmartThings · fridge, its filter to reset',
      cards: [card('st-fridge')],
    }),
    // on the page's own clock (the suites run it): the time left ticks, a door opened now is said after a minute
    frame({
      title: 'Live clock',
      measure: false,
      cards: [
        { type: 'custom:fluvy-appliance-card', device: 'hc-dish' },
        { type: 'custom:fluvy-appliance-card', device: 'hc-fridge' },
      ],
    }),
    // the whole card's parts one choice away (#47): a fridge's steppers and quick modes, the buttons
    frame({
      title: 'Whole card · steppers, quick modes, buttons',
      cards: [
        card('lg-fridge', { setpoint_style: 'stepper', show_modes: true }),
        card('hc-fridge', { show_modes: true }),
        card('hc-dish', { show_controls: true }),
        card('st-dish', { show_controls: true }),
      ],
    }),
    // the whole card made one's own: its circle for its picture, its rows named, coloured, ordered, their values at
    // the end; a coffee machine's drinks chosen; no picture and no round
    frame({
      title: 'Whole card · its own rows, picture and drinks',
      cards: [
        card('miele-washer', {
          picture: 'icon',
          row_values: 'end',
          rows: [
            'end',
            { key: 'program', icon: 'shirt', color: 'teal' },
            { entity: 'sensor.miele_waschmaschine_programmphase', name: 'Phase' },
          ],
        }),
        card('hc-coffee', {
          drinks: [
            'consumer_products_coffee_maker_program_beverage_coffee',
            'consumer_products_coffee_maker_program_beverage_espresso',
          ],
        }),
        card('hc-oven', { picture: 'none', show_power: false, show_progress: false }),
      ],
    }),
    // the small appliances on their plugs, rows of half a section (the measurer's 152 and 172 draw them)
    frame({
      title: 'Small appliances · rows, half a section',
      width: 360,
      cards: [
        card('plug-toaster', { variant: 'row', cols: 6 }),
        card('plug-blender', { variant: 'row', cols: 6 }),
        card('tuya-kettle', { variant: 'row', cols: 6 }),
        card('hc-coffee', { variant: 'row', cols: 6 }),
      ],
    }),
    // out of reach beside their live twins: the hob's zones, the coffee machine's drinks, the fridge's compartments,
    // a small appliance's row — the same size, the same parts, their values a dash
    frame({
      title: 'Live · zones, drinks, compartments, a row',
      cards: [
        card('miele-hob'),
        card('hc-coffee'),
        card('miele-fridge'),
        card('plug-toaster', { variant: 'row' }),
      ],
    }),
    frame({
      title: 'Out of reach · zones, drinks, compartments, a row',
      cards: [
        card('miele-hob'),
        card('hc-coffee'),
        card('miele-fridge'),
        card('plug-toaster', { variant: 'row' }),
      ],
      hass: changed({
        ...unavailable('miele-hob'),
        ...unavailable('hc-coffee'),
        ...unavailable('miele-fridge'),
        'switch.toaster_kuche': { state: 'unavailable' },
        'sensor.toaster_kuche_leistung': { state: 'unavailable' },
      }),
    }),
    // the small appliances as the reporter's bottom row: the picture, the name over what it does, the power round
    frame({
      title: 'Small appliances · rows',
      cards: [
        card('plug-toaster', { variant: 'row' }),
        card('plug-blender', { variant: 'row' }),
        card('tuya-kettle', { variant: 'row' }),
      ],
    }),
    // LG · the reporter's house (#47), as he dumped it: his dishwasher, washer, oven ("Woven") and fridge on LG's older
    // integration (the device sensor, its cycle in its attributes) and on the core one (its enums); at rest as dumped
    // — the core washer out of reach, its remote start off — and at work: the dishwasher rinsing with 1:12 left, the
    // washer spinning, the oven's upper cavity preheating from 350 °F to 425 °F, the fridge's express cool on
    frame({ title: 'LG · the reporter’s house · SmartThinQ, as dumped', cards: reporter('older') }),
    frame({ title: 'LG · the reporter’s house · ThinQ, as dumped', cards: reporter('core') }),
    frame({
      title: 'LG · the reporter’s house · SmartThinQ, at work',
      cards: reporter('older'),
      hass: changed(AT_WORK),
    }),
    frame({
      title: 'LG · the reporter’s house · ThinQ, at work',
      cards: reporter('core'),
      hass: changed(AT_WORK),
    }),
    frame({
      title: 'LG · the reporter’s house · compact, as dumped',
      cards: [
        ...reporter('older', { variant: 'compact', cols: 6 }),
        ...reporter('core', { variant: 'compact', cols: 6 }),
      ],
    }),
    frame({
      title: 'LG · the reporter’s house · compact, at work',
      cards: [
        ...reporter('older', { variant: 'compact', cols: 6 }),
        ...reporter('core', { variant: 'compact', cols: 6 }),
      ],
      hass: changed(AT_WORK),
    }),
    frame({
      title: 'LG · the reporter’s house · rows, as dumped',
      cards: [...reporter('older', { variant: 'row' }), ...reporter('core', { variant: 'row' })],
    }),
    frame({
      title: 'LG · the reporter’s house · rows, at work',
      cards: [...reporter('older', { variant: 'row' }), ...reporter('core', { variant: 'row' })],
      hass: changed(AT_WORK),
    }),
    // his range's cooktop as a hob of its own: the five burners by where they sit, the left front one on
    frame({
      title: 'LG · the reporter’s house · the cooktop as a hob',
      cards: [
        card('rep-oven', { kind: 'hob' }),
        card('rep-oven', { kind: 'hob', variant: 'compact' }),
      ],
      hass: changed(AT_WORK),
    }),
    // the standard slot (#47), four a row as the reporter's page lays them: appliances that lack a row (a fridge's
    // filter, a coffee machine's drinks and last brew, a hob's meter, a plug's programme) and two with a second cavity,
    // every whole card as tall as the next
    frame({
      title: 'The standard slot · what lacks a row, a second cavity',
      width: 1504,
      columns: 60,
      measure: false,
      cards: [
        'hc-fridge',
        'miele-coffee',
        'miele-hob',
        'st-oven',
        'tuya-kettle',
        'plug-dryer',
        'wp-oven',
        'rep-fridge',
      ].map((device) => ({ ...card(device), cols: 15 })),
    }),
    // the house's status colours (1.9): the palette's own, then a warning of the house's own (#47's orange)
    frame({ title: 'Statuses · the palette’s', cards: STATUSES }),
    frame({
      title: 'Statuses · a warning of the house’s own',
      statuses: { warning: '#dc630b' },
      cards: STATUSES,
    }),
  ],
};
