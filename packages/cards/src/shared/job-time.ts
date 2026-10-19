import {
  addEnglish,
  formatDate,
  formatTime,
  houseZone,
  localize,
  strings,
  wallClock,
  type HomeAssistant,
} from '@fluvy/core';
import words from '@fluvy/core/locales/en/job.json';

/*
 * A job's times, as a 3D printer and an appliance both read them: a duration a sensor holds (in its unit, or as a
 * clock), the time left and when it ends, when a finished job finished, how long it has run, and the day a moment
 * falls on as a line says it ("Ready at 14:32", "Ready Fri at 05:27", "Finished yesterday"). The shared `job` words
 * are worded for any job, whatever its noun; a card whose words agree with its own noun (the printer's "Lista a las",
 * "imprimiendo") keeps them and asks `when` for the rest. Its words travel with the devices chunk, where this module
 * lands, so they are here before anything says them.
 */
addEnglish(words);

/** The job's own words: what any job says about its time. */
export const jobWords = strings('job');

/** Seconds a duration sensor holds, by its unit (Bambu Lab counts minutes, Moonraker seconds); null when unknown. */
export function durationSeconds(value: number | null, unit: string | undefined): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  switch ((unit ?? 's').toLowerCase()) {
    case 'd':
      return value * 86_400;
    case 'h':
      return value * 3600;
    case 'min':
    case 'm':
      return value * 60;
    case 'ms':
      return value / 1000;
    default:
      return value;
  }
}

/**
 * How a clock is read: `h:mm:ss` takes hours, minutes and seconds, no fewer (two figures alone could be minutes and
 * seconds, as a printer's short job might say); `h:mm` also takes hours and minutes alone, for a job counted in hours
 * (an appliance's cycle, which no one times to the second).
 */
export type ClockForm = 'h:mm:ss' | 'h:mm';

/**
 * Seconds a clock reads ("01:02:03", the older Snapmaker's durations and LG's older integration's; "1:35" where the
 * form allows it); null for anything else.
 */
export function clockSeconds(text: string | undefined, form: ClockForm = 'h:mm:ss'): number | null {
  const trimmed = (text ?? '').trim();
  const full = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(trimmed);
  if (full) {
    const [, hours, minutes, seconds] = full;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  const short = form === 'h:mm' ? /^(\d+):([0-5]\d)$/.exec(trimmed) : null;
  if (!short) return null;
  const [, hours, minutes] = short;
  return Number(hours) * 3600 + Number(minutes) * 60;
}

/**
 * The time left and the time it ends. The finish time the integration reports wins for when (it does not drift a
 * minute between updates as now + whole minutes left does), its remaining time for how long; each stands in for the
 * other where it is missing. Null where neither is known.
 */
export function timeLeft(
  remaining: number | null,
  finish: number | null,
  now: number,
): { readonly left: number | null; readonly at: number | null } {
  return {
    left: remaining ?? (finish !== null ? Math.max(0, (finish - now) / 1000) : null),
    at: finish ?? (remaining !== null ? now + remaining * 1000 : null),
  };
}

/**
 * When a finished job finished: the finish time the integration reports (in the past by now), else when it said so
 * (its status's last change). Never now: a job reports nothing left once done.
 */
export function finishedAt(
  finish: number | null,
  changed: number | null,
  now: number,
): number | null {
  if (finish !== null && finish <= now + 60_000) return finish;
  return changed;
}

/** How long the job has run: the integration's own count (Moonraker's), else since it started, while it runs. */
export function elapsedSeconds(
  counted: number | null,
  start: number | null,
  now: number,
): number | null {
  if (counted !== null) return counted;
  return start !== null && start <= now ? (now - start) / 1000 : null;
}

/** What a running job's sources say, each null where the integration says nothing of it (seconds, ms, percent). */
export interface JobSources {
  /** Its remaining time, in seconds. */
  readonly remaining: number | null;
  /** When it ends, as the integration says (ms). */
  readonly finish: number | null;
  /** How long the whole job takes, in seconds (LG's "Total time"). */
  readonly total: number | null;
  /** How long it has run, by the integration's own count, in seconds. */
  readonly elapsed: number | null;
  /** Its progress as the integration says it, 0–100. */
  readonly progress: number | null;
  /** When it started (ms): a start time it reports, or when its status turned to running. */
  readonly started: number | null;
}

/** A running job's times, each worked out from whatever its sources give. */
export interface JobClock {
  /** Seconds left. */
  readonly left: number | null;
  /** When it ends (ms). */
  readonly at: number | null;
  /** Seconds in all. */
  readonly total: number | null;
  /** Seconds so far. */
  readonly elapsed: number | null;
  /** 0–100. */
  readonly progress: number | null;
}

/**
 * A running job's times from whatever its integration says: the time left from its remaining time or its finish
 * time; when it ends from its finish time (it does not drift), else now and the time left; the whole from its total,
 * else what has run and what is left, else the end less the start; the progress as it says it, else what is left of
 * the whole, else what has run of it. A source missing leaves its line unsaid, never a guess at zero.
 */
export function jobClock(sources: JobSources, now: number): JobClock {
  const { left, at } = timeLeft(sources.remaining, sources.finish, now);
  const elapsed = elapsedSeconds(sources.elapsed, sources.started, now);
  const total =
    sources.total ??
    (elapsed !== null && left !== null
      ? elapsed + left
      : at !== null && sources.started !== null && at > sources.started
        ? (at - sources.started) / 1000
        : null);
  const clamp = (percent: number): number => Math.min(100, Math.max(0, percent));
  const progress =
    sources.progress !== null
      ? clamp(sources.progress)
      : left !== null && total
        ? clamp((1 - left / total) * 100)
        : elapsed !== null && left !== null && elapsed + left > 0
          ? clamp((elapsed / (elapsed + left)) * 100)
          : null;
  return {
    left,
    at,
    total,
    elapsed: elapsed ?? (total !== null && left !== null ? Math.max(0, total - left) : null),
    progress,
  };
}

/** A moment as a line says it: its time, its calendar day against today's, the day it falls on, and how long ago. */
export interface When {
  /** "14:32", in the house's clock. */
  readonly time: string;
  /** The calendar days from today to the moment's, on the house's calendar: 0 today, −1 yesterday, 1 tomorrow. */
  readonly days: number;
  /** The day it falls on: its weekday within the week ("Fri"), else its date, so a job eight days long never reads like tomorrow's. */
  readonly day: string;
  /** Another day, as how long ago it was: "yesterday", "2 days ago" ('' for today's). */
  readonly ago: string;
}

/**
 * When a moment is, by the house's calendar — the one its times are written in: a job finished yesterday morning
 * finished yesterday, whatever the hours say, and a viewer away from home reads the house's days.
 */
export function when(hass: HomeAssistant | undefined, at: number, now: number): When {
  const zone = houseZone(hass);
  const midnight = (d: Date): number => {
    const wall = wallClock(d, zone);
    return Date.UTC(wall.year, wall.month - 1, wall.day);
  };
  const moment = new Date(at);
  const days = Math.round((midnight(moment) - midnight(new Date(now))) / 86_400_000);
  return {
    time: formatTime(hass, moment),
    days,
    day: formatDate(hass, moment, days < 6 ? 'weekday' : 'short'),
    ago:
      days === -1
        ? localize(hass, 'time.yesterday')
        : days !== 0
          ? localize(hass, 'time.days_ago', { n: Math.abs(days) })
          : '',
  };
}

/** What a "when" line says: when the job will be ready, when it is to start, or when it finished. */
export type WhenKind = 'ready' | 'start' | 'done';

/**
 * The line that says when, in the job's words: "Ready at 14:32" today, another day's with its weekday ("Ready Fri at
 * 05:27"); "Starts at 02:00" for a job waiting to start; a job finished today by its time ("Finished at 14:32"),
 * before today by how long ago ("Finished yesterday", "Finished 2 days ago").
 */
export function whenText(
  hass: HomeAssistant | undefined,
  kind: WhenKind,
  at: number,
  now: number,
): string {
  const { time, days, day, ago } = when(hass, at, now);
  if (kind === 'done')
    return days === 0
      ? jobWords(hass, 'done_at', { time })
      : jobWords(hass, 'done_ago', { when: ago });
  if (kind === 'start')
    return days === 0
      ? jobWords(hass, 'starts_at', { time })
      : jobWords(hass, 'starts_on', { day, time });
  return days === 0
    ? jobWords(hass, 'ready_at', { time })
    : jobWords(hass, 'ready_on', { day, time });
}
