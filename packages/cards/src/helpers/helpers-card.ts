import { strings, type HomeAssistant } from '@fluvy/core';
import type {
  EntityView,
  FluvyCardConfig,
  LovelaceConfigForm,
  LovelaceGridOptions,
} from '@fluvy/core';
import { head, sheetStyles } from '@fluvy/ui';

import { css, html, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit';

import { Card, type BaseKey } from '../shared/base.js';

import {
  actionFields,
  colourFields,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  selectField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';

import { nameOf, type HelperHost, type HelperRowConfig } from './context.js';
import { compactNumber, isBoxedNumber, numberBlocks } from './number.js';

import {
  buttonRow,
  momentRow,
  momentValue,
  plainRow,
  plainValue,
  rowsKeepIcon,
  switchRow,
  type RowEnd,
} from './rows.js';

import { MAX_CHIPS, selectPiece, selectValue } from './select.js';

import { rowStyles } from './styles.js';

import { textBlocks } from './text.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec, type RowStyle } from '../shared/config.js';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import { toneOf } from '../shared/colour.js';
import { attrOf, chipRows, EMPTY, HEAD, known, listAttr, ROW } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, idsOf, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { TemplateTexts } from '../shared/templates.js';

const s = strings('helpers');

export type { HelperRowConfig } from './context.js';

export interface HelpersCardConfig extends FluvyCardConfig, EmptyList {
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
  static override layoutHeight(config: HelpersCardConfig, hass?: HomeAssistant): number {
    const rows = idsOf(config.rows ?? config.entities);
    if (!rows.length) return HEAD + EMPTY;
    // one number or counter and no title: the compact figure (see `compactNumber`)
    if (
      rows.length === 1 &&
      !config.title &&
      /^(counter|number|input_number)\./.test(rows[0] ?? '')
    )
      return 76;
    // a helper by its kind, 16 under what is above it: a number's field and its ruler (44 + 4 + 44; the field alone
    // for a counter without a range, a boxed number), a select's label and its chips (20 + 8 + rows of 44; a list
    // past six options is a row), a text's label and field (20 + 12 + 44; a 36 label with a second line), a switch,
    // a button, a moment or a state as rows of 60 in one group (16 above the group, not each row), a time's quick
    // presets 56 under its row. The house says a number's range and a select's options; without it, a ruler and one
    // row of three chips.
    const items = (config.rows ?? config.entities ?? []) as readonly (string | HelperRowConfig)[];
    const itemOf = (id: string): HelperRowConfig | undefined =>
      items.find((item): item is HelperRowConfig => typeof item !== 'string' && item.entity === id);
    let height = 64 + 20;
    let group = 0; // rows in the open group of list rows
    for (const id of rows) {
      const domain = id.slice(0, id.indexOf('.'));
      const attr = (key: string): unknown => attrOf(hass, id, key);
      let block = 0;
      if (NUMBERS.has(domain)) {
        const counter = domain === 'counter';
        const min = attr(counter ? 'minimum' : 'min');
        const max = attr(counter ? 'maximum' : 'max');
        const ranged = counter
          ? typeof min === 'number' && typeof max === 'number'
          : attr('mode') !== 'box' && !(known(hass, id) && (min === null || max === null));
        block = ranged ? 92 : 44;
      } else if (SELECTS.has(domain)) {
        const options = listAttr(hass, id, 'options');
        if (options.length <= MAX_CHIPS) {
          const style = config.options_style === 'chips' ? 'chips' : 'full';
          block = 28 + chipRows(options.length ? options : ['a', 'b', 'c'], style) * 44;
        }
      } else if (TEXTS.has(domain)) {
        block = (itemOf(id)?.secondary ? 36 : 20) + 12 + 44;
      }
      if (block) {
        height += 16 + block;
        group = 0;
        continue;
      }
      if (!group) height += 16;
      group += 1;
      height += ROW;
      // a time with quick presets: the chips under its row
      if (MOMENTS.has(domain) && !attr('has_date') && itemOf(id)?.presets?.length) height += 56;
    }
    return height;
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

  /** The head's fitting; its ruler lays widths out in the card's own classes (a select's filled chips, the rows' ends). */
  private readonly head = new HeadFit(this);
  private readonly ruler = this.head.ruler;
  /** A row's own second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);

  constructor() {
    super();
    this.preview_ = {};
  }

  /**
   * Whether the list rows keep their circles beside what ends them, which is never cut: a switch, a button's "Run",
   * a value's button ("06:45", a long select's option), a state's words. The blocks (a number, a text, chips) have
   * no circle to give.
   */
  private rowsKeepIcon(host: HelperHost): boolean {
    const ends = this.rows().flatMap((row): RowEnd[] => {
      const view = this.entity(row.entity);
      const name = nameOf(view, row);
      const domain = view.domain;
      if (NUMBERS.has(domain) || TEXTS.has(domain)) return [];
      if (SWITCHES.has(domain)) return [{ name, end: SWITCH_SLOT }];
      if (BUTTONS.has(domain)) return [{ name, button: s(this.hass, 'run') }];
      if (MOMENTS.has(domain)) return [{ name, button: momentValue(host, view, row) }];
      if (!SELECTS.has(domain))
        return [{ name, end: this.ruler.width('fv-row__value', plainValue(host, view)) }];
      const value = selectValue(host, view);
      return value === undefined ? [] : [{ name, button: value }];
    });
    return rowsKeepIcon(this.ruler, this.contentWidth, ends);
  }

  /** The card as its controls see it for this render (its own helpers are protected). */
  private hostView(): HelperHost {
    const host: HelperHost = {
      hass: this.hass,
      contentWidth: this.contentWidth,
      ruler: this.ruler,
      texts: this.texts,
      bare: false,
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
    return { ...host, bare: !this.rowsKeepIcon(host) };
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
    'show_icon',
  ];
  static override keys = configKeys<HelpersCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'options_style',
    ...EMPTY_KEYS,
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
        showIconField(),
        ...colourFields(),
        entitiesField('entities', undefined, true),
        emptyFields(),
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
    listOf(config, 'rows', ['entities']);
    return config;
  }

  private rows(): HelperRowConfig[] {
    return itemsOf(this.config?.rows ?? this.config?.entities);
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

    const panel = emptyPanel(this, !rows.length, 'sliders', 'common.no_helpers');
    const areas = new Set(views.map((view) => view.areaName).filter(Boolean));
    // none counted is said by the panel, not as "0 helpers"
    const count = panel
      ? ''
      : views.length === 1
        ? s(this.hass, 'one')
        : s(this.hass, 'count', { count: views.length });
    const title = this.config?.title ?? s(this.hass, 'title');
    // the line's trailing segments go whole before the circle gives way, and the circle before a word is cut
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub:
        this.config?.subtitle ??
        [areas.size === 1 ? [...areas][0] : '', count].filter(Boolean).join(' · '),
    });
    return html`<article class="fv-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'sliders') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        cut: fitted.cut,
        // the head is the card's button where its tap has somewhere to go: a card of many has no details of its own
        ...this.headActions(),
      })}
      ${panel ? html`<div class="in-rows">${panel}</div>` : blocks}
    </article>`;
  }
}
