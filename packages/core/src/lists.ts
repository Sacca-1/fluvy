import type { LovelaceCardConfig } from './ha/types.js';

/*
 * The lists a card's config carries (`entities`, `rows`, `tiles`), read alike by every card. A list is what the
 * person typed or what a filter (auto-entities) handed over: ids, or objects naming one with options of their own,
 * and now and then a row that names none (a section's title, a divider). An empty list is a list — a filter that
 * matches nothing yet — never a configuration error; only a list that is not one is.
 */

/** An entry of an entity list: its id, or an object naming it (with options of its own). */
export type EntityEntry = string | { readonly entity: string };

/**
 * The list a config holds under `key`, else under the first of `aliases` that holds one (auto-entities hands its
 * matches over as `entities`): [] when none is given. Anything there that is not a list is the one error ("rows"
 * must be a list), said with the card's name.
 */
export function listOf<T = unknown>(
  config: LovelaceCardConfig,
  key: string,
  aliases: readonly string[] = [],
): readonly T[] {
  for (const name of [key, ...aliases]) {
    const value = config[name];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) return value as T[];
    const card = config.type.replace(/^custom:/, '');
    throw new Error(`${card ? `${card}: ` : ''}"${name}" must be a list`);
  }
  return [];
}

/** Whether an entry names an entity: a non-empty id, or an object with one. */
function named(entry: unknown): entry is EntityEntry {
  const id =
    typeof entry === 'object' && entry !== null ? (entry as { entity?: unknown }).entity : entry;
  return typeof id === 'string' && id !== '';
}

/**
 * The entries of a list that name an entity, as they are (ids, or objects with their options); the rest — a
 * section's title, a divider, an empty line — are skipped, never drawn as a missing entity.
 */
export function entriesOf<T extends { readonly entity: string } = { readonly entity: string }>(
  list: readonly unknown[] | undefined,
): (string | T)[] {
  return (list ?? []).filter(named) as (string | T)[];
}

/** The ids a list names, in its order. */
export const idsOf = (list: readonly unknown[] | undefined): string[] =>
  entriesOf(list).map((entry) => (typeof entry === 'string' ? entry : entry.entity));

/** The entries of a list as items, in its order: a bare id is an item with nothing of its own (`{ entity }`). */
export const itemsOf = <T extends { readonly entity: string } = { readonly entity: string }>(
  list: readonly unknown[] | undefined,
): T[] =>
  entriesOf<T>(list).map((entry) => (typeof entry === 'string' ? ({ entity: entry } as T) : entry));
