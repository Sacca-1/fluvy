import {
  formatTime,
  haptic,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { glyph, head, icon, sheetStyles, type IconRef } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { relativeAgo } from '../helpers/datetime.js';
import { HeadFit } from '../energy/head.js';
import { Card, type BaseKey } from '../shared/base.js';
import { glyphFor } from '../shared/domain.js';
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
  numberField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { EMPTY, entryCount, HEAD, rowsOf } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { isTemplate, TemplateTexts } from '../shared/templates.js';

const s = strings('actions');

export interface ActionRowConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** What the action does ("Lights & blinds"): the context before "· ran 07:00", or a template rendered live. Defaults to the entity's area. */
  secondary?: string;
}

export interface ActionsCardConfig extends FluvyCardConfig, EmptyList {
  title?: string;
  subtitle?: string;
  /** The same actions as `entities`, with a name, an icon or a context line each (YAML). */
  rows?: ReadonlyArray<string | ActionRowConfig>;
  /** Actions per line. The sheet draws one full-width row per action (the default); 2 or 3 suit a wide column. */
  columns?: number;
}

/** How long the glyph stays a check after a press: long enough to be seen, short enough not to lie. */
const DONE_MS = 1200;

const SERVICES: Readonly<
  Record<string, readonly [service: string, data: Record<string, unknown>]>
> = {
  scene: ['turn_on', {}],
  script: ['turn_on', {}],
  button: ['press', {}],
  input_button: ['press', {}],
  automation: ['trigger', { skip_condition: true }],
};

export const ACTION_DOMAINS = Object.keys(SERVICES);

/** The gap between cells that lets them land on the 4 grid (3 × 104 + 2 × 4 in a 320 column, 2 × 124 + 12 in a 260 one). */
const cellGap = (width: number, columns: number): number =>
  [8, 12, 4, 16].find((gap) => ((width - gap * (columns - 1)) / columns) % 4 === 0) ?? 8;

/** Narrower than this, an action cannot hold its glyph column and a readable name: the grid gives up a column. */
const MIN_CELL = 148;
/** A run this recent is told by its time of day ("ran 23:10"); an older one by how long ago. */
const RECENT_MS = 24 * 3600_000;

/* a cell beside its words: the 44 glyph column and a 12 gap before them, a 12 gap and the play's 56 after them (its
   44 box, 16 inside it, 4 back out); without the play, the 12 the glyph column has; without either, 16 and 12 */
const BESIDE_BOTH = 44 + 12 + 12 + 56;
const BESIDE_GLYPH = 44 + 12 + 12;
const BARE = 16 + 12;

/** What the cells keep beside their words, and the room left for them. */
interface Layout {
  readonly glyph: boolean;
  readonly play: boolean;
  readonly room: number;
}

const sentence = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * Scenes, scripts, buttons and automations as the sheet draws them: a bare 20 glyph in the 44 icon
 * column, the name and when it last ran, a play affordance at the right. A press answers at once —
 * the surface gives under the finger and the glyph becomes a check for a beat.
 */
export class FluvyActionsCard extends Card<ActionsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ActionsCardConfig): number {
    const n = entryCount(config, ['rows', 'entities']);
    if (!n) return HEAD + EMPTY;
    const columns = Math.min(3, Math.max(1, Math.round(Number(config.columns ?? 1)) || 1));
    return 92 + 68 * rowsOf(n, columns);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.inputs,
    css`
      /* the sheet's single 320 column becomes the card's own, in equal fluid cells */
      .in-actions {
        grid-template-columns: repeat(var(--in-columns, 1), minmax(0, 1fr));
        column-gap: var(--in-gap, 8px);
      }

      /* a name too long for the column takes a second line instead of losing its end */
      .in-action {
        align-items: center; /* a row that grows keeps its glyph and chevron centred on the text block */
        height: auto;
        min-height: 60px;
        padding: 8px 0;
      }

      .in-action .fv-row__text {
        align-self: center;
      }

      /* a name wraps at its words, never inside one, and ends in its ellipsis on its second line */
      .in-action .fv-row__title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
      }

      /* when it ran is the line's fact: whole, at its words where it must */
      .in-action__when {
        white-space: normal;
      }

      /* where the play cannot stand (side by side, a narrow column) the text keeps the 12 the glyph column has */
      .in-actions--still .in-action {
        padding-right: 12px;
      }

      /* a row that gave its glyph to its name starts its words 16 in */
      .in-actions--bare .in-action {
        padding-left: 16px;
      }

      .in-action__ink {
        display: inline-flex;
      }
    `,
  ];

  static override properties = { ...Card.properties, done_: { state: true } };

  /** Entities showing the "done" check right now. */
  declare done_: ReadonlySet<string>;

  private readonly timers = new Map<string, number>();
  /** A row's context when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);
  private readonly head = new HeadFit(this);

  constructor() {
    super();
    this.done_ = new Set();
  }

  /** A card of many actions has no entity of its own: its head's icon, tone and colour, its tap ("…") and its hold. */
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
  static override keys = configKeys<ActionsCardConfig>()([
    'title',
    'subtitle',
    'rows',
    'columns',
    ...EMPTY_KEYS,
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'rows',
      alias: 'entities',
      title: 'editor.rows',
      domains: ACTION_DOMAINS,
      keys: ['entity', 'name', 'icon', 'secondary'],
      schema: [entityField(ACTION_DOMAINS), nameIconFields(), textField('secondary')],
    },
  ];
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), numberField('columns', 1, 3)),
        showIconField(),
        ...colourFields(),
        entitiesField('entities', ACTION_DOMAINS, true),
        emptyFields(),
        actionFields(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): ActionsCardConfig {
    const actions = entities.filter((id) => ACTION_DOMAINS.includes(id.slice(0, id.indexOf('.'))));
    return {
      type: 'custom:fluvy-actions-card',
      entities: (actions.length ? actions : entities).slice(0, 4),
    };
  }

  protected override prepare(config: ActionsCardConfig): ActionsCardConfig {
    listOf(config, 'rows', ['entities']);
    return config;
  }

  private rows(): ActionRowConfig[] {
    return itemsOf(this.config?.rows ?? this.config?.entities);
  }

  protected override watched(): readonly string[] {
    return this.rows().map((row) => row.entity);
  }

  /** The configured columns, as many as the width can hold. */
  private get columns(): number {
    const asked = Math.round(Number(this.config?.columns ?? 1));
    const fits = Math.floor((this.contentWidth + 8) / (MIN_CELL + 8));
    return Number.isFinite(asked) ? Math.min(3, fits, Math.max(1, asked)) || 1 : 1;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.done_ = new Set();
  }

  override getCardSize(): number {
    return 1 + Math.ceil(this.rows().length / this.columns);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- running ---------- */

  /** When it last ran: `last_triggered` for scripts and automations; the state of a scene or a button is that moment. */
  private lastRun(view: EntityView): Date | null {
    const triggered = view.attr<unknown>('last_triggered');
    const raw =
      typeof triggered === 'string' && triggered
        ? triggered
        : view.domain === 'scene' || view.domain === 'button' || view.domain === 'input_button'
          ? view.state
          : '';
    if (!raw || view.status !== 'ok') return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** What a row's line says: what the action does ("Lights & blinds", by default its area) and when it last ran. */
  private parts(view: EntityView, row: ActionRowConfig): { context: string; when: string } {
    if (view.status === 'unavailable' || view.status === 'missing')
      return { context: '', when: stateText(this.hass, view) };
    const run = this.lastRun(view);
    const when =
      view.domain === 'script' && view.state === 'on'
        ? s(this.hass, 'running')
        : run === null
          ? s(this.hass, 'never')
          : Date.now() - run.getTime() < RECENT_MS
            ? s(this.hass, 'ran', { time: formatTime(this.hass, run) })
            : relativeAgo(this.hass, run);
    // the "ran" words keep the line whatever the context says: a pending template has nothing to hold
    const context =
      row.secondary === undefined
        ? view.areaName
        : isTemplate(row.secondary)
          ? this.texts.text(row.secondary, row.entity)
          : row.secondary;
    return { context, when: context ? when : sentence(when) };
  }

  /**
   * The line in the row's room for words: one line while it holds; else what the action does over when it ran — the
   * first a name (the owner's words, an area's) that may end in its ellipsis, the second the line's fact, whole.
   */
  private line(view: EntityView, row: ActionRowConfig, room: number): TemplateResult {
    const { context, when } = this.parts(view, row);
    const full = context ? `${context} · ${when}` : when;
    return !context || this.head.ruler.width('fv-row__sub', full) <= room
      ? html`<span class="fv-row__sub in-action__when fv-swap">${full}</span>`
      : html`<span class="fv-row__sub fv-swap" data-name title=${context}>${context}</span
          ><span class="fv-row__sub in-action__when fv-swap">${when}</span>`;
  }

  private run(view: EntityView): void {
    const service = SERVICES[view.domain];
    if (!service || this.done_.has(view.id)) return; // a second tap inside the "Done" beat is the same gesture, not a second run
    haptic(this, 'light');
    this.call(view.domain, service[0], service[1], view.id);

    this.done_ = new Set(this.done_).add(view.id);
    clearTimeout(this.timers.get(view.id));
    this.timers.set(
      view.id,
      window.setTimeout(() => {
        this.timers.delete(view.id);
        const rest = new Set(this.done_);
        rest.delete(view.id);
        this.done_ = rest;
      }, DONE_MS),
    );
  }

  /* ---------- render ---------- */

  private action(row: ActionRowConfig, layout: Layout): TemplateResult {
    const view = this.entity(row.entity);
    const name = row.name ?? view.name;
    const runnable =
      view.status !== 'unavailable' && view.status !== 'missing' && view.domain in SERVICES;
    const done = this.done_.has(view.id);
    const ref: IconRef | string = row.icon ?? view.attr<string>('icon') ?? glyphFor(view);
    return html`<button
      class="in-action fv-tile--tap ${runnable ? '' : 'is-unavailable'}"
      data-card
      data-target
      ?disabled=${!runnable}
      aria-label=${s(this.hass, 'run', { name })}
      @click=${() => this.run(view)}
    >
      ${
        layout.glyph
          ? html`<span class="in-action__glyph"
              >${keyed(done, html`<span class="in-action__ink fv-swap">${done ? glyph('check') : icon(ref)}</span>`)}</span
            >`
          : nothing
      }
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${name}</span>${keyed(
          done,
          done
            ? html`<span class="fv-row__sub fv-swap">${s(this.hass, 'done')}</span>`
            : this.line(view, row, layout.room),
        )}</span
      >
      ${layout.play ? html`<span class="in-action__go">${glyph('play')}</span>` : nothing}
    </button>`;
  }

  /**
   * What a cell keeps beside its words, decided from the column, the names and the language's words, never from a
   * state: the glyph and the play while every name keeps its room beside them (96, or the name itself: the rows' rule)
   * and when an action runs is said on one line ("ausgeführt 07:00"); else the play goes, as it does side by side;
   * else the glyph too.
   */
  private cells(columns: number, gap: number): Layout {
    const cell = (this.contentWidth - gap * (columns - 1)) / columns;
    const names = this.rows().map((row) => row.name ?? this.entity(row.entity).name);
    const facts = [
      s(this.hass, 'ran', { time: formatTime(this.hass, new Date(2000, 0, 1, 23, 59)) }),
      sentence(s(this.hass, 'never')),
      sentence(s(this.hass, 'running')),
    ];
    const holds = (room: number): boolean =>
      names.every((name) => room >= this.head.rowNameRoom(name)) &&
      facts.every((fact) => this.head.ruler.width('fv-row__sub', fact) <= room);
    const play = columns === 1 && holds(cell - BESIDE_BOTH);
    const glyph = play || holds(cell - BESIDE_GLYPH);
    return { glyph, play, room: cell - (play ? BESIDE_BOTH : glyph ? BESIDE_GLYPH : BARE) };
  }

  protected renderCard(): TemplateResult {
    const rows = this.rows();
    const panel = emptyPanel(this, !rows.length, 'bolt', 'common.no_actions');
    // the panel takes the whole column the actions would share
    const columns = panel ? 1 : this.columns;
    const gap = cellGap(this.contentWidth, columns);
    const layout = this.cells(columns, gap);
    const title = this.config?.title ?? s(this.hass, 'title');
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub: this.config?.subtitle ?? s(this.hass, 'subtitle'),
    });

    return html`<article class="fv-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'bolt') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        cut: fitted.cut,
        // the head is the card's button where its tap has somewhere to go: a card of many has no details of its own
        ...this.headActions(),
      })}
      <div
        class="in-actions ${layout.play ? '' : 'in-actions--still'} ${layout.glyph ? '' : 'in-actions--bare'}"
        style="--in-columns:${columns};--in-gap:${gap}px"
      >
        ${panel ?? rows.map((row) => this.action(row, layout))}
      </div>
    </article>`;
  }
}
