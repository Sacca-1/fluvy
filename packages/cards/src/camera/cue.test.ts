// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the camera lands with the devices family, defined before a page needs it
await familiesDefined;

/*
 * A live card whose stream could not play says so where "Live" stood ("Stream unavailable"), the stills showing
 * meanwhile; a card on stills, or one whose stream plays, says "Live".
 */

const STAMP = '2026-10-17T19:00:00+00:00';
const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
  states: {
    'camera.porch': {
      entity_id: 'camera.porch',
      state: 'idle',
      attributes: {
        friendly_name: 'Porch',
        entity_picture: '/api/camera_proxy/camera.porch?token=1',
        supported_features: 2,
      },
      last_changed: STAMP,
      last_updated: STAMP,
    },
  },
  entities: {},
  devices: {},
  areas: {},
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  hassUrl: (path: string) => path,
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  stamp_: number;
  holder: { state: string };
};

async function pill(view: 'auto' | 'live', streamState: '' | 'none') {
  const card = document.createElement('fluvy-camera-card') as CardElement;
  card.setConfig({ type: 'custom:fluvy-camera-card', entity: 'camera.porch', camera_view: view });
  card.hass = hass;
  card.width = 360;
  document.body.append(card);
  await card.updateComplete;
  // a still has landed, and the stream stands where the holder says
  card.stamp_ = Date.now();
  card.holder.state = streamState;
  await card.updateComplete;
  const el = card.shadowRoot!.querySelector('.dv-cam__live')!;
  return {
    text: el.textContent?.trim(),
    label: el.getAttribute('aria-label'),
    failed: el.classList.contains('is-failed'),
  };
}

afterEach(() => document.body.replaceChildren());

describe('the camera’s live pill', () => {
  it('says "Live" on stills and while the stream is being asked for', async () => {
    expect(await pill('auto', '')).toEqual({ text: 'Live', label: 'Live', failed: false });
    expect(await pill('live', '')).toEqual({ text: 'Live', label: 'Live', failed: false });
  });

  it('says the stream is unavailable on a live card whose stream could not play', async () => {
    expect(await pill('live', 'none')).toEqual({
      text: 'Stream unavailable',
      label: 'Stream unavailable',
      failed: true,
    });
    // a card on stills never asked for one: nothing to say
    expect(await pill('auto', 'none')).toEqual({ text: 'Live', label: 'Live', failed: false });
  });
});
