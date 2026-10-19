import {
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type UnsubscribeFunc,
} from '@fluvy/core';

import { emptyState, glyph, head, round, sheetStyles } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { repeat } from 'lit/directives/repeat.js';

import { dayText, daysUntil, parseMomentText, relativeDays } from '../helpers/datetime.js';

import { textField as inputField } from '../helpers/text.js';

import { HeadFit } from '../energy/head.js';
import { Card, HEAD_BASE } from '../shared/base.js';

import {
  actionFields,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  showIconField,
  textField,
} from '../shared/form.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import type { EditorDefaults } from '../shared/rows-editor.js';

const s = strings('todo');

export interface TodoCardConfig extends FluvyCardConfig {
  subtitle?: string;
  /** The ticked items, quieted at the end of the list (default) — or dropped. */
  show_completed?: boolean;
  /** The "+" that opens the composer (default), for a list that accepts new items. */
  show_add?: boolean;
  /** The due date under an item (default). */
  show_due?: boolean;
}

export type TodoStatus = 'needs_action' | 'completed';

export interface TodoItem {
  readonly uid: string;
  readonly summary: string;
  readonly status: TodoStatus;
  readonly due?: string | null;
  readonly description?: string | null;
}

interface TodoItems {
  readonly items?: readonly TodoItem[] | null;
}

/** `TodoListEntityFeature`. DELETE (2) has no affordance in the approved design: ticked items are quieted or hidden. */
const CREATE = 1;
const UPDATE = 4;

/** How long a tick survives without the server agreeing. */
const PENDING_MS = 3000;
/** Items the card added that the server has not listed yet. */
const LOCAL = 'fluvy-local:';
/** Rows held open while the first list is on its way, so the card does not grow under the reader. */
const MAX_PLACEHOLDERS = 8;
/**
 * The rows a list that cannot be read keeps — unavailable before its items came, or gone from the house: the list of
 * five the card declares (`layoutHeight`), each a row at rest.
 */
const RESTING = 5;

/**
 * A to-do list the way the sheet draws it: the count and the accent "+" in the head, then 60 px rows
 * whose check ring sits in the 44 icon column. A tick answers under the finger and the service follows.
 * Items arrive over `todo/item/subscribe`, so a change made on another device lands here too; where the
 * subscription is refused, or stays silent, the list is read again whenever the entity changes.
 */
export class FluvyTodoCard extends Card<TodoCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(): number {
    return 100 + RESTING * 60; // a list of five
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.inputs,
    css`
      /* a row keeps its 60; a long summary takes the lines it needs (three at most) instead of losing its end */
      .in-todo__row {
        align-items: center; /* a row that grows keeps its check centred on the whole body */
        height: auto;
        min-height: 60px;
        padding: 8px 0;
      }

      .in-todo__body,
      .in-todo__row > .in-todo__text {
        align-self: center;
      }

      .in-todo__body {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-width: 0;
      }

      .in-todo__text {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow: hidden;
        overflow-wrap: anywhere;
      }

      .in-todo__row > .in-todo__text {
        flex: 1 1 auto;
        min-width: 0;
      }

      .in-todo__text--quiet {
        color: var(--fluvy-text-secondary);
      }

      .in-todo__due--late {
        color: var(--fluvy-warning);
      }

      .in-check {
        transition:
          transform var(--fv-fast) var(--fv-ease),
          background-color var(--fv-base) var(--fv-ease),
          box-shadow var(--fv-base) var(--fv-ease);
      }

      button.in-check-hit:active .in-check {
        transform: scale(0.9);
      }

      .in-todo__wait {
        width: 40%;
        height: 12px;
      }

      /* a list that cannot be read keeps its rows at rest: their bars still, not loading, drawn on the page's fill */
      .is-off .in-todo__wait {
        animation: none;
        background: var(--fluvy-border);
      }

      /* the "+" turns into the "×" that closes the field it opened */
      .in-add svg {
        transition: transform var(--fv-base) var(--fv-ease);
      }

      .in-add.is-open svg {
        transform: rotate(45deg);
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    items_: { state: true },
    adding_: { state: true },
  };

  /** Null until the first list arrives. */
  declare items_: readonly TodoItem[] | null;
  declare adding_: boolean;

  private unsub: UnsubscribeFunc | undefined;
  /** The entity the items belong to ('' = none yet). */
  private source = '';
  /** `last_updated` of the entity when the list was last asked for. */
  private stamp = '';
  /** Messages the subscription has delivered: the first is its answer, a second proves it reports changes. */
  private pushes = 0;
  /** Bumped by every list that is accepted or asked for: an answer that was overtaken is dropped. */
  private sequence = 0;
  /** Bumped by every release: a subscription that resolves for an earlier generation is closed, never kept. */
  private generation = 0;
  private localCount = 0;
  private focusField = false;
  /** uid → the status asked for and not yet reported. */
  private readonly pending = new Map<string, { status: TodoStatus; timer: number }>();

  constructor() {
    super();
    this.items_ = null;
    this.adding_ = false;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<TodoCardConfig>()([
    'subtitle',
    'show_completed',
    'show_add',
    'show_due',
  ]);
  private readonly head = new HeadFit(this);
  /**
   * The list's name is the base's `name` (`title` was the older word for it); `hide_completed: true` was the way to
   * drop the ticked items: it reads as `show_completed: false`.
   */
  static override aliases: AliasSpec = {
    keys: [
      { from: 'title', to: 'name' },
      { from: 'hide_completed', to: 'show_completed', map: (value) => !value },
    ],
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    show_add: true,
    show_due: true,
    show_completed: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['todo']),
        fieldRow(textField('name'), textField('subtitle')),
        fieldRow(iconField(), showIconField()),
        ...colourFields(),
        fieldRow(boolField('show_completed'), boolField('show_add')),
        boolField('show_due'),
        actionFields(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): TodoCardConfig {
    return {
      type: 'custom:fluvy-todo-card',
      entity: entities.find((id) => id.startsWith('todo.')) ?? '',
    };
  }

  protected override prepare(config: TodoCardConfig): TodoCardConfig {
    if (!config.entity) throw new Error('fluvy-todo-card: "entity" is required');
    return config;
  }

  /** Its rows, and the head: a list not read yet is the five it declares (its first frame and an unreachable one alike). */
  override getCardSize(): number {
    return 1 + Math.max(1, this.items_?.length ?? RESTING);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- items ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate(); // a card that is moved in the DOM subscribes again
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.release();
  }

  private release(): void {
    this.unsub?.();
    this.unsub = undefined;
    this.source = '';
    this.stamp = '';
    this.pushes = 0;
    this.sequence += 1; // answers still in flight belong to nobody
    this.generation += 1;
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.sync();
    if (this.focusField) {
      this.focusField = false;
      this.renderRoot
        .querySelector<HTMLElement>(this.adding_ ? '.fv-field__input' : '.in-add')
        ?.focus();
    }
  }

  /** Follows the configured entity: subscribes once per entity, and re-reads the list only while nothing else keeps it current. */
  private sync(): void {
    const id = this.config?.entity ?? '';
    const stateObj = this.hass?.states[id];
    if (!this.isConnected || !stateObj) return;
    if (this.source !== id) {
      if (this.source !== '') this.items_ = null; // another list: back to the placeholders, not the old items
      this.release();
      this.source = id;
      this.stamp = stateObj.last_updated;
      void this.subscribe(id);
    } else if (stateObj.last_updated !== this.stamp) {
      this.stamp = stateObj.last_updated;
      if (this.pushes < 2) void this.load(id);
    }
  }

  private async subscribe(entityId: string): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const generation = this.generation;
    try {
      const unsub = await hass.connection.subscribeMessage<TodoItems>(
        (message) => {
          if (generation !== this.generation) return;
          this.pushes += 1;
          this.sequence += 1;
          this.accept(message.items ?? []);
        },
        { type: 'todo/item/subscribe', entity_id: entityId },
      );
      if (generation === this.generation && this.isConnected) this.unsub = unsub;
      else unsub(); // the card left, or moved on to another list, while the request was out
    } catch {
      if (generation === this.generation) void this.load(entityId); // no subscription here: read the list, and again on every change
    }
  }

  private async load(entityId: string): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const ticket = ++this.sequence;
    let items: readonly TodoItem[] = [];
    try {
      items =
        (await hass.callWS<TodoItems>({ type: 'todo/item/list', entity_id: entityId })).items ?? [];
    } catch {
      /* an integration that cannot list is still a card: an empty list, not a blank box */
    }
    if (ticket === this.sequence && this.source === entityId) this.accept(items);
  }

  private accept(items: readonly TodoItem[]): void {
    this.items_ = items;
    for (const [uid, entry] of this.pending) {
      const item = items.find((candidate) => candidate.uid === uid);
      if (!item || item.status === entry.status) this.settle(uid);
    }
  }

  private settle(uid: string): void {
    const entry = this.pending.get(uid);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(uid);
    this.requestUpdate();
  }

  private statusOf(item: TodoItem): TodoStatus {
    return this.pending.get(item.uid)?.status ?? item.status;
  }

  private toggle(item: TodoItem): void {
    const entityId = this.config?.entity;
    if (!this.hass || !entityId) return;
    const status: TodoStatus = this.statusOf(item) === 'completed' ? 'needs_action' : 'completed';
    this.settle(item.uid);
    this.pending.set(item.uid, {
      status,
      timer: window.setTimeout(() => this.settle(item.uid), PENDING_MS),
    });
    this.requestUpdate();
    // a refused change goes back at once instead of waiting out the timer
    this.hass
      .callService('todo', 'update_item', { item: item.uid, status }, { entity_id: entityId })
      .catch(() => this.settle(item.uid));
  }

  private add(summary: string, input: HTMLInputElement): void {
    const entityId = this.config?.entity;
    const text = summary.trim();
    if (!this.hass || !entityId || !text) return;
    input.value = '';
    const uid = `${LOCAL}${++this.localCount}`;
    this.items_ = [...(this.items_ ?? []), { uid, summary: text, status: 'needs_action' }];
    this.hass.callService('todo', 'add_item', { item: text }, { entity_id: entityId }).catch(() => {
      this.items_ = (this.items_ ?? []).filter((item) => item.uid !== uid);
    });
  }

  private setAdding(open: boolean): void {
    this.adding_ = open;
    this.focusField = true; // into the field when it opens, back to the "+" when it closes
  }

  /* ---------- render ---------- */

  private due(item: TodoItem, done: boolean): TemplateResult | typeof nothing {
    const moment = item.due ? parseMomentText(item.due) : null;
    if (!moment) return nothing;
    const days = daysUntil(moment);
    const text = Math.abs(days) <= 6 ? relativeDays(this.hass, days) : dayText(this.hass, moment);
    return html`<span class="fv-row__sub ${days < 0 && !done ? 'in-todo__due--late' : ''}"
      >${text}</span
    >`;
  }

  private row(item: TodoItem, canUpdate: boolean): TemplateResult {
    const done = this.statusOf(item) === 'completed';
    const check = html`<span class="in-check ${done ? 'is-on' : ''}" data-control
      >${done ? glyph('check') : nothing}</span
    >`;
    const due = this.config?.show_due === false ? nothing : this.due(item, done);
    const text = html`<span class="in-todo__text">${item.summary}</span>`;
    return html`<div class="in-todo__row ${done ? 'is-done' : ''}" role="listitem">
      ${
        canUpdate && !item.uid.startsWith(LOCAL)
          ? html`<button
              class="in-check-hit"
              data-target
              role="checkbox"
              aria-checked=${done ? 'true' : 'false'}
              aria-label=${item.summary}
              @click=${() => this.toggle(item)}
            >
              ${check}
            </button>`
          : html`<span
              class="in-check-hit"
              role="img"
              aria-label=${s(this.hass, done ? 'done' : 'todo')}
              >${check}</span
            >`
      }
      ${due === nothing ? text : html`<span class="in-todo__body">${text}${due}</span>`}
    </div>`;
  }

  private list(
    view: EntityView,
    canUpdate: boolean,
    shown: readonly TodoItem[],
    unusable: boolean,
  ): TemplateResult | readonly TemplateResult[] {
    if (this.items_ === null) {
      // the open items the list counts, while they come; the declared five where it cannot be read
      const waiting = unusable
        ? RESTING
        : Math.min(MAX_PLACEHOLDERS, Math.max(1, view.number ?? 1));
      return Array.from(
        { length: waiting },
        () =>
          html`<div class="in-todo__row" aria-hidden="true">
            <span class="in-check-hit"><span class="in-check"></span></span
            ><span class="fv-skeleton in-todo__wait"></span>
          </div>`,
      );
    }
    if (!shown.length) return emptyState('check', s(this.hass, 'empty'));
    return html`${repeat(
      shown,
      (item) => item.uid,
      (item) => this.row(item, canUpdate),
    )}`;
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    // a list out of reach (unavailable, or gone from the house) keeps its head, its "+" and its rows, still: only the
    // colours change (1.9: an unavailable card keeps its size)
    const unusable = view.status === 'unavailable' || view.status === 'missing';
    const canCreate = view.supports(CREATE) && !unusable;
    const canUpdate = view.supports(UPDATE) && !unusable;

    const items = this.items_ ?? [];
    const open = items.filter((item) => this.statusOf(item) === 'needs_action');
    const closed = items.filter((item) => this.statusOf(item) === 'completed');
    const shown = this.config?.show_completed === false ? open : [...open, ...closed];
    // a list gone from the house says nothing of what it takes: its "+" is kept where the config asks for one
    const adds =
      (canCreate || (unusable && (view.supports(CREATE) || view.status === 'missing'))) &&
      this.config?.show_add !== false;
    // "3 of 5 left", or "3 left" where not even the circle's room holds it beside the "+": a count is never cut
    const left = this.t('todo.left', { left: open.length, total: items.length });
    const sub =
      this.config?.subtitle ??
      (unusable
        ? stateText(this.hass, view)
        : this.items_ === null || !items.length
          ? view.areaName
          : open.length
            ? this.head.ruler.width('fv-card__sub', left) <= this.contentWidth - (adds ? 56 : 0)
              ? left
              : this.t('common.left', { count: open.length })
            : s(this.hass, 'all_done'));
    const adding = this.adding_ && canCreate && adds;
    // the circle gives way where that makes the list's name whole, never the "+" (a control never gives way)
    const fitted = this.head.fit({
      width: this.contentWidth,
      title: name,
      sub: sub ?? '',
      ...(adds ? { trailing: 44 } : {}),
    });

    return html`<article class="fv-card ${unusable ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'list') : null,
        small: fitted.small,
        tone: unusable ? 'off' : toneOf(this.config, 'accent'),
        title: name,
        name: true,
        sub: fitted.sub,
        cut: fitted.cut,
        trailing: adds
          ? round(
              'plus',
              'accent',
              adding ? s(this.hass, 'close') : this.t('todo.add'),
              () => this.setAdding(!this.adding_),
              !canCreate,
              `in-add ${adding ? 'is-open' : ''}`,
            )
          : nothing,
        ...this.headActions(view.id),
      })}
      ${
        adding
          ? html`<div class="fv-swap">
              ${inputField({
                id: 'composer',
                value: '',
                label: this.t('todo.add'),
                placeholder: this.t('todo.add'),
                maxLength: 255,
                editing: true, // the field is the user's from the moment it opens
                commitOn: 'enter',
                onCommit: (value, input) => this.add(value, input),
                onCancel: () => this.setAdding(false),
              })}
            </div>`
          : nothing
      }
      <div class="in-todo" role="list">${this.list(view, canUpdate, shown, unusable)}</div>
    </article>`;
  }
}
