// @vitest-environment happy-dom
import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { HeadFit } from '../energy/head.js';
import { familiesDefined } from '../index.js';
import { mapHead } from './map-head.js';

// the people and map cards land with the index
await familiesDefined;

/*
 * A head whose round opens the map (the people card, the map card): the card's own title where it fits beside the
 * circle and the round, the short one where it does not, and where not even the short one holds beside the round
 * (half a phone's column) the round gives way to a "Map" row under the body — a control never goes. The ruler is a
 * stub: 8 px a glyph.
 */

const ruler = {
  width: (_cls: string, text: string) => text.length * 8,
  pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
  clear() {},
};

function fitter(): HeadFit {
  const host = {
    addController() {},
    removeController() {},
    requestUpdate() {},
    renderRoot: undefined,
  } as unknown as ConstructorParameters<typeof HeadFit>[0];
  const fit = new HeadFit(host);
  Object.assign(fit as unknown as { ruler: unknown }, { ruler });
  return fit;
}

const TITLES = ['Who is home', 'At home'];

describe('mapHead', () => {
  it('keeps the long title beside the circle and the round where they hold, the short one where they do not', () => {
    // "Who is home" is 88: 88 + 56 + 56 = 200 holds in 280, not in 171; "At home" (56) does
    expect(mapHead(fitter(), 280, TITLES, undefined)).toEqual({
      title: 'Who is home',
      roundFits: true,
    });
    expect(mapHead(fitter(), 171, TITLES, undefined)).toEqual({
      title: 'At home',
      roundFits: true,
    });
  });

  it('lets the round go where not even the short title holds beside it, and keeps a typed title as it is', () => {
    // 100: "At home" (56) beside the round (56) is 112
    expect(mapHead(fitter(), 100, TITLES, undefined)).toEqual({
      title: 'At home',
      roundFits: false,
    });
    expect(mapHead(fitter(), 110, TITLES, 'Family')).toEqual({ title: 'Family', roundFits: true });
    expect(mapHead(fitter(), 100, TITLES, 'Family')).toEqual({ title: 'Family', roundFits: false });
  });
});

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { unit_system: { temperature: '°C', length: 'km' } },
  states: {},
  entities: {},
  devices: {},
  areas: {},
  user: { id: 'u1', name: 'Ana', is_admin: true },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  head?: { ruler: unknown };
  headFit?: { ruler: unknown };
};

/** The cards on a 9 px glyph: "At home" is then 63, over the 56 left beside the round in a 112 column. */
const wider = { ...ruler, width: (_cls: string, text: string) => text.length * 9 };

async function draw(tag: string, width: number) {
  const card = document.createElement(tag) as CardElement;
  Object.assign(card.head ?? card.headFit!, { ruler: wider });
  card.setConfig({ type: `custom:${tag}`, entities: [] });
  card.hass = hass;
  card.width = width;
  document.body.append(card);
  await card.updateComplete;
  const root = card.shadowRoot!;
  return {
    title: root.querySelector('.fv-card__title')?.textContent?.trim(),
    round: root.querySelector('.fv-card__head .fv-round') !== null,
    row: root.querySelector('.fv-row .fv-row__title')?.textContent?.trim() ?? null,
  };
}

afterEach(() => document.body.replaceChildren());

describe('the people and map cards’ heads', () => {
  it('keep the map round beside the short title at a full card, and step it to a row at half a phone’s column', async () => {
    // 211 (171 of content): "At home" holds beside the round; 152 (112): it does not, the round is a row under the body
    expect(await draw('fluvy-people-card', 211)).toEqual({
      title: 'At home',
      round: true,
      row: null,
    });
    expect(await draw('fluvy-people-card', 152)).toEqual({
      title: 'At home',
      round: false,
      row: 'Map',
    });
  });

  it('give the map card its short title where the long one would not hold (a 211 column)', async () => {
    // "Where everyone is" (153) + 56 + 56 does not hold in 171; "Everyone" (72) does, beside the round
    expect(await draw('fluvy-map-card', 360)).toEqual({
      title: 'Where everyone is',
      round: true,
      row: null,
    });
    expect(await draw('fluvy-map-card', 211)).toEqual({
      title: 'Everyone',
      round: true,
      row: null,
    });
  });
});
