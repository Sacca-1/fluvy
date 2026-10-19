import type { LovelaceCardConfig } from '@fluvy/core';
import { FluvyAlertsCard } from '../../../../packages/cards/src/alerts/alerts-card.js';
import '../../../../packages/cards/src/alerts/sheet/alerts-sheet.js';
import type { AlertConfig } from '../../../../packages/cards/src/alerts/model.js';
import type { StateSeed } from '../hass.js';
import { NOW } from '../now.js';
import type { FrameSpec, SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-alerts-card'))
  customElements.define('fluvy-alerts-card', FluvyAlertsCard);

/*
 * Issue #48's alerts, on a house with something wrong in every corner: three low batteries and a garden valve's (the
 * robot's charging and Marta's phone are left out), two lights and the office's presence sensor gone (one device, three
 * entities), the front door open six minutes, the garage forty (escalated past thirty), the back door unlocked, a
 * leak in the kitchen, the robot in error, three updates (one installing), Home Assistant's freezer alert firing, a
 * well level stuck for a day and two repairs (a third ignored). Then every variant, the narrow columns, all clear,
 * colours, a fold, and the sheets docked: an alert's rows, its snooze, the overview with a snoozed alert. The cards'
 * clock is the sheets' (`_now`), but for the live frames at the end (a `for` reached, a banner turning).
 */

const at = (seconds: number): string => new Date(NOW.getTime() - seconds * 1000).toISOString();
const frozen = { _now: NOW.toISOString() };
const card = (config: Record<string, unknown>): LovelaceCardConfig => ({
  type: 'custom:fluvy-alerts-card',
  ...frozen,
  ...config,
});

const battery = { device_class: 'battery', unit_of_measurement: '%', state_class: 'measurement' };

const STATES: readonly StateSeed[] = [
  /* batteries */
  ['sensor.al_hall_sensor_battery', '12', { ...battery, friendly_name: 'Hall sensor battery' }],
  ['sensor.al_porch_motion_battery', '18', { ...battery, friendly_name: 'Porch motion battery' }],
  ['sensor.al_bath_leak_battery', '9', { ...battery, friendly_name: 'Bathroom leak battery' }],
  [
    'binary_sensor.al_garden_valve_battery',
    'on',
    { device_class: 'battery', friendly_name: 'Garden valve battery' },
  ],
  ['sensor.al_robot_battery', '15', { ...battery, friendly_name: 'Robot battery' }],
  [
    'binary_sensor.al_robot_charging',
    'on',
    { device_class: 'battery_charging', friendly_name: 'Robot charging' },
  ],
  ['sensor.al_phone_battery', '14', { ...battery, friendly_name: 'Marta’s phone battery' }],
  /* gone */
  ['light.al_hall_spots', 'unavailable', { friendly_name: 'Hall spots' }, 3 * 3600],
  ['light.al_balcony', 'unavailable', { friendly_name: 'Balcony light' }, 25 * 60],
  [
    'binary_sensor.al_office_presence',
    'unavailable',
    { device_class: 'occupancy', friendly_name: 'Office presence' },
    6 * 3600,
  ],
  [
    'sensor.al_office_illuminance',
    'unavailable',
    { device_class: 'illuminance', friendly_name: 'Office illuminance' },
    6 * 3600,
  ],
  [
    'sensor.al_office_temperature',
    'unavailable',
    { device_class: 'temperature', friendly_name: 'Office temperature' },
    6 * 3600,
  ],
  /* open, unlocked, wet, in error */
  ['binary_sensor.al_front_door', 'on', { device_class: 'door', friendly_name: 'Front door' }, 360],
  ['cover.al_garage_door', 'open', { device_class: 'garage', friendly_name: 'Garage door' }, 2400],
  ['lock.al_back_door', 'unlocked', { friendly_name: 'Back door' }, 720],
  ['lock.al_shed', 'unlocked', { friendly_name: 'Shed' }, 3 * 3600],
  [
    'binary_sensor.al_kitchen_leak',
    'on',
    { device_class: 'moisture', friendly_name: 'Kitchen leak sensor' },
    180,
  ],
  ['vacuum.al_robot', 'error', { friendly_name: 'Robot vacuum' }, 900],
  /* updates */
  [
    'update.al_core',
    'on',
    {
      friendly_name: 'Home Assistant Core',
      title: 'Home Assistant Core',
      installed_version: '2026.9.2',
      latest_version: '2026.9.3',
      supported_features: 1,
      in_progress: false,
    },
    5 * 3600,
  ],
  [
    'update.al_zigbee',
    'on',
    {
      friendly_name: 'Zigbee coordinator firmware',
      installed_version: '7.4.4',
      latest_version: '8.0.3',
      supported_features: 1,
      in_progress: false,
    },
    2 * 86400,
  ],
  [
    'update.al_esphome',
    'on',
    {
      friendly_name: 'ESPHome',
      installed_version: '2026.8.0',
      latest_version: '2026.9.0',
      supported_features: 5,
      in_progress: true,
      update_percentage: 40,
    },
    3600,
  ],
  /* Home Assistant's own alert, a stuck reading, and what the live frames change */
  ['alert.al_freezer', 'on', { friendly_name: 'Freezer door open' }, 600],
  [
    'sensor.al_well_level',
    '412',
    { friendly_name: 'Well level', unit_of_measurement: 'cm' },
    30 * 3600,
  ],
  ['binary_sensor.al_patio_door', 'off', { device_class: 'door', friendly_name: 'Patio door' }],
  ['light.al_desk', 'on', { friendly_name: 'Desk lamp' }],
];

const AREAS = {
  al_hall: 'Hall',
  al_kitchen: 'Kitchen',
  al_office: 'Office',
  al_garage: 'Garage',
  al_bath: 'Bathroom',
  al_porch: 'Porch',
  al_garden: 'Garden',
  al_living: 'Living room',
};

/** Each entity's device and area. */
const PLACES: Readonly<Record<string, readonly [device: string, area: keyof typeof AREAS]>> = {
  'sensor.al_hall_sensor_battery': ['al_hall_sensor', 'al_hall'],
  'sensor.al_porch_motion_battery': ['al_porch_motion', 'al_porch'],
  'sensor.al_bath_leak_battery': ['al_bath_leak', 'al_bath'],
  'binary_sensor.al_garden_valve_battery': ['al_garden_valve', 'al_garden'],
  'sensor.al_robot_battery': ['al_robot', 'al_living'],
  'binary_sensor.al_robot_charging': ['al_robot', 'al_living'],
  'vacuum.al_robot': ['al_robot', 'al_living'],
  'sensor.al_phone_battery': ['al_phone', 'al_living'],
  'light.al_hall_spots': ['al_hall_spots', 'al_hall'],
  'light.al_balcony': ['al_balcony', 'al_porch'],
  'binary_sensor.al_office_presence': ['al_office_presence', 'al_office'],
  'sensor.al_office_illuminance': ['al_office_presence', 'al_office'],
  'sensor.al_office_temperature': ['al_office_presence', 'al_office'],
  'binary_sensor.al_front_door': ['al_front_door', 'al_hall'],
  'cover.al_garage_door': ['al_garage_door', 'al_garage'],
  'lock.al_back_door': ['al_back_door', 'al_kitchen'],
  'lock.al_shed': ['al_shed', 'al_garden'],
  'binary_sensor.al_kitchen_leak': ['al_kitchen_leak', 'al_kitchen'],
  'binary_sensor.al_patio_door': ['al_patio_door', 'al_living'],
};

const DEVICES: Readonly<Record<string, string>> = {
  al_hall_sensor: 'Hall sensor',
  al_porch_motion: 'Porch motion',
  al_bath_leak: 'Bathroom leak sensor',
  al_garden_valve: 'Garden valve',
  al_robot: 'Robot vacuum',
  al_phone: 'Marta’s phone',
  al_hall_spots: 'Hall spots',
  al_balcony: 'Balcony light',
  al_office_presence: 'Office presence',
  al_front_door: 'Front door',
  al_garage_door: 'Garage door',
  al_back_door: 'Back door',
  al_shed: 'Shed lock',
  al_kitchen_leak: 'Kitchen leak sensor',
  al_patio_door: 'Patio door',
};

/** The alerts the issue asks for, each with an id (its snoozes are remembered by it). */
const HOUSE: readonly AlertConfig[] = [
  { preset: 'hazards', id: 'hazards' },
  { preset: 'unavailable', domain: 'light', name: 'Lights unavailable', id: 'lights' },
  {
    preset: 'unavailable',
    device_class: ['occupancy', 'presence', 'motion'],
    name: 'Presence sensors offline',
    id: 'presence',
  },
  { preset: 'low_battery', id: 'batteries' },
  { preset: 'open', for: { minutes: 5 }, id: 'open' },
  { preset: 'errors', id: 'errors' },
  { preset: 'updates', id: 'updates' },
];

const sheetFrame = (title: string, alerts: readonly AlertConfig[], open: string): FrameSpec => ({
  title,
  width: 392,
  cards: [card({ alerts, _sheet: open })],
});

const FRAMES: readonly FrameSpec[] = [
  { title: 'Tiles', cards: [card({ alerts: HOUSE })] },
  { title: 'Mini', cards: [card({ alerts: HOUSE, variant: 'mini' })] },
  { title: 'Chips', cards: [card({ alerts: HOUSE, variant: 'chips' })] },
  { title: 'Rows', cards: [card({ alerts: HOUSE, variant: 'rows' })] },
  { title: 'Rows · compact', cards: [card({ alerts: HOUSE, variant: 'rows', compact: true })] },
  // held still: the gravest, and how many more there are
  { title: 'Banner', cards: [card({ alerts: HOUSE, variant: 'banner', rotate: 0 })] },
  { title: 'Narrow 211', width: 211, cards: [card({ alerts: HOUSE })] },
  { title: 'Narrow 232 · chips', width: 232, cards: [card({ alerts: HOUSE, variant: 'chips' })] },
  { title: 'Mini · half', cards: [{ ...card({ alerts: HOUSE, variant: 'mini' }), cols: 6 }] },
  { title: '296', width: 296, cards: [card({ alerts: HOUSE })] },
  { title: '412 · rows', width: 412, cards: [card({ alerts: HOUSE, variant: 'rows' })] },
  {
    title: 'Desktop',
    width: 1400,
    cards: [card({ alerts: HOUSE, columns: 'auto' })],
  },
  // asked to stay while all is clear: the quiet tile, and the head over its panel
  {
    title: 'All clear',
    cards: [card({ alerts: [{ preset: 'hazards', area: 'al_garden' }], hide_empty: false })],
  },
  {
    title: 'All clear · rows',
    cards: [
      card({
        alerts: [{ preset: 'hazards', area: 'al_garden' }],
        variant: 'rows',
        hide_empty: false,
      }),
    ],
  },
  // an alert's own colour is its circle's; the severity keeps the fill. The card wears a surface of its own
  {
    title: 'Colours',
    cards: [
      card({
        alerts: [
          { preset: 'low_battery', color: 'orange', id: 'batteries' },
          { preset: 'updates', color: 'purple', tone: 'media', id: 'updates' },
          { preset: 'hazards', id: 'hazards' },
        ],
        card_color: 'blue',
        variant: 'rows',
      }),
    ],
  },
  // the garage open forty minutes: a warning that turned critical at thirty
  {
    title: 'Escalated',
    cards: [
      card({
        alerts: [
          {
            preset: 'open',
            area: 'al_garage',
            name: 'Garage left open',
            escalate: { for: { minutes: 30 } },
          },
          { preset: 'unlocked', id: 'locks' },
        ],
      }),
    ],
  },
  {
    title: 'Repairs and Home Assistant alerts',
    cards: [
      card({
        alerts: [
          { preset: 'repairs', id: 'repairs' },
          { preset: 'ha_alerts', id: 'ha' },
          {
            name: 'Well level stuck',
            entity: 'sensor.al_well_level',
            unchanged_for: { hours: 24 },
            severity: 'info',
            icon: 'drop',
            id: 'well',
          },
        ],
      }),
    ],
  },
  { title: 'Fold', cards: [card({ alerts: HOUSE, max_alerts: 3 })] },
  sheetFrame('Sheet · batteries', HOUSE, 'batteries'),
  sheetFrame('Sheet · updates', HOUSE, 'updates'),
  sheetFrame('Sheet · unavailable', [{ preset: 'unavailable', id: 'gone' }], 'gone'),
  sheetFrame('Sheet · repairs', [{ preset: 'repairs', id: 'repairs' }], 'repairs'),
  sheetFrame('Sheet · locks', [{ preset: 'unlocked', id: 'locks' }], 'locks'),
  sheetFrame('Sheet · snooze', HOUSE, 'batteries:snooze'),
  sheetFrame(
    'Sheet · overview',
    [
      ...HOUSE.slice(0, 1),
      { preset: 'unavailable', domain: 'light', name: 'Lights unavailable', id: 'lights-snoozed' },
      ...HOUSE.slice(3),
      { preset: 'lights_on', area: 'al_garden', id: 'garden-lights' },
    ],
    'overview',
  ),
  // the live frames: the card's own clock (a door open five minutes shows then), the banner turning every second
  {
    title: 'Live · for',
    measure: false,
    cards: [
      {
        type: 'custom:fluvy-alerts-card',
        alerts: [
          {
            name: 'Patio door open',
            entity: 'binary_sensor.al_patio_door',
            state: 'on',
            for: { minutes: 5 },
            id: 'patio',
          },
        ],
      },
    ],
  },
  {
    title: 'Live · banner',
    measure: false,
    cards: [
      {
        type: 'custom:fluvy-alerts-card',
        variant: 'banner',
        rotate: 1,
        show_duration: false,
        alerts: HOUSE,
      },
    ],
  },
  // a card of its own for the suite's snooze: nothing else remembers this one
  {
    title: 'Live · snooze',
    measure: false,
    cards: [card({ alerts: [{ preset: 'errors', id: 'errors-snooze' }] })],
  },
  // half a section (min_columns 6) for every variant, as Mini · half: the measurer's 152 and 172 draw them
  { title: 'Tiles · half', cards: [{ ...card({ alerts: HOUSE }), cols: 6 }] },
  { title: 'Chips · half', cards: [{ ...card({ alerts: HOUSE, variant: 'chips' }), cols: 6 }] },
  { title: 'Rows · half', cards: [{ ...card({ alerts: HOUSE, variant: 'rows' }), cols: 6 }] },
  {
    title: 'Rows · compact · half',
    cards: [{ ...card({ alerts: HOUSE, variant: 'rows', compact: true }), cols: 6 }],
  },
  {
    title: 'Banner · half',
    cards: [{ ...card({ alerts: HOUSE, variant: 'banner', rotate: 0 }), cols: 6 }],
  },
];

export const sheet: SheetSpec = {
  states: STATES,
  registry: {
    entities: Object.fromEntries(
      STATES.map(([id]) => {
        const place = PLACES[id];
        return [
          id,
          {
            entity_id: id,
            ...(place ? { device_id: place[0], area_id: place[1] } : {}),
            ...(id === 'sensor.al_phone_battery' ? { platform: 'mobile_app' } : {}),
          },
        ];
      }),
    ),
    devices: Object.fromEntries(
      Object.entries(DEVICES).map(([id, name]) => [
        id,
        { id, name, name_by_user: null, area_id: null },
      ]),
    ),
    areas: Object.fromEntries(
      Object.entries(AREAS).map(([id, name]) => [id, { area_id: id, name, picture: null }]),
    ),
  },
  issues: [
    {
      domain: 'homeassistant',
      issue_id: 'deprecated_yaml_mqtt',
      severity: 'warning',
      translation_key: 'deprecated_yaml',
      translation_placeholders: { integration: 'MQTT' },
      created: at(2 * 86400),
    },
    {
      domain: 'zha',
      issue_id: 'inconsistent_network_settings',
      severity: 'error',
      translation_key: 'inconsistent_network_settings',
      created: at(5 * 3600),
    },
    {
      domain: 'hacs',
      issue_id: 'restart_required',
      severity: 'warning',
      ignored: true,
      created: at(86400),
    },
  ],
  translations: {
    'component.homeassistant.issues.deprecated_yaml.title':
      'The {integration} YAML configuration is being removed',
    'component.zha.issues.inconsistent_network_settings.title':
      'Zigbee network settings have changed',
  },
  data: {
    user: {
      'fluvy-alerts': {
        v: 1,
        snoozed: { 'lights-snoozed': NOW.getTime() + 3 * 3600_000 },
        acked: {},
      },
    },
  },
  frames: FRAMES,
};
