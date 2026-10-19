import type { HassEntity, HomeAssistant } from '@fluvy/core';

/*
 * An appliance on a smart plug — how most "smart" washers are — read from what the plug draws: it runs while it draws
 * `running_power` (5 W) or more; it has finished once it has drawn less for `finished_after` (3 min); between the two,
 * under half the running power and back, it keeps what it was (a washer soaking or pausing is not done). When it
 * started and when it finished come from the plug's history over the last twelve hours (one fetch, the recorder's raw
 * states), then from its live states. A threshold sensor on the plug (Home Assistant's threshold helper) says it
 * outright: on is running, and its last change is when. What a cycle used is its energy meter's gain since it
 * started, else what it drew, added up.
 */

/** Watts from which an appliance on a plug runs, and minutes under them before its cycle is over. */
export const RUNNING_POWER = 5;
export const FINISHED_AFTER = 3;
/** Under this share of the running power a reading is low; between it and the running power the cycle keeps its state. */
const LOW = 0.5;
/** The plug's history a card reads: the last twelve hours. */
export const LOOK_BACK = 12 * 3_600_000;

/** A reading at a moment (ms): watts, or a meter's kilowatt-hours. */
export interface Point {
  readonly at: number;
  readonly value: number;
}

export interface PlugSettings {
  /** Watts from which it runs. */
  readonly running: number;
  /** Ms under them before a cycle is over. */
  readonly finishedAfter: number;
  /** Ms a finished cycle is remembered. */
  readonly doneFor: number;
}

/** A plug's last cycle: whether it runs, has just finished or rests, and when it started and finished. */
export interface PlugCycle {
  readonly status: 'running' | 'finished' | 'idle';
  readonly start: number | null;
  readonly end: number | null;
}

const IDLE: PlugCycle = { status: 'idle', start: null, end: null };

/**
 * The last cycle a plug's power readings tell, oldest first: a cycle starts at the first reading at the running
 * power, and ends where the power fell under half of it and stayed there `finishedAfter` — a reading back at the
 * running power before then is the same cycle (a soak, a pause).
 */
export function cycleOf(points: readonly Point[], now: number, settings: PlugSettings): PlugCycle {
  const low = settings.running * LOW;
  let running = false;
  let start: number | null = null;
  let end: number | null = null;
  let lowSince: number | null = null;
  for (const point of [...points].sort((a, b) => a.at - b.at)) {
    // a low that lasted long enough before this reading ended the cycle where it began
    if (running && lowSince !== null && point.at - lowSince >= settings.finishedAfter) {
      running = false;
      end = lowSince;
      lowSince = null;
    }
    if (!running) {
      if (point.value >= settings.running) {
        running = true;
        start = point.at;
        end = null;
        lowSince = null;
      }
    } else if (point.value < low) lowSince ??= point.at;
    else if (point.value >= settings.running) lowSince = null;
  }
  if (running && lowSince !== null && now - lowSince >= settings.finishedAfter) {
    running = false;
    end = lowSince;
  }
  if (running) return { status: 'running', start, end: null };
  if (end !== null && start !== null && now - end <= settings.doneFor)
    return { status: 'finished', start, end };
  return { ...IDLE, start, end };
}

/** A threshold sensor's cycle: on is running since it turned on; off is finished from when it turned off, a while. */
export function cycleOfFlag(
  state: HassEntity | undefined,
  now: number,
  doneFor: number,
): PlugCycle {
  if (!state || (state.state !== 'on' && state.state !== 'off')) return IDLE;
  const changed = Date.parse(state.last_changed);
  if (!Number.isFinite(changed)) return IDLE;
  if (state.state === 'on') return { status: 'running', start: changed, end: null };
  return now - changed <= doneFor
    ? { status: 'finished', start: null, end: changed }
    : { ...IDLE, end: changed };
}

/** A meter's reading at a moment: the last at or before it, null where none is that old. */
export function valueAt(points: readonly Point[], at: number): number | null {
  let value: number | null = null;
  for (const point of points) if (point.at <= at) value = point.value;
  return value;
}

/** What a cycle used, in kWh: what its meter gained since it started (a meter that restarted counts from zero). */
export function energySince(points: readonly Point[], start: number, now: number): number | null {
  const first = valueAt(points, start);
  const last = valueAt(points, now);
  if (first === null || last === null) return null;
  return last >= first ? last - first : last;
}

/** What a plug drew between two moments, in kWh: each reading held until the next (the recorder's steps). */
export function drawn(points: readonly Point[], from: number, to: number): number {
  let wattHours = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i] as Point;
    const next = points[i + 1]?.at ?? to;
    const a = Math.max(from, point.at);
    const b = Math.min(to, next);
    if (b > a) wattHours += (point.value * (b - a)) / 3_600_000;
  }
  return wattHours / 1000;
}

/** A reading in its base unit: watts for power, kilowatt-hours for energy; null where it is not a number. */
export function inBase(value: unknown, unit: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (typeof value === 'string' && !/\d/.test(value)) return null;
  if (!Number.isFinite(n)) return null;
  switch (unit) {
    case 'kW':
      return n * 1000;
    case 'MW':
      return n * 1_000_000;
    case 'Wh':
      return n / 1000;
    case 'MWh':
      return n * 1000;
    default:
      return n;
  }
}

/** A row of `history/history_during_period` (minimal, no attributes): its state and when it was written (s). */
interface HistoryRow {
  readonly s: string;
  readonly lu?: number;
  readonly lc?: number;
}

/** The entities a plug's cycle is read from. */
export interface PlugEntities {
  readonly watts?: string | undefined;
  readonly energy?: string | undefined;
}

/** The plug's readings, as `PlugHistory` keeps them. */
export interface PlugReadings {
  readonly watts: readonly Point[];
  readonly energy: readonly Point[];
  /** The history has been read (or could not be): the cycle is the history's, not the live states' alone. */
  readonly loaded: boolean;
}

/**
 * A card's plug history: the last twelve hours of its power and its meter, fetched once (the recorder's raw states,
 * as one call), then kept by the live states as they come. Fetched again only for other entities.
 */
export class PlugHistory {
  private key = '';
  private watts: Point[] = [];
  private energy: Point[] = [];
  private loaded = false;

  /** `landed`: the history arrived — the card draws again. */
  constructor(private readonly landed: () => void) {}

  read(
    hass: Pick<HomeAssistant, 'callWS' | 'states'> | undefined,
    ids: PlugEntities,
    now: number,
  ): PlugReadings {
    const key = `${ids.watts ?? ''}|${ids.energy ?? ''}`;
    if (key !== this.key && hass) {
      this.key = key;
      this.watts = [];
      this.energy = [];
      this.loaded = false;
      void this.fetch(hass, ids, now, key);
    }
    this.keep(hass?.states[ids.watts ?? ''], this.watts);
    this.keep(hass?.states[ids.energy ?? ''], this.energy);
    return { watts: this.watts, energy: this.energy, loaded: this.loaded };
  }

  /** A live state newer than the last reading kept is kept too. */
  private keep(state: HassEntity | undefined, points: Point[]): void {
    if (!state) return;
    const at = Date.parse(state.last_changed);
    const value = inBase(state.state, state.attributes.unit_of_measurement);
    const last = points[points.length - 1];
    if (value === null || !Number.isFinite(at) || (last && last.at >= at)) return;
    points.push({ at, value });
  }

  private async fetch(
    hass: Pick<HomeAssistant, 'callWS' | 'states'>,
    ids: PlugEntities,
    now: number,
    key: string,
  ): Promise<void> {
    const wanted = [ids.watts, ids.energy].filter((id): id is string => Boolean(id));
    let rows: Record<string, readonly HistoryRow[]> = {};
    try {
      rows = await hass.callWS<Record<string, readonly HistoryRow[]>>({
        type: 'history/history_during_period',
        start_time: new Date(now - LOOK_BACK).toISOString(),
        end_time: new Date(now).toISOString(),
        entity_ids: wanted,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
    } catch {
      // the recorder could not be read: the live states say what they can
    }
    if (key !== this.key) return;
    const unit = (id: string | undefined): unknown =>
      id ? hass.states[id]?.attributes.unit_of_measurement : undefined;
    const points = (id: string | undefined): Point[] =>
      (id ? (rows[id] ?? []) : []).flatMap((row) => {
        const value = inBase(row.s, unit(id));
        const at = (row.lc ?? row.lu ?? NaN) * 1000;
        return value === null || !Number.isFinite(at) ? [] : [{ at, value }];
      });
    // what the history says first, then the live states that came while it was asked
    this.watts = merge(points(ids.watts), this.watts);
    this.energy = merge(points(ids.energy), this.energy);
    this.loaded = true;
    this.landed();
  }
}

/** Two runs of readings as one, oldest first, a moment once. */
const merge = (a: readonly Point[], b: readonly Point[]): Point[] => {
  const byMoment = new Map<number, Point>();
  for (const point of [...a, ...b]) byMoment.set(point.at, point);
  return [...byMoment.values()].sort((x, y) => x.at - y.at);
};
