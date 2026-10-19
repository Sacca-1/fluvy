import { badge, head } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { addDays, dayKey, sameDay, weekStart } from '../../shared/dates.js';
import { dayClasses, dayStep } from '../../shared/days.js';
import { FACE, textWidth } from '../fit.js';
import type { ViewContext } from './context.js';
import {
  columnStyle,
  dayList,
  fitBadgeHead,
  headSub,
  headTone,
  notice,
  outage,
  sevenColumns,
  surface,
} from './shared.js';

/** The grid's keys, kept to the strip: Left / Right walk it, Home / End jump to its ends (one tab stop for the seven). */
function onStripKey(event: KeyboardEvent, days: readonly Date[], first: number): void {
  const buttons = Array.from(
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.fv-day'),
  );
  const from = days[buttons.findIndex((day) => day === event.target)];
  const next = from ? dayStep(event.key, from, first) : undefined;
  const at = next ? days.findIndex((date) => sameDay(date, next)) : -1;
  if (at < 0) return;
  event.preventDefault();
  buttons[at]?.focus();
}

/** "This week": the seven-day strip (weekday, number, one dot) over the selected day's events. */
export function weekView(ctx: ViewContext): TemplateResult {
  const { agenda, words } = ctx;
  const broken = outage(ctx);
  const columns = sevenColumns(ctx.width);
  const start = weekStart(agenda.today, ctx.first);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const ready = ctx.status === 'ok' && days.every((date) => agenda.covers(date));
  const total = ready ? days.reduce((sum, date) => sum + agenda.count(date), 0) : 0;

  const title = ctx.config.title ?? words.t('calendar.this_week');
  // the count gives way before the title does: "10 events", or just "10" where the words do not fit, or none
  const line = words.ranges(start, addDays(start, 6));
  const fit = fitBadgeHead(
    ctx,
    'calendar',
    title,
    !ready || broken ? [] : [words.events(total), String(total)],
    line,
  );
  // the short weekdays while each holds its column and stands 4 from the next ("LUNMARMER" at 211 reads as one
  // word): else the narrow ones, as the month's
  const pitch = columns.cell + Math.floor((ctx.width - 7 * columns.cell) / 6);
  const weekday = days.every((date) => {
    const width = textWidth(words.weekday(date, 'short'), FACE.weekday);
    return width <= columns.cell && width + 4 <= pitch;
  })
    ? 'short'
    : 'narrow';
  const list = broken ? null : dayList(ctx, ctx.day);

  return surface(
    ctx,
    html`
      ${head({
        icon: fit.icon,
        tone: headTone(ctx),
        title,
        sub: headSub(ctx, line, fit.room),
        trailing: fit.pill ? badge(fit.pill, 'neutral') : nothing,
      })}
      ${
        broken ??
        html` <div
            class="fv-days cd-week"
            data-align="center"
            role="group"
            aria-label=${title}
            @keydown=${(event: KeyboardEvent) => onStripKey(event, days, ctx.first)}
          >
            ${days.map((date) => {
              const today = sameDay(date, agenda.today);
              const selected = sameDay(date, ctx.day);
              const count = agenda.covers(date) ? agenda.count(date) : null;
              return html`<button
                class="${dayClasses(date, { selected, today, label: '' })} cd-wday"
                data-target
                tabindex=${selected ? 0 : -1}
                aria-pressed=${selected ? 'true' : 'false'}
                aria-current=${today ? 'date' : nothing}
                aria-label=${words.dayAria(date, count)}
                @click=${() => ctx.select(date)}
              >
                <span class="cd-wday__n">${words.weekday(date, weekday)}</span>
                <span class="cd-wday__d">${date.getDate()}</span>
                <span class="cd-wday__dots">${count ? html`<i></i>` : nothing}</span>
              </button>`;
            })}
          </div>
          ${keyed(dayKey(ctx.day), html`<div class="fv-swap">${list?.body}</div>`)}
          ${list && list.more !== nothing ? html`<div class="cd-rows">${list.more}</div>` : nothing}
          ${notice(ctx)}`
      }
    `,
    { style: columnStyle(columns) },
  );
}
