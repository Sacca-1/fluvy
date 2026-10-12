import {
  formatNumber,
  haptic,
  localize,
  navigate,
  resolveEntity,
  strings,
  type HomeAssistant,
} from '@fluvy/core';
import {
  baseStyles,
  fitPills,
  label,
  listRow,
  options,
  round,
  sheetStyles,
  stepper,
  toggle,
  type OptionItem,
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
import { keyed } from 'lit/directives/keyed.js';
import { field } from '../../helpers/context.js';
import { textField } from '../../helpers/text.js';
import { chipRow, type ChipFit } from '../../shared/chips.js';
import { TextRuler } from '../../shared/fit.js';
import { FontsSettled } from '../../shared/fonts.js';
import { optionCell, optionColumnsFor, optionsHold } from '../../shared/options.js';
import { daysShort, daysText, lastText, spanText, suggestAlias } from '../format.js';
import {
  checkSchedule,
  domainsOf,
  newScheduleId,
  OPPOSITE,
  sanitiseAlias,
  VERB_ORDER,
  VERBS,
  verbsFor,
  WEEKDAYS,
  WORKDAYS,
  type Days,
  type Doing,
  type Moment,
  type RunEnv,
  type Schedule,
  type Verb,
  type Weekday,
} from '../schedule.js';
import { apiMessage } from '../store.js';
import { dayChips } from './day-chips.js';
import { heldValue, pairWidth } from './fit.js';
import {
  clockOf,
  minutesOf,
  modeChips,
  momentOf,
  OFFSET_LIMIT,
  sunOffsetLine,
  timeField,
  type MomentMode,
} from './moments.js';
import { candidateRows, chosenChips, findCandidates, searchField } from './targets.js';

const s = strings('automations');

/** What the sheet edits: a schedule (an existing one, or none for a new one) and what the house offers it. */
export interface ScheduleRequest {
  readonly schedule?: Schedule;
  /** What a schedule may target. */
  readonly domains: readonly string[];
  /** The candidates are this area's alone. */
  readonly area?: string;
  /** The house's workday sensor, for the Workdays tile's second line (the data layer writes it). */
  readonly workday?: string;
  /** Minutes the time field's arrows and the sun offset's stepper move by. */
  readonly timeStep: number;
  /** The sun's next events, for "Sunset −30 min · Today 19:11". */
  readonly sun?: RunEnv['sun'];
  /** An existing schedule's automation entity: its switch in the head reads the live state. */
  readonly entity?: string;
  toggle?(on: boolean): void;
  /** Writes the schedule; rejects with what Home Assistant said when it refused it. */
  save(schedule: Schedule): Promise<void>;
  /** Deletes the schedule (an existing one). */
  remove?(): Promise<void>;
}

/** An automation that is not a Fluvy schedule: what the sheet says and does about it. */
export interface DetailsRequest {
  readonly entity: string;
  readonly alias: string;
  /** The config's id, for Home Assistant's editor and its traces; a YAML automation has none. */
  readonly configId?: string;
  run(): void;
  toggle(on: boolean): void;
}

export type SheetRequest = ScheduleRequest | DetailsRequest;

const isDetails = (request: SheetRequest): request is DetailsRequest => 'run' in request;

/** The schedule as the sheet holds it while it is edited. */
interface Draft {
  readonly targets: readonly string[];
  readonly verb: Verb | undefined;
  /** A light's brightness for `on`; undefined: as it is. */
  readonly level: number | undefined;
  /** A thermostat's target for `on`; undefined: as it is. */
  readonly temperature: number | undefined;
  readonly days: Days;
  /** The last list of days chosen by hand, kept while another kind is tried. */
  readonly custom: readonly Weekday[];
  readonly start: Moment;
  readonly hasEnd: boolean;
  readonly end: Moment;
  /** What the end does; undefined: the opposite of the start. */
  readonly after: Verb | undefined;
  /** The name typed; '' while the sheet suggests one. */
  readonly alias: string;
  readonly query: string;
}

/** A press this soon after opening is the tail of the tap that opened the sheet, not a decision. */
const GUARD_MS = 350;
const LEAVE_MS = 200;
/** How long the Delete link stays armed before it forgets the first tap. */
const ARM_MS = 4000;
/** How long Run reads "Done" after a press. */
const DONE_MS = 1200;
/** How long a switch in the head shows the state asked for, before the report wins. */
const PENDING_MS = 3000;
/** Brightness moves in fives; 0 reads "As it is". */
const LEVEL_STEP = 5;

const EMPTY: Draft = {
  targets: [],
  verb: undefined,
  level: undefined,
  temperature: undefined,
  days: { kind: 'every' },
  custom: WORKDAYS,
  start: { kind: 'time', at: '08:00' },
  hasEnd: false,
  end: { kind: 'time', at: '09:00' },
  after: undefined,
  alias: '',
  query: '',
};

/** The end a window starts with: an hour after a clock start (within the day), the sun's other event after a sun start. */
function endAfter(start: Moment): Moment {
  if (start.kind === 'time') return { kind: 'time', at: clockOf(minutesOf(start.at) + 60) };
  return { kind: 'sun', event: start.event === 'sunrise' ? 'sunset' : 'sunrise', offset: 0 };
}

/** A new schedule's draft: nothing chosen, every day, the next whole hour on the clock. */
function freshDraft(now: Date): Draft {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start: Moment = {
    kind: 'time',
    at: clockOf(Math.min(23 * 60, Math.ceil((minutes + 1) / 60) * 60)),
  };
  return { ...EMPTY, start, end: endAfter(start) };
}

/** An existing schedule as a draft. */
function draftOf(schedule: Schedule): Draft {
  return {
    targets: schedule.targets,
    verb: schedule.then.verb,
    level: schedule.then.level,
    temperature: schedule.then.temperature,
    days: schedule.days,
    custom: schedule.days.kind === 'custom' ? schedule.days.days : WORKDAYS,
    start: schedule.start,
    hasEnd: schedule.end !== undefined,
    end: schedule.end ?? endAfter(schedule.start),
    after: schedule.after?.verb,
    alias: schedule.alias,
    query: '',
  };
}

const VERB_GLYPH: Readonly<Record<Verb, 'power' | 'up' | 'down' | 'play'>> = {
  on: 'power',
  off: 'power',
  open: 'up',
  close: 'down',
  run: 'play',
};

const DAY_KINDS = ['every', 'workdays', 'weekend', 'custom'] as const;
type DayKind = (typeof DAY_KINDS)[number];
const DAY_GLYPH: Readonly<Record<DayKind, 'calendar' | 'check' | 'sun' | 'sliders'>> = {
  every: 'calendar',
  workdays: 'check',
  weekend: 'sun',
  custom: 'sliders',
};
const DAY_WORD: Readonly<Record<DayKind, 'every_day' | 'workdays' | 'weekend' | 'custom'>> = {
  every: 'every_day',
  workdays: 'workdays',
  weekend: 'weekend',
  custom: 'custom',
};

/** The verbs any of those domains has, in the sheet's order: what the Do tiles show before a target is chosen. */
const verbsOffered = (domains: readonly string[]): readonly Verb[] =>
  VERB_ORDER.filter((verb) => domains.some((domain) => VERBS[domain]?.[verb]));

/**
 * The schedule sheet: a modal bottom sheet (as the keypad is) that edits a schedule — What (the targets, searched),
 * Do (the verb and its level), When (the days, the start, an end), Name — and saves it as a native automation
 * through the card; or, for an automation that is not a schedule, its details: the switch, Run, Home Assistant's
 * editor and its traces. Fetched the first time a card opens it. `docked` draws it in the flow (the playground).
 */
export class FluvyScheduleSheet extends LitElement {
  static override styles: CSSResultGroup = [
    ...baseStyles,
    sheetStyles.devices,
    sheetStyles.inputs,
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
      @keyframes ss-up {
        from {
          transform: translateY(100%);
        }
        to {
          transform: none;
        }
      }
      @keyframes ss-down {
        to {
          transform: translateY(100%);
        }
      }
      @keyframes ss-out {
        to {
          opacity: 0;
        }
      }
      /* the sheet scrolls inside the dialog, which is the viewport: the footer ends the content, nothing sticky */
      dialog .fv-sheet {
        max-width: 392px;
        max-height: 100%;
        overflow-y: auto;
        touch-action: pan-y;
        overscroll-behavior: contain;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
        animation: ss-up 320ms var(--fv-ease-out) both;
      }
      dialog.is-leaving {
        animation: ss-out 200ms var(--fv-ease) both;
      }
      dialog.is-leaving .fv-sheet {
        animation: ss-down 200ms var(--fv-ease) both;
      }
      .fv-sheet {
        position: relative;
        width: 100%;
      }
      /* a title of words ("New schedule") takes a second line in a narrow sheet and the head grows; a title that is a
         name (an automation's) ends in an ellipsis, as names do */
      .fv-sheet__head {
        height: auto;
        min-height: 44px;
      }
      .fv-sheet__title {
        overflow-wrap: anywhere;
      }
      .fv-sheet__title[data-name] {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      /* a field whose title would not hold beside its control puts the control on a line of its own */
      .ss-field--stack .in-field {
        flex-wrap: wrap;
        height: auto;
        row-gap: 8px;
      }
      .ss-field--stack .in-field__text {
        flex: 1 0 100%;
      }
      .ss-field--stack .in-field > :not(.in-field__text) {
        margin-left: auto;
      }
      /* sections 24 apart, a label 8 above its control; blocks within a section 16 apart */
      .ss-section {
        margin-top: 24px;
      }
      .ss-block {
        margin-top: 16px;
      }
      .ss-section > .fv-label,
      .ss-block > .fv-label {
        margin: 0 0 8px;
      }
      .ss-section > .fv-label + .fv-options,
      .ss-section > .fv-label + .fv-chips,
      .ss-block > .fv-label + .fv-chips,
      .ss-block > .fv-label + .fv-options,
      .ss-section > .fv-label + .in-text {
        margin-top: 0;
      }
      /* a field 8 under the chips that choose its kind */
      .ss-block > .fv-chips + .ss-time,
      .ss-block > .fv-chips + .in-field {
        margin-top: 8px;
      }
      /* the targets chosen: content-sized chips that wrap */
      .ss-chosen {
        flex-wrap: wrap;
        height: auto;
        row-gap: 8px;
      }
      .ss-chosen .fv-chip__pill {
        padding: 0 10px 0 14px;
      }
      .ss-chosen .fv-chip__pill svg {
        width: 16px;
        height: 16px;
      }
      .ss-candidates {
        margin-top: 4px;
      }
      .ss-group {
        margin: 12px 0 0;
      }
      .ss-more {
        height: 20px;
        margin: 8px 0 0;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
      }
      /* a tile's value is one line, measured and dropped where it would not hold: every row of tiles stays 84 */
      .ss-do .fv-option__value,
      .ss-when .fv-option__value {
        white-space: nowrap;
      }
      /* a section with nothing to act on yet (no target) waits, dimmed */
      .ss-dim {
        opacity: 0.4;
        pointer-events: none;
      }
      .ss-links {
        margin-top: 16px;
      }
      /* a link's words are an action's, never cut: a row too narrow for them beside its circle gives the circle's
         room to them, and narrower still they take a second line and the row grows */
      .ss-links .fv-row {
        height: auto;
        min-height: 60px;
        padding: 8px 0;
      }
      .ss-links .fv-row__title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .ss-footer {
        margin-top: 24px;
      }
      /* delete: a full-width link in the danger ink; armed, it says so on a wash of the same */
      .ss-delete {
        width: 100%;
        color: var(--fluvy-danger);
      }
      .ss-delete.is-armed {
        background: color-mix(in srgb, var(--fluvy-danger) 16%, var(--fluvy-page));
      }
      .ss-delete + .dv-actions {
        margin-top: 16px;
      }
      .dv-actions {
        grid-template-columns: repeat(2, minmax(0, var(--ss-pair, 172px)));
      }
      .dv-actions--stacked {
        grid-template-columns: minmax(0, var(--ss-pair, 172px));
      }
      .dv-actions .fv-btn {
        width: 100%;
        min-width: 0;
        padding: 0 8px;
        white-space: nowrap;
      }
      .ss-error {
        margin: 12px 0 0;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        text-align: center;
        color: var(--fluvy-danger);
      }
      .ss-swap {
        display: inline-block;
      }
      .is-busy .ss-body,
      .is-busy .ss-delete {
        opacity: 0.4;
        pointer-events: none;
      }
    `,
  ];

  static override properties = {
    hass: { attribute: false },
    docked: { type: Boolean, reflect: true },
    request_: { state: true },
    draft_: { state: true },
    busy_: { state: true },
    error_: { state: true },
    armed_: { state: true },
    leaving_: { state: true },
    done_: { state: true },
    nameFocused_: { state: true },
    pendingOn_: { state: true },
  };

  declare hass?: HomeAssistant;
  /** Draws the sheet in the flow instead of in a modal dialog (the playground). */
  declare docked: boolean;
  declare request_: SheetRequest | null;
  declare draft_: Draft;
  declare busy_: boolean;
  declare error_: string;
  /** Delete has been tapped once: the next tap deletes. */
  declare armed_: boolean;
  declare leaving_: boolean;
  /** Run has just been pressed: its label reads "Done" for a beat. */
  declare done_: boolean;
  declare nameFocused_: boolean;
  /** The state the head's switch was just asked for, until the entity reports it. */
  declare pendingOn_: boolean | undefined;

  /** Widths laid out by the browser in the sheet's own classes: the chips' columns, the tiles' hold. */
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);
  private openedBy: HTMLElement | undefined;
  private openedAt = 0;
  private leaveTimer = 0;
  private armTimer = 0;
  private doneTimer = 0;
  private pendingTimer = 0;
  /** The id a new schedule is written under, drawn once per opening so a retry writes the same one. */
  private newId: string | undefined;

  constructor() {
    super();
    this.docked = false;
    this.request_ = null;
    this.draft_ = EMPTY;
    this.busy_ = false;
    this.error_ = '';
    this.armed_ = false;
    this.leaving_ = false;
    this.done_ = false;
    this.nameFocused_ = false;
    this.pendingOn_ = undefined;
    new FontsSettled(this, () => {
      this.ruler.clear();
      // a chip fitted before the face landed (a chosen target's name) is fitted again, whatever its text
      fitPills(this.renderRoot, true);
      this.requestUpdate();
    });
  }

  get isOpen(): boolean {
    return this.request_ !== null && !this.leaving_;
  }

  /** Opens the sheet on a schedule (an existing one, or none) or an automation's details; `openedBy` gets the focus back. */
  open(request: SheetRequest, openedBy?: HTMLElement): void {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    this.openedBy = openedBy;
    this.newId = undefined;
    this.request_ = request;
    this.draft_ = isDetails(request)
      ? EMPTY
      : request.schedule
        ? draftOf(request.schedule)
        : freshDraft(new Date());
    this.busy_ = false;
    this.error_ = '';
    this.disarm();
    this.leaving_ = false;
    this.done_ = false;
    this.nameFocused_ = false;
    this.settlePending(undefined);
    this.openedAt = performance.now();
  }

  /** Leaves; safe to call at any time. */
  close(): void {
    this.disarm();
    if (!this.request_ || this.leaving_) return;
    if (this.docked) {
      this.busy_ = false;
      this.error_ = '';
      return;
    }
    this.leaving_ = true;
    this.leaveTimer = window.setTimeout(() => this.finishClose(), LEAVE_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.finishClose();
    clearTimeout(this.doneTimer);
    this.doneTimer = 0;
  }

  /** The end of every way out: no request, no dialog, the focus back where it came from. */
  private finishClose(): void {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    this.disarm();
    this.settlePending(undefined);
    const wasOpen = this.request_ !== null;
    // the dialog's own close event lands here again: what opened the sheet is taken first, and handed the focus last
    const opener = this.openedBy;
    this.openedBy = undefined;
    this.leaving_ = false;
    this.busy_ = false;
    this.request_ = null;
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog?.open) dialog.close();
    if (wasOpen && opener?.isConnected) opener.focus();
  }

  protected override updated(changed: PropertyValues): void {
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog && !dialog.open && this.request_ && !this.leaving_) dialog.showModal();
    if (changed.has('request_') && this.request_) requestAnimationFrame(() => this.focusFirst());
    this.fitPair();
    fitPills(this.renderRoot);
  }

  protected override willUpdate(changed: PropertyValues): void {
    // the entity reported the state the switch asked for: the report takes over
    if (changed.has('hass') && this.pendingOn_ !== undefined && this.liveOn() === this.pendingOn_)
      this.settlePending(undefined);
  }

  /** The focus on opening: the search for a new schedule, the first verb tile for an existing one, Run for details. */
  private focusFirst(): void {
    const request = this.request_;
    if (!request || this.docked) return;
    const root = this.renderRoot;
    const target = isDetails(request)
      ? root.querySelector<HTMLElement>('.dv-actions .fv-btn--accent')
      : request.schedule
        ? root.querySelector<HTMLElement>('.ss-do .fv-option, .ss-do .fv-chip')
        : root.querySelector<HTMLElement>('.ss-search input');
    target?.focus();
  }

  /**
   * The pair shares one width (`pairWidth`): the design's 172 where the row holds two of them and the 16 between,
   * else the row's equal share while the longer label holds it, else the label's own and the two stacked. The
   * labels are measured laid out, at their natural width, and the row as it is now.
   */
  private fitPair(): void {
    const row = this.renderRoot.querySelector<HTMLElement>('.dv-actions');
    if (!row) return;
    let natural = 0;
    for (const button of row.querySelectorAll<HTMLElement>('.fv-btn')) {
      const previous = button.style.width;
      button.style.width = 'max-content';
      natural = Math.max(natural, button.offsetWidth + 16);
      button.style.width = previous;
    }
    const { pair, stacked } = pairWidth(natural, row.clientWidth);
    row.style.setProperty('--ss-pair', `${pair}px`);
    row.classList.toggle('dv-actions--stacked', stacked);
  }

  /** A tile's value where it holds a cell of `cell` px, its shorter form where that holds, else nothing. */
  private held(full: string, short: string, cell: number): string {
    return heldValue(
      full,
      short,
      (text) => this.ruler.width('fv-option > fv-option__value', text) <= cell,
    );
  }

  /** The sheet's content width (its 16 sides off), the design's 360 before it is laid out. */
  private get fit(): ChipFit {
    const sheet = this.renderRoot.querySelector<HTMLElement>('.fv-sheet');
    const laid = sheet?.clientWidth ?? 0;
    return { ruler: this.ruler, width: laid > 0 ? laid - 32 : 360 };
  }

  /**
   * A field (a title, a line under it, a control at the end) that stacks its control under the title where the two
   * would not share the line (`control`: the control's width — a stepper's 96, a switch's 56).
   */
  private fieldRow(
    title: string,
    line: string,
    control: TemplateResult,
    width: number,
  ): TemplateResult {
    const stack = this.ruler.width('fv-row__title', title) > this.fit.width - width - 12;
    return html`<div class="ss-field ${stack ? 'ss-field--stack' : ''}">
      ${field(title, line, control, false)}
    </div>`;
  }

  /* ---------- the head's switch ---------- */

  private liveOn(): boolean {
    const request = this.request_;
    const entity = request && (isDetails(request) ? request.entity : request.entity);
    return entity ? this.hass?.states[entity]?.state === 'on' : false;
  }

  private settlePending(on: boolean | undefined): void {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = 0;
    this.pendingOn_ = on;
    if (on !== undefined)
      this.pendingTimer = window.setTimeout(() => {
        this.pendingOn_ = undefined;
      }, PENDING_MS);
  }

  private flip(next: boolean): void {
    const request = this.request_;
    if (!request) return;
    const toggleIt = isDetails(request)
      ? request.toggle.bind(request)
      : request.toggle?.bind(request);
    if (!toggleIt) return;
    this.settlePending(next);
    toggleIt(next);
  }

  /* ---------- the draft ---------- */

  private patch(part: Partial<Draft>): void {
    this.draft_ = { ...this.draft_, ...part };
    this.error_ = '';
  }

  private get request(): ScheduleRequest | undefined {
    return this.request_ && !isDetails(this.request_) ? this.request_ : undefined;
  }

  /** The verbs the targets allow, or the ones the house's domains offer while nothing is chosen. */
  private verbs(): readonly Verb[] {
    const request = this.request;
    if (!request) return [];
    const draft = this.draft_;
    return draft.targets.length
      ? verbsFor(domainsOf(draft.targets))
      : verbsOffered(request.domains);
  }

  private suggestion(draft: Draft): string {
    const names = draft.targets.map((id) => resolveEntity(this.hass, id).name);
    return suggestAlias(
      this.hass,
      names,
      draft.days,
      draft.start,
      draft.hasEnd && draft.verb !== 'run' ? draft.end : undefined,
    );
  }

  /** The schedule the draft makes, whole; nothing while something is missing or wrong (Save stays disabled). */
  private schedule(draft: Draft): Schedule | undefined {
    const request = this.request;
    if (!request || !draft.verb || !draft.targets.length) return undefined;
    const domains = domainsOf(draft.targets);
    const then: Doing = { verb: draft.verb };
    if (draft.verb === 'on' && domains.includes('light') && draft.level !== undefined)
      then.level = draft.level;
    if (draft.verb === 'on' && domains.includes('climate') && draft.temperature !== undefined)
      then.temperature = draft.temperature;
    const windowed = draft.hasEnd && draft.verb !== 'run';
    const after = draft.after && draft.after !== OPPOSITE[draft.verb] ? draft.after : undefined;
    const typed = sanitiseAlias(draft.alias);
    const schedule: Schedule = {
      id: request.schedule?.id ?? (this.newId ??= newScheduleId()),
      alias: typed || this.suggestion(draft),
      ...(request.schedule?.description ? { description: request.schedule.description } : {}),
      targets: draft.targets,
      days: draft.days,
      start: draft.start,
      ...(windowed ? { end: draft.end, ...(after ? { after: { verb: after } } : {}) } : {}),
      then,
    };
    return checkSchedule(schedule) ? undefined : schedule;
  }

  private pick(id: string): void {
    haptic(this, 'selection');
    const targets = [...this.draft_.targets, id];
    const verbs = verbsFor(domainsOf(targets));
    const verb =
      this.draft_.verb && verbs.includes(this.draft_.verb) ? this.draft_.verb : undefined;
    this.patch({ targets, verb, after: undefined, query: '' });
  }

  private drop(id: string): void {
    haptic(this, 'light');
    const targets = this.draft_.targets.filter((target) => target !== id);
    const verbs = verbsFor(domainsOf(targets));
    const verb =
      this.draft_.verb && verbs.includes(this.draft_.verb) ? this.draft_.verb : undefined;
    this.patch({ targets, verb, after: undefined });
  }

  private chooseVerb(verb: Verb): void {
    haptic(this, 'selection');
    this.patch({ verb, after: undefined });
  }

  private stepLevel(direction: 1 | -1): void {
    const level = Math.min(100, Math.max(0, (this.draft_.level ?? 0) + direction * LEVEL_STEP));
    this.patch({ level: level === 0 ? undefined : level });
  }

  private get fahrenheit(): boolean {
    return this.hass?.config?.unit_system?.temperature === '°F';
  }

  private stepTemperature(direction: 1 | -1): void {
    const [min, max, step, start] = this.fahrenheit ? [41, 95, 1, 70] : [5, 35, 0.5, 21];
    const current = this.draft_.temperature;
    const next = current === undefined ? start : Math.round((current + direction * step) * 10) / 10;
    this.patch({ temperature: next < min ? undefined : Math.min(max, next) });
  }

  private chooseDays(kind: DayKind): void {
    haptic(this, 'selection');
    const custom = this.draft_.custom;
    const days: Days =
      kind === 'every' ? { kind } : kind === 'custom' ? { kind, days: custom } : { kind };
    this.patch({ days });
  }

  private toggleDay(day: Weekday): void {
    haptic(this, 'selection');
    const chosen = this.draft_.days.kind === 'custom' ? this.draft_.days.days : this.draft_.custom;
    const next = chosen.includes(day)
      ? chosen.filter((other) => other !== day)
      : WEEKDAYS.filter((other) => other === day || chosen.includes(other));
    this.patch({ custom: next, days: { kind: 'custom', days: next } });
  }

  private setMode(which: 'start' | 'end', mode: MomentMode): void {
    haptic(this, 'selection');
    const previous = which === 'start' ? this.draft_.start : this.draft_.end;
    const start = this.draft_.start;
    const at =
      which === 'start' || start.kind !== 'time' ? '08:00' : clockOf(minutesOf(start.at) + 60);
    this.patch({ [which]: momentOf(mode, previous, at) });
  }

  private stepOffset(which: 'start' | 'end', direction: 1 | -1): void {
    const moment = which === 'start' ? this.draft_.start : this.draft_.end;
    if (moment.kind !== 'sun') return;
    const step = this.request?.timeStep ?? 5;
    const offset = Math.max(
      -OFFSET_LIMIT,
      Math.min(OFFSET_LIMIT, moment.offset + direction * step),
    );
    this.patch({ [which]: { ...moment, offset } });
  }

  private setEnd(on: boolean): void {
    haptic(this, 'selection');
    this.patch({ hasEnd: on });
  }

  /* ---------- saving, deleting, running ---------- */

  private async save(): Promise<void> {
    const request = this.request;
    const schedule = this.schedule(this.draft_);
    if (!request || !schedule || this.busy_ || this.leaving_) return;
    if (performance.now() - this.openedAt < GUARD_MS) return;
    this.busy_ = true;
    this.error_ = '';
    try {
      await request.save(schedule);
    } catch (error) {
      if (this.request_ !== request) return; // closed while Home Assistant was answering
      this.busy_ = false;
      this.error_ = apiMessage(error) || s(this.hass, 'failed');
      haptic(this, 'failure');
      return;
    }
    if (this.request_ !== request) return;
    this.busy_ = false;
    haptic(this, 'success');
    this.close();
  }

  private disarm(): void {
    clearTimeout(this.armTimer);
    this.armTimer = 0;
    if (this.armed_) this.armed_ = false;
  }

  /** Delete arms on the first tap and deletes on the second within four seconds. */
  private async deleteSchedule(): Promise<void> {
    const request = this.request;
    if (!request?.remove || this.busy_ || this.leaving_) return;
    if (!this.armed_) {
      haptic(this, 'light');
      this.armed_ = true;
      this.armTimer = window.setTimeout(() => this.disarm(), ARM_MS);
      return;
    }
    this.disarm();
    this.busy_ = true;
    this.error_ = '';
    try {
      await request.remove();
    } catch (error) {
      if (this.request_ !== request) return;
      this.busy_ = false;
      this.error_ = apiMessage(error) || s(this.hass, 'failed');
      haptic(this, 'failure');
      return;
    }
    if (this.request_ !== request) return;
    this.busy_ = false;
    haptic(this, 'success');
    this.close();
  }

  private run(): void {
    const request = this.request_;
    if (!request || !isDetails(request) || this.done_) return; // a second tap inside the beat is the same gesture
    if (performance.now() - this.openedAt < GUARD_MS) return;
    haptic(this, 'light');
    request.run();
    this.done_ = true;
    clearTimeout(this.doneTimer);
    this.doneTimer = window.setTimeout(() => {
      this.doneTimer = 0;
      this.done_ = false;
    }, DONE_MS);
  }

  private go(path: string): void {
    navigate(path);
    this.close();
  }

  private onDialogClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return; // only the scrim closes
    if (performance.now() - this.openedAt >= GUARD_MS) this.close();
  }

  /* ---------- render: the editor ---------- */

  private section(
    word: string,
    body: TemplateResult | typeof nothing,
    className = '',
  ): TemplateResult {
    return html`<section class="ss-section ${className}">${label(word)}${body}</section>`;
  }

  private renderWhat(request: ScheduleRequest, draft: Draft): TemplateResult {
    const hass = this.hass;
    const candidates = hass
      ? findCandidates(hass, request.domains, request.area, draft.query, draft.targets)
      : { groups: [], more: 0 };
    return this.section(
      s(hass, 'what'),
      html`${searchField({
        value: draft.query,
        label: s(hass, 'search'),
        onInput: (query) => this.patch({ query }),
      })}
      ${chosenChips(hass, draft.targets, (id) => this.drop(id))}
      ${candidateRows(hass, candidates, (id) => this.pick(id))}`,
      'ss-what',
    );
  }

  private renderDo(draft: Draft): TemplateResult {
    const hass = this.hass;
    const verbs = this.verbs();
    const domains = domainsOf(draft.targets);
    const fit = this.fit;
    const unit = this.fahrenheit ? '°F' : '°C';
    const levelText =
      draft.level === undefined
        ? s(hass, 'as_is')
        : `${formatNumber(hass, draft.level, { digits: 0 })} %`;
    const temperatureText =
      draft.temperature === undefined
        ? s(hass, 'as_is')
        : `${formatNumber(hass, draft.temperature, { digits: 1 })} ${unit}`;
    const value = (verb: Verb): string => {
      if (verb !== draft.verb || verb !== 'on') return '';
      if (domains.includes('light') && draft.level !== undefined) return levelText;
      if (domains.includes('climate') && draft.temperature !== undefined) return temperatureText;
      return '';
    };
    const labels = verbs.map((verb) => s(hass, `verb_${verb}`));
    const measureLabel = (text: string): number =>
      this.ruler.width('fv-option > fv-option__label', text);
    const cell = optionCell(fit.width, 4, optionColumnsFor(labels, fit.width, 4, measureLabel));
    const items: OptionItem[] = verbs.map((verb, index) => ({
      key: verb,
      label: labels[index] ?? '',
      glyph: VERB_GLYPH[verb],
      value: this.held(value(verb), '', cell),
      active: verb === draft.verb,
    }));
    const hold = optionsHold(labels, fit.width, 4, measureLabel);
    const tiles = hold
      ? options(items, (key) => this.chooseVerb(key as Verb), 4)
      : chipRow(
          items.map((item) => ({ key: item.key, label: item.label, active: item.active ?? false })),
          (key) => this.chooseVerb(key as Verb),
          'full',
          fit,
        );
    const light = draft.verb === 'on' && domains.includes('light');
    const climate = draft.verb === 'on' && domains.includes('climate');
    return this.section(
      s(hass, 'do'),
      html`${tiles}
      ${
        light
          ? this.fieldRow(
              localize(hass, 'light.brightness'),
              levelText,
              stepper((direction) => this.stepLevel(direction), {
                decrease: localize(hass, 'common.decrease'),
                increase: localize(hass, 'common.increase'),
              }),
              96,
            )
          : nothing
      }
      ${
        climate
          ? this.fieldRow(
              localize(hass, 'climate.target'),
              temperatureText,
              stepper((direction) => this.stepTemperature(direction), {
                decrease: localize(hass, 'common.decrease'),
                increase: localize(hass, 'common.increase'),
              }),
              96,
            )
          : nothing
      }`,
      `ss-do ${draft.targets.length ? '' : 'ss-dim'}`,
    );
  }

  private renderMoment(
    which: 'start' | 'end',
    moment: Moment,
    request: ScheduleRequest,
    word: string,
  ): TemplateResult {
    const hass = this.hass;
    const fit = this.fit;
    return html`<div class="ss-block ss-${which}">
      ${label(word)} ${modeChips(hass, moment, (mode) => this.setMode(which, mode), fit)}
      ${
        moment.kind === 'time'
          ? timeField(hass, moment.at, request.timeStep, word, (at) =>
              this.patch({ [which]: { kind: 'time', at } }),
            )
          : this.fieldRow(
              s(hass, 'offset'),
              sunOffsetLine(hass, moment, request.sun, new Date()),
              stepper((direction) => this.stepOffset(which, direction), {
                decrease: localize(hass, 'common.decrease'),
                increase: localize(hass, 'common.increase'),
              }),
              96,
            )
      }
    </div>`;
  }

  private renderWhen(request: ScheduleRequest, draft: Draft): TemplateResult {
    const hass = this.hass;
    const fit = this.fit;
    const kind = draft.days.kind;
    // two tiles a row: a value holds its cell whole or takes its shorter word, else goes (never wrapped)
    const cell = optionCell(fit.width, 4, 2);
    const workdaysSub = request.workday
      ? this.held(s(hass, 'workday_sensor'), s(hass, 'sensor'), cell)
      : this.held(s(hass, 'weekdays_only'), '', cell);
    const customSub =
      kind === 'custom'
        ? this.held(daysText(hass, draft.days), daysShort(hass, draft.days), cell)
        : '';
    const items: OptionItem[] = DAY_KINDS.map((each) => ({
      key: each,
      label: s(hass, DAY_WORD[each]),
      glyph: DAY_GLYPH[each],
      value: each === 'workdays' ? workdaysSub : each === 'custom' ? customSub : '',
      active: each === kind,
    }));
    const hold = optionsHold(
      items.map((item) => item.label),
      fit.width,
      4,
      (text) => this.ruler.width('fv-option > fv-option__label', text),
    );
    const tiles = hold
      ? options(items, (key) => this.chooseDays(key as DayKind), 4, 84, 2)
      : chipRow(
          items.map((item) => ({ key: item.key, label: item.label, active: item.active ?? false })),
          (key) => this.chooseDays(key as DayKind),
          'full',
          fit,
        );
    const verbs = this.verbs();
    const windowed = draft.verb !== 'run';
    const chosenAfter = draft.after ?? (draft.verb ? OPPOSITE[draft.verb] : undefined);
    const afterItems: OptionItem[] = verbs
      .filter((verb) => verb !== 'run')
      .map((verb) => ({
        key: verb,
        label: s(hass, `verb_${verb}`),
        active: verb === chosenAfter,
      }));
    return this.section(
      s(hass, 'when'),
      html`${tiles}
      ${
        kind === 'custom'
          ? dayChips(hass, draft.days.days, (day) => this.toggleDay(day), fit)
          : nothing
      }
      ${this.renderMoment('start', draft.start, request, s(hass, 'start'))}
      ${
        windowed
          ? html`<div class="ss-block ss-until">
                ${this.fieldRow(
                  s(hass, 'until'),
                  draft.hasEnd ? spanText(hass, draft.start, draft.end) : '',
                  toggle(draft.hasEnd, 'accent', (next) => this.setEnd(next), s(hass, 'until')),
                  56,
                )}
              </div>
              ${
                draft.hasEnd
                  ? html`${this.renderMoment('end', draft.end, request, s(hass, 'until'))}
                    ${
                      afterItems.length >= 2
                        ? html`<div class="ss-block ss-after">
                            ${label(s(hass, 'after'))}
                            ${
                              optionsHold(
                                afterItems.map((item) => item.label),
                                fit.width,
                                4,
                                (text) => this.ruler.width('fv-option > fv-option__label', text),
                              )
                                ? options(
                                    afterItems,
                                    (key) => this.patch({ after: key as Verb }),
                                    4,
                                    64,
                                    afterItems.length,
                                    true,
                                  )
                                : chipRow(
                                    afterItems.map((item) => ({
                                      key: item.key,
                                      label: item.label,
                                      active: item.active ?? false,
                                    })),
                                    (key) => this.patch({ after: key as Verb }),
                                    'full',
                                    fit,
                                  )
                            }
                          </div>`
                        : nothing
                    }`
                  : nothing
              }`
          : nothing
      }`,
      'ss-when',
    );
  }

  private renderName(draft: Draft): TemplateResult {
    const hass = this.hass;
    const suggestion = this.suggestion(draft);
    return this.section(
      s(hass, 'name'),
      html`<div
        class="ss-name"
        @focusin=${(event: FocusEvent) => {
          this.nameFocused_ = true;
          (event.target as HTMLElement).scrollIntoView({ block: 'nearest' }); // a phone's keyboard covers half the sheet
        }}
      >
        ${textField({
          id: 'alias',
          value: draft.alias || suggestion,
          label: s(hass, 'name'),
          maxLength: 100,
          glyph: 'pencil',
          editing: this.nameFocused_,
          commitOn: 'leave',
          onCommit: (value) => {
            const typed = sanitiseAlias(value);
            this.patch({ alias: typed === suggestion ? '' : typed });
          },
          onLeave: () => {
            this.nameFocused_ = false;
          },
        })}
      </div>`,
      'ss-name-section',
    );
  }

  private renderEditor(request: ScheduleRequest, draft: Draft): TemplateResult {
    const hass = this.hass;
    const existing = request.schedule !== undefined;
    const whole = this.schedule(draft) !== undefined;
    const trailing =
      existing && request.entity && request.toggle
        ? toggle(
            this.pendingOn_ ?? this.liveOn(),
            'accent',
            (next) => this.flip(next),
            request.schedule?.alias ?? '',
          )
        : round('close', 'quiet', localize(hass, 'keypad.close'), () => this.close());
    return html`<div class="fv-sheet__head">
        <div class="fv-card__titles">
          <h2 class="fv-sheet__title" id="ss-title">${s(hass, existing ? 'schedule' : 'new')}</h2>
          ${existing ? html`<p class="fv-card__sub" data-name>${request.schedule?.alias}</p>` : nothing}
        </div>
        ${trailing}
      </div>
      <div class="ss-body">
        ${this.renderWhat(request, draft)} ${this.renderDo(draft)}
        ${this.renderWhen(request, draft)} ${this.renderName(draft)}
      </div>
      <div class="ss-footer">
        ${
          existing && request.remove
            ? html`<button
                class="fv-btn fv-btn--quiet ss-delete ${this.armed_ ? 'is-armed' : ''}"
                data-control
                data-target
                aria-live="polite"
                @click=${() => void this.deleteSchedule()}
              >
                ${this.armed_ ? s(hass, 'delete_confirm') : s(hass, 'delete')}
              </button>`
            : nothing
        }
        <div class="dv-actions">
          <button
            class="fv-btn fv-btn--quiet"
            data-control
            data-target
            @click=${() => this.close()}
          >
            ${localize(hass, 'keypad.cancel')}
          </button>
          <button
            class="fv-btn fv-btn--accent"
            data-control
            data-target
            ?disabled=${!whole || this.busy_}
            @click=${() => void this.save()}
          >
            ${s(hass, 'save')}
          </button>
        </div>
        ${this.error_ ? html`<p class="ss-error" role="alert">${this.error_}</p>` : nothing}
      </div>`;
  }

  /* ---------- render: the details ---------- */

  private renderDetails(request: DetailsRequest): TemplateResult {
    const hass = this.hass;
    const view = resolveEntity(hass, request.entity);
    const on = this.pendingOn_ ?? this.liveOn();
    const raw = view.attr<unknown>('last_triggered');
    const last = typeof raw === 'string' && raw ? new Date(raw) : undefined;
    const when = lastText(hass, last, new Date());
    const full = `${when} · ${localize(hass, on ? 'common.on' : 'common.off')}`;
    // the line gives way from its end: beside the switch (56) and the gap, "2 days ago · On" keeps "2 days ago"
    const sub = this.ruler.width('fv-card__sub', full) <= this.fit.width - 56 - 12 ? full : when;
    const id = request.configId;
    const links = [s(hass, 'open_in_ha'), localize(hass, 'activity.trace')];
    // the rows keep their circles while every link holds one line beside one (a 44 circle, two 12 gaps, the chevron's 44)
    const keep = links.every(
      (text) => this.ruler.width('fv-row__title', text) <= this.fit.width - 56 - 12 - 44,
    );
    return html`<div class="fv-sheet__head">
        <div class="fv-card__titles">
          <h2 class="fv-sheet__title" id="ss-title" data-name>${request.alias}</h2>
          <p class="fv-card__sub">${sub}</p>
        </div>
        ${toggle(on, 'accent', (next) => this.flip(next), request.alias)}
      </div>
      ${
        id
          ? html`<div class="ss-links">
              ${listRow({
                icon: keep ? 'ha' : null,
                tone: 'neutral',
                title: links[0] ?? '',
                trailing: 'chevron',
                onTap: () => this.go(`/config/automation/edit/${id}`),
              })}
              ${listRow({
                icon: keep ? 'list' : null,
                tone: 'neutral',
                title: links[1] ?? '',
                trailing: 'chevron',
                onTap: () => this.go(`/config/automation/trace/${id}`),
              })}
            </div>`
          : nothing
      }
      <div class="dv-actions">
        <button class="fv-btn fv-btn--quiet" data-control data-target @click=${() => this.close()}>
          ${localize(hass, 'keypad.close')}
        </button>
        <button class="fv-btn fv-btn--accent" data-control data-target @click=${() => this.run()}>
          ${keyed(this.done_, html`<span class="ss-swap fv-swap">${this.done_ ? localize(hass, 'actions.done') : s(hass, 'run')}</span>`)}
        </button>
      </div>`;
  }

  private renderSheet(request: SheetRequest): TemplateResult {
    return html`<div class="fv-sheet ss-sheet ${this.busy_ ? 'is-busy' : ''}" data-card>
      <div class="fv-sheet__grabber"><span></span></div>
      ${isDetails(request) ? this.renderDetails(request) : this.renderEditor(request, this.draft_)}
    </div>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const request = this.request_;
    if (!request) return nothing;
    if (this.docked) return this.renderSheet(request);
    return html`<dialog
      class=${this.leaving_ ? 'is-leaving' : ''}
      aria-labelledby="ss-title"
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.close();
      }}
      @close=${() => this.finishClose()}
      @click=${(event: MouseEvent) => this.onDialogClick(event)}
    >
      ${this.renderSheet(request)}
    </dialog>`;
  }
}

if (!customElements.get('fluvy-schedule-sheet'))
  customElements.define('fluvy-schedule-sheet', FluvyScheduleSheet);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-schedule-sheet': FluvyScheduleSheet;
  }
}
