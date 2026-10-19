import { plural, strings } from '@fluvy/core';
import { head } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { daysOf } from '../config.js';
import { addDays } from '../../shared/dates.js';
import { FACE, textWidth } from '../fit.js';
import type { DayEvent } from '../model.js';
import type { ViewContext } from './context.js';
import {
  eventAria,
  headSub,
  headTone,
  moreRow,
  note,
  notice,
  outage,
  placeOf,
  RESTING,
  rowsKeepIcon,
  skeleton,
  surface,
  tapRow,
  titleOf,
  whenOf,
} from './shared.js';

const s = strings('calendar');

const MAX_ROWS = 8;

/** Weekday and day stacked on the time column's right edge, the tone bar, title / "08:15 · Ona". */
function upcomingRow(ctx: ViewContext, day: Date, item: DayEvent): TemplateResult {
  const { words } = ctx;
  // a night that began the day before has no start on this day: say when it ends, not "00:00"
  const continues = !item.whole && item.from.getTime() > item.event.start.getTime();
  const when = continues ? s(ctx.hass, 'until', { time: words.time(item.to) }) : whenOf(ctx, item);
  // when stays whole; where is a name, which ends in its ellipsis while 40 of it shows beside it, and else leaves the
  // line to the time (the row's date, bar and gaps take 56)
  const place = placeOf(ctx, item);
  const shown =
    ctx.width - 56 - textWidth(`${when} · `, FACE.sub) >= Math.min(40, textWidth(place, FACE.sub));
  return tapRow(
    'cd-up',
    `${words.dayAria(day, null)} · ${eventAria(ctx, item)}`,
    () => ctx.open(item.event.calendar),
    html`<span class="cd-up__date" data-align="end"
        ><span class="cd-up__wd">${words.weekday(day, 'short')}</span
        ><span class="cd-up__d">${day.getDate()}</span></span
      >
      <span
        class="cd-event__bar fv-bar--${ctx.toneOf(item.event.calendar)}"
        data-accent=${ctx.accentOf(item.event.calendar) ?? nothing}
      ></span>
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${titleOf(ctx, item)}</span
        ><span class="fv-row__sub cd-up__sub"
          ><span>${shown ? `${when} · ` : when}</span>${
            shown ? html`<span data-name title=${place}>${place}</span>` : nothing
          }</span
        ></span
      >`,
  );
}

/**
 * The next days' events. The sheet's accent "+" is not drawn: Home Assistant creates events through
 * a dialog of its own, and a service call without one would add an event nobody typed.
 */
export function upcomingView(ctx: ViewContext): TemplateResult {
  const { agenda, words } = ctx;
  const days = daysOf(ctx.config);
  const first = addDays(agenda.today, 1);
  const broken = outage(ctx);
  const ready =
    ctx.status === 'ok' && agenda.covers(first) && agenda.covers(addDays(first, days - 1));
  const rows = ready ? agenda.span(first, days) : [];
  const hidden = Math.max(0, rows.length - MAX_ROWS);
  const more = hidden ? plural(ctx.hass, 'calendar.more', hidden, { count: hidden }) : '';

  return surface(
    ctx,
    html`
      ${head({
        icon: 'list',
        tone: headTone(ctx),
        title: ctx.config.title ?? words.t('calendar.upcoming'),
        sub: headSub(ctx, [words.t('calendar.next_days', { count: days })], ctx.width - 57),
      })}
      ${
        broken ??
        (!ready
          ? skeleton(RESTING)
          : !rows.length
            ? note(words.events(0))
            : html` <div class="cd-upcoming">
                  ${rows.slice(0, MAX_ROWS).map(({ day, item }) => upcomingRow(ctx, day, item))}
                </div>
                ${hidden ? html`<div class="cd-rows">${moreRow(ctx, more, rowsKeepIcon(ctx, [{ title: more, end: 44 }]))}</div>` : nothing}`)
      }
      ${broken ? nothing : notice(ctx)}
    `,
  );
}
