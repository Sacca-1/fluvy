import { plural, strings } from '@fluvy/core';
import { listRow, type Tone } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { sameDay } from '../../shared/dates.js';
import { FACE, badgeWidth, fitText, textWidth } from '../fit.js';
import type { DayEvent } from '../model.js';
import type { ViewContext } from './context.js';

const s = strings('calendar');

/** Rows a day lists before the rest folds into "+N more": nine events must leave a usable card. */
export const MAX_ROWS = 6;

/**
 * Rows a list holds while it cannot say what is in it — its calendars still being read, or out of reach: the four
 * each view's declared height counts (`layoutHeight`), so the card stands at its size from its first frame, and keeps
 * it while its calendars are unavailable (1.9).
 */
export const RESTING = 4;

/** Nothing can be said of the events yet, or at all: the view draws itself at rest (its rows still, its grid empty). */
export const atRest = (ctx: ViewContext): boolean =>
  ctx.status === 'loading' || ctx.status === 'unavailable';

/* ---------- surface and head ---------- */

export const headTone = (ctx: ViewContext): Tone =>
  ctx.status === 'unavailable' ? 'off' : 'accent';

/** The card surface. `extra` carries a view's own classes and custom properties (the grid's columns). */
export function surface(
  ctx: ViewContext,
  body: unknown,
  extra: { readonly classes?: string; readonly style?: string } = {},
): TemplateResult {
  const off = ctx.status === 'unavailable' ? 'is-unavailable is-off' : '';
  const time = timeColumn(ctx);
  const style = `${time === 40 ? '' : `--cd-time:${time}px;`}${extra.style ?? ''}`;
  return html`<article
    class="fv-card cd-card ${off} ${extra.classes ?? ''}"
    data-card
    style=${style || nothing}
  >
    ${body}
  </article>`;
}

/** Room for the head's title and sub: the column minus the icon and whatever sits in the trailing slot. */
export const headRoom = (ctx: ViewContext, trailing: number): number =>
  ctx.width - 56 - (trailing > 0 ? trailing + 12 : 0) - 1;

/**
 * The head's line, longest first: while every calendar is out of reach it says so first ("Unavailable · Thursday 17
 * September"), the date giving way before the state does.
 */
const lineOf = (ctx: ViewContext, candidates: readonly string[]): readonly string[] =>
  ctx.away ? [...candidates.map((text) => `${ctx.away} · ${text}`), ctx.away] : candidates;

/**
 * A head whose title stays whole: the icon circle gives its room to a title that would not fit beside the trailing
 * slot (a month's name beside the ‹ › pair in a narrow column), as the energy heads do — where that room makes it
 * whole, or the title would end before it had begun; and to a line whose shortest form would not hold beside it
 * ("Semana 38"), as a line is never cut. The sub then has that room too. The card's `show_icon` may keep the circle
 * (`always`) or draw none (`never`).
 */
export function fitHead(
  ctx: ViewContext,
  icon: 'calendar' | 'clock' | 'list',
  title: string,
  trailing: number,
  line: readonly string[],
): { readonly icon: 'calendar' | 'clock' | 'list' | null; readonly room: number } {
  const room = headRoom(ctx, trailing);
  const show = ctx.config.show_icon;
  const width = textWidth(title, FACE.title);
  return show === 'always' ||
    (show !== 'never' &&
      (width <= room || (width > room + 56 && room >= Math.min(96, width))) &&
      textWidth(lineOf(ctx, line).at(-1) ?? '', FACE.sub) <= room)
    ? { icon, room }
    : { icon: null, room: room + 56 };
}

/**
 * A head with a badge, fitted in the header's order: the badge's shorter forms (`pills`, longest first), then the badge
 * itself give way to a title, or a line's shortest form, that would not fit beside them — what a badge says, the body
 * says too — and last the icon circle (`fitHead`). The sub has the title's room.
 */
export function fitBadgeHead(
  ctx: ViewContext,
  icon: 'calendar' | 'clock' | 'list',
  title: string,
  pills: readonly string[],
  line: readonly string[],
): {
  readonly icon: 'calendar' | 'clock' | 'list' | null;
  readonly pill: string;
  readonly room: number;
} {
  const width = Math.max(
    textWidth(title, FACE.title),
    textWidth(lineOf(ctx, line).at(-1) ?? '', FACE.sub),
  );
  for (const pill of pills) {
    const room = headRoom(ctx, badgeWidth(pill));
    if (width <= room) return { icon, pill, room };
  }
  return { ...fitHead(ctx, icon, title, 0, line), pill: '' };
}

/** A list row's 44 circle and the 12 gaps on either side of its words (`fv-row`). */
const ROW_SIDES = 44 + 12 + 12;
/** The least a row's name may have beside its end before the circles give way to it (the name itself when shorter). */
const ROW_NAME_MIN = 96;

/**
 * Whether the view's list rows keep their circles (the rows' rule, `HeadFit.rowsKeepIcon`): a row whose end — a
 * chevron's 44, nothing — would leave its name under 96 (or under the name itself), or its line's shortest form
 * ("2 événements") cut, gives the circle's room to the words, and every row of the list with it, so the names keep one
 * column.
 */
export const rowsKeepIcon = (
  ctx: ViewContext,
  rows: readonly { readonly title: string; readonly end: number; readonly sub?: string }[],
): boolean =>
  rows.every(
    ({ title, end, sub = '' }) =>
      ctx.width - ROW_SIDES - end >=
      Math.max(Math.min(ROW_NAME_MIN, textWidth(title, FACE.row)), textWidth(sub, FACE.sub)),
  );

/**
 * The time column is the sheet's 40; "12:30 PM" needs more, and so does an all-day event's pair of words ("Journée /
 * entière"), on the grid — whatever the day holds, so the rows never move with it.
 */
function timeColumn(ctx: ViewContext): number {
  const texts = [s(ctx.hass, 'all_day_top'), s(ctx.hass, 'all_day_bottom')];
  if (ctx.words.hour12)
    texts.push(
      ctx.words.time(new Date(2000, 0, 1, 12, 30)),
      ctx.words.time(new Date(2000, 0, 1, 22, 30)),
    );
  return Math.max(
    40,
    Math.ceil(Math.max(...texts.map((text) => textWidth(text, FACE.time))) / 4) * 4,
  );
}

/* ---------- one-liners ---------- */

/** The head's line that fits its room (`lineOf`): a state that holds not even alone is the house's dash for it. */
export const headSub = (ctx: ViewContext, candidates: readonly string[], room: number): string =>
  fitText([...lineOf(ctx, candidates), ...(ctx.away ? ['—'] : [])], room, FACE.sub);

/** One quiet line where a list would be: never an empty box. `off` is the ink of things that cannot be read. */
export const note = (
  text: string,
  kind: 'quiet' | 'off' = 'quiet',
  tight = false,
): TemplateResult =>
  html`<p class="cd-note ${kind === 'off' ? 'cd-note--off' : ''} ${tight ? 'cd-note--tight' : ''}">
    ${text}
  </p>`;

/**
 * What stands in for the content while nothing can be shown; `null` when the view should draw itself — at rest while
 * its calendars are out of reach (1.9: a card keeps its size).
 */
export function outage(ctx: ViewContext): TemplateResult | null {
  if (ctx.status === 'failed') return note(s(ctx.hass, 'failed'), 'off');
  return null;
}

/** The line about calendars that could not be read while the others could. */
export const notice = (ctx: ViewContext): TemplateResult | typeof nothing =>
  ctx.notice ? note(ctx.notice, 'off') : nothing;

/** Loading: the event row's anatomy without its words. */
export function skeleton(count: number, afterLabel = false): TemplateResult {
  return html`<div
    class="cd-events ${afterLabel ? 'cd-events--after-label' : ''}"
    aria-hidden="true"
  >
    ${Array.from(
      { length: count },
      () =>
        html`<div class="cd-event">
          <span class="cd-event__time"><span class="fv-skeleton cd-sk cd-sk--time"></span></span>
          <span class="cd-event__bar cd-sk--bar"></span>
          <span class="fv-row__text"
            ><span class="fv-skeleton cd-sk cd-sk--title"></span
            ><span class="fv-skeleton cd-sk cd-sk--sub"></span
          ></span>
        </div>`,
    )}
  </div>`;
}

/* ---------- event rows ---------- */

export const titleOf = (ctx: ViewContext, item: DayEvent): string =>
  item.event.summary || s(ctx.hass, 'untitled');

/** Where, or else whose: a row always has its second line. */
export const placeOf = (ctx: ViewContext, item: DayEvent): string =>
  item.event.location || ctx.nameOf(item.event.calendar);

/** "09:30" · "All day" — the one-line form used in subs. */
export const whenOf = (ctx: ViewContext, item: DayEvent): string =>
  item.whole ? ctx.words.t('common.all_day') : ctx.words.time(item.from);

/** What a screen reader hears for an event: "Dentist · 09:30 – 10:15 · Ona · Clínica Sants". */
export function eventAria(ctx: ViewContext, item: DayEvent): string {
  const span =
    item.whole || item.instant
      ? whenOf(ctx, item)
      : `${ctx.words.time(item.from)} – ${ctx.words.time(item.to)}`;
  return `${titleOf(ctx, item)} · ${span} · ${placeOf(ctx, item)}`;
}

/** Enter and Space activate an element that plays a button (`role="button"`). */
export const onActivate =
  (run: () => void) =>
  (event: KeyboardEvent): void => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
      event.preventDefault();
      run();
    }
  };

/** A tappable 60 px row (`role="button"`): the markup the event row and the upcoming row share. */
export function tapRow(
  classes: string,
  label: string,
  run: () => void,
  body: TemplateResult,
): TemplateResult {
  return html`<div
    class="${classes} fv-row--tap"
    data-target
    role="button"
    tabindex="0"
    aria-label=${label}
    @click=${run}
    @keydown=${onActivate(run)}
  >
    ${body}
  </div>`;
}

/** Time column right-aligned, the 4 px bar in the calendar's tone, title / sub; a past event goes quiet. */
export function eventRow(ctx: ViewContext, item: DayEvent): TemplateResult {
  const { words } = ctx;
  // where, or whose: a name, which may end in its ellipsis
  const place = placeOf(ctx, item);
  const time = item.whole
    ? html`<span>${s(ctx.hass, 'all_day_top')}</span
        ><span class="cd-event__end">${s(ctx.hass, 'all_day_bottom')}</span>`
    : html`<span>${words.time(item.from)}</span
        >${item.instant ? nothing : html`<span class="cd-event__end">${words.time(item.to)}</span>`}`;
  return tapRow(
    `cd-event ${item.past ? 'is-past' : ''}`,
    eventAria(ctx, item),
    () => ctx.open(item.event.calendar),
    html`<span class="cd-event__time">${time}</span>
      <span
        class="cd-event__bar fv-bar--${ctx.toneOf(item.event.calendar)}"
        data-accent=${ctx.accentOf(item.event.calendar) ?? nothing}
      ></span>
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${titleOf(ctx, item)}</span
        ><span class="fv-row__sub" data-name title=${place}>${place}</span></span
      >`,
  );
}

/** The row a long list folds into. It opens the calendar, where the whole day is. `keep`: it keeps its circle. */
export const moreRow = (ctx: ViewContext, text: string, keep = true): TemplateResult =>
  listRow({
    icon: keep ? 'dots' : null,
    tone: 'neutral',
    title: text,
    trailing: 'chevron',
    onTap: () => ctx.open(),
  });

export interface DayList {
  /** The rows — or the skeleton while the day is not read yet, or the "No events" line. */
  readonly body: TemplateResult;
  /** The "+N more" row when the day was capped, for the view to place among its own rows. */
  readonly more: TemplateResult | typeof nothing;
  /** Its words ("+3 more", "3 earlier"), for the rows' rule; empty when the day was not capped. */
  readonly moreText: string;
}

/**
 * A day's event rows, capped at `max`. Today keeps what is still to come in sight: past events leave
 * the list first ("3 earlier"); any other day is read from its morning ("+3 more").
 */
export function dayList(
  ctx: ViewContext,
  day: Date,
  options: {
    readonly afterLabel?: boolean;
    readonly max?: number;
    readonly items?: readonly DayEvent[];
    /** The "+N more" row keeps its circle (the rows' rule, decided by the view for its list at once). */
    readonly keep?: boolean;
  } = {},
): DayList {
  const afterLabel = options.afterLabel ?? false;
  if (atRest(ctx) || !ctx.agenda.covers(day))
    return { body: skeleton(RESTING, afterLabel), more: nothing, moreText: '' };
  const items = options.items ?? ctx.agenda.on(day);
  if (!items.length)
    return { body: note(ctx.words.events(0), 'quiet', afterLabel), more: nothing, moreText: '' };

  const max = options.max ?? MAX_ROWS;
  const hidden = Math.max(0, items.length - max);
  const upcoming = items.findIndex((item) => !item.past);
  const start =
    hidden > 0 && sameDay(day, ctx.agenda.today)
      ? Math.min(upcoming < 0 ? items.length : upcoming, hidden)
      : 0;
  const shown = items.slice(start, start + max);
  const moreText =
    hidden > 0
      ? plural(ctx.hass, start === hidden ? 'calendar.earlier' : 'calendar.more', hidden, {
          count: hidden,
        })
      : '';
  return {
    body: html`<div class="cd-events ${afterLabel ? 'cd-events--after-label' : ''}">
      ${shown.map((item) => eventRow(ctx, item))}
    </div>`,
    // the row keeps its circle as the view's list does, or by its own words where the view decided nothing
    more: moreText
      ? moreRow(ctx, moreText, options.keep ?? rowsKeepIcon(ctx, [{ title: moreText, end: 44 }]))
      : nothing,
    moreText,
  };
}

/* ---------- seven columns ---------- */

export interface Columns {
  /** Drawn width of a day: the sheet's 44, less only when seven of them do not fit the column. */
  readonly cell: number;
  /** `grid-template-columns`: every column edge on a whole pixel, the first on the left edge, the last on the right one. */
  readonly tracks: string;
}

/** Seven day columns across `width`, the sheet's geometry made fluid: 7 × 44 on a 46 pitch at 320. */
export function sevenColumns(width: number): Columns {
  const cell = Math.min(44, Math.max(24, Math.floor((width - 12) / 28) * 4));
  const rest = Math.max(0, width - 7 * cell);
  const edge = (index: number): number => Math.round((index * rest) / 6);
  const tracks = Array.from(
    { length: 7 },
    (_, index) => `${cell + (index < 6 ? edge(index + 1) - edge(index) : 0)}px`,
  ).join(' ');
  return { cell, tracks };
}

export const columnStyle = (columns: Columns): string =>
  `--cd-cell:${columns.cell}px;--cd-tracks:${columns.tracks};`;
