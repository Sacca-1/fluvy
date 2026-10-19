import { formatNumber, type HomeAssistant } from '@fluvy/core';
import { houseMidnight } from '../energy-model/period.js';
import { stepGain } from '../history-bars/gain.js';

/**
 * A water or gas meter's day, from Home Assistant's long-term statistics: what it has used since the house's
 * midnight, and what a typical day of it is. Everything is in the meter's own unit — the statistics are asked in it
 * (Home Assistant converts a meter whose unit changed over time), so a litre meter reads litres and a gas meter in
 * kWh reads kWh.
 */

export type MeterKind = 'water' | 'gas';
export const METER_KINDS: readonly MeterKind[] = ['water', 'gas'];

export interface StatRow {
  readonly start: number;
  readonly change?: number | null;
  readonly state?: number | null;
}

const HOUR = 3_600_000;

/** The volume units Home Assistant's statistics convert between (its `VolumeConverter`). */
const VOLUME = new Set(['L', 'mL', 'gal', 'fl. oz.', 'm³', 'ft³', 'CCF']);
/** The energy units a gas meter may count in (its `EnergyConverter`). */
const ENERGY = new Set(['Wh', 'kWh', 'MWh', 'MJ', 'GJ']);

/** The `units` a statistics request asks for to read a meter in its own unit; none for a unit it cannot convert. */
export function statUnits(unit: string): Readonly<Record<string, string>> | undefined {
  const u = unit.trim();
  if (VOLUME.has(u)) return { volume: u };
  if (ENERGY.has(u)) return { energy: u };
  return undefined;
}

/** What a meter measures: its device class says; a meter counting energy is gas; anything else is taken as water. */
export function kindOf(
  deviceClass: string,
  unit: string,
  fallback: MeterKind = 'water',
): MeterKind {
  if (deviceClass === 'water') return 'water';
  if (deviceClass === 'gas') return 'gas';
  if (ENERGY.has(unit.trim())) return 'gas';
  return fallback;
}

const finite = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

/**
 * Today's use: every finished hour since midnight (the statistics' change), plus what the meter has gained since the
 * last of them was compiled (its reading now, against the reading that hour ended on), by Home Assistant's own rule
 * (`stepGain`): a meter that reads below 90 % of that has been reset and counts from zero; a smaller dip is a dip.
 * `null` when it cannot be known: no statistics, or no reading now — the hour in progress would be missing, and a day
 * without it is not today.
 */
export function todayOf(
  rows: readonly StatRow[],
  midnight: number,
  live: number | null,
): number | null {
  if (!rows.length || live === null) return null;
  let finished = 0;
  let baseline: number | null = null;
  for (const row of [...rows].sort((a, b) => a.start - b.start)) {
    if (row.start >= midnight) finished += Math.max(0, finite(row.change) ?? 0);
    baseline = finite(row.state) ?? baseline;
  }
  if (baseline === null) return null;
  return finished + stepGain(baseline, live);
}

/** A typical day: the mean of the full days the statistics know (of the last seven). `null` with none. */
export function typicalOf(rows: readonly StatRow[]): number | null {
  const days = rows.map((row) => finite(row.change)).filter((c): c is number => c !== null);
  if (!days.length) return null;
  return days.reduce((sum, c) => sum + Math.max(0, c), 0) / days.length;
}

/** How full today's bar is: today against the typical day, from 0 to 1. */
export function fractionOf(today: number | null, typical: number | null): number {
  if (today === null || typical === null) return 0;
  if (typical <= 0) return today > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, today / typical));
}

/** A meter's figure: "84" L, "2.7" m³, "3.0" m³, "0.04" m³ — the decimal kept so a live figure keeps its width. */
export function meterFigure(hass: HomeAssistant | undefined, value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return formatNumber(hass, 0, { digits: 0 });
  const digits = abs >= 10 ? 0 : abs >= 0.095 ? 1 : 2;
  return formatNumber(hass, value, { digits, minDigits: digits });
}

/* ---------- the statistics ---------- */

const cache = new Map<string, { at: number; promise: Promise<readonly StatRow[] | null> }>();
const TTL = 5 * 60_000;

function ask(
  hass: HomeAssistant,
  key: string,
  message: Record<string, unknown> & { statistic_ids: readonly string[] },
): Promise<readonly StatRow[] | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const id = message.statistic_ids[0] ?? '';
  const promise = hass
    .callWS<Record<string, StatRow[]>>({ type: 'recorder/statistics_during_period', ...message })
    .then((result) => result?.[id] ?? [])
    .catch(() => null);
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * The hours since midnight — from the hour before it, whose reading at its end is where today starts when no hour of
 * today is compiled yet. Asked again each hour (and after five minutes), since the hour in progress is read live.
 */
export function fetchToday(
  hass: HomeAssistant,
  id: string,
  unit: string,
  now: Date,
): Promise<readonly StatRow[] | null> {
  const midnight = houseMidnight(hass, now);
  const units = statUnits(unit);
  return ask(
    hass,
    `today|${id}|${unit}|${midnight.getTime()}|${Math.floor(now.getTime() / HOUR)}`,
    {
      start_time: new Date(midnight.getTime() - HOUR).toISOString(),
      end_time: now.toISOString(),
      statistic_ids: [id],
      period: 'hour',
      types: ['change', 'state'],
      ...(units ? { units } : {}),
    },
  );
}

/** The last seven full days, one row each. */
export function fetchWeek(
  hass: HomeAssistant,
  id: string,
  unit: string,
  now: Date,
): Promise<readonly StatRow[] | null> {
  const midnight = houseMidnight(hass, now);
  const units = statUnits(unit);
  return ask(hass, `week|${id}|${unit}|${midnight.getTime()}`, {
    start_time: houseMidnight(hass, now, 7).toISOString(),
    end_time: midnight.toISOString(),
    statistic_ids: [id],
    period: 'day',
    types: ['change'],
    ...(units ? { units } : {}),
  });
}

export const clearMeterCache = (): void => cache.clear();
