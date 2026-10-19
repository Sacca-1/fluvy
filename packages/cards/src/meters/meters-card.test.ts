// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { clearMeterCache } from './today.js';

// the energy family lands with the index: the card's tag is defined before a page needs it
await familiesDefined;

const LITRES = { unit_of_measurement: 'L', device_class: 'water', state_class: 'total_increasing' };
const GAS = { unit_of_measurement: 'm³', device_class: 'gas', state_class: 'total_increasing' };

/** A water meter with a typical day and a gas meter without one, live or out of reach. */
const house = (state: 'live' | 'unavailable' | 'missing'): HomeAssistant => {
  const sensor = (id: string, value: string, attributes: Record<string, unknown>) => ({
    entity_id: id,
    state: state === 'live' ? value : 'unavailable',
    attributes:
      state === 'live' ? attributes : { unit_of_measurement: attributes['unit_of_measurement'] },
    last_changed: '',
    last_updated: '',
  });
  const states =
    state === 'missing'
      ? {}
      : {
          'sensor.water': sensor('sensor.water', '48210', LITRES),
          'sensor.gas': sensor('sensor.gas', '1529.9', GAS),
        };
  return {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    config: { time_zone: 'Europe/Madrid' },
    states,
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    // the recorder never answers: the rows wait alike
    callWS: () => new Promise(() => undefined),
  } as unknown as HomeAssistant;
};

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
};

/** Each meter's row: its classes' parts (no state, no modifier), whether it has a bar, its note, its figure's line. */
async function rows(state: 'live' | 'unavailable' | 'missing', width: number) {
  const card = document.createElement('fluvy-meters-card') as CardElement;
  card.setConfig({
    type: 'custom:fluvy-meters-card',
    meters: [{ entity: 'sensor.water', typical: 150 }, 'sensor.gas'],
  });
  card.hass = house(state);
  card.width = width;
  document.body.append(card);
  await card.updateComplete;
  return [...card.shadowRoot!.querySelectorAll('.ef-meter')].map((row) => ({
    bar: row.querySelector('.ef-bar') !== null,
    note: row.querySelector('.ef-meter__note')?.textContent?.trim() ?? '',
    figure: row.querySelector('.fv-readout__value')?.textContent?.replace(/\s+/g, ' ').trim(),
    stacked: row.classList.contains('ef-meter--stack'),
  }));
}

afterEach(() => {
  document.body.replaceChildren();
  clearMeterCache();
});

describe('a meter out of reach keeps its lines (1.9)', () => {
  it('keeps its bar, empty, where it has a typical day, its state in the note', async () => {
    const [water] = await rows('unavailable', 360);
    expect(water).toMatchObject({ bar: true, note: 'Unavailable', stacked: false });
  });

  it('stacked with no note of its own, says its state beside the dash, on the figure’s line', async () => {
    const live = await rows('live', 152);
    const away = await rows('unavailable', 152);
    const gone = await rows('missing', 152);
    expect(live.map((r) => [r.stacked, r.bar, Boolean(r.note)])).toEqual([
      [true, true, true],
      [true, false, false],
    ]);
    for (const twin of [away, gone])
      expect(twin.map((r) => [r.stacked, r.bar, Boolean(r.note)])).toEqual(
        live.map((r) => [r.stacked, r.bar, Boolean(r.note)]),
      );
    expect(away[1]?.figure).toBe('—Unavailable');
    expect(gone[1]?.figure).toBe('—Not found');
  });
});
