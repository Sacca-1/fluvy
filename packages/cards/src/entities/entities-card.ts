import {
  isActive,
  isUsable,
  lightDefaults,
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
  emptyFields,
  entitiesField,
  fieldRow,
  formLabels,
  iconField,
  selectField,
  showIconField,
  titleFields,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { ROW_KEYS, rowSchema, type RowConfig } from '../lock/rows.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { statusToneOf, toneOf, type LightColours } from '../shared/colour.js';
import { glowOf } from '../shared/light.js';
import { secondaryText } from '../shared/secondary.js';
import { isTemplate, TemplateTexts } from '../shared/templates.js';
import { EMPTY, entryCount, HEAD, ROW_COMPACT, ROW } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';

/** A row of the card: the rows every list shares (`RowConfig`). */
export type EntityRowConfig = RowConfig;

export interface EntitiesCardConfig extends FluvyCardConfig, EmptyList, LightColours {
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
    const n = entryCount(config, ['rows', 'entities']);
    // nothing to list: the panel under the head, or alone in the card (20 + 120 + 20)
    if (!n) return (config.title ? HEAD : 40) + EMPTY;
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
      /* a state in words is never cut: it wraps at its words, never narrower than its longest one ("Niet /
         gedetecteerd"), and the name gives way first */
      .fv-row__value.fv-row__value--text {
        overflow-wrap: normal;
        min-width: min-content;
      }
      .fv-row:has(.fv-row__value--text) .fv-row__text {
        min-width: 0;
      }
      /* a row that gave its circle away lets a state of a few words take a second line between them ("No /
         detectado") before the time under the name is cut */
      .fv-row--bare > .fv-row__value--words {
        flex-shrink: 1;
        white-space: normal;
        text-align: end;
      }
      /* …and where not even then, the state goes under the words, at their start, and the row grows */
      .fv-row--stack {
        flex-wrap: wrap;
        row-gap: 4px;
        height: auto;
        min-height: 60px;
        padding: 8px 0;
      }
      .fv-row--stack > .fv-row__text {
        flex-basis: 100%;
      }
      .fv-row--stack > .fv-row__value.fv-row__value {
        max-width: 100%;
        text-align: start;
      }
    `,
  ];

  /** A card of rows has no entity of its own: its icon, tone and colour are the head's and the rows' default. */
  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'show_icon',
  ];
  static override keys = configKeys<EntitiesCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'show_count',
    'variant',
    'light_colors',
    ...EMPTY_KEYS,
  ]);
  static override lists: readonly RowsListSpec[] = [
    { key: 'rows', alias: 'entities', title: 'editor.rows', keys: ROW_KEYS, schema: rowSchema() },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** A row's second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'rows',
    show_count: false,
    light_colors: lightDefaults().colors,
  });
  /** Fits the head to its column (measured in the card's own classes, again when a font lands). */
  private readonly head = new HeadFit(this);
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('variant', ['rows', 'compact'])),
        showIconField(),
        ...colourFields(),
        entitiesField('entities', undefined, true),
        fieldRow(boolField('show_count'), boolField('light_colors')),
        emptyFields(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): EntitiesCardConfig {
    return { type: 'custom:fluvy-entities-card', title: 'Devices', entities: entities.slice(0, 4) };
  }

  private rows(): EntityRowConfig[] {
    return itemsOf(this.config?.rows ?? this.config?.entities);
  }

  protected override prepare(config: EntitiesCardConfig): EntitiesCardConfig {
    listOf(config, 'rows', ['entities']);
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
    // a lit light's row wears its bulb's colour (`light_colors`, the house's where the card says none) unless the row,
    // or the card, has a colour or a tone of its own
    const glows =
      !this.config?.color &&
      !this.config?.tone &&
      (this.config?.light_colors ?? lightDefaults().colors);
    const panel = emptyPanel(this, !rows.length, 'grid', 'common.no_entities');
    // the count gives way to the title, then the circle does, as every head's do (`HeadFit`); an empty list's panel
    // says what a count of nothing would
    const fitted = title
      ? this.head.fit({
          width: this.contentWidth,
          title,
          sub: this.config?.subtitle ?? '',
          badge:
            this.config?.show_count && !panel
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

    // what ends each row (its switch, its value's words, its chevron) is decided before the rows are drawn: a column
    // too narrow for a name beside its end gives every row's circle to the names, as every list does
    const laid = rows.map((_row, i) => {
      const view = views[i] as EntityView;
      const usable = isUsable(view);
      // a row switch is for what is safe to flip by accident: never a lock, and not the things that are not on/off
      const canToggle =
        usable &&
        TOGGLE_DOMAINS.has(view.domain) &&
        !['scene', 'script', 'button', 'input_button', 'lock', 'vacuum', 'media_player'].includes(
          view.domain,
        );
      const measured = view.domain === 'sensor' || view.number !== null;
      const trailing: 'switch' | 'value' | 'chevron' = canToggle
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
      const parts = valueParts(this.hass, view);
      const value =
        trailing === 'value'
          ? view.number !== null
            ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}`
            : stateText(this.hass, view)
          : '';
      const end = trailing === 'switch' ? SWITCH_SLOT : trailing === 'chevron' ? 44 : undefined;
      const sub = (short = false): string =>
        secondaryText(this.hass, view, rows[i]?.secondary, trailing === 'value', this.texts, short);
      return { view, usable, trailing, value, end, sub };
    });
    const keep = this.head.rowsKeepIcon(
      this.contentWidth,
      laid.map(({ view, value, end, sub }, i) => ({
        title: rows[i]?.name ?? view.name,
        value,
        // the least the line says (a time's short form), so a passing minute never moves the circles
        sub: compact ? '' : sub(true),
        ...(end === undefined ? {} : { end }),
      })),
      compact,
    );
    // a line too long for its row even so takes its short form ("32 d geleden", "Not found"); where not even that
    // holds beside a state in words at its narrowest (its longest word), the state goes under the words
    const line = ({ value, end, sub }: (typeof laid)[number]): { sub: string; stack: boolean } => {
      const full = sub();
      const short = sub(true);
      const room = this.head.rowRoom(
        this.contentWidth,
        value,
        end === undefined ? { icon: keep } : { icon: keep, end },
      );
      const width = (text: string): number => this.head.ruler.width('fv-row__sub', text);
      if (width(full) <= room) return { sub: full, stack: false };
      const least = Math.max(
        0,
        ...value.split(' ').map((word) => this.head.ruler.width('fv-row__value', word)),
      );
      const stack = !keep && end === undefined && this.contentWidth - 12 - least < width(short);
      return { sub: stack && width(full) <= this.contentWidth ? full : short, stack };
    };

    return html`<article class="fv-card" data-card>
      ${header}
      <div class="fv-rows ${this.config?.title ? '' : 'fv-rows--bare'}">
        ${panel}
        ${rows.map((row, i) => {
          const { view, usable, trailing, value } = laid[i]!;
          const state = this.stateOf(view);
          const on =
            state === view.state ? isActive(view) : !['off', 'closed', 'locked'].includes(state);
          const warn = view.domain === 'binary_sensor' && on && toneFor(view) === 'warning';
          const rowTone = statusToneOf(row, toneFor(view));
          const said = compact ? { sub: '', stack: false } : line(laid[i]!);
          return listRow({
            icon: keep ? (row.icon ?? glyphFor(view)) : null,
            tone: currentTone(view, on ? rowTone : 'neutral'),
            title: row.name ?? view.name,
            name: true,
            sub: said.sub,
            stack: said.stack,
            // a template's line is the owner's words: a name, that may end in its ellipsis
            subName: isTemplate(row.secondary ?? ''),
            trailing,
            on,
            compact,
            accent: this.accents.item(
              row.color ||
                (glows && view.domain === 'light' && !row.tone ? glowOf(view, on) : undefined),
            ),
            switchTone: rowTone === 'warning' ? 'accent' : rowTone,
            value,
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
