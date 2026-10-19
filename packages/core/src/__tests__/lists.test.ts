// @vitest-environment happy-dom
import { html, type TemplateResult } from 'lit';
import { describe, expect, it } from 'vitest';
import { FluvyCard } from '../card.js';
import { entriesOf, idsOf, itemsOf, listOf } from '../lists.js';

describe('listOf', () => {
  it('reads the list under its key, else under the first alias that holds one', () => {
    expect(listOf({ type: 'custom:fluvy-bars-card', rows: ['sensor.a'] }, 'rows')).toEqual([
      'sensor.a',
    ]);
    // auto-entities hands its matches over as `entities`
    const config = { type: 'custom:fluvy-bars-card', entities: [{ entity: 'sensor.b' }] };
    expect(listOf(config, 'rows', ['entities'])).toEqual([{ entity: 'sensor.b' }]);
    expect(listOf({ ...config, rows: ['sensor.a'] }, 'rows', ['entities'])).toEqual(['sensor.a']);
  });

  it('is empty when no list is given, and an empty list is a list, never an error', () => {
    expect(listOf({ type: 'custom:fluvy-bars-card' }, 'rows', ['entities'])).toEqual([]);
    // `rows:` with nothing under it reads as null in YAML
    expect(listOf({ type: 'custom:fluvy-bars-card', rows: null }, 'rows')).toEqual([]);
    expect(listOf({ type: 'custom:fluvy-bars-card', rows: [] }, 'rows', ['entities'])).toEqual([]);
  });

  it('says, with the card’s name, that a list is not one', () => {
    expect(() => listOf({ type: 'custom:fluvy-bars-card', rows: 'sensor.a' }, 'rows')).toThrow(
      'fluvy-bars-card: "rows" must be a list',
    );
    expect(() =>
      listOf({ type: 'custom:fluvy-bars-card', entities: { entity: 'a' } }, 'rows', ['entities']),
    ).toThrow('"entities" must be a list');
  });
});

describe('entriesOf and idsOf', () => {
  // what auto-entities hands over: objects with options, a section's title and a divider among them
  const list = [
    'light.a',
    { entity: 'light.b', name: 'Desk' },
    { type: 'section', label: 'Upstairs' },
    { type: 'divider' },
    '',
    { entity: '' },
    { entity: 7 },
    null,
  ];

  it('keeps the entries that name an entity, as they are', () => {
    expect(entriesOf(list)).toEqual(['light.a', { entity: 'light.b', name: 'Desk' }]);
    expect(entriesOf(undefined)).toEqual([]);
  });

  it('gives the ids in the list’s order', () => {
    expect(idsOf(list)).toEqual(['light.a', 'light.b']);
    expect(idsOf(undefined)).toEqual([]);
  });

  it('gives the items in the list’s order, a bare id as an item of its own', () => {
    expect(itemsOf(list)).toEqual([{ entity: 'light.a' }, { entity: 'light.b', name: 'Desk' }]);
    expect(itemsOf(undefined)).toEqual([]);
  });
});

class ListCard extends FluvyCard {
  ids(): readonly string[] {
    return this.watched();
  }
  protected renderCard(): TemplateResult {
    return html``;
  }
}
customElements.define('fluvy-lists-test-card', ListCard);

describe('the base card', () => {
  it('watches the ids of an object list, never "[object Object]"', () => {
    const card = document.createElement('fluvy-lists-test-card') as ListCard;
    card.setConfig({
      type: 'custom:fluvy-lists-test-card',
      entity: 'sensor.a',
      entities: ['sensor.b', { entity: 'sensor.c' }, { type: 'section' }],
    });
    expect(card.ids()).toEqual(['sensor.a', 'sensor.b', 'sensor.c']);
  });
});
