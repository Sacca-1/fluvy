// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the weather card lands with its own chunk, defined as the index starts
await familiesDefined;

/*
 * The weather card in a narrow column (211, 171 of content): the hero's figure steps down a size before its unit is
 * cut, and the day rows take the short weekday where the long one would not hold beside its figures even without
 * its circle (pt-BR's "Segunda-feira"). The ruler is a stub: 8 px a glyph at the row's size, 0.6 em at a readout's.
 */

const NOW = '2026-10-17T19:00:00.000Z';

const house = (language: string): HomeAssistant =>
  ({
    language,
    locale: { language, number_format: 'language', time_format: '24' },
    config: { unit_system: { temperature: '°C' } },
    states: {
      'weather.home': {
        entity_id: 'weather.home',
        state: 'sunny',
        attributes: { friendly_name: 'Home', temperature: 17.6, apparent_temperature: 16 },
        last_changed: NOW,
        last_updated: NOW,
      },
    },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    connection: {
      subscribeMessage: (
        callback: (message: unknown) => void,
        message: { forecast_type: 'hourly' | 'daily' },
      ) => {
        callback({
          forecast:
            message.forecast_type === 'daily'
              ? [1, 2, 3].map((d) => ({
                  datetime: new Date(Date.parse(NOW) + d * 86_400_000).toISOString(),
                  condition: 'cloudy',
                  temperature: 20,
                  templow: 12,
                }))
              : [],
        });
        return Promise.resolve(() => undefined);
      },
    },
  }) as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  head: { ruler: unknown };
};

async function draw(language: string, width: number) {
  const card = document.createElement('fluvy-weather-card') as CardElement;
  Object.assign(card.head, {
    ruler: {
      width: (...args: [string, string, string?, string?]) => {
        const [cls, text, , unit = ''] = args;
        const size = /fv-readout--l/.test(cls) ? 24 : /fv-readout__value/.test(cls) ? 14 : 8;
        return text.length * size + (unit ? 6 + unit.length * 10 : 0);
      },
      pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
      clear() {},
    },
  });
  card.setConfig({
    type: 'custom:fluvy-weather-card',
    entity: 'weather.home',
    forecast: 'daily',
    days: 3,
    _now: NOW,
  });
  card.hass = house(language);
  card.width = width;
  document.body.append(card);
  await card.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
  const root = card.shadowRoot!;
  return {
    large: root.querySelector('.am-weather__now .fv-readout')!.classList.contains('fv-readout--l'),
    days: [...root.querySelectorAll('.am-days .fv-row__title')].map((el) => el.textContent?.trim()),
    wide: !!root.querySelector('.am-weather__hero--wide'),
    stacked: !!root.querySelector('.am-days--stack'),
  };
}

afterEach(() => document.body.replaceChildren());

describe('the weather card in a narrow column', () => {
  it('draws the hero’s figure at 40 while it holds beside the circle, at 24 where it would cut its unit', async () => {
    // "17.6" at 40: 96 + 6 + 20 = 122 — 360 (320 − 76 = 244 of room) holds it, 211 (171 − 76 = 95) does not
    expect((await draw('en', 360)).large).toBe(true);
    expect((await draw('en', 211)).large).toBe(false);
  });

  it('names the days in full while every name holds its row, in short where one would not (pt-BR at 211)', async () => {
    const wide = await draw('pt-BR', 360);
    expect(wide.days.some((day) => /-feira$/.test(day ?? ''))).toBe(true);
    // "Segunda-feira" (104) beside "20° 12°" (56) in 171 − 12 − 56 = 103, even without the circle: the short forms
    const narrow = await draw('pt-BR', 211);
    expect(narrow.days.every((day) => !/-feira$/.test(day ?? ''))).toBe(true);
    expect(narrow.days).toHaveLength(3);
  });

  it('gives the label the hero’s width where a word it may say is wider than its column, whatever the sky', async () => {
    // "Thunderstorm" (96) in 171 − 76 = 95 at 211, under a sunny sky: never broken inside the word
    expect((await draw('en', 211)).wide).toBe(true);
    expect((await draw('en', 360)).wide).toBe(false);
  });

  it('runs the days’ conditions under their figures where one the language may say would not hold beside them', async () => {
    // "Partly cloudy" (104) beside "20° / 12°" (72): 171 − 12 − 72 = 87 at 211 does not hold it, 360's 180 does
    expect((await draw('en', 211)).stacked).toBe(true);
    expect((await draw('en', 360)).stacked).toBe(false);
  });
});
