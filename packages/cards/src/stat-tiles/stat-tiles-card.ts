import {
  isUsable,
  stateText,
  strings as words,
  valueParts,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import {
  head,
  listRow,
  optionColumns,
  options,
  readout,
  sheetStyles,
  type OptionItem,
  type Tone,
} from '@fluvy/ui';

import { html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';

import { baseOf, figure, figureText, scaleFor, type Scale } from '../gauge/units.js';

import { Card } from '../shared/base.js';

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
import { optionColumnsFor } from '../shared/options.js';
import { HEAD, listLength, rowsOf, ROW, ROW_COMPACT } from '../shared/heights.js';
import { TemplateTexts } from '../shared/templates.js';

const strings = words('stat-tiles');

export type StatTilesVariant = 'full' | 'compact';
/** Tiles a row: two, three, or as many as the labels and values allow (three when they fit, else two). */
export type StatColumns = 2 | 3 | 'auto';
const VARIANTS: readonly StatTilesVariant[] = ['full', 'compact'];
const COLUMNS = ['auto', '2', '3'] as const;

/** A `columns` as written (a number, a numeral in quotes, "auto", nonsense) to one the card lays out. */
function statColumns(raw: unknown, fallback: StatColumns): StatColumns {
  if (raw === 'auto') return 'auto';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return n === 2 || n === 3 ? n : fallback;
}

export interface StatTileConfig {
  entity: string;
  name?: string;
  icon?: string;
  tone?: Tone;
  /** Fills the tile with its tone — the one figure of the set that matters more than the rest. */
  highlight?: boolean;
}

export interface StatRowConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** The line under the name ("This month"), or a template rendered live. Defaults to the entity's area. */
  secondary?: string;
  tone?: Tone;
  color?: string;
  tap_action?: ActionConfig;
}

export interface StatTilesCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** Head badge: the entity's value, with `badge_label` in front of it ("Health 92 %"). */
  badge_entity?: string;
  badge_label?: string;
  /** Two to six figures, two per row. */
  tiles?: ReadonlyArray<string | StatTileConfig>;
  /** Plain 60 px rows under the tiles, value at the right ("CO₂ avoided · 142 kg"). */
  rows?: ReadonlyArray<string | StatRowConfig>;
  /** `full` (default): 84 px tiles with their glyph, 60 px rows. `compact`: 64 px tiles of label over value, 48 px rows. */
  variant?: StatTilesVariant;
  /** Tiles a row: `2` (the full default), `3`, or `auto` (the compact default: three while every label and value fits). */
  columns?: StatColumns;
}

const MAX_TILES = 6;
const TILE_HEIGHT = 84;
const TILE_COMPACT = 64;
/** A tile's two sides (12 px of padding each), which its words sit between. */
const TILE_SIDES = 24;
/** The big readout above the tiles (`.fv-value-row`: 64 tall, 16 above it). */
const LEAD = 80;

/**
 * The gap that lets equal tiles land on the 4 px grid; 8 when no gap does. Two stats sit 8 apart (2 × 156 + 8 = 320,
 * 2 × 124 + 12 = 260); three share the mode row's rhythm (3 × 104 + 2 × 4 = 320, 3 × 96 + 2 × 12 = 312).
 */
function tileGap(width: number, count: number): number {
  for (let gap = count === 3 ? 4 : 8; gap <= 16; gap += 4)
    if ((width - gap * (count - 1)) % (count * 4) === 0) return gap;
  return 8;
}

/**
 * A set of figures as read-only tiles: the option-tile anatomy (glyph top-left, label, value) without
 * the interaction, two per row, one of them optionally filled with its tone — or, compact, 64 px tiles
 * of label over value, three a row when they fit. An optional big readout sits above them, optional
 * plain rows below.
 */
export class FluvyStatTilesCard extends Card<StatTilesCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: StatTilesCardConfig): number {
    const compact = config.variant === 'compact';
    const count = Math.min(MAX_TILES, listLength(config, ['tiles']));
    // `auto` is measured when drawn; at a 360 column the count decides (three a row, four as two by two)
    const asked = statColumns(config.columns, compact ? 'auto' : 2);
    const perRow = Math.max(1, Math.min(count, asked === 'auto' ? optionColumns(count) : asked));
    const gap = tileGap(320, perRow);
    const tiles = rowsOf(count, perRow) * ((compact ? TILE_COMPACT : TILE_HEIGHT) + gap) - gap;
    const rows = listLength(config, ['rows']);
    return (
      HEAD +
      (config.entity ? LEAD : 0) +
      tiles +
      (rows ? 16 + (compact ? ROW_COMPACT : ROW) * rows : 0)
    );
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
  ];

  private readonly head = new HeadFit(this);
  /** A row's second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);

  static override keys = configKeys<StatTilesCardConfig>()([
    'title',
    'subtitle',
    'variant',
    'columns',
    'badge_entity',
    'badge_label',
    'tiles',
    'rows',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'tiles',
      title: 'editor.tiles',
      keys: ['entity', 'name', 'icon', 'tone', 'highlight'],
      schema: [entityField(), nameIconFields(), fieldRow(toneField(), boolField('highlight'))],
    },
    {
      key: 'rows',
      title: 'editor.rows',
      keys: ['entity', 'name', 'icon', 'secondary', 'tone', 'color', 'tap_action'],
      schema: [
        entityField(),
        nameIconFields(),
        textField('secondary'),
        fieldRow(toneField(), accentField()),
        actionField(),
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES, tiles: ITEM_ALIASES } };
  /** Two a row in full; compact tiles take three when they fit. */
  static override defaults: EditorDefaults = (config) => ({
    variant: 'full',
    columns: config.variant === 'compact' ? 'auto' : '2',
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        iconField(),
        ...colourFields(),
        fieldRow(selectField('variant', VARIANTS), selectField('columns', COLUMNS)),
        entitiesField('tiles', undefined, true),
        fieldRow(entityField(undefined, 'entity', false), textField('name')),
        fieldRow({ name: 'badge_entity', selector: { entity: {} } }, textField('badge_label')),
        entitiesField('rows'),
        actionFields(),
      ],
      ...idsOnly('tiles', 'rows'),
      ...editorLabels(
        strings,
        { tiles: 'tiles', rows: 'rows', badge_entity: 'badge_entity', badge_label: 'badge_label' },
        {},
      ),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): StatTilesCardConfig {
    return {
      type: 'custom:fluvy-stat-tiles-card',
      title: strings(undefined, 'stats'),
      tiles: entities.filter((id) => id.startsWith('sensor.')).slice(0, 4),
    };
  }

  private tiles(): StatTileConfig[] {
    return (this.config?.tiles ?? [])
      .slice(0, MAX_TILES)
      .map((tile) => (typeof tile === 'string' ? { entity: tile } : tile));
  }

  private rows(): StatRowConfig[] {
    return (this.config?.rows ?? []).map((row) =>
      typeof row === 'string' ? { entity: row } : row,
    );
  }

  private compact(): boolean {
    return this.config?.variant === 'compact';
  }

  protected override prepare(config: StatTilesCardConfig): StatTilesCardConfig {
    if (!config.tiles?.length)
      throw new Error('fluvy-stat-tiles-card: add at least one entity to "tiles"');
    return config;
  }

  override getCardSize(): number {
    return Math.ceil((this.config ? FluvyStatTilesCard.layoutHeight(this.config) : HEAD) / 50);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [
      ...this.tiles().map((tile) => tile.entity),
      ...this.rows().map((row) => row.entity),
      this.config?.entity ?? '',
      this.config?.badge_entity ?? '',
    ].filter(Boolean);
  }

  /** Tiles that measure the same thing share one unit, so the set reads as one figure (3.2 kW · 0.25 kW · 1.1 kW). */
  private scales(views: readonly EntityView[]): Map<string, Scale> {
    const peaks = new Map<string, number>();
    for (const view of views) {
      const quantity = baseOf(view);
      if (quantity)
        peaks.set(quantity.unit, Math.max(peaks.get(quantity.unit) ?? 0, Math.abs(quantity.value)));
    }
    return new Map([...peaks].map(([unit, peak]) => [unit, scaleFor(peak, unit)]));
  }

  /** "3.2 kW": a scaled figure for power and energy, Home Assistant's own formatting (precision included) for the rest. */
  private text(view: EntityView, scales?: Map<string, Scale>): string {
    const quantity = view.status === 'ok' ? baseOf(view) : null;
    const scale = quantity
      ? (scales?.get(quantity.unit) ?? scaleFor(quantity.value, quantity.unit))
      : null;
    if (quantity && scale && scale.unit !== view.unit)
      return figureText(this.hass, quantity.value, scale);
    const parts = valueParts(this.hass, view);
    return parts.unit ? `${parts.value} ${parts.unit}` : parts.value;
  }

  protected renderCard(): TemplateResult {
    const tiles = this.tiles();
    const views = tiles.map((tile) => this.entity(tile.entity));
    const lead = this.config?.entity ? this.entity(this.config.entity) : null;
    const tone: Tone = toneOf(this.config, 'accent');
    const gone = (view: EntityView): boolean => !isUsable(view);
    const unusable = views.every(gone) && (!lead || gone(lead));
    const headTone: Tone = unusable ? 'off' : tone;

    const badgeView = this.config?.badge_entity ? this.entity(this.config.badge_entity) : null;
    const badgeText = badgeView
      ? [this.config?.badge_label, this.text(badgeView)].filter(Boolean).join(' ')
      : '';

    const scales = this.scales(views);
    const items = tiles.map((tile, index): OptionItem => {
      const view = views[index] as EntityView;
      return {
        key: tile.entity,
        label: tile.name ?? view.name,
        name: true,
        value: this.text(view, scales),
        glyph: tile.icon ?? glyphFor(view),
        tone: tile.tone ?? tone,
        active: !gone(view) && (tile.highlight ?? false),
        unavailable: gone(view),
      };
    });

    const leadBase = lead && lead.status === 'ok' ? baseOf(lead) : null;
    const leadScale = leadBase ? scaleFor(leadBase.value, leadBase.unit) : null;
    const leadParts =
      leadBase && leadScale && leadScale.unit !== lead?.unit
        ? { value: figure(this.hass, leadBase.value, leadScale), unit: leadScale.unit }
        : lead
          ? valueParts(this.hass, lead)
          : null;

    const width = this.contentWidth;
    const compact = this.compact();
    const columns = this.columns(items, width);
    const gap = tileGap(width, Math.min(columns, items.length));
    // every row's value first: whether the rows keep their circles is decided over all of them; a compact row has
    // no second line to say why there is no figure, so the state's word is its value where it leaves the name its room
    const rows = this.rows().map((row) => {
      const view = this.entity(row.entity);
      const title = row.name ?? view.name;
      const figure = this.text(view);
      const value =
        compact && view.status !== 'ok'
          ? this.head.rowWord(width, title, stateWord(this.hass, view), figure)
          : figure;
      return { row, view, title, value };
    });
    const keepIcon = this.head.rowsKeepIcon(width, rows, compact);
    const title = this.config?.title ?? lead?.name ?? strings(this.hass, 'stats');
    const fitted = this.head.fit({
      width,
      title,
      sub: this.config?.subtitle ?? lead?.areaName ?? '',
      badge: badgeText ? { text: badgeText, tone: headTone } : null,
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? (lead ? glyphFor(lead) : 'grid')) : null,
        tone: headTone,
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        ...(lead
          ? {
              onIconTap: (): void => this.tap(lead.id),
              onHold: (): void => this.hold(lead.id),
              iconLabel: lead.name,
            }
          : {}),
        name: Boolean(this.config?.title),
      })}
      ${lead && leadParts ? html`<div class="so-top fv-value-row">${readout({ label: this.config?.name ?? lead.name, value: leadParts.value, unit: leadParts.unit, size: 'l' })}</div>` : nothing}
      <div class="so-tiles">
        ${options(items, null, gap, compact ? TILE_COMPACT : TILE_HEIGHT, columns, compact)}
      </div>
      ${
        rows.length
          ? html`<div class="so-rows">
              ${rows.map(({ row, view, title, value }) => {
                const usable = isUsable(view);
                // a compact row is the name and the value alone: its second line is not laid out
                return listRow({
                  icon: keepIcon ? (row.icon ?? glyphFor(view)) : null,
                  tone: usable ? toneOf(row, 'neutral') : 'off',
                  accent: this.accents.item(row.color),
                  title,
                  name: true,
                  sub: compact
                    ? ''
                    : this.head.fitRowSub(
                        !usable
                          ? stateText(this.hass, view)
                          : row.secondary === undefined
                            ? view.areaName
                            : this.texts.resolve(row.secondary, row.entity),
                        this.head.rowRoom(width, value, { icon: keepIcon }),
                      ),
                  trailing: 'value',
                  value,
                  compact,
                  unavailable: !usable,
                  onTap: () => this.tap(view.id, row.tap_action),
                });
              })}
            </div>`
          : nothing
      }
    </article>`;
  }

  /**
   * Tiles a row: as asked, or measured — as many as the count suggests (three, four as two by two) while the
   * widest label and the widest value, laid out in the tile's own classes, fit a cell's content; else two; and
   * one a row where not even two cells hold the widest value (half a column): a value never wraps.
   */
  private columns(items: readonly OptionItem[], width: number): number {
    const asked = statColumns(this.config?.columns, this.compact() ? 'auto' : 2);
    if (asked !== 'auto') return asked;
    const labels = items.map((item) => this.head.ruler.width('fv-option__label', item.label));
    const values = items.map((item) => this.head.ruler.width('fv-option__value', item.value ?? ''));
    const gap = (columns: number): number => tileGap(width, columns);
    const columns = optionColumnsFor(
      items.map((_, index) => String(index)),
      width,
      gap,
      (index) => Math.max(labels[Number(index)] ?? 0, values[Number(index)] ?? 0),
    );
    const cell = (width - gap(2)) / 2 - TILE_SIDES;
    return columns === 2 && Math.max(0, ...values) > cell ? 1 : columns;
  }
}
