import { FluvyActionsCard } from '../../../../packages/cards/src/actions/actions-card.js';
import { FluvyHelpersCard } from '../../../../packages/cards/src/helpers/helpers-card.js';
import { FluvyTimerCard } from '../../../../packages/cards/src/timer/timer-card.js';
import { FluvyTodoCard } from '../../../../packages/cards/src/todo/todo-card.js';
import { FluvyUpdatesCard } from '../../../../packages/cards/src/updates/updates-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-helpers-card'))
  customElements.define('fluvy-helpers-card', FluvyHelpersCard);
if (!customElements.get('fluvy-actions-card'))
  customElements.define('fluvy-actions-card', FluvyActionsCard);
if (!customElements.get('fluvy-todo-card')) customElements.define('fluvy-todo-card', FluvyTodoCard);
if (!customElements.get('fluvy-timer-card'))
  customElements.define('fluvy-timer-card', FluvyTimerCard);
if (!customElements.get('fluvy-updates-card'))
  customElements.define('fluvy-updates-card', FluvyUpdatesCard);

/* These cards read the real clock (a countdown, "ran 07:00", "in 16 days"), so their moments are built off it, not off the seeded `NOW`. */
const REAL = Date.now();
const at = (offsetSeconds: number): string => new Date(REAL + offsetSeconds * 1000).toISOString();
const today = (hours: number, minutes: number): string => {
  const date = new Date(REAL);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};
const day = (offsetDays: number): string => {
  const date = new Date(REAL);
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  due?: string;
}

const LISTS: Record<string, readonly TodoItem[]> = {
  'todo.groceries': [
    { uid: '1', summary: 'Oat milk', status: 'needs_action' },
    { uid: '2', summary: 'Coffee beans · 1 kg', status: 'needs_action' },
    { uid: '3', summary: 'Lemons', status: 'needs_action' },
    { uid: '4', summary: 'Dish tabs', status: 'completed' },
    { uid: '5', summary: 'Bread', status: 'completed' },
  ],
  'todo.empty': [],
  'todo.readonly': [
    { uid: 'r1', summary: 'Water the plants', status: 'needs_action' },
    { uid: 'r2', summary: 'Take out the bins', status: 'completed' },
  ],
  'todo.chores': [
    {
      uid: 'c1',
      summary: 'Call the plumber about the kitchen tap that keeps dripping at night',
      status: 'needs_action',
      due: day(-2),
    },
    { uid: 'c2', summary: 'Renew the car insurance', status: 'needs_action', due: day(1) },
    { uid: 'c3', summary: 'Book the dentist', status: 'needs_action', due: day(16) },
    { uid: 'c4', summary: 'Descale the coffee machine', status: 'completed', due: day(-5) },
  ],
};

interface MockCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
  target?: { entity_id?: string | string[] } | undefined;
}

/**
 * The list a to-do entity would report right now: the seeded items with every `todo.*` call the page
 * has made replayed over them, so adding and ticking in the playground behave like the real service does.
 */
const itemsFor = (entityId: string): TodoItem[] => {
  const items: TodoItem[] = (LISTS[entityId] ?? []).map((item) => ({ ...item }));
  const mock = (globalThis as { fluvyMock?: { calls: readonly MockCall[] } }).fluvyMock;
  for (const call of mock?.calls ?? []) {
    if (call.domain !== 'todo') continue;
    const ids = ([] as string[]).concat(call.target?.entity_id ?? []);
    if (!ids.includes(entityId)) continue;
    const item = String(call.data['item'] ?? '');
    if (call.service === 'add_item')
      items.push({ uid: `new-${items.length + 1}`, summary: item, status: 'needs_action' });
    if (call.service === 'update_item') {
      const found = items.find((candidate) => candidate.uid === item);
      const status = call.data['status'];
      if (found && (status === 'completed' || status === 'needs_action')) found.status = status;
    }
    if (call.service === 'remove_item') {
      const index = items.findIndex((candidate) => candidate.uid === item);
      if (index >= 0) items.splice(index, 1);
    }
  }
  return items;
};

const list = (message: Record<string, unknown>): { items: TodoItem[] } => ({
  items: itemsFor(String(message['entity_id'] ?? '')),
});

const HELPERS_PAGE = { action: 'navigate', navigation_path: '/config/helpers' } as const;

export const sheet: SheetSpec = {
  states: [
    /* Helpers */
    [
      'input_number.brightness',
      '65.0',
      {
        friendly_name: 'Target brightness',
        min: 0,
        max: 100,
        step: 1,
        mode: 'slider',
        unit_of_measurement: '%',
      },
    ],
    [
      'input_select.house_mode',
      'Home',
      { friendly_name: 'House mode', options: ['Home', 'Away', 'Night', 'Guests'] },
    ],
    [
      'input_text.welcome',
      'Welcome home, Marta',
      { friendly_name: 'Welcome message', min: 0, max: 60, mode: 'text', pattern: null },
    ],
    ['input_boolean.guest', 'off', { friendly_name: 'Guest mode' }],

    /* Actions */
    ['scene.morning', today(7, 0), { friendly_name: 'Good morning', icon: 'sun' }],
    ['scene.night', at(-86400 + 600), { friendly_name: 'Good night', icon: 'moon' }],
    ['button.restart_ha', at(-3 * 86400), { friendly_name: 'Restart HA', icon: 'ha' }],
    [
      'script.backup',
      'off',
      { friendly_name: 'Backup now', icon: 'script', last_triggered: today(3, 0) },
    ],
    ['automation.sprinklers', 'on', { friendly_name: 'Water the garden', last_triggered: null }],
    ['script.movie', 'on', { friendly_name: 'Movie time', icon: 'film', last_triggered: at(-40) }],
    ['scene.ghost', 'unavailable', { friendly_name: 'Holiday lights' }],
    ['scene.off', at(-7200), { friendly_name: 'Lights off', icon: 'bulb' }],
    [
      'script.lock_up',
      'off',
      { friendly_name: 'Lock up', icon: 'lock', last_triggered: at(-90000) },
    ],
    ['input_button.doorbell', at(-300), { friendly_name: 'Chime', icon: 'note' }],
    ['scene.bedtime', 'unknown', { friendly_name: 'Bedtime', icon: 'moon' }],

    /* Updates */
    [
      'update.core',
      'on',
      {
        friendly_name: 'Home Assistant Core',
        icon: 'ha',
        installed_version: '2026.9.2',
        latest_version: '2026.10.0',
        in_progress: true,
        update_percentage: 62,
        supported_features: 5,
      },
    ],
    [
      'update.plug',
      'on',
      {
        friendly_name: 'Sonoff plug firmware',
        icon: 'plug',
        installed_version: '1.4.2',
        latest_version: '1.4.3',
        in_progress: false,
        update_percentage: null,
        supported_features: 1,
      },
    ],
    [
      'update.vacuum',
      'on',
      {
        friendly_name: 'Vacuum',
        icon: 'vacuum',
        installed_version: '3.5.8',
        latest_version: '3.6.0',
        in_progress: false,
        update_percentage: null,
        supported_features: 1,
      },
    ],
    [
      'update.router',
      'off',
      {
        friendly_name: 'Router',
        installed_version: '5.1.0',
        latest_version: '5.1.0',
        supported_features: 1,
      },
    ],
    [
      'update.bridge',
      'on',
      {
        friendly_name: 'Zigbee bridge',
        installed_version: '7.4',
        latest_version: '7.5',
        in_progress: true,
        update_percentage: null,
        supported_features: 1,
      },
    ],
    [
      'update.camera',
      'on',
      {
        friendly_name: 'Doorbell camera',
        installed_version: '2.0.1',
        latest_version: '2.1.0',
        supported_features: 0,
      },
    ],
    ['update.ghost', 'unavailable', { friendly_name: 'Garage opener' }],
    ['input_boolean.auto_update', 'on', { friendly_name: 'Auto-update at night' }],

    /* To-do */
    ['todo.groceries', '3', { friendly_name: 'Groceries', supported_features: 15 }],
    ['todo.empty', '0', { friendly_name: 'Reading list', supported_features: 15 }],
    ['todo.readonly', '1', { friendly_name: 'Shared list', supported_features: 0 }],
    ['todo.chores', '3', { friendly_name: 'Chores', supported_features: 127 }],

    /* Timer + counter. `remaining` is what was left when the timer last (re)started, as Home Assistant reports it. */
    [
      'timer.kitchen',
      'active',
      {
        friendly_name: 'Kitchen timer',
        duration: '0:30:00',
        remaining: '0:12:36',
        finishes_at: at(756),
      },
    ],
    ['timer.idle', 'idle', { friendly_name: 'Laundry timer', duration: '1:00:00' }],
    [
      'timer.paused',
      'paused',
      { friendly_name: 'Tea timer', duration: '0:05:00', remaining: '0:03:12' },
    ],
    ['timer.ghost', 'unavailable', { friendly_name: 'Garage timer' }],
    [
      'counter.coffee',
      '3',
      { friendly_name: 'Coffee counter', minimum: 0, maximum: 20, step: 1, initial: 0 },
    ],

    /* Schedules */
    [
      'input_datetime.wake_up',
      '06:45:00',
      { friendly_name: 'Wake-up', has_date: false, has_time: true },
    ],
    [
      'input_datetime.holiday',
      day(16),
      { friendly_name: 'Holiday start', has_date: true, has_time: false },
    ],
    ['sun.sun', 'above_horizon', { friendly_name: 'Sun' }],

    /* Hard states */
    [
      'input_number.broken',
      'unavailable',
      { friendly_name: 'Pool target', min: 0, max: 40, step: 0.5, unit_of_measurement: '°C' },
    ],
    [
      'number.offset',
      '-1.5',
      {
        friendly_name: 'Thermostat offset',
        min: -5,
        max: 5,
        step: 0.5,
        mode: 'box',
        unit_of_measurement: '°C',
      },
    ],
    [
      'input_select.zone',
      'Kitchen',
      {
        friendly_name: 'Announce in',
        options: [
          'Kitchen',
          'Living room',
          'Bedroom',
          'Office',
          'Hallway',
          'Bathroom',
          'Garage',
          'Garden',
          'Attic',
          'Basement',
          'Studio',
          'Terrace',
        ],
      },
    ],
    [
      'input_text.code',
      'ABC-1234',
      { friendly_name: 'Door code', min: 4, max: 8, mode: 'text', pattern: '[A-Z]{3}-[0-9]{1,4}' },
    ],
    [
      'input_text.wifi',
      'correct horse',
      { friendly_name: 'Guest Wi-Fi password', min: 8, max: 32, mode: 'password' },
    ],
    [
      'input_datetime.alarm',
      `${day(1)} 07:30:00`,
      { friendly_name: 'Next alarm', has_date: true, has_time: true },
    ],
    ['input_button.ping', at(-1800), { friendly_name: 'Ping the phone' }],
    [
      'counter.nulls',
      'unknown',
      { friendly_name: 'Visits', minimum: null, maximum: null, step: null },
    ],
  ],

  ws: {
    'todo/item/list': list,
    'todo/item/subscribe': list,
  },

  frames: [
    {
      title: 'Helpers',
      cards: [
        {
          type: 'custom:fluvy-helpers-card',
          title: 'Helpers',
          subtitle: 'Living room · 4 inputs',
          tap_action: HELPERS_PAGE,
          rows: [
            { entity: 'input_number.brightness', secondary: 'Living room lights' },
            { entity: 'input_select.house_mode', secondary: '' },
            { entity: 'input_text.welcome', secondary: 'Shown on arrival' },
            { entity: 'input_boolean.guest', icon: 'moon', secondary: 'Since Monday' },
          ],
        },
      ],
    },
    {
      title: 'Actions',
      cards: [
        {
          type: 'custom:fluvy-actions-card',
          tap_action: { action: 'navigate', navigation_path: '/config/scene/dashboard' },
          rows: [
            { entity: 'scene.morning', secondary: 'Lights & blinds' },
            { entity: 'scene.night', secondary: 'Lights & lock' },
            { entity: 'button.restart_ha', secondary: 'Core & add-ons' },
            { entity: 'script.backup', secondary: 'Full backup' },
          ],
        },
      ],
    },
    {
      title: 'Updates',
      cards: [
        {
          type: 'custom:fluvy-updates-card',
          entities: ['update.core', 'update.plug', 'update.vacuum', 'update.router'],
          toggle: 'input_boolean.auto_update',
          toggle_secondary: '03:00 · backup first',
        },
      ],
    },
    {
      title: 'Groceries',
      cards: [{ type: 'custom:fluvy-todo-card', entity: 'todo.groceries' }],
    },
    {
      title: 'Timer',
      cards: [
        { type: 'custom:fluvy-timer-card', entity: 'timer.kitchen' },
        {
          type: 'custom:fluvy-helpers-card',
          rows: [{ entity: 'counter.coffee', secondary: 'Resets at 00:00' }],
        },
      ],
    },
    {
      title: 'Schedules',
      cards: [
        {
          type: 'custom:fluvy-helpers-card',
          title: 'Schedules',
          subtitle: 'Date & time helpers',
          icon: 'clock',
          tap_action: HELPERS_PAGE,
          rows: [
            {
              entity: 'input_datetime.wake_up',
              secondary: 'Weekdays',
              presets: ['06:15', '06:45', '07:15'],
            },
            { entity: 'input_datetime.holiday', icon: 'calendar' },
            { entity: 'sun.sun', secondary: 'Sets at 20:12 · rises 07:48' },
          ],
        },
      ],
    },
    // a select's options as content-sized chips, and the quick-set times under a time helper
    {
      title: 'Helpers · options as chips',
      cards: [
        {
          type: 'custom:fluvy-helpers-card',
          options_style: 'chips',
          rows: [
            { entity: 'input_select.house_mode', secondary: '' },
            { entity: 'input_datetime.wake_up', presets: ['06:15', '07:15'] },
          ],
        },
      ],
    },
    // a list without its composer, its due dates or its ticked items
    {
      title: 'To-do · bare',
      cards: [
        {
          type: 'custom:fluvy-todo-card',
          entity: 'todo.groceries',
          show_add: false,
          show_due: false,
          show_completed: false,
        },
      ],
    },
    // the readout alone: no buttons, no gauge
    {
      title: 'Timer · bare',
      cards: [
        {
          type: 'custom:fluvy-timer-card',
          entity: 'timer.kitchen',
          show_actions: false,
          show_gauge: false,
        },
      ],
    },
    {
      title: 'Helpers · hard states',
      cards: [
        {
          type: 'custom:fluvy-helpers-card',
          title: 'Edge cases',
          entities: [
            'input_number.broken',
            'number.offset',
            'input_select.zone',
            'input_datetime.alarm',
            'input_button.ping',
            'input_text.code',
            'input_text.wifi',
            'counter.nulls',
            'sensor.ghost',
          ],
        },
      ],
    },
    {
      title: 'Actions · hard states',
      cards: [
        {
          type: 'custom:fluvy-actions-card',
          title: 'Garden & cinema',
          subtitle: 'Never run, running, gone',
          entities: ['automation.sprinklers', 'script.movie', 'scene.ghost', 'button.nowhere'],
        },
        {
          type: 'custom:fluvy-actions-card',
          title: 'Quick',
          subtitle: 'Two per line',
          columns: 2,
          entities: ['scene.off', 'script.lock_up', 'input_button.doorbell', 'scene.bedtime'],
        },
      ],
    },
    {
      title: 'Updates · hard states',
      cards: [
        {
          type: 'custom:fluvy-updates-card',
          title: 'Firmware',
          entities: ['update.bridge', 'update.camera', 'update.ghost', 'update.router'],
          show_up_to_date: true,
        },
        { type: 'custom:fluvy-updates-card', entities: ['update.router'] },
      ],
    },
    {
      title: 'To-do · hard states',
      cards: [
        { type: 'custom:fluvy-todo-card', entity: 'todo.empty' },
        { type: 'custom:fluvy-todo-card', entity: 'todo.readonly' },
        { type: 'custom:fluvy-todo-card', entity: 'todo.chores', icon: 'check' },
        {
          type: 'custom:fluvy-todo-card',
          entity: 'todo.groceries',
          title: 'Still to buy',
          hide_completed: true,
        },
      ],
    },
    {
      title: 'Timer · hard states',
      cards: [
        { type: 'custom:fluvy-timer-card', entity: 'timer.idle' },
        { type: 'custom:fluvy-timer-card', entity: 'timer.paused' },
        { type: 'custom:fluvy-timer-card', entity: 'timer.ghost' },
      ],
    },
    // half a section: the time left over its rounds (an hour's "1:00:00" too)
    {
      title: 'Timer · half a section',
      cards: [
        { type: 'custom:fluvy-timer-card', entity: 'timer.kitchen', cols: 6 },
        { type: 'custom:fluvy-timer-card', entity: 'timer.idle', cols: 6 },
      ],
    },
  ],
};
