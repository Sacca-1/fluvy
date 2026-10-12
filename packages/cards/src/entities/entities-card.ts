import {
  isActive,
  isUsable,
  stateText,
  TOGGLE_DOMAINS,
  toggleEntity,
  valueParts,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { head, listRow } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { Card, type BaseKey } from '../shared/base.js';

import { currentTone, glyphFor, toneFor } from '../shared/domain.js';

import {
  boolField,
  colourFields,
  entitiesField,
  fieldRow,
  formLabels,
  iconField,
  selectField,
  titleFields,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { ROW_KEYS, rowSchema, type RowConfig } from '../lock/rows.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { statusToneOf, toneOf } from '../shared/colour.js';
import { secondaryText } from '../shared/secondary.js';
import { TemplateTexts } from '../shared/templates.js';
import { listLength, ROW_COMPACT, ROW } from '../shared/heights.js';
import { HeadFit } from '../energy/head.js';

/** A row of the card: the rows every list shares (`RowConfig`). */
export type EntityRowConfig = RowConfig;

export interface EntitiesCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  rows?: ReadonlyArray<string | EntityRowConfig>;
  /** Show "3 on" / "All off" in the head. */
  show_count?: boolean;
  /** `rows` (default): 60 px rows with a second line. `compact`: 48 px rows, the name alone. */
  variant?: 'rows' | 'compact';
}

/**
 * A card of 60 px rows: icon circle, title / sub, and ONE trailing element chosen by the entity —
 * a switch for what can be toggled, the value for what is measured, a chevron for the rest.
 * State is said once: the trailing element carries it, the sub line carries context (area or time).
 */
export class FluvyEntitiesCard extends Card<EntitiesCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: EntitiesCardConfig): number {
    const n = listLength(config, ['rows', 'entities']);
    return 92 + (config.variant === 'compact' ? ROW_COMPACT : ROW) * n;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    css`
      .fv-rows {
        margin-top: 8px;
      }
      .fv-rows--bare {
        margin-top: -8px;
        margin-bottom: -8px;
      }
    `,
  ];

  /** A card of rows has no entity of its own: its icon, tone and colour are the head's and the rows' default. */
  static override base: readonly BaseKey[] = ['entities', 'icon', 'tone', 'color', 'card_color'];
  static override keys = configKeys<EntitiesCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'show_count',
    'variant',
  ]);
  static override lists: readonly RowsListSpec[] = [
    { key: 'rows', alias: 'entities', title: 'editor.rows', keys: ROW_KEYS, schema: rowSchema() },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** A row's second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'rows', show_count: false });
  /** Fits the head to its column (measured in the card's own classes, again when a font lands). */
  private readonly head = new HeadFit(this);
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('variant', ['rows', 'compact'])),
        ...colourFields(),
        entitiesField('entities', undefined, true),
        boolField('show_count'),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): EntitiesCardConfig {
    return { type: 'custom:fluvy-entities-card', title: 'Devices', entities: entities.slice(0, 4) };
  }

  private rows(): EntityRowConfig[] {
    const source = this.config?.rows ?? this.config?.entities ?? [];
    return source.map((row) => (typeof row === 'string' ? { entity: row } : row));
  }

  protected override prepare(config: EntitiesCardConfig): EntitiesCardConfig {
    if (!config.rows?.length && !config.entities?.length)
      throw new Error('fluvy-entities-card: add at least one entity');
    return config;
  }

  protected override watched(): readonly string[] {
    return this.rows().map((r) => r.entity);
  }

  override getCardSize(): number {
    return 1 + this.rows().length;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected renderCard(): TemplateResult {
    const rows = this.rows();
    const views = rows.map((row) => this.entity(row.entity));
    const active = views.filter((v) => isActive(v)).length;
    const tone = toneOf(this.config, 'accent');
    const compact = this.config?.variant === 'compact';
    const title = this.config?.title;
    // the count gives way to the title, then the circle does, as every head's do (`HeadFit`)
    const fitted = title
      ? this.head.fit({
          width: this.contentWidth,
          title,
          sub: this.config?.subtitle ?? '',
          badge: this.config?.show_count
            ? {
                text:
                  active > 0
                    ? `${active} ${this.t('common.on').toLowerCase()}`
                    : this.t('common.off'),
                tone: active > 0 ? tone : 'neutral',
              }
            : null,
        })
      : null;
    const header =
      title && fitted
        ? head({
            icon: fitted.icon ? (this.config?.icon ?? 'grid') : null,
            tone,
            title,
            sub: fitted.sub,
            trailing: fitted.badge,
          })
        : nothing;

    return html`<article class="fv-card" data-card>
      ${header}
      <div class="fv-rows ${this.config?.title ? '' : 'fv-rows--bare'}">
        ${rows.map((row, i) => {
          const view = views[i] as EntityView;
          const usable = isUsable(view);
          // a row switch is for what is safe to flip by accident: never a lock, and not the things that are not on/off
          const canToggle =
            usable &&
            TOGGLE_DOMAINS.has(view.domain) &&
            ![
              'scene',
              'script',
              'button',
              'input_button',
              'lock',
              'vacuum',
              'media_player',
            ].includes(view.domain);
          const measured = view.domain === 'sensor' || view.number !== null;
          const trailing = canToggle
            ? 'switch'
            : usable &&
                (measured ||
                  view.domain === 'binary_sensor' ||
                  view.domain === 'person' ||
                  view.domain === 'sun' ||
                  view.domain === 'weather' ||
                  view.domain === 'input_select' ||
                  view.domain === 'select' ||
                  view.domain === 'lock' ||
                  view.domain === 'vacuum' ||
                  view.domain === 'media_player')
              ? 'value'
              : 'chevron';
          const state = this.stateOf(view);
          const on =
            state === view.state ? isActive(view) : !['off', 'closed', 'locked'].includes(state);
          const parts = valueParts(this.hass, view);
          const warn = view.domain === 'binary_sensor' && on && toneFor(view) === 'warning';
          const rowTone = statusToneOf(row, toneFor(view));
          return listRow({
            icon: row.icon ?? glyphFor(view),
            tone: currentTone(view, on ? rowTone : 'neutral'),
            title: row.name ?? view.name,
            name: true,
            sub: secondaryText(this.hass, view, row.secondary, trailing === 'value', this.texts),
            trailing,
            on,
            compact,
            accent: this.accents.item(row.color),
            switchTone: rowTone === 'warning' ? 'accent' : rowTone,
            value:
              trailing === 'value'
                ? view.number !== null
                  ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}`
                  : stateText(this.hass, view)
                : '',
            valueTone: warn ? 'warning' : '',
            unavailable: !usable,
            onTap: () => this.tap(view.id, row.tap_action),
            onToggle: (next) => {
              if (!this.hass) return;
              this.expect(
                view.id,
                next
                  ? view.domain === 'cover' || view.domain === 'valve'
                    ? 'open'
                    : view.domain === 'lock'
                      ? 'unlocked'
                      : 'on'
                  : view.domain === 'cover' || view.domain === 'valve'
                    ? 'closed'
                    : view.domain === 'lock'
                      ? 'locked'
                      : 'off',
              );
              void toggleEntity(this.hass, view.id);
            },
          });
        })}
      </div>
    </article>`;
  }
}
