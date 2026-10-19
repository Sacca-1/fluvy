// @vitest-environment happy-dom
import type { HaFormSchemaItem, LovelaceCardConfig } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { catalogue } from '../index.js';
import type { Card } from './base.js';
import { COMMON_ALIASES } from './config.js';
import { editorDefaults, itemLabels, type FluvyRowsEditor } from './rows-editor.js';

/**
 * The editors' contract (see `Card` in base.ts), held for every card of the catalogue: the editor is the base's,
 * built from the card's form, lists and defaults; the form never shows a list twice, nor an older name; a default
 * is for a field the editor shows; and, for a card under contract, what the form and the lists show is exactly
 * `base ∪ keys`, and every field it shows has a word. A card not yet under contract would be named here, so a
 * card cannot lose its keys unnoticed and the list can only shrink: every card is under it, and the set is empty.
 */
const PENDING = new Set<string>();

type CardClass = typeof Card & {
  getStubConfig?(hass: unknown, entities: readonly string[]): LovelaceCardConfig;
};

/** Every field a schema shows, through its grids. */
const fields = (schema: readonly HaFormSchemaItem[]): HaFormSchemaItem[] =>
  schema.flatMap((item) => (item.schema ? fields(item.schema) : item.name ? [item] : []));
/** Every field name a schema shows, through its grids. */
const names = (schema: readonly HaFormSchemaItem[]): string[] =>
  fields(schema).map((item) => item.name);
/** A label that is a word: not the field's own name, not a catalogue key handed back for a word that is missing. */
const isWord = (label: string | undefined, name: string): boolean =>
  typeof label === 'string' &&
  /\S/.test(label) &&
  label !== name &&
  !/^[a-z_-]+(\.[a-z_-]+)+$/.test(label);

const cards = (await catalogue()).map(([tag, element]) => ({
  tag,
  card: element as unknown as CardClass,
}));

describe('the editors’ contract', () => {
  it('names each card of the catalogue once, and pending ones that exist', () => {
    expect(new Set(cards.map((c) => c.tag)).size).toBe(cards.length);
    for (const tag of PENDING)
      expect(
        cards.some((c) => c.tag === tag),
        tag,
      ).toBe(true);
  });

  it.each(cards)(
    '$tag: the editor is the base’s, from the form, the lists and the defaults',
    async ({ card }) => {
      const element = (await card.getConfigElement()) as FluvyRowsEditor;
      expect(element.tagName.toLowerCase()).toBe('fluvy-rows-editor');
      const spec = element.spec!;
      expect(spec.lists).toBe(card.lists);
      const listKeys = new Set(
        card.lists.flatMap((list) => [list.key, ...(list.alias ? [list.alias] : [])]),
      );
      // a list is edited item by item: its picker leaves the form
      for (const name of names(spec.schema)) expect(listKeys.has(name), name).toBe(false);
      for (const list of card.lists) {
        expect(names(list.schema)[0], `${list.key}: the id field comes first`).toBe(
          list.idKey ?? 'entity',
        );
        if (list.keys) expect(new Set(names(list.schema))).toEqual(new Set(list.keys));
      }
    },
  );

  it.each(cards)(
    '$tag: every switch and every choice shows what the card does when the config says nothing',
    ({ card }) => {
      const defaults =
        editorDefaults(card.getConfigForm(), card.defaults)?.({ type: 'custom:x' }, undefined) ??
        {};
      for (const field of fields(card.getConfigForm().schema)) {
        const selector = (field as { selector?: Record<string, { multiple?: boolean }> }).selector;
        const choice = selector?.['boolean'] !== undefined || selector?.['select'] !== undefined;
        // a tone left empty is the card's own; several chosen of a list, empty, are all the entity has
        const optional = field.name === 'tone' || selector?.['select']?.multiple === true;
        if (choice && !optional) expect(field.name in defaults, field.name).toBe(true);
      }
    },
  );

  it.each(cards)(
    '$tag: a default is for a field the editor shows, never an older name',
    ({ card }) => {
      const shown = new Set(names(card.getConfigForm().schema));
      const defaults =
        editorDefaults(card.getConfigForm(), card.defaults)?.({ type: 'custom:x' }, undefined) ??
        {};
      for (const key of Object.keys(defaults)) expect(shown.has(key), key).toBe(true);
      // a conditional move (`forecast: none` → `show_forecast: false`) keeps its key: `forecast` is still a field
      for (const move of card.aliases?.keys ?? [])
        if (!move.when) expect(shown.has(move.from), move.from).toBe(false);
      // the names every card reads as something else are never shown either
      for (const move of COMMON_ALIASES.keys ?? [])
        expect(shown.has(move.from), `${move.from} is a shared older name`).toBe(false);
    },
  );

  it.each(cards)('$tag: every field the editor shows has a word', ({ card }) => {
    const form = card.getConfigForm();
    const key = (name: string): string => name;
    for (const item of fields(form.schema))
      expect(isWord(form.computeLabel?.(item, key), item.name), item.name).toBe(true);
    for (const list of card.lists)
      for (const item of fields(list.schema)) {
        const label =
          list.computeLabel?.(item, key) ?? form.computeLabel?.(item, key) ?? itemLabels(item, key);
        // a field may carry no floating label on purpose (a colour well paints its whole box): its word is then
        // the helper under it
        const word = label === '' ? list.computeHelper?.(item, key) : label;
        expect(isWord(word, item.name), `${list.key}.${item.name}`).toBe(true);
      }
  });

  it.each(cards)('$tag: what the form and the lists show is base ∪ keys', ({ tag, card }) => {
    if (!card.keys.length) {
      expect(PENDING.has(tag), `${tag} declares no keys and is not named as pending`).toBe(true);
      return;
    }
    expect(PENDING.has(tag), `${tag} declares its keys: drop it from PENDING`).toBe(false);
    const shown = new Set([
      ...names(card.getConfigForm().schema),
      ...card.lists.flatMap((list) => [list.key, ...(list.alias ? [list.alias] : [])]),
    ]);
    expect([...shown].sort()).toEqual([...new Set([...card.base, ...card.keys])].sort());
  });
});
