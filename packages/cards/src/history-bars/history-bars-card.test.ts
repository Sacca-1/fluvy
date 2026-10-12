// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { clearBarsCache } from './buckets.js';
import { FluvyHistoryBarsCard, type HistoryBarsCardConfig } from './history-bars-card.js';

// the energy family lands with the index: the card's tag is defined before a page needs it
await familiesDefined;

/** The sheet's moment: Saturday 10 October 2026 at noon, in the runner's own zone (what the mock's house reads). */
const NOW = '2026-10-10T12:00:00';
const DAYS = [35.4, 34.4, 28.6, 26.5, 30.2, 9.5, 26.9];
const midnight = (day: number): number => new Date(2026, 9, day).getTime();

type Rows = Record<string, { start: number; change?: number; mean?: number }[]>;

/** A house with two meters and a recorder answering from a table; its questions and more-info requests kept. */
const house = (table: Rows, dead = false) => {
  const asked: Record<string, unknown>[] = [];
  const opened: string[] = [];
  const hass = {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    config: { currency: 'EUR' },
    states: {
      'sensor.solar': {
        entity_id: 'sensor.solar',
        state: dead ? 'unavailable' : '1234.5',
        attributes: {
          friendly_name: 'Solar production',
          unit_of_measurement: 'kWh',
          device_class: 'energy',
          state_class: 'total_increasing',
        },
        last_changed: '',
        last_updated: '',
      },
      'sensor.house': {
        entity_id: 'sensor.house',
        state: '2222.2',
        attributes: {
          friendly_name: 'House',
          unit_of_measurement: 'kWh',
          device_class: 'energy',
          state_class: 'total_increasing',
        },
        last_changed: '',
        last_updated: '',
      },
    },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    callWS: async (message: Record<string, unknown>) => {
      asked.push(message);
      return Object.fromEntries(
        ((message['statistic_ids'] as string[]) ?? [])
          .filter((id) => id in table)
          .map((id) => [id, table[id]]),
      );
    },
  } as unknown as HomeAssistant;
  window.addEventListener('hass-more-info', (event) =>
    opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId),
  );
  return { hass, asked, opened };
};

const week = (values: readonly number[] = DAYS, today = 12.3): Rows => ({
  'sensor.solar': [
    ...values.map((change, i) => ({ start: midnight(3 + i), change })),
    { start: midnight(10), change: today },
  ],
  'sensor.house': [...DAYS.map((v, i) => ({ start: midnight(3 + i), change: v * 2 }))],
});

type CardElement = FluvyHistoryBarsCard & {
  updateComplete: Promise<boolean>;
  watched(): readonly string[];
};

async function mount(config: Partial<HistoryBarsCardConfig>, hass: HomeAssistant) {
  const card = document.createElement('fluvy-history-bars-card') as CardElement;
  card.setConfig({
    type: 'custom:fluvy-history-bars-card',
    entity: 'sensor.solar',
    _now: NOW,
    ...config,
  });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  // the recorder answers on a later tick: the bars land on the render after it
  await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
  return card;
}

const texts = (card: HTMLElement, selector: string): string[] =>
  [...card.shadowRoot!.querySelectorAll(selector)].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

const readouts = (card: HTMLElement): string[] =>
  [...card.shadowRoot!.querySelectorAll('.hb-readouts .fv-readout, .hb-cols .fv-readout')].map(
    (el) =>
      `${el.querySelector('.fv-readout__label')?.textContent?.trim()} ${el
        .querySelector('.fv-readout__value')
        ?.textContent?.replace(/\s+/g, '')}`,
  );

describe('the history bars’ height at a 360 column', () => {
  const height = (config: Partial<HistoryBarsCardConfig>): number =>
    FluvyHistoryBarsCard.layoutHeight({
      type: 'custom:fluvy-history-bars-card',
      entity: 'sensor.solar',
      ...config,
    });

  it('counts the head, the readouts’ row, the values, the plot, the dates and two rows of facts', () => {
    expect(height({})).toBe(40 + 44 + 60 + 20 + 20 + 120 + 24 + 24 + 32 + 44 * 2 + 12);
    expect(height({ show_values: false })).toBe(484 - 16);
    expect(height({ show_dates: false })).toBe(484 - 24);
    expect(height({ show_facts: false })).toBe(484 - 156);
    expect(height({ facts: [] })).toBe(484 - 156);
    expect(height({ facts: ['total', 'average', 'highest', 'lowest'] })).toBe(484);
    expect(height({ head: [] })).toBe(484 - 60);
    // a long label folds the strip to one a row (two a row with their circles is the default at 360)
    expect(height({ facts: [{ kind: 'money', name: 'Revenue (est.)' }, 'co2', 'highest'] })).toBe(
      484 + 56,
    );
    expect(
      height({
        facts: [{ kind: 'share', of: 'sensor.x', name: 'Share of production' }, 'money', 'co2'],
      }),
    ).toBe(484 + 56);
  });

  it('gives the head’s row to the readouts when the head is off, and knows the other layouts', () => {
    expect(height({ show_head: false })).toBe(484 - 60);
    expect(height({ show_head: false, head: [] })).toBe(484 - 124);
    expect(height({ variant: 'compact' })).toBe(40 + 44 + 60 + 20 + 4 + 80 + 24);
    expect(height({ variant: 'compact', show_dates: false })).toBe(248);
    expect(height({ variant: 'mini' })).toBe(148);
    expect(height({ variant: 'mini', show_head: false })).toBe(88);
  });

  it('stays on the 4 px grid', () => {
    for (const config of [
      {},
      { variant: 'compact' as const },
      { variant: 'mini' as const },
      { facts: ['total', 'co2', 'trees', 'km', 'money'] as const },
      { show_values: false, show_dates: false, show_facts: false },
    ])
      expect(height(config) % 4).toBe(0);
  });
});

describe('the history bars card', () => {
  beforeEach(() => clearBarsCache());
  afterEach(() => document.body.replaceChildren());

  it('asks the recorder once for the week, by day, and draws a bar for every finished day', async () => {
    const { hass, asked } = house(week());
    const card = await mount({}, hass);
    expect(asked.length).toBe(1);
    expect(asked[0]).toMatchObject({
      type: 'recorder/statistics_during_period',
      statistic_ids: ['sensor.solar'],
      period: 'day',
      types: ['change'],
      units: { energy: 'kWh' },
    });
    expect(new Date(asked[0]!['start_time'] as string).getTime()).toBe(midnight(3));
    expect(card.shadowRoot!.querySelectorAll('.hb-bar').length).toBe(7);
    expect(texts(card, '.hb-value')).toEqual([
      '35.4',
      '34.4',
      '28.6',
      '26.5',
      '30.2',
      '9.5',
      '26.9',
    ]);
    expect(texts(card, '.hb-date')).toEqual([
      'Oct 03',
      'Oct 04',
      'Oct 05',
      'Oct 06',
      'Oct 07',
      'Oct 08',
      'Oct 09',
    ]);
    expect(texts(card, '.hb-tick')).toEqual(['0', '10', '20', '30', '40']);
    expect(texts(card, '.hb-unit')).toEqual(['kWh']);
    expect(texts(card, '.fv-card__sub')).toEqual(['Last 7 days']);
  });

  it('reads the total and the daily average in the head, and the honest facts under the chart', async () => {
    const card = await mount({}, house(week()).hass);
    expect(readouts(card)).toEqual(['Total 191.5kWh', 'Daily avg 27.4kWh']);
    expect(texts(card, '.hb-fact').map((t) => t.replace(/\s/g, ''))).toEqual([
      'Highest35.4kWh',
      'Lowest9.5kWh',
      'Dailyavg27.4kWh',
    ]);
  });

  it('draws the day in progress only when asked, and says so', async () => {
    const card = await mount({ include_today: true }, house(week()).hass);
    expect(card.shadowRoot!.querySelectorAll('.hb-bar').length).toBe(8);
    expect(readouts(card)).toEqual(['Total 203.8kWh', 'Daily avg 25.5kWh']);
    expect(texts(card, '.fv-card__sub')).toEqual(['Last 7 days · Today']);
  });

  it('files a day the recorder skipped as nothing gained, and a measurement’s as no bar', async () => {
    const rows = week();
    rows['sensor.solar'] = rows['sensor.solar']!.filter((row) => row.start !== midnight(6));
    const card = await mount({}, house(rows).hass);
    expect(card.shadowRoot!.querySelectorAll('.hb-bar.is-empty').length).toBe(1);
    expect(readouts(card)).toEqual(['Total 165.0kWh', 'Daily avg 23.6kWh']);
    const means: Rows = {
      'sensor.solar': [14.2, 15.8, 13.1, 16, 17.3, 15.1].map((mean, i) => ({
        start: midnight(3 + (i >= 3 ? i + 1 : i)),
        mean,
      })),
    };
    const temperature = await mount(
      { stat: 'mean', head: ['average', 'highest'] },
      house(means).hass,
    );
    expect(temperature.shadowRoot!.querySelectorAll('.hb-bar.is-empty').length).toBe(1);
    expect(readouts(temperature)).toEqual(['Daily avg 15.3kWh', 'Highest 17.3kWh']);
  });

  it('reads the bar under the keys: ← from the end, → forward, Escape lets go', async () => {
    const card = await mount({}, house(week()).hass);
    const chart = card.shadowRoot!.querySelector('.hb-chart') as HTMLElement;
    const press = async (key: string) => {
      chart.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await card.updateComplete;
    };
    await press('ArrowLeft');
    expect(card.shadowRoot!.querySelectorAll('.hb-bar.is-hover').length).toBe(1);
    expect(readouts(card)).toEqual(['Oct 09 26.9kWh']);
    expect(chart.getAttribute('aria-label')).toBe('Oct 09 · 26.9 kWh');
    await press('ArrowLeft');
    await press('ArrowLeft');
    await press('ArrowLeft');
    expect(readouts(card)).toEqual(['Oct 06 26.5kWh']);
    await press('Home');
    expect(readouts(card)).toEqual(['Oct 03 35.4kWh']);
    await press('End');
    expect(readouts(card)).toEqual(['Oct 09 26.9kWh']);
    await press('Escape');
    expect(readouts(card)).toEqual(['Total 191.5kWh', 'Daily avg 27.4kWh']);
    expect(chart.classList.contains('is-scrub')).toBe(false);
  });

  it('opens the sensor from a fact, the fact’s own action when it has one', async () => {
    const { hass, opened } = house(week());
    const card = await mount(
      {
        facts: [
          'highest',
          { kind: 'share', of: 'sensor.house' },
          { kind: 'lowest', tap_action: { action: 'none' } },
        ],
      },
      hass,
    );
    const facts = card.shadowRoot!.querySelectorAll<HTMLElement>('.hb-fact');
    expect(facts.length).toBe(3);
    facts[0]!.click();
    facts[1]!.click();
    facts[2]!.click();
    expect(opened).toEqual(['sensor.solar', 'sensor.house']);
    expect(texts(card, '.hb-fact').map((t) => t.replace(/\s/g, ''))[1]).toBe('ShareofHouse50%');
  });

  it('watches its sensor and the sensors its shares are of', async () => {
    const card = await mount(
      { facts: [{ kind: 'share', of: 'sensor.house' }] },
      house(week()).hass,
    );
    expect(card.watched()).toEqual(['sensor.solar', 'sensor.house']);
  });

  it('says so when the recorder knows nothing of the sensor, and draws no strip', async () => {
    const card = await mount({}, house({}).hass);
    expect(texts(card, '.fv-empty-state__text')).toEqual(['No statistics yet']);
    expect(card.shadowRoot!.querySelector('.hb-facts')).toBeNull();
    expect(readouts(card)).toEqual(['Total —', 'Daily avg —']);
  });

  it('keeps the history of a sensor that is unavailable now, and wears the state', async () => {
    const card = await mount({}, house(week(), true).hass);
    expect(card.shadowRoot!.querySelector('.fv-card')!.classList.contains('is-unavailable')).toBe(
      true,
    );
    expect(card.shadowRoot!.querySelectorAll('.hb-bar').length).toBe(7);
    expect(texts(card, '.fv-card__sub')).toEqual(['Unavailable · Last 7 days']);
  });

  it('is the empty card for a sensor that is not there', async () => {
    const card = await mount({ entity: 'sensor.none' }, house(week()).hass);
    expect(card.shadowRoot!.querySelector('.fv-card--empty')).not.toBeNull();
  });

  it('draws the compact and mini layouts', async () => {
    const compact = await mount({ variant: 'compact' }, house(week()).hass);
    expect(compact.shadowRoot!.querySelectorAll('.hb-bar').length).toBe(7);
    expect(compact.shadowRoot!.querySelector('.hb-value')).toBeNull();
    expect(compact.shadowRoot!.querySelector('.hb-tick')).toBeNull();
    expect(compact.shadowRoot!.querySelector('.hb-facts')).toBeNull();
    expect(compact.shadowRoot!.querySelectorAll('.hb-date').length).toBe(7);
    const mini = await mount({ variant: 'mini' }, house(week()).hass);
    expect(mini.shadowRoot!.querySelector('.hb-chart')).toBeNull();
    expect(mini.shadowRoot!.querySelectorAll('.hb-spark .fv-vbar').length).toBe(7);
    expect(readouts(mini)).toEqual(['Total 191.5kWh', 'Daily avg 27.4kWh']);
  });
});
