import type { LovelaceCardConfig } from '@fluvy/core';
import type { FamilyEntry } from './energy-family.js';
import { HEAD, ROW, ROW_COMPACT, rowsOf } from './shared/heights.js';

/**
 * The automations family (the automations card and its schedule sheet), announced at start and defined when its
 * chunk lands (`automations-cards.ts`), as the devices family is: what the card picker lists and how tall the card
 * is at a 360 column, without the card itself. Every page carries this file: it stays tiny.
 */

/** Rows before the "{count} more" row takes over, when the config says nothing. */
export const AUTOMATIONS_MAX_ROWS = 6;
/** The filter chips (44) and the 16 under them. */
const FILTERS = 60;
/** The empty panel under the head's 16: its ring, its line and the administrator's hint (132; a guest's is the 120 minimum). */
const EMPTY = 132;

/**
 * The automations card at a 360 column: the head, the filter chips when shown, then the rows (60, 48 compact) or
 * the tiles (two a row of 84, 8 apart) with the fold row counted as the openings card counts it (one extra
 * automation is a row, not a "1 more" row). Listing the whole house, the card is as tall as its fold allows.
 */
export const automationsHeight = (config: LovelaceCardConfig): number => {
  const entities = config['entities'];
  const asked = Math.round(Number(config['max_rows']));
  const max = Number.isFinite(asked) ? Math.min(30, Math.max(1, asked)) : AUTOMATIONS_MAX_ROWS;
  const n = Array.isArray(entities) ? entities.length : max;
  const filters = config['show_filters'] === true ? FILTERS : 0;
  if (n === 0) return HEAD + filters + EMPTY;
  const more = n > max + 1 ? 1 : 0;
  const shown = more ? max : n;
  if (config['variant'] === 'tiles') {
    const rows = rowsOf(shown, 2);
    return HEAD + filters + rows * 84 + (rows - 1) * 8 + more * (16 + ROW_COMPACT);
  }
  return HEAD + filters + (config['variant'] === 'compact' ? ROW_COMPACT : ROW) * (shown + more);
};

export const AUTOMATIONS_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-automations-card',
    'Fluvy · Automations',
    'Every automation of the house: on or off, run, last and next run; schedules written as native automations, created and edited in a sheet.',
    automationsHeight,
  ],
];
