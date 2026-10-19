// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../sensor-band-cards.js';
import type { FluvySensorBandCard } from './sensor-band-card.js';

afterEach(() => document.body.replaceChildren());
async function draw(state?: string) {
  const callService = vi.fn();
  const element = document.createElement('fluvy-sensor-band-card') as FluvySensorBandCard;
  element.setConfig({
    type: 'custom:fluvy-sensor-band-card',
    entity: 'sensor.test',
    min: 0,
    max: 50,
    bands: [
      { from: 0, to: 15, tone: 'water' },
      { from: 15, to: 50, tone: 'warning' },
    ],
    references: [{ value: 15, label: '24h ref. 15' }],
  });
  element.hass = {
    language: 'en',
    states:
      state === undefined
        ? {}
        : {
            'sensor.test': {
              entity_id: 'sensor.test',
              state,
              attributes: { friendly_name: 'PM2.5', unit_of_measurement: 'µg/m³' },
              last_changed: '2026-10-19T20:00:00Z',
              last_updated: '2026-10-19T20:00:00Z',
              context: { id: '1' },
            },
          },
    entities: {},
    devices: {},
    areas: {},
    config: { unit_system: { temperature: '°C' }, time_zone: 'UTC' },
    themes: { darkMode: false, themes: {} },
    localize: (key: string) => key,
    formatEntityState: (entity: { state: string }) => entity.state,
    callService,
    callWS: () => new Promise(() => undefined),
    connection: { subscribeMessage: () => new Promise(() => undefined) },
  } as unknown as HomeAssistant;
  (element as unknown as { width: number }).width = 360;
  document.body.append(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  const ruler = element.shadowRoot!.querySelector('fluvy-ruler') as HTMLElement & {
    value: number;
    inactive: boolean;
    marker: boolean;
    updateComplete: Promise<boolean>;
  };
  await ruler.updateComplete;
  return { element, ruler, callService };
}
describe('sensor band card', () => {
  it('shows the current reading, exact reference and native read-only marker', async () => {
    const { element, ruler, callService } = await draw('2');
    expect(ruler.value).toBe(2);
    expect(ruler.marker).toBe(true);
    expect(ruler.inactive).toBe(false);
    expect(element.shadowRoot!.querySelectorAll('.so-band__zone')).toHaveLength(2);
    expect(element.shadowRoot!.querySelector('.sb-reference')!.getAttribute('style')).toContain(
      'left:',
    );
    expect(element.shadowRoot!.textContent).toContain('24h ref. 15');
    expect(callService).not.toHaveBeenCalled();
  });
  it.each([undefined, 'unknown', 'unavailable', 'not a number'])(
    'never presents %s as a zero measurement',
    async (state) => {
      const { element, ruler } = await draw(state);
      expect(ruler.inactive).toBe(true);
      expect(ruler.getAttribute('aria-hidden')).toBe('true');
      expect(element.shadowRoot!.querySelector('.fv-readout__value')!.textContent).toContain('—');
      expect(element.shadowRoot!.textContent).toContain('24h ref. 15');
    },
  );
  it('retains an out-of-range reading without changing the configured scale', async () => {
    const { ruler } = await draw('73');
    expect(ruler.value).toBe(73);
    expect(ruler.inactive).toBe(false);
  });
});
