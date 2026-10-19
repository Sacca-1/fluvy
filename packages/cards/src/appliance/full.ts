import type { ActionConfig, MessageKey } from '@fluvy/core';
import type { ApplianceKind, Hero } from './kinds.js';
import { MAINTENANCE_KEYS, type MaintenanceKey } from './maintenance.js';

/*
 * The whole card's rows (#47, the reporter's design): under a hairline, three rows of what the appliance says — its
 * programme, its water and its energy, the time left and when it ends, its compartments' mode, a reminder — each an
 * icon in a soft circle, its words and its value. Which three is the kind's (`KIND_ROWS`, taken in order among those
 * the appliance has, so a washer without a water meter shows its next row instead, and where it has fewer than three a
 * row it lacks says a dash in its place: every whole card of a kind has its three rows) or the card's own (`rows`, a
 * rows editor's list, in its order, with names, icons, colours and actions of their own); how a value sits is the
 * kind's too: bold beside its words, at the row's end, or one phrase with them (`row_values`).
 */

/** What a row says: a reading of the appliance, a reminder (`salt`, `filter`…), or any entity (`entity`). */
export type RowKey =
  | 'program'
  | 'temperature'
  | 'target'
  | 'spin'
  | 'dryness'
  | 'water'
  | 'energy'
  | 'power'
  | 'remaining'
  | 'end'
  | 'elapsed'
  | 'mode'
  | 'alarm'
  | 'last_brew'
  | 'zones'
  | 'entity'
  | MaintenanceKey;

/** The readings a row may say, before the reminders: the editor's picker in this order. */
const READING_ROWS = [
  'program',
  'temperature',
  'target',
  'spin',
  'dryness',
  'water',
  'energy',
  'power',
  'remaining',
  'end',
  'elapsed',
  'mode',
  'alarm',
  'last_brew',
  'zones',
  'entity',
] as const satisfies readonly RowKey[];

export const ROW_KEYS: readonly RowKey[] = [...READING_ROWS, ...MAINTENANCE_KEYS];

/** A row of the card's own: which, or the entity it says; its name, icon, colour and actions. */
export interface RowEntry {
  readonly key?: RowKey;
  readonly entity?: string;
  /** Its words; an empty name leaves the value to say it alone ("200 °C", "Hot air"). */
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
}

/**
 * What a hero already says, which the rows that fill a card never say again: a cycle's time left and when it ends
 * (or ended), an oven's or a kettle's temperature and its target, what a plug draws and what this cycle used, a hob's
 * plates on (its head says them too).
 */
const HERO_SAYS: Readonly<Record<Hero, readonly RowKey[]>> = {
  cycle: ['remaining', 'end'],
  heat: ['temperature', 'target'],
  plug: ['power', 'energy'],
  hob: ['zones'],
  cold: [],
  state: [],
};

/** Whether a hero says what a row would (`HERO_SAYS`). */
export const heroSays =
  (hero: Hero) =>
  (key: RowKey): boolean =>
    HERO_SAYS[hero].includes(key);

/**
 * A kind's rows, `count` of them (the three a card shows, two beside a second drum's), among those the appliance
 * `has` and its hero does not already say (`said`): each slot its first it has, in the kind's order; where it has
 * fewer, the first slots it lacks take their places, each said by its most general row (a fridge's "Filter"), its
 * value a dash — the card keeps its rows, and none of them repeats the hero.
 */
export function kindRows(
  kind: ApplianceKind,
  has: (key: RowKey) => boolean,
  count = ROWS_SHOWN,
  said: (key: RowKey) => boolean = () => false,
): RowKey[] {
  const slots = KIND_ROWS[kind]
    .map((slot) => (typeof slot === 'string' ? [slot] : slot).filter((key) => !said(key)))
    .filter((slot) => slot.length > 0);
  const found = slots.map((slot) => slot.find(has));
  const taken = found.flatMap((key, index) => (key ? [index] : [])).slice(0, count);
  for (let index = 0; taken.length < count && index < slots.length; index++)
    if (!taken.includes(index)) taken.push(index);
  return taken
    .sort((a, b) => a - b)
    .map((index) => found[index] ?? (slots[index]?.at(-1) as RowKey));
}

/** How a row's value sits: bold beside its words ("Water **8.5 l**"), at the row's end, or one phrase with them. */
export type RowValues = 'inline' | 'end' | 'plain';

/** The rows a whole card shows where it names none: three, so the cards of a row of a dashboard end together. */
export const ROWS_SHOWN = 3;

/** A cycle's rows after its programme and its meters: when it ends, how long it has run. */
const TIMES: readonly RowKey[] = ['end', 'remaining', 'elapsed'];

/** What an appliance may say after its kind's own rows: what it draws, whether anything is wrong, what it used. */
const LAST: readonly RowKey[] = ['power', 'alarm'];
const METERED: readonly RowKey[] = ['power', 'energy', 'alarm'];
/** What lives on a plug: what it draws and used (its hero's, on a plug), how long it ran, when it finished. */
const PLUGGED: readonly RowKey[] = ['power', 'energy', 'elapsed', 'end', 'alarm'];

/**
 * A slot of a kind's rows: a row, or the first of some the appliance has, the most particular first (a fridge's water
 * filter, else its air filter, else any filter: one it lacks says "Filter —").
 */
type RowSlot = RowKey | readonly RowKey[];

/**
 * Each kind's rows, in the order the card takes them among those the appliance has: a washer its programme (with
 * its temperature), its water and its energy; a dryer its programme, its energy and its lint filter; an oven its
 * heating, the time left and when it ends; a fridge its mode, its filter and whether anything is wrong; a coffee
 * machine its last drink, its water tank and its beans; an air fryer its target, its programme (its hero says the
 * time left). Then what else it says (its times, what it draws, its alarm), so an appliance without a meter shows its
 * next row; no row twice, and enough that none repeats the hero, its own or a plug's.
 */
const KIND_ROWS: Readonly<Record<ApplianceKind, readonly RowSlot[]>> = {
  washer: ['program', 'water', 'energy', 'spin', ...TIMES, ...LAST],
  washer_dryer: ['program', 'water', 'energy', 'dryness', ...TIMES, ...LAST],
  dryer: ['program', 'energy', 'filter', 'dryness', ...TIMES, ...LAST],
  dishwasher: ['program', 'water', 'energy', 'salt', 'rinse_aid', ...TIMES, ...LAST],
  oven: ['program', 'remaining', 'end', 'elapsed', ...METERED],
  microwave: ['program', 'remaining', 'end', 'power', 'elapsed', 'energy', 'alarm'],
  air_fryer: ['target', 'program', 'end', 'elapsed', ...METERED],
  hob: ['zones', 'power', 'energy', 'elapsed', 'alarm'],
  hood: ['grease_filter', 'power', 'alarm', 'energy', 'elapsed'],
  fridge: ['mode', ['water_filter', 'air_filter', 'filter'], 'alarm', 'energy', 'power'],
  freezer: ['mode', ['water_filter', 'air_filter', 'filter'], 'alarm', 'energy', 'power'],
  wine: ['mode', ['air_filter', 'filter'], 'alarm', 'energy', 'power'],
  coffee: ['last_brew', 'water_tank', 'beans', 'drip_tray', 'descale', 'milk', 'clean', ...METERED],
  kettle: ['target', 'power', 'energy', 'elapsed', 'alarm'],
  toaster: PLUGGED,
  blender: PLUGGED,
  sandwich_maker: PLUGGED,
  appliance: PLUGGED,
};

/** How each kind's values sit: a washer's beside their words, an oven's at the end, a fridge's in its phrases. */
export const KIND_VALUES: Readonly<Record<ApplianceKind, RowValues>> = {
  washer: 'inline',
  washer_dryer: 'inline',
  dishwasher: 'inline',
  dryer: 'end',
  oven: 'end',
  microwave: 'end',
  air_fryer: 'plain',
  hob: 'end',
  hood: 'end',
  fridge: 'plain',
  freezer: 'plain',
  wine: 'plain',
  coffee: 'end',
  kettle: 'end',
  toaster: 'end',
  blender: 'end',
  sandwich_maker: 'end',
  appliance: 'end',
};

/** Each reading's glyph where the card names none (a reminder's is the card's own table). */
export const ROW_GLYPH: Readonly<Record<(typeof READING_ROWS)[number], string>> = {
  program: 'list',
  temperature: 'thermo',
  target: 'thermo',
  spin: 'swing',
  dryness: 'humid',
  water: 'drop',
  energy: 'bolt',
  power: 'bolt',
  remaining: 'timer',
  end: 'clock',
  elapsed: 'timer',
  mode: 'leaf',
  alarm: 'bell',
  last_brew: 'cup',
  zones: 'hob',
  entity: 'list',
};

/** A programme's glyph by its kind: a washer's shirt, a dryer's warm air, an oven's fan, an air fryer's chips. */
export const PROGRAM_GLYPH: Readonly<Partial<Record<ApplianceKind, string>>> = {
  washer: 'shirt',
  washer_dryer: 'shirt',
  dryer: 'steam',
  dishwasher: 'dishwasher',
  oven: 'fan',
  microwave: 'microwave',
  air_fryer: 'fries',
  hood: 'fan',
};

/** What a reminder asks to be done when it is due: its value in a row ("Lint filter · **Clean**"). */
export const DUE_WORD: Readonly<Record<MaintenanceKey, MessageKey>> = {
  salt: 'appliance.do_refill',
  rinse_aid: 'appliance.do_refill',
  detergent: 'appliance.do_refill',
  softener: 'appliance.do_refill',
  filter: 'appliance.do_clean',
  machine_care: 'appliance.do_run',
  descale: 'appliance.do_descale',
  clean: 'appliance.do_clean',
  water_tank: 'appliance.do_refill',
  beans: 'appliance.do_refill',
  drip_tray: 'appliance.do_empty',
  milk: 'appliance.do_check',
  water_filter: 'appliance.do_replace',
  air_filter: 'appliance.do_replace',
  grease_filter: 'appliance.do_clean',
  leak: 'appliance.do_check',
  service: 'appliance.do_check',
};

/** A span in hours and minutes, as the hero writes the time left: "1:12", "0:48". */
export function hoursMinutes(seconds: number): { readonly h: string; readonly mm: string } {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return { h: String(Math.floor(minutes / 60)), mm: String(minutes % 60).padStart(2, '0') };
}

/** A config's row as the card reads it: a bare key or entity id, or an entry. */
export function rowEntry(raw: RowKey | string | RowEntry): RowEntry {
  if (typeof raw !== 'string') return raw.key || !raw.entity ? raw : { ...raw, key: 'entity' };
  return raw.includes('.') ? { key: 'entity', entity: raw } : { key: raw as RowKey };
}
