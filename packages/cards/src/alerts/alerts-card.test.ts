// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alertsHeight } from '../alerts-family.js';
import { FluvyAlertsCard } from './alerts-card.js';
import { change, house, MINUTE, NOW, type Seed } from './fixture.js';
import { alertFields, ALERTS_LIST } from './form.js';
import type { FluvyAlertsSheet } from './sheet/alerts-sheet.js';

if (!customElements.get('fluvy-alerts-card'))
  customElements.define('fluvy-alerts-card', FluvyAlertsCard);

const AT = new Date(NOW).toISOString();
const battery = (state: string, device: string): Seed => ({
  state,
  attributes: { device_class: 'battery', unit_of_measurement: '%' },
  device,
  changed: NOW - 2 * 60 * MINUTE,
});
const door = (state: string, minutes = 6): Seed => ({
  state,
  attributes: { device_class: 'door' },
  changed: NOW - minutes * MINUTE,
});

const SEEDS: Record<string, Seed> = {
  'sensor.hall_battery': battery('12', 'hall'),
  'sensor.porch_battery': battery('18', 'porch'),
  'binary_sensor.front_door': door('on'),
  'binary_sensor.back_door': door('off'),
  'binary_sensor.kitchen_leak': {
    state: 'on',
    attributes: { device_class: 'moisture' },
    changed: NOW - 3 * MINUTE,
  },
  'update.core': { state: 'on', attributes: { supported_features: 1 } },
  'lock.shed': { state: 'unlocked', changed: NOW - 60 * MINUTE },
  'lock.gate': { state: 'unlocked', changed: NOW - 30 * MINUTE },
};

interface Socket {
  readonly calls: Array<{ domain: string; service: string; target: unknown }>;
  readonly ws: Array<Record<string, unknown>>;
  /** Who listens to the repairs' changes. */
  readonly heard: Array<() => void>;
}

/** A house and the socket a card talks to. */
function home(
  seeds: Record<string, Seed> = SEEDS,
  options: { admin?: boolean; issues?: unknown[] } = {},
): { hass: HomeAssistant; socket: Socket } {
  const socket: Socket = { calls: [], ws: [], heard: [] };
  const base = house(seeds, { admin: options.admin ?? true });
  const hass = {
    ...base,
    themes: { darkMode: false },
    localize: (key: string, values?: Record<string, unknown>) =>
      key === 'component.zha.issues.network.title'
        ? `Zigbee ${String(values?.['what'] ?? '')} changed`
        : key,
    loadBackendTranslation: vi.fn(async () => hass.localize),
    callService: async (domain: string, service: string, _data: unknown, target: unknown) => {
      socket.calls.push({ domain, service, target });
    },
    callWS: async (message: Record<string, unknown>) => {
      socket.ws.push(message);
      if (message['type'] === 'repairs/list_issues') return { issues: options.issues ?? [] };
      return { value: null };
    },
    connection: {
      subscribeMessage: async (callback: () => void, message: Record<string, unknown>) => {
        socket.ws.push(message);
        if (message['event_type'] === 'repairs_issue_registry_updated') socket.heard.push(callback);
        return () => undefined;
      },
    },
  } as unknown as HomeAssistant;
  return { hass, socket };
}

type Mounted = FluvyAlertsCard & {
  updateComplete: Promise<boolean>;
  preview: boolean;
  connectedWhileHidden?: boolean;
};

async function mount(
  config: Record<string, unknown>,
  hass: HomeAssistant = home().hass,
  preview = false,
): Promise<Mounted> {
  const card = document.createElement('fluvy-alerts-card') as Mounted;
  card.setConfig({ type: 'custom:fluvy-alerts-card', _now: AT, ...config } as LovelaceCardConfig);
  card.hass = hass;
  card.preview = preview;
  (card as unknown as { width: number }).width = 360;
  document.body.append(card);
  await card.updateComplete;
  await card.updateComplete;
  return card;
}

const root = (card: Mounted): ShadowRoot => card.shadowRoot as ShadowRoot;
const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const tiles = (card: Mounted): HTMLElement[] => [
  ...root(card).querySelectorAll<HTMLElement>('.al-tile'),
];

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('the alerts card', () => {
  it('orders its alerts by severity and draws each in its tone: critical the danger, warning its own, info the notice', async () => {
    const card = await mount({
      alerts: [{ preset: 'updates' }, { preset: 'low_battery' }, { preset: 'hazards' }],
    });
    const drawn = tiles(card).map((tile) => ({
      name: text(tile.querySelector('.fv-tile__name')),
      tone: [...tile.classList].find((name) => /^fv-tile--(danger|warning|notice)$/.test(name)),
    }));
    expect(drawn).toEqual([
      { name: 'Hazards', tone: 'fv-tile--danger' },
      { name: 'Low batteries', tone: 'fv-tile--warning' },
      { name: 'Updates', tone: 'fv-tile--notice' },
    ]);
  });

  it('names one match with how long; several by their names, counted', async () => {
    const card = await mount({
      alerts: [{ preset: 'open' }, { preset: 'low_battery' }],
      columns: 1,
    });
    const [open, low] = tiles(card);
    // the same severity reads as listed; the lowest battery first, the count in its badge, the names in its line
    expect(text(low?.querySelector('.fv-tile__state'))).toBe('hall, porch');
    expect(text(low?.querySelector('.al-count'))).toBe('2');
    expect(text(open?.querySelector('.fv-tile__state'))).toBe('front_door · 6 min');
    expect(open?.querySelector('.al-count')).toBeNull();
  });

  it('paints an alert’s own colour on its circle, never on its severity’s fill', async () => {
    const card = await mount({ alerts: [{ preset: 'hazards', color: 'orange' }], columns: 1 });
    const [tile] = tiles(card);
    expect(tile?.classList.contains('fv-tile--danger')).toBe(true);
    expect(tile?.querySelector('.fv-ico')?.getAttribute('data-accent')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('says nothing of how long in a match’s first minute: the name alone, then "1 min"', async () => {
    const leak = (seconds: number): Seed => ({
      state: 'on',
      attributes: { device_class: 'moisture' },
      changed: NOW - seconds * 1000,
    });
    const fresh = await mount(
      { alerts: [{ preset: 'hazards' }] },
      home({ 'binary_sensor.kitchen_leak': leak(20) }).hass,
    );
    expect(text(tiles(fresh)[0]?.querySelector('.fv-tile__state'))).toBe('kitchen_leak');
    const minute = await mount(
      { alerts: [{ preset: 'hazards' }] },
      home({ 'binary_sensor.kitchen_leak': leak(75) }).hass,
    );
    expect(text(tiles(minute)[0]?.querySelector('.fv-tile__state'))).toBe('kitchen_leak · 1 min');
  });

  it('a tone asked for by name outranks the severity', async () => {
    const card = await mount({ alerts: [{ preset: 'hazards', tone: 'water' }] });
    expect(tiles(card)[0]?.classList.contains('fv-tile--water')).toBe(true);
  });

  it('steps aside while all is clear, says so both ways, and comes back with a match', async () => {
    const { hass } = home({ 'binary_sensor.front_door': door('off') });
    const heard: boolean[] = [];
    const card = document.createElement('fluvy-alerts-card') as Mounted;
    card.addEventListener('card-visibility-changed', (event) =>
      heard.push((event as CustomEvent<{ value: boolean }>).detail.value),
    );
    card.setConfig({
      type: 'custom:fluvy-alerts-card',
      _now: AT,
      alerts: [{ preset: 'open' }],
    } as LovelaceCardConfig);
    card.hass = hass;
    document.body.append(card);
    await card.updateComplete;
    expect(card.hidden).toBe(true);
    expect(card.connectedWhileHidden).toBe(true);
    card.hass = change(hass, 'binary_sensor.front_door', door('on'));
    await card.updateComplete;
    await card.updateComplete;
    expect(card.hidden).toBe(false);
    expect(tiles(card)).toHaveLength(1);
    expect(heard).toEqual([false, true]);
  });

  it('stays in the editor while clear, saying it hides on the dashboard', async () => {
    const card = await mount(
      { alerts: [{ preset: 'open' }] },
      home({ 'binary_sensor.front_door': door('off') }).hass,
      true,
    );
    expect(card.hidden).toBe(false);
    expect(text(root(card).querySelector('.fv-tile__name'))).toBe('All clear');
    expect(text(root(card).querySelector('.fv-tile__state'))).toBe(
      'Hidden on the dashboard while all is clear',
    );
  });

  it('draws rows under a head that counts in the gravest tone, chips, and a still banner that says how many more', async () => {
    const alerts = [{ preset: 'low_battery' }, { preset: 'hazards' }, { preset: 'open' }];
    const rows = await mount({ alerts, variant: 'rows' });
    expect(text(root(rows).querySelector('.fv-card__head .fv-badge'))).toBe('3 alerts');
    expect(root(rows).querySelector('.fv-card__head .fv-badge--danger')).not.toBeNull();
    expect(root(rows).querySelectorAll('.al-rows .fv-row')).toHaveLength(3);
    const chips = await mount({ alerts, variant: 'chips' });
    expect(root(chips).querySelectorAll('.fv-chip.is-active')).toHaveLength(3);
    const banner = await mount({ alerts, variant: 'banner', rotate: 0 });
    expect(tiles(banner)).toHaveLength(1);
    expect(text(root(banner).querySelector('.fv-tile__state'))).toMatch(/2 more$/);
  });

  it('opens its sheet on a tap, every alert on a hold, and stays in sight until a sheet that cleared the last match closes', async () => {
    const { hass, socket } = home({
      'lock.shed': { state: 'unlocked', changed: NOW - 60 * MINUTE },
    });
    const card = await mount({ alerts: [{ preset: 'unlocked', id: 'locks' }] }, hass);
    const cover = tiles(card)[0]?.querySelector<HTMLElement & { fvTap?: () => void }>(
      '.fv-tile__tap',
    );
    cover?.fvTap?.();
    await vi.waitFor(() =>
      expect(root(card).querySelector<FluvyAlertsSheet>('fluvy-alerts-sheet')?.isOpen).toBe(true),
    );
    const sheet = root(card).querySelector('fluvy-alerts-sheet') as FluvyAlertsSheet;
    await sheet.updateComplete;
    // Lock all asks first, in the sheet; the second tap locks every match at once
    const lockAll = [
      ...sheet.shadowRoot!.querySelectorAll<HTMLElement>('.as-actions .fv-btn'),
    ].find((button) => text(button) === 'Lock all');
    lockAll?.click();
    await sheet.updateComplete;
    expect(socket.calls).toEqual([]);
    expect(text(sheet.shadowRoot!.querySelector('.as-actions .fv-btn--armed'))).toBe(
      'Tap again to confirm',
    );
    (sheet.shadowRoot!.querySelector('.as-actions .fv-btn--armed') as HTMLElement).click();
    expect(socket.calls).toEqual([
      { domain: 'lock', service: 'lock', target: { entity_id: ['lock.shed'] } },
    ]);
    // the last match locked: the sheet says all is clear, the card stays until it closes
    card.hass = change(hass, 'lock.shed', { state: 'locked' });
    await card.updateComplete;
    await sheet.updateComplete;
    expect(text(sheet.shadowRoot!.querySelector('.fv-empty-state'))).toMatch(/^All clear/);
    expect(card.hidden).toBe(false);
    sheet.close();
    await vi.waitFor(() => expect(card.hidden).toBe(true));
  });

  it('opens its sheet in the card’s own mode, and the sheet follows the card while it is open', async () => {
    const { hass } = home();
    const dark = { ...hass, themes: { darkMode: true } } as unknown as HomeAssistant;
    const card = await mount({ alerts: [{ preset: 'unlocked', id: 'locks' }] }, dark);
    tiles(card)[0]?.querySelector<HTMLElement & { fvTap?: () => void }>('.fv-tile__tap')?.fvTap?.();
    await vi.waitFor(() =>
      expect(root(card).querySelector<FluvyAlertsSheet>('fluvy-alerts-sheet')?.isOpen).toBe(true),
    );
    const sheet = root(card).querySelector('fluvy-alerts-sheet') as FluvyAlertsSheet;
    // the card's `dark` on the sheet: its own `:host([dark])` rules (an off switch's thumb) apply as on the card
    expect(card.hasAttribute('dark')).toBe(true);
    expect(sheet.hasAttribute('dark')).toBe(true);
    expect(sheet.hasAttribute('no-theme')).toBe(card.hasAttribute('no-theme'));
    card.hass = { ...hass, themes: { darkMode: false } } as unknown as HomeAssistant;
    await card.updateComplete;
    await card.updateComplete;
    expect(sheet.hasAttribute('dark')).toBe(false);
  });

  it('reads Home Assistant’s repairs for an administrator, titled in the integration’s words, the ignored ones left out', async () => {
    const issues = [
      {
        domain: 'zha',
        issue_id: 'network_1',
        translation_key: 'network',
        translation_placeholders: { what: 'channel' },
        severity: 'error',
        created: new Date(NOW - 60 * MINUTE).toISOString(),
      },
      { domain: 'hacs', issue_id: 'restart_required', severity: 'warning', ignored: true },
    ];
    const { hass, socket } = home({}, { issues });
    const card = await mount({ alerts: [{ preset: 'repairs' }], columns: 1 }, hass);
    await vi.waitFor(() => expect(tiles(card)).toHaveLength(1));
    const [tile] = tiles(card);
    expect(text(tile?.querySelector('.fv-tile__state'))).toBe('Zigbee channel changed · 1 h');
    // a repair's error is critical
    expect(tile?.classList.contains('fv-tile--danger')).toBe(true);
    expect(
      socket.ws.some((message) => message['event_type'] === 'repairs_issue_registry_updated'),
    ).toBe(true);
    // someone else never asks: the repairs are an administrator's
    const guest = home({}, { admin: false, issues });
    const hidden = await mount({ alerts: [{ preset: 'repairs' }] }, guest.hass);
    expect(guest.socket.ws.some((message) => message['type'] === 'repairs/list_issues')).toBe(
      false,
    );
    expect(hidden.hidden).toBe(true);
  });

  it('says each repair’s own severity in its own ink in the sheet, a warning beside a critical one', async () => {
    const issues = [
      { domain: 'zha', issue_id: 'network_1', severity: 'error', created: AT },
      { domain: 'mqtt', issue_id: 'yaml_1', severity: 'warning', created: AT },
    ];
    const { hass } = home({}, { issues });
    const card = await mount(
      { alerts: [{ preset: 'repairs', id: 'repairs' }], _sheet: 'repairs' },
      hass,
    );
    const values = async (): Promise<string[]> => {
      const sheet = root(card).querySelector('fluvy-alerts-sheet') as FluvyAlertsSheet | null;
      await sheet?.updateComplete;
      return [...(sheet?.shadowRoot?.querySelectorAll('.as-value') ?? [])].map(
        (value) => `${text(value)} ${[...value.classList].find((c) => c.startsWith('fv-tone--'))}`,
      );
    };
    await vi.waitFor(async () => expect(await values()).toHaveLength(2));
    expect((await values()).sort()).toEqual([
      'Critical fv-tone--danger',
      'Warning fv-tone--warning',
    ]);
  });

  it('keeps no timer once it leaves the page, and watches again when it is back', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { hass } = home({
      'binary_sensor.front_door': door('on', 1),
      'binary_sensor.back_door': door('off'),
    });
    const card = document.createElement('fluvy-alerts-card') as Mounted;
    card.setConfig({
      type: 'custom:fluvy-alerts-card',
      alerts: [{ preset: 'open', for: { minutes: 5 } }],
    } as LovelaceCardConfig);
    card.hass = hass;
    document.body.append(card);
    await card.updateComplete;
    expect(card.hidden).toBe(true);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    // the door's five minutes reached: the card shows itself
    await vi.advanceTimersByTimeAsync(4 * MINUTE + 1000);
    await card.updateComplete;
    expect(card.hidden).toBe(false);
    card.remove();
    expect(vi.getTimerCount()).toBe(0);
    // a view shown again: the card reads the house as it is now
    document.body.append(card);
    card.hass = change(hass, 'binary_sensor.back_door', door('on', 10));
    await card.updateComplete;
    await card.updateComplete;
    expect(tiles(card).map((tile) => text(tile.querySelector('.fv-tile__state')))).toEqual([
      'back_door, front_door',
    ]);
  });

  it('says its height from its config, never from the house', () => {
    const four = { type: 'custom:fluvy-alerts-card', alerts: [{}, {}, {}, {}] };
    expect(alertsHeight(four)).toBe(2 * 84 - 8);
    expect(alertsHeight({ ...four, variant: 'mini' })).toBe(2 * 116 - 8);
    // the rows start 4 under the head (88), not a list's 16
    expect(alertsHeight({ ...four, variant: 'rows' })).toBe(88 + 4 * 60);
    expect(alertsHeight({ ...four, variant: 'rows', compact: true })).toBe(88 + 4 * 48);
    expect(alertsHeight({ ...four, variant: 'chips' })).toBe(2 * 44);
    expect(alertsHeight({ ...four, variant: 'banner' })).toBe(76);
    expect(alertsHeight({ type: 'custom:fluvy-alerts-card', alerts: [] })).toBe(76);
  });
});

describe('the alerts card’s editor', () => {
  it('shows a preset’s own fields and parameters, and a custom alert’s whole matcher', () => {
    const names = (item: Record<string, unknown>): string[] =>
      alertFields(item).flatMap((field) =>
        field.schema ? field.schema.map((inner) => inner.name) : [field.name],
      );
    expect(names({ preset: 'low_battery' })).toEqual(expect.arrayContaining(['below', 'phones']));
    expect(names({ preset: 'low_battery' })).not.toContain('domain');
    expect(names({ preset: 'repairs' })).not.toContain('area');
    expect(names({ preset: 'custom' })).toEqual(
      expect.arrayContaining(['domain', 'state', 'above', 'unchanged_for', 'match']),
    );
    // one array per answer: the item's form is not rebuilt on every render
    expect(alertFields({ preset: 'open' })).toBe(alertFields({ preset: 'open', name: 'Doors' }));
  });

  it('reads an alert without a preset as custom, and writes it back as the person’s own', () => {
    const read = ALERTS_LIST.read!;
    const write = ALERTS_LIST.write!;
    expect(read({ domain: 'light' })).toEqual({ preset: 'custom', domain: 'light' });
    expect(write({ preset: 'custom', domain: ['light'], name: '' })).toEqual({ domain: ['light'] });
    // a custom alert that matches nothing yet is a list still empty, never a mistake
    expect(write({ preset: 'custom' })).toEqual({ match: [] });
    expect(write({ preset: 'open', exclude: [] })).toEqual({ preset: 'open' });
  });
});
