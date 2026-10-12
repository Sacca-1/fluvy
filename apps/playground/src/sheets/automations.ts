import type { HomeAssistant } from '@fluvy/core';
import { html, type PropertyValues, type TemplateResult } from 'lit';
import {
  DEFAULT_DOMAINS,
  FluvyAutomationsCard,
  sunOf,
} from '../../../../packages/cards/src/automations/automations-card.js';
import {
  buildAutomation,
  parseAutomation,
  type AutomationConfig,
  type Schedule,
} from '../../../../packages/cards/src/automations/schedule.js';
import {
  FluvyScheduleSheet,
  type ScheduleRequest,
} from '../../../../packages/cards/src/automations/sheet/schedule-sheet.js';
import { Card } from '../../../../packages/cards/src/shared/base.js';
import type { StateSeed } from '../hass.js';
import { NOW } from '../now.js';
import type { SheetSpec } from '../scenes.js';

/**
 * The automations sheet: Marta's automations as Home Assistant lists them — three Fluvy schedules (a window on the
 * clock, a window by the sun, a thermostat on the weekend), two plain automations, one unavailable and one with a
 * `fluvy_` id that is no longer a schedule — with the config API answered here, in memory: a GET returns the config
 * (or Home Assistant's 404), a POST stores it, adds the entity a beat later and fires `automation_reloaded` (a
 * `!fail` alias is refused with Home Assistant's 400), a DELETE drops it. The sheet frames dock the schedule sheet
 * in the flow, as the keypad's does, so it can be photographed and measured.
 */

const WORKDAY = 'binary_sensor.workday_sensor';
const LATENCY = 140;

const iso = (date: Date): string => date.toISOString();
const ago = (minutes: number): string => iso(new Date(NOW.getTime() - minutes * 60_000));

const GOOD_MORNING: Schedule = {
  id: 'fluvy_a1b2c3d4e5f6',
  alias: 'Good morning',
  targets: ['light.kitchen'],
  days: { kind: 'workdays' },
  start: { kind: 'time', at: '06:45' },
  end: { kind: 'time', at: '08:00' },
  then: { verb: 'on', level: 70 },
};
const BLINDS: Schedule = {
  id: 'fluvy_0b1a2d3e4f50',
  alias: 'Blinds',
  targets: ['cover.living'],
  days: { kind: 'every' },
  start: { kind: 'sun', event: 'sunrise', offset: 15 },
  end: { kind: 'sun', event: 'sunset', offset: -30 },
  then: { verb: 'open' },
};
const HEATING: Schedule = {
  id: 'fluvy_7e6a5d4c3b2a',
  alias: 'Weekend heating',
  targets: ['climate.living'],
  days: { kind: 'weekend' },
  start: { kind: 'time', at: '08:00' },
  end: { kind: 'time', at: '22:00' },
  then: { verb: 'on', temperature: 21 },
};
/** A `fluvy_` id whose automation was edited in Home Assistant past the shape (a template): a plain row. */
const ODD_ID = 'fluvy_0dd0dd0dd0dd';
const ODD: AutomationConfig & { description: string } = {
  id: ODD_ID,
  alias: 'Odd one',
  description: 'Edited in Home Assistant',
  triggers: [{ trigger: 'time', at: '21:00:00', id: 'start' }],
  conditions: [],
  actions: [
    {
      action: 'light.turn_on',
      target: { entity_id: ['light.hall'] },
      data: { brightness_pct: '{{ states("input_number.level") | int }}' as unknown as number },
    },
  ],
  mode: 'single',
};

/** What Home Assistant's frontend throws for a failed `callApi`: the status and the body it carried. */
const refusal = (status: number, message: string): never => {
  throw { error: `Response error: ${status}`, status_code: status, body: { message } };
};

/** The configs as Home Assistant keeps them, by id. */
const configs = new Map<string, object>([
  [GOOD_MORNING.id, buildAutomation(GOOD_MORNING, WORKDAY)],
  [BLINDS.id, buildAutomation(BLINDS, WORKDAY)],
  [HEATING.id, buildAutomation(HEATING, WORKDAY)],
  [ODD_ID, ODD],
]);

/** The page's mock, once it is made (`main.ts` puts it on the window before any card asks). */
interface Mock {
  hass(): HomeAssistant;
  set(id: string, state?: string, attributes?: Record<string, unknown>): void;
  add(seed: StateSeed): void;
  remove(id: string): void;
  fire(eventType: string, data?: Record<string, unknown>): void;
}
const mock = (): Mock | undefined => (window as unknown as { fluvyMock?: Mock }).fluvyMock;

/** The automation entity whose config has that id, in the house as it is now. */
const entityOf = (id: string): string | undefined =>
  Object.values(mock()?.hass().states ?? {}).find(
    (entity) => entity.entity_id.startsWith('automation.') && entity.attributes['id'] === id,
  )?.entity_id;

const slug = (alias: string): string =>
  alias
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'schedule';

const PATH = /^config\/automation\/config\/(.+)$/;

/** Home Assistant's config API for automations, in memory. */
function api(method: string, path: string, body?: unknown): unknown {
  const id = PATH.exec(path)?.[1];
  if (!id) return undefined;
  if (method === 'GET') {
    const config = configs.get(id);
    return config ? structuredClone(config) : refusal(404, 'Resource not found');
  }
  if (method === 'POST') {
    const config = (body ?? {}) as Record<string, unknown>;
    const alias = typeof config['alias'] === 'string' ? config['alias'] : 'Schedule';
    if (alias === '!fail')
      return refusal(400, "Message malformed: extra keys not allowed @ data['nonsense']");
    configs.set(id, structuredClone(config));
    // the entity follows a beat later, as Home Assistant reloads the one automation it wrote
    setTimeout(() => {
      const house = mock();
      if (!house) return;
      const existing = entityOf(id);
      if (existing) house.set(existing, undefined, { friendly_name: alias, id });
      else
        house.add([
          `automation.${slug(alias)}`,
          'on',
          { friendly_name: alias, id, last_triggered: null, mode: 'single', current: 0 },
        ]);
      house.fire('automation_reloaded');
    }, LATENCY);
    return { result: 'ok' };
  }
  if (method === 'DELETE') {
    if (!configs.has(id)) return refusal(400, 'Resource not found');
    configs.delete(id);
    setTimeout(() => {
      const house = mock();
      const existing = entityOf(id);
      if (house && existing) house.remove(existing);
      house?.fire('automation_reloaded');
    }, LATENCY);
    return { result: 'ok' };
  }
  return undefined;
}

/**
 * The schedule sheet is a modal in production. Here it is docked into a frame, as the keypad's is, so it can be
 * photographed and measured: a new schedule with the kitchen lamp picked and "Turn on" chosen (`mode: new`), the
 * Good morning schedule being edited (`edit`), or the leak alert's details (`details`).
 */
class ScheduleDemo extends Card {
  protected renderCard(): TemplateResult {
    return html`<fluvy-schedule-sheet docked .hass=${this.hass}></fluvy-schedule-sheet>`;
  }

  protected override firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    const sheet = this.renderRoot.querySelector<FluvyScheduleSheet>('fluvy-schedule-sheet');
    const hass = this.hass;
    if (!sheet || !hass) return;
    const call = (service: string, entity: string, data: Record<string, unknown> = {}): void => {
      void this.hass?.callService('automation', service, data, { entity_id: entity });
    };
    const mode = this.config?.['mode'];
    if (mode === 'details') {
      sheet.open({
        entity: 'automation.leak_alert',
        alias: 'Leak alert',
        configId: '1690000000001',
        run: () => call('trigger', 'automation.leak_alert', { skip_condition: true }),
        toggle: (on) => call(on ? 'turn_on' : 'turn_off', 'automation.leak_alert'),
      });
      return;
    }
    const sun = sunOf(hass);
    const common: ScheduleRequest = {
      domains: DEFAULT_DOMAINS,
      workday: WORKDAY,
      timeStep: 5,
      ...(sun ? { sun } : {}),
      save: async () => undefined,
    };
    if (mode === 'edit') {
      const schedule = parseAutomation(configs.get(GOOD_MORNING.id));
      if (!schedule) return;
      sheet.open({
        ...common,
        schedule,
        entity: 'automation.good_morning',
        toggle: (on) => call(on ? 'turn_on' : 'turn_off', 'automation.good_morning'),
        remove: async () => undefined,
      });
      return;
    }
    sheet.open(common);
    // the kitchen lamp picked and Turn on chosen, so the sheet shows its Do and its brightness row
    void sheet.updateComplete.then(async () => {
      const row = [
        ...sheet.renderRoot.querySelectorAll<HTMLElement>('.ss-candidates .fv-row'),
      ].find((el) => el.textContent?.includes('Kitchen lamp'));
      row?.click();
      await sheet.updateComplete;
      sheet.renderRoot.querySelector<HTMLElement>('.ss-do .fv-option')?.click();
    });
  }
}

const define = (tag: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
};
define('fluvy-automations-card', FluvyAutomationsCard);
define('fluvy-schedule-sheet', FluvyScheduleSheet);
define('pg-schedule-demo', ScheduleDemo);

/** The house's seven automations, in the card's default order (by name). */
const AUTOMATIONS = [
  'automation.blinds',
  'automation.good_morning',
  'automation.leak_alert',
  'automation.odd',
  'automation.broken',
  'automation.vacation_lights',
  'automation.weekend_heating',
];

/** The guest's house: the same connection copied once, so the guest's card keeps a store of its own. */
let guestConnection: HomeAssistant['connection'] | undefined;
const guest = (hass: HomeAssistant): HomeAssistant => {
  guestConnection ??= { ...hass.connection };
  return {
    ...hass,
    user: { ...hass.user, is_admin: false },
    connection: guestConnection,
    // a guest never reads a config: a call here is a bug, and the suite looks for it
    callApi: async (method: string, path: string) => {
      const window_ = window as unknown as { __guestApi?: string[] };
      (window_.__guestApi ??= []).push(`${method} ${path}`);
      throw new Error('a guest may not read configs');
    },
  } as HomeAssistant;
};

const frozen = { _now: iso(NOW) };

export const sheet: SheetSpec = {
  states: [
    [
      'sun.sun',
      'below_horizon',
      {
        friendly_name: 'Sun',
        next_rising: iso(new Date(NOW.getTime() + (10 * 60 + 5) * 60_000)),
        next_setting: iso(new Date(NOW.getTime() + (22 * 60 + 30) * 60_000)),
        rising: false,
      },
    ],
    [WORKDAY, 'on', { friendly_name: 'Workday sensor' }],
    /* what a schedule may target */
    ['light.kitchen', 'on', { friendly_name: 'Kitchen lamp', brightness: 180 }],
    ['light.hall', 'off', { friendly_name: 'Hall light' }],
    ['cover.living', 'open', { friendly_name: 'Living room blinds', current_position: 100 }],
    [
      'climate.living',
      'heat',
      { friendly_name: 'Living room thermostat', temperature: 21, current_temperature: 20.5 },
    ],
    ['switch.fountain', 'off', { friendly_name: 'Fountain' }],
    ['scene.movie', '2026-09-16T20:30:00+00:00', { friendly_name: 'Movie night' }],
    ['script.goodnight', 'off', { friendly_name: 'Good night' }],
    /* the automations */
    [
      'automation.good_morning',
      'on',
      {
        friendly_name: 'Good morning',
        id: GOOD_MORNING.id,
        last_triggered: ago(15 * 60 + 2),
        mode: 'single',
        current: 0,
      },
    ],
    [
      'automation.blinds',
      'on',
      {
        friendly_name: 'Blinds',
        id: BLINDS.id,
        last_triggered: ago(2 * 60 + 20),
        mode: 'single',
        current: 0,
      },
    ],
    [
      'automation.weekend_heating',
      'off',
      {
        friendly_name: 'Weekend heating',
        id: HEATING.id,
        last_triggered: ago(4 * 24 * 60),
        mode: 'single',
        current: 0,
      },
    ],
    [
      'automation.leak_alert',
      'on',
      {
        friendly_name: 'Leak alert',
        id: '1690000000001',
        last_triggered: ago(2 * 24 * 60 + 30),
        mode: 'single',
        current: 0,
      },
    ],
    [
      'automation.vacation_lights',
      'off',
      {
        friendly_name: 'Vacation lights',
        id: '1690000000002',
        last_triggered: null,
        mode: 'single',
        current: 0,
      },
    ],
    ['automation.broken', 'unavailable', { friendly_name: 'Pool pump', id: '1690000000003' }],
    [
      'automation.odd',
      'on',
      { friendly_name: 'Odd one', id: ODD_ID, last_triggered: ago(30), mode: 'single', current: 0 },
    ],
  ],
  registry: {
    entities: {
      ...Object.fromEntries(
        [
          ['light.kitchen', 'au_kitchen'],
          ['light.hall', 'au_hall'],
          ['cover.living', 'au_living'],
          ['climate.living', 'au_living'],
          ['scene.movie', 'au_living'],
          ['switch.fountain', 'au_garden'],
          ['automation.leak_alert', 'au_kitchen'],
        ].map(([id, area]) => [id, { entity_id: id, area_id: area }]),
      ),
      [WORKDAY]: { entity_id: WORKDAY, platform: 'workday' },
    },
    areas: {
      au_kitchen: { area_id: 'au_kitchen', name: 'Kitchen' },
      au_hall: { area_id: 'au_hall', name: 'Hall' },
      au_living: { area_id: 'au_living', name: 'Living room' },
      au_garden: { area_id: 'au_garden', name: 'Garden' },
    },
  },
  api,
  frames: [
    {
      title: 'Rows',
      cards: [{ type: 'custom:fluvy-automations-card', entities: AUTOMATIONS, ...frozen }],
    },
    {
      title: 'Compact',
      cards: [
        {
          type: 'custom:fluvy-automations-card',
          variant: 'compact',
          entities: AUTOMATIONS,
          ...frozen,
        },
      ],
    },
    {
      title: 'Tiles',
      cards: [
        {
          type: 'custom:fluvy-automations-card',
          variant: 'tiles',
          entities: AUTOMATIONS,
          ...frozen,
        },
      ],
    },
    {
      title: 'Schedules only',
      cards: [
        {
          type: 'custom:fluvy-automations-card',
          show: 'schedules',
          variant: 'tiles',
          entities: AUTOMATIONS.slice(0, 2).concat('automation.weekend_heating'),
          ...frozen,
        },
      ],
    },
    // the whole house (no `entities`): a schedule saved or deleted elsewhere comes and goes here; seven rows, as the
    // house has, so the declared height is the measured one
    {
      title: 'Filters',
      cards: [
        {
          type: 'custom:fluvy-automations-card',
          show_filters: true,
          sort: 'next',
          max_rows: 7,
          ...frozen,
        },
      ],
    },
    // someone who is not an administrator: plain rows, the switch, no `+`, no configs read
    {
      title: 'Guest',
      cards: [{ type: 'custom:fluvy-automations-card', entities: AUTOMATIONS, ...frozen }],
      hass: guest,
    },
    {
      title: 'Narrow 232',
      width: 232,
      cards: [{ type: 'custom:fluvy-automations-card', entities: AUTOMATIONS, ...frozen }],
    },
    {
      title: 'Empty',
      cards: [{ type: 'custom:fluvy-automations-card', entities: [], ...frozen }],
    },
    {
      title: 'Sheet · new',
      width: 392,
      cards: [{ type: 'custom:pg-schedule-demo', mode: 'new' }],
    },
    {
      title: 'Sheet · edit',
      width: 392,
      cards: [{ type: 'custom:pg-schedule-demo', mode: 'edit' }],
    },
    {
      title: 'Sheet · details',
      width: 392,
      cards: [{ type: 'custom:pg-schedule-demo', mode: 'details' }],
    },
  ],
};
