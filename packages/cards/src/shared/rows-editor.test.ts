// @vitest-environment happy-dom
import type { HaFormSchemaItem } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  FluvyRowsEditor,
  compact,
  entryOf,
  itemOf,
  itemsOf,
  moved,
  toItem,
  withList,
  withoutUntouchedDefaults,
  itemHelpers,
  listsEditor,
  withChoices,
  type RowsListSpec,
} from './rows-editor.js';
import { inverted } from './config.js';

/** A list with a grammar of its own: a word or a hex alone, or `{ color, name }`; a hex is edited as Custom. */
const colours: RowsListSpec = {
  key: 'colors',
  idKey: 'color',
  title: 'editor.colors',
  schema: [{ name: 'color', selector: { text: {} } }],
  read: (raw) => {
    if (typeof raw === 'string')
      return raw ? { color: raw.startsWith('#') ? 'custom' : raw } : null;
    const { color, name } = (raw ?? {}) as { color?: unknown; name?: unknown };
    return typeof color === 'string' && color ? { color, ...(name ? { name } : {}) } : null;
  },
  write: (item) => {
    const color = item['color'] === 'custom' ? '#ff9800' : item['color'];
    if (typeof color !== 'string' || !color) return null;
    return item['name'] ? { color, name: item['name'] } : color;
  },
};

const rows: RowsListSpec = {
  key: 'rows',
  alias: 'entities',
  title: 'editor.rows',
  schema: [{ name: 'entity', selector: { entity: {} } }],
};
const chips: RowsListSpec = {
  key: 'chips',
  idKey: 'label',
  title: 'editor.rows',
  schema: [{ name: 'label', selector: { text: {} } }],
};

describe('rows editor lists', () => {
  it('reads bare ids and objects, drops entries without an id', () => {
    expect(toItem('sensor.a', 'entity')).toEqual({ entity: 'sensor.a' });
    expect(toItem({ entity: 'sensor.b', tone: 'solar' }, 'entity')).toEqual({
      entity: 'sensor.b',
      tone: 'solar',
    });
    expect(toItem('', 'entity')).toBeNull();
    expect(toItem({ name: 'no id' }, 'entity')).toBeNull();
  });

  it('keeps an entry identified by another field (a battery read by two sensors has no power)', () => {
    const batteries: RowsListSpec = {
      key: 'batteries',
      idKey: 'power',
      also: ['phases', 'import', 'export', 'level'],
      title: 'editor.rows',
      schema: [{ name: 'power', selector: { entity: {} } }],
    };
    expect(toItem({ import: 'sensor.in', export: 'sensor.out' }, 'power', batteries.also)).toEqual({
      import: 'sensor.in',
      export: 'sensor.out',
    });
    expect(toItem({ phases: ['sensor.l1'] }, 'power', batteries.also)).toEqual({
      phases: ['sensor.l1'],
    });
    expect(toItem({ phases: [], name: 'none' }, 'power', batteries.also)).toBeNull();
    expect(
      itemsOf(
        { type: 't', batteries: [{ power: 'sensor.a' }, { level: 'sensor.soc' }, { name: 'x' }] },
        batteries,
      ),
    ).toEqual([{ power: 'sensor.a' }, { level: 'sensor.soc' }]);
  });

  it('writes an entity with nothing else back as its bare id, and drops empty fields', () => {
    expect(compact({ entity: 'sensor.a', name: '', icon: undefined }, 'entity')).toBe('sensor.a');
    expect(compact({ entity: 'sensor.a', name: 'Sun' }, 'entity')).toEqual({
      entity: 'sensor.a',
      name: 'Sun',
    });
    expect(compact({ label: 'Home' }, 'label')).toEqual({ label: 'Home' }); // a chip stays an object
  });

  it('reads the list under its key, or under the alias while the key is empty', () => {
    expect(itemsOf({ type: 't', entities: ['sensor.a'] }, rows)).toEqual([{ entity: 'sensor.a' }]);
    expect(itemsOf({ type: 't', rows: ['sensor.b'], entities: ['sensor.a'] }, rows)).toEqual([
      { entity: 'sensor.b' },
    ]);
    expect(itemsOf({ type: 't', chips: [{ label: 'Home' }, 'Energy'] }, chips)).toEqual([
      { label: 'Home' },
      { label: 'Energy' },
    ]);
  });

  it('writes the list under its own key and drops the alias', () => {
    expect(
      withList({ type: 't', entities: ['sensor.a'], title: 'x' }, rows, ['sensor.a', 'sensor.b']),
    ).toEqual({ type: 't', title: 'x', rows: ['sensor.a', 'sensor.b'] });
  });

  it('moves one entry and keeps the others in order', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moved(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('reads and writes a list by its own grammar when it has one, by the id rule otherwise', () => {
    expect(itemOf('sensor.a', rows)).toEqual({ entity: 'sensor.a' });
    expect(entryOf({ entity: 'sensor.a', name: '' }, rows)).toBe('sensor.a');
    expect(itemOf('#ff2d55', colours)).toEqual({ color: 'custom' });
    expect(itemOf({ color: 'amber', name: 'Honey' }, colours)).toEqual({
      color: 'amber',
      name: 'Honey',
    });
    expect(itemOf({ name: 'Nameless' }, colours)).toBeNull();
    expect(entryOf({ color: 'custom' }, colours)).toBe('#ff9800');
    expect(entryOf({ color: 'warm', name: 'Evening' }, colours)).toEqual({
      color: 'warm',
      name: 'Evening',
    });
    expect(entryOf({ color: '' }, colours)).toBeNull();
    expect(itemsOf({ type: 't', colors: ['warm', '#ff2d55', 7, { name: 'x' }] }, colours)).toEqual([
      { color: 'warm' },
      { color: 'custom' },
    ]);
  });

  it('shows a list’s default as rows only while the config names neither the key nor the alias', () => {
    const fallback = ['warm', 'cool'];
    expect(itemsOf({ type: 't' }, colours, fallback)).toEqual([
      { color: 'warm' },
      { color: 'cool' },
    ]);
    expect(itemsOf({ type: 't', colors: [] }, colours, fallback)).toEqual([]); // named empty: empty
    expect(itemsOf({ type: 't', colors: ['red'] }, colours, fallback)).toEqual([{ color: 'red' }]);
    expect(itemsOf({ type: 't' }, colours)).toEqual([]);
    expect(itemsOf({ type: 't', entities: ['sensor.a'] }, rows, ['sensor.z'])).toEqual([
      { entity: 'sensor.a' },
    ]);
    expect(itemsOf({ type: 't', rows: [] }, rows, ['sensor.z'])).toEqual([]);
  });
});

describe('an editor with a list default', () => {
  const editor = (config: Record<string, unknown>): FluvyRowsEditor => {
    const element = listsEditor({ schema: [] }, [colours], () => ({
      colors: ['warm', 'cool'],
    })) as FluvyRowsEditor;
    element.setConfig({ type: 'custom:x', ...config });
    return element;
  };
  const written = (element: FluvyRowsEditor): Promise<Record<string, unknown>> =>
    new Promise((resolve) =>
      element.addEventListener('config-changed', (event) =>
        resolve((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config),
      ),
    );
  type Private = {
    onAdd(list: RowsListSpec, event: CustomEvent<{ value: Record<string, unknown> }>): void;
    onItem(
      list: RowsListSpec,
      index: number,
      event: CustomEvent<{ value: Record<string, unknown> }>,
    ): void;
  };
  const change = (value: Record<string, unknown>) =>
    new CustomEvent('value-changed', { detail: { value } });

  it('writes the default rows with the first addition, never before', async () => {
    const element = editor({});
    expect(element.config).toEqual({ type: 'custom:x' });
    const next = written(element);
    (element as unknown as Private).onAdd(colours, change({ color: 'custom' }));
    expect(await next).toEqual({ type: 'custom:x', colors: ['warm', 'cool', '#ff9800'] });
  });

  it('edits a default row in place once touched, and drops a row that says nothing any more', async () => {
    const element = editor({});
    const next = written(element);
    (element as unknown as Private).onItem(colours, 1, change({ color: 'cool', name: 'Day' }));
    expect(await next).toEqual({
      type: 'custom:x',
      colors: ['warm', { color: 'cool', name: 'Day' }],
    });
    const cleared = editor({ colors: ['warm', 'cool'] });
    const after = written(cleared);
    (cleared as unknown as Private).onItem(colours, 0, change({ color: '' }));
    expect(await after).toEqual({ type: 'custom:x', colors: ['cool'] });
  });

  it('leaves a list the config names empty alone', async () => {
    const element = editor({ colors: [] });
    const next = written(element);
    (element as unknown as Private).onAdd(colours, change({ color: 'pink' }));
    expect(await next).toEqual({ type: 'custom:x', colors: ['pink'] });
  });
});

describe('editor defaults', () => {
  it('writes back what the user set, never a default that was only shown', () => {
    const config = { type: 't', variant: 'dial' };
    const defaults = { variant: 'dial', fan_style: 'full', show_fan: true, modes: ['off', 'heat'] };
    expect(
      withoutUntouchedDefaults(
        { variant: 'dial', fan_style: 'full', show_fan: true, modes: ['off', 'heat'] },
        config,
        defaults,
      ),
    ).toEqual({ variant: 'dial' });
    expect(
      withoutUntouchedDefaults(
        { variant: 'dial', fan_style: 'chips', show_fan: false, modes: ['off'] },
        config,
        defaults,
      ),
    ).toEqual({ variant: 'dial', fan_style: 'chips', show_fan: false, modes: ['off'] });
    expect(withoutUntouchedDefaults({ title: 'x' }, config, defaults)).toEqual({ title: 'x' });
  });
});

describe('an editor with aliases', () => {
  it('shows an older name in its newer field and writes the newer one on the first change', () => {
    const editor = listsEditor(
      {
        schema: [
          { name: 'subtitle', selector: { text: {} } },
          { name: 'show_done', selector: { boolean: {} } },
        ],
      },
      [],
      undefined,
      [{ keys: [{ from: 'sub', to: 'subtitle' }, inverted('hide_done', 'show_done')] }],
    ) as FluvyRowsEditor;
    editor.setConfig({ type: 'custom:x', sub: 'Upstairs', hide_done: true });
    expect(editor.config).toEqual({ type: 'custom:x', subtitle: 'Upstairs', show_done: false });
  });
});

describe('a select’s options as the house has them', () => {
  const modes = {
    name: 'modes',
    selector: {
      select: { multiple: true, reorder: true, options: [{ value: 'off', label: 'Off' }] },
    },
  };
  const style = {
    name: 'style',
    selector: { select: { options: [{ value: 'tiles', label: 'Tiles' }] } },
  };
  const schema: HaFormSchemaItem[] = [
    { name: '', type: 'grid', schema: [modes, style] },
    { name: 'title', selector: { text: {} } },
  ];
  const heat = [
    { value: 'off', label: 'Aus' },
    { value: 'heat', label: 'Heizen' },
  ];

  it('swaps in the options of the field it names, through grids, and leaves the rest as they were', () => {
    const chosen = withChoices(schema, { modes: heat });
    expect(chosen[0]?.schema?.[0]?.selector).toEqual({
      select: { multiple: true, reorder: true, options: heat },
    });
    expect(chosen[0]?.schema?.[1]).toBe(style);
    expect(chosen[1]).toBe(schema[1]);
    // a name that is no select keeps its field
    expect(withChoices(schema, { title: heat })[1]).toBe(schema[1]);
  });

  it('draws the form with them, the same schema while they say the same', () => {
    let house = 'heat';
    const editor = listsEditor({ schema }, [], undefined, undefined, () =>
      house === 'heat' ? { modes: heat } : {},
    ) as FluvyRowsEditor;
    editor.setConfig({ type: 'custom:x' });
    const formOf = (): unknown =>
      (editor as unknown as { schema(spec: unknown): unknown }).schema(editor.spec);
    const first = formOf();
    expect(formOf()).toBe(first);
    expect(first).not.toBe(editor.spec?.schema);
    // a house that says nothing of them leaves the form as the card wrote it
    house = 'none';
    expect(formOf()).toBe(editor.spec?.schema);
  });
});

describe('what the editor says under a field', () => {
  const key = (k: string): string => k;
  it('explains the second line — a keyword or a template for its select, words or a template for a text field', () => {
    expect(itemHelpers({ name: 'secondary', selector: { select: {} } }, key)).toBe(
      "A keyword, or a template such as {{ states('sensor.x') }}",
    );
    expect(itemHelpers({ name: 'secondary', selector: { text: {} } }, key)).toBe(
      "Your own words, or a template such as {{ states('sensor.x') }}",
    );
    expect(itemHelpers({ name: 'name', selector: { text: {} } }, key)).toBeUndefined();
  });
});
