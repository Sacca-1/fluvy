import { FluvyPrinterCard } from '../../../../packages/cards/src/printer/printer-card.js';
import type { StateSeed } from '../hass.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-printer-card'))
  customElements.define('fluvy-printer-card', FluvyPrinterCard);

/*
 * Issue #27's printers, one of each integration, as their registries and states say them: a Bambu Lab P1S printing
 * (its translation keys, a camera, the job's cover, a chamber light, its AMS's four trays on a device of their own), a
 * Prusa MK4 paused (PrusaLink, a job preview), an Ender 3 on OctoPrint printing (its sensors known by their ids, a 4:3
 * webcam, its system buttons left out), a Voron on Moonraker at rest, an A1 mini that failed (and says why), an X1
 * Carbon heating up, a Prusa MINI that has finished, and an MK4 that dropped off the network. Then issues #29's and
 * #30's: a Creality K1C printing with its CFS's trays and a K1 Max that failed (both say the job, and the one its
 * error, in the status's own attributes), an Elegoo Centauri Carbon preheating (its durations in milliseconds), an
 * Anycubic Kobra S1 printing from its ACE (a device of its own), a Snapmaker U1 paused (its emergency stop never a
 * button), an older Snapmaker A350 (fixed names, "HH:MM:SS" durations, nothing to press) and a FlashForge Adventurer
 * 5M that completed its job.
 */

/** The mock's moment: the time left is counted from it. */
const NOW = '2026-09-17T21:47:12';
const at = (minutes: number): string => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

type Attributes = Record<string, unknown>;
const temp = (name: string): Attributes => ({
  friendly_name: name,
  unit_of_measurement: '°C',
  device_class: 'temperature',
  state_class: 'measurement',
});
const percent = (name: string): Attributes => ({ friendly_name: name, unit_of_measurement: '%' });
const stamp = (name: string): Attributes => ({ friendly_name: name, device_class: 'timestamp' });
const duration = (name: string, unit: 'min' | 's' | 'ms'): Attributes => ({
  friendly_name: name,
  unit_of_measurement: unit,
  device_class: 'duration',
});
/** A heater's target as a number entity (Creality's, Anycubic's): set, not read. */
const setting = (name: string): Attributes => ({
  friendly_name: name,
  unit_of_measurement: '°C',
  device_class: 'temperature',
  min: 0,
  max: 300,
  step: 1,
});

/** The P1S's camera: the build plate under the chamber light, the part half printed. */
const CAMERA = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs><radialGradient id="l" cx="0.5" cy="0.1" r="0.9"><stop offset="0" stop-color="#5a5348"/><stop offset="1" stop-color="#1c1a17"/></radialGradient></defs>
    <rect width="640" height="360" fill="url(#l)"/>
    <path d="M70 300 L570 300 L520 230 L120 230 Z" fill="#3b3a36"/>
    <path d="M120 230 L520 230 L520 222 L120 222 Z" fill="#4a4843"/>
    <path d="M250 262 L390 262 L382 200 L258 200 Z" fill="#e0662f"/>
    <path d="M270 200 L370 200 L362 168 L278 168 Z" fill="#c9562a"/>
    <rect x="296" y="96" width="48" height="40" rx="6" fill="#2a2926"/>
    <path d="M314 136 L326 136 L320 150 Z" fill="#8a8579"/>
    <rect x="40" y="88" width="560" height="10" rx="5" fill="#2f2d29"/>
  </svg>`,
)}`;

/** OctoPrint's webcam, a 4:3 USB camera over an open frame. */
const WEBCAM = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="#2b2c2e"/>
    <rect x="60" y="60" width="16" height="380" fill="#55585c"/>
    <rect x="564" y="60" width="16" height="380" fill="#55585c"/>
    <rect x="60" y="150" width="520" height="14" fill="#6b6e72"/>
    <rect x="280" y="134" width="80" height="54" rx="6" fill="#1d1e20"/>
    <path d="M314 188 L326 188 L320 204 Z" fill="#9a9488"/>
    <path d="M110 400 L530 400 L500 360 L140 360 Z" fill="#3c3d40"/>
    <path d="M270 360 L370 360 L366 318 L274 318 Z" fill="#3f7fd9"/>
  </svg>`,
)}`;

/** A job's cover as the slicer renders it: the part on a light ground. */
const COVER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#ece8e1"/>
    <path d="M136 330 L376 330 L346 384 L166 384 Z" fill="#d95f2b"/>
    <path d="M176 330 L196 238 L316 238 L346 330 Z" fill="#e8763f"/>
    <rect x="232" y="176" width="56" height="62" rx="8" fill="#c9562a"/>
    <path d="M150 384 L362 384" stroke="#b7b0a4" stroke-width="6"/>
  </svg>`,
)}`;

const P1S: readonly StateSeed[] = [
  [
    'sensor.p1s_print_status',
    'running',
    { friendly_name: 'P1S Print status', device_class: 'enum' },
  ],
  ['sensor.p1s_print_progress', '62', percent('P1S Print progress')],
  ['sensor.p1s_remaining_time', '72', duration('P1S Remaining time', 'min')],
  ['sensor.p1s_end_time', at(72), stamp('P1S End time')],
  ['sensor.p1s_start_time', at(-95), stamp('P1S Start time')],
  [
    'sensor.p1s_current_stage',
    'printing',
    { friendly_name: 'P1S Current stage', device_class: 'enum' },
  ],
  [
    'sensor.p1s_active_tray',
    'Bambu PLA Basic',
    { friendly_name: 'P1S Active tray', type: 'PLA', color: '#E8763FFF' },
  ],
  ['sensor.p1s_current_layer', '112', { friendly_name: 'P1S Current layer' }],
  ['sensor.p1s_total_layer_count', '240', { friendly_name: 'P1S Total layer count' }],
  ['sensor.p1s_nozzle_temperature', '220', temp('P1S Nozzle temperature')],
  ['sensor.p1s_nozzle_target_temperature', '220', temp('P1S Nozzle target temperature')],
  ['sensor.p1s_bed_temperature', '60', temp('P1S Bed temperature')],
  ['sensor.p1s_target_bed_temperature', '60', temp('P1S Target bed temperature')],
  ['sensor.p1s_chamber_temperature', '32', temp('P1S Chamber temperature')],
  ['sensor.p1s_task_name', 'Benchy.gcode', { friendly_name: 'P1S Task name' }],
  [
    'sensor.p1s_speed_profile',
    'standard',
    { friendly_name: 'P1S Speed profile', device_class: 'enum' },
  ],
  ['camera.p1s_camera', 'idle', { friendly_name: 'P1S Camera', entity_picture: CAMERA }],
  ['image.p1s_cover_image', at(-60), { friendly_name: 'P1S Cover image', entity_picture: COVER }],
  ['light.p1s_chamber_light', 'on', { friendly_name: 'P1S Chamber light' }],
  ['sensor.p1s_aux_fan', '40', percent('P1S Aux fan')],
  ['button.p1s_pause_printing', 'unknown', { friendly_name: 'P1S Pause printing' }],
  ['button.p1s_resume_printing', 'unknown', { friendly_name: 'P1S Resume printing' }],
  ['button.p1s_stop_printing', 'unknown', { friendly_name: 'P1S Stop printing' }],
];

/** The P1S's AMS: four trays, the first printing, the last empty. */
const tray = (n: number, name: string, type: string, color: string, extra: Attributes = {}) =>
  [
    `sensor.p1s_ams_tray_${n}`,
    name,
    {
      friendly_name: `AMS Tray ${n}`,
      type,
      color,
      remain: 80,
      active: false,
      empty: false,
      ...extra,
    },
  ] as const satisfies StateSeed;
const AMS: readonly StateSeed[] = [
  tray(1, 'Bambu PLA Basic', 'PLA', '#E8763FFF', { active: true }),
  tray(2, 'Bambu PETG HF', 'PETG', '#1F1F1FFF'),
  tray(3, 'Bambu PLA Matte', 'PLA', '#F4F1EAFF'),
  tray(4, '', '', '00000000', { empty: true }),
];

/** An X1 Carbon heating up for its job: the stage says what it does, the heaters both their figures. */
const X1C: readonly StateSeed[] = [
  [
    'sensor.x1c_print_status',
    'prepare',
    { friendly_name: 'X1C Print status', device_class: 'enum' },
  ],
  [
    'sensor.x1c_current_stage',
    'heatbed_preheating',
    { friendly_name: 'X1C Current stage', device_class: 'enum' },
  ],
  ['sensor.x1c_print_progress', '0', percent('X1C Print progress')],
  ['sensor.x1c_remaining_time', '184', duration('X1C Remaining time', 'min')],
  ['sensor.x1c_nozzle_temperature', '142', temp('X1C Nozzle temperature')],
  ['sensor.x1c_nozzle_target_temperature', '220', temp('X1C Nozzle target temperature')],
  ['sensor.x1c_bed_temperature', '45', temp('X1C Bed temperature')],
  ['sensor.x1c_target_bed_temperature', '60', temp('X1C Target bed temperature')],
  ['sensor.x1c_chamber_temperature', '28', temp('X1C Chamber temperature')],
  ['sensor.x1c_task_name', 'Gridfinity_bins_6x4.gcode', { friendly_name: 'X1C Task name' }],
  ['sensor.x1c_aux_fan', '60', percent('X1C Aux fan')],
  [
    'sensor.x1c_print_weight',
    '182',
    { friendly_name: 'X1C Print weight', unit_of_measurement: 'g' },
  ],
  ['button.x1c_pause_printing', 'unknown', { friendly_name: 'X1C Pause printing' }],
  ['button.x1c_stop_printing', 'unknown', { friendly_name: 'X1C Stop printing' }],
];

/** A Prusa MINI that finished half an hour ago: its finish time is when, never now; its filament by name. */
const MINI: readonly StateSeed[] = [
  ['sensor.mini', 'finished', { friendly_name: 'MINI', device_class: 'enum' }],
  ['sensor.mini_progress', '100', percent('MINI Progress')],
  ['sensor.mini_print_finish', at(-30), stamp('MINI Print finish')],
  ['sensor.mini_filename', 'Cable_clip.bgcode', { friendly_name: 'MINI Filename' }],
  ['sensor.mini_material', 'PETG', { friendly_name: 'MINI Material' }],
  ['sensor.mini_nozzle_temperature', '38', temp('MINI Nozzle temperature')],
  ['sensor.mini_heatbed_temperature', '41', temp('MINI Heatbed temperature')],
];

const MK4: readonly StateSeed[] = [
  ['sensor.mk4', 'paused', { friendly_name: 'MK4', device_class: 'enum' }],
  ['sensor.mk4_progress', '41', percent('MK4 Progress')],
  ['sensor.mk4_print_finish', at(126), stamp('MK4 Print finish')],
  ['sensor.mk4_filename', 'Planter_v3.bgcode', { friendly_name: 'MK4 Filename' }],
  ['sensor.mk4_nozzle_temperature', '170', temp('MK4 Nozzle temperature')],
  ['sensor.mk4_nozzle_target_temperature', '0', temp('MK4 Nozzle target')],
  ['sensor.mk4_heatbed_temperature', '52', temp('MK4 Heatbed temperature')],
  ['sensor.mk4_heatbed_target_temperature', '60', temp('MK4 Heatbed target')],
  ['sensor.mk4_print_speed', '100', percent('MK4 Print speed')],
  ['camera.mk4_preview', 'idle', { friendly_name: 'MK4 Preview', entity_picture: COVER }],
  ['button.mk4_pause_job', 'unknown', { friendly_name: 'MK4 Pause job' }],
  ['button.mk4_resume_job', 'unknown', { friendly_name: 'MK4 Resume job' }],
  ['button.mk4_cancel_job', 'unknown', { friendly_name: 'MK4 Cancel job' }],
];

const ENDER: readonly StateSeed[] = [
  ['sensor.octoprint_current_state', 'printing', { friendly_name: 'OctoPrint Current State' }],
  ['sensor.octoprint_job_percentage', '18', percent('OctoPrint Job Percentage')],
  ['sensor.octoprint_estimated_finish_time', at(214), stamp('OctoPrint Estimated Finish Time')],
  ['sensor.octoprint_actual_tool0_temp', '205', temp('OctoPrint actual tool0 temp')],
  ['sensor.octoprint_target_tool0_temp', '205', temp('OctoPrint target tool0 temp')],
  ['sensor.octoprint_actual_bed_temp', '60', temp('OctoPrint actual bed temp')],
  ['sensor.octoprint_target_bed_temp', '60', temp('OctoPrint target bed temp')],
  [
    'sensor.octoprint_current_file',
    'bracket_v2.gcode',
    { friendly_name: 'OctoPrint Current File' },
  ],
  ['binary_sensor.octoprint_printing', 'on', { friendly_name: 'OctoPrint Printing' }],
  [
    'camera.octoprint_webcam',
    'idle',
    { friendly_name: 'OctoPrint Webcam', entity_picture: WEBCAM },
  ],
  ['button.octoprint_pause_job', 'unknown', { friendly_name: 'OctoPrint Pause Job' }],
  ['button.octoprint_resume_job', 'unknown', { friendly_name: 'OctoPrint Resume Job' }],
  ['button.octoprint_stop_job', 'unknown', { friendly_name: 'OctoPrint Stop Job' }],
  ['button.octoprint_shutdown_system', 'unknown', { friendly_name: 'OctoPrint Shutdown System' }],
];

const VORON: readonly StateSeed[] = [
  ['sensor.voron_current_print_state', 'standby', { friendly_name: 'Voron Current print state' }],
  ['sensor.voron_extruder_temperature', '27', temp('Voron Extruder temperature')],
  ['sensor.voron_extruder_target', '0', temp('Voron Extruder target')],
  ['sensor.voron_bed_temperature', '26', temp('Voron Bed temperature')],
  ['sensor.voron_bed_target', '0', temp('Voron Bed target')],
  ['button.voron_emergency_stop', 'unknown', { friendly_name: 'Voron Emergency stop' }],
];

const A1: readonly StateSeed[] = [
  [
    'sensor.a1_print_status',
    'failed',
    { friendly_name: 'A1 mini Print status', device_class: 'enum' },
  ],
  ['sensor.a1_print_progress', '7', percent('A1 mini Print progress')],
  ['sensor.a1_nozzle_temperature', '180', temp('A1 mini Nozzle temperature')],
  ['sensor.a1_bed_temperature', '45', temp('A1 mini Bed temperature')],
  ['sensor.a1_task_name', 'Hook.gcode', { friendly_name: 'A1 mini Task name' }],
  [
    'binary_sensor.a1_print_error',
    'on',
    {
      friendly_name: 'A1 mini Print error',
      device_class: 'problem',
      error_code: '07008011',
      description: 'Filament ran out. Load new filament and resume.',
    },
  ],
];

const GONE: readonly StateSeed[] = [
  ['sensor.mk4_garage', 'unavailable', { friendly_name: 'Garage MK4', device_class: 'enum' }],
  ['sensor.mk4_garage_nozzle_temperature', 'unavailable', temp('Garage MK4 Nozzle temperature')],
];

/**
 * A Creality K1C printing, by its WebSocket: no file sensor (the job's name rides on its status), its targets as
 * numbers, its durations in seconds, a reconnect and a homing button that are never the card's.
 */
const K1C: readonly StateSeed[] = [
  [
    'sensor.k1c_print_status',
    'printing',
    { friendly_name: 'K1C Print status', device_class: 'enum', file: 'Phone_stand.gcode' },
  ],
  ['sensor.k1c_print_progress', '34', percent('K1C Print progress')],
  ['sensor.k1c_print_time_left', '3660', duration('K1C Print time left', 's')],
  ['sensor.k1c_print_job_time', '1500', duration('K1C Print job time', 's')],
  ['sensor.k1c_working_layer', '58', { friendly_name: 'K1C Working layer' }],
  ['sensor.k1c_total_layers', '170', { friendly_name: 'K1C Total layers' }],
  ['sensor.k1c_nozzle_temperature', '220', temp('K1C Nozzle temperature')],
  ['number.k1c_nozzle_target', '220', setting('K1C Nozzle target')],
  ['sensor.k1c_bed_temperature', '60', temp('K1C Bed temperature')],
  ['number.k1c_bed_target', '60', setting('K1C Bed target')],
  ['sensor.k1c_chamber_temperature', '35', temp('K1C Chamber temperature')],
  ['sensor.k1c_print_speed', '100', percent('K1C Print speed')],
  ['light.k1c_light', 'off', { friendly_name: 'K1C Light' }],
  [
    'camera.k1c_printer_camera',
    'idle',
    { friendly_name: 'K1C Printer camera', entity_picture: CAMERA },
  ],
  [
    'image.k1c_current_print_preview',
    at(-40),
    { friendly_name: 'K1C Current print preview', entity_picture: COVER },
  ],
  ['button.k1c_pause_print', 'unknown', { friendly_name: 'K1C Pause print' }],
  ['button.k1c_resume_print', 'unknown', { friendly_name: 'K1C Resume print' }],
  ['button.k1c_stop_print', 'unknown', { friendly_name: 'K1C Stop print' }],
  ['button.k1c_reconnect', 'unknown', { friendly_name: 'K1C Reconnect' }],
  ['button.k1c_home_xy_then_z', 'unknown', { friendly_name: 'K1C Home XY then Z' }],
];

/** The K1C's CFS, on the printer's own device: four slots, the second printing, the fourth empty; the spool outside it. */
const cfs = (slot: number, type: string, name: string, color: string, selected = false) =>
  [
    `sensor.k1c_cfs_box_1_slot_${slot}_filament`,
    type || 'Empty',
    {
      friendly_name: `K1C CFS box 1 slot ${slot} filament`,
      vendor: type ? 'Creality' : '',
      type,
      name,
      color_hex: color,
      selected,
      box_id: 1,
      slot_id: slot,
    },
  ] as const satisfies StateSeed;
const CFS: readonly StateSeed[] = [
  cfs(1, 'PLA', 'Hyper PLA', '#F4F1EA'),
  cfs(2, 'PLA', 'Hyper PLA', '#2E8B57', true),
  cfs(3, 'ABS', 'CR-ABS', '#1F1F1F'),
  cfs(4, '', '', ''),
  [
    'sensor.k1c_cfs_external_filament',
    'PETG',
    {
      friendly_name: 'K1C CFS external filament',
      vendor: 'Generic',
      type: 'PETG',
      name: 'PETG',
      color_hex: '#3F7FD9',
      selected: false,
    },
  ],
];

/** A K1 Max that failed: no error sensor of its own, the code in its status's attributes. */
const K1MAX: readonly StateSeed[] = [
  [
    'sensor.k1max_print_status',
    'error',
    {
      friendly_name: 'K1 Max Print status',
      device_class: 'enum',
      file: 'Vase_mode_lamp.gcode',
      error_code: 2004,
    },
  ],
  ['sensor.k1max_print_progress', '46', percent('K1 Max Print progress')],
  ['sensor.k1max_nozzle_temperature', '180', temp('K1 Max Nozzle temperature')],
  ['sensor.k1max_bed_temperature', '45', temp('K1 Max Bed temperature')],
  ['button.k1max_pause_print', 'unknown', { friendly_name: 'K1 Max Pause print' }],
  ['button.k1max_resume_print', 'unknown', { friendly_name: 'K1 Max Resume print' }],
  ['button.k1max_stop_print', 'unknown', { friendly_name: 'K1 Max Stop print' }],
];

/**
 * An Elegoo Centauri Carbon preheating: six keys, the rest by the ends of its ids — its durations in milliseconds,
 * its chamber a "box", its filament a colour, its speed a sensor and a select of one name, its stage a word of its own
 * (never the card's).
 */
const CENTAURI: readonly StateSeed[] = [
  [
    'sensor.centauri_carbon_print_status',
    'preheating',
    { friendly_name: 'Centauri Carbon Print status', device_class: 'enum' },
  ],
  [
    'sensor.centauri_carbon_current_status',
    'printing',
    { friendly_name: 'Centauri Carbon Current status', device_class: 'enum' },
  ],
  ['sensor.centauri_carbon_percent_complete', '0', percent('Centauri Carbon Percent complete')],
  [
    'sensor.centauri_carbon_remaining_print_time',
    '5400000',
    duration('Centauri Carbon Remaining print time', 'ms'),
  ],
  [
    'sensor.centauri_carbon_current_print_time',
    '120000',
    duration('Centauri Carbon Current print time', 'ms'),
  ],
  [
    'sensor.centauri_carbon_total_print_time',
    '5520000',
    duration('Centauri Carbon Total print time', 'ms'),
  ],
  ['sensor.centauri_carbon_begin_time', at(-2), stamp('Centauri Carbon Begin time')],
  ['sensor.centauri_carbon_end_time', at(90), stamp('Centauri Carbon End time')],
  [
    'sensor.centauri_carbon_file_name',
    'Dragon_egg.gcode',
    { friendly_name: 'Centauri Carbon File name' },
  ],
  ['sensor.centauri_carbon_current_layer', '0', { friendly_name: 'Centauri Carbon Current layer' }],
  ['sensor.centauri_carbon_total_layers', '412', { friendly_name: 'Centauri Carbon Total layers' }],
  ['sensor.centauri_carbon_nozzle_temp', '96', temp('Centauri Carbon Nozzle temp')],
  ['sensor.centauri_carbon_target_nozzle_temp', '220', temp('Centauri Carbon Target nozzle temp')],
  ['sensor.centauri_carbon_bed_temp', '41', temp('Centauri Carbon Bed temp')],
  ['sensor.centauri_carbon_target_bed_temp', '60', temp('Centauri Carbon Target bed temp')],
  ['sensor.centauri_carbon_box_temp', '27', temp('Centauri Carbon Box temp')],
  [
    'sensor.centauri_carbon_active_filament_color',
    '#3F7FD9',
    { friendly_name: 'Centauri Carbon Active filament color' },
  ],
  ['sensor.centauri_carbon_print_speed', '100', percent('Centauri Carbon Print speed')],
  [
    'select.centauri_carbon_print_speed',
    'balanced',
    {
      friendly_name: 'Centauri Carbon Print speed',
      options: ['silent', 'balanced', 'sport', 'ludicrous'],
    },
  ],
  ['light.centauri_carbon_chamber_light', 'on', { friendly_name: 'Centauri Carbon Chamber light' }],
  [
    'image.centauri_carbon_cover_image',
    at(-3),
    { friendly_name: 'Centauri Carbon Cover image', entity_picture: COVER },
  ],
  [
    'camera.centauri_carbon_camera',
    'idle',
    { friendly_name: 'Centauri Carbon Camera', entity_picture: CAMERA },
  ],
  [
    'button.centauri_carbon_pause_print',
    'unknown',
    { friendly_name: 'Centauri Carbon Pause print' },
  ],
  [
    'button.centauri_carbon_resume_print',
    'unknown',
    { friendly_name: 'Centauri Carbon Resume print' },
  ],
  ['button.centauri_carbon_stop_print', 'unknown', { friendly_name: 'Centauri Carbon Stop print' }],
  [
    'select.centauri_carbon_print_file',
    'Dragon_egg.gcode',
    { friendly_name: 'Centauri Carbon Print file', options: ['Dragon_egg.gcode', 'Benchy.gcode'] },
  ],
  [
    'button.centauri_carbon_refresh_file_list',
    'unknown',
    { friendly_name: 'Centauri Carbon Refresh file list' },
  ],
];

/**
 * An Anycubic Kobra S1 printing (its local integration): the shared words, its minutes, its targets as numbers, a
 * pause flag and a top view that are not the card's, the spool outside the ACE on the printer itself.
 */
const KOBRA: readonly StateSeed[] = [
  [
    'sensor.kobra_s1_status',
    'printing',
    { friendly_name: 'Kobra S1 Status', device_class: 'enum' },
  ],
  ['sensor.kobra_s1_progress', '58', percent('Kobra S1 Progress')],
  ['sensor.kobra_s1_time_remaining', '47', duration('Kobra S1 Time remaining', 'min')],
  ['sensor.kobra_s1_file_name', 'Headphone_hook.gcode', { friendly_name: 'Kobra S1 Filename' }],
  ['sensor.kobra_s1_current_layer', '140', { friendly_name: 'Kobra S1 Current layer' }],
  ['sensor.kobra_s1_total_layers', '255', { friendly_name: 'Kobra S1 Total layers' }],
  ['sensor.kobra_s1_nozzle_temperature', '215', temp('Kobra S1 Nozzle temperature')],
  [
    'number.kobra_s1_nozzle_target_temperature',
    '215',
    setting('Kobra S1 Nozzle target temperature'),
  ],
  ['sensor.kobra_s1_bed_temperature', '60', temp('Kobra S1 Bed temperature')],
  ['number.kobra_s1_bed_target_temperature', '60', setting('Kobra S1 Bed target temperature')],
  ['sensor.kobra_s1_chamber_temperature', '33', temp('Kobra S1 Chamber temperature')],
  [
    'binary_sensor.kobra_s1_printing',
    'on',
    { friendly_name: 'Kobra S1 Printing', device_class: 'running' },
  ],
  ['binary_sensor.kobra_s1_paused', 'off', { friendly_name: 'Kobra S1 Paused' }],
  [
    'select.kobra_s1_print_speed',
    'normal',
    { friendly_name: 'Kobra S1 Print speed', options: ['slow', 'normal', 'fast'] },
  ],
  [
    'sensor.kobra_s1_external_spool',
    'PLA',
    { friendly_name: 'Kobra S1 External spool', material: 'PLA', color: '#F4F1EA', loaded: false },
  ],
  ['light.kobra_s1_chamber_light', 'on', { friendly_name: 'Kobra S1 Chamber light' }],
  ['camera.kobra_s1_camera', 'idle', { friendly_name: 'Kobra S1 Camera', entity_picture: CAMERA }],
  [
    'image.kobra_s1_object_thumbnail',
    at(-50),
    { friendly_name: 'Kobra S1 Object thumbnail', entity_picture: COVER },
  ],
  ['image.kobra_s1_object_top_view', at(-50), { friendly_name: 'Kobra S1 Object top view' }],
  ['button.kobra_s1_pause', 'unknown', { friendly_name: 'Kobra S1 Pause' }],
  ['button.kobra_s1_resume', 'unknown', { friendly_name: 'Kobra S1 Resume' }],
  ['button.kobra_s1_stop', 'unknown', { friendly_name: 'Kobra S1 Stop' }],
];

/** The Kobra's ACE Pro, a device of its own reached through the printer: four slots, the second loaded, the fourth empty. */
const ace = (slot: number, material: string, color: string, loaded = false) =>
  [
    `sensor.ace_pro_slot_${slot}`,
    material || 'empty',
    { friendly_name: `ACE Pro Slot ${slot}`, material, color, loaded },
  ] as const satisfies StateSeed;
const ACE: readonly StateSeed[] = [
  ace(1, 'PLA', '#E8763F'),
  ace(2, 'PETG', '#2E8B57', true),
  ace(3, 'TPU', '#1F1F1F'),
  ace(4, '', ''),
  ['sensor.ace_pro_loaded_slot', '2', { friendly_name: 'ACE Pro Loaded slot' }],
  [
    'sensor.ace_pro_humidity',
    '18',
    { friendly_name: 'ACE Pro Humidity', unit_of_measurement: '%', device_class: 'humidity' },
  ],
  ['sensor.ace_pro_box_temperature', '29', temp('ACE Pro Box temperature')],
  ['switch.ace_pro_drying', 'off', { friendly_name: 'ACE Pro Drying' }],
];

/**
 * A Snapmaker U1 paused: Klipper's words through its own keys, its targets as sensors (its setpoints are numbers), a
 * work light that is a switch, an emergency stop, a restart and a homing that are never buttons of the card's.
 */
const U1: readonly StateSeed[] = [
  [
    'sensor.snapmaker_u1_print_state',
    'paused',
    { friendly_name: 'Snapmaker U1 Print state', device_class: 'enum' },
  ],
  ['sensor.snapmaker_u1_print_progress', '71', percent('Snapmaker U1 Print progress')],
  ['sensor.snapmaker_u1_time_remaining', '1740', duration('Snapmaker U1 Time remaining', 's')],
  ['sensor.snapmaker_u1_print_eta', at(29), stamp('Snapmaker U1 Print ETA')],
  ['sensor.snapmaker_u1_print_duration', '4260', duration('Snapmaker U1 Print duration', 's')],
  ['sensor.snapmaker_u1_total_duration', '6000', duration('Snapmaker U1 Total duration', 's')],
  ['sensor.snapmaker_u1_filename', 'Cable_chain.gcode', { friendly_name: 'Snapmaker U1 Filename' }],
  ['sensor.snapmaker_u1_current_layer', '203', { friendly_name: 'Snapmaker U1 Current layer' }],
  ['sensor.snapmaker_u1_total_layers', '286', { friendly_name: 'Snapmaker U1 Total layers' }],
  ['sensor.snapmaker_u1_nozzle_temperature', '210', temp('Snapmaker U1 Nozzle temperature')],
  ['sensor.snapmaker_u1_nozzle_target', '210', temp('Snapmaker U1 Nozzle target')],
  ['number.snapmaker_u1_nozzle_setpoint', '210', setting('Snapmaker U1 Nozzle setpoint')],
  ['sensor.snapmaker_u1_bed_temperature', '65', temp('Snapmaker U1 Bed temperature')],
  ['sensor.snapmaker_u1_bed_target', '65', temp('Snapmaker U1 Bed target')],
  ['sensor.snapmaker_u1_chamber_temperature', '38', temp('Snapmaker U1 Chamber temperature')],
  ['sensor.snapmaker_u1_speed_factor', '100', percent('Snapmaker U1 Speed factor')],
  ['sensor.snapmaker_u1_klipper_state', 'ready', { friendly_name: 'Snapmaker U1 Klipper state' }],
  ['binary_sensor.snapmaker_u1_is_printing', 'on', { friendly_name: 'Snapmaker U1 Is printing' }],
  ['binary_sensor.snapmaker_u1_is_paused', 'on', { friendly_name: 'Snapmaker U1 Is paused' }],
  [
    'binary_sensor.snapmaker_u1_has_error',
    'off',
    { friendly_name: 'Snapmaker U1 Has error', device_class: 'problem' },
  ],
  [
    'binary_sensor.snapmaker_u1_printer_ready',
    'on',
    { friendly_name: 'Snapmaker U1 Printer ready' },
  ],
  ['switch.snapmaker_u1_work_light', 'on', { friendly_name: 'Snapmaker U1 Work light' }],
  [
    'camera.snapmaker_u1_webcam',
    'idle',
    { friendly_name: 'Snapmaker U1 Webcam', entity_picture: WEBCAM },
  ],
  ['button.snapmaker_u1_pause_print', 'unknown', { friendly_name: 'Snapmaker U1 Pause print' }],
  ['button.snapmaker_u1_resume_print', 'unknown', { friendly_name: 'Snapmaker U1 Resume print' }],
  ['button.snapmaker_u1_cancel_print', 'unknown', { friendly_name: 'Snapmaker U1 Cancel print' }],
  [
    'button.snapmaker_u1_emergency_stop',
    'unknown',
    { friendly_name: 'Snapmaker U1 Emergency stop' },
  ],
  [
    'button.snapmaker_u1_restart_klipper',
    'unknown',
    { friendly_name: 'Snapmaker U1 Restart Klipper' },
  ],
  ['button.snapmaker_u1_home_all', 'unknown', { friendly_name: 'Snapmaker U1 Home all' }],
];

/** The older Snapmaker line, an A350 with a dual head: fixed names, no keys, its durations as a clock; nothing to press. */
const A350: readonly StateSeed[] = [
  ['sensor.snapmaker_a350_status', 'running', { friendly_name: 'Snapmaker A350 Status' }],
  [
    'sensor.snapmaker_a350_elapsed_time',
    '01:12:35',
    { friendly_name: 'Snapmaker A350 Elapsed time' },
  ],
  [
    'sensor.snapmaker_a350_remaining_time',
    '02:06:00',
    { friendly_name: 'Snapmaker A350 Remaining time' },
  ],
  [
    'sensor.snapmaker_a350_estimated_time',
    '03:18:35',
    { friendly_name: 'Snapmaker A350 Estimated time' },
  ],
  [
    'sensor.snapmaker_a350_file_name',
    'Spool_holder.gcode',
    { friendly_name: 'Snapmaker A350 File name' },
  ],
  ['sensor.snapmaker_a350_progress', '36', percent('Snapmaker A350 Progress')],
  [
    'sensor.snapmaker_a350_nozzle_1_temperature',
    '205',
    temp('Snapmaker A350 Nozzle 1 temperature'),
  ],
  [
    'sensor.snapmaker_a350_nozzle_1_target_temperature',
    '205',
    temp('Snapmaker A350 Nozzle 1 target temperature'),
  ],
  ['sensor.snapmaker_a350_nozzle_2_temperature', '28', temp('Snapmaker A350 Nozzle 2 temperature')],
  [
    'sensor.snapmaker_a350_nozzle_2_target_temperature',
    '0',
    temp('Snapmaker A350 Nozzle 2 target temperature'),
  ],
  ['sensor.snapmaker_a350_bed_temperature', '60', temp('Snapmaker A350 Bed temperature')],
  [
    'sensor.snapmaker_a350_bed_target_temperature',
    '60',
    temp('Snapmaker A350 Bed target temperature'),
  ],
];

/**
 * A FlashForge Adventurer 5M that completed its job: its completion time went with the job (so when it finished is
 * its status's last change), its LED and its camera switches, its filament by type, the IFS's picture never the job's.
 */
const AD5M: readonly StateSeed[] = [
  [
    'sensor.adventurer_5m_machine_status',
    'completed',
    { friendly_name: 'Adventurer 5M Machine status', device_class: 'enum' },
  ],
  ['sensor.adventurer_5m_print_progress', '100', percent('Adventurer 5M Print progress')],
  [
    'sensor.adventurer_5m_current_file',
    'Drawer_knob.3mf',
    { friendly_name: 'Adventurer 5M Current file' },
  ],
  ['sensor.adventurer_5m_current_layer', '180', { friendly_name: 'Adventurer 5M Current layer' }],
  ['sensor.adventurer_5m_total_layers', '180', { friendly_name: 'Adventurer 5M Total layers' }],
  ['sensor.adventurer_5m_elapsed_time', '5520', duration('Adventurer 5M Elapsed time', 's')],
  ['sensor.adventurer_5m_remaining_time', '0', duration('Adventurer 5M Remaining time', 's')],
  [
    'sensor.adventurer_5m_print_completion_time',
    'unknown',
    stamp('Adventurer 5M Print completion time'),
  ],
  ['sensor.adventurer_5m_nozzle_temperature', '48', temp('Adventurer 5M Nozzle temperature')],
  [
    'sensor.adventurer_5m_nozzle_target_temperature',
    '0',
    temp('Adventurer 5M Nozzle target temperature'),
  ],
  ['sensor.adventurer_5m_bed_temperature', '39', temp('Adventurer 5M Bed temperature')],
  [
    'sensor.adventurer_5m_bed_target_temperature',
    '0',
    temp('Adventurer 5M Bed target temperature'),
  ],
  ['sensor.adventurer_5m_chamber_temperature', '30', temp('Adventurer 5M Chamber temperature')],
  ['sensor.adventurer_5m_print_speed', '100', percent('Adventurer 5M Print speed')],
  ['sensor.adventurer_5m_filament_type', 'PLA', { friendly_name: 'Adventurer 5M Filament type' }],
  [
    'sensor.adventurer_5m_filament_weight',
    '12.4',
    { friendly_name: 'Adventurer 5M Filament weight', unit_of_measurement: 'g' },
  ],
  ['sensor.adventurer_5m_active_ifs_slot', '1', { friendly_name: 'Adventurer 5M Active IFS slot' }],
  ['sensor.adventurer_5m_error_code', 'unknown', { friendly_name: 'Adventurer 5M Error code' }],
  [
    'binary_sensor.adventurer_5m_is_printing',
    'off',
    { friendly_name: 'Adventurer 5M Is printing' },
  ],
  ['binary_sensor.adventurer_5m_is_paused', 'off', { friendly_name: 'Adventurer 5M Is paused' }],
  [
    'binary_sensor.adventurer_5m_has_error',
    'off',
    { friendly_name: 'Adventurer 5M Has error', device_class: 'problem' },
  ],
  [
    'binary_sensor.adventurer_5m_door_open',
    'off',
    { friendly_name: 'Adventurer 5M Door open', device_class: 'door' },
  ],
  ['switch.adventurer_5m_camera', 'on', { friendly_name: 'Adventurer 5M Camera' }],
  ['switch.adventurer_5m_led', 'on', { friendly_name: 'Adventurer 5M LED' }],
  [
    'image.adventurer_5m_current_file_thumbnail',
    at(-92),
    { friendly_name: 'Adventurer 5M Current file thumbnail', entity_picture: COVER },
  ],
  ['image.adventurer_5m_ifs_slot_1', at(-92), { friendly_name: 'Adventurer 5M IFS slot 1' }],
  ['button.adventurer_5m_pause_print', 'unknown', { friendly_name: 'Adventurer 5M Pause print' }],
  ['button.adventurer_5m_resume_print', 'unknown', { friendly_name: 'Adventurer 5M Resume print' }],
  ['button.adventurer_5m_cancel_print', 'unknown', { friendly_name: 'Adventurer 5M Cancel print' }],
  ['button.adventurer_5m_clear_status', 'unknown', { friendly_name: 'Adventurer 5M Clear status' }],
];

/** Each printer's registry: its device, and the integration's own name for each entity. */
const entries = (
  device: string,
  platform: string,
  seeds: readonly StateSeed[],
  keys: Readonly<Record<string, string>> = {},
) =>
  seeds.map(([id]) => [
    id,
    {
      entity_id: id,
      device_id: device,
      platform,
      labels: [],
      ...(keys[id] ? { translation_key: keys[id] } : {}),
    },
  ]);

const device = (id: string, name: string, model: string, via: string | null = null) => [
  id,
  {
    id,
    name,
    name_by_user: null,
    model,
    manufacturer: '',
    area_id: null,
    labels: [],
    via_device_id: via,
  },
];

export const sheet: SheetSpec = {
  states: [
    ...P1S,
    ...AMS,
    ...X1C,
    ...MINI,
    ...MK4,
    ...ENDER,
    ...VORON,
    ...A1,
    ...GONE,
    ...K1C,
    ...CFS,
    ...K1MAX,
    ...CENTAURI,
    ...KOBRA,
    ...ACE,
    ...U1,
    ...A350,
    ...AD5M,
  ],
  registry: {
    entities: Object.fromEntries([
      ...entries('d-p1s', 'bambu_lab', P1S, {
        'sensor.p1s_print_status': 'print_status',
        'sensor.p1s_print_progress': 'print_progress',
        'sensor.p1s_remaining_time': 'remaining_time',
        'sensor.p1s_end_time': 'end_time',
        'sensor.p1s_start_time': 'start_time',
        'sensor.p1s_current_stage': 'stage',
        'sensor.p1s_active_tray': 'active_tray',
        'sensor.p1s_current_layer': 'current_layer',
        'sensor.p1s_total_layer_count': 'total_layers',
        'sensor.p1s_nozzle_temperature': 'nozzle_temp',
        'sensor.p1s_nozzle_target_temperature': 'target_nozzle_temp',
        'sensor.p1s_bed_temperature': 'bed_temp',
        'sensor.p1s_target_bed_temperature': 'target_bed_temp',
        'sensor.p1s_chamber_temperature': 'chamber_temp',
        'sensor.p1s_task_name': 'subtask_name',
        'sensor.p1s_speed_profile': 'speed_profile',
        'camera.p1s_camera': 'camera',
        'image.p1s_cover_image': 'cover_image',
        'light.p1s_chamber_light': 'chamber_light',
        'sensor.p1s_aux_fan': 'aux_fan',
        'button.p1s_pause_printing': 'pause',
        'button.p1s_resume_printing': 'resume',
        'button.p1s_stop_printing': 'stop',
      }),
      // the AMS is a device of its own, reached through the printer
      ...entries('d-p1s-ams', 'bambu_lab', AMS, {
        'sensor.p1s_ams_tray_1': 'tray_1',
        'sensor.p1s_ams_tray_2': 'tray_2',
        'sensor.p1s_ams_tray_3': 'tray_3',
        'sensor.p1s_ams_tray_4': 'tray_4',
      }),
      ...entries('d-x1c', 'bambu_lab', X1C, {
        'sensor.x1c_print_status': 'print_status',
        'sensor.x1c_current_stage': 'stage',
        'sensor.x1c_print_progress': 'print_progress',
        'sensor.x1c_remaining_time': 'remaining_time',
        'sensor.x1c_nozzle_temperature': 'nozzle_temp',
        'sensor.x1c_nozzle_target_temperature': 'target_nozzle_temp',
        'sensor.x1c_bed_temperature': 'bed_temp',
        'sensor.x1c_target_bed_temperature': 'target_bed_temp',
        'sensor.x1c_chamber_temperature': 'chamber_temp',
        'sensor.x1c_task_name': 'subtask_name',
        'sensor.x1c_aux_fan': 'aux_fan',
        'sensor.x1c_print_weight': 'print_weight',
        'button.x1c_pause_printing': 'pause',
        'button.x1c_stop_printing': 'stop',
      }),
      ...entries('d-mini', 'prusalink', MINI, {
        'sensor.mini': 'printer_state',
        'sensor.mini_progress': 'progress',
        'sensor.mini_print_finish': 'print_finish',
        'sensor.mini_filename': 'filename',
        'sensor.mini_material': 'material',
        'sensor.mini_nozzle_temperature': 'nozzle_temperature',
        'sensor.mini_heatbed_temperature': 'heatbed_temperature',
      }),
      ...entries('d-mk4', 'prusalink', MK4, {
        'sensor.mk4': 'printer_state',
        'sensor.mk4_progress': 'progress',
        'sensor.mk4_print_finish': 'print_finish',
        'sensor.mk4_filename': 'filename',
        'sensor.mk4_nozzle_temperature': 'nozzle_temperature',
        'sensor.mk4_nozzle_target_temperature': 'nozzle_target_temperature',
        'sensor.mk4_heatbed_temperature': 'heatbed_temperature',
        'sensor.mk4_heatbed_target_temperature': 'heatbed_target_temperature',
        'sensor.mk4_print_speed': 'print_speed',
        'camera.mk4_preview': 'job_preview',
        'button.mk4_pause_job': 'pause_job',
        'button.mk4_resume_job': 'resume_job',
        'button.mk4_cancel_job': 'cancel_job',
      }),
      // OctoPrint names its state and its file; the rest only by their ids
      ...entries('d-ender', 'octoprint', ENDER, {
        'sensor.octoprint_current_state': 'status',
        'sensor.octoprint_current_file': 'file_name',
      }),
      ...entries('d-voron', 'moonraker', VORON, {
        'sensor.voron_current_print_state': 'current_print_state',
        'sensor.voron_extruder_temperature': 'extruder_temperature',
        'sensor.voron_extruder_target': 'extruder_target',
        'sensor.voron_bed_temperature': 'bed_temperature',
        'sensor.voron_bed_target': 'bed_target',
        'button.voron_emergency_stop': 'emergency_stop',
      }),
      ...entries('d-a1', 'bambu_lab', A1, {
        'sensor.a1_print_status': 'print_status',
        'sensor.a1_print_progress': 'print_progress',
        'sensor.a1_nozzle_temperature': 'nozzle_temp',
        'sensor.a1_bed_temperature': 'bed_temp',
        'sensor.a1_task_name': 'subtask_name',
        'binary_sensor.a1_print_error': 'print_error',
      }),
      ...entries('d-gone', 'prusalink', GONE, {
        'sensor.mk4_garage': 'printer_state',
        'sensor.mk4_garage_nozzle_temperature': 'nozzle_temperature',
      }),
      // Creality keys everything, its CFS's trays on the printer's own device
      ...entries('d-k1c', 'ha_creality_ws', [...K1C, ...CFS], {
        'sensor.k1c_print_status': 'print_status',
        'sensor.k1c_print_progress': 'print_progress',
        'sensor.k1c_print_time_left': 'print_left_time',
        'sensor.k1c_print_job_time': 'print_job_time',
        'sensor.k1c_working_layer': 'current_layer',
        'sensor.k1c_total_layers': 'total_layers',
        'sensor.k1c_nozzle_temperature': 'nozzle_temperature',
        'number.k1c_nozzle_target': 'nozzle_target',
        'sensor.k1c_bed_temperature': 'bed_temperature',
        'number.k1c_bed_target': 'bed_target',
        'sensor.k1c_chamber_temperature': 'chamber_temperature',
        'sensor.k1c_print_speed': 'feedrate_pct',
        'light.k1c_light': 'light',
        'camera.k1c_printer_camera': 'printer_camera',
        'image.k1c_current_print_preview': 'current_print_preview',
        'button.k1c_pause_print': 'pause_print',
        'button.k1c_resume_print': 'resume_print',
        'button.k1c_stop_print': 'stop_print',
        'button.k1c_reconnect': 'reconnect',
        'button.k1c_home_xy_then_z': 'home_xyz',
        'sensor.k1c_cfs_box_1_slot_1_filament': 'cfs_slot_filament',
        'sensor.k1c_cfs_box_1_slot_2_filament': 'cfs_slot_filament',
        'sensor.k1c_cfs_box_1_slot_3_filament': 'cfs_slot_filament',
        'sensor.k1c_cfs_box_1_slot_4_filament': 'cfs_slot_filament',
        'sensor.k1c_cfs_external_filament': 'cfs_ext_filament',
      }),
      ...entries('d-k1max', 'ha_creality_ws', K1MAX, {
        'sensor.k1max_print_status': 'print_status',
        'sensor.k1max_print_progress': 'print_progress',
        'sensor.k1max_nozzle_temperature': 'nozzle_temperature',
        'sensor.k1max_bed_temperature': 'bed_temperature',
        'button.k1max_pause_print': 'pause_print',
        'button.k1max_resume_print': 'resume_print',
        'button.k1max_stop_print': 'stop_print',
      }),
      // Elegoo names its status, its stage and its file selector; the rest only by their ids
      ...entries('d-elegoo', 'elegoo_printer', CENTAURI, {
        'sensor.centauri_carbon_print_status': 'print_status',
        'sensor.centauri_carbon_current_status': 'current_status',
        'select.centauri_carbon_print_file': 'print_file',
        'button.centauri_carbon_refresh_file_list': 'refresh_file_list',
      }),
      ...entries('d-kobra', 'anycubic', KOBRA, {
        'sensor.kobra_s1_status': 'status',
        'sensor.kobra_s1_progress': 'progress',
        'sensor.kobra_s1_time_remaining': 'time_remaining',
        'sensor.kobra_s1_file_name': 'filename',
        'sensor.kobra_s1_current_layer': 'current_layer',
        'sensor.kobra_s1_total_layers': 'total_layers',
        'sensor.kobra_s1_nozzle_temperature': 'nozzle_temperature',
        'number.kobra_s1_nozzle_target_temperature': 'nozzle_target',
        'sensor.kobra_s1_bed_temperature': 'bed_temperature',
        'number.kobra_s1_bed_target_temperature': 'bed_target',
        'sensor.kobra_s1_chamber_temperature': 'chamber_temperature',
        'binary_sensor.kobra_s1_printing': 'printing',
        'binary_sensor.kobra_s1_paused': 'paused',
        'select.kobra_s1_print_speed': 'speed_mode',
        'sensor.kobra_s1_external_spool': 'external_spool',
        'light.kobra_s1_chamber_light': 'chamber_light',
        'camera.kobra_s1_camera': 'camera',
        'image.kobra_s1_object_thumbnail': 'object_thumbnail',
        'image.kobra_s1_object_top_view': 'object_top_view',
        'button.kobra_s1_pause': 'pause',
        'button.kobra_s1_resume': 'resume',
        'button.kobra_s1_stop': 'stop',
      }),
      // the ACE is a device of its own, reached through the printer
      ...entries('d-ace', 'anycubic', ACE, {
        'sensor.ace_pro_slot_1': 'ace_slot',
        'sensor.ace_pro_slot_2': 'ace_slot',
        'sensor.ace_pro_slot_3': 'ace_slot',
        'sensor.ace_pro_slot_4': 'ace_slot',
        'sensor.ace_pro_loaded_slot': 'ace_loaded_slot',
        'sensor.ace_pro_humidity': 'ace_humidity',
        'sensor.ace_pro_box_temperature': 'ace_box_temperature',
        'switch.ace_pro_drying': 'ace_drying',
      }),
      ...entries('d-u1', 'snapmaker_u1', U1, {
        'sensor.snapmaker_u1_print_state': 'print_state',
        'sensor.snapmaker_u1_print_progress': 'print_progress',
        'sensor.snapmaker_u1_time_remaining': 'time_remaining',
        'sensor.snapmaker_u1_print_eta': 'print_eta',
        'sensor.snapmaker_u1_print_duration': 'print_duration',
        'sensor.snapmaker_u1_total_duration': 'total_duration',
        'sensor.snapmaker_u1_filename': 'filename',
        'sensor.snapmaker_u1_current_layer': 'current_layer',
        'sensor.snapmaker_u1_total_layers': 'total_layers',
        'sensor.snapmaker_u1_nozzle_temperature': 'nozzle_temperature',
        'sensor.snapmaker_u1_nozzle_target': 'nozzle_target',
        'number.snapmaker_u1_nozzle_setpoint': 'nozzle_setpoint',
        'sensor.snapmaker_u1_bed_temperature': 'bed_temperature',
        'sensor.snapmaker_u1_bed_target': 'bed_target',
        'sensor.snapmaker_u1_chamber_temperature': 'chamber_temperature',
        'sensor.snapmaker_u1_speed_factor': 'speed_factor',
        'sensor.snapmaker_u1_klipper_state': 'klipper_state',
        'binary_sensor.snapmaker_u1_is_printing': 'is_printing',
        'binary_sensor.snapmaker_u1_is_paused': 'is_paused',
        'binary_sensor.snapmaker_u1_has_error': 'has_error',
        'binary_sensor.snapmaker_u1_printer_ready': 'printer_ready',
        'switch.snapmaker_u1_work_light': 'work_light',
        'camera.snapmaker_u1_webcam': 'webcam',
        'button.snapmaker_u1_pause_print': 'pause_print',
        'button.snapmaker_u1_resume_print': 'resume_print',
        'button.snapmaker_u1_cancel_print': 'cancel_print',
        'button.snapmaker_u1_emergency_stop': 'emergency_stop',
        'button.snapmaker_u1_restart_klipper': 'restart_klipper',
        'button.snapmaker_u1_home_all': 'home_all',
      }),
      // the older Snapmaker names nothing by a key
      ...entries('d-a350', 'snapmaker', A350),
      ...entries('d-ad5m', 'flashforge', AD5M, {
        'sensor.adventurer_5m_machine_status': 'machine_status',
        'sensor.adventurer_5m_print_progress': 'print_progress',
        'sensor.adventurer_5m_current_file': 'current_file',
        'sensor.adventurer_5m_current_layer': 'current_layer',
        'sensor.adventurer_5m_total_layers': 'total_layers',
        'sensor.adventurer_5m_elapsed_time': 'elapsed_time',
        'sensor.adventurer_5m_remaining_time': 'remaining_time',
        'sensor.adventurer_5m_print_completion_time': 'print_completion_time',
        'sensor.adventurer_5m_nozzle_temperature': 'nozzle_temperature',
        'sensor.adventurer_5m_nozzle_target_temperature': 'nozzle_target_temperature',
        'sensor.adventurer_5m_bed_temperature': 'bed_temperature',
        'sensor.adventurer_5m_bed_target_temperature': 'bed_target_temperature',
        'sensor.adventurer_5m_chamber_temperature': 'chamber_temperature',
        'sensor.adventurer_5m_print_speed': 'print_speed',
        'sensor.adventurer_5m_filament_type': 'filament_type',
        'sensor.adventurer_5m_filament_weight': 'filament_weight',
        'sensor.adventurer_5m_active_ifs_slot': 'active_ifs_slot',
        'sensor.adventurer_5m_error_code': 'error_code',
        'binary_sensor.adventurer_5m_is_printing': 'is_printing',
        'binary_sensor.adventurer_5m_is_paused': 'is_paused',
        'binary_sensor.adventurer_5m_has_error': 'has_error',
        'binary_sensor.adventurer_5m_door_open': 'door_open',
        'switch.adventurer_5m_camera': 'camera',
        'switch.adventurer_5m_led': 'led',
        'image.adventurer_5m_current_file_thumbnail': 'current_file_thumbnail',
        'image.adventurer_5m_ifs_slot_1': 'ifs_slot_1',
        'button.adventurer_5m_pause_print': 'pause_print',
        'button.adventurer_5m_resume_print': 'resume_print',
        'button.adventurer_5m_cancel_print': 'cancel_print',
        'button.adventurer_5m_clear_status': 'clear_status',
      }),
    ]),
    devices: Object.fromEntries([
      device('d-p1s', 'P1S', 'P1S'),
      device('d-p1s-ams', 'AMS', 'AMS', 'd-p1s'),
      device('d-x1c', 'Bambu Lab X1 Carbon (workshop bench)', 'X1 Carbon'),
      device('d-mini', 'Prusa MINI', 'MINI'),
      device('d-mk4', 'Prusa MK4', 'MK4'),
      device('d-ender', 'Ender 3', 'OctoPrint'),
      device('d-voron', 'Voron 2.4', 'Klipper'),
      device('d-a1', 'A1 mini', 'A1 mini'),
      device('d-gone', 'Garage MK4', 'MK4'),
      device('d-k1c', 'K1C', 'K1C'),
      device('d-k1max', 'K1 Max', 'K1 Max'),
      device('d-elegoo', 'Centauri Carbon', 'Centauri Carbon'),
      device('d-kobra', 'Kobra S1', 'Kobra S1'),
      device('d-ace', 'ACE Pro', 'ACE Pro', 'd-kobra'),
      device('d-u1', 'Snapmaker U1', 'U1'),
      device('d-a350', 'Snapmaker A350', 'A350'),
      device('d-ad5m', 'Adventurer 5M', 'Adventurer 5M'),
    ]),
  },
  frames: [
    {
      title: 'Bambu Lab · printing',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-p1s', _now: NOW }],
    },
    {
      title: 'PrusaLink · paused',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-mk4', _now: NOW }],
    },
    {
      title: 'OctoPrint · printing, by its ids',
      cards: [
        { type: 'custom:fluvy-printer-card', entity: 'sensor.octoprint_current_state', _now: NOW },
      ],
    },
    {
      title: 'OctoPrint · its webcam in 4:3',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-ender',
          aspect_ratio: '4:3',
          fit_mode: 'contain',
          _now: NOW,
        },
      ],
    },
    {
      title: 'Moonraker · at rest',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-voron', _now: NOW }],
    },
    {
      title: 'Failed · and offline',
      cards: [
        { type: 'custom:fluvy-printer-card', device: 'd-a1', _now: NOW },
        { type: 'custom:fluvy-printer-card', device: 'd-gone', _now: NOW },
      ],
    },
    {
      title: 'Heating up · a long name',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-x1c', _now: NOW }],
    },
    {
      title: 'Finished · its filament by name',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mini',
          readouts: ['nozzle', 'bed', 'filament'],
          _now: NOW,
        },
      ],
    },
    // issues #29 and #30: the newer integrations, each by its own words
    {
      title: 'Creality · printing, CFS trays',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-k1c', _now: NOW }],
    },
    {
      title: 'Creality · error from its status',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-k1max', _now: NOW }],
    },
    {
      title: 'Elegoo · preheating',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-elegoo', _now: NOW }],
    },
    {
      title: 'Anycubic · printing, ACE',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-kobra', _now: NOW }],
    },
    {
      title: 'Snapmaker U1 · paused',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-u1', _now: NOW }],
    },
    {
      title: 'Snapmaker · legacy, read-only',
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-a350', _now: NOW }],
    },
    {
      title: 'FlashForge · completed',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-ad5m',
          readouts: ['nozzle', 'bed', 'filament'],
          _now: NOW,
        },
      ],
    },
    {
      title: 'More readouts · a fan and the print’s weight',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-x1c',
          name: 'X1 Carbon',
          show_controls: false,
          readouts: ['nozzle', 'bed', 'chamber'],
          sensors: [
            { entity: 'sensor.x1c_aux_fan', name: 'Fan' },
            { entity: 'sensor.x1c_print_weight', name: 'Weight' },
          ],
          _now: NOW,
        },
      ],
    },
    // a card's own colour is the accent's, never a status's: a failed and a paused print keep the warning
    {
      title: 'A colour of its own · failed and paused',
      cards: [
        { type: 'custom:fluvy-printer-card', device: 'd-a1', color: 'teal', _now: NOW },
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mk4',
          color: 'teal',
          variant: 'compact',
          _now: NOW,
        },
      ],
    },
    // another day's moments: finished two days ago (by the calendar), ready tomorrow (its weekday)
    {
      title: 'Days · finished before, ready tomorrow',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mini',
          variant: 'compact',
          _now: '2026-09-19T21:47:12',
        },
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-x1c',
          name: 'X1 Carbon',
          variant: 'compact',
          _now: '2026-09-17T23:30:00',
        },
      ],
    },
    // the days by the calendar where the hours would say otherwise: 23 h after a job finished last night is yesterday,
    // 35 h after it, the next morning but one, is two days ago
    {
      title: 'Days · by the calendar, not the hours',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mini',
          variant: 'compact',
          _now: '2026-09-18T20:00:00',
        },
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mini',
          variant: 'compact',
          _now: '2026-09-19T08:00:00',
        },
      ],
    },
    // the house's calendar, not the browser's: a job finished at 21:17 here is 07:17 the next morning in Auckland, and
    // half past midnight here is the same Auckland morning; a profile on the server's zone reads the house's day
    {
      title: 'Days · on the house’s calendar',
      hass: (hass) =>
        ({
          ...hass,
          config: { ...hass.config, time_zone: 'Pacific/Auckland' },
          locale: { ...hass.locale, time_zone: 'server' },
        }) as typeof hass,
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mini',
          variant: 'compact',
          _now: '2026-09-18T00:30:00',
        },
      ],
    },
    {
      title: 'Its own words · a row without buttons',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-p1s',
          variant: 'compact',
          readouts: ['nozzle'],
          sensors: ['sensor.p1s_aux_fan'],
          _now: NOW,
        },
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-p1s',
          variant: 'row',
          show_controls: false,
          _now: NOW,
        },
      ],
    },
    {
      title: 'Half a column · trays and readouts',
      width: 180,
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-p1s', show_image: false, _now: NOW }],
    },
    {
      title: 'Compact',
      cards: [
        { type: 'custom:fluvy-printer-card', device: 'd-p1s', variant: 'compact', _now: NOW },
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-mk4',
          variant: 'compact',
          readouts: ['nozzle', 'bed', 'speed'],
          _now: NOW,
        },
      ],
    },
    {
      title: 'Rows',
      cards: [
        { type: 'custom:fluvy-printer-card', device: 'd-p1s', variant: 'row', _now: NOW },
        { type: 'custom:fluvy-printer-card', device: 'd-mk4', variant: 'row', _now: NOW },
        { type: 'custom:fluvy-printer-card', device: 'd-voron', variant: 'row', _now: NOW },
        { type: 'custom:fluvy-printer-card', device: 'd-x1c', variant: 'row', _now: NOW },
        { type: 'custom:fluvy-printer-card', device: 'd-a1', variant: 'row', _now: NOW },
      ],
    },
    // a state word too long for the row beside its circle (German's 100 px "Fehlgeschlagen" at half a column): the
    // round, then the circle give way, the row itself the button; the state is never cut
    {
      title: 'Row · a long state word',
      width: 176,
      hass: (hass) =>
        ({
          ...hass,
          formatEntityState: (stateObj, state) =>
            stateObj.entity_id === 'sensor.a1_print_status'
              ? 'Fehlgeschlagen'
              : (hass.formatEntityState?.(stateObj, state) ?? stateObj.state),
        }) as typeof hass,
      cards: [{ type: 'custom:fluvy-printer-card', device: 'd-a1', variant: 'row', _now: NOW }],
    },
    {
      title: 'Without the picture and the buttons',
      cards: [
        {
          type: 'custom:fluvy-printer-card',
          device: 'd-p1s',
          name: 'Workshop',
          show_image: false,
          show_controls: false,
          readouts: ['nozzle', 'bed', 'layer', 'speed'],
          _now: NOW,
        },
      ],
    },
  ],
};
