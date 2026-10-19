import type { LovelaceConfigForm, LovelaceGridOptions } from '@fluvy/core';
import { css, html, type CSSResultGroup, type TemplateResult } from 'lit';

import {
  FluvyTileCard,
  type TileCardConfig,
  type TileItem,
  type TileSize,
} from '../tile/tile-card.js';

import {
  accentField,
  actionFields,
  boolField,
  colourFields,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  tintField,
  toneField,
} from '../shared/form.js';
import type { BaseKey } from '../shared/base.js';
import {
  columnsOf,
  configKeys,
  ITEM_ALIASES,
  type AliasSpec,
  type Columns,
} from '../shared/config.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { EMPTY, entryCount, rowsOf } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { lightDefaults, type LovelaceCardConfig } from '@fluvy/core';

export interface TilesCardConfig extends TileCardConfig, EmptyList {
  /** Entity ids, or tiles with their own name / icon / tone / colour / actions. */
  tiles?: readonly TileItem[];
  /** 1 to 4 per row, or `auto` — as many as fit (148 px compact and large, 84 px mini). Default: 2, 3 mini. */
  columns?: Columns;
}

const SIZES: readonly TileSize[] = ['compact', 'mini', 'large'];
const COLUMNS = ['1', '2', '3', '4', 'auto'] as const;
/** The tiles' column gap (the theme's section grid gap). */
const GAP = 16;
/** The narrowest a grouped tile draws whole: a group too narrow for the columns asked lays out fewer, in more rows. */
const MIN_TILE: Readonly<Record<TileSize, number>> = { large: 100, compact: 128, mini: 84 };

/**
 * A group of tiles — the pairs and threes of lights, plugs and sensors people keep together on a dashboard, as one
 * card. Each tile is drawn by the tile card (compact, mini or large: icon circle and switch, name, state and its
 * ruler or readouts), so a grouped tile and a lone one are the same tile. Compact and mini tiles sit 8 px apart;
 * large ones keep the section's own gaps, as lone large tiles would.
 */
export class FluvyTilesCard extends FluvyTileCard {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: LovelaceCardConfig): number {
    const n = entryCount(config, ['tiles', 'entities']);
    // a mini tile is 108 tall three a row, a compact one (the default) 76 two a row, a large one 168; 8 between
    // rows, or the columns the config asks for (`auto` holds two compact tiles, three minis, in a 360 column); none,
    // the empty panel where they would be
    if (!n) return EMPTY;
    const size =
      config['size'] === 'mini' || config['size'] === 'large' ? config['size'] : 'compact';
    const asked = columnsOf(config['columns'], size === 'mini' ? 3 : 2);
    const room = Math.floor((360 + GAP) / (MIN_TILE[size] + GAP));
    const perRow = Math.max(
      1,
      Math.min(asked === 'auto' ? (size === 'mini' ? 3 : 2) : asked, room),
    );
    return rowsOf(n, perRow) * { mini: 116, compact: 84, large: 176 }[size] - 8;
  }

  static override styles: CSSResultGroup = [
    ...(FluvyTileCard.styles as CSSResultGroup[]),
    css`
      .fv-tiles {
        display: grid;
      }
      .fv-tiles--large {
        row-gap: var(--ha-section-grid-row-gap, 8px);
      }
    `,
  ];

  /** The group has no entity of its own: its tone and colour are its tiles' default. */
  static override base: readonly BaseKey[] = ['entities', 'tone', 'color', 'card_color'];
  static override keys = configKeys<TilesCardConfig>()([
    'size',
    'readouts',
    'tiles',
    'columns',
    'tint',
    'light_colors',
    ...EMPTY_KEYS,
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'tiles',
      alias: 'entities',
      title: 'editor.tiles',
      keys: ['entity', 'name', 'icon', 'tone', 'color', 'readouts', 'tap_action', 'hold_action'],
      schema: [
        entityField(),
        nameIconFields(),
        fieldRow(toneField(), accentField()),
        entitiesField('readouts', ['sensor']),
        actionFields(),
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { tiles: ITEM_ALIASES } };
  // the columns a group takes when it names none: three minis a row, else two
  static override defaults: EditorDefaults = (config) => ({
    size: 'compact',
    columns: config['size'] === 'mini' ? '3' : '2',
    tint: 'on',
    light_colors: lightDefaults().colors,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entitiesField('entities', undefined, true),
        fieldRow(selectField('size', SIZES), selectField('columns', COLUMNS)),
        ...colourFields(),
        tintField(),
        boolField('light_colors'),
        entitiesField('readouts', ['sensor']),
        emptyFields(),
      ],
      ...formLabels({ readouts: 'editor.readouts' }),
    };
  }

  static override getStubConfig(_hass: unknown, entities: readonly string[]): TilesCardConfig {
    const picked = entities.filter((id) => /^(light|switch)\./.test(id)).slice(0, 4);
    return {
      type: 'custom:fluvy-tiles-card',
      entities: picked.length ? picked : entities.slice(0, 4),
      size: 'compact',
    };
  }

  protected override prepare(config: TilesCardConfig): TilesCardConfig {
    listOf(config, 'tiles', ['entities']);
    return config;
  }

  private items(): TileItem[] {
    const config = this.config as TilesCardConfig | undefined;
    return itemsOf(config?.tiles ?? config?.entities);
  }

  protected override size(): TileSize {
    const size = this.config?.size;
    return size && SIZES.includes(size) ? size : 'compact';
  }

  /** The columns asked for, as many as the group's width holds (`auto` fits 148 px compact, 84 px mini). */
  private columns(): Columns {
    const asked = columnsOf(
      (this.config as TilesCardConfig | undefined)?.columns,
      this.size() === 'mini' ? 3 : 2,
    );
    if (asked === 'auto') return 'auto';
    const room = Math.floor((this.width + GAP) / (MIN_TILE[this.size()] + GAP));
    return Math.max(1, Math.min(asked, room)) as Columns;
  }

  /** A tile's share of the row: the group's width less the gaps (auto fits 148 px tiles). */
  protected override tileWidth(): number {
    const columns = this.columns();
    const per = columns === 'auto' ? Math.max(1, Math.floor((this.width + GAP) / 164)) : columns;
    return (this.width - (per - 1) * GAP) / per;
  }

  override getCardSize(): number {
    const columns = this.columns();
    const per: number = columns === 'auto' ? (this.size() === 'mini' ? 3 : 2) : columns;
    const rows = { compact: 1, mini: 2, large: 3 }[this.size()];
    return Math.max(1, Math.ceil(this.items().length / per)) * rows;
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return this.items().flatMap((item) => [item.entity, ...(item.readouts ?? [])]);
  }

  protected override renderCard(): TemplateResult {
    const items = this.items();
    // a group with nothing in it is the panel where its tiles would be, on the page as they are
    const panel = emptyPanel(this, !items.length, 'grid', 'common.no_entities', true);
    if (panel) return panel;
    const size = this.size();
    return html`<div class="fv-tiles fv-tiles--${this.columns()} fv-tiles--${size}" data-card>
      ${items.map((item) => this.renderTile(item, size))}
    </div>`;
  }
}
