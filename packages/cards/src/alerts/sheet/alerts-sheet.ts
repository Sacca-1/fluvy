import {
  formatDate,
  formatTime,
  localize,
  plural,
  strings,
  type ActionConfig,
  type HomeAssistant,
} from '@fluvy/core';
import {
  baseStyles,
  emptyState,
  fitPills,
  icon,
  label,
  pressCover,
  round,
  sheetStyles,
  type Tone,
} from '@fluvy/ui';
import {
  LitElement,
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { chipRow } from '../../shared/chips.js';
import { fitLine, TextRuler } from '../../shared/fit.js';
import { FontsSettled } from '../../shared/fonts.js';
import { bindAction, offered } from '../actions.js';
import type { AlertResult, AlertsState } from '../engine.js';
import {
  countWords,
  culprits,
  groupsOf,
  lasted,
  rowArea,
  rowGlyph,
  rowName,
  rowState,
  type LookContext,
  type RowGroup,
} from '../look.js';
import {
  snoozeAlert,
  SNOOZE_CHOICES,
  SNOOZE_WORDS,
  type AlertMemory,
  type SnoozeChoice,
} from '../memory.js';
import type { AlertAction, AlertButton } from '../model.js';
import { SEVERITY_TONE } from '../severity.js';

const s = strings('alerts');

/** What the sheet asks of the card that opened it. */
export interface SheetHost {
  /** The overview's title (the card's). */
  title(): string;
  /** An alert as the card draws it: its name, glyph, tone and own colour. */
  look(result: AlertResult): {
    readonly name: string;
    readonly glyph: string;
    readonly tone: Tone;
    readonly accent: string | undefined;
  };
  context(): LookContext;
  memory(): AlertMemory;
  /** Runs an action as the card would (Home Assistant's own, its confirmation handed to it). */
  run(action: ActionConfig, entity?: string): void;
  /** The card's colours, adopted into the sheet's own root. */
  adopt(root: ShadowRoot): void;
  /** The sheet is closed: the card may step aside now if all is clear. */
  closed(): void;
}

/** A tap must clear the scrim's own opening tap; how long the sheet takes to leave; how long a button stays armed. */
const GUARD_MS = 350;
const LEAVE_MS = 200;
const ARMED_MS = 4000;
const MINUTE = 60_000;
/** A row's circle and the gap after it; a button's sides (as `fitPills()` gives them). */
const CIRCLE = 56;
const BUTTON_SIDES = 28;
/** The least a row's name keeps beside its end before every row gives its circle to its name. */
const NAME_MIN = 96;
/** Two lines of a row's words, less what wrapping by words loses. */
const TWO_LINES = 1.8;

/** One row of an alert, read before it is drawn (the rows give their circles together). */
interface RowView {
  readonly group: RowGroup;
  readonly name: string;
  readonly state: string;
  readonly button: AlertButton | undefined;
  readonly id: string;
  readonly armed: boolean;
  readonly words: string;
  /** The button as its glyph alone: its words gave way to the state beside it. */
  readonly glyph: boolean;
  /** The state said first under the name: at the row's end it would leave the count there no room. */
  readonly under: boolean;
  readonly value: string;
  readonly end: number;
}

/**
 * What the dialog keeps to itself, sitting in a popup (Bubble Card's) that closes on a window's Escape and slides closed
 * from a touch on itself: Escape closes the sheet alone, and a touch that starts in the sheet is the sheet's.
 */
const keepEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') event.stopPropagation();
};
const keepTouch = { handleEvent: (event: Event): void => event.stopPropagation(), passive: true };

/** What Home Assistant answers in a dialog of its own: the sheet steps aside before it opens. */
const opensDialog = (action: ActionConfig): boolean =>
  ['more-info', 'navigate', 'url', 'assist', 'fire-dom-event'].includes(action.action) ||
  Boolean(action.confirmation);

/** Whether this person must be asked before the action runs: it asks, and they are not exempted. */
function asks(action: AlertAction, hass: HomeAssistant | undefined): boolean {
  const confirmation = action['confirmation'];
  if (!confirmation) return false;
  if (typeof confirmation !== 'object') return true;
  const exempt = (confirmation as { exemptions?: readonly { user?: string }[] }).exemptions;
  return !exempt?.some((entry) => entry.user === hass?.user?.id);
}

/** The text an action's own confirmation says, when it says one. */
const confirmText = (action: AlertAction): string => {
  const confirmation = action['confirmation'];
  return typeof confirmation === 'object' &&
    confirmation &&
    typeof (confirmation as { text?: unknown }).text === 'string'
    ? (confirmation as { text: string }).text
    : '';
};

/**
 * The alerts' sheet, a modal bottom sheet (as the schedule sheet is), fetched the first time an alert is opened:
 *
 * - an alert: its rows — what matched, by device when it counts devices — each with its state, where it is and how
 *   long ("Kitchen · for 2 h"), its row's button (Lock, Close, Install, Dock, Acknowledge), the row's tap and hold;
 *   then the alert's own buttons ("Lock all", asked first in the sheet itself) and Snooze — an hour, eight, until
 *   tomorrow morning, until it changes. A button that clears the last match leaves the sheet saying "All clear" (the
 *   card steps aside once it closes);
 * - the overview (the card's hold): every alert, those that need a look, the snoozed ones (Wake) and the clear ones.
 *
 * Escape, the scrim and the close round close it, the focus going back where it came from; while it is open, the
 * times it says move on with the minute. `docked` draws it in the flow (the playground).
 */
export class FluvyAlertsSheet extends LitElement {
  static override styles: CSSResultGroup = [
    ...baseStyles,
    sheetStyles.devices,
    css`
      :host(:not([docked])) {
        display: contents;
      }
      dialog {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        overflow: hidden;
        padding: 0;
        border: 0;
        background: color-mix(in srgb, var(--fluvy-neutral-05) 48%, transparent);
        color: inherit;
        touch-action: none;
        overscroll-behavior: contain;
        animation: fv-fade 240ms var(--fv-ease) both;
      }
      dialog[open] {
        display: flex;
      }
      dialog::backdrop {
        background: none;
      }
      @keyframes as-up {
        from {
          transform: translateY(100%);
        }
        to {
          transform: none;
        }
      }
      @keyframes as-down {
        to {
          transform: translateY(100%);
        }
      }
      @keyframes as-out {
        to {
          opacity: 0;
        }
      }
      dialog .fv-sheet {
        max-width: 392px;
        max-height: 100%;
        overflow-y: auto;
        touch-action: pan-y;
        overscroll-behavior: contain;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
        animation: as-up 320ms var(--fv-ease-out) both;
      }
      dialog.is-leaving {
        animation: as-out 200ms var(--fv-ease) both;
      }
      dialog.is-leaving .fv-sheet {
        animation: as-down 200ms var(--fv-ease) both;
      }
      .fv-sheet {
        position: relative;
        width: 100%;
      }
      .fv-sheet__head {
        height: auto;
        min-height: 44px;
      }
      .fv-sheet__head > .fv-card__titles {
        flex: 1 1 auto;
        min-width: 0;
      }
      /* what the head and a row say under a name is never cut: it takes a second line (a row's 60 holds two) */
      .fv-sheet__head .fv-card__sub,
      .as-rows .fv-row__sub:not([data-name]) {
        white-space: normal;
      }
      .fv-sheet__title {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .as-rows,
      .as-empty {
        margin-top: 16px;
      }
      /* a row's button is raised over its press, beside it: a 36 pill in a 44 hit */
      .as-hit {
        all: unset;
        position: relative;
        z-index: 1;
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        height: 44px;
        cursor: pointer;
      }
      .as-hit > .fv-btn {
        height: 36px;
        font-size: 14px;
      }
      .as-hit:focus-visible {
        outline: none;
      }
      .as-hit:focus-visible > .fv-btn {
        outline: 2px solid var(--fluvy-accent);
        outline-offset: 2px;
      }
      .as-value {
        color: var(--tone-ink);
      }
      .as-snooze {
        margin-top: 24px;
      }
      .as-snooze > .fv-label {
        margin: 0 0 8px;
      }
      .as-snooze > .fv-chips {
        margin-top: 0;
      }
      .as-note {
        margin: 16px 0 0;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        text-align: center;
        color: var(--fluvy-text-secondary);
      }
      /* the footer: buttons sharing one width, two a row (one a row where a label would not hold half) */
      .as-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 24px;
      }
      .as-actions--one {
        grid-template-columns: minmax(0, 1fr);
      }
      .as-actions .fv-btn {
        width: 100%;
        min-width: 0;
        padding: 0 8px;
        white-space: nowrap;
      }
      .as-actions > .as-wide {
        grid-column: 1 / -1;
      }
    `,
  ];

  static override properties = {
    hass: { attribute: false },
    state: { attribute: false },
    card: { attribute: false },
    docked: { type: Boolean, reflect: true },
    key_: { state: true },
    from_: { state: true },
    snoozing_: { state: true },
    armed_: { state: true },
    leaving_: { state: true },
    error_: { state: true },
    tick_: { state: true },
  };

  declare hass?: HomeAssistant;
  /** Every alert as the card has it now. */
  declare state: AlertsState | undefined;
  declare card: SheetHost | undefined;
  /** Draws the sheet in the flow instead of in a modal dialog (the playground). */
  declare docked: boolean;
  /** The alert shown, by key; '' the overview; null closed. */
  declare key_: string | null;
  /** Opened from the overview: the head goes back to it. */
  declare from_: boolean;
  declare snoozing_: boolean;
  /** The button tapped once that asks to be tapped again, by its place. */
  declare armed_: string;
  declare leaving_: boolean;
  declare error_: string;
  /** The minute, while the sheet is open: what says how long moves on. */
  declare tick_: number;

  /** Widths laid out by the browser in the sheet's own classes. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);
  private openedBy: HTMLElement | undefined;
  private openedAt = 0;
  private leaveTimer = 0;
  private armTimer = 0;
  private clock = 0;

  constructor() {
    super();
    this.docked = false;
    this.key_ = null;
    this.from_ = false;
    this.snoozing_ = false;
    this.armed_ = '';
    this.leaving_ = false;
    this.error_ = '';
    this.tick_ = 0;
    new FontsSettled(this, () => {
      this.ruler.clear();
      fitPills(this.renderRoot, true);
      this.requestUpdate();
    });
  }

  get isOpen(): boolean {
    return this.key_ !== null && !this.leaving_;
  }

  /** Opens the sheet on an alert (its key), or on the overview (none); `openedBy` gets the focus back. */
  open(key: string | undefined, openedBy?: HTMLElement): void {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    this.openedBy = openedBy;
    this.key_ = key ?? '';
    this.from_ = false;
    this.snoozing_ = false;
    this.error_ = '';
    this.disarm();
    this.leaving_ = false;
    this.openedAt = performance.now();
    clearInterval(this.clock);
    this.clock = window.setInterval(() => {
      this.tick_ += 1;
    }, MINUTE);
  }

  /** Leaves; safe to call at any time. */
  close(): void {
    this.disarm();
    if (this.key_ === null || this.leaving_) return;
    if (this.docked) {
      this.snoozing_ = false;
      return;
    }
    this.leaving_ = true;
    this.leaveTimer = window.setTimeout(() => this.finishClose(), LEAVE_MS);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.renderRoot instanceof ShadowRoot) this.card?.adopt(this.renderRoot);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.finishClose();
  }

  /** The end of every way out: no alert, no dialog, no clock, the focus back where it came from. */
  private finishClose(): void {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    clearInterval(this.clock);
    this.clock = 0;
    this.disarm();
    const wasOpen = this.key_ !== null;
    const opener = this.openedBy;
    this.openedBy = undefined;
    this.leaving_ = false;
    this.snoozing_ = false;
    this.key_ = null;
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog?.open) dialog.close();
    if (wasOpen) {
      this.card?.closed();
      if (opener?.isConnected) opener.focus();
    }
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('card') && this.renderRoot instanceof ShadowRoot)
      this.card?.adopt(this.renderRoot);
  }

  protected override updated(changed: PropertyValues): void {
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog && !dialog.open && this.key_ !== null && !this.leaving_) dialog.showModal();
    if (changed.has('key_') && this.key_ !== null && !this.docked)
      requestAnimationFrame(() =>
        this.renderRoot.querySelector<HTMLElement>('.fv-sheet__head button')?.focus(),
      );
    fitPills(this.renderRoot);
  }

  private onDialogClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return; // only the scrim closes
    if (performance.now() - this.openedAt >= GUARD_MS) this.close();
  }

  private disarm(): void {
    clearTimeout(this.armTimer);
    this.armTimer = 0;
    this.armed_ = '';
  }

  /** The sheet's content width (its 16 sides off), the design's 360 before it is laid out. */
  private get room(): number {
    const sheet = this.renderRoot.querySelector<HTMLElement>('.fv-sheet');
    const laid = sheet?.clientWidth ?? 0;
    return laid > 0 ? laid - 32 : 360;
  }

  private context(): LookContext {
    const context = this.card?.context();
    return { hass: this.hass, repairs: context?.repairs, now: context?.now ?? Date.now() };
  }

  /* ---------- what a tap does ---------- */

  /** Runs an action as the card would; one Home Assistant answers in a dialog of its own closes the sheet first. */
  private run(action: ActionConfig, entity?: string): void {
    if (opensDialog(action)) this.close();
    this.card?.run(action, entity);
  }

  /**
   * A button of the alert's: tapped once, one that asks first arms (it says to tap again, and the action's own words
   * where it has them); tapped again, or one that never asks, it runs on what the alert matches now — `row` being the
   * row's own.
   */
  private press(id: string, button: AlertButton, result: AlertResult, row?: string): void {
    const action = button.tap_action;
    if (asks(action, this.hass) && this.armed_ !== id) {
      this.disarm();
      this.armed_ = id;
      this.armTimer = window.setTimeout(() => this.disarm(), ARMED_MS);
      return;
    }
    this.disarm();
    const hass = this.hass;
    const matched = result.rows.map((one) => one.id).filter((one) => one in (hass?.states ?? {}));
    const bound = bindAction(action, { matched, ...(row ? { row } : {}) });
    if (!bound) return;
    // asked here already: Home Assistant does not ask again
    this.run({ ...bound, confirmation: false }, row ?? matched[0]);
  }

  /**
   * A row's tap and hold: its alert's row actions, else — for an administrator — the device's page on a hold, or on a
   * tap where the row is a device of several entities; else the entity's details.
   */
  private rowTap(result: AlertResult, group: RowGroup, hold: boolean): void {
    const { definition } = result;
    const own = hold ? definition.rowHoldAction : definition.rowAction;
    const page: AlertAction | undefined =
      this.hass?.user?.is_admin === true && group.device && (hold || group.rows.length > 1)
        ? { action: 'navigate', navigation_path: `/config/devices/device/${group.device}` }
        : undefined;
    const action: AlertAction | undefined =
      own ?? page ?? (group.lead.state ? { action: 'more-info' } : undefined);
    if (!action) return;
    const bound = bindAction(action, {
      matched: group.rows.map((row) => row.id),
      row: group.lead.id,
    });
    if (bound) this.run(bound, group.lead.state ? group.lead.id : undefined);
  }

  private async snooze(result: AlertResult, choice: SnoozeChoice): Promise<void> {
    const memory = this.card?.memory();
    if (!memory || !this.hass) return;
    try {
      await snoozeAlert(memory, this.hass, result, choice);
      this.close();
    } catch (error) {
      this.error_ =
        (error as { message?: string } | undefined)?.message ?? s(this.hass, 'not_saved');
    }
  }

  private async wake(key: string): Promise<void> {
    try {
      await this.card?.memory().wake(key);
    } catch (error) {
      this.error_ =
        (error as { message?: string } | undefined)?.message ?? s(this.hass, 'not_saved');
    }
  }

  /* ---------- render ---------- */

  /** A 36 pill in a 44 hit at a row's end: its own tap, raised over the row's. */
  private rowButton(text: string, onTap: () => void, armed = false): TemplateResult {
    return html`<button class="as-hit" data-target aria-label=${text} @click=${onTap}>
      <span class="fv-btn ${armed ? 'fv-btn--armed' : 'fv-btn--quiet'}" data-control data-fit="28"
        >${text}</span
      >
    </button>`;
  }

  /** A circle: a glyph in a tone, or in the alert's own colour. */
  private circle(glyph: string, tone: Tone, accent?: string): TemplateResult {
    return html`<span
      class="fv-ico fv-ico--${accent ? 'accent' : tone}"
      data-icon
      data-accent=${accent ?? nothing}
      >${icon(glyph)}</span
    >`;
  }

  private head(title: string, sub: string, lead: TemplateResult | typeof nothing): TemplateResult {
    const hass = this.hass;
    return html`<div class="fv-sheet__head">
      ${lead}
      <div class="fv-card__titles">
        <h2 class="fv-sheet__title" id="as-title" data-name>${title}</h2>
        ${sub ? html`<p class="fv-card__sub">${sub}</p>` : nothing}
      </div>
      ${round('close', 'quiet', localize(hass, 'keypad.close'), () => this.close())}
    </div>`;
  }

  /**
   * One row of an alert: its circle (the entity's glyph in the alert's tone, the dashed ring when it cannot be read),
   * its name over where it is and how long, its state in the tone's ink — or its button, the state then said first
   * under the name.
   */
  /**
   * An alert's rows, their circles kept while every name keeps its least beside its row's end (96, or the name itself
   * when shorter), else given to the names together, as every list does.
   */
  private renderRows(
    result: AlertResult,
    groups: readonly RowGroup[],
    tone: Tone,
  ): TemplateResult[] {
    const views = groups.map((group) => this.rowView(result, group));
    // the circles stay while every name keeps its least and what a row must say under it holds beside one
    const keep = views.every(
      ({ group, name, state, button, under, end }) =>
        this.room - CIRCLE - end >= Math.min(NAME_MIN, this.ruler.width('fv-row__title', name)) &&
        this.room - CIRCLE - end >=
          this.ruler.width(
            'fv-row__sub',
            (button || under) && state
              ? state
              : group.rows.length > 1
                ? plural(this.hass, 'alerts.entities', group.rows.length)
                : '',
          ),
    );
    return views.map((view) => this.renderRow(result, view, tone, keep));
  }

  /** What one row of an alert says and holds: its name, its state, its button, and the room its end takes. */
  private rowView(result: AlertResult, group: RowGroup): RowView {
    const context = this.context();
    const hass = this.hass;
    const lead = group.lead;
    const state = rowState(context, lead);
    // a row's button acts on one entity: a device of several has none
    const own = result.definition.rowButton;
    const button =
      own && hass && group.rows.length === 1 && offered(own, hass, lead.id) ? own : undefined;
    const id = `row:${group.id}`;
    const armed = this.armed_ === id;
    const words = !button
      ? ''
      : armed
        ? s(hass, 'confirm')
        : (button.name ?? (button.words ? localize(hass, button.words) : ''));
    const count = group.rows.length > 1 ? plural(hass, 'alerts.entities', group.rows.length) : '';
    // a state at the row's end that would leave the count under the name no room is said first under it instead
    const under = Boolean(
      !button &&
      state &&
      count &&
      this.ruler.width('fv-row__sub', count) >
        this.room - 12 - this.ruler.width('fv-row__value', state),
    );
    const value = button || under ? '' : state;
    const pill = button ? 12 + this.ruler.pill('fv-btn', words, BUTTON_SIDES) : 0;
    // the state under the name is never cut: where it would not hold beside the button's words, they give way to the
    // button's glyph (a 44 round, its words its label)
    const glyph = Boolean(
      button?.icon && state && this.ruler.width('fv-row__sub', state) > this.room - pill,
    );
    return {
      group,
      name: rowName(context, result, group),
      state,
      button,
      id,
      armed,
      words,
      glyph,
      under,
      value,
      end: (glyph ? 56 : pill) + (value ? 12 + this.ruler.width('fv-row__value', value) : 0),
    };
  }

  private renderRow(result: AlertResult, view: RowView, tone: Tone, keep: boolean): TemplateResult {
    const context = this.context();
    const hass = this.hass;
    const { group, name, state, button, id, armed, words, glyph, under, value, end } = view;
    const lead = group.lead;
    const dead = lead.state?.state === 'unavailable' || lead.state?.state === 'unknown';
    const area = rowArea(context, lead);
    const time = lasted(context, lead.since);
    // a source item's word is its own severity ("Warning" beside a critical repair): it is said in that severity's ink
    const valueTone = lead.severity ? SEVERITY_TONE[lead.severity] : tone;
    // under the name: the state where a button stands in its place, how many entities a device has, where, how long
    const sub = fitLine(
      [
        ...((button || under) && state ? [{ text: state }] : []),
        ...(group.rows.length > 1
          ? [{ text: plural(hass, 'alerts.entities', group.rows.length) }]
          : []),
        ...(area ? [{ text: area, optional: true }] : []),
        ...(time ? [{ text: s(hass, 'for', { time }), optional: true }] : []),
      ],
      this.room - (keep ? CIRCLE : 0) - end,
      (text) => this.ruler.width('fv-row__sub', text),
    );
    return html`<div class="fv-row fv-row--tap ${keep ? '' : 'fv-row--bare'}">
      ${keep ? this.circle(rowGlyph(context, result, lead), dead ? 'off' : tone) : nothing}
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${name}</span>${
          sub ? html`<span class="fv-row__sub">${sub}</span>` : nothing
        }</span
      >
      ${value ? html`<span class="fv-row__value as-value fv-tone--${valueTone}">${value}</span>` : nothing}
      ${pressCover(
        [name, sub || state].filter(Boolean).join(' · '),
        () => this.rowTap(result, group, false),
        () => this.rowTap(result, group, true),
      )}
      ${
        button && glyph
          ? html`<span class="as-hit"
              >${round(button.icon ?? 'dots', armed ? 'accent' : 'quiet', words, () =>
                this.press(id, button, result, lead.id),
              )}</span
            >`
          : button
            ? this.rowButton(words, () => this.press(id, button, result, lead.id), armed)
            : nothing
      }
    </div>`;
  }

  /** The alert's own buttons and Snooze: one width shared, two a row where every label holds half. */
  private renderFooter(result: AlertResult | undefined): TemplateResult {
    const hass = this.hass;
    const close = localize(hass, 'keypad.close');
    if (!result || !result.rows.length)
      return html`<div class="as-actions as-actions--one">
        <button class="fv-btn fv-btn--quiet" data-control data-target @click=${() => this.close()}>
          ${close}
        </button>
      </div>`;
    const memory = this.card?.memory();
    const snoozable = Boolean(memory?.writable && result.definition.snooze);
    const actions = result.definition.actions.filter((button) => hass && offered(button, hass));
    // Snooze first, then the alert's own (the first of them the accent): "Snooze · Lock all"; alone, beside Close
    const ordered: Array<{ text: string; accent: boolean; armed: boolean; tap: () => void }> = [
      ...(snoozable
        ? [
            {
              text: s(hass, 'snooze'),
              accent: false,
              armed: false,
              tap: () => {
                this.snoozing_ = true;
              },
            },
          ]
        : []),
      ...actions.map((button, i) => {
        const id = `action:${i}`;
        const armed = this.armed_ === id;
        return {
          text: armed
            ? s(hass, 'confirm')
            : (button.name ?? (button.words ? localize(hass, button.words) : '')),
          accent: i === 0,
          armed,
          tap: () => this.press(id, button, result),
        };
      }),
    ];
    if (ordered.length < 2)
      ordered.push({ text: close, accent: false, armed: false, tap: () => this.close() });
    // decided on every label the footer can say — an action's armed words too — so the first tap moves nothing
    const half = (this.room - 16) / 2 - 16;
    const labels = [
      ...ordered.map(({ text }) => text),
      ...(actions.some((button) => asks(button.tap_action, hass)) ? [s(hass, 'confirm')] : []),
    ];
    const one = labels.some((text) => this.ruler.width('fv-btn', text) > half);
    const armedNote = actions
      .map((button, i) => (this.armed_ === `action:${i}` ? confirmText(button.tap_action) : ''))
      .find(Boolean);
    return html`${armedNote ? html`<p class="as-note" role="status">${armedNote}</p>` : nothing}
      <div class="as-actions ${one ? 'as-actions--one' : ''}">
        ${ordered.map(
          ({ text, accent, armed, tap }, i) =>
            html`<button
              class="fv-btn ${armed ? 'fv-btn--armed' : accent ? 'fv-btn--accent' : 'fv-btn--quiet'} ${
                !one && i === ordered.length - 1 && ordered.length % 2 ? 'as-wide' : ''
              }"
              data-control
              data-target
              aria-live=${armed ? 'polite' : nothing}
              @click=${tap}
            >
              ${text}
            </button>`,
        )}
      </div>`;
  }

  /** How long a snooze lasts, the person's choice, as a filled row of chips. */
  private renderSnooze(result: AlertResult): TemplateResult {
    const hass = this.hass;
    // "until it changes" acknowledges each entity as it is: a source's items (a repair) have no state to wait on
    const choices = SNOOZE_CHOICES.filter(
      (choice) => choice !== 'changes' || result.rows.some((row) => row.state),
    );
    return html`<div class="as-snooze">
      ${label(s(hass, 'snooze_for'))}
      ${chipRow(
        choices.map((choice) => {
          const [key, values] = SNOOZE_WORDS[choice];
          return { key: choice, label: localize(hass, key, values) };
        }),
        (choice) => void this.snooze(result, choice as SnoozeChoice),
        'full',
        { ruler: this.ruler, width: this.room },
      )}
      <div class="as-actions as-actions--one">
        <button
          class="fv-btn fv-btn--quiet"
          data-control
          data-target
          @click=${() => {
            this.snoozing_ = false;
          }}
        >
          ${localize(hass, 'keypad.cancel')}
        </button>
      </div>
    </div>`;
  }

  private renderAlert(key: string): TemplateResult {
    const hass = this.hass;
    const context = this.context();
    const result = this.state?.alerts.find((alert) => alert.key === key);
    const look = result ? this.card?.look(result) : undefined;
    const clear = !result || !result.rows.length;
    const groups = result && !clear ? groupsOf(result) : [];
    const tone: Tone = look?.tone ?? 'neutral';
    const oldest = result?.oldest === undefined ? '' : lasted(context, result.oldest);
    const count = clear ? '' : countWords(context, result);
    // the alert's circle gives way where its count would not hold beside it (the round back to the overview never)
    const bare =
      !this.from_ && this.ruler.width('fv-card__sub', count) > this.room - CIRCLE - CIRCLE;
    const sub = clear
      ? s(hass, 'all_clear')
      : fitLine(
          [
            { text: count },
            ...(oldest
              ? [
                  {
                    text: s(hass, groups.length > 1 ? 'oldest' : 'for', { time: oldest }),
                    optional: true,
                  },
                ]
              : []),
          ],
          this.room - CIRCLE - (bare ? 0 : CIRCLE),
          (text) => this.ruler.width('fv-card__sub', text),
        );
    // opened from the overview, the head goes back to it; else it opens with the alert's circle
    const back = this.from_
      ? round('chevronLeft', 'quiet', s(hass, 'all_alerts'), () => {
          this.key_ = '';
          this.from_ = false;
          this.snoozing_ = false;
          this.disarm();
        })
      : clear
        ? this.circle('check', 'neutral')
        : bare
          ? nothing
          : this.circle(look?.glyph ?? 'bell', tone, look?.accent);
    return html`${this.head(look?.name ?? s(hass, 'all_clear'), sub, back)}
    ${
      clear
        ? html`<div class="as-empty">
            ${emptyState('check', s(hass, 'all_clear'), s(hass, 'nothing'))}
          </div>`
        : html`<div class="as-rows">${this.renderRows(result, groups, tone)}</div>`
    }
    ${result && !clear && this.snoozing_ ? this.renderSnooze(result) : nothing}
    ${this.error_ ? html`<p class="as-note" role="alert">${this.error_}</p>` : nothing}
    ${this.snoozing_ ? nothing : this.renderFooter(result)}`;
  }

  /** When a snooze ends: "18:00", or the day and time when it is not today ("Fri 08:00"). */
  private until(at: number): string {
    const hass = this.hass;
    const date = new Date(at);
    const now = new Date(this.context().now);
    const day = (d: Date): string => formatDate(hass, d, 'short');
    return day(date) === day(now)
      ? formatTime(hass, date)
      : `${formatDate(hass, date, 'weekday')} ${formatTime(hass, date)}`;
  }

  /**
   * The overview: every alert of the card — what needs a look (its count, a tap to its own sheet), what is snoozed
   * (until when, or until it changes, and Wake), and what is clear.
   */
  private renderOverview(): TemplateResult {
    const hass = this.hass;
    const context = this.context();
    const alerts = (this.state?.alerts ?? []).filter((alert) => alert.applies);
    const rows = alerts.map((result) => {
      const waiting = result.snoozedUntil !== undefined;
      const kind: 'snoozed' | 'clear' | 'shown' =
        waiting || (!result.rows.length && result.acknowledged.length > 0)
          ? 'snoozed'
          : result.shown
            ? 'shown'
            : 'clear';
      const value =
        kind === 'shown' ? String(result.count) : kind === 'clear' ? s(hass, 'clear') : '';
      const line =
        kind !== 'snoozed'
          ? ''
          : result.snoozedUntil !== undefined
            ? s(hass, 'snoozed_until', { time: this.until(result.snoozedUntil) })
            : s(hass, 'snoozed_changes');
      // a snoozed line that would take more than two lines beside Wake's words has them give way to its glyph
      const pill = 12 + this.ruler.pill('fv-btn', s(hass, 'wake'), BUTTON_SIDES);
      const glyph = this.ruler.width('fv-row__sub', line) > TWO_LINES * (this.room - pill);
      // the row's end: Wake (12 before its pill, or its round), its count and the chevron, or its quiet "Clear"
      const end =
        kind === 'snoozed'
          ? glyph
            ? 56
            : pill
          : 12 + this.ruler.width('fv-row__value', value) + (kind === 'shown' ? 12 + 44 : 0);
      return { result, look: this.card?.look(result), kind, value, line, glyph, end };
    });
    // the circles stay while every name keeps its least and every snoozed line holds beside one
    const keep = rows.every(
      ({ look, result, line, end }) =>
        this.room - CIRCLE - end >=
          Math.min(NAME_MIN, this.ruler.width('fv-row__title', look?.name ?? result.key)) &&
        this.room - CIRCLE - end >= this.ruler.width('fv-row__sub', line),
    );
    const shown = rows.filter(({ kind }) => kind === 'shown').length;
    const snoozed = rows.filter(({ kind }) => kind === 'snoozed').length;
    const sub = [
      shown ? plural(hass, 'alerts.need', shown) : s(hass, 'all_clear'),
      ...(snoozed ? [plural(hass, 'alerts.snoozed', snoozed)] : []),
    ].join(' · ');
    const bare = keep ? '' : 'fv-row--bare';
    return html`${this.head(this.card?.title() ?? s(hass, 'title'), sub, nothing)}
      <div class="as-rows">
        ${rows.map(({ result, look, kind, value, line: said, glyph, end }) => {
          const name = look?.name ?? result.key;
          const circle = (tone: Tone, accent?: string): TemplateResult | typeof nothing =>
            keep ? this.circle(look?.glyph ?? 'bell', tone, accent) : nothing;
          if (kind === 'snoozed')
            return html`<div class="fv-row ${bare}">
              ${circle('neutral')}
              <span class="fv-row__text"
                ><span class="fv-row__title" data-name>${name}</span
                ><span class="fv-row__sub">${said}</span></span
              >
              ${
                glyph
                  ? html`<span class="as-hit"
                      >${round('bell', 'quiet', s(hass, 'wake'), () => void this.wake(result.key))}</span
                    >`
                  : this.rowButton(s(hass, 'wake'), () => void this.wake(result.key))
              }
            </div>`;
          if (kind === 'clear')
            return html`<div class="fv-row ${bare}">
              ${circle('neutral')}
              <span class="fv-row__text"><span class="fv-row__title" data-name>${name}</span></span>
              <span class="fv-row__value fv-row__value--quiet">${value}</span>
            </div>`;
          // who is at fault: as many names as hold whole (the count is the row's value), else the first, ending in
          // its ellipsis; a split alert is its one entity, already its name
          const names = result.entity ? [] : culprits(context, result);
          const room = this.room - (keep ? CIRCLE : 0) - end;
          const line =
            names
              .map((_, i) => names.slice(0, names.length - i).join(', '))
              .find((text) => this.ruler.width('fv-row__sub', text) <= room) ??
            names[0] ??
            '';
          const open = (): void => {
            this.key_ = result.key;
            this.from_ = true;
          };
          const tone = look?.tone ?? 'neutral';
          return html`<div class="fv-row fv-row--tap ${bare}">
            ${circle(tone, look?.accent)}
            <span class="fv-row__text"
              ><span class="fv-row__title" data-name>${name}</span>${
                line ? html`<span class="fv-row__sub" data-name>${line}</span>` : nothing
              }</span
            >
            <span class="fv-row__value as-value fv-tone--${tone}">${value}</span>
            <span class="fv-row__chevron">${icon('chevron')}</span>
            ${pressCover(`${name} · ${countWords(context, result)}`, open, undefined)}
          </div>`;
        })}
      </div>
      ${this.error_ ? html`<p class="as-note" role="alert">${this.error_}</p>` : nothing}
      <div class="as-actions as-actions--one">
        <button class="fv-btn fv-btn--quiet" data-control data-target @click=${() => this.close()}>
          ${localize(hass, 'keypad.close')}
        </button>
      </div>`;
  }

  private renderSheet(key: string): TemplateResult {
    return html`<div class="fv-sheet as-sheet" data-card>
      <div class="fv-sheet__grabber"><span></span></div>
      ${key ? this.renderAlert(key) : this.renderOverview()}
    </div>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const key = this.key_;
    if (key === null) return nothing;
    if (this.docked) return this.renderSheet(key);
    return html`<dialog
      class=${this.leaving_ ? 'is-leaving' : ''}
      aria-labelledby="as-title"
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.close();
      }}
      @close=${() => this.finishClose()}
      @click=${(event: MouseEvent) => this.onDialogClick(event)}
      @keydown=${keepEscape}
      @touchstart=${keepTouch}
    >
      ${this.renderSheet(key)}
    </dialog>`;
  }
}

if (!customElements.get('fluvy-alerts-sheet'))
  customElements.define('fluvy-alerts-sheet', FluvyAlertsSheet);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-alerts-sheet': FluvyAlertsSheet;
  }
}
