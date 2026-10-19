import type { HomeAssistant, MessageKey } from '@fluvy/core';
import { LOW_BATTERY, type GlyphName } from '@fluvy/ui';
import { charging } from '../shared/battery.js';
import type { AlertButton, AlertConfig, AlertSource, MatchConfig, PresetCheck } from './model.js';
import type { Severity } from './severity.js';

/*
 * The alerts a house usually wants, one line each (`preset: low_battery`): each is its clauses, what it never
 * matches, its words, glyph and severity, and its defaults (how it counts, how its rows read, its buttons). The
 * person may say anything over it — a name, an icon, a severity, a tone, a colour, `for`, more scope (`area:
 * kitchen`) — and its parameters (`below` for batteries, `phones`, `acknowledged`).
 */

export const PRESET_NAMES = [
  'low_battery',
  'unavailable',
  'open',
  'unlocked',
  'hazards',
  'errors',
  'updates',
  'lights_on',
  'ha_alerts',
  'repairs',
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export const isPreset = (value: unknown): value is PresetName =>
  typeof value === 'string' && (PRESET_NAMES as readonly string[]).includes(value);

/** What an alert takes from its preset unless it says otherwise. */
export type PresetDefaults = Pick<
  AlertConfig,
  | 'for'
  | 'diagnostic'
  | 'count_by'
  | 'name_by'
  | 'sort_rows'
  | 'split'
  | 'admin_only'
  | 'row_button'
  | 'actions'
  | 'tap_action'
  | 'hold_action'
  | 'row_action'
  | 'row_hold_action'
>;

export interface PresetSpec {
  /** Its title, said when the alert has no name of its own. */
  readonly title: MessageKey;
  readonly icon: GlyphName;
  readonly severity: Severity;
  /** Where its rows come from when not from the states: a source the card reads (Home Assistant's repairs). */
  readonly source?: Exclude<AlertSource, 'states'>;
  /** The keys of the alert's own config it reads as its parameters: they never narrow its clauses. */
  readonly params?: readonly (keyof AlertConfig)[];
  /** Its clauses (any of them matching), from the alert's config. */
  readonly clauses: (config: AlertConfig) => readonly MatchConfig[];
  /** What it never matches. */
  readonly exclude?: (config: AlertConfig) => readonly MatchConfig[];
  /** A test that reads other entities than the one it tests. */
  readonly check?: PresetCheck;
  readonly defaults?: PresetDefaults;
}

/** Every entity of each device, once per entity registry. */
const devices = new WeakMap<object, Map<string, readonly string[]>>();

/** The entities on the same device as that one (itself among them); none for an entity without a device. */
export function siblingsOf(hass: HomeAssistant, id: string): readonly string[] {
  const registry = hass.entities ?? {};
  let byDevice = devices.get(registry);
  if (!byDevice) {
    const lists = new Map<string, string[]>();
    for (const entry of Object.values(registry))
      if (entry.device_id) {
        const list = lists.get(entry.device_id);
        if (list) list.push(entry.entity_id);
        else lists.set(entry.device_id, [entry.entity_id]);
      }
    byDevice = lists;
    devices.set(registry, byDevice);
  }
  const device = registry[id]?.device_id;
  return (device && byDevice.get(device)) || [];
}

const perform = (service: string, target: 'matched' | 'row'): AlertButton['tap_action'] => ({
  action: 'perform-action',
  perform_action: service,
  target,
});

/** A bulk action asks first: it acts on every match at once. */
const confirmed = (service: string): AlertButton['tap_action'] => ({
  ...perform(service, 'matched'),
  confirmation: true,
});

const ACKNOWLEDGE: AlertButton = {
  words: 'alerts.acknowledge',
  icon: 'check',
  tap_action: perform('alert.turn_off', 'row'),
};

export const PRESETS: Readonly<Record<PresetName, PresetSpec>> = {
  /**
   * A battery at 20 % and under (`below`, 21 by default: the warning the battery glyph turns to), a battery that
   * says "low", a battery binary sensor that is on. Charging ones wait; phones (the mobile app's) are left out unless
   * `phones: true` — they cross 20 % every day. Counted by device, the lowest first.
   */
  low_battery: {
    title: 'alerts.preset.low_battery',
    icon: 'battery',
    severity: 'warning',
    params: ['below', 'phones'],
    clauses: (config) => [
      { domain: 'sensor', device_class: 'battery', below: config.below ?? LOW_BATTERY + 1 },
      { domain: 'sensor', device_class: 'battery', state: 'low' },
      { domain: 'binary_sensor', device_class: 'battery', state: 'on' },
    ],
    exclude: (config) => (config.phones ? [] : [{ integration: 'mobile_app' }]),
    check: {
      test: (hass, id) => !charging(hass, { entity: id }),
      // the charger is a sensor of the battery's own device
      reads: siblingsOf,
    },
    defaults: { count_by: 'device', name_by: 'device', sort_rows: 'value' },
  },
  /**
   * Unavailable for 5 minutes (a restart's flapping passes), counted by device — a dead node is one device of six
   * entities. Buttons, events and scenes are left out (they have no state worth missing), and so are diagnostic
   * entities, which a device that works may well leave unavailable.
   */
  unavailable: {
    title: 'alerts.preset.unavailable',
    icon: 'ban',
    severity: 'warning',
    clauses: () => [{ state: 'unavailable' }],
    exclude: () => [{ domain: ['button', 'event', 'scene'] }],
    defaults: { for: { minutes: 5 }, diagnostic: false, count_by: 'device' },
  },
  /**
   * A door, window, garage door or opening open for 5 minutes (walking through one is not leaving it open, and a page
   * that jumped at every door would be no page to read); a door, garage or gate cover open, which a row's Close shuts.
   */
  open: {
    title: 'alerts.preset.open',
    icon: 'door',
    severity: 'warning',
    clauses: () => [
      {
        domain: 'binary_sensor',
        device_class: ['door', 'garage_door', 'opening', 'window'],
        state: 'on',
      },
      { domain: 'cover', device_class: ['door', 'garage', 'gate'], state: 'open' },
    ],
    defaults: {
      for: { minutes: 5 },
      row_button: {
        words: 'cover.close',
        icon: 'down',
        tap_action: perform('cover.close_cover', 'row'),
        domains: ['cover'],
      },
    },
  },
  /** A lock unlocked or open for 10 minutes: Lock on each row, Lock all (asked first) for every one. */
  unlocked: {
    title: 'alerts.preset.unlocked',
    icon: 'unlock',
    severity: 'warning',
    clauses: () => [{ domain: 'lock', state: ['unlocked', 'open'] }],
    defaults: {
      for: { minutes: 10 },
      row_button: { words: 'lock.lock', icon: 'lock', tap_action: perform('lock.lock', 'row') },
      actions: [{ words: 'alerts.lock_all', icon: 'lock', tap_action: confirmed('lock.lock') }],
    },
  },
  /** Water, smoke, gas, carbon monoxide, a safety or a tamper sensor going off: critical. */
  hazards: {
    title: 'alerts.preset.hazards',
    icon: 'warn',
    severity: 'critical',
    clauses: () => [
      {
        domain: 'binary_sensor',
        device_class: ['carbon_monoxide', 'gas', 'moisture', 'safety', 'smoke', 'tamper'],
        state: 'on',
      },
    ],
  },
  /** A vacuum or a mower in error, a jammed lock, a problem sensor on: a vacuum's row sends it home. */
  errors: {
    title: 'alerts.preset.errors',
    icon: 'wrench',
    severity: 'warning',
    clauses: () => [
      { domain: ['lawn_mower', 'vacuum'], state: 'error' },
      { domain: 'lock', state: 'jammed' },
      { domain: 'binary_sensor', device_class: 'problem', state: 'on' },
    ],
    defaults: {
      row_button: {
        words: 'vacuum.dock',
        icon: 'dock',
        tap_action: perform('vacuum.return_to_base', 'row'),
        domains: ['vacuum'],
      },
    },
  },
  /** An update waiting: an administrator installs it from its row, while it can be installed from here. */
  updates: {
    title: 'alerts.preset.updates',
    icon: 'update',
    severity: 'info',
    clauses: () => [{ domain: 'update', state: 'on' }],
    defaults: {
      row_button: {
        words: 'updates.install',
        icon: 'download',
        tap_action: perform('update.install', 'row'),
        admin_only: true,
        when: 'installable',
      },
    },
  },
  /** Lights left on (with `conditions`, when everyone is away, at night): Turn all off, asked first. */
  lights_on: {
    title: 'alerts.preset.lights_on',
    icon: 'bulb',
    severity: 'info',
    clauses: () => [{ domain: 'light', state: 'on' }],
    defaults: {
      actions: [
        { words: 'alerts.turn_all_off', icon: 'power', tap_action: confirmed('light.turn_off') },
      ],
    },
  },
  /**
   * Home Assistant's own alerts (`alert.*`) while they fire (`acknowledged: true`: the acknowledged ones too), each
   * its own alert with its own name: Acknowledge on it, as Home Assistant's alert says it (`alert.turn_off`).
   */
  ha_alerts: {
    title: 'alerts.preset.ha_alerts',
    icon: 'bell',
    severity: 'warning',
    params: ['acknowledged'],
    clauses: (config) => [{ domain: 'alert', state: config.acknowledged ? ['on', 'off'] : 'on' }],
    defaults: {
      split: true,
      row_button: ACKNOWLEDGE,
      actions: [{ ...ACKNOWLEDGE, tap_action: perform('alert.turn_off', 'matched') }],
    },
  },
  /**
   * Home Assistant's repairs, read by the card (`repairs/list_issues`, the ignored ones left out) and fed to the
   * engine; for administrators unless said, a row opens the repairs page. A repair's own severity raises the alert's:
   * critical and error are critical, a warning a warning.
   */
  repairs: {
    title: 'alerts.preset.repairs',
    icon: 'ha',
    severity: 'warning',
    source: 'repairs',
    clauses: () => [],
    defaults: {
      admin_only: true,
      row_action: { action: 'navigate', navigation_path: '/config/repairs' },
    },
  },
};
