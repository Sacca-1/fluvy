import {
  english,
  localize,
  type HaFormSchemaItem,
  type HomeAssistant,
  type KeyOf,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
  type MessageKey,
} from '@fluvy/core';
import { TONES } from '@fluvy/ui';

/** The words every card's editor shares, by field name: a card maps only its own fields (or another word). */
export const SHARED_LABELS: Readonly<Record<string, MessageKey>> = {
  title: 'editor.title',
  subtitle: 'editor.subtitle',
  icon: 'editor.icon',
  tone: 'editor.tone',
  color: 'editor.color',
  card_color: 'editor.card_color',
  entity: 'editor.entity',
  entities: 'editor.entities',
  name: 'editor.name',
  tap_action: 'editor.tap_action',
  hold_action: 'editor.hold_action',
  hours: 'editor.hours',
  variant: 'editor.variant',
  size: 'editor.size',
  columns: 'editor.columns',
  secondary: 'editor.secondary',
  min: 'editor.min',
  max: 'editor.max',
};

/** The language an editor speaks: `getConfigForm()` is static, so it comes from the document. */
export const editorLanguage = (): Pick<HomeAssistant, 'language'> => ({
  language: document.documentElement.lang || 'en',
});

/** A value a select may hold: one the catalogue has a word for (`option.<value>`), in every language. */
export type OptionWord = KeyOf<'option'>;

/** A word of the catalogue in the editor's language (a select built by hand names its choices with it). */
export const editorWord = (key: MessageKey): string => localize(editorLanguage(), key);

/** What names an editor's field (`computeLabel` of a config form): a word, or HA's own when undefined. */
export type FormLabeler = (
  schema: HaFormSchemaItem,
  localize: (key: string) => string,
) => string | undefined;

/** Editor labels in the dashboard's language. `getConfigForm()` is static, so the language comes from the document. */
/** A field's own editor word, when the catalogue has one (`show_rows` → `editor.show_rows`). */
const editorKey = (name: string): MessageKey | undefined =>
  Object.hasOwn(english.editor, name) ? (`editor.${name}` as MessageKey) : undefined;

export function formLabels(map: Readonly<Record<string, MessageKey>> = {}): {
  readonly computeLabel: FormLabeler;
} {
  return {
    computeLabel: (schema: HaFormSchemaItem) => {
      const key = map[schema.name] ?? SHARED_LABELS[schema.name] ?? editorKey(schema.name);
      if (!key) return undefined;
      return localize(editorLanguage(), key);
    },
  };
}

/**
 * Editor labels for a card with words of its own: a field it owns is named from its own namespace (`own`, the
 * card's `strings('<name>')`), the rest from the shared editor words (the defaults, and `shared` for another word).
 */
export function editorLabels<K extends string>(
  strings: (hass: Pick<HomeAssistant, 'language'> | undefined, key: K) => string,
  own: Readonly<Record<string, K>>,
  shared: Readonly<Record<string, MessageKey>> = {},
): { readonly computeLabel: FormLabeler } {
  const fallback = formLabels(shared);
  return {
    computeLabel: (schema, localize) => {
      const key = own[schema.name];
      return key ? strings(editorLanguage(), key) : fallback.computeLabel(schema, localize);
    },
  };
}

/**
 * The visual editor shows a list as an entity picker, which can only hold ids. A list with
 * `{ entity, name, … }` rows makes Home Assistant fall back to its YAML editor instead of mangling them.
 */
export function idsOnly(...keys: readonly string[]): Pick<LovelaceConfigForm, 'assertConfig'> {
  return {
    assertConfig: (config: LovelaceCardConfig) => {
      for (const key of keys) {
        const list = config[key];
        if (Array.isArray(list) && list.some((row) => typeof row !== 'string'))
          throw new Error(`"${key}" has rows with options: edit them as YAML`);
      }
    },
  };
}

export const entityField = (
  domains?: readonly string[],
  name = 'entity',
  required = true,
): HaFormSchemaItem => ({
  name,
  required,
  selector: { entity: domains ? { domain: [...domains] } : {} },
});

export const textField = (name: string): HaFormSchemaItem => ({ name, selector: { text: {} } });
export const iconField = (name = 'icon'): HaFormSchemaItem => ({ name, selector: { icon: {} } });
/** An area of the house, from Home Assistant's own picker. */
export const areaField = (name = 'area'): HaFormSchemaItem => ({
  name,
  required: true,
  selector: { area: {} },
});
export const boolField = (name: string): HaFormSchemaItem => ({ name, selector: { boolean: {} } });
export const numberField = (
  name: string,
  min: number,
  max: number,
  step = 1,
): HaFormSchemaItem => ({ name, selector: { number: { min, max, step, mode: 'box' } } });
/**
 * A choice among values the catalogue names (a value without a word does not compile), in the editor's language;
 * `custom` lets a value of the person's own be typed as well (an attribute's name, a template).
 */
export const selectField = (
  name: string,
  options: readonly OptionWord[],
  { custom = false }: { custom?: boolean } = {},
): HaFormSchemaItem => ({
  name,
  selector: {
    select: {
      mode: 'dropdown',
      ...(custom ? { custom_value: true } : {}),
      options: options.map((value) => ({
        value,
        label: localize(editorLanguage(), `option.${value}`),
      })),
    },
  },
});
/**
 * An ordered subset of named choices (a compact row's `controls`): Home Assistant's select as chips that are
 * dragged into order, with a box to add the rest. The dropdown mode is asked for: with fewer than six choices the
 * selector would draw check boxes, which keep no order. `custom` lets a value of the person's own be typed as well
 * (a light's quick colour as `#rrggbb`).
 */
export const orderedField = (
  name: string,
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
  { custom = false }: { custom?: boolean } = {},
): HaFormSchemaItem => ({
  name,
  selector: {
    select: {
      multiple: true,
      reorder: true,
      mode: 'dropdown',
      ...(custom ? { custom_value: true } : {}),
      options: [...options],
    },
  },
});

export const actionField = (name = 'tap_action'): HaFormSchemaItem => ({
  name,
  selector: { ui_action: {} },
});

/** What a card answers a tap and a still press with, on one row. */
export const actionFields = (): HaFormSchemaItem =>
  fieldRow(actionField('tap_action'), actionField('hold_action'));

/** The palette's tones as a dropdown, each by its word. */
export const toneSelector = (language: Pick<HomeAssistant, 'language'> = editorLanguage()) => ({
  select: {
    mode: 'dropdown',
    options: TONES.map((value) => ({ value, label: localize(language, `tone.${value}`) })),
  },
});

/** Two fields side by side: one row of the editor (Home Assistant's form grid). */
export const fieldRow = (...schema: HaFormSchemaItem[]): HaFormSchemaItem => ({
  type: 'grid',
  name: '',
  flatten: true,
  schema,
});

/** A form with only the fields `keep` names: a row that loses one field keeps the other on its own line. */
export function pickFields(
  schema: readonly HaFormSchemaItem[],
  keep: (name: string) => boolean,
): HaFormSchemaItem[] {
  return schema.flatMap((item): HaFormSchemaItem[] => {
    if (!item.schema) return keep(item.name) ? [item] : [];
    const inner = pickFields(item.schema, keep);
    if (inner.length === item.schema.length) return [item];
    return inner;
  });
}

/** A card's tone, from the palette's tones. */
export const toneField = (): HaFormSchemaItem => ({ name: 'tone', selector: toneSelector() });

/**
 * A card's or an item's own colour: Home Assistant's colour picker — its named swatches, shown in the palette's
 * colours where the look reaches the editor, or any hex typed — with the palette's accent as its default.
 */
export const accentField = (name = 'color', { none = false } = {}): HaFormSchemaItem => ({
  name,
  selector: { ui_color: { default_color: 'primary', include_none: none, include_state: false } },
});

/** A tone and a colour on one row, then the card's own surface colour (`card_color`, none by default). */
export const colourFields = (): HaFormSchemaItem[] => [
  fieldRow(toneField(), accentField()),
  accentField('card_color', { none: true }),
];

/** When an item's colour shows on its surface: while it is on (the default), or always (a quiet wash at rest). */
export const tintField = (): HaFormSchemaItem => selectField('tint', ['on', 'always']);

/** What a device card shows while the device is off: everything (the default), or the essentials alone. */
export const whenOffField = (): HaFormSchemaItem => selectField('when_off', ['all', 'essentials']);

/** A card's head: its title and its subtitle, on one row. */
export const titleFields = (): HaFormSchemaItem =>
  fieldRow(textField('title'), textField('subtitle'));

/** A card's icon and its tone, on one row. */
export const iconToneFields = (): HaFormSchemaItem => fieldRow(iconField(), toneField());

/** A name and an icon, on one row (a card's, or an item's in a list). */
export const nameIconFields = (): HaFormSchemaItem => fieldRow(textField('name'), iconField());

/** A list of entities in one picker (the visual editor's form; `listsEditor` gives each its own). */
export const entitiesField = (
  name: string,
  domains?: readonly string[],
  required = false,
): HaFormSchemaItem => ({
  name,
  ...(required ? { required } : {}),
  selector: { entity: { multiple: true, ...(domains ? { domain: [...domains] } : {}) } },
});
