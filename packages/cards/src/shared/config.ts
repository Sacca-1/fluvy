import type { FluvyCardConfig, LovelaceCardConfig } from '@fluvy/core';

/**
 * The cards' configuration vocabulary, shared: the names every card reads the same way, the older names each still
 * reads (an alias is read, never written — a dashboard's YAML keeps working as it was), and the types the editors
 * are checked against.
 */

/** One older name read as a newer one: applied when `from` is present and `to` is not; `from` is then dropped. */
export interface Move {
  readonly from: string;
  readonly to: string;
  /** Applies only when the old value passes (`forecast: none` → `show_forecast: false`, not every `forecast`). */
  readonly when?: (value: unknown) => boolean;
  /** The new value from the old one (`hide_completed: true` → `show_completed: false`); identity when absent. */
  readonly map?: (value: unknown) => unknown;
}

/** What a card reads as something else: keys of its own, keys of the items of its lists, keys it drops. */
export interface AliasSpec {
  readonly keys?: readonly Move[];
  /** By list key: the moves applied to each item of that list (a bare id is left alone). */
  readonly items?: Readonly<Record<string, readonly Move[]>>;
  /** Keys read into something else by the card itself and removed here (the calendar's `tones`). */
  readonly drop?: readonly string[];
  /**
   * An older shape that no single move can express (several flat keys become one list): a pure function from the
   * config to the newer one, applied after the moves and before `drop` — the keys it reads go in `drop`.
   */
  readonly upgrade?: (
    config: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
}

const move = (from: string, to: string, extra: Omit<Move, 'from' | 'to'> = {}): Move => ({
  from,
  to,
  ...extra,
});

/** `hide_x: true` reads as `show_x: false`. */
export const inverted = (from: string, to: string): Move =>
  move(from, to, { map: (value) => (typeof value === 'boolean' ? !value : value) });

/** The names every card once read, now read as the shared ones. */
export const COMMON_ALIASES: AliasSpec = {
  keys: [
    move('sub', 'subtitle'),
    move('meta', 'subtitle'),
    move('layout', 'variant'),
    move('view', 'variant'),
    move('trend_hours', 'hours'),
    move('accent', 'color'),
  ],
};

/** The names an item of a list once carried, now read as the shared ones. */
export const ITEM_ALIASES: readonly Move[] = [
  move('label', 'name'),
  move('sub', 'secondary'),
  move('meta', 'subtitle'),
];

type Bag = Record<string, unknown>;

function applyMoves(bag: Bag, moves: readonly Move[]): Bag {
  let next = bag;
  for (const { from, to, when, map } of moves) {
    if (!(from in next)) continue;
    const value = next[from];
    if (when && !when(value)) continue;
    if (next === bag) next = { ...bag };
    if (!(to in next)) next[to] = map ? map(value) : value;
    delete next[from];
  }
  return next;
}

/**
 * The config as the card reads it: every alias of every spec applied in order (a chain reads on — the clock's
 * `variant` becomes its `face` before its `layout` becomes its `variant`), the items of the named lists likewise,
 * the dropped keys gone. The object given is never written to; an unchanged config comes back as it was.
 */
export function normaliseConfig<C extends LovelaceCardConfig>(
  config: C,
  ...specs: readonly AliasSpec[]
): C {
  let next: Bag = config;
  for (const spec of specs) {
    if (spec.keys) next = applyMoves(next, spec.keys);
    for (const [key, moves] of Object.entries(spec.items ?? {})) {
      const list = next[key];
      if (!Array.isArray(list)) continue;
      const items = list.map((item: unknown) =>
        typeof item === 'object' && item !== null ? applyMoves(item as Bag, moves) : item,
      );
      if (items.some((item, index) => item !== list[index])) next = { ...next, [key]: items };
    }
    if (spec.upgrade) {
      const upgraded = spec.upgrade(next) as Bag;
      if (upgraded !== next) next = upgraded;
    }
    for (const key of spec.drop ?? []) {
      if (!(key in next)) continue;
      if (next === config) next = { ...next };
      delete next[key];
    }
  }
  return next as C;
}

/* ---------- shared value types ---------- */

/** How many across, or as many as fit. */
export type Columns = 1 | 2 | 3 | 4 | 'auto';

/** A `columns` as written (a number, "auto", a numeral in quotes, nonsense) to one the card can lay out. */
export function columnsOf(raw: unknown, fallback: Columns): Columns {
  if (raw === 'auto') return 'auto';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : fallback;
}

/** A row of short choices: chips that fill the row (the default) or content-sized ones. */
export type RowStyle = 'full' | 'chips';

/** What a device card shows while the device is off: everything (the default), or the essentials — what wakes it. */
export type WhenOff = 'all' | 'essentials';

/** What a row says under its name: the area, when it last changed, its state, nothing — or an attribute by name. */
export type Secondary = 'area' | 'last-changed' | 'state' | 'none' | (string & {});

/* ---------- the editors' contract ---------- */

/** The keys an interface declares itself, without the index signature every Lovelace config carries. */
export type KnownKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

/**
 * A card's own keys: what its config declares beyond the base card's fields (entity, name, icon, the actions,
 * tone, colour) and Home Assistant's envelope. A key that starts with `_` (`_now`, the instant a test freezes)
 * is a hook for the tests, never something an editor shows.
 */
export type OwnKeys<C> = Exclude<KnownKeys<C>, KnownKeys<FluvyCardConfig> | `_${string}`>;

type Missing<C, K extends readonly unknown[]> = Exclude<OwnKeys<C>, K[number]>;

/**
 * `static keys = configKeys<MyConfig>()(['variant', 'columns'])`: the keys the editor shows, checked against the
 * config's interface both ways — a key the interface does not declare is refused, and one it declares that the
 * list forgets fails the call with the missing name in the type it asks for (`{ missing: "columns" }`). What comes
 * back is plain strings: a card's keys widen along its config, so a subclass declares its own without a clash.
 */
export const configKeys =
  <C>() =>
  <const K extends readonly OwnKeys<C>[]>(
    keys: K & ([Missing<C, K>] extends [never] ? unknown : { readonly missing: Missing<C, K> }),
  ): readonly string[] =>
    keys;
