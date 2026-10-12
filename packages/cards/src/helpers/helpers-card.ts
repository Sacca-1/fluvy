import { strings } from '@fluvy/core';
import type {
  EntityView,
  FluvyCardConfig,
  LovelaceConfigForm,
  LovelaceGridOptions,
} from '@fluvy/core';
import { head, round, sheetStyles } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { Card, type BaseKey } from '../shared/base.js';

import {
  actionFields,
  colourFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  selectField,
  textField,
  titleFields,
} from '../shared/form.js';

import { nameOf, type HelperHost, type HelperRowConfig } from './context.js';
import { compactNumber, isBoxedNumber, numberBlocks } from './number.js';

import { actionsKeepIcon, buttonRow, momentRow, plainRow, switchRow } from './rows.js';

import { selectPiece } from './select.js';

import { rowStyles } from './styles.js';

import { textBlocks } from './text.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec, type RowStyle } from '../shared/config.js';
import { TextRuler } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';
import { toneOf } from '../shared/colour.js';
import { HEAD, ROW } from '../shared/heights.js';
import { TemplateTexts } from '../shared/templates.js';

const s = strings('helpers');

export type { HelperRowConfig } from './context.js';

export interface HelpersCardConfig extends FluvyCardConfig {
  title?: string;
  subtitle?: string;
  /** The same helpers as `entities`, with a name, an icon, a context line or quick-set times per row (YAML). */
  rows?: ReadonlyArray<string | HelperRowConfig>;
  /** A select's options: chips that fill the row (`full`, the default) or content-sized ones (`chips`). */
  options_style?: RowStyle;
}

const NUMBERS = new Set(['input_number', 'number', 'counter']);
const SELECTS = new Set(['input_select', 'select']);
const TEXTS = new Set(['input_text', 'text']);
const SWITCHES = new Set(['input_boolean', 'switch']);
const MOMENTS = new Set(['input_datetime', 'date', 'time', 'datetime']);
const BUTTONS = new Set(['input_button', 'button']);

/**
 * Every Home Assistant helper on one card, each in the idiom the design sheet gives its kind: a number
 * is a big tabular value with its stepper and the ruler under it, a select is a row of chips, a text
 * helper is the 44 field, and what is one tap (switch, date or time, button) is a list row.
 * One control per module: `number.ts`, `select.ts`, `text.ts`, `rows.ts`.
 */
export class FluvyHelpersCard extends Card<HelpersCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: HelpersCardConfig): number {
    const rows = (config.rows ?? config.entities ?? []).map((row) =>
      typeof row === 'string' ? row : row.entity,
    );
    // one number or counter and no title: the compact figure (see `compactNumber`)
    if (
      rows.length === 1 &&
      !config.title &&
      /^(counter|number|input_number)\./.test(rows[0] ?? '')
    )
      return 76;
    // a row by its kind: a field with its ruler (96), a select with its chips (108), a text field (96), a moment (76), a switch or button (60)
    const height = (id: string): number =>
      /^(input_number|number|counter)\./.test(id)
        ? 96
        : /^(input_select|select)\./.test(id)
          ? 108
          : /^(input_text|text)\./.test(id)
            ? 96
            : /^(input_datetime|datetime|date|time)\./.test(id)
              ? 76
              : ROW;
    return HEAD + rows.reduce((total, id) => total + height(id), 0);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.inputs,
    rowStyles,
    css`
      /* the sheet places the ruler with .in-card > .fv-ruler (a fixed 360 card); here it is a custom element */
      fluvy-ruler {
        margin-top: 4px;
      }

      /* a name that does not fit beside its value sends the value and stepper to a line of their own */
      .in-field,
      .in-compact {
        flex-wrap: wrap;
        gap: 8px 12px;
        height: auto;
        min-height: 44px;
      }

      .in-field--top {
        min-height: 0;
      }

      .in-compact {
        min-height: 76px;
      }

      .in-field__text,
      .in-compact .fv-row__text {
        flex: 1 1 auto;
        max-width: 100%;
      }

      .in-field__control {
        flex: 0 0 auto;
        margin-left: auto;
      }

      .in-quick--flush {
        padding-left: 0;
      }

      /* rows that gave their circles to their names: the hairline after the chips starts the row too */
      .in-quick + .fv-row--bare::before {
        left: 0;
      }

      /* the sheet's compact value is a 36 box around one digit; a unit or three digits may widen it */
      .in-compact__value {
        width: auto;
        min-width: 36px;
      }

      .in-compact__value .fv-unit {
        line-height: 1;
      }
    `,
  ];

  static override properties = { ...Card.properties, preview_: { state: true } };

  /** Value under the finger while a ruler drag is in flight, per entity. */
  declare preview_: Readonly<Record<string, number>>;

  /** Widths laid out by the browser in the card's own classes: a select's filled chips measure their columns with it. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);
  /** A row's own second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);

  constructor() {
    super();
    this.preview_ = {};
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  /** Whether the list rows keep their circles beside the buttons' "Run", which is never cut. */
  private rowsKeepIcon(): boolean {
    const actions = this.rows().flatMap((row) => {
      const view = this.entity(row.entity);
      return BUTTONS.has(view.domain)
        ? [{ name: nameOf(view, row), action: s(this.hass, 'run') }]
        : [];
    });
    return actionsKeepIcon(this.ruler, this.contentWidth, actions);
  }

  /** The card as its controls see it for this render (its own helpers are protected). */
  private hostView(): HelperHost {
    return {
      hass: this.hass,
      contentWidth: this.contentWidth,
      ruler: this.ruler,
      texts: this.texts,
      bare: !this.rowsKeepIcon(),
      state: (view) => this.stateOf(view),
      expect: (id, state) => this.expect(id, state),
      call: (domain, service, data, id) => this.call(domain, service, data, id),
      moreInfo: (id) => this.tap(id, { action: 'more-info' }),
      preview: (id) => this.preview_[id],
      setPreview: (id, value) => {
        const next = { ...this.preview_ };
        if (value === null) delete next[id];
        else next[id] = value;
        this.preview_ = next;
      },
      editing: (id) =>
        (this.renderRoot as ShadowRoot).activeElement?.getAttribute('data-field') === id,
      refresh: () => this.requestUpdate(),
    };
  }

  /** A card of many helpers has no entity of its own: its head's icon, tone and colour, its tap ("…") and its hold. */
  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<HelpersCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'options_style',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'rows',
      alias: 'entities',
      title: 'editor.rows',
      keys: ['entity', 'name', 'icon', 'secondary', 'presets'],
      schema: [
        entityField(),
        nameIconFields(),
        textField('secondary'),
        {
          name: 'presets',
          selector: { select: { multiple: true, custom_value: true, options: [] } },
        },
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ options_style: 'full' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('options_style', ['full', 'chips'])),
        ...colourFields(),
        entitiesField('entities', undefined, true),
        actionFields(),
      ],
      ...formLabels({ options_style: 'editor.options_style' }),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): HelpersCardConfig {
    const helpers = entities.filter((id) =>
      /^(input_number|input_select|input_text|input_boolean|input_datetime|input_button|counter)\./.test(
        id,
      ),
    );
    return {
      type: 'custom:fluvy-helpers-card',
      entities: (helpers.length ? helpers : entities).slice(0, 4),
    };
  }

  protected override prepare(config: HelpersCardConfig): HelpersCardConfig {
    if (!config.rows?.length && !config.entities?.length)
      throw new Error('fluvy-helpers-card: add at least one entity');
    return config;
  }

  private rows(): HelperRowConfig[] {
    const source = this.config?.rows ?? this.config?.entities ?? [];
    return source.map((row) => (typeof row === 'string' ? { entity: row } : row));
  }

  protected override watched(): readonly string[] {
    return this.rows().map((row) => row.entity);
  }

  /**
   * A field whose name and value do not share the line drops the value a size (24 → 20 → 16) before
   * wrapping: "-1.5 °C" beside "Thermostat offset" fits at 20. Measured after each render, classes set
   * outside Lit's bindings like `fitPills`.
   */
  private fitFields(): void {
    for (const field of this.renderRoot.querySelectorAll<HTMLElement>('.in-field')) {
      const text = field.querySelector<HTMLElement>('.in-field__text');
      const control = field.querySelector<HTMLElement>('.in-field__control');
      const value = field.querySelector<HTMLElement>('.in-field__value');
      if (!text || !control || !value) continue;
      value.classList.remove('is-s', 'is-xs');
      const wrapped = (): boolean =>
        control.getBoundingClientRect().top > text.getBoundingClientRect().top + 1;
      if (!wrapped()) continue;
      value.classList.add('is-s');
      if (wrapped()) value.classList.replace('is-s', 'is-xs');
    }
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.fitFields();
  }

  override getCardSize(): number {
    return 1 + this.rows().length;
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected renderCard(): TemplateResult {
    const host = this.hostView();
    const rows = this.rows();
    const views = rows.map((row) => this.entity(row.entity));

    // one counter (or one boxed number) and no title: the sheet's compact card, not a titled list of one
    const [only] = rows;
    const [first] = views;
    if (
      only &&
      first &&
      rows.length === 1 &&
      !this.config?.title &&
      NUMBERS.has(first.domain) &&
      isBoxedNumber(host, first)
    ) {
      return compactNumber(host, first, only);
    }

    // blocks stand on their own; consecutive rows share one list, so the hairlines run between them
    const blocks: TemplateResult[] = [];
    let list: TemplateResult[] = [];
    const flush = (): void => {
      if (list.length) blocks.push(html`<div class="in-rows">${list}</div>`);
      list = [];
    };
    rows.forEach((row, index) => {
      const view = views[index] as EntityView;
      const domain = view.domain;
      const select = SELECTS.has(domain)
        ? selectPiece(host, view, row, this.config?.options_style)
        : undefined;
      if (NUMBERS.has(domain)) {
        flush();
        blocks.push(...numberBlocks(host, view, row));
      } else if (TEXTS.has(domain)) {
        flush();
        blocks.push(...textBlocks(host, view, row));
      } else if (select && 'blocks' in select) {
        flush();
        blocks.push(...select.blocks);
      } else if (select) list.push(select.row);
      else if (SWITCHES.has(domain)) list.push(switchRow(host, view, row));
      else if (MOMENTS.has(domain)) list.push(momentRow(host, view, row));
      else if (BUTTONS.has(domain)) list.push(buttonRow(host, view, row));
      else list.push(plainRow(host, view, row));
    });
    flush();

    const areas = new Set(views.map((view) => view.areaName).filter(Boolean));
    const count =
      views.length === 1 ? s(this.hass, 'one') : s(this.hass, 'count', { count: views.length });
    const action = this.config?.tap_action;

    return html`<article class="fv-card" data-card>
      ${head({
        icon: this.config?.icon ?? 'sliders',
        tone: toneOf(this.config, 'accent'),
        title: this.config?.title ?? s(this.hass, 'title'),
        sub:
          this.config?.subtitle ??
          [areas.size === 1 ? [...areas][0] : '', count].filter(Boolean).join(' · '),
        // "…" appears when it has somewhere to go: a card of many entities has no more-info of its own
        trailing:
          action && action.action !== 'none'
            ? round('dots', 'quiet', this.t('common.more'), () => this.tap(undefined, action))
            : nothing,
        onHold: () => this.hold(),
      })}
      ${blocks}
    </article>`;
  }
}
