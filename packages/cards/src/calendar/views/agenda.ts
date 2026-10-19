import { strings } from '@fluvy/core';
import { badge, head, listRow } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { addDays, dayKey, sameDay } from '../../shared/dates.js';
import { FACE, fitText } from '../fit.js';
import type { ViewContext } from './context.js';
import {
  atRest,
  dayList,
  fitBadgeHead,
  headSub,
  headTone,
  notice,
  outage,
  rowsKeepIcon,
  surface,
} from './shared.js';

const s = strings('calendar');

/**
 * "2 events · first at 08:15", then "2 events · 08:15", then the count alone: the line's forms, longest first, for a
 * row too narrow for its words.
 */
function daySummary(ctx: ViewContext, day: Date): readonly string[] {
  const { agenda, words } = ctx;
  const items = agenda.on(day);
  const count = words.events(items.length);
  if (!items.length) return [count];
  if (sameDay(day, agenda.today)) {
    const left = agenda.left(day);
    return left > 0
      ? [`${count} · ${s(ctx.hass, left === 1 ? 'left_one' : 'left', { count: left })}`, count]
      : [count];
  }
  const first = items.find((item) => !item.whole);
  if (!first) return [`${count} · ${words.t('common.all_day').toLocaleLowerCase()}`, count];
  const time = words.time(first.from);
  return [`${count} · ${s(ctx.hass, 'first_at', { time })}`, `${count} · ${time}`, count];
}

/**
 * "Today": the day's rows, and a row for the day after. That row turns the card to tomorrow — and
 * then offers today back — instead of opening a dialog that could only show one calendar's next event.
 */
export function agendaView(ctx: ViewContext): TemplateResult {
  const { agenda, words } = ctx;
  const day = ctx.day;
  const onToday = sameDay(day, agenda.today);
  const other = onToday ? addDays(agenda.today, 1) : agenda.today;
  const broken = outage(ctx);

  const ready = ctx.status === 'ok' && agenda.covers(day);
  const count = ready ? agenda.count(day) : 0;
  const left = ready && onToday ? agenda.left(day) : 0;
  // the state is said once: "1 left" while the day runs, the count once it is over, nothing when there is nothing
  const pill =
    left > 0
      ? s(ctx.hass, left === 1 ? 'badge_left_one' : 'badge_left', { count: left })
      : count > 0
        ? words.events(count)
        : '';

  const otherReady = ready && agenda.covers(other);
  const otherEmpty = otherReady && agenda.count(other) === 0;
  // an empty tomorrow is said, not offered; the way back to today always is
  const canTurn = otherReady && (!onToday || !otherEmpty);
  // a column too narrow for a row's words beside its chevron gives every row's circle to the words, as every list does
  const otherName = words.dayName(other, agenda.today);
  const summary = otherReady ? daySummary(ctx, other) : [];
  const folded = broken ? null : dayList(ctx, day);
  const keep = rowsKeepIcon(ctx, [
    { title: otherName, end: canTurn ? 44 : 0, sub: summary.at(-1) ?? '' },
    ...(folded?.moreText ? [{ title: folded.moreText, end: 44 }] : []),
  ]);
  const list = broken ? null : keep ? folded : dayList(ctx, day, { keep });
  const title = ctx.config.title ?? words.dayName(day, agenda.today);
  const line = words.dates(day);
  const fit = fitBadgeHead(ctx, 'calendar', title, pill && !broken ? [pill] : [], line);

  return surface(
    ctx,
    html`
      ${head({
        icon: fit.icon,
        tone: headTone(ctx),
        title,
        sub: headSub(ctx, line, fit.room),
        trailing: fit.pill ? badge(fit.pill, left > 0 ? 'accent' : 'neutral') : nothing,
      })}
      ${broken ?? keyed(dayKey(day), html`<div class="fv-swap">${list?.body}</div>`)}
      ${
        !broken && atRest(ctx)
          ? html`<div class="cd-rows">
              ${listRow({
                icon: keep ? 'calendar' : null,
                tone: 'neutral',
                title: otherName,
                sub: '—',
                trailing: 'none',
              })}
            </div>`
          : nothing
      }
      ${
        !broken && otherReady
          ? html`<div class="cd-rows">
              ${list?.more ?? nothing}
              ${listRow({
                icon: keep ? 'calendar' : null,
                tone: 'neutral',
                title: otherName,
                sub: fitText(
                  summary,
                  ctx.width - (keep ? 56 : 0) - (canTurn ? 48 : 0) - 1,
                  FACE.sub,
                ),
                trailing: canTurn ? 'chevron' : 'none',
                onTap: canTurn ? () => ctx.select(other) : undefined,
              })}
            </div>`
          : nothing
      }
      ${broken ? nothing : notice(ctx)}
    `,
  );
}
