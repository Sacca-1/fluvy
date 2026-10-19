// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the energy family lands with the index: the card's tag is defined before a page needs it
await familiesDefined;

const W = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
const PERCENT = { unit_of_measurement: '%', device_class: 'battery' };

/** A battery giving the house 1.5 kW from 64 %, or out of reach (its power and its charge). */
const house = (away: boolean): HomeAssistant => {
  const state = (id: string, value: string, attributes: Record<string, unknown>) => ({
    entity_id: id,
    state: away ? 'unavailable' : value,
    attributes,
    last_changed: '',
    last_updated: '',
  });
  return {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    config: {},
    states: {
      'sensor.battery_power': state('sensor.battery_power', '1500', W),
      'sensor.battery_level': state('sensor.battery_level', '64', PERCENT),
    },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    callWS: () => new Promise(() => undefined),
  } as unknown as HomeAssistant;
};

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

const mount = async (away: boolean): Promise<CardElement> => {
  const card = document.createElement('fluvy-batteries-card') as CardElement;
  card.setConfig({
    type: 'custom:fluvy-batteries-card',
    batteries: [{ power: 'sensor.battery_power', level: 'sensor.battery_level', capacity: 10 }],
  });
  card.hass = house(away);
  document.body.append(card);
  await card.updateComplete;
  return card;
};

/** The figure beside the charge: its label and its value, or null where the row has none. */
const side = (card: CardElement): string | null => {
  const readout = card.shadowRoot!.querySelector('.ef-top__side .fv-readout');
  return readout ? (readout.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
};

afterEach(() => document.body.replaceChildren());

describe('batteries out of reach keep the figure beside their charge (1.9)', () => {
  it('keeps the time it last showed, its figure "—", when the batteries go away', async () => {
    const card = await mount(false);
    expect(side(card)).toMatch(/^Empty in \d/);
    card.hass = house(true);
    await card.updateComplete;
    expect(side(card)).toBe('Empty in —');
  });

  it('opened while the batteries are away, says "Full in —"', async () => {
    expect(side(await mount(true))).toBe('Full in —');
  });
});
