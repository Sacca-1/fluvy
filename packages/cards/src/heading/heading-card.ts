import {
  type ActionConfig,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { glyph, icon, sheetStyles } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { HeadFit } from '../energy/head.js';
import { Card, type BaseKey } from '../shared/base.js';
import {
  actionField,
  entitiesField,
  fieldRow,
  formLabels,
  iconField,
  selectField,
  textField,
} from '../shared/form.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import { counted } from '../shared/counted.js';
import { idsOf, type EntityEntry } from '../shared/lists.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

export interface HeadingCardConfig extends FluvyCardConfig {
  title?: string;
  /** Static text at the right ("Edit"). Wins over `entities`. */
  subtitle?: string;
  /** Counted instead: "2 of 4 on" while something is on, "4 devices" when nothing is. */
  entities?: readonly EntityEntry[];
  /** Dashboard path the meta navigates to; it brings the chevron. `tap_action` does the same for any other action. */
  path?: string;
  /** `bar` (default): the title with its meta at the right. `plain`: the title alone. */
  variant?: 'bar' | 'plain';
  /** `subtitle` (default): the 20/600 title of a group. `title`: a page's section title, 27/600 (Home Assistant's own heading styles). */
  heading_style?: 'title' | 'subtitle';
}

/** The section title's link, measured in its own face (16/500). */
const LINK = 'hm-section hm-section--title > hm-section__text';

/**
 * A section heading on the page: the 20/600 title and a quiet meta at the right. Not a card
 * surface. With somewhere to go the meta becomes a button and gains the chevron, whose ink sits on
 * the column edge (the sheet's −5 optical margin: the chevron's ink ends 5 px inside its 16 box).
 *
 * `heading_style: title` is a page's section title (#47's bands): 27/600, 16 from a 32 glyph, on a 32 row; its link
 * 16/500 with a 24 chevron. Where the row is short what gives way has an order: the link's words, the title's size
 * (27 → the subtitle's 20), its glyph, the chevron; a title that would not hold even alone keeps them and ends in its
 * ellipsis, as a name may.
 *
 * Below other cards of its section the heading opens a new group: it sits 24 under them (the grid's
 * 16 + 8) and 16 above its own cards, as the sheet's section titles do. As the first card of a section
 * it keeps the column's top line, so the columns still start level.
 */
export class FluvyHeadingCard extends Card<HeadingCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns: the section title's row is 32. */
  static override layoutHeight(config?: HeadingCardConfig): number {
    return config?.heading_style === 'title' ? 32 : 24;
  }

  private readonly head = new HeadFit(this);

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.home,
    css`
      .hm-section {
        margin-top: 0;
        gap: 16px;
        animation: fv-enter 420ms var(--fv-ease-out) both;
        animation-delay: var(--fv-enter-delay, 0ms);
      }
      :host([follows]) .hm-section {
        margin-top: 8px;
      }
      .hm-section__title {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* the meta keeps its words; a title gives way first, and a meta longer than 60 % of the row gives its words up */
      .hm-section__meta {
        position: relative;
        flex: 0 0 auto;
        max-width: 60%;
        height: 24px;
        line-height: 24px;
        white-space: nowrap;
      }
      .hm-section__text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hm-section__meta svg {
        transition: transform var(--fv-base) var(--fv-ease);
      }
      button.hm-section__meta {
        transition:
          color var(--fv-base) var(--fv-ease),
          opacity var(--fv-fast) var(--fv-ease);
      }
      /* the row is 24 tall; the finger gets 44 × (text + 24) around it, a chevron alone 44 wide */
      button.hm-section__meta::before {
        content: '';
        position: absolute;
        inset: -10px -12px;
        left: auto;
        width: max(44px, 100% + 24px);
      }
      button.hm-section__meta:active {
        opacity: 0.6;
      }
      button.hm-section__meta:focus-visible {
        outline-offset: 4px;
        border-radius: 4px;
      }
      @media (hover: hover) {
        button.hm-section__meta:hover {
          color: var(--fluvy-text);
        }
        button.hm-section__meta:hover svg {
          transform: translateX(2px);
        }
      }
      /* the section title: a 32 row, its link 16 with a 24 chevron (the chevron's ink 8 inside its box) */
      .hm-section--title,
      .hm-section--title .hm-section__meta {
        max-width: none;
        height: 32px;
        line-height: 32px;
      }
      .hm-section--title .hm-section__text {
        font-size: 16px;
        font-weight: 500;
      }
      .hm-section--title .hm-section__meta svg {
        width: 24px;
        height: 24px;
        margin-right: -8px;
      }
      /* at its size: 27/600, 16 from its 32 glyph (where it steps down, the subtitle's 20 and its 24 box) */
      .hm-section--big .hm-section__lead {
        gap: 16px;
      }
      .hm-section--big .hm-section__title {
        font-size: 27px;
        line-height: 32px;
      }
      .hm-section--big .hm-section__icon,
      .hm-section--big .hm-section__icon > * {
        --mdc-icon-size: 32px;
        flex-basis: 32px;
        width: 32px;
        height: 32px;
      }
    `,
  ];

  /** A heading has no entity: its icon, the entities it counts and the tap its meta answers are the base fields it honours. */
  static override base: readonly BaseKey[] = ['icon', 'entities', 'tap_action'];
  static override keys = configKeys<HeadingCardConfig>()([
    'title',
    'subtitle',
    'path',
    'variant',
    'heading_style',
  ]);
  static override aliases: AliasSpec = { keys: [{ from: 'meta', to: 'subtitle' }] };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ variant: 'bar', heading_style: 'subtitle' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        fieldRow(textField('title'), iconField()),
        fieldRow(
          selectField('heading_style', ['title', 'subtitle']),
          selectField('variant', ['bar', 'plain']),
        ),
        fieldRow(textField('subtitle'), textField('path')),
        entitiesField('entities'),
        actionField(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): HeadingCardConfig {
    return {
      type: 'custom:fluvy-heading-card',
      title: 'Living room',
      entities: entities.filter((id) => /^(light|switch|fan|cover)\./.test(id)).slice(0, 4),
    };
  }

  protected override prepare(config: HeadingCardConfig): HeadingCardConfig {
    if (typeof config.title !== 'string' || config.title.trim() === '')
      throw new Error('fluvy-heading-card: "title" is required');
    return config;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    requestAnimationFrame(() => this.placeInSection());
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.placeInSection();
  }

  /** `follows` when a visible card comes before this one in its Home Assistant grid section (hidden cards do not count). */
  private placeInSection(): void {
    const cell = this.closest('.card');
    const root = cell?.getRootNode();
    const inGrid = root instanceof ShadowRoot && root.host.localName === 'hui-grid-section';
    let before = inGrid ? (cell?.previousElementSibling ?? null) : null;
    while (before && getComputedStyle(before).display === 'none')
      before = before.previousElementSibling;
    this.toggleAttribute('follows', before !== null);
  }

  override getCardSize(): number {
    return 1;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** "2 of 4 on" while something is on, otherwise the plain count. Unreachable entities count as devices, never as on. */
  protected renderCard(): TemplateResult {
    const title = this.config?.title ?? '';
    const plain = this.config?.variant === 'plain';
    const text = plain
      ? ''
      : (this.config?.subtitle ??
        counted(this.hass, idsOf(this.config?.entities), (id) => this.entity(id)));
    const action: ActionConfig | undefined = this.config?.path
      ? { action: 'navigate', navigation_path: this.config.path }
      : this.config?.tap_action;
    let goes = !plain && action !== undefined && action.action !== 'none';
    let lead = this.config?.icon;
    // the section title: the first of its ways that holds — whole, without the link's words, at the subtitle's size,
    // without its glyph, without the chevron; where none does, the title steps down and ends in its ellipsis beside
    // its glyph and chevron (giving them up would not make it whole)
    const titled = this.config?.heading_style === 'title';
    let big = false;
    let shown = text;
    const ruler = this.head.ruler;
    if (titled) {
      type Way = [big: boolean, words: string, chevron: boolean, glyph: string | undefined];
      const ways: Way[] = [
        [true, text, goes, lead],
        [true, '', goes, lead],
        [false, '', goes, lead],
        [false, '', goes, undefined],
        [false, '', false, undefined],
      ];
      const holds = ([large, said, mark, drawn]: Way): boolean =>
        (drawn ? (large ? 48 : 32) : 0) +
          ruler.width(`hm-section${large ? ' hm-section--big' : ''} > hm-section__title`, title) +
          (said || mark
            ? 16 + (said ? ruler.width(LINK, said) + (mark ? 2 : 0) : 0) + (mark ? 16 : 0)
            : 0) <=
        this.width;
      [big, shown, goes, lead] = ways.find(holds) ?? (ways[2] as Way);
    } else if (
      text &&
      ruler.width('hm-section__meta > hm-section__text', text) + (goes ? 13 : 0) > 0.6 * this.width
    )
      // a group's meta longer than its 60 % of the row is never cut: its words give way to the chevron
      shown = '';
    const words = shown ? html`<span class="hm-section__text">${shown}</span>` : nothing;

    return html`<div
      class="hm-section ${titled ? 'hm-section--title' : ''} ${big ? 'hm-section--big' : ''}"
    >
      <div class="hm-section__lead">
        ${lead ? html`<span class="hm-section__icon">${icon(lead)}</span>` : nothing}
        <h2 class="hm-section__title" data-name>${title}</h2>
      </div>
      ${
        goes
          ? html`<button
              class="hm-section__meta"
              aria-label=${text ? `${title} · ${text}` : title}
              @click=${() => this.tap(undefined, action)}
            >
              ${words}${glyph('chevron')}
            </button>`
          : shown
            ? html`<span class="hm-section__meta">${words}</span>`
            : nothing
      }
    </div>`;
  }
}
