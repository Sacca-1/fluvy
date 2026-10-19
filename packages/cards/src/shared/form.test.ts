// @vitest-environment happy-dom
import type { HaFormSchemaItem } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  accentField,
  colourFields,
  editorLabels,
  formLabels,
  selectField,
  toneField,
} from './form.js';

const label = (form: ReturnType<typeof formLabels>, name: string): string | undefined =>
  form.computeLabel?.({ name } as HaFormSchemaItem, (key) => key);

describe('editor labels', () => {
  it('name the shared fields without a card listing them', () => {
    document.documentElement.lang = 'en';
    expect(label(formLabels(), 'title')).toBe('Title');
    expect(label(formLabels(), 'entities')).toBe('Entities');
    expect(label(formLabels(), 'mystery')).toBeUndefined();
  });
  it('let a card give a shared field another word, and its own fields its own', () => {
    document.documentElement.lang = 'en';
    expect(label(formLabels({ title: 'editor.tabs' }), 'title')).toBe('Tabs');
    const own = editorLabels((_hass, key: 'mine') => `own:${key}`, { field: 'mine' });
    expect(label(own, 'field')).toBe('own:mine');
    expect(label(own, 'icon')).toBe('Icon');
  });
});

describe('the choices of a select', () => {
  const labels = (item: HaFormSchemaItem): string[] =>
    ((item.selector as { select: { options: { label: string }[] } }).select.options ?? []).map(
      (option) => option.label,
    );
  it('are said in the editor’s language, from the catalogue', () => {
    document.documentElement.lang = 'es';
    expect(labels(selectField('variant', ['full', 'compact']))).toEqual(['Completa', 'Compacta']);
    expect(labels(toneField())).toContain('Ventilador');
    document.documentElement.lang = 'en';
    expect(labels(selectField('forecast', ['both', 'none']))).toEqual(['Daily and hourly', 'None']);
    expect(labels(toneField())[0]).toBe('Accent');
  });
});

describe('a select that takes a value of its own', () => {
  const select = (item: HaFormSchemaItem): Record<string, unknown> =>
    (item.selector as { select: Record<string, unknown> }).select;
  it('offers it only when asked (a keyword, an attribute or a template in the second line)', () => {
    expect(select(selectField('variant', ['full', 'compact']))['custom_value']).toBeUndefined();
    expect(
      select(selectField('secondary', ['area', 'none'], { custom: true }))['custom_value'],
    ).toBe(true);
  });
});

describe('a colour field', () => {
  const picker = (item: HaFormSchemaItem): Record<string, unknown> =>
    (item.selector as { ui_color: Record<string, unknown> }).ui_color;
  it('says the palette’s accent for a card’s or an item’s colour, none for a surface until one is chosen (#40)', () => {
    expect(picker(accentField())).toMatchObject({ default_color: 'primary', include_none: false });
    const surface = colourFields()[1]!;
    expect(surface.name).toBe('card_color');
    expect(picker(surface)).toMatchObject({ default_color: 'none', include_none: true });
  });
});
