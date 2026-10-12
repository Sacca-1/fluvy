import {
  isUsable,
  stateText,
  strings as words,
  valueParts,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { barRow, head, listRow, sheetStyles, type Tone } from '@fluvy/ui';

import { html, type CSSResultGroup, type TemplateResult } from 'lit';

import type { Segment } from '../shared/fit.js';
import { HeadFit } from '../energy/head.js';

import { baseOf, figureText, scaleFor, toBase } from '../gauge/units.js';

import { Card, type BaseKey } from '../shared/base.js';

import { glyphFor, stateWord } from '../shared/domain.js';

import {
  accentField,
  actionField,
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  idsOnly,
  nameIconFields,
  selectField,
  textField,
  titleFields,
  toneField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { HEAD, ROW, ROW_BAR, ROW_COMPACT } from '../shared/heights.js';
import { PENDING_LINE, TemplateTexts } from '../shared/templates.js';

const strings = words('bars');

export type BarsVariant = 'full' | 'compact';
const VARIANTS: readonly BarsVariant[] = ['full', 'compact'];

const anyNumber = (name: string): HaFormSchemaItem => ({
  name,
  selector: { number: { mode: 'box', step: 'any' } },
});

export interface BarRowConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** The row's own context in front of what its companions say ("6 panels"), or a template rendered live. */
  secondary?: string;
  /** One or more entities read into the row's secondary line (a string's temperature, a plant's note). */
  sub_entity?: string | readonly string[];
  /** The bar's range, in the entity's unit. Defaults: 0–100 for a percentage, 0–largest row otherwise. */
  min?: number;
  max?: number;
  /** Below this the row turns warning and counts towards the head badge. */
  low?: number;
  /** Above this the row turns warning and counts towards the head badge. */
  high?: number;
  /** Fills the icon circle and colours the bar. Without it the circle stays neutral and the bar takes the measure's tone. */
  tone?: Tone;
  /** No bar: a plain 60 px row with its value at the right (the inverter under its strings). */
  plain?: boolean;
  /** The row's own colour: its circle and its bar, in the palette's family. */
  color?: string;
  tap_action?: ActionConfig;
}

export interface BarsCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  rows?: ReadonlyArray<string | BarRowConfig>;
  /**
   * `full` (default): 76 px rows with the context under the name (60 for a plain one). `compact`: 48 px rows, the
   * name and the value on one line and the bar under them.
   */
  variant?: BarsVariant;
  /** "All good" by default. */
  badge_ok?: string;
  /** "{count} low" by default ("{count} thirsty", "{count} shaded"). */
  badge_warn?: string;
}

/** Device classes that are a share of themselves: 0 … 100, low at 20. */
const PERCENT = new Set(['battery', 'moisture', 'humidity']);

/** The tone a bar takes from what it measures, when the row does not say. */
function barToneFor(view: EntityView): Tone {
  const deviceClass = view.deviceClass;
  if (
    deviceClass === 'moisture' ||
    deviceClass === 'humidity' ||
    deviceClass === 'battery' ||
    deviceClass === 'water'
  )
    return 'water';
  if (deviceClass === 'power' || deviceClass === 'energy' || deviceClass === 'current')
    return 'solar';
  if (deviceClass === 'temperature') return 'heat';
  return 'accent';
}

const subEntities = (row: BarRowConfig): string[] =>
  row.sub_entity === undefined
    ? []
    : typeof row.sub_entity === 'string'
      ? [row.sub_entity]
      : [...row.sub_entity];

const rowsOf = (config: BarsCardConfig): BarRowConfig[] =>
  (config.rows ?? []).map((row) => (typeof row === 'string' ? { entity: row } : row));

/** A row's height: a bar row 76 and a plain one 60; every compact row 48. */
const rowHeight = (row: BarRowConfig, compact: boolean): number =>
  compact ? ROW_COMPACT : row.plain ? ROW : ROW_BAR;

/**
 * The bar-row list: one 76 px row per entity — icon circle, name and context, the value at the right
 * and a 4 px bar under the text — or, compact, 48 px rows with the name and the value on one line over
 * the bar. Rows outside their band turn warning and are counted in the head badge ("1 shaded",
 * "2 thirsty", "All good"). Strings, plants, batteries and meters are all this card.
 */
export class FluvyBarsCard extends Card<BarsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: BarsCardConfig): number {
    const compact = config.variant === 'compact';
    return rowsOf(config).reduce((height, row) => height + rowHeight(row, compact), HEAD);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
  ];

  private readonly head = new HeadFit(this);
  /** A row's own context when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);

  /** A list of many sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<BarsCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'variant',
    'badge_ok',
    'badge_warn',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'rows',
      title: 'editor.rows',
      keys: [
        'entity',
        'name',
        'icon',
        'secondary',
        'sub_entity',
        'min',
        'max',
        'low',
        'high',
        'tone',
        'color',
        'plain',
        'tap_action',
      ],
      schema: [
        entityField(),
        nameIconFields(),
        textField('secondary'),
        entitiesField('sub_entity'),
        fieldRow(toneField(), accentField()),
        fieldRow(anyNumber('min'), anyNumber('max')),
        fieldRow(anyNumber('low'), anyNumber('high')),
        fieldRow(boolField('plain'), actionField()),
      ],
      computeLabel: formLabels({ sub_entity: 'editor.sub_entity' }).computeLabel,
    },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  static override defaults: EditorDefaults = () => ({ variant: 'full' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('variant', VARIANTS)),
        ...colourFields(),
        entitiesField('rows', undefined, true),
        fieldRow(textField('badge_ok'), textField('badge_warn')),
        actionFields(),
      ],
      ...idsOnly('rows'),
      ...editorLabels(
        strings,
        { rows: 'rows', badge_ok: 'badge_ok', badge_warn: 'badge_warn' },
        {},
      ),
    };
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): BarsCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    const levels = sensors.filter((id) =>
      PERCENT.has(hass?.states?.[id]?.attributes.device_class ?? ''),
    );
    return {
      type: 'custom:fluvy-bars-card',
      title: strings(undefined, 'levels'),
      rows: (levels.length ? levels : sensors).slice(0, 4),
    };
  }

  private rows(): BarRowConfig[] {
    return this.config ? rowsOf(this.config) : [];
  }

  private compact(): boolean {
    return this.config?.variant === 'compact';
  }

  protected override prepare(config: BarsCardConfig): BarsCardConfig {
    if (!config.rows?.length) throw new Error('fluvy-bars-card: add at least one entity to "rows"');
    return config;
  }

  override getCardSize(): number {
    return Math.ceil((this.config ? FluvyBarsCard.layoutHeight(this.config) : HEAD) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return this.rows().flatMap((row) => [row.entity, ...subEntities(row)]);
  }

  /** `barRow` is a focusable button without a key handler of its own: Enter or Space on a focused row opens it. */
  private onRowsKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return; // a plain row has already answered
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('fv-row')) return;
    const index = [...(event.currentTarget as HTMLElement).children].indexOf(target);
    const row = this.rows()[index];
    if (!row) return;
    event.preventDefault();
    this.tap(row.entity, row.tap_action);
  };

  /**
   * The secondary line: the row's own context, then what its companion entities say, then why there
   * is no value. A state that follows a "·" is lowercase; figures and the user's own words are left alone.
   * In a narrow column the context gives way from the end — the word that says why there is no value never does.
   */
  private context(row: BarRowConfig, view: EntityView, usable: boolean, room: number): string {
    const own = row.secondary ? this.texts.resolve(row.secondary, row.entity) : '';
    const segments: Segment[] =
      own && own !== PENDING_LINE ? own.split(' · ').map((text) => ({ text, optional: true })) : [];
    const lower = (state: string): string =>
      segments.length
        ? state.charAt(0).toLocaleLowerCase(this.hass?.language) + state.slice(1)
        : state;
    for (const id of subEntities(row)) {
      const other = this.entity(id);
      if (other.status !== 'ok') continue;
      const parts = valueParts(this.hass, other);
      // a companion's own text may carry its own segments ("41 °C · 97 % efficiency"): each can go on its own
      const texts =
        other.number !== null
          ? [parts.unit ? `${parts.value} ${parts.unit}` : parts.value]
          : lower(stateText(this.hass, other)).split(' · ');
      for (const text of texts) segments.push({ text, optional: true });
    }
    const state = usable ? '' : stateText(this.hass, view);
    if (state) segments.push({ text: lower(state) });
    const first = segments[0];
    if (first && usable) segments[0] = { text: first.text }; // the row's first word of context stays
    const line = this.head.fitRowSegments(segments, room);
    if (!line) return own; // nothing else on the line: the row's own, a blank while its template is pending
    return state && line === lower(state) ? state : line; // left alone on the line, the state keeps its capital
  }

  protected renderCard(): TemplateResult {
    const rows = this.rows();
    const views = rows.map((row) => this.entity(row.entity));
    const tone: Tone = toneOf(this.config, 'accent');

    // rows that measure the same thing are written in one unit; a bar nobody bounded is measured against the largest bar
    const setPeak = new Map<string, number>();
    const barPeak = new Map<string, number>();
    views.forEach((view, index) => {
      const quantity = baseOf(view);
      if (!quantity) return;
      const size = Math.abs(quantity.value);
      setPeak.set(quantity.unit, Math.max(setPeak.get(quantity.unit) ?? 0, size));
      if (!rows[index]?.plain)
        barPeak.set(quantity.unit, Math.max(barPeak.get(quantity.unit) ?? 0, size));
    });

    const width = this.contentWidth;
    const compact = this.compact();
    let warnings = 0;
    // every row's figure first: whether the rows keep their circles is decided over all of them
    const items = rows.map((row, index) => {
      const view = views[index] as EntityView;
      const usable = isUsable(view);
      const quantity = usable ? baseOf(view) : null;
      const percent = PERCENT.has(view.deviceClass) || view.unit === '%';
      const factor = toBase(1, view.unit).value;
      const min = (row.min ?? 0) * factor;
      const max =
        row.max !== undefined
          ? row.max * factor
          : percent
            ? 100
            : (barPeak.get(quantity?.unit ?? '') ?? 0);
      const low = row.low ?? (percent ? 20 : undefined);
      const warn =
        quantity !== null &&
        ((low !== undefined && quantity.value < low * factor) ||
          (row.high !== undefined && quantity.value > row.high * factor));
      if (warn) warnings += 1;

      const scale = quantity ? scaleFor(setPeak.get(quantity.unit) ?? 0, quantity.unit) : null;
      const parts = valueParts(this.hass, view);
      // a figure in the set's unit; anything else (a percentage, a text state, "—") as Home Assistant formats it
      const figure =
        quantity && scale && scale.unit !== view.unit
          ? figureText(this.hass, quantity.value, scale)
          : parts.unit
            ? `${parts.value} ${parts.unit}`
            : parts.value;
      const title = row.name ?? view.name;
      // a compact row has no second line to say why there is no figure: the state's word is its value, where the
      // word leaves the name its room (the full row says it under the name)
      const value =
        compact && view.status !== 'ok'
          ? this.head.rowWord(width, title, stateWord(this.hass, view), figure)
          : figure;
      return { row, view, usable, quantity, min, max, warn, title, value };
    });
    const keepIcon = this.head.rowsKeepIcon(width, items, compact);
    const body = items.map(({ row, view, usable, quantity, min, max, warn, title, value }) => {
      // a row's own tone, or its colour as the accent; without either the circle stays neutral and the bar takes the measure's tone
      const own: Tone | undefined = row.tone ?? (row.color ? 'accent' : undefined);
      const iconTone: Tone = !usable ? 'off' : warn ? 'warning' : (own ?? 'neutral');
      const valueTone: 'warning' | '' = warn ? 'warning' : '';

      // a compact row is the name and the value alone: its context is not laid out
      const shared = {
        icon: keepIcon ? (row.icon ?? glyphFor(view)) : null,
        tone: iconTone,
        title,
        name: true,
        accent: this.accents.item(row.color),
        sub: compact
          ? ''
          : this.context(row, view, usable, this.head.rowRoom(width, value, { icon: keepIcon })),
        value,
        valueTone,
        compact,
        unavailable: !usable,
        onTap: (): void => this.tap(row.entity, row.tap_action),
      };
      return row.plain
        ? listRow({ ...shared, trailing: 'value' })
        : barRow({
            ...shared,
            barTone: warn ? 'warning' : (own ?? barToneFor(view)),
            fraction: quantity === null || max <= min ? 0 : (quantity.value - min) / (max - min),
          });
    });

    const template =
      warnings > 0
        ? (this.config?.badge_warn ?? this.t('battery.low', { count: warnings }))
        : (this.config?.badge_ok ?? this.t('battery.all_good'));
    const title = this.config?.title ?? strings(this.hass, 'levels');
    const fitted = this.head.fit({
      width,
      title,
      sub: this.config?.subtitle ?? '',
      badge: {
        text: template.replace(/\{count\}/g, String(warnings)),
        tone: warnings > 0 ? 'warning' : tone,
      },
    });

    return html`<article class="fv-card so-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'sliders') : null,
        tone,
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: Boolean(this.config?.title),
        onIconTap: () => this.tap(),
        onHold: () => this.hold(),
      })}
      <div class="so-rows" @keydown=${this.onRowsKey}>${body}</div>
    </article>`;
  }
}
