// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluvyPreheatCard } from './preheat-card.js';
customElements.define('fluvy-preheat-card', FluvyPreheatCard);

afterEach(() => document.body.replaceChildren());
async function draw(state: string = 'comfort') {
  const callService = vi.fn();
  const element = document.createElement('fluvy-preheat-card') as FluvyPreheatCard;
  element.setConfig({
    type: 'custom:fluvy-sensor-band-card',
    entity: 'sensor.test',
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
              attributes: {
                smart_preheat: true,
                settings: {
                  comfort: 20,
                  enabled: true,
                  max_boost: 1.5,
                  max_drop: 0.5,
                  min_spread: 0.08,
                  max_hours: 3,
                },
                actual_target: 20.5,
                reason: 'Comforttemperatuur',
                next_preheat: null,
              },
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
  return { element, callService };
}
describe('preheat card', () => {
  it('shows comfort, real airco target and reason without issuing commands', async () => {
    const { element, callService } = await draw();
    expect(element.shadowRoot!.textContent).toContain('20 °C');
    expect(element.shadowRoot!.textContent).toContain('20,5 °C');
    expect(element.shadowRoot!.textContent).toContain('Comforttemperatuur');
    expect(callService).not.toHaveBeenCalled();
  });
  it('changes comfort using the controller service, without physical entity IDs', async () => {
    const { element, callService } = await draw();
    (
      element.shadowRoot!.querySelector('[aria-label="Temperatuur verhogen"]') as HTMLButtonElement
    ).click();
    await element.updateComplete;
    expect(callService).toHaveBeenCalledWith('smart_preheat', 'configure', {
      settings: { comfort: 20.5 },
      resume: false,
    });
  });
  it('offers all requested advanced settings in its detail window', async () => {
    const { element } = await draw();
    expect(element.shadowRoot!.querySelector('dialog')!.textContent).toContain(
      'Maximale voorverwarming',
    );
    expect(element.shadowRoot!.querySelectorAll('select')).toHaveLength(6);
    expect(element.shadowRoot!.querySelectorAll('input[type="number"]')).toHaveLength(13);
  });
  it('renders missing data without presenting zero measurements', async () => {
    const { element } = await draw(undefined as unknown as string);
    element.hass = { ...element.hass!, states: {} };
    await element.updateComplete;
    expect(element.shadowRoot!.textContent).toContain('Regeling niet beschikbaar');
    expect(element.shadowRoot!.textContent).toContain('—');
  });
});
