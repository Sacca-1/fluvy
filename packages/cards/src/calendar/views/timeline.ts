import { strings } from '@fluvy/core';
import { badge, head } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { hoursOf } from '../config.js';
import { wallHours } from '../../shared/dates.js';
import type { DayEvent } from '../model.js';
import type { ViewContext } from './context.js';
import {
  dayList,
  eventAria,
  fitBadgeHead,
  headSub,
  headTone,
  notice,
  note,
  outage,
  surface,
  titleOf,
} from './shared.js';

const s = strings('calendar');

const PPH = 24; // px per hour
const GUTTER = 64; // hour labels live in 56; blocks start at 64
const MIN_BLOCK = 12;
const MAX_COLUMNS = 3;

const round4 = (value: number): number => Math.round(value / 4) * 4;
const floor4 = (value: number): number => Math.floor(value / 4) * 4;

interface Block {
  readonly item: DayEvent;
  readonly top: number;
  readonly height: number;
  column: number;
  columns: number;
}

/**
 * True block heights: the start lands on the nearest 4 px, the END IS SNAPPED DOWN — a block never
 * shows more time than its event has — and 12 px is the least a block can be and still be read.
 * Events that overlap share the width in columns instead of hiding one another.
 */
function layout(items: readonly DayEvent[], day: Date, start: number, end: number): Block[] {
  const y = (hours: number): number => (Math.min(end, Math.max(start, hours)) - start) * PPH;
  const blocks = items
    .map((item): Block => {
      const top = round4(y(wallHours(day, item.from)));
      return {
        item,
        top,
        height: Math.max(MIN_BLOCK, floor4(y(wallHours(day, item.to))) - top),
        column: 0,
        columns: 1,
      };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  let cluster: Block[] = [];
  let clusterBottom = -1;
  let bottoms: number[] = []; // per column, where its last block ends
  const close = (): void => {
    const columns = Math.min(MAX_COLUMNS, bottoms.length);
    for (const block of cluster) {
      block.columns = columns;
      block.column = Math.min(block.column, columns - 1);
    }
    cluster = [];
    bottoms = [];
  };
  for (const block of blocks) {
    if (block.top >= clusterBottom) close();
    const free = bottoms.findIndex((bottom) => bottom <= block.top);
    block.column = free < 0 ? bottoms.length : free;
    bottoms[block.column] = block.top + block.height;
    cluster.push(block);
    clusterBottom = Math.max(clusterBottom, block.top + block.height);
  }
  close();
  return blocks;
}

/** The hours drawn: the configured window, widened (in the 2-hour steps the labels use) to hold every event of the day. */
function hoursFor(
  ctx: ViewContext,
  items: readonly DayEvent[],
  day: Date,
): { start: number; end: number } {
  let { start, end } = hoursOf(ctx.config);
  for (const item of items) {
    const from = Math.floor(wallHours(day, item.from));
    if (from < start) start -= Math.ceil((start - from) / 2) * 2;
    end = Math.max(end, Math.ceil(wallHours(day, item.to)));
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
}

/** Today by the hour: 24 px per hour, pastel blocks with the 4 px tone bar, the now-line on the minute. */
export function timelineView(ctx: ViewContext): TemplateResult {
  const { agenda, words } = ctx;
  const day = agenda.today;
  const broken = outage(ctx);
  const ready = ctx.status === 'ok' && agenda.covers(day);
  const items = ready ? agenda.on(day) : [];
  const allDay = items.filter((item) => item.whole);
  const timed = items.filter((item) => !item.whole);

  const title = ctx.config.title ?? s(ctx.hass, 'timeline');
  const clock = words.time(agenda.now);
  // "Now 21:47"; the accent pill alone says "now" where the word does not fit beside the title, and the body's line
  // where not even the time does
  const line = words.dates(day);
  const fit = fitBadgeHead(
    ctx,
    'clock',
    title,
    broken || ctx.away ? [] : [`${words.t('common.now')} ${clock}`, clock],
    line,
  );

  const body = (): TemplateResult => {
    // the day not read yet, or its calendars out of reach: the configured hours, empty, at the card's size
    const { start, end } = hoursFor(ctx, timed, day);
    if (ready && !items.length) return note(words.events(0));
    const y = (hours: number): number => (hours - start) * PPH;
    const hours: number[] = [];
    for (let hour = start; hour <= end; hour += 2) hours.push(hour);
    const now = wallHours(day, agenda.now);
    const room = Math.max(GUTTER, ctx.width - GUTTER);
    const whole = dayList(ctx, day, { items: allDay, max: 2 });

    return html` ${allDay.length && ready ? whole.body : nothing}
    ${whole.more === nothing ? nothing : html`<div class="cd-rows">${whole.more}</div>`}
    ${
      timed.length || !ready
        ? html`<div class="cd-timeline" style="height:${y(end) + 16}px">
            ${hours.map((hour) => html`<span class="cd-hour" style="top:${y(hour)}px"><span class="cd-hour__label">${words.hour(hour)}</span><span class="cd-hour__line" data-measure="value"></span></span>`)}
            ${layout(timed, day, start, end).map((block, _, blocks) => {
              // back-to-back events would read as one block: the earlier one ends on a hairline of the card
              const abuts = blocks.some((other) => other.top === block.top + block.height);
              const width = floor4((room - (block.columns - 1) * 4) / block.columns);
              const side =
                block.columns === 1
                  ? ''
                  : `left:${GUTTER + block.column * (width + 4)}px;${block.column < block.columns - 1 ? `width:${width}px;` : ''}`;
              return html`<button
                class="cd-block fv-tone--${ctx.toneOf(block.item.event.calendar)} ${block.height <= MIN_BLOCK ? 'cd-block--thin' : ''} ${abuts ? 'cd-block--abuts' : ''}"
                data-accent=${ctx.accentOf(block.item.event.calendar) ?? nothing}
                style="${side}top:${block.top}px;height:${block.height}px"
                aria-label=${eventAria(ctx, block.item)}
                @click=${() => ctx.open(block.item.event.calendar)}
              >
                <span class="cd-block__title" data-name>${titleOf(ctx, block.item)}</span>
              </button>`;
            })}
            ${now >= start && now <= end ? html`<span class="cd-now" data-measure="value" style="top:${(y(now) - 1).toFixed(2)}px"></span>` : nothing}
          </div>`
        : nothing
    }`;
  };

  return surface(
    ctx,
    html`
      ${head({
        icon: fit.icon,
        tone: headTone(ctx),
        title,
        sub: headSub(ctx, line, fit.room),
        trailing: fit.pill ? badge(fit.pill, 'accent') : nothing,
      })}
      ${broken ?? html`${body()}${notice(ctx)}`}
    `,
  );
}
