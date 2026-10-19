import { formatNumber, localize, strings, type HomeAssistant } from '@fluvy/core';
import { clockFace, ico, readout, type Tone } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { fitLine, type Segment, type TextRuler } from '../shared/fit.js';
import { statsRow } from '../shared/readouts.js';
import { lowerFirst, type Forecast, type Sky } from './sky.js';
import type { ClockParts } from './time.js';

const s = strings('clock', 'weather');

/** Everything a layout draws, resolved by the card: a layout only decides where it goes and what fits. */
export interface ClockModel {
  readonly hass: HomeAssistant | undefined;
  readonly analog: boolean;
  readonly numerals: 'none' | 'quarters' | 'all';
  /** The second hand of the analog face. Digital seconds arrive in `clock.seconds`. */
  readonly seconds: boolean;
  /** Hands placed instead of swept: reduced motion, or a frozen test instant. */
  readonly still: boolean;
  readonly tone: Tone;
  /** The wall clock as a local Date, for `clockFace`. */
  readonly face: Date;
  readonly clock: ClockParts;
  readonly title: string;
  readonly date: { readonly full: string; readonly short: string; readonly tiny: string } | null;
  readonly week: number | null;
  /** Null without a `weather` entity. */
  readonly sky: Sky | null;
  /** The Outside · Tonight · Tomorrow row: `none` when it was not asked for or cannot be had. */
  readonly forecast: Forecast;
  /** The next sun event (the side card's line, a weather tile's spare slot) and both events (a plain tile's foot). */
  readonly sun: {
    readonly next: { readonly kind: 'sunrise' | 'sunset'; readonly at: ClockParts } | null;
    readonly rising: ClockParts | null;
    readonly setting: ClockParts | null;
  };
  /** Content width of the surface: the card's or the tile's. */
  readonly width: number;
  readonly ruler: TextRuler;
}

type Part = TemplateResult | typeof nothing;

const floor4 = (value: number): number => Math.floor(value / 4) * 4;
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const degrees = (m: ClockModel, value: number | null): string =>
  value === null ? '—' : formatNumber(m.hass, value, { digits: 0 });

/** The widest figure a degree is laid out for: a frost below ten, as tabular as the rest. */
const WIDEST_DEGREES = '−88';

/** Tabular figures: every "00:00" is as wide as any other time, so the layout never moves with the hour. */
const widest = (time: string): string => time.replace(/\d/g, '0').padStart(5, '0');

/* ---------- shared pieces ---------- */

/** A fresh element for every instant it is drawn at: the CSS sweep starts from the angle in the markup. */
function face(m: ClockModel, R: number): unknown {
  return keyed(
    `${R}|${m.face.getTime()}`,
    clockFace({
      R,
      tone: m.tone,
      numerals: m.numerals,
      seconds: m.seconds,
      time: m.face,
      still: m.still,
    }),
  );
}

/** The units a time can carry, longest first: ":12 PM", then "PM" — the day period outlives the seconds. */
function units(m: ClockModel): string[] {
  const { seconds, period } = m.clock;
  return seconds ? [[seconds, period].filter(Boolean).join(' '), period] : [period];
}

function big(time: string, unit: string, small: boolean): TemplateResult {
  return html`<p class="ck-big ${small ? 'ck-big--s' : ''}" data-align="optical">
    <span data-baseline="d">${time}</span
    >${unit ? html`<span class="ck-big__unit" data-baseline="d">${unit}</span>` : nothing}
  </p>`;
}

/**
 * The big time's unit and size for a column: the fullest unit that holds beside the widest time at 64 — then none —
 * and, where not even the time alone holds, the same at the smaller size (48, the step before a digit is cut).
 */
function bigFit(
  m: ClockModel,
  available: number,
): { readonly unit: string; readonly small: boolean } {
  const all = [...units(m), ''];
  for (const small of [false, true]) {
    const cls = small ? 'ck-big ck-big--s' : 'ck-big';
    const unit = all.find(
      (candidate) =>
        m.ruler.width(cls, widest(m.clock.time), 'ck-big__unit', candidate) <= available,
    );
    if (unit !== undefined) return { unit, small };
  }
  return { unit: '', small: true };
}

/**
 * Outside · Tonight · Tomorrow: three columns where every label and figure holds its third, else two and one (a narrow
 * column in a long language) — laid out for the widest figure a degree takes, so a reading, or its dash while the
 * weather is out of reach, never moves the row.
 */
function forecastRow(m: ClockModel): Part {
  const { sky, forecast } = m;
  if (!sky || forecast.status === 'none') return nothing;
  const ready = forecast.status === 'ready';
  const items = [
    {
      label: s(m.hass, 'outside'),
      value: degrees(m, sky.temperature),
      unit: sky.temperature === null ? '' : sky.unit,
    },
    {
      label: s(m.hass, 'tonight'),
      value: degrees(m, ready ? forecast.tonight : null),
      unit: ready ? sky.unit : '',
    },
    {
      label: localize(m.hass, 'common.tomorrow'),
      value: degrees(m, ready ? forecast.tomorrow : null),
      unit: ready ? sky.unit : '',
    },
  ];
  const unit = sky.unit || m.hass?.config?.unit_system?.temperature || '°C';
  const { columns, size, odd } = statsRow(
    m.ruler,
    m.width,
    items.map((item) => ({ ...item, value: WIDEST_DEGREES, unit })),
  );
  return html`<div
    class="ck-cols fv-cols ${odd ? 'fv-cols--odd' : ''}"
    style="--ck-cols:${columns}"
  >
    ${items.map((item) => readout({ ...item, size }))}
  </div>`;
}

/**
 * The weather as caption segments. `lead`: it opens the line. `detail`: nothing else tells the air (A5's line). The
 * sky takes its shorter word where the line is short of room ("klare Nacht" → "klar", "Entity not found" → "Offline"),
 * and after a date it is the first to leave, whole, where not even that holds — never cut.
 */
function skySegments(m: ClockModel, lead: boolean, detail: boolean): Segment[] {
  const { sky } = m;
  if (!sky) return [];
  const segments: Segment[] = [
    {
      text: lead ? sky.text : sky.inline,
      short: lead || sky.inline === sky.text ? sky.short : lowerFirst(sky.short),
      optional: !lead,
    },
  ];
  if (m.forecast.status === 'none' && sky.temperature !== null)
    segments.push({ text: `${degrees(m, sky.temperature)}°`, optional: true });
  if (detail && sky.feels !== null)
    segments.push({
      text: s(m.hass, 'feels', { value: `${degrees(m, sky.feels)}°` }),
      optional: true,
    });
  if (detail && sky.wind)
    segments.push({ text: s(m.hass, 'wind', { value: sky.wind }), optional: true });
  return segments;
}

/** Title · date · week · weather, as far as the column goes; the date without its weekday where even that is short. */
function caption(m: ClockModel, available: number, withSky: boolean): string {
  const width = (text: string): number => m.ruler.width('ck-caption', text);
  const line = (short?: string): string => {
    const segments: Segment[] = [];
    if (m.title) segments.push({ text: m.title });
    if (m.date) segments.push({ text: m.date.full, ...(short ? { short } : {}) });
    if (m.week !== null)
      segments.push({
        text: localize(m.hass, segments.length ? 'calendar.week' : 'clock.week', { week: m.week }),
        optional: true,
      });
    if (withSky) segments.push(...skySegments(m, segments.length === 0, !m.date));
    return fitLine(segments, available, width);
  };
  const fitted = line(m.date?.short);
  return width(fitted) > available ? line(m.date?.tiny) : fitted;
}

/* ---------- hero: the big face, or the big digits ---------- */

export function heroAnalog(m: ClockModel): TemplateResult {
  const R = clamp(floor4((m.width - 24) / 2), 56, m.sky ? 96 : 120); // the sheet: 120 alone, 96 over its weather
  const line = caption(m, m.width, true);
  return html`
    <div class="ck-center">${face(m, R)}</div>
    ${line ? html`<p class="ck-caption">${line}</p>` : nothing} ${forecastRow(m)}
  `;
}

export function heroDigital(m: ClockModel): TemplateResult {
  const { time } = m.clock;
  const fits =
    (available: number) =>
    (unit: string): boolean =>
      m.ruler.width('ck-big', widest(time), 'ck-big__unit', unit) <= available;
  const row = forecastRow(m);

  // No row to carry the weather: the condition and the temperature stand beside the time — when the
  // time, with everything it was asked to show, leaves them room. Otherwise they join the caption.
  const beside = m.width - 64 - 8;
  const all = units(m);
  if (m.sky && row === nothing && fits(beside)(all[0] ?? '')) {
    const { sky } = m;
    const line = caption(m, beside, false);
    return html`<div class="ck-split">
      <div>
        ${big(time, all[0] ?? '', false)}${line ? html`<p class="ck-caption ck-caption--left" data-baseline="dt">${line}</p>` : nothing}
      </div>
      <div class="ck-split__side">
        ${ico(sky.glyph, sky.ok ? m.tone : 'off', { hero: true })}
        <p class="ck-temp">
          <span data-baseline="dt">${degrees(m, sky.temperature)}</span
          >${sky.temperature === null ? nothing : html`<span class="fv-unit" data-baseline="dt">${sky.unit}</span>`}
        </p>
      </div>
    </div>`;
  }

  // the day period outlives the seconds, and the time outlives them both: a column that holds none of them beside the
  // widest time steps the time down a size (48) before a digit is cut
  const { unit, small } = bigFit(m, m.width);
  const line = caption(m, m.width, true);
  return html`
    ${big(time, unit, small)}
    ${line ? html`<p class="ck-caption ck-caption--left">${line}</p>` : nothing} ${row}
  `;
}

/* ---------- side: the compact face with the time beside it ---------- */

/**
 * What a clock without weather says on its last line, longest first: "Sunrise 07:31", its short word ("Aufgang
 * 07:31"), then without the day period (the word says which half of the day).
 */
const sunForms = (
  m: ClockModel,
  kind: 'sunrise' | 'sunset',
  time: string,
  period: string,
): string[] =>
  [s(m.hass, kind), s(m.hass, `${kind}_label`), s(m.hass, `${kind}_label`)].map((word, i) =>
    [word, time, i < 2 ? period : ''].filter(Boolean).join(' '),
  );

export function side(m: ClockModel): TemplateResult {
  const { time } = m.clock;
  const all = units(m);
  const timeWidth = (unit: string, cls = 'ck-time'): number =>
    m.ruler.width(cls, widest(time), 'fv-unit', unit);
  // the face box is 2R + 24, pulled 12 out, 8 from the text
  const room = (R: number): number => (m.analog ? m.width - (2 * R + 20) : m.width);
  // The face yields to the time, never the reverse: 72 on the sheet, down to 48 in a 300 px column on a 12 h clock.
  let R = clamp(floor4((m.width - 20 - timeWidth(all[0] ?? '')) / 2), 48, 72);
  // a column where not even "10:08 PM" fits beside the smallest face steps the time down to 32 (the tile's small
  // time), its units going first; where not even the time alone holds at 32, the face follows it down to a tile's
  // 24 before a digit is cut
  const SMALL = 'ck-time ck-time--s';
  let unit = all.find((candidate) => timeWidth(candidate) <= room(R));
  const small = unit === undefined;
  if (small) {
    unit = [...all, ''].find((candidate) => timeWidth(candidate, SMALL) <= room(R));
    if (unit === undefined) {
      unit =
        [...all, ''].find(
          (candidate) =>
            timeWidth(candidate, SMALL) <=
            room(clamp(floor4((m.width - 20 - timeWidth(candidate, SMALL)) / 2), 24, 72)),
        ) ?? '';
      R = clamp(floor4((m.width - 20 - timeWidth(unit, SMALL)) / 2), 24, 72);
    }
  }
  // The sun's line takes the form the wider of sunrise and sunset holds at the widest time, so it never changes with
  // the event or with its time out of reach; the face yields to its shortest form as to the time, down to a tile's
  // 24, and where not even that holds the line leaves.
  const width = (text: string): number => m.ruler.width('fv-card__sub', text);
  const next = m.sky ? null : m.sun.next;
  const widestSun = (form: number): number =>
    Math.max(
      ...(['sunrise', 'sunset'] as const).map((kind) =>
        width(sunForms(m, kind, widest(time), m.clock.period)[form] ?? ''),
      ),
    );
  if (next && m.analog && widestSun(2) > room(R) && widestSun(2) <= room(24))
    R = floor4((m.width - 20 - widestSun(2)) / 2);
  const available = room(R);
  const form = [0, 1, 2].find((index) => widestSun(index) <= available);
  const sub = (segments: Segment[]): string => fitLine(segments, available, width);

  const lines = [
    m.title,
    m.date
      ? sub([
          { text: m.date.short, short: m.date.tiny },
          ...(m.week === null
            ? []
            : [{ text: localize(m.hass, 'calendar.week', { week: m.week }), optional: true }]),
        ])
      : '',
    m.sky
      ? sub(skySegments(m, true, false))
      : next && form !== undefined
        ? sunForms(m, next.kind, next.at.time, next.at.period)[form]
        : '',
  ];
  const text = html`<div class="ck-side__text">
    <p class="ck-time ${small ? 'ck-time--s' : ''}" data-align="optical">
      ${time}${unit ? html`<span class="fv-unit">${unit}</span>` : nothing}
    </p>
    ${lines.filter(Boolean).map((line) => html`<p class="fv-card__sub">${line}</p>`)}
  </div>`;
  if (!m.analog) return html`${text}${forecastRow(m)}`;
  // the ring's outer edge sits on the column: the face's 12 px of air is pulled out of the padding box, on purpose
  return html`<div class="ck-side">
      <div class="ck-side__face" data-measure="value">${face(m, R)}</div>
      ${text}
    </div>
    ${forecastRow(m)}`;
}

/* ---------- tile: 172 × 168 ---------- */

interface FootItem {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

/** Two xs readouts — the second one only while the tile is wide enough for both (a 140 px tile is not, in English). */
function tileFoot(m: ClockModel): Part {
  const { sky, forecast, sun } = m;
  // the label already says which half of the day: "SUNRISE 7:31" needs no AM, and the 64 px column has no room for one
  const sunItem = (kind: 'sunrise' | 'sunset', at: ClockParts): FootItem => ({
    label: s(m.hass, `${kind}_label`),
    value: at.time,
  });
  const items: FootItem[] = [];
  if (!sky) {
    if (sun.rising && sun.setting)
      items.push(sunItem('sunrise', sun.rising), sunItem('sunset', sun.setting));
  } else {
    const ready = forecast.status === 'ready';
    items.push({
      label: s(m.hass, 'outside'),
      value: degrees(m, sky.temperature),
      unit: sky.temperature === null ? '' : sky.unit,
    });
    // without a daily forecast the second slot tells the next sun event instead of a permanent dash
    if (sky.ok && forecast.status === 'none' && sun.next)
      items.push(sunItem(sun.next.kind, sun.next.at));
    else
      items.push({
        label: s(m.hass, 'tonight'),
        value: degrees(m, ready ? forecast.tonight : null),
        unit: ready ? sky.unit : '',
      });
  }
  if (!items.length) return nothing;
  const widthOf = (item: FootItem): number =>
    Math.max(
      m.ruler.width('fv-readout__label', item.label),
      m.ruler.width('fv-readout--xs > fv-readout__value', item.value, 'fv-unit', item.unit ?? ''),
    );
  const shown =
    items.length > 1 && items.reduce((sum, item) => sum + widthOf(item), 4) > m.width
      ? items.slice(0, 1)
      : items;
  return html`<div class="fv-tile__foot">
    ${shown.map((item) => readout({ ...item, size: 'xs' }))}
  </div>`;
}

export function tile(m: ClockModel): TemplateResult {
  // the face box is 2R + 24: R from the tile's own width, 56 at most (a 172 tile), never wider than the tile
  if (m.analog) return html`${face(m, clamp(floor4((m.width - 24) / 2), 24, 56))}`;
  const { time } = m.clock;
  // the period beside the time while the tile holds both; a tile too narrow for the time alone (a 124 tile on a
  // phone's 264 section) steps it down to 32 before a digit is cut
  const timeFits = (cls: string, candidate: string): boolean =>
    m.ruler.width(cls, widest(time), 'fv-unit', candidate) <= m.width;
  const small = !timeFits('ck-tile__time', '');
  const timeCls = small ? 'ck-tile__time ck-tile__time--s' : 'ck-tile__time';
  const unit = [m.clock.period, ''].find((candidate) => timeFits(timeCls, candidate)) ?? '';
  // the weather in its shorter word where the clock's own does not fit ("Nuit dégagée" → "Dégagé"); a line still too
  // long takes the tile's second line, and a word longer than the tile gives way to the tiles' dash (a title is a
  // name: it may end in an ellipsis instead)
  const measure = (text: string): number => m.ruler.width('fv-tile__state', text);
  const line = fitLine(
    [
      ...(m.title ? [{ text: m.title }] : []),
      {
        text: m.sky ? m.sky.text : (m.date?.short ?? ''),
        ...(m.sky ? { short: m.sky.short } : {}),
        optional: Boolean(m.title),
      },
    ],
    m.width,
    measure,
  );
  const state = !m.title && line.split(/\s+/).some((word) => measure(word) > m.width) ? '—' : line;
  return html`
    <p class=${timeCls} data-baseline="tt" data-align="optical">
      ${time}${unit ? html`<span class="fv-unit">${unit}</span>` : nothing}
    </p>
    ${state ? html`<p class="fv-tile__state">${state}</p>` : nothing} ${tileFoot(m)}
  `;
}
