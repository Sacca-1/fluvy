import { strings, type HaFormSchemaItem, type MessageKey } from '@fluvy/core';
import {
  accentField,
  actionField,
  boolField,
  editorLabels,
  editorWord,
  fieldRow,
  nameIconFields,
  numberField,
  pickFields,
  textField,
  toneField,
} from '../shared/form.js';
import type { RowsListSpec } from '../shared/rows-editor.js';
import { MATCH_KEYS, type AlertConfig } from './model.js';
import { PRESET_NAMES, PRESETS, isPreset } from './presets.js';
import { SEVERITIES, SEVERITY_WORDS } from './severity.js';

/*
 * The alerts card's editor: its list of alerts in the rows editor, each picked as a preset (or `custom`, an alert of
 * the person's own), its form then showing what that alert reads — a preset's parameters, the scope that narrows it,
 * how it counts and names its rows, its look, its actions — or, for a custom one, the whole matcher. Every key an alert
 * takes has its field; what has no field of Home Assistant's own (conditions, escalation, buttons, `match`) is an
 * object field, written as Home Assistant's own YAML. The choices' words are the family's (they travel with its chunk).
 */

const s = strings('alerts');

/** A choice among values, each named by a word of the catalogue. */
export const choiceField = (
  name: string,
  options: ReadonlyArray<readonly [value: string, word: MessageKey]>,
): HaFormSchemaItem => ({
  name,
  selector: {
    select: {
      mode: 'dropdown',
      options: options.map(([value, word]) => ({ value, label: editorWord(word) })),
    },
  },
});

/** Values the person may also type (domains, device classes, states). */
const valuesField = (name: string): HaFormSchemaItem => ({
  name,
  selector: { select: { multiple: true, custom_value: true, mode: 'dropdown', options: [] } },
});
/** Home Assistant's own picker of several areas, floors, labels, devices or entities. */
const pickerField = (
  name: string,
  kind: 'area' | 'floor' | 'label' | 'device' | 'entity',
): HaFormSchemaItem => ({ name, selector: { [kind]: { multiple: true } } });
const durationField = (name: string): HaFormSchemaItem => ({
  name,
  selector: { duration: { enable_day: true } },
});
/** A part with no field of Home Assistant's own: its YAML. */
const objectField = (name: string): HaFormSchemaItem => ({ name, selector: { object: {} } });

const PRESET_FIELD = choiceField('preset', [
  ...PRESET_NAMES.map((preset) => [preset, PRESETS[preset].title] as const),
  ['custom', 'alerts.o_custom'],
]);

/** Every field an alert may show, in the form's order: a preset's form is a part of it. */
const FIELDS: readonly HaFormSchemaItem[] = [
  PRESET_FIELD,
  nameIconFields(),
  fieldRow(
    choiceField(
      'severity',
      SEVERITIES.map((severity) => [severity, SEVERITY_WORDS[severity]] as const),
    ),
    toneField(),
  ),
  accentField(),
  // what a custom alert matches
  pickerField('entity', 'entity'),
  fieldRow(valuesField('domain'), valuesField('device_class')),
  fieldRow(textField('entity_id'), valuesField('integration')),
  fieldRow(valuesField('state'), valuesField('not_state')),
  fieldRow(numberField('above', -100000, 100000, 0.1), numberField('below', -100000, 100000, 0.1)),
  textField('attribute'),
  // a preset's parameters
  fieldRow(boolField('phones'), boolField('acknowledged')),
  // the scope that narrows it
  fieldRow(pickerField('area', 'area'), pickerField('floor', 'floor')),
  fieldRow(pickerField('label', 'label'), pickerField('device', 'device')),
  pickerField('exclude', 'entity'),
  // time
  fieldRow(durationField('for'), durationField('unchanged_for')),
  fieldRow(boolField('include_unavailable'), boolField('hidden')),
  boolField('diagnostic'),
  // how it counts, names and orders its rows
  fieldRow(
    choiceField('count_by', [
      ['entity', 'alerts.o_entity'],
      ['device', 'alerts.o_device'],
    ]),
    numberField('min_count', 1, 100),
  ),
  fieldRow(
    choiceField('name_by', [
      ['entity', 'alerts.o_entity'],
      ['device', 'alerts.o_device'],
      ['area', 'option.area'],
    ]),
    choiceField('sort_rows', [
      ['duration', 'alerts.o_duration'],
      ['value', 'alerts.o_value'],
      ['name', 'option.name'],
      ['area', 'option.area'],
    ]),
  ),
  fieldRow(boolField('split'), boolField('snooze')),
  boolField('admin_only'),
  // what a tap does
  fieldRow(actionField('tap_action'), actionField('hold_action')),
  fieldRow(actionField('row_action'), actionField('row_hold_action')),
  objectField('row_button'),
  objectField('actions'),
  // when it applies, when it grows graver, a matcher of several clauses, its memory's key
  objectField('conditions'),
  objectField('escalate'),
  objectField('match'),
  textField('id'),
];

/** What every alert shows: its pick, its look, its taps, when it applies, its buttons, its memory. */
const EVERY = [
  'preset',
  'name',
  'icon',
  'severity',
  'tone',
  'color',
  'min_count',
  'snooze',
  'admin_only',
  'tap_action',
  'hold_action',
  'row_action',
  'row_hold_action',
  'row_button',
  'actions',
  'conditions',
  'escalate',
  'id',
];
/** What an alert of the house's states shows besides: its scope, its time, how it counts and names its rows. */
const STATES = [
  'area',
  'floor',
  'label',
  'device',
  'exclude',
  'for',
  'hidden',
  'count_by',
  'name_by',
  'sort_rows',
  'split',
];
/** What a custom alert shows besides: the whole matcher and its modifiers. */
const MATCHER = [...MATCH_KEYS, 'unchanged_for', 'include_unavailable', 'diagnostic', 'match'];

const forms = new Map<string, readonly HaFormSchemaItem[]>();

/** The fields of one alert: a preset's and its parameters, or a custom alert's whole matcher (one array per answer). */
export function alertFields(item: Readonly<Record<string, unknown>>): readonly HaFormSchemaItem[] {
  const preset = isPreset(item['preset']) ? item['preset'] : undefined;
  const key = preset ?? 'custom';
  let form = forms.get(key);
  if (!form) {
    const spec = preset ? PRESETS[preset] : undefined;
    const shown = new Set<string>([
      ...EVERY,
      ...(spec?.source ? [] : STATES),
      ...(spec ? (spec.params ?? []) : MATCHER),
    ]);
    form = pickFields(FIELDS, (name) => shown.has(name));
    forms.set(key, form);
  }
  return form;
}

/** Every field of the whole form: the item keys the editor shows. */
const namesOf = (schema: readonly HaFormSchemaItem[]): string[] =>
  schema.flatMap((item) => (item.schema ? namesOf(item.schema) : [item.name]));
export const ALERT_KEYS: readonly string[] = namesOf(FIELDS);

/** An alert of the config as the editor's item: one without a preset is `custom`, and says so. */
const read = (raw: unknown): Record<string, unknown> | null =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? { preset: 'custom', ...(raw as AlertConfig) }
    : null;

/**
 * The editor's item back as an alert: `custom` leaves (an alert without a preset is the person's own) and so do empty
 * fields; a custom alert that matches nothing yet says so (`match: []`) — a list still empty, not a mistake.
 */
const write = (item: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const entry = Object.fromEntries(
    Object.entries(item).filter(
      ([key, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(key === 'preset' && value === 'custom') &&
        !(key !== 'match' && Array.isArray(value) && !value.length),
    ),
  );
  const matches = MATCH_KEYS.some((key) => entry[key] !== undefined);
  if (Array.isArray(entry['match']) && !entry['match'].length && matches) delete entry['match'];
  if (entry['preset'] === undefined && !matches) entry['match'] ??= [];
  return entry;
};

/** Each item field's word. */
const ITEM_WORDS: Readonly<Record<string, MessageKey>> = {
  preset: 'alerts.editor.preset',
  severity: 'alerts.editor.severity',
  entity: 'editor.entities',
  domain: 'alerts.editor.domain',
  device_class: 'alerts.editor.device_class',
  entity_id: 'alerts.editor.entity_id',
  integration: 'alerts.editor.integration',
  state: 'alerts.editor.state',
  not_state: 'alerts.editor.not_state',
  above: 'alerts.editor.above',
  below: 'alerts.editor.below',
  attribute: 'alerts.editor.attribute',
  phones: 'alerts.editor.phones',
  acknowledged: 'alerts.editor.acknowledged',
  floor: 'alerts.editor.floor',
  device: 'alerts.editor.device',
  exclude: 'alerts.editor.exclude',
  for: 'alerts.editor.for',
  unchanged_for: 'alerts.editor.unchanged_for',
  include_unavailable: 'alerts.editor.include_unavailable',
  hidden: 'alerts.editor.hidden',
  diagnostic: 'alerts.editor.diagnostic',
  count_by: 'alerts.editor.count_by',
  min_count: 'alerts.editor.min_count',
  name_by: 'alerts.editor.name_by',
  sort_rows: 'alerts.editor.sort_rows',
  split: 'alerts.editor.split',
  snooze: 'alerts.editor.snooze',
  admin_only: 'alerts.editor.admin_only',
  row_action: 'alerts.editor.row_action',
  row_hold_action: 'alerts.editor.row_hold_action',
  row_button: 'alerts.editor.row_button',
  actions: 'alerts.editor.actions',
  conditions: 'alerts.editor.conditions',
  escalate: 'alerts.editor.escalate',
  match: 'alerts.editor.match',
  id: 'alerts.editor.id',
};

/** The alerts, item by item in the rows editor: a preset picked to add one, its form by what it is. */
export const ALERTS_LIST: RowsListSpec = {
  key: 'alerts',
  title: 'alerts.editor.alerts',
  idKey: 'preset',
  picker: PRESET_FIELD,
  keys: ALERT_KEYS,
  schema: FIELDS,
  schemaOf: alertFields,
  read,
  write,
  computeLabel: (schema) => {
    const key = ITEM_WORDS[schema.name];
    return key ? editorWord(key) : undefined;
  },
};

/** The card's own fields' words: the family's, where the shared editor has none. */
export const cardLabels = (): ReturnType<typeof editorLabels> =>
  editorLabels(s, {
    show_culprit: 'editor.show_culprit',
    show_duration: 'editor.show_duration',
    compact: 'editor.compact',
    order: 'editor.order',
    rotate: 'editor.rotate',
    snooze: 'editor.snooze_scope',
    max_alerts: 'editor.max_alerts',
  });
