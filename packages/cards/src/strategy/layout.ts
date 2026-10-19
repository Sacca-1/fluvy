import type { HomeRegistry } from './home-registry.js';
import type { Card, CardStyle, EnergyRoles, Section, StrategyContext, View } from './types.js';
import { layoutHeightOf } from '@fluvy/core';

/*
 * The cards the strategy places and how a view's columns are cut so they end on one line: the small builders the
 * views share, the header every view opens with, and the heights (measured at a 360 column) the cutting reads.
 */

/* ---------- cards ---------- */

export const tile = (entity: string, extra: Record<string, unknown> = {}): Card => ({
  type: 'custom:fluvy-tile-card',
  entity,
  ...extra,
  grid_options: { columns: 6 },
});
export const full = (type: string, extra: Record<string, unknown> = {}): Card => ({
  type: `custom:fluvy-${type}-card`,
  ...extra,
  grid_options: { columns: 12 },
});
export const heading = (
  title: string,
  icon: string,
  entities: readonly string[],
  path?: string,
): Card => ({
  type: 'custom:fluvy-heading-card',
  title,
  icon,
  ...(entities.length ? { entities: [...entities] } : {}),
  ...(path ? { path } : {}),
});
export const section = (...cards: Card[]): Section => ({ type: 'grid', cards });
/** `...when(value, (v) => [cards])`: the cards only when the house has the thing. */
export const when = <V, T = Card>(
  value: V | undefined | null | false | 0 | '',
  build: (value: V) => T[],
): T[] => (value ? build(value) : []);

export const entityRow = (home: HomeRegistry, entity: string) => ({
  entity,
  ...home.named(entity),
});
export const deviceRow = (home: HomeRegistry, entity: string) => ({
  entity,
  name: home.deviceLabel(entity),
});
export const applianceTile = (home: HomeRegistry, id: string): Card => {
  const readouts = home.readoutsOf(id);
  return tile(id, { ...home.named(id), ...(readouts.length ? { readouts: [...readouts] } : {}) });
};
/**
 * The house's sources in the energy cards' own words — or none when the energy dashboard carries their power
 * sensors: then the cards read it themselves (every grid connection, array and battery, with their signs).
 */
export function energySources(e: EnergyRoles): Record<string, unknown>[] {
  if (e.prefsPower) return [];
  const grid = e.gridPhases.length
    ? [{ type: 'grid', phases: [...e.gridPhases] }]
    : e.gridImport && e.gridExport
      ? [{ type: 'grid', import: e.gridImport, export: e.gridExport }]
      : e.gridPower
        ? [{ type: 'grid', power: e.gridPower, ...(e.gridInvert ? { invert: true } : {}) }]
        : [];
  return [
    ...(e.solarPower ? [{ type: 'solar', power: e.solarPower }] : []),
    ...grid,
    ...(e.batteryPower
      ? [
          {
            type: 'battery',
            power: e.batteryPower,
            ...(e.batteryInvert ? { invert: true } : {}),
            ...(e.batteryLevel ? { level: e.batteryLevel } : {}),
          },
        ]
      : []),
  ];
}

/** Whether the house has sources for the flow and the balance to draw. */
export const hasSources = (e: EnergyRoles): boolean =>
  e.prefsPower || Boolean(e.solarPower || e.gridPower || e.gridPhases.length || e.batteryPower);

const sourcesOf = (e: EnergyRoles): Record<string, unknown> => {
  const sources = energySources(e);
  return sources.length ? { sources } : {};
};

/** The flow in the dashboard's style (and a period, for a day's totals). */
export const energyFlow = (
  e: EnergyRoles,
  style: CardStyle,
  extra: Record<string, unknown> = {},
): Card =>
  full('energy-flow', {
    ...(style.flow ? { flow_style: style.flow } : {}),
    ...sourcesOf(e),
    ...(e.homePower && !extra['period'] ? { home: e.homePower } : {}),
    ...extra,
  });

/** What comes in against what goes out. */
export const energyBalance = (e: EnergyRoles, extra: Record<string, unknown> = {}): Card =>
  full('energy-balance', { ...sourcesOf(e), ...extra });

/** The grid: by phase, by two sensors, or its one meter; the energy dashboard's first connection otherwise. */
export const gridCard = (e: EnergyRoles): Card =>
  full(
    'grid',
    e.prefsPower
      ? {}
      : e.gridPhases.length
        ? { phases: [...e.gridPhases] }
        : e.gridImport && e.gridExport
          ? { import: e.gridImport, export: e.gridExport }
          : { power: e.gridPower, ...(e.gridInvert ? { invert: true } : {}) },
  );

/** The house's batteries: the energy dashboard's, or the one found by its words with its charge. */
export const batteriesCard = (e: EnergyRoles): Card =>
  full(
    'batteries',
    e.prefsPower || !e.batteryPower
      ? {}
      : {
          batteries: [
            {
              power: e.batteryPower,
              ...(e.batteryInvert ? { invert: true } : {}),
              ...(e.batteryLevel ? { level: e.batteryLevel } : {}),
            },
          ],
        },
  );

/** Whether the house has a battery the batteries card can read (the energy dashboard's gives its power too). */
export const hasBattery = (e: EnergyRoles): boolean => Boolean(e.batteryPower);

/** A thermostat in the dashboard's variant. */
export const thermostat = (id: string, style: CardStyle): Card =>
  full('thermostat', { entity: id, ...(style.thermostat ? { variant: style.thermostat } : {}) });
/** A tile in the dashboard's size (a compact odd one out still spans the column: `tileRows`). */
export const sizedTile = (id: string, extra: Record<string, unknown>, style: CardStyle): Card =>
  tile(id, { ...extra, ...(style.tiles === 'compact' ? { size: 'compact' } : {}) });

/** The header every view opens with (the greeting and the tabs), so it reads as fixed while the content changes. */
/** The greeting: whoever looks at the dashboard (it names no person, so a saved copy still greets each viewer). */
export const helloCard = (weather: string | undefined): Card => ({
  type: 'custom:fluvy-hello-card',
  ...(weather ? { weather } : {}),
});
export const tabsCard = (base: string, views: readonly View[]): Card => ({
  type: 'custom:fluvy-chips-card',
  // a subview (a room) is reached from its rooms, never from the tabs
  chips: views
    .filter((view) => !view.subview)
    .map((view) => ({
      label: view.title,
      icon: view.icon,
      path: `${base}/${view.path}`,
    })),
});

/** The greeting above the first column (60 + 16), and the tabs under it when the dashboard shows them (44 + 16). */
export const HELLO_HEIGHT = 76;
export const TABS_HEIGHT = 60;
const GAP = 16;
const listLength = (card: Card): number => {
  for (const key of ['rows', 'entities', 'scenes', 'tiles'] as const) {
    const value = card[key];
    if (Array.isArray(value)) return value.length;
  }
  return 0;
};
/** What the columns are cut with: the header's height over the first column, and the house the cards count with. */
export type LayoutContext = Pick<StrategyContext, 'header' | 'hass'>;
export /** A card's height: what the card declares for its config and the house (`static layoutHeight`), else a head and 64 a row. */
const heightOf = (card: Card, { hass }: LayoutContext): number =>
  layoutHeightOf(card, 100 + 64 * listLength(card), hass);
const halfColumn = (card: Card): boolean => card.grid_options?.columns === 6;
/** A run of cards stacked in one column; half-column cards side by side, two a row. */
function heightOfAll(cards: readonly Card[], ctx: LayoutContext): number {
  let height = 0;
  let pending: number | undefined;
  for (const card of cards) {
    const own = heightOf(card, ctx) + GAP;
    if (!halfColumn(card)) height += own;
    else if (pending === undefined) pending = own;
    else {
      height += Math.max(pending, own);
      pending = undefined;
    }
  }
  return height + (pending ?? 0);
}

/** Every way to cut `count` blocks into `parts` non-empty runs, as the indices where the runs after the first begin. */
function* cutsOf(count: number, parts: number, from = 1): Generator<number[]> {
  if (parts <= 1) {
    yield [];
    return;
  }
  for (let cut = from; cut <= count - parts + 1; cut++)
    for (const rest of cutsOf(count, parts - 1, cut + 1)) yield [cut, ...rest];
}

/**
 * A view's columns, level at the foot. The blocks are laid down column after column in reading order (a
 * block — a heading with its first row, a pair of tiles — never splits); then each loose card goes to the foot
 * of the column that is shortest by then. Of every way to cut the blocks into the columns, the one whose
 * columns end closest to one line once the loose cards are in (the first column carries the header).
 */
export function flowed(
  ctx: LayoutContext,
  blocks: readonly (readonly Card[])[],
  loose: readonly Card[] = [],
  columns = 3,
): Section[] {
  const runs = blocks.filter((block) => block.length > 0);
  let best: { columns: Card[][]; spread: number } | undefined;
  for (const cuts of cutsOf(runs.length, Math.min(columns, runs.length))) {
    const bounds = [0, ...cuts, runs.length];
    const laid = Array.from({ length: columns }, (_, i) => {
      const cards = runs.slice(bounds[i] ?? runs.length, bounds[i + 1] ?? runs.length).flat();
      return { cards, height: (i === 0 ? ctx.header : 0) + heightOfAll(cards, ctx) };
    });
    for (const card of loose) {
      const shortest = laid.reduce((low, next) => (next.height < low.height ? next : low));
      shortest.cards.push(card);
      shortest.height += heightOf(card, ctx) + GAP;
    }
    const heights = laid.map((column) => column.height);
    const spread = Math.max(...heights) - Math.min(...heights);
    if (!best || spread < best.spread)
      best = { columns: laid.map((column) => column.cards), spread };
  }
  return (best?.columns ?? []).map((cards) => section(...cards));
}

/** Cards shared out over the columns: the lead card under the header, every other one where the columns are shortest. */
export const balanced = (ctx: LayoutContext, [lead, ...rest]: readonly Card[]): Section[] =>
  flowed(ctx, lead ? [[lead]] : [], rest);

/** Tiles two a row; an odd one out closes the run as a compact tile across the column, so no row is half empty. */
export function tileRows(tiles: readonly Card[]): Card[][] {
  const rows = Array.from({ length: Math.ceil(tiles.length / 2) }, (_, i) =>
    tiles.slice(i * 2, i * 2 + 2),
  );
  const [odd, pair] = rows.at(-1) ?? [];
  if (odd && !pair)
    rows[rows.length - 1] = [{ ...odd, size: 'compact', grid_options: { columns: 12 } }];
  return rows;
}

/** A heading and its rows as blocks: the heading rides with the first row, never alone at a column's foot. */
export function headed(head: Card, rows: readonly Card[][]): Card[][] {
  const [first = [], ...rest] = rows;
  return [[head, ...first], ...rest];
}
