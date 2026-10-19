import { isActive, stateText, strings, valueParts, type EntityView } from '@fluvy/core';
import { chips, icon, listRow, type ChipItem, type Tone } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { currentTone, toneFor } from '../shared/domain.js';
import {
  contextOf,
  iconOf,
  isUnusable,
  nameOf,
  ownSecondary,
  type HelperHost,
  type HelperRowConfig,
} from './context.js';
import { type TextRuler } from '../shared/fit.js';
import {
  dayText,
  daysUntil,
  parseMomentText,
  presetTime,
  relativeAgo,
  relativeDays,
  timeText,
  type Moment,
} from './datetime.js';

const s = strings('helpers');

/** Below this content width a row's extras stop indenting to the text column. */
const NARROW = 300;
/** A row button's sides: its words plus 16 on either side, on the 4 grid (`fitPills`). */
const BUTTON_SIDES = 32;
/** A row's 44 circle and the 12 gaps on either side of its words. */
const ROW_SIDES = 44 + 12 + 12;
/** The least a row's name may have beside an action before the circles give way to it (the name itself when shorter). */
const NAME_MIN = 96;

/** What ends a list row: a button's words ("Run", "06:45", "Kitchen"), or the width of what else does (a switch). */
export interface RowEnd {
  readonly name: string;
  readonly button?: string;
  readonly end?: number;
  /** The line under the name: its first segment holds the same room as the name ("Sets at 20:12"). */
  readonly sub?: string;
}

/**
 * Whether a list's rows keep their circles. What ends a row is never cut — an action's word, a value's button, a
 * switch — so a row whose end would leave its name under 96 (or under the name itself) gives the circle's room to the
 * name, and every row of the list with it, so the names keep one column: the rows' rule (`HeadFit.rowsKeepIcon`).
 */
export function rowsKeepIcon(ruler: TextRuler, width: number, rows: readonly RowEnd[]): boolean {
  return rows.every((row) => holds(ruler, width - ROW_SIDES, row));
}

/**
 * Whether a row puts its end under its name: where even without its circle the end would leave the name — or its
 * line's first segment — under 96 (or under itself): a German "Installieren" at 211, the sun's "Above horizon". The
 * words then have the row, the end the line under them.
 */
export const rowStacks = (ruler: TextRuler, width: number, row: RowEnd): boolean =>
  !holds(ruler, width - 12, row) ||
  !holds(ruler, width - 12, { ...row, name: row.sub?.split(' · ')[0] ?? '' }, 'fv-row__sub');

/** Whether a row's name keeps its room beside what ends it, in the row's `room` (less its circle and gaps). */
const holds = (
  ruler: TextRuler,
  room: number,
  { name, button = '', end }: RowEnd,
  cls = 'fv-row__title',
): boolean =>
  room - (end ?? ruler.pill('fv-btn > in-value__text', button, BUTTON_SIDES)) >=
  Math.min(NAME_MIN, ruler.width(cls, name));

/** Where the entity is, else when it last changed: a row's sub is context or time, never its state again. */
function rowSub(host: HelperHost, view: EntityView, row: HelperRowConfig): string {
  const context = contextOf(host, view, row);
  if (context || row.secondary !== undefined || !view.stateObj) return context;
  const changed = new Date(view.stateObj.last_changed);
  return Number.isNaN(changed.getTime()) ? '' : sentenceCase(relativeAgo(host.hass, changed));
}

const sentenceCase = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * The sheet's list row with a free trailing element — `listRow` only knows switch, value and chevron — a button with
 * `button` for its words. Where the rows gave their circles to their names (`host.bare`) and even so the button would
 * leave the name under its room, the button goes under the name (`rowStacks`).
 */
function row(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  tone: Tone,
  sub: string,
  trailing: TemplateResult,
  button: string,
): TemplateResult {
  const bare = host.bare;
  const stack =
    bare && rowStacks(host.ruler, host.contentWidth, { name: nameOf(view, config), button, sub });
  return html`<div
    class="fv-row ${bare ? 'fv-row--bare' : ''} ${stack ? 'fv-row--stack' : ''} ${isUnusable(view) ? 'is-unavailable' : ''}"
  >
    ${
      bare
        ? nothing
        : html`<span class="fv-ico fv-ico--${tone}" data-icon>${icon(iconOf(view, config))}</span>`
    }
    <span class="fv-row__text"
      ><span class="fv-row__title" data-name>${nameOf(view, config)}</span
      >${sub ? html`<span class="fv-row__sub">${sub}</span>` : nothing}</span
    >
    ${trailing}
  </div>`;
}

/**
 * The sheet's content-sized row button (44 in a row, text + 16 px sides on the 4 grid). `label` is the
 * accessible name: a card holds several "Run" and several "Install", each must say what it acts on.
 * `name`: the words are a name (a select's chosen option) and may end in an ellipsis where the row is narrow;
 * otherwise they are an action's word, never cut: the row's name gives way to it.
 */
export function rowButton(
  kind: 'quiet' | 'link',
  text: string,
  label: string,
  onClick: () => void,
  disabled = false,
  name = false,
): TemplateResult {
  return html`<button
    class="fv-btn fv-btn--${kind} in-value ${name ? '' : 'in-value--action'}"
    data-control
    data-target
    data-fit=${BUTTON_SIDES}
    aria-label=${label}
    ?disabled=${disabled}
    @click=${onClick}
  >
    <span class="in-value__text" data-name=${name ? '' : nothing}>${text}</span>
  </button>`;
}

/** An editable value wears the link-button shape; tapping it opens Home Assistant's own editor for the entity. */
const valueButton = (
  host: HelperHost,
  view: EntityView,
  name: string,
  value: string,
): TemplateResult =>
  rowButton(
    'link',
    value,
    `${name} · ${value}`,
    () => host.moreInfo(view.id),
    isUnusable(view),
    true,
  );

/** A value too rich for the card (a select with a long list): the row says where it stands and opens the list. */
export function valueRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  value: string,
): TemplateResult {
  return row(
    host,
    view,
    config,
    currentTone(view, 'neutral'),
    rowSub(host, view, config),
    valueButton(host, view, nameOf(view, config), value),
    value,
  );
}

/** `input_boolean` / `switch`: the sheet's list row with its switch. */
export function switchRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const unusable = isUnusable(view);
  const on = host.state(view) === 'on';
  return listRow({
    icon: host.bare ? null : iconOf(view, config),
    tone: unusable ? 'off' : on ? 'accent' : 'neutral',
    title: nameOf(view, config),
    name: true,
    sub: rowSub(host, view, config),
    trailing: 'switch',
    on,
    switchTone: 'accent',
    unavailable: unusable,
    onToggle: (next) => {
      host.expect(view.id, next ? 'on' : 'off');
      host.call(view.domain, next ? 'turn_on' : 'turn_off', {}, view.id);
    },
  });
}

/** A moment helper's moment, as the row shows it (a quick-set chip is ahead of the report); none while it cannot be read. */
const momentOf = (host: HelperHost, view: EntityView): Moment | null =>
  view.status === 'ok' ? parseMomentText(host.state(view)) : null;

function momentParts(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  moment: Moment | null,
): { value: string; sub: string } {
  if (!moment) return { value: '—', sub: contextOf(host, view, config) };
  const custom = ownSecondary(host, config);
  if (!moment.hasTime)
    return {
      value: dayText(host.hass, moment),
      sub: custom ?? relativeDays(host.hass, daysUntil(moment)),
    };
  if (!moment.hasDate) return { value: timeText(host.hass, moment), sub: custom ?? view.areaName };
  return { value: timeText(host.hass, moment), sub: custom ?? dayText(host.hass, moment) };
}

/**
 * `input_datetime` / `date` / `time` / `datetime`: the value in the link-button shape (Home Assistant's
 * picker opens on tap) and, for a time of day, the owner's quick-set chips under the row.
 */
export function momentRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const state = host.state(view); // a quick-set chip is ahead of the report: the value follows the tap
  const moment = momentOf(host, view);
  const parts = momentParts(host, view, config, moment);
  const main = row(
    host,
    view,
    config,
    currentTone(view, 'neutral'),
    parts.sub,
    valueButton(host, view, nameOf(view, config), parts.value),
    parts.value,
  );
  const settable = view.domain === 'input_datetime' || view.domain === 'time';
  if (!moment || moment.hasDate || !settable || !config.presets?.length) return main;

  const items: ChipItem[] = [];
  for (const preset of config.presets) {
    const time = presetTime(preset);
    if (time)
      items.push({
        key: time,
        label: timeText(host.hass, { ...moment, date: new Date(`1970-01-01T${time}Z`) }),
        active: state.slice(0, 5) === time.slice(0, 5),
      });
  }
  if (!items.length) return main;
  // a narrow column gives the chips the whole line rather than breaking the set in two
  return html`${main}
    <div class="in-quick ${host.contentWidth < NARROW || host.bare ? 'in-quick--flush' : ''}">
      ${chips(items, (time) => {
        if (state.slice(0, 5) === time.slice(0, 5)) return;
        host.expect(view.id, time);
        host.call(
          view.domain,
          view.domain === 'time' ? 'set_value' : 'set_datetime',
          { time },
          view.id,
        );
      })}
    </div>`;
}

/** `input_button` / `button`: a quiet "Run"; the sub says when it last ran (the state of a button is that moment). */
export function buttonRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const pressed = view.status === 'ok' ? new Date(view.state) : null;
  const sub =
    ownSecondary(host, config) ??
    (pressed && !Number.isNaN(pressed.getTime())
      ? sentenceCase(relativeAgo(host.hass, pressed))
      : contextOf(host, view, config));
  const name = nameOf(view, config);
  const word = s(host.hass, 'run');
  const run = rowButton(
    'quiet',
    word,
    s(host.hass, 'run_named', { name }),
    () => host.call(view.domain, 'press', {}, view.id),
    isUnusable(view),
  );
  return row(host, view, config, currentTone(view, 'neutral'), sub, run, word);
}

/** What a moment helper's row shows at its end ("06:45", "Oct 18"). */
export const momentValue = (host: HelperHost, view: EntityView, config: HelperRowConfig): string =>
  momentParts(host, view, config, momentOf(host, view)).value;

/** What any other helper's row shows at its end: its figure, else its state, "—" while it cannot be read. */
export function plainValue(host: HelperHost, view: EntityView): string {
  if (view.status !== 'ok') return '—';
  const parts = valueParts(host.hass, view);
  return view.number !== null
    ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}`
    : stateText(host.hass, view);
}

/** Anything else (the sheet's Sun row): read-only state stays plain, and the row opens more-info. */
export function plainRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const missing = view.status === 'missing';
  const name = nameOf(view, config);
  const sub = rowSub(host, view, config);
  const value = plainValue(host, view);
  return listRow({
    icon: host.bare ? null : iconOf(view, config),
    tone: currentTone(view, isActive(view) ? toneFor(view) : 'neutral'),
    title: name,
    name: true,
    sub,
    trailing: 'value',
    value,
    // a state in words that would leave the words beside it under their room goes under them
    stack:
      host.bare &&
      rowStacks(host.ruler, host.contentWidth, {
        name,
        sub,
        end: host.ruler.width('fv-row__value', value),
      }),
    unavailable: isUnusable(view),
    onTap: missing ? undefined : () => host.moreInfo(view.id),
  });
}
