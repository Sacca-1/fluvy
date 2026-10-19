import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import type { FamilyEntry } from './energy-family.js';
import {
  COMPACT,
  featuresOf,
  known,
  listLength,
  optionBlock,
  ROW,
  rowsOf,
} from './shared/heights.js';

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

/** `lock.open`: the latch some locks can pull back, a row of its own (16 + 44) under the slide. */
const LOCK_OPEN = 1;

/** The lock: the compact head and its slide, the latch's row where the lock has one, then its rows. */
export const lockHeight = (config: LovelaceCardConfig, hass?: HomeAssistant): number =>
  config['variant'] === 'compact'
    ? COMPACT
    : COMPACT + (featuresOf(hass, config['entity']) & LOCK_OPEN ? 60 : 0) + rowsUnder(config);

/** A panel's arm modes by their `supported_features` bits; disarm every panel has. */
const ARM_BITS: Readonly<Record<string, number>> = {
  arm_home: 1,
  arm_away: 2,
  arm_night: 4,
  arm_custom_bypass: 16,
  arm_vacation: 32,
};
/** A panel that reports no features still arms home and away (the card's own default). */
const DEFAULT_ARMS = 1 | 2;

/**
 * The modes the alarm card draws: the config's, those the panel supports; else every mode the panel has (home and
 * away where it writes no features). Their count decides the rows: no mode's word is wider than a cell.
 */
const alarmModes = (config: LovelaceCardConfig, hass?: HomeAssistant): number => {
  const id = config['entity'];
  const features = known(hass, id) ? featuresOf(hass, id) || DEFAULT_ARMS : DEFAULT_ARMS;
  const asked = Array.isArray(config['modes'])
    ? (config['modes'] as unknown[]).filter((m): m is string => typeof m === 'string')
    : ['disarm', ...Object.keys(ARM_BITS)];
  return asked.filter((mode) => mode === 'disarm' || (features & (ARM_BITS[mode] ?? 0)) !== 0)
    .length;
};

/**
 * The alarm: the head, then the modes as option tiles under their label (a row of three; two rows for a panel
 * that arms four ways or more), then its rows; the compact card is one row.
 */
export const alarmHeight = (config: LovelaceCardConfig, hass?: HomeAssistant): number =>
  config['variant'] === 'compact'
    ? COMPACT
    : 64 + optionBlock(rowsOf(Math.max(1, alarmModes(config, hass)), 3)) + rowsUnder(config) + 20;

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

/** The readouts a printer draws where the config names none: its nozzle, its bed and its layer, one row of three. */
const PRINTER_READOUTS = 3;

/**
 * The 3D printer at a 360 column, printing (what the dashboard reserves; at rest, failed or finished it draws less):
 * the row (76); the compact card — the head, the bar (12 + 8) and its line (8 + 20), then the readouts 16 under it
 * in rows of three (44, 12 apart: the ones named with the sensors added, else the three every printer has); the full
 * one — the picture in its shape (16:9 by default) across a 320 column 16 under the head, the progress with its time
 * left (16 + 64) over the bar and its line, the readouts, the buttons (16 + 44). A printer's filament trays, which
 * only some have, are not counted.
 */
export const printerHeight = (config: LovelaceCardConfig): number => {
  if (config['variant'] === 'row') return 76;
  const named = Array.isArray(config['readouts']) ? config['readouts'].length : PRINTER_READOUTS;
  const sensors = Array.isArray(config['sensors']) ? config['sensors'].length : 0;
  const rows = Math.ceil(Math.max(1, named + sensors) / 3);
  const readouts = 16 + rows * 44 + (rows - 1) * 12;
  if (config['variant'] === 'compact') return 64 + 12 + 8 + 8 + 20 + readouts + 20;
  const ratio = cameraRatio(
    typeof config['aspect_ratio'] === 'string' ? config['aspect_ratio'] : undefined,
  );
  const picture = config['show_image'] === false ? 0 : 16 + Math.min(360, plateHeight(320, ratio));
  const controls = config['show_controls'] === false ? 0 : 16 + 44;
  return 64 + picture + 16 + 64 + 12 + 8 + 8 + 20 + readouts + controls + 20;
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
