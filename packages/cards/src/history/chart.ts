/**
 * A chart of the History page: everything measured in one unit, on one scale, with the page's cursor across it.
 * One series draws the cards' curve (a gradient under it); several draw their lines, each in its own graph colour.
 */
import { formatNumber, plural, scaleUnit } from '@fluvy/core';
import { sampleTrack, valueAt, type Track } from '@fluvy/core/history';
import {
  areaUnder,
  axis,
  bandPath,
  chartBubble,
  head,
  plotScale,
  plotY,
  readout,
  scrub,
  seriesPath,
  seriesY,
  type PlotOptions,
} from '@fluvy/ui';
import { html, nothing, svg, type TemplateResult } from 'lit';

import type { Chart } from './model.js';
import type { FluvyHistory } from './view.js';

/** The plot's height, and the room the bubble keeps over the highest reading. */
const HEIGHT = 168;
const COMPACT_HEIGHT = 140;
const HEADROOM = 44;
const PAD = 12;
/** What a card spends on its sides, at every width (`fluvy/surfaces.css`): the one place that number is written. */
export const CARD_PADDING = 40;
/** The content column of a card in the page's column — what a chart is drawn into, and its lines with it. */
export const cardWidth = (mainWidth: number): number => Math.max(240, mainWidth - CARD_PADDING);
/** A point per 6 px of width: smooth enough to read, cheap enough for a phone. */
const DENSITY = 6;

interface Reading {
  readonly text: string;
  readonly unit: string;
}

/**
 * One unit and one precision for a whole card, so three readings of one measure can be compared by eye: the unit is
 * the one a typical reading takes (a house that averages 592 W reads watts everywhere, one that averages 4 kW reads
 * kilowatts), and the decimals follow what the card's readings reach in it. Home Assistant's own precision wins
 * while the unit is untouched. A reading that is not there is a dash, never a zero.
 */
export interface Scale {
  readonly unit: string;
  /** What a reading is multiplied by to be written in that unit (1, or a thousandth). */
  readonly factor: number;
  readonly digits: number;
}

export function scaleOf(chart: Chart, hass: FluvyHistory['hass']): Scale {
  const typical =
    chart.tracks.reduce((sum, track) => sum + Math.abs(track.average), 0) /
    Math.max(1, chart.tracks.length);
  const shown = scaleUnit(typical, chart.unit);
  const factor = typical === 0 ? 1 : shown.value / typical;
  const peak =
    chart.tracks.reduce(
      (most, track) => Math.max(most, Math.abs(track.min), Math.abs(track.max)),
      0,
    ) * factor;
  const said =
    factor === 1
      ? chart.tracks
          .map((track) => hass?.entities?.[track.entityId]?.display_precision)
          .find((p): p is number => typeof p === 'number')
      : undefined;
  // a measure that only ever reads whole numbers (a count of lamps, a step) is written whole
  const whole = chart.tracks.every((track) =>
    track.points.every((point) => Number.isInteger(point.v)),
  );
  const digits =
    said ?? (whole && factor === 1 ? 0 : peak >= 100 ? 0 : peak >= 10 ? 1 : peak >= 1 ? 2 : 3);
  return { unit: shown.unit, factor, digits };
}

function reading(page: FluvyHistory, number: number | null, scale: Scale): Reading {
  if (number === null) return { text: '—', unit: scale.unit };
  return {
    text: formatNumber(page.hass, number * scale.factor, {
      digits: scale.digits,
      minDigits: scale.digits,
    }),
    unit: scale.unit,
  };
}

const value = (page: FluvyHistory, track: Track, at: number, scale: Scale): Reading =>
  reading(page, valueAt(track.points, at), scale);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * What the axis says: the window's own ends first — a reader must always know where it starts and where it stops —
 * and the round marks between them (hours through a day, whole days beyond) wherever there is room for one. A mark
 * too near an end, or near the mark before it, is not drawn: two labels on top of each other read as one smudge.
 */
export function axisLabels(page: FluvyHistory, width: number): (readonly [number, string])[] {
  const { start, end } = page.range;
  const span = end - start;
  if (!(span > 0) || !(width > 0)) return [];
  const longWindow = span > 8 * DAY;
  const name = (t: number): string =>
    span <= 2 * DAY ? page.time(t) : longWindow ? page.date(t) : page.day(t);
  // a window of whole days ends on the last of them: the axis says what the title says
  const lastNamed = span > 2 * DAY && new Date(end).getHours() === 0 ? end - 1 : end;
  // the ends say more of themselves when the plain name would print the same words twice (a 24 h window's two
  // clocks, a year's two Septembers): the day through a short window, the year through a long one
  const same = name(start) === name(lastNamed);
  const endName = (t: number): string =>
    !same ? name(t) : span <= 2 * DAY ? `${page.weekday(t)} ${page.time(t)}` : page.dateYear(t);
  // a mark costs its own ink and a gap; how many read well is the width's business (one per 200 or so)
  const need = page.labelWidth(endName(end)) + 24;
  const want = Math.max(2, Math.min(6, Math.round(width / 200)));
  const marks = Math.max(1, Math.min(want, Math.floor(width / need)));
  const room = need;
  const hours = [1, 2, 3, 4, 6, 8, 12, 24];
  const step =
    span <= 2 * DAY
      ? (hours.find((h) => span / (h * HOUR) <= marks) ?? 24) * HOUR
      : Math.max(DAY, Math.ceil(span / marks / DAY) * DAY);
  // the marks are evenly spaced by construction; only the two nearest the window's own ends give way to them
  const keep = room / width;
  const labels: [number, string][] = [[0, endName(start)]];
  const first = new Date(start);
  if (step >= DAY) first.setHours(0, 0, 0, 0);
  else first.setMinutes(0, 0, 0);
  const lastLabel = span > 2 * DAY ? endName(lastNamed) : endName(end);
  for (let t = first.getTime(); t <= end; t += step) {
    const fraction = (t - start) / span;
    if (fraction <= keep) continue;
    if (fraction >= 1 - keep) break;
    const mark = name(t);
    // a mark that reads like one of the window's ends is that end said twice: a smudge, not a scale
    if (mark === labels[0]?.[1] || mark === lastLabel) continue;
    labels.push([fraction, mark]);
  }
  labels.push([1, lastLabel]);
  return labels;
}

/**
 * What a chart says, for a reader who cannot see it: its measure and what it reads at the cursor. The page speaks
 * the one whose chart is under the hand, at every move of it, and each chart describes itself for whoever lands on
 * it — so it is worked out here, once, from the same numbers the card prints.
 */
export function spokenOf(page: FluvyHistory, chart: Chart): string {
  const scale = scaleOf(chart, page.hass);
  const lead = chart.tracks[0];
  const read = lead ? value(page, lead, page.at, scale) : { text: '—', unit: scale.unit };
  const figure = `${read.text} ${read.unit}`.trim();
  return `${chart.title}: ${
    page.scrubbed
      ? page.t('chart_at', { time: page.moment(page.at), value: figure })
      : page.t('chart_last', { value: figure })
  }`;
}

/** A chart card: its head reads the value under the cursor, its plot draws every series on one scale. */
export function renderChart(page: FluvyHistory, chart: Chart): TemplateResult {
  const width = cardWidth(page.mainWidth);
  const height = page.compact ? COMPACT_HEIGHT : HEIGHT;
  const count = Math.max(8, Math.round(width / DENSITY));
  const { start, end } = page.range;
  // only what has happened is drawn: a window that runs into the future keeps its room but stays empty
  const drawnEnd = page.drawnEnd;
  const extent = (drawnEnd - start) / (end - start);
  const drawn = Math.max(2, Math.round(count * extent));
  const series = chart.tracks.map((track) => sampleTrack(track, start, drawnEnd, drawn));
  // what a summarised reading moved between is drawn behind a single curve; several bands would only make mud
  const bands = chart.tracks.map((track) =>
    track.band?.length && chart.tracks.length === 1
      ? {
          low: sampleTrack(
            { points: track.band.map((b) => ({ t: b.t, v: b.low })) },
            start,
            drawnEnd,
            drawn,
          ),
          high: sampleTrack(
            { points: track.band.map((b) => ({ t: b.t, v: b.high })) },
            start,
            drawnEnd,
            drawn,
          ),
        }
      : null,
  );
  const plot: PlotOptions = {
    w: Math.max(2, width * extent),
    h: height,
    padTop: HEADROOM,
    pad: PAD,
    ...plotScale([...series, ...bands.flatMap((band) => (band ? [band.low, band.high] : []))]),
  };
  const at = page.at;
  const cursorX = page.fraction(at) * width;
  const id = chart.key.replace(/\W+/g, '-');
  const lead = chart.tracks[0];
  const alone = chart.tracks.length === 1;
  const scale = scaleOf(chart, page.hass);
  const leadValue = lead ? value(page, lead, at, scale) : { text: '—', unit: scale.unit };
  const spoken = spokenOf(page, chart);
  // what the card drew, high and low — the same numbers `plotScale` was built from, so a mark is always exactly
  // at its value. What the house reached is the readouts' business: they are words, and cannot be read as a height
  const drawnValues = [
    ...series,
    ...bands.flatMap((band) => (band ? [band.low, band.high] : [])),
  ].flat();
  const high = drawnValues.reduce(
    (most, v) => (Number.isFinite(v) ? Math.max(most, v) : most),
    -Infinity,
  );
  const low = drawnValues.reduce(
    (least, v) => (Number.isFinite(v) ? Math.min(least, v) : least),
    Infinity,
  );
  const reach: (readonly [number, boolean])[] = Number.isFinite(high)
    ? high === low
      ? [[high, false]]
      : [
          [high, false],
          [low, true],
        ]
    : [];

  return html`<article class="fv-card hs-card">
    ${head({
      icon: chart.glyph,
      tone: 'accent',
      title: chart.title,
      sub: chart.summarised ? page.t(page.period === 'day' ? 'summarised_day' : 'summarised') : '',
      // a lone curve's card keeps its big readout while it is read by hand, with the instant as its label; a card
      // of several leaves the figures to its legend and carries the instant alone
      trailing: alone
        ? html`<span class="hs-card__read">
            <span class="hs-card__value" data-measure="value"
              >${leadValue.text}<span class="fv-unit">${leadValue.unit}</span></span
            >
            ${page.scrubbed ? html`<span class="hs-card__when">${page.moment(at)}</span>` : nothing}
          </span>`
        : html`<span class="hs-card__when">
            ${page.scrubbed ? page.moment(at) : page.t('now')}
          </span>`,
    })}
    <div
      class="hs-plot"
      style="height:${height}px"
      data-measure="drawn"
      tabindex="0"
      aria-label=${page.t('chart_read', { measure: chart.title })}
      aria-describedby=${`hs-read-${id}`}
      @keydown=${(event: KeyboardEvent) => page.scrubber.key(event)}
      @focusin=${() => page.reads(chart.key)}
      @pointerdown=${() => page.reads(chart.key)}
      ${scrub(page.scrubber)}
    >
      <svg width=${width} height=${height} viewBox="0 0 ${width} ${height}" aria-hidden="true">
        ${
          extent < 0.999
            ? svg`<rect class="hs-future" x=${plot.w} y="0" width=${Math.max(0, width - plot.w)} height=${height} />
                <line class="hs-edge" x1=${plot.w} y1="0" x2=${plot.w} y2=${height} />`
            : nothing
        }
        ${reach.map(([v, below]) => {
          const mark = reading(page, v, scale);
          return svg`<line class="hs-rule" x1="0" y1=${plotY(v, plot).toFixed(2)} x2=${plot.w} y2=${plotY(v, plot).toFixed(2)} />
            <text class="hs-rule__value" x="0" y=${(plotY(v, plot) + (below ? 12 : -5)).toFixed(2)}>${`${mark.text} ${mark.unit}`.trim()}</text>`;
        })}
        ${chart.tracks.map((track, index) => {
          const values = series[index] ?? [];
          const path = seriesPath(values, plot);
          const band = bands[index];
          return svg`<g class="hs-series" style="--series:${alone ? 'var(--fluvy-accent)' : `var(--fluvy-graph-${chart.colours[index] ?? 1})`};animation-delay:${index * 60}ms">
            ${band ? svg`<path class="hs-band" d=${bandPath(band.low, band.high, plot)} />` : nothing}
            ${
              alone
                ? svg`<linearGradient id=${`hs-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" class="hs-fill-a" />
                    <stop offset="1" class="hs-fill-b" />
                  </linearGradient>
                  <path class="hs-area" d=${areaUnder(path, plot)} fill=${`url(#hs-fill-${id})`} />`
                : nothing
            }
            <path class="hs-line ${alone ? 'hs-line--alone' : ''}" d=${path} pathLength="1" />
            ${(() => {
              // the dot marks the line, so it reads the line: the same curve, solved at the cursor's x
              const y = seriesY(values, plot, Math.min(cursorX, plot.w));
              return y === null || valueAt(track.points, at) === null
                ? nothing
                : svg`<circle class="hs-dot" cx=${cursorX.toFixed(2)} cy=${y.toFixed(2)} r="4" />`;
            })()}
          </g>`;
        })}
        ${svg`<line class="hs-cursor" x1=${cursorX.toFixed(2)} y1=${HEADROOM - 8} x2=${cursorX.toFixed(2)} y2=${height - PAD} />`}
      </svg>
      ${
        // a bubble names one reading: with several series it would claim to be all of them, and the
        // legend already reads every one of them at the cursor's time
        page.scrubbed && alone
          ? chartBubble({
              x: cursorX,
              width,
              value: leadValue.text,
              unit: leadValue.unit,
              time: page.moment(at),
              ...(page.family ? { family: page.family } : {}),
            })
          : nothing
      }
    </div>
    ${axis(axisLabels(page, width))}
    <p id=${`hs-read-${id}`} class="fv-sr">${spoken}</p>
    ${
      alone && lead
        ? html`<div class="fv-cols hs-readouts">
            ${(
              [
                ['min', lead.min],
                ['max', lead.max],
                ['average', lead.average],
              ] as const
            ).map(([label, number]) => {
              const read = reading(page, number, scale);
              return readout({
                label: page.t(label),
                value: read.text,
                unit: read.unit,
                size: 's',
              });
            })}
          </div>`
        : html`<ul class="hs-legend">
            ${chart.tracks.map((track, index) => {
              const read = value(page, track, at, scale);
              return html`<li class="hs-legend__row">
                <i
                  class="hs-legend__dot"
                  style="--series:var(--fluvy-graph-${chart.colours[index] ?? 1})"
                ></i>
                <span class="hs-legend__name" data-name>${track.name}</span>
                <span class="hs-legend__value" data-measure="value"
                  >${read.text}<span class="fv-unit">${read.unit}</span></span
                >
              </li>`;
            })}
            ${
              chart.hidden
                ? html`<li>
                    <button
                      class="fv-link hs-legend__more"
                      @click=${() => page.expandChart(chart.key)}
                    >
                      ${plural(page.hass, 'history.more', chart.hidden)}
                    </button>
                  </li>`
                : nothing
            }
          </ul>`
    }
  </article>`;
}
