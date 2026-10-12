import type { LovelaceCardConfig } from '@fluvy/core';
import type { FamilyEntry } from './energy-family.js';
import { COMPACT, listLength, ROW } from './shared/heights.js';

/**
 * The security and devices family (the lock, the alarm and its keypad, the camera, the 3D printer), announced at start and defined
 * when its chunk lands (`devices-cards.ts`), as the energy and media families are: what the card picker lists and how
 * tall each card is at a 360 column, without the cards themselves.
 */

/** The rows under a device card (16 above them), none when they are hidden. */
const rowsUnder = (config: LovelaceCardConfig): number => {
  const rows = config['show_rows'] === false ? 0 : listLength(config, ['rows']);
  return rows ? 16 + ROW * rows : 0;
};

/** The lock: the compact head and its slide, then its rows. */
export const lockHeight = (config: LovelaceCardConfig): number =>
  config['variant'] === 'compact' ? COMPACT : COMPACT + rowsUnder(config);

/** The alarm: the head, the state and the mode tiles (300), then its rows; the compact card is one row. */
export const alarmHeight = (config: LovelaceCardConfig): number =>
  config['variant'] === 'compact' ? COMPACT : 300 + rowsUnder(config);

/** The shapes a camera's picture can take (`aspect_ratio`): width over height; `native` is the camera's own. */
export const CAMERA_RATIOS = ['16:9', '4:3', '3:2', '1:1', '2:1', '21:9', 'native'] as const;
export type CameraRatio = (typeof CAMERA_RATIOS)[number];

/**
 * A camera's picture as width over height: one of the named shapes, `w:h` or `w/h` or a height in % of the width
 * (Home Assistant's `aspect_ratio` forms), else 16:9. `native` (the camera's own) is 16:9 until a frame says otherwise.
 */
export function cameraRatio(value: unknown, native?: number): number {
  if (value === 'native') return native && native > 0 ? native : 16 / 9;
  if (typeof value === 'string') {
    const pair = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
    if (pair && Number(pair[2]) > 0) return Number(pair[1]) / Number(pair[2]);
    const percent = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
    if (percent && Number(percent[1]) > 0) return 100 / Number(percent[1]);
  }
  return 16 / 9;
}

/** The lowest a picture goes, whatever its shape: its two rounds (44) with 12 above and below. */
const PLATE_FLOOR = 68;
/** Under this a picture holds its rounds and the live pill, not the clock beside them (they would share a column). */
export const CLOCK_PLATE = 108;
/** Under this a picture's rounds share the rows of "Live" (12 + 24 + 8 + 44 + 12). */
export const ROUNDS_PLATE = 100;

/** A camera's picture in a column: its height for the ratio, on the 4 px grid. */
export const plateHeight = (width: number, ratio: number): number =>
  Math.max(PLATE_FLOOR, Math.round(width / ratio / 4) * 4);

/** The camera: the head and its picture across a 320 column (180 at 16:9), then its rows. */
export const cameraHeight = (config: LovelaceCardConfig): number =>
  100 + plateHeight(320, cameraRatio(config['aspect_ratio'])) + rowsUnder(config);

/**
 * The 3D printer at a 360 column: the row (76), the compact card (the head, the bar, its line and a row of readouts),
 * the full one (the picture at 16:9, the progress with its time left, the bar and its line, the readouts, the buttons).
 */
export const printerHeight = (config: LovelaceCardConfig): number => {
  if (config['variant'] === 'row') return 76;
  // the head (100), the bar (12 + 8) and its line (8 + 20), two rows of readouts (16 + 48 + 12 + 48)
  if (config['variant'] === 'compact') return 244;
  // the progress (16 + 64) over the bar and its line, the readouts as two rows (16 + 48 + 12 + 48); the picture in
  // its shape (16:9 by default) across a 320 column, never taller than 360
  const ratio = cameraRatio(
    typeof config['aspect_ratio'] === 'string' ? config['aspect_ratio'] : undefined,
  );
  const picture = config['show_image'] === false ? 0 : 16 + Math.min(360, plateHeight(320, ratio));
  const controls = config['show_controls'] === false ? 0 : 16 + 44;
  return 100 + picture + 232 + controls;
};

export const DEVICES_FAMILY: readonly FamilyEntry[] = [
  [
    'fluvy-lock-card',
    'Fluvy · Lock',
    'Slide to unlock, never one accidental tap; codes, jammed state, related rows.',
    lockHeight,
  ],
  [
    'fluvy-alarm-card',
    'Fluvy · Alarm',
    'Arm modes as tiles and the keypad sheet for codes.',
    alarmHeight,
  ],
  [
    'fluvy-camera-card',
    'Fluvy · Camera',
    'A still that refreshes itself, or Home Assistant’s live stream, in the shape you choose; tap for the stream.',
    cameraHeight,
  ],
  [
    'fluvy-printer-card',
    'Fluvy · 3D printer',
    'A 3D printer’s job: progress, time left, heaters, layers, filament and the camera; pause, resume and stop. OctoPrint, PrusaLink, Bambu Lab, Moonraker, Creality, Elegoo, Anycubic, Snapmaker and FlashForge.',
    printerHeight,
  ],
];
