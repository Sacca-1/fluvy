import { TONES, type Tone } from '@fluvy/ui';

export interface SensorBand {
  from: number;
  to: number;
  tone: Tone;
}
export interface SensorReference {
  value: number;
  label?: string;
}
export interface BandScale {
  min?: number;
  max?: number;
  bands?: readonly SensorBand[];
  references?: readonly SensorReference[];
}

/** Validate before rendering: malformed YAML must never produce misleading geometry. */
export function validateScale(config: BandScale): void {
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(max - min))
    throw new Error('Sensor band: min and max must be finite, with min < max');
  if (config.bands !== undefined && !Array.isArray(config.bands))
    throw new Error('Sensor band: bands must be an array');
  if (config.references !== undefined && !Array.isArray(config.references))
    throw new Error('Sensor band: references must be an array');
  let end = min;
  for (const band of config.bands ?? []) {
    if (
      !band ||
      !Number.isFinite(band.from) ||
      !Number.isFinite(band.to) ||
      band.from < end ||
      band.to <= band.from ||
      band.to > max ||
      !TONES.includes(band.tone)
    )
      throw new Error(
        'Sensor band: bands must be ordered, non-overlapping, inside the scale, with a Fluvy tone',
      );
    end = band.to;
  }
  for (const ref of config.references ?? []) {
    if (
      !ref ||
      !Number.isFinite(ref.value) ||
      ref.value < min ||
      ref.value > max ||
      (ref.label !== undefined && typeof ref.label !== 'string')
    )
      throw new Error(
        'Sensor band: references must have a finite value inside the scale and an optional text label',
      );
  }
}

export const fraction = (value: number, min: number, max: number): number =>
  Math.min(1, Math.max(0, (value - min) / (max - min)));

/** Keep every reference readable on narrow columns; crowded labels move to another line. */
export function placeLabels(
  items: readonly { fraction: number; text: string; width: number }[],
  width: number,
): Array<{ text: string; left: number; width: number; lane: number }> {
  const ends: number[] = [];
  return [...items]
    .sort((a, b) => a.fraction - b.fraction)
    .map((item) => {
      const size = Math.min(width, Math.max(0, item.width));
      const left = Math.max(0, Math.min(width - size, item.fraction * width - size / 2));
      let lane = ends.findIndex((end) => end + 8 <= left);
      if (lane < 0) lane = ends.length;
      ends[lane] = left + size;
      return { text: item.text, left, width: size, lane };
    });
}
