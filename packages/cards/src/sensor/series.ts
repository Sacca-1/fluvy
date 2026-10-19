/**
 * The sensors on one chart, as the config names them: the card's own sensor and up to two more (`entities`), each a
 * bare id or an entry with its name, icon and colour. What each one is called under its readout is decided here too.
 */

import type { Tone } from '@fluvy/ui';

export interface SensorItem {
  readonly entity: string;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
}

/** The card's own sensor and up to two more: three readouts still read in a phone's column. */
export const MOST = 3;

/** The tones a second and third curve take when their measure's would repeat the first's, or sit too close to it. */
export const SPARE_TONES: readonly Tone[] = ['accent', 'water', 'solar', 'grid', 'heat'];

/**
 * The tone each curve is drawn in: the one its measure asks for, unless an earlier curve already wears it or an ink
 * closer than `gate` (the palette engine's own distance between graph series, ΔE2000): then the first spare tone
 * that stands far enough from every earlier curve, else the farthest of them. A curve with a colour of its own
 * (`own`: the user's hex) keeps it, and the others keep away from it; one with no ink (`off`) is left as it is.
 * `inkOf` says what a tone or a hex is drawn in on the palette the card wears.
 */
export function seriesTones(
  curves: readonly { readonly tone: Tone; readonly own?: string | undefined }[],
  inkOf: (source: string) => string | undefined,
  distance: (a: string, b: string) => number,
  gate: number,
): Tone[] {
  const inks: string[] = [];
  const apart = (ink: string | undefined): number =>
    ink === undefined ? Infinity : Math.min(Infinity, ...inks.map((other) => distance(ink, other)));
  return curves.map(({ tone, own }) => {
    if (own) {
      const ink = inkOf(own);
      if (ink) inks.push(ink);
      return tone;
    }
    const ink = inkOf(tone);
    if (!ink || apart(ink) >= gate) {
      if (ink) inks.push(ink);
      return tone;
    }
    // the first spare tone far enough from every curve so far, else the farthest of them
    let best = tone;
    let farthest = apart(ink);
    for (const spare of SPARE_TONES) {
      const spareInk = inkOf(spare);
      const gap = apart(spareInk);
      if (gap >= gate) {
        inks.push(spareInk as string);
        return spare;
      }
      if (gap > farthest) {
        best = spare;
        farthest = gap;
      }
    }
    const bestInk = inkOf(best);
    if (bestInk) inks.push(bestInk);
    return best;
  });
}

/** The other sensors on the chart, as entries (a bare id, or its name, icon and colour), two at most. */
export function normaliseExtras(raw: unknown): SensorItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: unknown): SensorItem | null =>
      typeof entry === 'string'
        ? { entity: entry }
        : entry && typeof entry === 'object' && typeof (entry as SensorItem).entity === 'string'
          ? (entry as SensorItem)
          : null,
    )
    .filter((item): item is SensorItem => item !== null && item.entity !== '')
    .slice(0, MOST - 1);
}

const capitalise = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * A sensor's name under the card's head: what it says beyond the head ("Living room temperature" under "Living room" is
 * "Temperature"), else its whole name.
 */
export function nameUnder(name: string, title: string): string {
  const head = title.trim().toLocaleLowerCase();
  const rest = name.toLocaleLowerCase().startsWith(`${head} `)
    ? name.slice(head.length).trim()
    : '';
  return rest ? capitalise(rest) : name;
}

/**
 * What a sensor is called under its readout when several share the chart: its own name from the config; else the word
 * of its measure (Home Assistant's "Temperature", "Humidity") when no other sensor on the chart measures the same; else
 * its name beyond the head. So a room's "Office climate temperature" and "Office climate humidity" read "Temperature"
 * and "Humidity" with nothing set, and two temperatures keep their names apart. A sensor that is not there has no name
 * nor measure to say: the last word of its id stands for its measure, as ids end in it ("…_humidity" is "Humidity").
 */
export function labelOf(
  item: { readonly name?: string },
  sensor: {
    readonly id?: string;
    readonly name: string;
    readonly deviceClass?: string;
    readonly status?: string;
  },
  title: string,
  measureWord: string,
  measuresOnChart: ReadonlyArray<string | undefined>,
): string {
  if (item.name) return item.name;
  if (sensor.status === 'missing' && sensor.id) return capitalise(sensor.id.replace(/.*[._]/, ''));
  const alone =
    sensor.deviceClass !== undefined &&
    measuresOnChart.filter((c) => c === sensor.deviceClass).length === 1;
  if (alone && measureWord) return measureWord;
  return nameUnder(sensor.name, title);
}
