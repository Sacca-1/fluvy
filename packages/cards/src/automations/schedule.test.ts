import { describe, expect, it } from 'vitest';
import {
  buildAutomation,
  checkSchedule,
  crossesMidnight,
  domainsOf,
  endDays,
  newScheduleId,
  nextChange,
  nextRun,
  offsetText,
  parseAutomation,
  sanitiseAlias,
  SCHEDULE_ID,
  ScheduleError,
  verbsFor,
  type AutomationConfig,
  type ChooseStep,
  type Schedule,
  type Weekday,
} from './schedule.js';

const ID = 'fluvy_0123456789ab';
const SENSOR = 'binary_sensor.workday_sensor';
const WORKWEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** The wire's view of a config: what JSON keeps (no undefined), in the order it was written. */
const wire = (config: AutomationConfig): AutomationConfig =>
  JSON.parse(JSON.stringify(config)) as AutomationConfig;

/* ---------- six schedules and the automations they write ---------- */

const kitchen: Schedule = {
  id: ID,
  alias: ' Kitchen   morning ',
  targets: ['light.kitchen'],
  days: { kind: 'every' },
  start: { kind: 'time', at: '06:45' },
  then: { verb: 'on', level: 70 },
};

const kitchenWindow: Schedule = {
  ...kitchen,
  days: { kind: 'workdays' },
  end: { kind: 'time', at: '08:00' },
};

const blinds: Schedule = {
  id: ID,
  alias: 'Blinds',
  targets: ['cover.living', 'cover.kitchen'],
  days: { kind: 'every' },
  start: { kind: 'sun', event: 'sunrise', offset: 15 },
  end: { kind: 'sun', event: 'sunset', offset: -30 },
  then: { verb: 'open' },
};

const heating: Schedule = {
  id: ID,
  alias: 'Heating',
  targets: ['climate.living'],
  days: { kind: 'workdays', sensor: SENSOR },
  start: { kind: 'time', at: '08:00' },
  end: { kind: 'time', at: '22:00' },
  then: { verb: 'on', temperature: 21 },
};

const fountain: Schedule = {
  id: ID,
  alias: 'Fountain',
  targets: ['switch.fountain'],
  days: { kind: 'custom', days: ['sat', 'fri'] },
  start: { kind: 'time', at: '22:00' },
  end: { kind: 'time', at: '02:00' },
  then: { verb: 'on' },
};

const goodnight: Schedule = {
  id: ID,
  alias: 'Goodnight',
  description: 'Winds the house down',
  targets: ['script.goodnight', 'automation.night_mode', 'scene.movie'],
  days: { kind: 'custom', days: ['mon', 'wed', 'fri'] },
  start: { kind: 'time', at: '23:00' },
  then: { verb: 'run' },
};

const lightOn = {
  action: 'light.turn_on',
  target: { entity_id: ['light.kitchen'] },
  data: { brightness_pct: 70 },
};
const lightOff = { action: 'light.turn_off', target: { entity_id: ['light.kitchen'] } };

describe('buildAutomation', () => {
  it('writes a lone moment as a time trigger, no condition, the step with its brightness', () => {
    const built = buildAutomation(kitchen);
    expect(built).toEqual({
      id: ID,
      alias: 'Kitchen morning',
      triggers: [{ trigger: 'time', at: '06:45:00', id: 'start' }],
      conditions: [],
      actions: [lightOn],
      mode: 'single',
    });
    expect(Object.keys(built)).toEqual([
      'id',
      'alias',
      'triggers',
      'conditions',
      'actions',
      'mode',
    ]);
  });

  it('writes a window as two triggers and one choose, the workdays as a weekday list on both branches', () => {
    expect(buildAutomation(kitchenWindow)).toEqual({
      id: ID,
      alias: 'Kitchen morning',
      triggers: [
        { trigger: 'time', at: '06:45:00', id: 'start' },
        { trigger: 'time', at: '08:00:00', id: 'end' },
      ],
      conditions: [],
      actions: [
        {
          choose: [
            {
              conditions: [
                { condition: 'trigger', id: 'start' },
                { condition: 'time', weekday: WORKWEEK },
              ],
              sequence: [lightOn],
            },
            {
              conditions: [
                { condition: 'trigger', id: 'end' },
                { condition: 'time', weekday: WORKWEEK },
              ],
              sequence: [lightOff],
            },
          ],
        },
      ],
      mode: 'single',
    });
  });

  it("takes the house's workday sensor for the workdays and the weekend when the schedule names none", () => {
    const built = buildAutomation(kitchenWindow, SENSOR);
    const [start, end] = (built.actions[0] as ChooseStep).choose;
    expect(start?.conditions[1]).toEqual({ condition: 'state', entity_id: SENSOR, state: 'on' });
    expect(end?.conditions[1]).toEqual({ condition: 'state', entity_id: SENSOR, state: 'on' });
    const weekend = buildAutomation({ ...kitchen, days: { kind: 'weekend' } }, SENSOR);
    expect(weekend.conditions).toEqual([{ condition: 'state', entity_id: SENSOR, state: 'off' }]);
    // a list of the user's own stays a list, whatever the house has
    const custom = buildAutomation(
      { ...kitchen, days: { kind: 'custom', days: WORKWEEK } },
      SENSOR,
    );
    expect(custom.conditions).toEqual([{ condition: 'time', weekday: WORKWEEK }]);
  });

  it('writes sunrise and sunset with their offsets, every day without a condition, the opposite verb at the end', () => {
    expect(buildAutomation(blinds)).toEqual({
      id: ID,
      alias: 'Blinds',
      triggers: [
        { trigger: 'sun', event: 'sunrise', offset: '00:15:00', id: 'start' },
        { trigger: 'sun', event: 'sunset', offset: '-00:30:00', id: 'end' },
      ],
      conditions: [],
      actions: [
        {
          choose: [
            {
              conditions: [{ condition: 'trigger', id: 'start' }],
              sequence: [
                {
                  action: 'cover.open_cover',
                  target: { entity_id: ['cover.living', 'cover.kitchen'] },
                },
              ],
            },
            {
              conditions: [{ condition: 'trigger', id: 'end' }],
              sequence: [
                {
                  action: 'cover.close_cover',
                  target: { entity_id: ['cover.living', 'cover.kitchen'] },
                },
              ],
            },
          ],
        },
      ],
      mode: 'single',
    });
  });

  it('turns a thermostat on and then sets its target, the sensor condition on both ends of a window within the day', () => {
    const built = buildAutomation(heating);
    expect(built.actions).toEqual([
      {
        choose: [
          {
            conditions: [
              { condition: 'trigger', id: 'start' },
              { condition: 'state', entity_id: SENSOR, state: 'on' },
            ],
            sequence: [
              { action: 'climate.turn_on', target: { entity_id: ['climate.living'] } },
              {
                action: 'climate.set_temperature',
                target: { entity_id: ['climate.living'] },
                data: { temperature: 21 },
              },
            ],
          },
          {
            conditions: [
              { condition: 'trigger', id: 'end' },
              { condition: 'state', entity_id: SENSOR, state: 'on' },
            ],
            sequence: [{ action: 'climate.turn_off', target: { entity_id: ['climate.living'] } }],
          },
        ],
      },
    ]);
  });

  it("shifts the end's days by one when the window crosses midnight, and drops a sensor there", () => {
    const [start, end] = (buildAutomation(fountain).actions[0] as ChooseStep).choose;
    expect(start?.conditions[1]).toEqual({ condition: 'time', weekday: ['fri', 'sat'] });
    expect(end?.conditions[1]).toEqual({ condition: 'time', weekday: ['sat', 'sun'] });
    const night = buildAutomation({
      ...heating,
      start: { kind: 'time', at: '22:00' },
      end: { kind: 'time', at: '06:00' },
    });
    const [nightStart, nightEnd] = (night.actions[0] as ChooseStep).choose;
    expect(nightStart?.conditions).toHaveLength(2);
    expect(nightEnd?.conditions).toEqual([{ condition: 'trigger', id: 'end' }]);
  });

  it('runs scenes, scripts and automations, one step per domain in alphabetical order, the description kept', () => {
    const built = buildAutomation(goodnight);
    expect(built.description).toBe('Winds the house down');
    expect(Object.keys(built)).toEqual([
      'id',
      'alias',
      'description',
      'triggers',
      'conditions',
      'actions',
      'mode',
    ]);
    expect(built.conditions).toEqual([{ condition: 'time', weekday: ['mon', 'wed', 'fri'] }]);
    expect(built.actions).toEqual([
      {
        action: 'automation.trigger',
        target: { entity_id: ['automation.night_mode'] },
        data: { skip_condition: true },
      },
      { action: 'scene.turn_on', target: { entity_id: ['scene.movie'] } },
      { action: 'script.turn_on', target: { entity_id: ['script.goodnight'] } },
    ]);
  });

  it('keeps what the end does when the schedule says so, and rounds a level and a temperature', () => {
    const dim = buildAutomation({
      ...kitchenWindow,
      after: { verb: 'on', level: 29.6 },
      then: { verb: 'on', level: 100.4 },
    });
    const [start, end] = (dim.actions[0] as ChooseStep).choose;
    expect(start?.sequence).toEqual([{ ...lightOn, data: { brightness_pct: 100 } }]);
    expect(end?.sequence).toEqual([{ ...lightOn, data: { brightness_pct: 30 } }]);
    const warm = buildAutomation({ ...heating, then: { verb: 'on', temperature: 21.26 } });
    expect(JSON.stringify(warm)).toContain('"temperature":21.3');
    // an end that is not wanted is ignored: a lone moment has none
    expect(buildAutomation({ ...kitchen, after: { verb: 'off' } })).toEqual(
      buildAutomation(kitchen),
    );
  });

  it('throws the problem it finds', () => {
    expect(() => buildAutomation({ ...kitchen, targets: [] })).toThrow(ScheduleError);
    try {
      buildAutomation({ ...kitchen, start: { kind: 'time', at: '25:00' } });
      expect.unreachable();
    } catch (error) {
      expect((error as ScheduleError).problem).toBe('bad_time');
    }
  });
});

describe('parseAutomation', () => {
  const fixtures: [string, Schedule, Schedule][] = [
    ['a lone moment', kitchen, { ...kitchen, alias: 'Kitchen morning' }],
    ['a window', kitchenWindow, { ...kitchenWindow, alias: 'Kitchen morning' }],
    ['the blinds', blinds, blinds],
    ['the heating', heating, heating],
    [
      'a crossing window',
      fountain,
      { ...fountain, days: { kind: 'custom', days: ['fri', 'sat'] } },
    ],
    [
      'a run',
      goodnight,
      { ...goodnight, targets: ['automation.night_mode', 'scene.movie', 'script.goodnight'] },
    ],
  ];

  it.each(fixtures)(
    'reads %s back as it was written, and writes it the same again',
    (_name, schedule, read) => {
      const built = wire(buildAutomation(schedule));
      const parsed = parseAutomation(built);
      expect(parsed).toEqual(read);
      expect(wire(buildAutomation(parsed as Schedule))).toEqual(built);
    },
  );

  it('reads the sensor form of the workdays and the weekend, and a window with its own end', () => {
    const sensor = parseAutomation(wire(buildAutomation(kitchenWindow, SENSOR)));
    expect(sensor?.days).toEqual({ kind: 'workdays', sensor: SENSOR });
    const weekend = parseAutomation(
      wire(buildAutomation({ ...kitchen, days: { kind: 'weekend' } }, SENSOR)),
    );
    expect(weekend?.days).toEqual({ kind: 'weekend', sensor: SENSOR });
    const dim = parseAutomation(
      wire(buildAutomation({ ...kitchenWindow, after: { verb: 'on', level: 30 } })),
    );
    expect(dim?.after).toEqual({ verb: 'on', level: 30 });
    expect(dim?.then).toEqual({ verb: 'on', level: 70 });
  });

  it('reads a weekday list as the days it means', () => {
    const custom = (days: readonly string[]) =>
      parseAutomation({
        ...wire(buildAutomation(kitchen)),
        conditions: [{ condition: 'time', weekday: days }],
      })?.days;
    expect(custom(['sun', 'sat', 'fri', 'thu', 'wed', 'tue', 'mon'])).toEqual({ kind: 'every' });
    expect(custom(['fri', 'thu', 'wed', 'tue', 'mon'])).toEqual({ kind: 'workdays' });
    expect(custom(['sun', 'sat'])).toEqual({ kind: 'weekend' });
    expect(custom(['wed', 'mon', 'mon'])).toEqual({ kind: 'custom', days: ['mon', 'wed'] });
  });

  it('tolerates what Home Assistant accepts as the same thing', () => {
    expect(
      parseAutomation({
        id: 'fluvy_abcdefabcdef',
        alias: 'Hall',
        trigger: { platform: 'time', at: '7:05', id: 'start' },
        condition: { condition: 'time', weekday: 'fri' },
        action: { service: 'homeassistant.turn_on', entity_id: 'light.hall', metadata: {} },
      }),
    ).toEqual({
      id: 'fluvy_abcdefabcdef',
      alias: 'Hall',
      targets: ['light.hall'],
      days: { kind: 'custom', days: ['fri'] },
      start: { kind: 'time', at: '07:05' },
      then: { verb: 'on' },
    });
    const sun = (offset: unknown) =>
      parseAutomation({
        id: ID,
        alias: 'Sun',
        triggers: [
          {
            trigger: 'sun',
            event: 'sunset',
            ...(offset === undefined ? {} : { offset }),
            id: 'start',
          },
        ],
        actions: [{ action: 'switch.turn_on', data: { entity_id: ['switch.a'] } }],
      })?.start;
    expect(sun(-1800)).toEqual({ kind: 'sun', event: 'sunset', offset: -30 });
    expect(sun('-0:30')).toEqual({ kind: 'sun', event: 'sunset', offset: -30 });
    expect(sun('01:15:00')).toEqual({ kind: 'sun', event: 'sunset', offset: 75 });
    expect(sun('900')).toEqual({ kind: 'sun', event: 'sunset', offset: 15 });
    expect(sun({ minutes: 15 })).toEqual({ kind: 'sun', event: 'sunset', offset: 15 });
    expect(sun(undefined)).toEqual({ kind: 'sun', event: 'sunset', offset: 0 });
    // the branches in either order, the targets in any order, a trailing empty description
    const window = wire(buildAutomation(blinds));
    const choose = (window.actions[0] as { choose: unknown[] }).choose;
    const swapped = { ...window, description: '  ', actions: [{ choose: [choose[1], choose[0]] }] };
    expect(parseAutomation(swapped)).toEqual(blinds);
  });

  it.each([
    ["an id that is not Fluvy's", { id: 'morning' }],
    ['a blueprint', { use_blueprint: { path: 'x.yaml' } }],
    ['a template in the name', { alias: '{{ states.sun.sun.state }}' }],
    ['a template in the description', { description: '{% if x %}y{% endif %}' }],
    [
      'three triggers',
      {
        triggers: [
          { trigger: 'time', at: '06:00:00', id: 'start' },
          { trigger: 'time', at: '07:00:00', id: 'end' },
          { trigger: 'time', at: '08:00:00', id: 'end' },
        ],
      },
    ],
    [
      'a trigger of another kind',
      { triggers: [{ trigger: 'state', entity_id: 'light.x', id: 'start' }] },
    ],
    ['a trigger without its id', { triggers: [{ trigger: 'time', at: '06:45:00' }] }],
    ['a trigger with another id', { triggers: [{ trigger: 'time', at: '06:45:00', id: 'begin' }] }],
    [
      'a disabled trigger',
      { triggers: [{ trigger: 'time', at: '06:45:00', id: 'start', enabled: false }] },
    ],
    ['a time with seconds', { triggers: [{ trigger: 'time', at: '06:45:30', id: 'start' }] }],
    [
      'a time that is an entity',
      { triggers: [{ trigger: 'time', at: 'input_datetime.x', id: 'start' }] },
    ],
    [
      'days on the trigger',
      { triggers: [{ trigger: 'time', at: '06:45:00', weekday: ['mon'], id: 'start' }] },
    ],
    [
      'an offset with seconds',
      { triggers: [{ trigger: 'sun', event: 'sunset', offset: '00:00:30', id: 'start' }] },
    ],
    [
      'an offset of a day',
      { triggers: [{ trigger: 'sun', event: 'sunset', offset: '24:00:00', id: 'start' }] },
    ],
    [
      'two conditions',
      {
        conditions: [
          { condition: 'time', weekday: ['mon'] },
          { condition: 'time', weekday: ['tue'] },
        ],
      },
    ],
    ['a condition of another kind', { conditions: [{ condition: 'time', after: '09:00:00' }] }],
    [
      'a sensor that is not binary',
      { conditions: [{ condition: 'state', entity_id: 'sensor.workday', state: 'on' }] },
    ],
    [
      'a sensor with another state',
      { conditions: [{ condition: 'state', entity_id: SENSOR, state: 'unknown' }] },
    ],
    ['a key of its own', { variables: { x: 1 } }],
    ['another mode', { mode: 'restart' }],
    ['a delay', { actions: [lightOn, { delay: '00:01:00' }] }],
    [
      'a device as the target',
      { actions: [{ action: 'light.turn_on', target: { device_id: 'abc' } }] },
    ],
    [
      'data of another kind',
      {
        actions: [
          {
            action: 'light.turn_on',
            target: { entity_id: ['light.kitchen'] },
            data: { color_name: 'red' },
          },
        ],
      },
    ],
    ['a brightness beyond the range', { actions: [{ ...lightOn, data: { brightness_pct: 150 } }] }],
    ['a brightness on an off', { actions: [{ ...lightOff, data: { brightness_pct: 50 } }] }],
    [
      'a service beyond the table',
      { actions: [{ action: 'light.toggle', target: { entity_id: ['light.kitchen'] } }] },
    ],
    [
      'a target of another domain',
      { actions: [{ action: 'light.turn_on', target: { entity_id: ['switch.kitchen'] } }] },
    ],
    [
      'one domain twice',
      { actions: [lightOn, { action: 'light.turn_on', target: { entity_id: ['light.hall'] } }] },
    ],
    [
      'two verbs',
      { actions: [lightOn, { action: 'switch.turn_off', target: { entity_id: ['switch.a'] } }] },
    ],
    [
      "a target that is not a thermostat's",
      {
        actions: [
          {
            action: 'climate.set_temperature',
            target: { entity_id: ['climate.x'] },
            data: { temperature: 21 },
          },
        ],
      },
    ],
    [
      'a choose for a lone moment',
      {
        actions: [
          {
            choose: [{ conditions: [{ condition: 'trigger', id: 'start' }], sequence: [lightOn] }],
          },
        ],
      },
    ],
    ['no steps', { actions: [] }],
  ])('refuses %s', (_name, patch) => {
    expect(parseAutomation({ ...wire(buildAutomation(kitchen)), ...patch })).toBeUndefined();
  });

  it('refuses a window that is not whole', () => {
    const window = wire(buildAutomation(kitchenWindow));
    const choose = (
      window.actions[0] as { choose: { conditions: unknown[]; sequence: unknown[] }[] }
    ).choose;
    const withEnd = (
      end: Partial<{ conditions: unknown[]; sequence: unknown[] }>,
      extra: Record<string, unknown> = {},
    ) =>
      parseAutomation({
        ...window,
        ...extra,
        actions: [{ choose: [choose[0], { ...choose[1], ...end }] }],
      });
    expect(withEnd({})).toBeDefined();
    expect(
      withEnd({ sequence: [{ action: 'light.turn_off', target: { entity_id: ['light.hall'] } }] }),
    ).toBeUndefined();
    expect(
      withEnd({
        conditions: [
          { condition: 'trigger', id: 'end' },
          { condition: 'time', weekday: ['sat'] },
        ],
      }),
    ).toBeUndefined();
    expect(withEnd({ conditions: [{ condition: 'trigger', id: 'end' }] })).toBeUndefined();
    expect(withEnd({}, { conditions: [{ condition: 'time', weekday: ['mon'] }] })).toBeUndefined();
    expect(
      parseAutomation({ ...window, actions: [{ choose: [choose[0], choose[1]], default: [] }] }),
    ).toBeUndefined();
    expect(parseAutomation({ ...window, actions: [{ choose: [choose[0]] }] })).toBeUndefined();
    expect(parseAutomation({ ...window, actions: [lightOn] })).toBeUndefined();
    // the end of a crossing window keeps the shifted days, no other
    const crossing = wire(buildAutomation(fountain));
    const parts = (
      crossing.actions[0] as { choose: { conditions: unknown[]; sequence: unknown[] }[] }
    ).choose;
    const unshifted = {
      ...parts[1],
      conditions: [
        { condition: 'trigger', id: 'end' },
        { condition: 'time', weekday: ['fri', 'sat'] },
      ],
    };
    expect(
      parseAutomation({ ...crossing, actions: [{ choose: [parts[0], unshifted] }] }),
    ).toBeUndefined();
    // a run has no end
    const run = wire(buildAutomation(goodnight));
    expect(
      parseAutomation({
        ...run,
        triggers: [...run.triggers, { trigger: 'time', at: '23:30:00', id: 'end' }],
        conditions: [],
        actions: [
          {
            choose: [
              { conditions: [{ condition: 'trigger', id: 'start' }], sequence: run.actions },
              { conditions: [{ condition: 'trigger', id: 'end' }], sequence: run.actions },
            ],
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('is nothing for anything that is not an automation', () => {
    expect(parseAutomation(undefined)).toBeUndefined();
    expect(parseAutomation('yes')).toBeUndefined();
    expect(parseAutomation([])).toBeUndefined();
    expect(parseAutomation({ id: ID })).toBeUndefined();
  });
});

describe('the verbs', () => {
  it("offers what every domain can do, in the sheet's order", () => {
    expect(verbsFor(['light'])).toEqual(['on', 'off']);
    expect(verbsFor(['light', 'switch', 'climate'])).toEqual(['on', 'off']);
    expect(verbsFor(['cover', 'valve'])).toEqual(['open', 'close']);
    expect(verbsFor(['scene', 'script', 'automation', 'button'])).toEqual(['run']);
    expect(verbsFor(['light', 'cover'])).toEqual([]);
    expect(verbsFor(['sensor'])).toEqual([]);
    expect(verbsFor([])).toEqual([]);
  });

  it('names the domains of the targets once, in order', () => {
    expect(domainsOf(['switch.b', 'light.a', 'switch.a', 'nonsense'])).toEqual(['light', 'switch']);
    expect(domainsOf([])).toEqual([]);
  });
});

describe('checkSchedule', () => {
  it('finds the first thing wrong, or nothing', () => {
    expect(checkSchedule(kitchen)).toBeUndefined();
    expect(checkSchedule(heating)).toBeUndefined();
    expect(checkSchedule({ ...kitchen, targets: [] })).toBe('no_targets');
    expect(checkSchedule({ ...kitchen, targets: ['kitchen'] })).toBe('no_targets');
    expect(checkSchedule({ ...kitchen, targets: ['light.a', 'cover.b'] })).toBe('mixed_domains');
    expect(checkSchedule({ ...kitchen, targets: ['sensor.a'] })).toBe('mixed_domains');
    expect(checkSchedule({ ...kitchen, then: { verb: 'open' } })).toBe('mixed_domains');
    expect(checkSchedule({ ...kitchenWindow, after: { verb: 'open' } })).toBe('mixed_domains');
    expect(checkSchedule({ ...kitchen, start: { kind: 'time', at: '6:45' } })).toBe('bad_time');
    expect(checkSchedule({ ...kitchenWindow, end: { kind: 'time', at: '24:00' } })).toBe(
      'bad_time',
    );
    expect(
      checkSchedule({ ...kitchen, start: { kind: 'sun', event: 'sunset', offset: 1.5 } }),
    ).toBe('bad_offset');
    expect(
      checkSchedule({ ...kitchen, start: { kind: 'sun', event: 'sunset', offset: 1440 } }),
    ).toBe('bad_offset');
    expect(checkSchedule({ ...kitchen, days: { kind: 'custom', days: [] } })).toBe('no_days');
    expect(checkSchedule({ ...goodnight, end: { kind: 'time', at: '23:30' } })).toBe(
      'run_with_end',
    );
    expect(checkSchedule({ ...kitchen, targets: ['switch.a'] })).toBe('level_without_light');
    expect(checkSchedule({ ...kitchen, then: { verb: 'off', level: 70 } })).toBe(
      'level_without_light',
    );
    expect(checkSchedule({ ...kitchen, then: { verb: 'on', level: Number.NaN } })).toBe(
      'level_without_light',
    );
    expect(checkSchedule({ ...kitchenWindow, after: { verb: 'off', level: 10 } })).toBe(
      'level_without_light',
    );
    expect(checkSchedule({ ...kitchen, then: { verb: 'on', temperature: 21 } })).toBe(
      'temperature_without_climate',
    );
    expect(checkSchedule({ ...heating, then: { verb: 'off', temperature: 21 } })).toBe(
      'temperature_without_climate',
    );
    // a level or a temperature on the end counts only with an end
    expect(checkSchedule({ ...kitchen, after: { verb: 'open', level: 3 } })).toBeUndefined();
  });
});

describe('the days and the moments', () => {
  it('tells a window that crosses midnight', () => {
    const at = (time: string): Schedule['start'] => ({ kind: 'time', at: time });
    expect(crossesMidnight(at('22:00'), at('02:00'))).toBe(true);
    expect(crossesMidnight(at('09:00'), at('11:00'))).toBe(false);
    expect(crossesMidnight(at('09:00'), at('09:00'))).toBe(true);
    expect(crossesMidnight({ kind: 'sun', event: 'sunset', offset: 0 }, at('23:00'))).toBe(false);
    expect(crossesMidnight({ kind: 'sun', event: 'sunset', offset: 0 }, at('02:00'))).toBe(true);
    expect(crossesMidnight(at('22:00'), { kind: 'sun', event: 'sunrise', offset: 0 })).toBe(true);
    expect(crossesMidnight(at('05:00'), { kind: 'sun', event: 'sunrise', offset: 30 })).toBe(false);
    expect(
      crossesMidnight(
        { kind: 'sun', event: 'sunrise', offset: 0 },
        { kind: 'sun', event: 'sunset', offset: 0 },
      ),
    ).toBe(false);
    expect(
      crossesMidnight(
        { kind: 'sun', event: 'sunset', offset: 0 },
        { kind: 'sun', event: 'sunrise', offset: 0 },
      ),
    ).toBe(true);
  });

  it('shifts the days of a crossing end, and lets a sensor go', () => {
    expect(endDays({ kind: 'every' }, true)).toEqual({ kind: 'every' });
    expect(endDays({ kind: 'workdays' }, false)).toEqual({ kind: 'workdays' });
    expect(endDays({ kind: 'workdays' }, true)).toEqual({
      kind: 'custom',
      days: ['tue', 'wed', 'thu', 'fri', 'sat'],
    });
    expect(endDays({ kind: 'weekend' }, true)).toEqual({ kind: 'custom', days: ['mon', 'sun'] });
    expect(endDays({ kind: 'custom', days: ['sun', 'mon', 'tue', 'wed', 'thu'] }, true)).toEqual({
      kind: 'workdays',
    });
    expect(endDays({ kind: 'workdays', sensor: SENSOR }, false)).toEqual({
      kind: 'workdays',
      sensor: SENSOR,
    });
    expect(endDays({ kind: 'workdays', sensor: SENSOR }, true)).toEqual({ kind: 'every' });
  });

  it('writes an offset as Home Assistant does', () => {
    expect(offsetText(0)).toBe('00:00:00');
    expect(offsetText(-30)).toBe('-00:30:00');
    expect(offsetText(75)).toBe('01:15:00');
    expect(offsetText(-600)).toBe('-10:00:00');
  });
});

describe('nextRun', () => {
  const local = (y: number, m: number, d: number, h: number, min: number): Date =>
    new Date(y, m - 1, d, h, min);
  const at = (time: string, days: Schedule['days'] = { kind: 'every' }): Schedule => ({
    ...kitchen,
    days,
    start: { kind: 'time', at: time },
  });

  it("finds the next time of day on the browser's own clock, day by day", () => {
    const saturday = local(2026, 3, 28, 10, 0);
    expect(nextRun(at('09:00'), saturday)).toEqual(local(2026, 3, 29, 9, 0));
    expect(nextRun(at('10:00'), saturday)).toEqual(local(2026, 3, 29, 10, 0)); // not this very minute
    expect(nextRun(at('10:01'), saturday)).toEqual(local(2026, 3, 28, 10, 1));
    expect(nextRun(at('09:00', { kind: 'workdays' }), saturday)).toEqual(local(2026, 3, 30, 9, 0));
    expect(nextRun(at('09:00', { kind: 'weekend' }), saturday)).toEqual(local(2026, 3, 29, 9, 0));
    expect(nextRun(at('09:00', { kind: 'custom', days: ['sat'] }), saturday)).toEqual(
      local(2026, 4, 4, 9, 0),
    );
    expect(nextRun(at('09:00', { kind: 'custom', days: ['wed', 'mon'] }), saturday)).toEqual(
      local(2026, 3, 30, 9, 0),
    );
    expect(nextRun(at('09:00', { kind: 'custom', days: [] }), saturday)).toBeUndefined();
    expect(nextRun(at('9:00'), saturday)).toBeUndefined();
    expect(nextRun(at('09:00'), new Date(Number.NaN))).toBeUndefined();
  });

  it("keeps the wall clock of the house's zone across a change of the clocks", () => {
    // Europe: the clocks go forward on Sunday 29 March 2026 at 01:00 UTC
    const madrid = { zone: 'Europe/Madrid' };
    const saturday = new Date('2026-03-28T09:00:00Z'); // 10:00 CET
    expect(nextRun(at('09:00'), saturday, madrid)).toEqual(new Date('2026-03-29T07:00:00Z')); // 09:00 CEST
    expect(nextRun(at('09:00', { kind: 'workdays' }), saturday, madrid)).toEqual(
      new Date('2026-03-30T07:00:00Z'),
    );
    expect(nextRun(at('09:00'), new Date('2026-03-29T08:00:00Z'), madrid)).toEqual(
      new Date('2026-03-30T07:00:00Z'),
    );
    expect(nextRun(at('23:30'), new Date('2026-03-28T23:00:00Z'), madrid)).toEqual(
      new Date('2026-03-29T21:30:00Z'),
    );
    // America: the clocks go forward on Sunday 8 March 2026 at 07:00 UTC
    const newYork = { zone: 'America/New_York' };
    expect(nextRun(at('09:00'), new Date('2026-03-07T15:00:00Z'), newYork)).toEqual(
      new Date('2026-03-08T13:00:00Z'),
    );
    expect(
      nextRun(at('09:00', { kind: 'weekend' }), new Date('2026-03-08T14:00:00Z'), newYork),
    ).toEqual(new Date('2026-03-14T13:00:00Z'));
    // a zone the browser does not know: its own clock
    expect(nextRun(at('09:00'), local(2026, 3, 28, 10, 0), { zone: 'Mars/Olympus' })).toEqual(
      local(2026, 3, 29, 9, 0),
    );
  });

  it('takes the sun from the next rising and setting, and the same instant a day later beyond them', () => {
    const sun = {
      rising: new Date('2026-09-18T05:52:00Z'),
      setting: new Date('2026-09-18T18:17:00Z'),
    };
    const evening = new Date('2026-09-17T19:47:12Z');
    const sunrise = (offset: number, days: Schedule['days'] = { kind: 'every' }): Schedule => ({
      ...kitchen,
      days,
      start: { kind: 'sun', event: 'sunrise', offset },
    });
    const sunset = (offset: number): Schedule => ({
      ...kitchen,
      start: { kind: 'sun', event: 'sunset', offset },
    });
    expect(nextRun(sunrise(15), evening, { sun })).toEqual(new Date('2026-09-18T06:07:00Z'));
    expect(nextRun(sunset(-30), evening, { sun })).toEqual(new Date('2026-09-18T17:47:00Z'));
    expect(nextRun(sunset(-30), new Date('2026-09-18T17:50:00Z'), { sun })).toEqual(
      new Date('2026-09-19T17:47:00Z'),
    );
    // Friday 18 September: the weekend's first sunrise is Saturday's
    expect(nextRun(sunrise(15, { kind: 'weekend' }), evening, { sun })).toEqual(
      new Date('2026-09-19T06:07:00Z'),
    );
    expect(nextRun(sunrise(15, { kind: 'custom', days: ['mon'] }), evening, { sun })).toEqual(
      new Date('2026-09-21T06:07:00Z'),
    );
    expect(nextRun(sunrise(15), evening)).toBeUndefined();
    expect(
      nextRun(sunrise(15), evening, {
        sun: { rising: new Date(Number.NaN), setting: sun.setting },
      }),
    ).toBeUndefined();
  });

  it('asks the workday sensor about today, and the weekday about the days after', () => {
    const monday = local(2026, 9, 14, 8, 0);
    const workdays = at('09:00', { kind: 'workdays', sensor: SENSOR });
    expect(nextRun(workdays, monday, { workday: true })).toEqual(local(2026, 9, 14, 9, 0));
    expect(nextRun(workdays, monday, { workday: false })).toEqual(local(2026, 9, 15, 9, 0)); // a holiday Monday
    expect(nextRun(workdays, monday, {})).toEqual(local(2026, 9, 14, 9, 0));
    const weekend = at('09:00', { kind: 'weekend', sensor: SENSOR });
    expect(nextRun(weekend, monday, { workday: false })).toEqual(local(2026, 9, 14, 9, 0));
    expect(nextRun(weekend, monday, { workday: true })).toEqual(local(2026, 9, 19, 9, 0));
    // a schedule on the weekday list is not the sensor's business
    expect(nextRun(at('09:00', { kind: 'workdays' }), monday, { workday: false })).toEqual(
      local(2026, 9, 14, 9, 0),
    );
  });

  it('tells the next change of a window: the sooner of its start and its end', () => {
    const window: Schedule = { ...at('09:00'), end: { kind: 'time', at: '11:00' } };
    expect(nextChange(window, local(2026, 9, 14, 10, 0))).toEqual({
      at: local(2026, 9, 14, 11, 0),
      which: 'end',
    });
    expect(nextChange(window, local(2026, 9, 14, 8, 0))).toEqual({
      at: local(2026, 9, 14, 9, 0),
      which: 'start',
    });
    expect(nextChange(window, local(2026, 9, 14, 12, 0))).toEqual({
      at: local(2026, 9, 15, 9, 0),
      which: 'start',
    });
    expect(nextChange(at('09:00'), local(2026, 9, 14, 12, 0))).toEqual({
      at: local(2026, 9, 15, 9, 0),
      which: 'start',
    });
    // a Friday-night window ends on Saturday
    const night: Schedule = {
      ...at('22:00', { kind: 'custom', days: ['fri'] }),
      end: { kind: 'time', at: '02:00' },
    };
    expect(nextChange(night, local(2026, 9, 19, 1, 0))).toEqual({
      at: local(2026, 9, 19, 2, 0),
      which: 'end',
    });
    expect(nextChange(night, local(2026, 9, 19, 3, 0))).toEqual({
      at: local(2026, 9, 25, 22, 0),
      which: 'start',
    });
    // a sensor window that crosses midnight ends every day
    const late: Schedule = {
      ...at('22:00', { kind: 'workdays', sensor: SENSOR }),
      end: { kind: 'time', at: '02:00' },
    };
    expect(nextChange(late, local(2026, 9, 19, 1, 0), { workday: false })).toEqual({
      at: local(2026, 9, 19, 2, 0),
      which: 'end',
    });
    expect(
      nextChange(
        { ...window, start: { kind: 'sun', event: 'sunrise', offset: 0 } },
        local(2026, 9, 14, 12, 0),
      ),
    ).toEqual({
      at: local(2026, 9, 15, 11, 0),
      which: 'end',
    });
    expect(
      nextChange({ ...at('09:00', { kind: 'custom', days: [] }) }, local(2026, 9, 14, 12, 0)),
    ).toBeUndefined();
  });
});

describe('the small helpers', () => {
  it('makes fresh ids of the shape', () => {
    const ids = new Set(Array.from({ length: 20 }, newScheduleId));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(SCHEDULE_ID);
    expect(SCHEDULE_ID.test('fluvy_0123456789AB')).toBe(false);
    expect(SCHEDULE_ID.test('fluvy_0123456789abc')).toBe(false);
  });

  it('cleans a name for writing', () => {
    expect(sanitiseAlias('  Hello\u0000  world\n\tagain ')).toBe('Hello world again');
    expect(sanitiseAlias('x'.repeat(150))).toHaveLength(100);
    expect(Array.from(sanitiseAlias('🙂'.repeat(101)))).toHaveLength(100);
    expect(sanitiseAlias('   ')).toBe('');
    expect(sanitiseAlias('Café · Sol')).toBe('Café · Sol');
  });
});
