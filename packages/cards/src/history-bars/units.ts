/**
 * The units Home Assistant's statistics convert between (its `EnergyConverter`, `PowerConverter`, `VolumeConverter`
 * and `DistanceConverter`), each by its factor to its class's base: what a card's own `unit` may ask of the recorder
 * (`units` in a statistics request) and what a live reading or a history state is brought into, so a rain gauge in
 * millimetres reads in inches whichever way its figures come. A unit of another class, or one no converter knows, is
 * not convertible: the card keeps the sensor's own.
 */

export type UnitClass = 'energy' | 'power' | 'volume' | 'distance';

/** Each class's units by their factor to its base: Wh, W, L and m. */
const FACTORS: Readonly<Record<UnitClass, Readonly<Record<string, number>>>> = {
  energy: {
    Wh: 1,
    kWh: 1e3,
    MWh: 1e6,
    GWh: 1e9,
    TWh: 1e12,
    MJ: 1e6 / 3600,
    GJ: 1e9 / 3600,
  },
  power: { mW: 1e-3, W: 1, kW: 1e3, MW: 1e6, GW: 1e9 },
  volume: {
    mL: 1e-3,
    L: 1,
    'fl. oz.': 0.0295735295625,
    gal: 3.785411784,
    'm³': 1e3,
    'ft³': 28.316846592,
    CCF: 2831.6846592,
  },
  distance: {
    mm: 1e-3,
    cm: 1e-2,
    m: 1,
    km: 1e3,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
  },
};

const CLASSES = Object.keys(FACTORS) as UnitClass[];

/** The class a unit belongs to, or undefined for one no converter knows. */
export const unitClass = (unit: string): UnitClass | undefined =>
  CLASSES.find((name) => Object.hasOwn(FACTORS[name], unit.trim()));

/** Whether a value in `from` can be read in `to`: the same unit, or two of one class. */
export const convertible = (from: string, to: string): boolean =>
  from.trim() === to.trim() || (unitClass(from) !== undefined && unitClass(from) === unitClass(to));

/** A value in `from` read in `to`; the value as it is where the two do not convert. */
export function convert(value: number, from: string, to: string): number {
  const kind = unitClass(from);
  if (!kind || kind !== unitClass(to)) return value;
  return (value * (FACTORS[kind][from.trim()] as number)) / (FACTORS[kind][to.trim()] as number);
}

/** The `units` a statistics request asks for to answer in `unit`; none for a unit no converter knows. */
export const unitsFor = (unit: string): Readonly<Record<string, string>> | undefined => {
  const kind = unitClass(unit);
  return kind ? { [kind]: unit.trim() } : undefined;
};
