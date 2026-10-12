import type { HomeAssistant } from '@fluvy/core';

/*
 * A 3D printer's entities, found on its device. Every printer integration hangs its entities on one device — OctoPrint
 * and PrusaLink (Home Assistant's own); Bambu Lab, Moonraker (Klipper), Creality (its WebSocket), Elegoo, Anycubic,
 * Snapmaker (the U1 and the older line) and FlashForge (from HACS) — each with its own words. A role is known by the
 * entity's translation key (the integration's own word for it first, then the words the integrations share), else by
 * the end of its id (OctoPrint and the older Snapmaker name their sensors without a key), else, for a camera or a
 * picture, by its domain. Where two entities could play one role, the one known with more certainty plays it: a
 * "print status" over a "wifi status". A role the card names by hand (`roles`) wins. The system's own buttons (shut
 * down, reboot, an emergency stop) are never a role, nor is a filament unit's tray: the unit — Bambu Lab's AMS,
 * Creality's CFS, Anycubic's ACE — is read apart, its trays on the printer's device or on a device of their own
 * reached through it. A printer of an integration the card does not know is known by what it has: a status, a
 * heater and a job's measure together.
 */

export type PrinterRole =
  | 'status'
  | 'printing'
  | 'progress'
  | 'remaining'
  | 'finish'
  | 'start'
  | 'file'
  | 'stage'
  | 'error'
  | 'elapsed'
  | 'filament'
  | 'nozzle'
  | 'nozzle_target'
  | 'bed'
  | 'bed_target'
  | 'chamber'
  | 'layer'
  | 'layers'
  | 'speed'
  | 'camera'
  | 'preview'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'light';

export const PRINTER_ROLES: readonly PrinterRole[] = [
  'status',
  'printing',
  'progress',
  'remaining',
  'finish',
  'start',
  'file',
  'stage',
  'error',
  'elapsed',
  'filament',
  'nozzle',
  'nozzle_target',
  'bed',
  'bed_target',
  'chamber',
  'layer',
  'layers',
  'speed',
  'camera',
  'preview',
  'pause',
  'resume',
  'stop',
  'light',
];

/** The integrations the card knows by their words (a printer of any other is known by what it has, and by `roles`). */
export const PRINTER_PLATFORMS = [
  'octoprint',
  'prusalink',
  'bambu_lab',
  'moonraker',
  'ha_creality_ws',
  'elegoo_printer',
  'anycubic',
  'snapmaker_u1',
  'snapmaker',
  'flashforge',
] as const;
export type PrinterPlatform = (typeof PRINTER_PLATFORMS)[number];

const knownPlatform = (platform: string | undefined): platform is PrinterPlatform =>
  (PRINTER_PLATFORMS as readonly string[]).includes(platform ?? '');

/** What a role may be: the domains its entity lives in, the one preferred first (a sensor's speed over a select's). */
const DOMAINS: Readonly<Record<PrinterRole, readonly string[]>> = {
  status: ['sensor'],
  printing: ['binary_sensor'],
  progress: ['sensor'],
  remaining: ['sensor'],
  finish: ['sensor'],
  start: ['sensor'],
  file: ['sensor'],
  stage: ['sensor'],
  error: ['binary_sensor', 'sensor'],
  elapsed: ['sensor'],
  filament: ['sensor'],
  nozzle: ['sensor'],
  nozzle_target: ['sensor', 'number'],
  bed: ['sensor'],
  bed_target: ['sensor', 'number'],
  chamber: ['sensor'],
  layer: ['sensor'],
  layers: ['sensor'],
  speed: ['sensor', 'select'],
  camera: ['camera', 'image'],
  preview: ['camera', 'image'],
  pause: ['button'],
  resume: ['button'],
  stop: ['button'],
  light: ['light', 'switch'],
};

/** An integration's word for an entity: the role it plays, or `null` — none at all, whatever its id ends in. */
type Word = PrinterRole | null;

/** The translation keys the integrations share, meaning the same on each (`hass.entities[…].translation_key`). */
const KEYS_COMMON: Readonly<Record<string, PrinterRole>> = {
  status: 'status',
  print_status: 'status',
  progress: 'progress',
  print_progress: 'progress',
  filename: 'file',
  file_name: 'file',
  remaining_time: 'remaining',
  time_remaining: 'remaining',
  end_time: 'finish',
  start_time: 'start',
  current_layer: 'layer',
  total_layers: 'layers',
  nozzle_temperature: 'nozzle',
  nozzle_target: 'nozzle_target',
  bed_temperature: 'bed',
  bed_target: 'bed_target',
  chamber_temperature: 'chamber',
  pause: 'pause',
  pause_print: 'pause',
  resume: 'resume',
  resume_print: 'resume',
  stop: 'stop',
  stop_print: 'stop',
  cancel_print: 'stop',
  camera: 'camera',
  light: 'light',
  thumbnail: 'preview',
};

/**
 * Each integration's own translation keys, beyond the shared ones: what it calls a role, and (`null`) what it has that
 * is not the card's business — a stage that would contradict the badge, a runout that is not a failure, a unit's own
 * readings, a maximum whose id ends as a reading's does.
 */
const KEYS_BY_PLATFORM: Readonly<Record<PrinterPlatform, Readonly<Record<string, Word>>>> = {
  // its status and its file are the shared words; the rest it names by id alone
  octoprint: {},
  prusalink: {
    printer_state: 'status',
    print_start: 'start',
    print_finish: 'finish',
    nozzle_target_temperature: 'nozzle_target',
    heatbed_temperature: 'bed',
    heatbed_target_temperature: 'bed_target',
    print_speed: 'speed',
    material: 'filament',
    job_preview: 'preview',
    pause_job: 'pause',
    resume_job: 'resume',
    continue_job: 'resume',
    cancel_job: 'stop',
  },
  bambu_lab: {
    nozzle_temp: 'nozzle',
    target_nozzle_temp: 'nozzle_target',
    bed_temp: 'bed',
    target_bed_temp: 'bed_target',
    chamber_temp: 'chamber',
    subtask_name: 'file',
    gcode_file: 'file',
    stage: 'stage',
    current_stage: 'stage',
    print_error: 'error',
    hms: 'error',
    active_tray: 'filament',
    speed_profile: 'speed',
    cover_image: 'preview',
    chamber_light: 'light',
  },
  moonraker: {
    current_print_state: 'status',
    print_eta: 'finish',
    print_time_left: 'remaining',
    print_duration: 'elapsed',
    extruder_temperature: 'nozzle',
    extruder_target: 'nozzle_target',
    total_layer: 'layers',
  },
  ha_creality_ws: {
    print_left_time: 'remaining',
    print_job_time: 'elapsed',
    feedrate_pct: 'speed',
    active_filament_slot: 'filament',
    printer_camera: 'camera',
    current_print_preview: 'preview',
    // a runout is not a failure; the object, the control word and the factors; the heaters' maxima (their ids end
    // as a reading's); the CFS's own readings (its trays are read apart); its own buttons
    filament_status: null,
    current_object: null,
    print_control: null,
    print_tuning_pct: null,
    flowrate_pct: null,
    chamber_target: null,
    max_nozzle_temp: null,
    max_bed_temp: null,
    max_chamber_temp: null,
    cfs_box_temp: null,
    cfs_box_humidity: null,
    cfs_slot_color: null,
    cfs_slot_percent: null,
    cfs_ext_color: null,
    cfs_ext_percent: null,
    reconnect: null,
    home_xyz: null,
  },
  elegoo_printer: {
    print_error: 'error',
    // its stage would contradict the badge; the error's reason is a sensor of its own; the file and tray selectors
    current_status: null,
    error_status_reason: null,
    print_file: null,
    print_tray: null,
    print_selected_file: null,
    refresh_file_list: null,
  },
  anycubic: {
    printing: 'printing',
    chamber_light: 'light',
    object_thumbnail: 'preview',
    speed_mode: 'speed',
    // the pause is the status's; the top view; the ACE's own readings and controls (its slots are trays); the fans
    paused: null,
    object_top_view: null,
    ace_loaded_slot: null,
    ace_humidity: null,
    ace_box_temperature: null,
    ace_drying: null,
    ace_auto_feed: null,
    drying_temp: null,
    drying_duration: null,
    fan_speed: null,
    aux_fan: null,
    box_fan: null,
  },
  snapmaker_u1: {
    print_state: 'status',
    print_eta: 'finish',
    print_duration: 'elapsed',
    speed_factor: 'speed',
    is_printing: 'printing',
    has_error: 'error',
    work_light: 'light',
    webcam: 'camera',
    // the whole duration; the setpoints (the targets are sensors); the factors and the fan; Klipper's own words; the
    // pause and the readiness the status says; the file selector and the tool (its homing buttons no suffix knows)
    total_duration: null,
    nozzle_setpoint: null,
    bed_setpoint: null,
    chamber_setpoint: null,
    flow_rate: null,
    fan_speed: null,
    filament_used: null,
    klipper_state: null,
    toolhead_position: null,
    is_paused: null,
    printer_ready: null,
    print_file: null,
    active_tool: null,
  },
  // the older line names nothing by a key: its sensors are known by their ids
  snapmaker: {},
  flashforge: {
    machine_status: 'status',
    current_file: 'file',
    elapsed_time: 'elapsed',
    print_completion_time: 'finish',
    nozzle_target_temperature: 'nozzle_target',
    bed_target_temperature: 'bed_target',
    print_speed: 'speed',
    filament_type: 'filament',
    error_code: 'error',
    is_printing: 'printing',
    led: 'light',
    current_file_thumbnail: 'preview',
    // the chamber's target; the filament's weight and length; the IFS's slot number and pictures; the flags the
    // status says and the door; the camera is a switch; the printer's own figures (its fans, tool heads and lifetime
    // counters no suffix knows)
    chamber_target_temperature: null,
    filament_weight: null,
    filament_length: null,
    active_ifs_slot: null,
    ifs_slot_1: null,
    ifs_slot_2: null,
    ifs_slot_3: null,
    ifs_slot_4: null,
    has_error: null,
    is_paused: null,
    is_online: null,
    door_open: null,
    clear_status: null,
    camera: null,
    tvoc: null,
    z_offset: null,
    nozzle_size: null,
    ip_address: null,
    free_disk_space: null,
  },
};

/** The end of an entity's id, for what an integration names without a translation key (OctoPrint's sensors). */
const SUFFIXES: ReadonlyArray<readonly [RegExp, PrinterRole]> = [
  [/_current_state$/, 'status'],
  [/_(job_percentage|print_progress|progress)$/, 'progress'],
  [/_(estimated_finish_time|print_finish|print_eta|end_time)$/, 'finish'],
  [/_(time_remaining|remaining_time|print_time_left)$/, 'remaining'],
  [/_(start_time|print_start)$/, 'start'],
  [/_(current_file|file_?name|subtask_name|gcode_file)$/, 'file'],
  [/_current_stage$/, 'stage'],
  [/_(print_error|hms_errors?)$/, 'error'],
  [/_print_duration$/, 'elapsed'],
  [/_(active_tray|material)$/, 'filament'],
  // a target before its reading: "…_target_bed_temp" ends as a reading's id does
  [
    /_target_tool0_temp$|_target_nozzle_temp$|_(nozzle|extruder)_target(_temperature)?$/,
    'nozzle_target',
  ],
  [/_target_bed_temp$|_(heat)?bed_target(_temperature)?$/, 'bed_target'],
  [/_actual_tool0_temp$|_(nozzle|extruder)_temp(erature)?$/, 'nozzle'],
  [/_actual_bed_temp$|_(heat)?bed_temp(erature)?$/, 'bed'],
  [/_chamber_temp(erature)?$/, 'chamber'],
  [/_current_layer$/, 'layer'],
  [/_total_layers?(_count)?$/, 'layers'],
  [/_print_speed$|_speed_profile$/, 'speed'],
  [/_printing$/, 'printing'],
  [/_pause(_job|_print)?$/, 'pause'],
  [/_(resume|continue)(_job|_print)?$/, 'resume'],
  [/_(stop|cancel)(_job|_print)?$/, 'stop'],
  [/_(chamber_)?light$/, 'light'],
  [/_(job_preview|cover_image|thumbnail)$/, 'preview'],
];

/**
 * An integration's own ends of ids, before the shared ones: what it names without a key, or whose id would read as
 * something else (`null`: not the card's business).
 */
const SUFFIXES_BY_PLATFORM: Partial<
  Record<PrinterPlatform, ReadonlyArray<readonly [RegExp, Word]>>
> = {
  ha_creality_ws: [
    [/_working_layer$/, 'layer'],
    [/_print_job_time$/, 'elapsed'],
    [/_active_filament_slot$/, 'filament'],
    [/_feedrate_pct$/, 'speed'],
  ],
  // its durations are milliseconds, its chamber a "box", its filament a colour; the whole time, the tray's id, the
  // Canvas slots, the layers left and the task's id are not the card's business
  elegoo_printer: [
    [/_percent_complete$/, 'progress'],
    [/_remaining_print_time$/, 'remaining'],
    [/_current_print_time$/, 'elapsed'],
    [/_begin_time$/, 'start'],
    [/_box_temp$/, 'chamber'],
    [/_active_filament_color$/, 'filament'],
    [/_total_print_time$/, null],
    [/_active_tray_id$/, null],
    [/_a\d_(color|name|attributes)$/, null],
    [/_remaining_layers$/, null],
    [/_task_id$/, null],
  ],
  // the older line: fixed names, "HH:MM:SS" durations, the first nozzle of a dual head; read-only
  snapmaker: [
    [/_status$/, 'status'],
    [/_elapsed_time$/, 'elapsed'],
    [/_nozzle_?1_temperature$/, 'nozzle'],
    [/_nozzle_?1_target_temperature$/, 'nozzle_target'],
    [/_estimated_time$/, null],
    [/_nozzle_?2_/, null],
  ],
};

/** A loose guess at the end of an id, for an integration the card does not know: last, and never when strict. */
const LOOSE: ReadonlyArray<readonly [RegExp, PrinterRole]> = [
  [/_status$/, 'status'],
  [/_elapsed_time$/, 'elapsed'],
];

/** Never a role: the integration's own system buttons and anything that would stop a printer dead. */
const NEVER = /shutdown|shut_down|reboot|restart|emergency|firmware|system/;

/**
 * A filament unit's tray, by its translation key: Bambu Lab's AMS slots ("tray_1" …) and the spool outside it,
 * Creality's CFS slots and its external filament, Anycubic's ACE slots. Never a role: the trays are read apart.
 */
const TRAY = /^(tray_\d+|external_spool|cfs_(slot|ext)_filament|ace_slot)$/;
/** The spool outside the unit: after the unit's own trays. */
const OUTSIDE = /^(external_spool|cfs_ext_filament)$/;

/** How surely a role is known: by the integration's own word, a shared one, an id's end, a loose guess, the domain. */
const RANK = { platform: 4, common: 3, suffix: 2, loose: 1, domain: 0 } as const;

/** An entity of the device as the registry and the states say it. */
export interface Candidate {
  readonly id: string;
  readonly domain: string;
  readonly key: string | undefined;
  /** The integration it belongs to (`hass.entities[…].platform`). */
  readonly platform?: string | undefined;
}

/** The part an entity plays and how surely it is known. */
export interface Part {
  readonly role: PrinterRole;
  readonly rank: number;
}

/**
 * How the roles are read. `lenient` (the card, on the device it is given): every word, the loose guesses too.
 * `strict` (the house's printers, on a device of an integration the card does not know): only what every printer
 * has — the shared keys, the shared ends of ids and a camera's domain — never a guess.
 */
export type Rigour = 'lenient' | 'strict';

const domainOf = (id: string): string => id.slice(0, id.indexOf('.'));

/**
 * The part an entity plays on a printer and how surely it is known: by its integration's own word (4), by a word the
 * integrations share (3), by the end of its id — its integration's, then anyone's (2) — by a loose guess at it (1,
 * "…_status": for an integration the card does not know, lenient only), by its domain alone (0: a camera is the
 * camera, an image the job's picture). None where the integration says it is not the card's business, for a system
 * button, for a filament unit's tray.
 */
export function partOf(candidate: Candidate, rigour: Rigour = 'lenient'): Part | undefined {
  const { id, domain, key } = candidate;
  if (NEVER.test(id) || (key && (NEVER.test(key) || TRAY.test(key)))) return undefined;
  const platform = knownPlatform(candidate.platform) ? candidate.platform : undefined;
  const fits = (word: Word | undefined): word is PrinterRole =>
    word !== undefined && word !== null && DOMAINS[word].includes(domain);
  const own = platform && key ? KEYS_BY_PLATFORM[platform][key] : undefined;
  if (own === null) return undefined;
  if (fits(own)) return { role: own, rank: RANK.platform };
  const shared = key ? KEYS_COMMON[key] : undefined;
  if (fits(shared)) return { role: shared, rank: RANK.common };
  const object = id.slice(id.indexOf('.'));
  // the ends of ids in turn: the integration's own, the shared, the loose guesses; a `null` ends the search
  const tiers: ReadonlyArray<readonly [ReadonlyArray<readonly [RegExp, Word]>, number]> = [
    [platform ? (SUFFIXES_BY_PLATFORM[platform] ?? []) : [], RANK.suffix],
    [SUFFIXES, RANK.suffix],
    [rigour === 'lenient' && !platform ? LOOSE : [], RANK.loose],
  ];
  for (const [ends, rank] of tiers)
    for (const [pattern, word] of ends) {
      if (!pattern.test(object)) continue;
      if (word === null) return undefined;
      if (fits(word)) return { role: word, rank };
    }
  if (domain === 'camera') return { role: 'camera', rank: RANK.domain };
  if (domain === 'image') return { role: 'preview', rank: RANK.domain };
  return undefined;
}

/** The role an entity plays on a printer, or none. */
export function roleOf(candidate: Candidate, rigour: Rigour = 'lenient'): PrinterRole | undefined {
  return partOf(candidate, rigour)?.role;
}

export type PrinterEntities = Partial<Record<PrinterRole, string>>;

/** The device the card is about: the one it names, else the device of the entity it names. */
export function printerDevice(
  hass: HomeAssistant | undefined,
  device: string | undefined,
  entity: string | undefined,
): string | undefined {
  if (device) return device;
  return entity ? hass?.entities?.[entity]?.device_id : undefined;
}

/** A registry entry as a candidate for a role. */
const candidateOf = (entry: {
  readonly entity_id: string;
  readonly translation_key?: string | undefined;
  readonly platform?: string | undefined;
}): Candidate => ({
  id: entry.entity_id,
  domain: domainOf(entry.entity_id),
  key: entry.translation_key,
  platform: entry.platform,
});

/** An entity holding a role, and how surely. */
interface Holder {
  readonly id: string;
  readonly rank: number;
}

/** Whether a part known this surely takes a role from its holder: a higher rank, else the role's preferred domain. */
function surer(role: PrinterRole, id: string, rank: number, held: Holder): boolean {
  if (rank !== held.rank) return rank > held.rank;
  return DOMAINS[role].indexOf(domainOf(id)) < DOMAINS[role].indexOf(domainOf(held.id));
}

/**
 * Every role the printer's device fills — by the entity known most surely to play it (a device rarely has two; a
 * printer with two nozzles shows its first) — then the roles named by hand over them. Hidden entities are left out of
 * the search.
 */
export function printerEntities(
  hass: HomeAssistant | undefined,
  device: string | undefined,
  named: ReadonlyArray<{ readonly role: string; readonly entity: string }> = [],
  entity?: string,
): PrinterEntities {
  const held: Partial<Record<PrinterRole, Holder>> = {};
  const registry = hass?.entities ?? {};
  if (device)
    for (const entry of Object.values(registry)) {
      if (entry.device_id !== device || entry.hidden) continue;
      const part = partOf(candidateOf(entry));
      if (!part) continue;
      const holder = held[part.role];
      if (!holder || surer(part.role, entry.entity_id, part.rank, holder))
        held[part.role] = { id: entry.entity_id, rank: part.rank };
    }
  const found: PrinterEntities = {};
  for (const [role, holder] of Object.entries(held) as Array<[PrinterRole, Holder]>)
    found[role] = holder.id;
  // the entity the card names is its status when it plays no other part
  if (entity && !Object.values(found).includes(entity)) {
    const entry = registry[entity];
    const role =
      roleOf({
        id: entity,
        domain: domainOf(entity),
        key: entry?.translation_key,
        platform: entry?.platform,
      }) ?? (domainOf(entity) === 'sensor' ? 'status' : undefined);
    if (role) found[role] = entity;
  }
  for (const { role, entity: id } of named)
    if ((PRINTER_ROLES as readonly string[]).includes(role) && id) found[role as PrinterRole] = id;
  return found;
}

/**
 * The printers of a house, once each. A device of an integration the card knows is a printer when it says what it is
 * doing (a status, a progress, a printing sensor) — not the filament unit hung on one, which has trays and no job. A
 * device of any other integration is one by a printer's signature, what nothing else in a house has together: a
 * status (or a printing sensor), a nozzle or a bed, and a job's measure (its progress, time left, finish, file or
 * layer) — a washer has the first and the last, a smart bed only the bed. Its roles are read strictly: by what every
 * integration shares, never by a guess.
 */
export function printerDevices(hass: Pick<HomeAssistant, 'entities'> | undefined): string[] {
  const devices = new Map<string, { known: boolean; readonly roles: Set<PrinterRole> }>();
  for (const entry of Object.values(hass?.entities ?? {})) {
    if (!entry.device_id) continue;
    const role = roleOf(candidateOf(entry), 'strict');
    if (!role) continue;
    const device = devices.get(entry.device_id) ?? { known: false, roles: new Set() };
    device.known ||= knownPlatform(entry.platform);
    device.roles.add(role);
    devices.set(entry.device_id, device);
  }
  const printers: string[] = [];
  for (const [id, { known, roles }] of devices) {
    const any = (...wanted: PrinterRole[]): boolean => wanted.some((role) => roles.has(role));
    const printer = known
      ? any('status', 'progress', 'printing')
      : any('status', 'printing') &&
        any('nozzle', 'bed') &&
        any('progress', 'remaining', 'finish', 'file', 'layer');
    if (printer) printers.push(id);
  }
  return printers;
}

/**
 * The filament a printer can pick from, in order: the trays of its unit (on the printer's device, or on devices of
 * their own reached through it), the unit's own slots first and the spool outside it last, in their number within
 * each — as sensors whose attributes say the filament's type and colour.
 */
export function printerTrays(
  hass: Pick<HomeAssistant, 'entities' | 'devices'> | undefined,
  device: string | undefined,
): string[] {
  if (!device || !hass) return [];
  const units = new Set(
    Object.values(hass.devices ?? {})
      .filter((entry) => entry.via_device_id === device)
      .map((entry) => entry.id),
  );
  units.add(device);
  const outside = (key: string | undefined): number => (OUTSIDE.test(key ?? '') ? 1 : 0);
  return Object.values(hass.entities ?? {})
    .filter(
      (entry) =>
        entry.device_id !== undefined &&
        units.has(entry.device_id) &&
        !entry.hidden &&
        entry.entity_id.startsWith('sensor.') &&
        TRAY.test(entry.translation_key ?? ''),
    )
    .sort(
      (a, b) =>
        outside(a.translation_key) - outside(b.translation_key) ||
        a.entity_id.localeCompare(b.entity_id, 'en', { numeric: true }),
    )
    .map((entry) => entry.entity_id);
}
