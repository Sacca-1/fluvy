// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';
import { FluvyAutomationsCard, type AutomationsCardConfig } from './automations-card.js';
import { buildAutomation, type AutomationConfig, type Schedule } from './schedule.js';

// the index fetches the families: they land before this file's page goes
afterAll(() => familiesDefined);

const KITCHEN: Schedule = {
  id: 'fluvy_a1b2c3d4e5f6',
  alias: 'Good morning',
  targets: ['light.kitchen'],
  days: { kind: 'workdays' },
  start: { kind: 'time', at: '06:45' },
  end: { kind: 'time', at: '08:00' },
  then: { verb: 'on', level: 70 },
};
const BLINDS: Schedule = {
  id: 'fluvy_0b1a2d3e4f50',
  alias: 'Blinds',
  targets: ['cover.living'],
  days: { kind: 'every' },
  start: { kind: 'time', at: '23:00' },
  then: { verb: 'close' },
};
const CONFIGS: Record<string, AutomationConfig> = {
  [KITCHEN.id]: buildAutomation(KITCHEN),
  [BLINDS.id]: buildAutomation(BLINDS),
};

/** Thursday 17 September 2026, 21:47. */
const NOW = new Date(2026, 8, 17, 21, 47, 12);
const iso = (minutesAgo: number): string =>
  new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id,
  state,
  attributes: { friendly_name: entity_id, ...attributes },
  last_changed: '',
  last_updated: '',
});

const STATES: Record<string, HassEntity> = {
  'automation.good_morning': entity('automation.good_morning', 'on', {
    friendly_name: 'Good morning',
    id: KITCHEN.id,
    last_triggered: iso(15 * 60),
  }),
  'automation.blinds': entity('automation.blinds', 'on', {
    friendly_name: 'Blinds',
    id: BLINDS.id,
    last_triggered: iso(140),
  }),
  'automation.leak': entity('automation.leak', 'on', {
    friendly_name: 'Leak alert',
    id: '1690000000001',
    last_triggered: iso(2 * 24 * 60),
  }),
  'automation.never': entity('automation.never', 'off', {
    friendly_name: 'Vacation lights',
    id: '1690000000002',
    last_triggered: null,
  }),
  'automation.broken': entity('automation.broken', 'unavailable', {
    friendly_name: 'Pool pump',
    id: '1690000000003',
  }),
  'automation.yaml': entity('automation.yaml', 'on', { friendly_name: 'From YAML' }),
  'light.kitchen': entity('light.kitchen', 'on', { friendly_name: 'Kitchen lamp' }),
  'cover.living': entity('cover.living', 'open', { friendly_name: 'Blinds' }),
  'sun.sun': entity('sun.sun', 'below_horizon', {
    next_rising: new Date(NOW.getTime() + 10 * 3600_000).toISOString(),
    next_setting: new Date(NOW.getTime() + 22 * 3600_000).toISOString(),
  }),
};

interface Fixture {
  hass: HomeAssistant;
  callApi: ReturnType<typeof vi.fn>;
  callService: ReturnType<typeof vi.fn>;
}

/** A house, one connection of its own (the store is one per connection), answering the config API from `CONFIGS`. */
function house(options: { admin?: boolean; states?: Record<string, HassEntity> } = {}): Fixture {
  const callApi = vi.fn(async (_method: string, path: string) => {
    const id = path.slice(path.lastIndexOf('/') + 1);
    const config = CONFIGS[id];
    if (config) return { ...config };
    throw { error: 'Response error: 404', status_code: 404, body: { message: 'not found' } };
  });
  const callService = vi.fn(async () => undefined);
  const hass = {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: options.states ?? STATES,
    entities: {},
    devices: {},
    areas: {},
    config: { unit_system: { temperature: '°C', length: 'km' } },
    user: { id: 'u1', name: 'Marta', is_admin: options.admin ?? true },
    connection: { subscribeMessage: vi.fn(async () => () => undefined) },
    callApi,
    callService,
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
  } as unknown as HomeAssistant;
  return { hass, callApi, callService };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
};

type CardElement = FluvyAutomationsCard & { updateComplete: Promise<boolean> };

async function mount(
  config: Partial<AutomationsCardConfig>,
  fixture: Fixture = house(),
): Promise<CardElement> {
  const card = document.createElement('fluvy-automations-card') as CardElement;
  card.setConfig({ type: 'custom:fluvy-automations-card', _now: NOW.toISOString(), ...config });
  card.hass = fixture.hass;
  document.body.append(card);
  await card.updateComplete;
  await flush();
  await card.updateComplete;
  return card;
}

const titles = (card: CardElement): string[] =>
  [...card.shadowRoot!.querySelectorAll('.fv-row .fv-row__title')].map((el) =>
    (el.textContent ?? '').trim(),
  );
const subs = (card: CardElement): string[] =>
  [...card.shadowRoot!.querySelectorAll('.fv-row .fv-row__sub')].map((el) =>
    (el.textContent ?? '').trim(),
  );

describe('the automations card', () => {
  afterEach(() => document.body.replaceChildren());

  it('lists the house by name, an administrator reading each schedule’s config once', async () => {
    const fixture = house();
    const card = await mount({}, fixture);
    expect(titles(card)).toEqual([
      'Blinds',
      'From YAML',
      'Good morning',
      'Leak alert',
      'Pool pump',
      'Vacation lights',
    ]);
    const reads = fixture.callApi.mock.calls.map((call) => call[1]);
    expect(reads.sort()).toEqual([
      `config/automation/config/${BLINDS.id}`,
      `config/automation/config/${KITCHEN.id}`,
    ]);
    // the schedule's line: its days, its window, its next run; the plain row its last run
    expect(subs(card)).toContain('Workdays · 06:45–08:00 · Next in 9 h');
    expect(subs(card)).toContain('Every day · 23:00 · Next in 1 h');
    expect(subs(card)).toContain('2 days ago');
    expect(subs(card)).toContain('Never run');
    // another hass of the same house reads nothing again
    card.hass = { ...fixture.hass, states: { ...fixture.hass.states } } as HomeAssistant;
    await card.updateComplete;
    await flush();
    expect(fixture.callApi).toHaveBeenCalledTimes(2);
  });

  it('never reads a config for anyone but an administrator, and a tap opens more-info', async () => {
    const fixture = house({ admin: false });
    const card = await mount({}, fixture);
    expect(fixture.callApi).not.toHaveBeenCalled();
    expect(card.shadowRoot!.querySelector('.fv-round')).toBeNull(); // no `+`
    expect(subs(card)).not.toContain('Workdays · 06:45–08:00 · Next in 9 h');
    const seen: string[] = [];
    card.addEventListener('hass-more-info', (event) => {
      seen.push((event as CustomEvent<{ entityId: string }>).detail.entityId);
    });
    const row = card.shadowRoot!.querySelector<HTMLElement>('.fv-row');
    row?.click();
    await card.updateComplete;
    expect(seen).toEqual(['automation.blinds']);
    expect(card.shadowRoot!.querySelector('fluvy-schedule-sheet')).toBeNull();
  });

  it('keeps a listed subset in its order, and sorts the house by next or last run', async () => {
    const listed = await mount({ entities: ['automation.leak', 'automation.blinds'] });
    expect(titles(listed)).toEqual(['Leak alert', 'Blinds']);
    const byNext = await mount({ sort: 'next' });
    expect(titles(byNext).slice(0, 2)).toEqual(['Blinds', 'Good morning']);
    const byLast = await mount({ sort: 'last' });
    expect(titles(byLast)).toEqual([
      'Blinds',
      'Good morning',
      'Leak alert',
      'From YAML',
      'Pool pump',
      'Vacation lights',
    ]);
  });

  it('shows the schedules alone when asked, and folds a long list', async () => {
    const schedules = await mount({ show: 'schedules' });
    expect(titles(schedules)).toEqual(['Blinds', 'Good morning']);
    const folded = await mount({ max_rows: 2 });
    expect(titles(folded)).toEqual(['Blinds', 'From YAML', '4 more']);
    folded
      .shadowRoot!.querySelector<HTMLElement>('.fv-row.is-open, .fv-row[aria-expanded]')
      ?.click();
    await folded.updateComplete;
    expect(titles(folded).length).toBe(7);
    expect(titles(folded).at(-1)).toBe('Show less');
  });

  it('flips the switch under the finger and asks Home Assistant once', async () => {
    const fixture = house();
    const card = await mount({}, fixture);
    const first = card.shadowRoot!.querySelector<HTMLElement>('.fv-row .fv-switch')!;
    expect(first.getAttribute('aria-checked')).toBe('true');
    first.parentElement?.click();
    await card.updateComplete;
    expect(first.getAttribute('aria-checked')).toBe('false');
    expect(fixture.callService).toHaveBeenCalledTimes(1);
    expect(fixture.callService.mock.calls[0]?.slice(0, 2)).toEqual(['automation', 'turn_off']);
    expect(fixture.callService.mock.calls[0]?.[3]).toEqual({ entity_id: 'automation.blinds' });
  });

  it('draws an unavailable automation on the off skin with an inert switch', async () => {
    const card = await mount({ entities: ['automation.broken'] });
    const row = card.shadowRoot!.querySelector<HTMLElement>('.fv-row')!;
    expect(row.classList.contains('is-unavailable')).toBe(true);
    expect(row.querySelector('.fv-switch')?.getAttribute('aria-disabled')).toBe('true');
    expect(subs(card)).toEqual(['Unavailable']);
  });

  it('shows an empty panel for an empty house, with the hint for an administrator', async () => {
    const admin = await mount({ entities: [] });
    expect(admin.shadowRoot!.querySelector('.fv-empty-state__text')?.textContent).toBe(
      'No automations',
    );
    expect(admin.shadowRoot!.querySelector('.fv-empty-state__hint')?.textContent).toBe(
      'Tap + to add a schedule',
    );
    const guest = await mount({ entities: [] }, house({ admin: false }));
    expect(guest.shadowRoot!.querySelector('.fv-empty-state__hint')).toBeNull();
  });

  it('lists a new automation the moment its entity arrives', async () => {
    const fixture = house();
    const card = await mount({}, fixture);
    expect(titles(card).length).toBe(6);
    card.hass = {
      ...fixture.hass,
      states: {
        ...fixture.hass.states,
        'automation.fresh': entity('automation.fresh', 'on', { friendly_name: 'Fresh' }),
      },
    } as HomeAssistant;
    await card.updateComplete;
    expect(titles(card)).toContain('Fresh');
  });

  it('opens the schedule sheet on a tap, for an administrator, without calling a service', async () => {
    const fixture = house();
    const card = await mount({}, fixture);
    card.shadowRoot!.querySelector<HTMLElement>('.fv-row')?.click();
    // the sheet's chunk is fetched on the first tap: wait for it to land
    let sheet: (HTMLElement & { isOpen: boolean }) | null = null;
    for (let i = 0; i < 100 && !sheet?.isOpen; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await card.updateComplete;
      sheet = card.shadowRoot!.querySelector('fluvy-schedule-sheet');
    }
    expect(sheet?.isOpen).toBe(true);
    expect(fixture.callService).not.toHaveBeenCalled();
  });

  it('knows its height at a 360 column', () => {
    const height = (config: Partial<AutomationsCardConfig>): number =>
      FluvyAutomationsCard.layoutHeight({ type: 'custom:fluvy-automations-card', ...config });
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => `automation.${n}`);
    expect(height({ entities: seven })).toBe(100 + 7 * 60);
    expect(height({ entities: seven, variant: 'compact' })).toBe(100 + 7 * 48);
    expect(height({ entities: seven, variant: 'tiles' })).toBe(100 + 4 * 84 + 3 * 8);
    expect(height({ entities: seven, show_filters: true })).toBe(160 + 7 * 60);
    expect(height({ entities: [...seven, 'automation.h'] })).toBe(100 + 7 * 60); // six and "2 more"
    expect(height({ entities: [] })).toBe(232);
    expect(height({})).toBe(100 + 6 * 60);
  });
});
