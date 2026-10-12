// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';

import { FluvyLightCard, type LightCardConfig } from './light-card.js';

const list = FluvyLightCard.lists[0]!;
const names = (schema: ReadonlyArray<{ name: string; schema?: readonly unknown[] }>): string[] =>
  schema.flatMap((item) =>
    item.schema ? names(item.schema as ReadonlyArray<{ name: string }>) : [item.name],
  );

/** A house with one bulb, reporting the colour modes given. */
const house = (modes: readonly string[]): HomeAssistant =>
  ({
    states: {
      'light.lamp': {
        entity_id: 'light.lamp',
        state: 'on',
        attributes: { supported_color_modes: modes },
      },
    },
  }) as unknown as HomeAssistant;

describe('the light card’s quick colours in the editor', () => {
  it('edits the list row by row: a colour first, the well and a name', () => {
    expect(list.key).toBe('colors');
    expect(list.idKey).toBe('color');
    expect(names(list.schema)).toEqual(['color', 'name', 'rgb']);
    expect(list.picker?.name).toBe('color');
    const options = (
      list.picker?.selector?.['select'] as { options: { value: string; label: string }[] }
    ).options;
    expect(options.map((o) => o.value)).toEqual([
      'warm',
      'cool',
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'picker',
      'custom',
    ]);
    expect(options.at(-1)?.label).toBe('Custom colour');
  });

  it('shows the well only while a row is Custom, and the same form for the same answer', () => {
    expect(names(list.schemaOf!({ color: 'custom' }))).toEqual(['color', 'name', 'rgb']);
    expect(names(list.schemaOf!({ color: 'warm' }))).toEqual(['color', 'name']);
    expect(names(list.schemaOf!({ color: 'blue', rgb: [1, 2, 3] }))).toEqual(['color', 'name']);
    expect(list.schemaOf!({ color: 'custom' })).toBe(
      list.schemaOf!({ color: 'custom', name: 'x' }),
    );
    expect(list.schemaOf!({ color: 'red' })).toBe(list.schemaOf!({ color: 'amber' }));
    expect(list.schemaOf!({ color: 'custom' })).toBe(list.schema);
  });

  it('says what the fields mean: how to pick a colour, what the name is for', () => {
    const t = (key: string): string => key;
    expect(list.computeHelper?.({ name: 'color' }, t)).toMatch(/Custom colour/);
    expect(list.computeHelper?.({ name: 'name' }, t)).toMatch(/round/);
    // the well carries no floating label (Home Assistant's colour input paints its whole box): its word is the helper
    expect(list.computeLabel?.({ name: 'rgb' }, t)).toBe('');
    expect(list.computeHelper?.({ name: 'rgb' }, t)).toMatch(/colour/i);
  });

  it('shows the bulb’s own default six as rows: whites first with a temperature, colours alone without', () => {
    const colours = (hass: HomeAssistant | undefined): unknown =>
      FluvyLightCard.defaults!({ type: 'custom:fluvy-light-card', entity: 'light.lamp' }, hass)[
        'colors'
      ];
    expect(colours(house(['hs', 'color_temp']))).toEqual([
      'warm',
      'cool',
      'red',
      'orange',
      'green',
      'blue',
    ]);
    expect(colours(house(['rgb']))).toEqual(['red', 'orange', 'green', 'blue', 'purple', 'pink']);
    expect(colours(undefined)).toEqual(['red', 'orange', 'green', 'blue', 'purple', 'pink']);
  });
});

describe('the light card’s height follows the count of its quick colours', () => {
  const height = (colors?: LightCardConfig['colors']): number =>
    FluvyLightCard.layoutHeight({
      type: 'custom:fluvy-light-card',
      entity: 'light.lamp',
      ...(colors ? { colors } : {}),
    });
  const six = height();

  it('counts six by default, a named entry as one, and wraps by six a row', () => {
    expect(six).toBe(268 + 100 + 8 + 52);
    expect(height(['warm', { color: '#ff2d55', name: 'Lila' }, [0, 128, 128]])).toBe(six); // one short row
    expect(height(Array.from({ length: 12 }, () => 'red'))).toBe(six + 52); // two rows
    expect(height(Array.from({ length: 13 }, () => 'red'))).toBe(six + 104); // and a third
  });

  it('draws no row for a list of none, and stays on the 4 px grid', () => {
    expect(height([])).toBe(268 + 100);
    for (const n of [0, 1, 3, 6, 7, 12, 25])
      expect(height(Array.from({ length: n }, () => 'red')) % 4).toBe(0);
  });
});
