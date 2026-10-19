// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the devices family lands with the index: the card's tag is defined before a page needs it
await familiesDefined;

/*
 * The vacuum's readouts (the area, the time, the time left) are laid out by measure (`statsRow`): three columns in a
 * phone's column, two and one in a 211 column where "Remaining" would not hold its third. The ruler is a stub: a
 * label's letters at 7, a figure's (and its unit's) at 11.
 */

const STAMP = '2026-10-17T08:00:00Z';
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state: value,
  attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
  last_changed: STAMP,
  last_updated: STAMP,
});

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { unit_system: { temperature: '°C', length: 'km' } },
  states: Object.fromEntries(
    [
      state('vacuum.robot', 'cleaning', { supported_features: 16380 }),
      state('sensor.robot_area', '24', { unit_of_measurement: 'm²' }),
      state('sensor.robot_elapsed', '18', { unit_of_measurement: 'min' }),
      state('sensor.robot_remaining', '42', { unit_of_measurement: 'min' }),
    ].map((s) => [s.entity_id, s]),
  ),
  entities: {},
  devices: {},
  areas: {},
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  head: { ruler: unknown };
};

async function columns(width: number) {
  const card = document.createElement('fluvy-vacuum-card') as CardElement;
  Object.assign(card.head, {
    ruler: {
      width: (...args: [string, string, string?, string?]) => {
        const [cls, text, , unit = ''] = args;
        if (cls.includes('fv-readout__label')) return text.length * 7;
        const pace = cls.includes('fv-readout--xs') ? 9 : 11;
        return cls.includes('fv-readout') ? (text.length + unit.length) * pace : text.length * 8;
      },
      pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
      clear() {},
    },
  });
  card.setConfig({
    type: 'custom:fluvy-vacuum-card',
    entity: 'vacuum.robot',
    area_entity: 'sensor.robot_area',
    duration_entity: 'sensor.robot_elapsed',
    remaining_entity: 'sensor.robot_remaining',
  });
  card.hass = hass;
  card.width = width;
  document.body.append(card);
  await card.updateComplete;
  const row = card.shadowRoot!.querySelector<HTMLElement>('.dv-cols')!;
  return {
    columns: row.style.getPropertyValue('--dv-cols'),
    odd: row.classList.contains('fv-cols--odd'),
    count: row.querySelectorAll('.fv-readout').length,
  };
}

afterEach(() => document.body.replaceChildren());

describe('the vacuum’s readouts', () => {
  it('take three columns in a phone’s column, two and one where "Remaining" would not hold its third', async () => {
    // 320: three columns of 96 hold "Remaining" (63) and "42 min" (55)
    expect(await columns(360)).toEqual({ columns: '3', odd: false, count: 3 });
    // 171: three columns of 46 do not hold "Remaining"; two of 78 do, the last readout across the row
    expect(await columns(211)).toEqual({ columns: '2', odd: true, count: 3 });
  });
});
