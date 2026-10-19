import { house, type Handler } from './houses.js';

/**
 * Issue #23's house, for the energy card's `sources` frames: a hybrid inverter with the sun on its DC side and a
 * battery that charges hard at midday. Its POWER sensors are right (the sun, the grid signed, the battery signed); its
 * ENERGY meters are what such a house often has — they tick in 0.1 kWh steps, and the "solar" meter is the inverter's
 * AC output (the sun less what went into the battery, plus what came out of it at night). The recorder was down from
 * 03:00 to 03:30. Home Assistant's own "Power sources" graph draws this house right from the power sensors; a chart
 * drawn from the meters cannot.
 *
 * The same day is also drawn with a bigger roof and a battery that stays low (issue #28): the export runs deep under
 * the line, and the state of charge must still read above it.
 */

/** The sheet's midnight in the browser's own zone, as the card counts its day (a runner in UTC and a desk in Madrid differ). */
const DAY = new Date(2026, 8, 17).getTime();
const STEP = 300_000;
/** The sheet's moment, 21:47: buckets up to it. */
const BUCKETS = 262;
const GAP = new Set(Array.from({ length: 6 }, (_, i) => 36 + i)); // 03:00–03:30

interface Bucket {
  readonly sun: number;
  readonly house: number;
  readonly charge: number;
  readonly discharge: number;
  readonly imported: number;
  readonly exported: number;
}

/** What tells one house's day from another's: the sun's peak, the charger's limit and the battery's charge at midnight. */
interface Profile {
  /** The sun's peak (kW). */
  readonly sun: number;
  /** The most the battery takes in (kW). */
  readonly charge: number;
  /** Its charge at midnight (%). */
  readonly midnight: number;
  /** The most it gives back at night (kW). */
  readonly discharge: number;
}

/** The day in kW, a value a five-minute bucket: a bell of sun, a charge at midday under the charger's limit, the battery at night. */
function day(profile: Profile): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < BUCKETS; i++) {
    const h = (i * 5 + 2.5) / 60;
    const sun = profile.sun * Math.max(0, Math.sin(((h - 7) / 12) * Math.PI));
    const house =
      1.0 +
      0.4 * Math.exp(-((h - 7.5) ** 2) / 1.2) +
      0.6 * Math.exp(-((h - 13.5) ** 2) / 0.5) +
      1.2 * Math.exp(-((h - 19.5) ** 2) / 3);
    const window = h > 9 && h < 15 ? Math.sin(((h - 9) / 6) * Math.PI) : 0;
    const charge = Math.min(profile.charge, Math.max(0, sun - house)) * window;
    const night = h < 7.5 || h > 17;
    const discharge = night ? Math.min(house, profile.discharge) : 0;
    const exported = Math.max(0, sun - house - charge);
    const imported = Math.max(0, house - sun - discharge);
    out.push({ sun, house, charge, discharge, imported, exported });
  }
  return out;
}

/**
 * Issue #49's day, as its screenshot reads: the battery filled from the grid in the cheap night hours, the grid
 * through the morning, a heavy load at midday (a car on its charger) that the sun and the battery carry together —
 * at 11:57 the sun 5.6 kW and the battery 4.2 on top of it, 9.8 in all — then the sun's surplus into the battery
 * and out to the grid, and the battery through the evening. Its charge runs 50 → 75 → 41 → 86 → 52 %.
 */
function issueDay(): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < BUCKETS; i++) {
    const h = (i * 5 + 2.5) / 60;
    // the sun climbs to its 8.6 kW plateau by 13:30 (slowly: 5.6 at noon) and drops behind the roof at 17:45
    const sun =
      h < 8.25 || h > 17.75
        ? 0
        : h < 13.5
          ? 8.6 * ((h - 8.25) / 5.25) ** 1.25
          : h < 15.5
            ? 8.6
            : 8.6 * Math.cos(((h - 15.5) / 2.25) * (Math.PI / 2));
    const car = h > 10.75 && h < 13.5 ? 9.35 * Math.sin(((h - 10.75) / 2.75) * Math.PI) ** 0.8 : 0;
    // a heat pump through the afternoon (3.4 kW, eased in and out), so the export stays under 5 kW
    const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - Math.cos(x * Math.PI)) / 2);
    const pump = 3.4 * Math.min(ease((h - 13) / 0.5), ease((17.25 - h) / 0.75));
    const house =
      0.55 +
      0.9 * Math.exp(-((h - 7.2) ** 2) / 0.8) +
      0.6 * Math.exp(-((h - 8.6) ** 2) / 0.3) +
      1.3 * Math.exp(-((h - 19.5) ** 2) / 2) +
      car +
      pump;
    // the cheap hours charge the battery from the grid; the sun’s surplus in the afternoon, up to 1.8 kW
    const night = h > 0.5 && h < 3 ? 1.5 : 0;
    const surplus = Math.max(0, sun - house);
    const charge = night || (h > 13.5 && h < 17.5 ? Math.min(1.8, surplus) : 0);
    const discharge = (car > 0 || h > 17.75) && house > sun ? Math.min(4.5, house - sun) : 0;
    const exported = Math.max(0, surplus - (night ? 0 : charge));
    const imported = Math.max(0, house + night - sun - discharge);
    out.push({ sun, house, charge, discharge, imported, exported });
  }
  return out;
}

/** A meter's five-minute changes when it counts in 0.1 kWh steps: the cumulative energy floored to the step. */
function ticks(kw: readonly number[]): number[] {
  let total = 0;
  let shown = 0;
  return kw.map((p) => {
    total += p / 12;
    const next = Math.floor(total * 10 + 1e-9) / 10;
    const change = next - shown;
    shown = next;
    return change;
  });
}

/** The battery's usable capacity (kWh). */
const CAPACITY = 15;

/**
 * One house's day as its recorder holds it: the power sensors' means, the meters' changes, the battery's charge. Each
 * house has its own sensor ids (`sensor.<prefix>_…`): the card remembers a sensor's day by its id. `gap`: the
 * buckets its recorder missed (03:00–03:30 unless said otherwise).
 */
function record(
  profile: Profile,
  prefix: string,
  D: readonly Bucket[] = day(profile),
  gap: ReadonlySet<number> = GAP,
) {
  const id = (name: string): string => `sensor.${prefix}_${name}`;
  const series = (pick: (b: Bucket) => number): number[] => D.map(pick);
  /** Its state of charge through the day: what went in less what came out, at the end of each five minutes. */
  let level = profile.midnight;
  const levels = D.map((b) => {
    level = Math.min(100, Math.max(0, level + (((b.charge - b.discharge) / 12) * 100) / CAPACITY));
    return level;
  });
  /** The power sensors' five-minute means (kW): the truth. */
  const means: Record<string, number[]> = {
    [id('pv')]: series((b) => b.sun),
    [id('grid')]: series((b) => b.imported - b.exported),
    [id('battery')]: series((b) => b.discharge - b.charge),
    [id('soc')]: levels,
    [id('battery_2')]: series(() => 0),
  };
  /** The energy meters' five-minute changes (kWh): coarse, and the "solar" meter is the inverter's AC side. */
  const meters: Record<string, number[]> = {
    [id('solar_energy')]: ticks(series((b) => Math.max(0, b.sun - b.charge) + b.discharge)),
    [id('grid_in_energy')]: ticks(series((b) => b.imported)),
    [id('grid_out_energy')]: ticks(series((b) => b.exported)),
    [id('battery_out_energy')]: ticks(series((b) => b.discharge)),
    [id('battery_in_energy')]: ticks(series((b) => b.charge)),
  };
  const rows = (id: string, mean: boolean) => {
    const list = (mean ? means : meters)[id];
    if (!list) return [];
    return list.flatMap((value, i) =>
      gap.has(i)
        ? []
        : [
            mean
              ? { start: DAY + i * STEP, end: DAY + (i + 1) * STEP, mean: value }
              : { start: DAY + i * STEP, change: value },
          ],
    );
  };
  /** The hourly changes the legend of the meters' path reads (the Energy dashboard's arithmetic). */
  const hourly = (id: string) => {
    const list = meters[id] ?? [];
    const hours = new Map<number, number>();
    list.forEach((value, i) => {
      if (gap.has(i)) return;
      const hour = Math.floor(i / 12);
      hours.set(hour, (hours.get(hour) ?? 0) + value);
    });
    return [...hours.entries()].map(([hour, change]) => ({ start: DAY + hour * 3600_000, change }));
  };
  const statistics: Handler = (message) =>
    Object.fromEntries(
      ((message['statistic_ids'] as string[] | undefined) ?? []).map((id) => {
        const types = (message['types'] as string[] | undefined) ?? [];
        if (types.includes('mean')) return [id, rows(id, true)];
        return [id, message['period'] === '5minute' ? rows(id, false) : hourly(id)];
      }),
    );
  return { prefix, means, levels, statistics };
}

/** Issue #23's house: a 6 kW bell of sun, a 4.5 kW charge at midday, the battery at 70 % at midnight. */
const HYBRID = record({ sun: 6.2, charge: 4.5, midnight: 70, discharge: 1.3 }, 'hy');
/** Issue #28's: a 9.5 kW roof whose export runs deep, and a small battery that stays between 25 and 45 %. */
const HEAVY_EXPORT = record({ sun: 9.5, charge: 0.5, midnight: 45, discharge: 0.4 }, 'hy2');

const prefs = (power: boolean, batteries = 1, capacity = true, prefix = 'hy') => {
  const id = (name: string): string => `sensor.${prefix}_${name}`;
  return {
    energy_sources: [
      {
        type: 'grid',
        stat_energy_from: id('grid_in_energy'),
        stat_energy_to: id('grid_out_energy'),
        ...(power ? { stat_rate: id('grid') } : {}),
      },
      {
        type: 'solar',
        stat_energy_from: id('solar_energy'),
        ...(power ? { stat_rate: id('pv') } : {}),
      },
      // a second battery idles all day: it only says its own charge
      ...Array.from({ length: batteries }, (_, i) => ({
        type: 'battery',
        stat_energy_from: i === 0 ? id('battery_out_energy') : id('battery_2_out_energy'),
        stat_energy_to: i === 0 ? id('battery_in_energy') : id('battery_2_in_energy'),
        ...(power ? { stat_rate: i === 0 ? id('battery') : id('battery_2') } : {}),
        stat_soc: i === 0 ? id('soc') : id('soc_2'),
        ...(capacity ? { capacity: CAPACITY } : {}),
      })),
    ],
    device_consumption: [],
  };
};

/** The house with its power sensors in the Energy dashboard, and the same house with its meters alone. */
export const hybridWithPower = house({
  'energy/get_prefs': () => prefs(true),
  'recorder/statistics_during_period': HYBRID.statistics,
});
export const hybridMetersOnly = house({
  'energy/get_prefs': () => prefs(false),
  'recorder/statistics_during_period': HYBRID.statistics,
});
/** Two batteries that do not state their capacity: their group's charge cannot be known (no line, "—"). */
export const hybridTwoBatteries = house({
  'energy/get_prefs': () => prefs(true, 2, false),
  'recorder/statistics_during_period': HYBRID.statistics,
});
/** The house without its battery. */
export const hybridNoBattery = house({
  'energy/get_prefs': () => prefs(true, 0),
  'recorder/statistics_during_period': HYBRID.statistics,
});
/** The bigger roof: its battery reads its own low charge, live and through the day. */
export const hybridHeavyExport = house({
  'energy/get_prefs': () => prefs(true, 1, true, HEAVY_EXPORT.prefix),
  'recorder/statistics_during_period': HEAVY_EXPORT.statistics,
});

/** Issue #49's house (its day in `issueDay`, its recorder never down), with its power sensors in the Energy dashboard. */
const ISSUE_DAY = issueDay();
const ISSUE_49 = record(
  { sun: 8.6, charge: 1.8, midnight: 50, discharge: 4.5 },
  'i49',
  ISSUE_DAY,
  new Set(),
);
export const hybridIssue49 = house({
  'energy/get_prefs': () => prefs(true, 1, true, ISSUE_49.prefix),
  'recorder/statistics_during_period': ISSUE_49.statistics,
});

/** Its live sensors at 21:47 (kW): the day's last five minutes, and the house's own power sensor (the card's "…"). */
const kw = (value: number): string => String(Math.round(value * 100) / 100);
const lastMean = (id: string): string => kw(ISSUE_49.means[id]?.[BUCKETS - 1] ?? 0);
export const ISSUE_49_STATES = [
  ['sensor.i49_pv', lastMean('sensor.i49_pv'), 'Inverter PV power'],
  ['sensor.i49_grid', lastMean('sensor.i49_grid'), 'Grid power'],
  ['sensor.i49_battery', lastMean('sensor.i49_battery'), 'Battery power'],
  ['sensor.i49_battery_2', '0', 'Second battery power'],
  ['sensor.i49_house', kw(ISSUE_DAY[BUCKETS - 1]?.house ?? 0), 'House power'],
] as const;

/** Their live sensors at 21:47: the sun down, the battery carrying the evening, a little from the grid. */
export const HYBRID_STATES = [
  ['sensor.hy_pv', '0', 'Inverter PV power'],
  ['sensor.hy_grid', '0.3', 'Grid power'],
  ['sensor.hy_battery', '1.3', 'Battery power'],
  ['sensor.hy_battery_2', '0', 'Second battery power'],
  ['sensor.hy2_pv', '0', 'Inverter PV power'],
  ['sensor.hy2_grid', '1.2', 'Grid power'],
  ['sensor.hy2_battery', '0.4', 'Battery power'],
] as const;

const last = (levels: readonly number[]): string =>
  String(Math.round(levels[levels.length - 1] ?? 0));

/** Their batteries' charge at 21:47 (%): the first, a second one for the two-battery house, the bigger roof's low one. */
export const HYBRID_LEVELS = [
  ['sensor.hy_soc', last(HYBRID.levels)],
  ['sensor.hy_soc_2', '48'],
  ['sensor.hy2_soc', last(HEAVY_EXPORT.levels)],
  ['sensor.i49_soc', last(ISSUE_49.levels)],
] as const;

/** What the suite compares with: the sun's power at noon and at 02:00 (kW). */
export const HYBRID_EXPECT = {
  sunAtNoon: HYBRID.means['sensor.hy_pv']?.[144] ?? 0,
  /** The battery's charge at noon (%), on its own scale. */
  levelAtNoon: HYBRID.levels[144] ?? 0,
  /** The bigger roof's battery, at its highest through the day (%): never far above the line's foot. */
  lowPeak: Math.max(...HEAVY_EXPORT.levels),
};
