// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { rowsKeepIcon as calendarRowsKeepIcon } from '../calendar/views/shared.js';
import type { ViewContext } from '../calendar/views/context.js';
import { familiesDefined } from '../index.js';

// the energy family lands with the index: the cards' tags are defined before a page needs them
await familiesDefined;

/*
 * The rows' rule (`HeadFit.rowsKeepIcon`), wired into every list: a column too narrow for a row's name beside what
 * ends it — a figure, a switch, a chevron — gives every row's circle to the names, and a wider one keeps them. Each
 * card is drawn at 211 (a full card's floor, 171 of content) and at 360 with a stub ruler, 8 px a glyph.
 */

const STAMP = '2026-10-17T08:00:00Z';
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state: value,
    attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
    last_changed: STAMP,
    last_updated: STAMP,
  }) as HassEntity;

const STATES = [
  state('sensor.oven_power', '1240', { unit_of_measurement: 'W', device_class: 'power' }),
  state('sensor.dishwasher_power', '860', { unit_of_measurement: 'W', device_class: 'power' }),
  state('sensor.bathroom_humidity', '55', { unit_of_measurement: '%', device_class: 'humidity' }),
  state('switch.bathroom_dehumidifier', 'on'),
  state('sensor.water', '48210', {
    unit_of_measurement: 'L',
    device_class: 'water',
    state_class: 'total_increasing',
  }),
  state('switch.garden_valve', 'off'),
  state('sensor.mains_pressure', '3.1', { unit_of_measurement: 'bar', device_class: 'pressure' }),
  state('light.reading_lamp', 'on'),
  state('sensor.hallway_temperature', '21.4', {
    unit_of_measurement: '°C',
    device_class: 'temperature',
  }),
  state('scene.movie_night', 'unknown'),
];

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { time_zone: 'UTC', unit_system: { temperature: '°C', length: 'km' } },
  states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
  entities: {},
  devices: {},
  areas: {},
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  // the recorder never answers: a trend row waits, its figure a dash
  callWS: () => new Promise(() => undefined),
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  head: { ruler: unknown };
};

/** A card drawn at `width` on a stub ruler (8 px a glyph, a pill adds its sides): the layout that happy-dom has none of. */
async function draw(tag: string, config: Record<string, unknown>, width: number) {
  const card = document.createElement(tag) as CardElement;
  Object.assign(card.head, {
    ruler: {
      width: (...args: [string, string, string?, string?]) =>
        (args[1].length + (args[3] ?? '').length) * 8,
      pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
      clear() {},
    },
  });
  card.setConfig({ type: `custom:${tag}`, ...config });
  card.hass = hass;
  card.width = width;
  document.body.append(card);
  await card.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
  return card;
}

/** The rows' circles: one entry a row, whether it drew its circle. */
const circles = (card: CardElement): boolean[] =>
  [...card.shadowRoot!.querySelectorAll('.fv-row')].map(
    (row) => row.querySelector('.fv-ico') !== null && !row.classList.contains('fv-row--bare'),
  );

afterEach(() => document.body.replaceChildren());

const CASES: readonly [string, string, Record<string, unknown>, number][] = [
  [
    'distribution rows',
    'fluvy-distribution-card',
    { entities: ['sensor.oven_power', 'sensor.dishwasher_power'], variant: 'rows' },
    2,
  ],
  [
    'humidity: the trend and the humidifier',
    'fluvy-humidity-card',
    { entity: 'sensor.bathroom_humidity', humidifier_entity: 'switch.bathroom_dehumidifier' },
    2,
  ],
  [
    'meters rows: a meter, a valve and a sensor',
    'fluvy-meters-card',
    {
      meters: ['sensor.water'],
      rows: [{ entity: 'switch.garden_valve' }, { entity: 'sensor.mains_pressure' }],
      variant: 'rows',
    },
    3,
  ],
  [
    'entities: a switch, a value and a chevron',
    'fluvy-entities-card',
    { entities: ['light.reading_lamp', 'sensor.hallway_temperature', 'scene.movie_night'] },
    3,
  ],
];

describe('a list’s rows keep their circle while the column holds their names', () => {
  it.each(CASES)(
    '%s: kept at 360, given to the names at 211',
    async (_name, tag, config, count) => {
      const wide = await draw(tag, config, 360);
      expect(circles(wide)).toEqual(Array.from({ length: count }, () => true));
      const narrow = await draw(tag, config, 211);
      expect(circles(narrow)).toEqual(Array.from({ length: count }, () => false));
    },
  );
});

describe('a calendar’s rows (its own measurer: 8 px a glyph without a layout)', () => {
  const ctx = (width: number): ViewContext => ({ width }) as unknown as ViewContext;

  it('keep their circle beside a chevron while the name holds its 96, and give it at a full card’s floor', () => {
    // 360 − 68 − 44 leaves 248 for "Tomorrow" (64): kept; 171 − 68 − 44 leaves 59: given
    expect(calendarRowsKeepIcon(ctx(360), [{ title: 'Tomorrow', end: 44 }])).toBe(true);
    expect(calendarRowsKeepIcon(ctx(171), [{ title: 'Tomorrow', end: 44 }])).toBe(false);
    // "3 plus tôt" (fr, 80) beside its chevron at 171: given; without a chevron: kept
    expect(calendarRowsKeepIcon(ctx(171), [{ title: '3 plus tôt', end: 44 }])).toBe(false);
    expect(calendarRowsKeepIcon(ctx(171), [{ title: '3 plus tôt', end: 0 }])).toBe(true);
  });

  it('give every circle with the one row that needs it', () => {
    // "+12 more" (64) beside its chevron at 171 leaves 59: the today row, which would hold its circle, gives it too
    expect(
      calendarRowsKeepIcon(ctx(171), [
        { title: 'Today', end: 0 },
        { title: '+12 more', end: 44 },
      ]),
    ).toBe(false);
  });

  it('give the circle to a line whose shortest form would be cut beside it ("Demain / 2 événe…")', () => {
    // 266 (226 − 68 − 44 = 114): "Demain" holds its 96, but "2 événements" (96) holds too: kept; "2 afspraken in
    // totaal" (168) does not: given
    expect(
      calendarRowsKeepIcon(ctx(226), [{ title: 'Demain', end: 44, sub: '2 événements' }]),
    ).toBe(true);
    expect(
      calendarRowsKeepIcon(ctx(226), [{ title: 'Demain', end: 44, sub: '2 afspraken in totaal' }]),
    ).toBe(false);
  });
});
