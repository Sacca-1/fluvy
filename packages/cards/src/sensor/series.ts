/**
 * The sensors on one chart, as the config names them: the card's own sensor and up to two more (`entities`), each a
 * bare id or an entry with its name, icon and colour. What each one is called under its readout is decided here too.
 */

export interface SensorItem {
  readonly entity: string;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
}

/** The card's own sensor and up to two more: three readouts still read in a phone's column. */
export const MOST = 3;

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
 * and "Humidity" with nothing set, and two temperatures keep their names apart.
 */
export function labelOf(
  item: { readonly name?: string },
  sensor: { readonly name: string; readonly deviceClass?: string },
  title: string,
  measureWord: string,
  measuresOnChart: ReadonlyArray<string | undefined>,
): string {
  if (item.name) return item.name;
  const alone =
    sensor.deviceClass !== undefined &&
    measuresOnChart.filter((c) => c === sensor.deviceClass).length === 1;
  if (alone && measureWord) return measureWord;
  return nameUnder(sensor.name, title);
}
