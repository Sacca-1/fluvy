/**
 * The state lines of the History page: one row per thing that is not a number — its name and what it was under the
 * cursor over the stretches it spent in each state, drawn across the card's whole content column, so the cursor
 * lands exactly where every chart's does. The busiest lines come first.
 */
import { isActiveState, plural, resolveEntity, stateText } from '@fluvy/core';
import { spanAt, type Line, type Span } from '@fluvy/core/history';
import { axis, head, scrub } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';

import { axisLabels } from './chart.js';
import type { FluvyHistory } from './view.js';

/** A stretch's share of the window, as a percentage of the bar's width. */
const share = (span: Span, start: number, end: number): number =>
  Math.max(0, ((Math.min(span.to, end) - Math.max(span.from, start)) / (end - start)) * 100);

/** The plain resting states: a thing in one of these is simply not doing anything. */
const RESTING = new Set(['off', 'closed', 'unlocked', 'not_home', 'disarmed', 'normal', 'clear']);

/** How a stretch is painted: on, resting, something else it is actually doing, or nothing known at all. */
function tone(line: Line, state: string): string {
  if (state === 'unavailable' || state === 'unknown' || !state) return 'is-away';
  if (isActiveState(line.domain, state)) return 'is-on';
  // paused, idle, docked, returning: not active, but not resting either — it says so quietly
  return RESTING.has(state) ? '' : 'is-quiet';
}

/** What a state says in the house's language (Home Assistant's own words for it). */
function word(page: FluvyHistory, line: Line, state: string): string {
  const view = resolveEntity(page.hass, line.entityId);
  if (!state) return '—';
  return stateText(page.hass, {
    ...view,
    state,
    stateObj: view.stateObj ? { ...view.stateObj, state } : undefined,
  });
}

/** What the state card says, for a reader who cannot see it: the instant, and the first few things at it. */
export function spokenStates(page: FluvyHistory): string {
  const { lines } = page.shown;
  const at = page.at;
  const things = lines
    .slice(0, 3)
    .map((line) => `${line.name} ${word(page, line, spanAt(line.spans, at)?.state ?? '')}`)
    .join(', ');
  return `${page.t('states')}: ${
    page.scrubbed
      ? page.t('chart_at', { time: page.moment(at), value: things })
      : page.t('chart_last', { value: things })
  }`;
}

/** The card of state lines: one row each, the cursor crossing them all. */
export function renderStates(
  page: FluvyHistory,
  lines: readonly Line[],
  hidden: number,
): TemplateResult {
  const { start, end } = page.range;
  const at = page.at;
  const left = `${(page.fraction(at) * 100).toFixed(3)}%`;
  // the room past the end of the record, on every bar as on every chart
  const drawn = page.fraction(page.drawnEnd) * 100;
  return html`<article class="fv-card hs-card hs-states">
    ${head({
      icon: 'list',
      tone: 'neutral',
      title: page.t('states'),
      sub: '',
      trailing: html`<span class="hs-card__count">${lines.length + hidden}</span>`,
    })}
    <div
      class="hs-lines"
      tabindex="0"
      aria-label=${page.t('chart_read', { measure: page.t('states') })}
      @keydown=${(event: KeyboardEvent) => page.scrubber.key(event)}
      @focusin=${() => page.reads('states')}
      @pointerdown=${() => page.reads('states')}
      ${scrub(page.scrubber)}
    >
      ${lines.map((line) => {
        const span = spanAt(line.spans, at);
        return html`<div class="hs-line-row">
          <span class="hs-line__name" data-name>${line.name}</span>
          <span class="hs-line__state" data-measure="value"
            >${word(page, line, span?.state ?? '')}</span
          >
          <span class="hs-line__bar" data-measure="drawn">
            <span class="hs-line__track">
              ${line.spans.map((piece: Span) => {
                const width = share(piece, start, end);
                if (width <= 0) return nothing;
                return html`<i
                  class="hs-span ${tone(line, piece.state)}"
                  style="width:${width.toFixed(3)}%"
                  title=${word(page, line, piece.state)}
                ></i>`;
              })}
            </span>
            ${
              drawn < 99.9
                ? html`<i
                    class="hs-line__future"
                    style="left:${drawn.toFixed(3)}%"
                    aria-hidden="true"
                  ></i>`
                : nothing
            }
            <i class="hs-line__cursor" style="left:${left}" aria-hidden="true"></i>
          </span>
        </div>`;
      })}
    </div>
    <div class="hs-lines__axis">${axis(axisLabels(page, page.linesWidth))}</div>
    ${
      hidden
        ? html`<button class="fv-link hs-more" @click=${() => page.expandLines()}>
            ${plural(page.hass, 'history.more', hidden)}
          </button>`
        : nothing
    }
  </article>`;
}
