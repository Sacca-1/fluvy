import type { LovelaceCardConfig } from '@fluvy/core';
import type { FamilyEntry } from './energy-family.js';
import { HEAD, ROW_BAR, ROW_COMPACT, rowsOf } from './shared/heights.js';

/**
 * The appliances family (the appliance card and the list of the house's appliances), announced at start and defined
 * when its chunk lands (`appliances-cards.ts`), as the devices family is: what the card picker lists and how tall each
 * card is at a 360 column, without the cards themselves. Every page carries this file: it stays small.
 */

export type ApplianceVariant = 'full' | 'compact' | 'ring' | 'row';
export const APPLIANCE_VARIANTS: readonly ApplianceVariant[] = ['full', 'compact', 'ring', 'row'];

/** The kinds a card draws as a row where it names no layout (what lives on a plug), and the hood's compact one. */
const ROW_KINDS = ['microwave', 'kettle', 'toaster', 'blender', 'sandwich_maker', 'appliance'];

/** The layout a config asks for: its own, else its kind's where it names one, else the whole card. */
export function applianceVariant(config: LovelaceCardConfig | undefined): ApplianceVariant {
  const v = config?.['variant'];
  if ((APPLIANCE_VARIANTS as readonly unknown[]).includes(v)) return v as ApplianceVariant;
  const kind = config?.['kind'];
  return kind === 'hood' ? 'compact' : ROW_KINDS.includes(kind as string) ? 'row' : 'full';
}

/** The hero each kind draws (`kinds.ts` KIND_DEFAULTS): a cycle by default, as a washer's. */
const HEROES: Readonly<Record<string, string>> = {
  oven: 'heat',
  kettle: 'heat',
  hob: 'hob',
  fridge: 'cold',
  freezer: 'cold',
  wine: 'cold',
  coffee: 'state',
  hood: 'state',
  appliance: 'plug',
};
/** The kinds that draw their cycle's steps under it, and those with no buttons by default (a fridge's). */
const STEPPED = ['washer', 'dryer', 'washer_dryer', 'dishwasher'];
const QUIET = ['fridge', 'freezer', 'wine'];
/** The kinds with readouts of their own (`kinds.ts`, the programme the head's) when the card names none. */
const READOUTS = ['washer', 'washer_dryer', 'dryer', 'dishwasher', 'oven', 'air_fryer'];

/** The card's padding and head (20 + 44 + … + 20): every section counts the margin above it. */
const FRAME = 20 + 44 + 20;
/** A bar (12 + 8), the steps' words under it (4 + 16). */
const BAR = 12 + 8;
const STEP_WORDS = 4 + 16;
/** The line under the hero: 8 under a bar, 12 under anything else, 20 tall. */
const LINE_AFTER_BAR = 8 + 20;
const LINE = 12 + 20;
/** A row of 44 cells, chips or readouts, 16 under what it follows. */
const CELLS = 16 + 44;
/** A ring's dial at a 320 column (R 88), and a fridge's two side by side (R 56). */
const DIAL = 16 + 208;
const DIALS = 16 + 156;

/** A compact card's hero at a 360 column, with its line (a dial's too, for a hob and a coffee machine). */
function heroHeight(hero: string, config: LovelaceCardConfig, kind: string): number {
  switch (hero) {
    case 'heat':
      return BAR + LINE_AFTER_BAR;
    case 'plug':
    case 'state':
      return LINE;
    case 'hob':
    case 'cold':
      // a hob's plates, a fridge's setpoints as readouts side by side
      return CELLS + LINE;
    default: {
      if (config['show_progress'] === false) return LINE;
      const steps = config['progress_style'] !== 'bar' && STEPPED.includes(kind) ? STEP_WORDS : 0;
      return BAR + steps + LINE_AFTER_BAR;
    }
  }
}

/**
 * The whole card (#47, the reporter's design) at a 360 column: 20 over its head (64, the picture's, with or without
 * one: a row of appliances keeps its level), the hero's 108 16 under it (the figures and the bar, the compartments,
 * the plates or the drinks; a hood has none), its rows 20 under that (44 each: three where it names none, so a
 * dashboard's row of appliances ends level), what it adds when asked (the quick modes, the buttons, the programmes),
 * and 16 under the last.
 */
function fullHeight(config: LovelaceCardConfig, kind: string): number {
  const hero = HEROES[kind] ?? 'cycle';
  const on = (key: string): boolean => config[key] !== false;
  const steps = config['progress_style'] === 'steps' && STEPPED.includes(kind) ? 8 : 0;
  const region =
    hero === 'cold'
      ? on('show_zones')
        ? config['setpoint_style'] === 'stepper'
          ? 64 + 12 + 64
          : 108
        : 0
      : hero === 'hob'
        ? on('show_zones')
          ? 108
          : 0
        : hero === 'state'
          ? kind === 'coffee' && on('show_drinks')
            ? 108
            : 0
          : on('show_hero')
            ? 108 + steps
            : hero !== 'plug' && on('show_progress')
              ? 20 + steps
              : 0;
  const listed = config['rows'];
  const rows = on('show_rows') ? (Array.isArray(listed) ? listed.length : 3) : 0;
  const modes = config['show_modes'] === true && hero === 'cold' ? CELLS : 0;
  const buttons = config['show_controls'] === true ? CELLS : 0;
  const programs = config['show_programs'] === true ? 16 + 44 + 8 + 44 : 0;
  return (
    20 +
    64 +
    (region ? 16 + region : 0) +
    (rows ? 20 + rows * 44 : 0) +
    modes +
    buttons +
    programs +
    16
  );
}

/**
 * The appliance card at a 360 column: the whole card's (`fullHeight`); the row, 88 with its picture (76 with its
 * circle); compact, its padding and head, its kind's hero and line and one row of extra-small readouts; a ring, its
 * dial (two side by side for a fridge) and its line over its buttons. The kind is the card's (`kind`), a washer's
 * where it says none: the automatic dashboard names it.
 */
export const applianceHeight = (config: LovelaceCardConfig): number => {
  const variant = applianceVariant(config);
  if (variant === 'row')
    return config['picture'] === 'icon' || config['picture'] === 'none' ? ROW_BAR : 88;
  const kind =
    typeof config['kind'] === 'string' && config['kind'] !== 'auto' ? config['kind'] : 'washer';
  if (variant === 'full') return fullHeight(config, kind);
  const hero = HEROES[kind] ?? 'cycle';
  const compact = variant === 'compact';
  const buttons = compact || config['show_controls'] === false || QUIET.includes(kind) ? 0 : CELLS;
  if (variant === 'ring') {
    const dial =
      hero === 'cold'
        ? DIALS + LINE
        : hero === 'hob' || hero === 'state'
          ? heroHeight(hero, config, kind)
          : DIAL + LINE;
    return FRAME + dial + buttons;
  }
  // compact: one row of extra-small readouts, where it names some or its kind has them
  const named = config['readouts'];
  const stats = Array.isArray(named) ? named.length > 0 : READOUTS.includes(kind);
  return FRAME + heroHeight(hero, config, kind) + (stats ? CELLS : 0);
};

/** Rows before a "{count} more" row takes the others, when the config says nothing. */
export const APPLIANCES_MAX_ROWS = 6;

/**
 * The list of the house's appliances at a 360 column: the head, then a bar row each (76; 48 compact) 4 under it, or
 * tiles two a row (88, 8 apart; 84 with a circle) 16 under it, as many as the config lists; the house's, which the
 * config cannot count, as many as the fold allows (`max_rows`, six) and the fold row (4 + 48) after them, so a
 * dashboard reserves the most the card draws. An empty list's panel. Or each appliance's whole card, one under the
 * other.
 */
export const appliancesHeight = (config: LovelaceCardConfig): number => {
  const listed = config['appliances'];
  // the whole cards, one a row at a 360 column, 16 apart (the house's three where it names none)
  if (config['variant'] === 'cards') {
    const items: unknown[] = Array.isArray(listed) ? listed : [{}, {}, {}];
    return items.reduce<number>(
      (sum, item, index) =>
        sum +
        (index ? 16 : 0) +
        applianceHeight({
          type: '',
          ...(config['picture'] ? { picture: config['picture'] } : {}),
          ...(typeof item === 'object' && item ? item : {}),
        }),
      0,
    );
  }
  const asked = Math.round(Number(config['max_rows']));
  const max = Number.isFinite(asked) ? Math.min(30, Math.max(1, asked)) : APPLIANCES_MAX_ROWS;
  const n = Array.isArray(listed) ? Math.min(listed.length, max) : max;
  const fold = Array.isArray(listed) && listed.length <= max ? 0 : 4 + ROW_COMPACT;
  if (n === 0) return HEAD + 120;
  if (config['variant'] === 'tiles') {
    const rows = rowsOf(n, 2);
    const tile = config['picture'] === 'icon' || config['picture'] === 'none' ? 84 : 88;
    return HEAD + rows * tile + (rows - 1) * 8 + fold;
  }
  return HEAD - 12 + n * (config['variant'] === 'compact' ? ROW_COMPACT : ROW_BAR) + fold;
};

export const APPLIANCES_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-appliance-card',
    'Fluvy · Appliance',
    'A washer, dryer, dishwasher, oven, hob, fridge, coffee machine or small appliance on a plug, pictured: what it does, when it is ready, what it uses, its reminders.',
    applianceHeight,
  ],
  [
    'fluvy-appliances-card',
    'Fluvy · Appliances',
    'The house’s appliances as live rows, or their whole cards side by side: what runs, what is done, what waits.',
    appliancesHeight,
  ],
];
