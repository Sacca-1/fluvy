import { localize, type HomeAssistant } from '@fluvy/core';
import { addGlyphs, type Tone } from '@fluvy/ui';
import { statusToneOf, toneOf, type Coloured } from '../shared/colour.js';
import { durationParts } from '../shared/duration.js';
import { jobWords, whenText, type JobClock } from '../shared/job-time.js';
import { APPLIANCE_GLYPHS } from './glyphs.js';
import { KIND_DEFAULTS, type ApplianceKind } from './kinds.js';
import type { ApplianceReading, Attention } from './reading.js';
import { busy, type ApplianceStatus } from './status.js';

/*
 * What both appliance cards say of an appliance, worded once: the unit a card shows (an appliance's, or its second
 * drum's or cavity's in its place), the tone its status draws in, how long things take and how long ago they were,
 * the line that says when ("Ready at 14:32", "Starts at 02:00", "Finished yesterday") and what asks for attention.
 * The appliances' glyphs join the set here, as the family's chunk lands.
 */
addGlyphs(APPLIANCE_GLYPHS);

const s = (hass: HomeAssistant | undefined, key: Parameters<typeof localize>[1]): string =>
  localize(hass, key);

/** Which of an appliance's units a card shows: its own, its second drum or cavity, or both (the second as a line). */
export type ApplianceUnit = 'main' | 'sub' | 'both';
export const APPLIANCE_UNITS: readonly ApplianceUnit[] = ['both', 'main', 'sub'];

/** The unit a card is about: what it is doing, in which words, and its times. */
export interface Shown {
  readonly status: ApplianceStatus;
  /** What it is doing, as the card says it: Home Assistant's word for its state, else the card's. */
  readonly word: string;
  /** The step it is at, in Home Assistant's words ('' where its word says it). */
  readonly phase: string;
  readonly clock: JobClock;
  readonly finishedAt: number | null;
}

/** The unit a card shows: the appliance's, or its twin's where the card asks for the second (`unit: sub`). */
export function shownOf(
  hass: HomeAssistant | undefined,
  r: ApplianceReading,
  unit: ApplianceUnit,
): Shown {
  const twin = unit === 'sub' ? r.twin : undefined;
  if (twin)
    return {
      status: twin.status,
      word: twin.word || s(hass, `appliance.status_${twin.status}`),
      phase: twin.phase,
      clock: twin.clock,
      finishedAt: twin.finishedAt,
    };
  return {
    status: r.status,
    word: r.word || s(hass, r.statusWord),
    phase: r.phase,
    clock: r.clock,
    finishedAt: r.finishedAt,
  };
}

/** A kind's glyph: one of the appliances' own, Fluvy's fan for a hood, its plug for an appliance on one. */
export const kindGlyph = (kind: ApplianceKind): string => KIND_DEFAULTS[kind].glyph;

/**
 * The tone a status draws in: the kind's while it works or is done (the card's colour stands in for the accent), the
 * warning while it waits, needs a hand or failed — whatever colour the card was given — the dashed skin out of reach,
 * the neutral at rest.
 */
export function statusTone(status: ApplianceStatus, config: Coloured, kind: ApplianceKind): Tone {
  switch (status) {
    case 'offline':
      return 'off';
    case 'off':
    case 'idle':
      return 'neutral';
    case 'paused':
    case 'attention':
    case 'error':
      return statusToneOf(config, 'warning');
    default:
      return toneOf(config, KIND_DEFAULTS[kind].tone);
  }
}

/** A span as a readout writes it: "1 h 12" with "min", "45" with "min"; a dash where it is unknown. */
export function durationText(
  hass: HomeAssistant | undefined,
  seconds: number | null,
): { readonly value: string; readonly unit: string } {
  const parts = seconds === null ? null : durationParts(seconds);
  const last = parts?.[parts.length - 1];
  if (!parts || !last) return { value: '—', unit: '' };
  const word = (unit: 'd' | 'h' | 'min'): string =>
    s(hass, unit === 'd' ? 'time.unit_d' : unit === 'h' ? 'time.unit_h' : 'time.unit_min');
  const lead = parts.slice(0, -1).map((part) => `${part.value} ${word(part.unit)} `);
  return { value: `${lead.join('')}${last.value}`, unit: word(last.unit) };
}

/** A span in a line: "1 h 12 min". */
export const spanText = (hass: HomeAssistant | undefined, seconds: number): string => {
  const { value, unit } = durationText(hass, seconds);
  return unit ? `${value} ${unit}` : value;
};

/** What is said with how long it has lasted: a door left open, a load waiting to be taken out. */
const LASTING: ReadonlySet<string> = new Set(['appliance.door_open', 'appliance.unload']);

/** What asks for attention, in words: the integration's own where it has them, how long a door or a load has waited. */
export function attentionText(
  hass: HomeAssistant | undefined,
  item: Attention,
  now: number,
): string {
  const said = item.text || s(hass, item.key);
  return LASTING.has(item.key) && item.since !== undefined && now - item.since >= 60_000
    ? `${said} · ${spanText(hass, (now - item.since) / 1000)}`
    : said;
}

/** How the times are said: both the time left and when it is ready, the time left alone, or when alone (`time`). */
export type TimeShown = 'both' | 'left' | 'end';
export const TIMES_SHOWN: readonly TimeShown[] = ['both', 'left', 'end'];

/**
 * The line's parts that say when, most important first: when it will be ready (and how long it has run) while it
 * works; when it starts, and when it will be ready, while it waits to; when it finished (and how long it took).
 */
export function whenParts(
  hass: HomeAssistant | undefined,
  shown: Shown,
  startAt: number | null,
  now: number,
  time: TimeShown = 'both',
  elapsed = true,
): string[] {
  const { clock } = shown;
  if (busy(shown.status))
    return [
      time === 'both' && clock.at !== null ? whenText(hass, 'ready', clock.at, now) : '',
      elapsed && clock.elapsed !== null
        ? jobWords(hass, 'elapsed_text', { time: spanText(hass, clock.elapsed) })
        : '',
    ].filter(Boolean);
  if (shown.status === 'scheduled')
    return [startAt !== null ? whenText(hass, 'start', startAt, now) : ''].filter(Boolean);
  if (shown.status === 'finished')
    return [
      shown.finishedAt !== null ? whenText(hass, 'done', shown.finishedAt, now) : '',
      clock.total !== null
        ? jobWords(hass, 'total_text', { time: spanText(hass, clock.total) })
        : '',
    ].filter(Boolean);
  return [];
}

/** "1 h 12 min left", for a line. */
export const leftText = (hass: HomeAssistant | undefined, seconds: number): string =>
  jobWords(hass, 'left_text', { time: spanText(hass, seconds) });
