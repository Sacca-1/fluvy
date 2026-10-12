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
import { glyph, head, icon, round, sheetStyles, type IconRef } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { relativeAgo } from '../helpers/datetime.js';
import { Card, type BaseKey } from '../shared/base.js';
import { glyphFor } from '../shared/domain.js';
import {
  actionFields,
  colourFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  numberField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { listLength, rowsOf } from '../shared/heights.js';
import { isTemplate, TemplateTexts } from '../shared/templates.js';

const s = strings('actions');

export interface ActionRowConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** What the action does ("Lights & blinds"): the context before "· ran 07:00", or a template rendered live. Defaults to the entity's area. */
  secondary?: string;
}

export interface ActionsCardConfig extends FluvyCardConfig {
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

const sentence = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * Scenes, scripts, buttons and automations as the sheet draws them: a bare 20 glyph in the 44 icon
 * column, the name and when it last ran, a play affordance at the right. A press answers at once —
 * the surface gives under the finger and the glyph becomes a check for a beat.
 */
export class FluvyActionsCard extends Card<ActionsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ActionsCardConfig): number {
    const columns = Math.min(3, Math.max(1, Math.round(Number(config.columns ?? 1)) || 1));
    return 92 + 68 * rowsOf(listLength(config, ['rows', 'entities']), columns);
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

      .in-action .fv-row__title,
      .in-action .fv-row__sub {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      /* side by side there is no room for the play affordance: the text keeps the 12 the glyph column has */
      .in-actions--grid .in-action {
        padding-right: 12px;
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
  ];
  static override keys = configKeys<ActionsCardConfig>()(['title', 'subtitle', 'rows', 'columns']);
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
        ...colourFields(),
        entitiesField('entities', ACTION_DOMAINS, true),
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
    if (!config.rows?.length && !config.entities?.length)
      throw new Error('fluvy-actions-card: add at least one entity');
    return config;
  }

  private rows(): ActionRowConfig[] {
    const source = this.config?.rows ?? this.config?.entities ?? [];
    return source.map((row) => (typeof row === 'string' ? { entity: row } : row));
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

  private sub(view: EntityView, row: ActionRowConfig): string {
    if (view.status === 'unavailable' || view.status === 'missing')
      return stateText(this.hass, view);
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
    return context ? `${context} · ${when}` : sentence(when);
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

  private action(row: ActionRowConfig, grid: boolean): TemplateResult {
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
      <span class="in-action__glyph"
        >${keyed(done, html`<span class="in-action__ink fv-swap">${done ? glyph('check') : icon(ref)}</span>`)}</span
      >
      <span class="fv-row__text"
        ><span class="fv-row__title">${name}</span
        >${keyed(done, html`<span class="fv-row__sub fv-swap">${done ? s(this.hass, 'done') : this.sub(view, row)}</span>`)}</span
      >
      ${grid ? nothing : html`<span class="in-action__go">${glyph('play')}</span>`}
    </button>`;
  }

  protected renderCard(): TemplateResult {
    const columns = this.columns;
    const action = this.config?.tap_action;

    return html`<article class="fv-card" data-card>
      ${head({
        icon: this.config?.icon ?? 'bolt',
        tone: toneOf(this.config, 'accent'),
        title: this.config?.title ?? s(this.hass, 'title'),
        sub: this.config?.subtitle ?? s(this.hass, 'subtitle'),
        // "…" appears when it has somewhere to go: a card of many entities has no more-info of its own
        trailing:
          action && action.action !== 'none'
            ? round('dots', 'quiet', this.t('common.more'), () => this.tap(undefined, action))
            : nothing,
        onHold: () => this.hold(),
      })}
      <div
        class="in-actions ${columns > 1 ? 'in-actions--grid' : ''}"
        style="--in-columns:${columns};--in-gap:${cellGap(this.contentWidth, columns)}px"
      >
        ${this.rows().map((row) => this.action(row, columns > 1))}
      </div>
    </article>`;
  }
}
