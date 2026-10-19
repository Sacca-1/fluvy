// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  paletteOf,
  SettingsStore,
  type EffectiveSettings,
  type HomeAssistant,
  type LookHandle,
  type SettingsHass,
  TABS_DEFAULTS,
  CHROME_DEFAULTS,
} from '@fluvy/core';
import { exportSettings, importPalette, importSettings } from './actions.js';
import { COMMUNITY_PALETTES } from '@fluvy/tokens/community';
import type { PanelContext } from './model.js';
import type { FluvyPanel } from './panel.js';

/** A Home Assistant that keeps fluvy's settings in memory and answers the panel's dashboard questions. */
function fixture(admin = true, extra: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { system: null, user: null };
  const subscribers: Record<string, Set<(message: { value: unknown }) => void>> = {
    system: new Set(),
    user: new Set(),
  };
  const layer = (type: string) => (type.includes('system') ? 'system' : 'user');
  const written: { type: string; value: unknown }[] = [];
  const storage = {
    connection: {
      subscribeMessage: async (
        callback: (m: { value: unknown }) => void,
        message: { type: string },
      ) => {
        subscribers[layer(message.type)]!.add(callback);
        callback({ value: data[layer(message.type)] });
        return () => undefined;
      },
    },
    callWS: async (message: { type: string; value: unknown }) => {
      written.push(message);
      data[layer(message.type)] = message.value;
      for (const listener of subscribers[layer(message.type)]!) listener({ value: message.value });
    },
  } as unknown as SettingsHass;
  const store = new SettingsStore(() => storage, undefined);
  const listeners = new Set<(settings: EffectiveSettings) => void>();
  const previews: unknown[] = [];
  const handle: LookHandle = {
    store,
    settings: () => store.effective,
    preview: (look) => void previews.push(look),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setWall: () => undefined,
    stop: () => undefined,
  };
  store.start((settings) => listeners.forEach((listener) => listener(settings)));
  const hass = {
    language: 'en',
    locale: { language: 'en' },
    themes: { darkMode: false },
    states: {},
    entities: {},
    devices: {},
    areas: {},
    user: { id: 'u', name: 'U', is_admin: admin },
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'Europe/Madrid' },
    callService: async () => undefined,
    panels: {
      lovelace: { component_name: 'lovelace', url_path: 'lovelace', title: null, icon: null },
      'fluvy-auto': {
        component_name: 'lovelace',
        url_path: 'fluvy-auto',
        title: 'Fluvy auto',
        icon: 'fluvy:sun',
      },
    },
    localize: (key: string) => key,
    callWS: async (message: { type: string; url_path?: string | null }) =>
      message.type === 'lovelace/config' && message.url_path === 'fluvy-auto'
        ? { strategy: { type: 'custom:fluvy-home' } }
        : { views: [] },
    formatEntityState: (s: { state: string }) => s.state,
    ...extra,
  } as unknown as HomeAssistant;
  return { handle, hass, written, previews };
}

async function mount(admin = true, extra: Record<string, unknown> = {}) {
  await import('./define.js');
  const f = fixture(admin, extra);
  const panel = document.createElement('fluvy-panel') as HTMLElement & {
    hass: HomeAssistant;
    handle: LookHandle;
    tab: string;
    updateComplete: Promise<boolean>;
  };
  panel.handle = f.handle;
  panel.hass = f.hass;
  document.body.append(panel);
  await panel.updateComplete;
  const root = panel.shadowRoot!;
  const swatch = (name: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('.pn-swatch')].find(
      (b) => b.querySelector('.pn-swatch__name')?.textContent?.trim() === name,
    )!;
  const button = (text: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('.pn-bar button')].find(
      (b) => b.textContent?.trim() === text,
    );
  const row = (title: string) =>
    [...root.querySelectorAll<HTMLElement>('.fv-row')].find(
      (r) => r.querySelector('.fv-row__title')?.textContent?.trim() === title,
    );
  const chip = (text: string) =>
    [...root.querySelectorAll<HTMLElement>('.fv-chip')].find((c) => c.textContent?.trim() === text);
  /** Opens the tab's dropdown and chooses the row with this name, as a finger would. */
  const pick = async (name: string) => {
    const select = root.querySelector('fluvy-select')!;
    const inside = select.shadowRoot!;
    inside.querySelector<HTMLButtonElement>('.fv-select')!.click();
    await select.updateComplete;
    [...inside.querySelectorAll<HTMLElement>('.fv-menu__item')]
      .find((r) => r.querySelector('.fv-menu__name')?.textContent?.trim() === name)!
      .click();
    await select.updateComplete;
  };
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await panel.updateComplete;
  };
  return { ...f, panel, root, swatch, button, row, chip, pick, settle };
}

describe('the settings panel', () => {
  it('shows the house’s look chosen, and a picked palette as pending until it is applied', async () => {
    const { panel, root, swatch, written } = await mount();
    expect(swatch('Linen').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('.pn-bar')).toBeNull();
    swatch('Volt').click();
    await panel.updateComplete;
    expect(swatch('Volt').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('.pn-bar')).not.toBeNull();
    expect(written).toEqual([]);
    panel.remove();
  });

  it('applies the chosen look to the house', async () => {
    const { panel, swatch, button, written, handle } = await mount();
    swatch('Blaze').click();
    await panel.updateComplete;
    button('Apply to the house')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(written.at(-1)?.type).toBe('frontend/set_system_data');
    expect(handle.settings().look.palette).toBe('blaze');
    panel.remove();
  });

  it('names the change it would apply, and keeps offering it on every tab', async () => {
    const { panel, root, swatch } = await mount();
    swatch('Volt').click();
    await panel.updateComplete;
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe('Linen → Volt');
    panel.tab = 'preferences';
    await panel.updateComplete;
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe('Linen → Volt');
    panel.remove();
  });

  it('wears the look being chosen on the whole panel', async () => {
    const { panel, root, swatch } = await mount();
    const accent = () =>
      [...(root as ShadowRoot).adoptedStyleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .map((rule) => rule.cssText)
        .find((text) => /^:host\s*\{/.test(text) && text.includes('--fluvy-accent:'));
    const before = accent();
    swatch('Blaze').click();
    await panel.updateComplete;
    expect(accent()).toBeDefined();
    expect(accent()).not.toBe(before);
    panel.remove();
  });

  it('offers a person who is not an admin one way to apply: for themselves', async () => {
    const { panel, swatch, button } = await mount(false);
    swatch('Mint').click();
    await panel.updateComplete;
    expect(button('Apply to the house')).toBeUndefined();
    expect(button('Only for me')).toBeUndefined();
    expect(button('Apply for me')?.classList.contains('fv-btn--accent')).toBe(true);
    panel.remove();
  });

  it('tells someone who is not an admin the truth about the dashboards', async () => {
    const { panel, root, row } = await mount(false);
    panel.tab = 'dashboard';
    await new Promise((resolve) => setTimeout(resolve, 0));
    await panel.updateComplete;
    // the house's home dashboard as it is; the templates it does not have, said plainly and without a button
    expect(row('Fluvy auto')?.textContent).not.toContain('Not created yet');
    expect(row('Rooms')?.textContent).toContain('Not created yet');
    expect(row('Rooms')?.querySelector('.fv-row__btn')).toBeNull();
    expect(root.textContent).not.toContain('Create');
    panel.tab = 'scope';
    await panel.updateComplete;
    // their own Overview under its Home Assistant name, and the automatic dashboard, as they are: a switch they may
    // only look at, read-only at full strength (not the disabled skin of one out of reach)
    expect(row('Overview')).toBeDefined();
    const fixed = row('Fluvy auto')?.querySelector('.fv-switch');
    expect(fixed?.getAttribute('aria-readonly')).toBe('true');
    expect(fixed?.getAttribute('aria-disabled')).toBe('false');
    expect(fixed?.closest('.fv-hit')?.classList.contains('is-fixed')).toBe(true);
    panel.tab = 'dashboard';
    await panel.updateComplete;
    // the sidebar switch is an administrator's
    expect(row('Show in the sidebar')).toBeUndefined();
    panel.remove();
  });

  it('lists the automatic dashboard in the sidebar, or takes its entry out', async () => {
    const updates: Record<string, unknown>[] = [];
    const { panel, row, settle } = await mount(true, {
      callWS: async (message: { type: string; url_path?: string | null }) => {
        if (message.type === 'lovelace/dashboards/update') {
          updates.push(message);
          return {};
        }
        if (message.type === 'lovelace/dashboards/list') {
          return [
            {
              id: 'fluvy_auto',
              url_path: 'fluvy-auto',
              title: 'Fluvy auto',
              icon: 'fluvy:sun',
              show_in_sidebar: updates.length === 0,
            },
          ];
        }
        return message.type === 'lovelace/config' && message.url_path === 'fluvy-auto'
          ? { strategy: { type: 'custom:fluvy-home' } }
          : { views: [] };
      },
    });
    panel.tab = 'dashboard';
    await settle();
    const sidebar = row('Show in the sidebar')!;
    expect(sidebar.querySelector('.fv-switch')?.getAttribute('aria-checked')).toBe('true');
    sidebar.querySelector<HTMLElement>('.fv-hit')!.click();
    await settle();
    await settle();
    expect(updates).toEqual([
      { type: 'lovelace/dashboards/update', dashboard_id: 'fluvy_auto', show_in_sidebar: false },
    ]);
    // the list answers again, and the row shows it
    expect(
      row('Show in the sidebar')?.querySelector('.fv-switch')?.getAttribute('aria-checked'),
    ).toBe('false');
    panel.remove();
  });

  it('creates a template’s dashboard with one tap: the dashboard, then its bare strategy, then the list again', async () => {
    const calls: Record<string, unknown>[] = [];
    let made = false;
    const { panel, row, settle } = await mount(true, {
      callWS: async (message: { type: string; url_path?: string | null }) => {
        if (
          message.type === 'lovelace/dashboards/create' ||
          message.type === 'lovelace/config/save'
        ) {
          calls.push(message);
          if (message.type === 'lovelace/config/save') made = true;
          return {};
        }
        if (message.type === 'lovelace/dashboards/list') return [];
        if (message.type === 'lovelace/config')
          return message.url_path === 'fluvy-auto'
            ? { strategy: { type: 'custom:fluvy-home' } }
            : message.url_path === 'fluvy-energy' && made
              ? { strategy: { type: 'custom:fluvy-energy' } }
              : { views: [] };
        return { views: [] };
      },
    });
    panel.tab = 'dashboard';
    await settle();
    const energy = row('Energy')!;
    expect(energy.querySelector('.fv-row__btn')?.textContent?.trim()).toBe('Create');
    energy.click();
    await settle();
    await settle();
    expect(calls).toEqual([
      {
        type: 'lovelace/dashboards/create',
        url_path: 'fluvy-energy',
        title: 'Fluvy · Energy',
        icon: 'fluvy:bolt',
        show_in_sidebar: true,
        require_admin: false,
        mode: 'storage',
      },
      {
        type: 'lovelace/config/save',
        url_path: 'fluvy-energy',
        config: { strategy: { type: 'custom:fluvy-energy' } },
      },
    ]);
    // once Home Assistant lists it, the row opens it and its options card appears
    panel.hass = {
      ...panel.hass,
      panels: {
        ...panel.hass.panels,
        'fluvy-energy': {
          component_name: 'lovelace',
          url_path: 'fluvy-energy',
          title: 'Fluvy · Energy',
          icon: 'fluvy:bolt',
        },
      },
    } as HomeAssistant;
    await settle();
    await settle();
    expect(row('Fluvy · Energy')?.querySelector('.fv-row__chevron')).not.toBeNull();
    expect(row('Production')?.querySelector('.fv-switch')).not.toBeNull();
    panel.remove();
  });

  it('edits each dashboard’s options apart and saves them with one Apply; Recreate takes two taps', async () => {
    const saved: { type: string; url_path?: string; config?: unknown }[] = [];
    const { panel, root, row, chip, button, settle } = await mount(true, {
      panels: {
        lovelace: { component_name: 'lovelace', url_path: 'lovelace', title: null, icon: null },
        'fluvy-auto': {
          component_name: 'lovelace',
          url_path: 'fluvy-auto',
          title: 'Fluvy auto',
          icon: 'fluvy:sun',
        },
        'fluvy-security': {
          component_name: 'lovelace',
          url_path: 'fluvy-security',
          title: 'Fluvy · Security',
          icon: 'fluvy:shield',
        },
      },
      callWS: async (message: { type: string; url_path?: string | null; config?: unknown }) => {
        if (message.type === 'lovelace/config/save') {
          saved.push(message as never);
          return {};
        }
        if (message.type === 'lovelace/dashboards/list') return [];
        if (message.type === 'lovelace/config')
          return message.url_path === 'fluvy-auto'
            ? { strategy: { type: 'custom:fluvy-home' } }
            : message.url_path === 'fluvy-security'
              ? { strategy: { type: 'custom:fluvy-security', camera_refresh: 30 } }
              : { views: [] };
        return { views: [] };
      },
    });
    panel.tab = 'dashboard';
    await settle();
    // the security dashboard's own chips: 30 s chosen as saved; the home's thermostats untouched
    expect(chip('30 s')?.classList.contains('is-active')).toBe(true);
    chip('Ruler')!.click();
    chip('5 s')!.click();
    await settle();
    // two dashboards edited: the bar counts them and saves both
    expect(root.querySelector('.pn-bar')?.textContent).toContain('2 changes');
    button('Save')!.click();
    await settle();
    await settle();
    expect(saved).toEqual([
      {
        type: 'lovelace/config/save',
        url_path: 'fluvy-auto',
        config: { strategy: { type: 'custom:fluvy-home', thermostat_variant: 'ruler' } },
      },
      {
        type: 'lovelace/config/save',
        url_path: 'fluvy-security',
        config: { strategy: { type: 'custom:fluvy-security' } },
      },
    ]);
    // Recreate: the first tap arms the row, the second writes the bare strategy
    const recreate = [...root.querySelectorAll<HTMLElement>('.fv-row')].filter(
      (r) => r.querySelector('.fv-row__title')?.textContent?.trim() === 'Start over',
    );
    expect(recreate.length).toBe(2);
    recreate[1]!.click();
    await settle();
    expect(row('Tap again')).toBeDefined();
    expect(saved.length).toBe(2);
    row('Tap again')!.click();
    await settle();
    await settle();
    expect(saved.at(-1)).toEqual({
      type: 'lovelace/config/save',
      url_path: 'fluvy-security',
      config: { strategy: { type: 'custom:fluvy-security' } },
    });
    panel.remove();
  });

  it('edits the wall whole and this device apart: the screensaver minutes saved with the house, the device on Save', async () => {
    localStorage.removeItem('fluvy:device');
    const { panel, root, row, chip, button, handle, settle } = await mount();
    panel.tab = 'wall';
    await settle();
    // this device is not a wall; the house's wall waits ten minutes
    expect(row('Wall panel')?.querySelector('.fv-switch')?.getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(chip('10 min')?.classList.contains('is-active')).toBe(true);
    chip('5 min')!.click();
    await settle();
    expect(root.querySelector('.pn-bar')?.textContent).toContain('Wall · Screensaver after');
    row('Wall panel')!.querySelector<HTMLElement>('.fv-hit')!.click();
    await settle();
    expect(root.querySelector('.pn-bar')?.textContent).toContain('2 changes');
    button('Save')!.click();
    // the house's write, the store's echo and the device's memory take a few ticks
    await new Promise((resolve) => setTimeout(resolve, 200));
    await settle();
    // the house keeps every other wall setting as it was; the device remembers itself
    expect(handle.settings().wall).toMatchObject({
      after: 5,
      clock: true,
      theme: 'follow',
      background: 'plain',
    });
    expect(JSON.parse(localStorage.getItem('fluvy:device') ?? '{}')).toMatchObject({ wall: true });
    expect(root.querySelector('.pn-bar')).toBeNull();
    panel.remove();
    localStorage.removeItem('fluvy:device');
  });

  it('copies the wall\u2019s address and says so, or says what to do when it cannot', async () => {
    const { panel, root, settle } = await mount();
    panel.tab = 'wall';
    await settle();
    expect(root.querySelector('.pn-address__url')?.textContent?.trim().endsWith('?kiosk')).toBe(
      true,
    );
    const address = root.querySelector<HTMLElement>('.pn-address button')!;
    address.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settle();
    expect(root.querySelector('.pn-notice')?.textContent).toContain('Address copied');
    // a plain-HTTP page has no Clipboard API, and a browser may refuse the selection command too: honest words
    const clipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = document.execCommand;
    document.execCommand = () => false;
    address.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settle();
    expect(root.querySelector('.pn-notice')?.textContent).toContain('Could not copy');
    document.execCommand = exec;
    if (clipboard) Object.defineProperty(Navigator.prototype, 'clipboard', clipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
    panel.remove();
  });

  it('lets the house choose the wall\u2019s way out: the button by default, or the long press', async () => {
    const { panel, root, chip, button, handle, settle } = await mount();
    panel.tab = 'wall';
    await settle();
    expect(chip('Button')?.classList.contains('is-active')).toBe(true);
    chip('Long press')!.click();
    await settle();
    expect(root.querySelector('.pn-bar')?.textContent).toContain('Wall · Way out');
    button('Save')!.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await settle();
    expect(handle.settings().wall.exit).toBe('hold');
    panel.remove();
  });

  it('offers every motion sensor in a dropdown to wake the wall, its room as the hint', async () => {
    const sensor = (id: string, device_class: string, friendly_name: string) => ({
      entity_id: id,
      state: 'off',
      attributes: { device_class, friendly_name },
      last_changed: '',
      last_updated: '',
    });
    const { panel, root, settle } = await mount(true, {
      states: {
        'binary_sensor.porch': sensor('binary_sensor.porch', 'occupancy', 'Porch'),
        'binary_sensor.hall': sensor('binary_sensor.hall', 'motion', 'Hall motion'),
        'binary_sensor.door': sensor('binary_sensor.door', 'door', 'Front door'),
      },
      entities: { 'binary_sensor.hall': { entity_id: 'binary_sensor.hall', area_id: 'hall' } },
      areas: { hall: { area_id: 'hall', name: 'Hall' } },
    });
    panel.tab = 'wall';
    await settle();
    const select = root.querySelector('fluvy-select') as HTMLElement & {
      value: string;
      options: readonly { value: string; label: string; hint?: string }[];
    };
    expect(select.value).toBe('');
    // None first, then the sensors that see a person by name (a door is not one), each with its room
    expect(select.options.map((o) => [o.value, o.label, o.hint ?? ''])).toEqual([
      ['', 'None', ''],
      ['binary_sensor.hall', 'Hall motion', 'Hall'],
      ['binary_sensor.porch', 'Porch', ''],
    ]);
    select.dispatchEvent(
      new CustomEvent('fluvy-change', { detail: { value: 'binary_sensor.porch' }, bubbles: true }),
    );
    await settle();
    expect(root.querySelector('.pn-bar')?.textContent).toContain('Wake on motion');
    panel.remove();
  });

  it('shows the screensaver as the wall would, over the panel, until a tap', async () => {
    const { panel, root, row, settle } = await mount();
    panel.tab = 'wall';
    await settle();
    row('See the screensaver')!.click();
    // the wall's pieces are fetched (a chunk of their own): as long as that takes, up to two seconds on a slow runner
    for (
      let waited = 0;
      waited < 2000 && !root.querySelector('fluvy-wall-screensaver');
      waited += 20
    )
      await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    const saver = root.querySelector('fluvy-wall-screensaver') as HTMLElement & {
      clock: boolean;
      dim: boolean;
    };
    expect(saver).not.toBeNull();
    expect(saver.hasAttribute('preview')).toBe(true); // a desktop keeps its pointer
    expect(saver.clock).toBe(true);
    expect(saver.dim).toBe(false);
    saver.shadowRoot!.querySelector('dialog')!.dispatchEvent(new MouseEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 260)); // its fade
    expect(root.querySelector('fluvy-wall-screensaver')).toBeNull();
    panel.remove();
  });

  it('draws the wall preview in the night the settings give, veiled as the night darkens it', async () => {
    const { panel, root, chip, settle } = await mount();
    panel.tab = 'wall';
    await settle();
    const preview = () => root.querySelector('.pn-preview--wall')!;
    expect(preview().classList.contains('pn-night')).toBe(false); // Follow: the app's mode, which is light
    const option = [...root.querySelectorAll<HTMLElement>('.fv-option')].find((o) =>
      o.textContent?.includes('Always'),
    )!;
    option.click();
    chip('40 %')!.click();
    await settle();
    expect(preview().classList.contains('pn-night')).toBe(true);
    expect(preview().querySelector<HTMLElement>('.pn-preview__veil')?.style.opacity).toBe('0.4');
    // the preview's cards are told the night too
    const tile = preview().querySelector('fluvy-tile-card') as HTMLElement & {
      hass?: { themes: { darkMode: boolean } };
    };
    expect(tile.hass?.themes.darkMode).toBe(true);
    chip('Off')!.click();
    await settle();
    expect(preview().querySelector('.pn-preview__veil')).toBeNull();
    panel.remove();
  });

  it('lists the house’s palettes under Yours and the community’s with their authors; a matching draft is that palette', async () => {
    const { panel, root, swatch, handle, settle } = await mount();
    const moss = COMMUNITY_PALETTES.find((file) => file.name === 'moss')!;
    // the house's own copy of the community's moss, under the same name: it stands in for it
    await handle.store.saveHouse({ palettes: [{ ...moss, title: 'My moss', author: 'Marta' }] });
    await settle();
    expect(root.textContent).toContain('Yours');
    expect(swatch('My moss')).toBeDefined();
    expect(swatch('My moss').querySelector('.pn-swatch__by')?.textContent?.trim()).toBe('by Marta');
    expect(swatch('Citrus').querySelector('.pn-swatch__by')?.textContent?.trim()).toBe('by Fluvy');
    // the house's copy of moss stands in for the community's
    expect(swatch('Moss')).toBeUndefined();
    swatch('My moss').click();
    await panel.updateComplete;
    expect(swatch('My moss').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('.pn-custom.is-active')).toBeNull();
    expect(root.querySelector('.pn-bar')?.textContent).toContain('Linen → My moss');
    panel.remove();
  });

  it('shares a custom palette as a file named after its title, and reads one back', async () => {
    const { panel, root, settle } = await mount();
    (panel as unknown as { draft: unknown }).draft = {
      palette: { character: 'vivid', base: 'cool', accent: '#ff4a1a', fill: 'tint' },
      shape: 'soft',
      pills: 'round',
    };
    await settle();
    const inputs = [...root.querySelectorAll<HTMLInputElement>('.pn-text input')];
    expect(inputs).toHaveLength(2);
    const type = (input: HTMLInputElement, value: string): void => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type(inputs[0]!, 'Warm Sand');
    type(inputs[1]!, 'Marta');
    await settle();
    let file: Blob | undefined;
    let name = '';
    const create = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => ((file = blob), 'blob:fluvy');
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      name = this.download;
    };
    [...root.querySelectorAll<HTMLButtonElement>('.fv-btn')]
      .find((b) => b.textContent?.trim() === 'Share this palette')!
      .click();
    URL.createObjectURL = create;
    HTMLAnchorElement.prototype.click = click;
    expect(name).toBe('warm-sand.fluvy-palette.json');
    const shared = JSON.parse(await file!.text()) as Record<string, unknown>;
    expect(shared).toMatchObject({
      fluvy_palette: 1,
      name: 'warm-sand',
      title: 'Warm Sand',
      author: 'Marta',
      palette: { character: 'vivid', base: 'cool', accent: '#ff4a1a', fill: 'tint' },
    });
    // a file back in: its palette is the draft and its words are the card's; a foreign file is refused
    const ops = panel as unknown as { context(): PanelContext };
    const citrus = COMMUNITY_PALETTES.find((f) => f.name === 'citrus')!;
    importPalette(
      panel as unknown as FluvyPanel,
      ops.context(),
      new File(
        [JSON.stringify({ ...citrus, name: 'sunny', title: 'Sunny' })],
        'sunny.fluvy-palette.json',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    expect((panel as unknown as { draft: { palette: unknown } }).draft.palette).toEqual(
      citrus.palette,
    );
    expect(root.querySelector<HTMLInputElement>('.pn-text input')?.value).toBe('Sunny');
    importPalette(
      panel as unknown as FluvyPanel,
      ops.context(),
      new File([JSON.stringify({ hello: 1 })], 'x.json'),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    expect(root.textContent).toContain('That file holds no Fluvy palette');
    panel.remove();
  });

  it('saves a palette to the house and removes it (an administrator), stops at twelve, and shows a guest no such row', async () => {
    const { panel, root, row, handle, settle } = await mount();
    const draft = {
      palette: { character: 'soft', base: 'warm', accent: '#6b5a3c' },
      shape: 'soft',
      pills: 'round',
    };
    (panel as unknown as { draft: unknown }).draft = draft;
    await settle();
    const inputs = root.querySelectorAll<HTMLInputElement>('.pn-text input');
    inputs[0]!.value = 'Garden';
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    row('Save to the house’s palettes')!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    expect(handle.store.house.palettes.map((f) => f.name)).toEqual(['garden']);
    expect(row('Remove from the house’s palettes')).toBeDefined();
    row('Remove from the house’s palettes')!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    expect(handle.store.house.palettes).toEqual([]);
    // twelve kept: a thirteenth has no row, only the reason
    const moss = COMMUNITY_PALETTES.find((file) => file.name === 'moss')!;
    await handle.store.saveHouse({
      palettes: Array.from({ length: 12 }, (_, i) => ({ ...moss, name: `p${i}`, title: `P${i}` })),
    });
    await settle();
    expect(row('Save to the house’s palettes')).toBeUndefined();
    expect(root.textContent).toContain('The house keeps twelve palettes');
    panel.remove();
    const guest = await mount(false);
    (guest.panel as unknown as { draft: unknown }).draft = draft;
    await guest.settle();
    // a guest may still share and import (a palette for their own look), never save for the house
    expect(guest.row('Save to the house’s palettes')).toBeUndefined();
    expect(guest.root.querySelector('.pn-file')).not.toBeNull();
    guest.panel.remove();
  });

  it('lets the house keep Home Assistant’s own icons in its menus, shown before it is saved', async () => {
    const { panel, root, row, button, written, handle, previews, settle } = await mount();
    await handle.store.saveHouse({ scope: 'everywhere' });
    panel.tab = 'scope';
    await panel.updateComplete;
    const icons = row('Our icons in the menus');
    expect(icons?.querySelector('.fv-switch')?.getAttribute('aria-checked')).toBe('true');
    const saves = written.length;
    icons?.querySelector<HTMLElement>('.fv-hit')?.click();
    await settle();
    // an edit: on the screen at once, saved only from the bar
    expect(written.length).toBe(saves);
    expect(previews.at(-1)).toEqual({ icons: false });
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe(
      'Our icons in the menus · Off',
    );
    button('Save')!.click();
    await settle();
    expect(written.at(-1)?.type).toBe('frontend/set_system_data');
    expect(handle.settings().icons).toBe(false);
    // Home Assistant handed the saved value back: nothing is pending (the bar is on its way out), nothing previewed
    expect(root.querySelector('.pn-foot:not(.is-leaving) .pn-bar')).toBeNull();
    expect(previews.at(-1)).toBeNull();
    panel.remove();
  });

  it('lets the house say how lights show their colour where a card says nothing (#41)', async () => {
    const { panel, root, row, chip, button, handle, previews, settle } = await mount();
    // on the Look tab: never, by default, so nothing changes on upgrade
    expect(chip('Never')?.classList.contains('is-active')).toBe(true);
    const colours = row('In their bulb’s colour');
    expect(colours?.querySelector('.fv-switch')?.getAttribute('aria-checked')).toBe('false');
    chip('When on')!.click();
    await settle();
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe(
      'Lights · Show their colour · When on',
    );
    colours?.querySelector<HTMLElement>('.fv-hit')?.click();
    await settle();
    // shown on every card at once, saved only from the bar
    expect(previews.at(-1)).toEqual({ lightTint: 'on', lightColors: true });
    button('Save')!.click();
    await settle();
    expect([handle.settings().lightTint, handle.settings().lightColors]).toEqual(['on', true]);
    panel.remove();
    // someone who is not an administrator reads them, and changes nothing
    const guest = await mount(false);
    expect(guest.root.textContent).toContain('Lights');
    guest.chip('Always')?.click();
    await guest.settle();
    expect(guest.previews.at(-1)).not.toEqual(expect.objectContaining({ lightTint: 'always' }));
    guest.panel.remove();
  });

  it('lets the house give each status a colour of its own, the palette’s until then (1.9)', async () => {
    const { panel, root, button, handle, previews, settle } = await mount();
    const card = () =>
      [...root.querySelectorAll<HTMLElement>('.pn-card')].find(
        (c) => c.querySelector('.fv-card__title')?.textContent?.trim() === 'Status colours',
      )!;
    /** A status's block: its label, its Auto · Custom chips, and (Custom) its dots, its field, its line. */
    const block = (status: string) => {
      const label = [...card().querySelectorAll<HTMLElement>('.pn-label')].find(
        (p) => p.textContent?.trim() === status,
      )!;
      const parts: HTMLElement[] = [];
      for (let el = label.nextElementSibling; el && !el.classList.contains('pn-label');)
        el = (parts.push(el as HTMLElement), el.nextElementSibling);
      const find = (selector: string) => parts.find((part) => part.matches(selector));
      return {
        chip: (text: string) =>
          [...(find('.fv-chips')?.querySelectorAll<HTMLElement>('.fv-chip') ?? [])].find(
            (c) => c.textContent?.trim() === text,
          )!,
        dots: find('.pn-dots'),
        hex: find('.pn-hex')?.querySelector<HTMLInputElement>('.pn-hex__input'),
        line: find('.pn-hint')?.textContent?.trim(),
      };
    };
    const worn = () =>
      [...((panel.shadowRoot as ShadowRoot).adoptedStyleSheets ?? [])]
        .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
        .join('');
    // four statuses, each the palette's: nothing changes on upgrade
    for (const status of ['Warning', 'Danger', 'Success', 'Notice']) {
      expect(block(status).chip('Auto').classList.contains('is-active'), status).toBe(true);
      expect(block(status).dots, status).toBeUndefined();
    }
    // Custom: the warning starts on #47's orange, shown on the panel and the page at once, saved from the bar
    block('Warning').chip('Custom').click();
    await settle();
    expect(previews.at(-1)).toEqual({ statuses: { warning: '#dc630b' } });
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe(
      'Status colours · Warning · #dc630b',
    );
    expect(block('Warning').dots?.querySelectorAll('.pn-dot').length).toBe(6);
    expect(block('Warning').hex?.value).toBe('#dc630b');
    const orange = paletteOf('linen', { warning: '#dc630b' }).light.semantic.warning;
    expect(worn()).toMatch(new RegExp(`--fluvy-warning: ?${orange.ink}`));
    // a swatch, then any colour typed
    block('Warning').dots!.querySelectorAll<HTMLElement>('.pn-dot')[5]!.click();
    await settle();
    expect(previews.at(-1)).toEqual({ statuses: { warning: '#7048e8' } });
    const field = block('Warning').hex!;
    field.value = '#E8590C';
    field.dispatchEvent(new Event('change'));
    await settle();
    expect(previews.at(-1)).toEqual({ statuses: { warning: '#e8590c' } });
    // a danger in the warning's very colour: the panel says so under both, and turns nothing aside
    block('Danger').chip('Custom').click();
    await settle();
    expect(block('Danger').line).toBeUndefined();
    const danger = block('Danger').hex!;
    danger.value = '#e8590c';
    danger.dispatchEvent(new Event('change'));
    await settle();
    expect(previews.at(-1)).toEqual({ statuses: { warning: '#e8590c', danger: '#e8590c' } });
    expect(block('Danger').line).toBe('Close to Warning: the two may be mistaken for each other');
    expect(block('Warning').line).toBe('Close to Danger: the two may be mistaken for each other');
    expect(block('Success').line).toBeUndefined();
    block('Danger').chip('Auto').click();
    await settle();
    expect(block('Warning').line).toBeUndefined();
    button('Save')!.click();
    await settle();
    expect(handle.settings().statuses).toEqual({ warning: '#e8590c' });
    expect(root.querySelector('.pn-foot:not(.is-leaving) .pn-bar')).toBeNull();
    // back to the palette's: an edit, and the panel wears the palette's own again
    block('Warning').chip('Auto').click();
    await settle();
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe(
      'Status colours · Warning · Auto',
    );
    expect(worn()).toMatch(
      new RegExp(`--fluvy-warning: ?${paletteOf('linen').light.semantic.warning.ink}`),
    );
    panel.remove();
    // someone who is not an administrator sees them, and changes nothing
    const guest = await mount(false);
    const guestCard = [...guest.root.querySelectorAll<HTMLElement>('.pn-card')].find(
      (c) => c.querySelector('.fv-card__title')?.textContent?.trim() === 'Status colours',
    )!;
    expect(guestCard.textContent).toContain('Only an administrator can change this');
    [...guestCard.querySelectorAll<HTMLElement>('.fv-chip')]
      .find((c) => c.textContent?.trim() === 'Custom')!
      .click();
    await guest.settle();
    expect(guest.previews.at(-1)).not.toEqual(
      expect.objectContaining({ statuses: expect.anything() }),
    );
    guest.panel.remove();
  });

  it('lays a row of choices out by measure: three while every word holds its third, else two and one', async () => {
    const { panel, chip } = await mount();
    const host = panel as unknown as {
      content: number;
      ruler: { width: (c: string, t: string) => number };
    };
    const tracks = (): string | undefined =>
      chip('When on')
        ?.parentElement?.getAttribute('style')
        ?.match(/repeat\((\d+),/)?.[1];
    // a phone's card (288 of content, 8 apart: thirds of 90.7): "When on" at 70 + its sides holds a third
    host.ruler.width = (_class, text) => (text === 'When on' ? 70 : 40);
    host.content = 288;
    await panel.updateComplete;
    expect(tracks()).toBe('3');
    // a word too long for its third (pt-BR's "Quando ligado" at 94 + its 16): two and one, the third across both
    host.ruler.width = (_class, text) => (text === 'When on' ? 94 : 40);
    host.content = 289;
    await panel.updateComplete;
    expect(tracks()).toBe('2');
    expect(chip('Always')?.getAttribute('style')).toContain('span 2');
    panel.remove();
  });

  it('lets the house keep Home Assistant’s own Activity page', async () => {
    const { panel, root, row, button, handle, previews, settle } = await mount();
    await handle.store.saveHouse({ scope: 'everywhere' });
    panel.tab = 'scope';
    await panel.updateComplete;
    const activity = row('Our Activity view');
    expect(activity?.querySelector('.fv-switch')?.getAttribute('aria-checked')).toBe('true');
    activity?.querySelector<HTMLElement>('.fv-hit')?.click();
    await settle();
    expect(previews.at(-1)).toEqual({ activity: false });
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe(
      'Our Activity view · Off',
    );
    button('Save')!.click();
    await settle();
    expect(handle.settings().activity).toBe(false);
    panel.remove();
  });

  it('shows a language on the panel before it is saved, and discards it back', async () => {
    const { panel, root, pick, button, written, previews, settle } = await mount();
    panel.tab = 'preferences';
    await panel.updateComplete;
    const shown = () =>
      root
        .querySelector('fluvy-select')
        ?.shadowRoot?.querySelector('.fv-select__value')
        ?.textContent?.trim();
    expect(shown()).toBe('Automatic');
    await pick('Español');
    await settle();
    expect(written).toEqual([]);
    expect(previews.at(-1)).toEqual({ language: 'es' });
    // the panel speaks the chosen language as soon as its words arrive (a chunk of their own)
    expect(shown()).toBe('Español');
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toMatch(
      /^(Language|Idioma) · Español$/,
    );
    (button('Descartar') ?? button('Discard'))!.click();
    await settle();
    expect(previews.at(-1)).toBeNull();
    expect(shown()).toBe('Automatic');
    panel.remove();
  });

  it('sizes this device from Preferences: the chips, the bar’s line, saved to the device and shown at once', async () => {
    localStorage.removeItem('fluvy:device');
    document.documentElement.style.removeProperty('--fluvy-zoom');
    const { panel, root, chip, button, written, settle } = await mount(false); // everyone's, not an administrator's
    panel.tab = 'preferences';
    await settle();
    const sizes = () =>
      [...root.querySelectorAll<HTMLElement>('.fv-chip')]
        .filter((c) => /%/.test(c.textContent ?? ''))
        .map((c) => `${c.textContent?.trim()}${c.classList.contains('is-active') ? '*' : ''}`);
    expect(sizes()).toEqual(['90 %', '100 %*', '110 %', '125 %', '150 %']);
    chip('125 %')!.click();
    await settle();
    expect(sizes()).toContain('125 %*');
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe('Size · 125 %');
    // nothing is saved or applied before the bar says so
    expect(localStorage.getItem('fluvy:device')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--fluvy-zoom')).toBe('');
    chip('100 %')!.click();
    await new Promise((resolve) => setTimeout(resolve, 200)); // the bar leaves in 160
    await settle();
    expect(root.querySelector('.pn-bar')).toBeNull(); // back to what is saved: no edit
    chip('125 %')!.click();
    await settle();
    button('Save')!.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await settle();
    // the device's own memory, nothing of the house's or the person's; the view's size is on the page already
    expect(written).toEqual([]);
    expect(JSON.parse(localStorage.getItem('fluvy:device') ?? '{}')).toMatchObject({ zoom: 125 });
    expect(document.documentElement.style.getPropertyValue('--fluvy-zoom')).toBe('1.25');
    expect(root.querySelector('.pn-bar')).toBeNull();
    expect(sizes()).toContain('125 %*');
    panel.remove();
    // the Wall tab's device card offers the same choice, remembered
    const again = await mount();
    again.panel.tab = 'wall';
    await again.settle();
    expect(
      [...again.root.querySelectorAll<HTMLElement>('.fv-chip.is-active')].some(
        (c) => c.textContent?.trim() === '125 %',
      ),
    ).toBe(true);
    again.panel.remove();
    localStorage.removeItem('fluvy:device');
    document.documentElement.style.removeProperty('--fluvy-zoom');
  });

  it('says why only on dashboards cannot hold while the profile wears the Fluvy theme', async () => {
    const { panel, root, settle } = await mount(true, {
      selectedTheme: { theme: 'Fluvy' },
      themes: { darkMode: false, theme: 'Fluvy', default_theme: 'default', themes: {} },
    });
    panel.tab = 'scope';
    await settle();
    expect(root.querySelector('.pn-status')?.textContent).toContain(
      'Your profile uses the Fluvy theme',
    );
    const asked: unknown[] = [];
    panel.addEventListener('settheme', (event) => asked.push((event as CustomEvent).detail));
    root.querySelector<HTMLButtonElement>('.pn-status .fv-btn')!.click();
    expect(asked).toEqual([{ theme: '' }]);
    panel.remove();
  });

  it('says a theme of their own keeps Home Assistant, and offers the Fluvy theme', async () => {
    const { panel, root, handle, settle } = await mount(true, {
      selectedTheme: { theme: 'default' },
      themes: { darkMode: false, theme: 'default', default_theme: 'default', themes: {} },
    });
    await handle.store.saveHouse({ scope: 'everywhere' });
    panel.tab = 'scope';
    await settle();
    expect(root.querySelector('.pn-status')?.textContent).toContain('Your theme is Home Assistant');
    const asked: unknown[] = [];
    panel.addEventListener('settheme', (event) => asked.push((event as CustomEvent).detail));
    root.querySelector<HTMLButtonElement>('.pn-status .fv-btn')!.click();
    expect(asked).toEqual([{ theme: 'Fluvy' }]);
    panel.remove();
  });

  it('offers the accents of the style chosen, and keeps a listed one’s place when the style changes', async () => {
    const { panel, root, settle } = await mount();
    (panel as unknown as { draft: unknown }).draft = {
      palette: { character: 'vivid', base: 'cool', accent: '#ff4a1a', fill: 'tint' },
      shape: 'soft',
      pills: 'round',
    };
    await settle();
    const dots = () =>
      [...root.querySelectorAll<HTMLElement>('.pn-card .pn-dots')][0]!.querySelectorAll('.pn-dot');
    expect(dots()[2]?.getAttribute('aria-label')).toBe('#ff4a1a');
    expect(dots()[2]?.getAttribute('aria-pressed')).toBe('true');
    [...root.querySelectorAll<HTMLElement>('.fv-chip')]
      .find((c) => c.textContent?.trim() === 'Pastel')!
      .click();
    await settle();
    expect(dots()[2]?.getAttribute('aria-label')).toBe('#f9c09e');
    expect(dots()[2]?.getAttribute('aria-pressed')).toBe('true');
    panel.remove();
  });

  it('saves the buttons’ roundness with the look', async () => {
    const { panel, root, button, handle, settle } = await mount();
    [...root.querySelectorAll<HTMLElement>('.fv-option')]
      .find((o) => o.textContent?.includes('Crisp') && o.textContent.includes('6'))!
      .click();
    await settle();
    expect(root.querySelector('.pn-bar__text')?.textContent?.trim()).toBe('Pill → Crisp');
    button('Apply to the house')!.click();
    await settle();
    expect(handle.settings().look.pills).toBe('crisp');
    panel.remove();
  });

  it('resets the house only on a second tap, and says so after the first', async () => {
    const { panel, row, written } = await mount();
    panel.tab = 'preferences';
    await panel.updateComplete;
    row('House settings')!.click();
    await panel.updateComplete;
    expect(row('Tap again')).toBeDefined();
    expect(written).toEqual([]);
    row('Tap again')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(written.at(-1)?.type).toBe('frontend/set_system_data');
    panel.remove();
  });

  it('exports every setting and the automatic dashboard’s options, and imports them back', async () => {
    const saved: { type: string; url_path?: string; config?: unknown }[] = [];
    const strategy = { type: 'custom:fluvy-home', thermostat_variant: 'ruler', hide: ['media'] };
    const { panel, handle, settle } = await mount(true, {
      callWS: async (message: { type: string; url_path?: string | null; config?: unknown }) => {
        if (message.type === 'lovelace/config/save') saved.push(message as never);
        return message.type === 'lovelace/config' && message.url_path === 'fluvy-auto'
          ? { strategy }
          : { views: [] };
      },
    });
    await handle.store.saveHouse({ palette: 'volt', shape: 'round', pills: 'soft', frame: false });
    await handle.store.savePersonal({ language: 'es', haptics: false });
    await settle();
    // the file the browser would download
    let file: Blob | undefined;
    const create = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => ((file = blob), 'blob:fluvy');
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => undefined;
    const ops = panel as unknown as { context(): PanelContext };
    exportSettings(panel as unknown as FluvyPanel, ops.context());
    URL.createObjectURL = create;
    HTMLAnchorElement.prototype.click = click;
    const exported = JSON.parse(await file!.text()) as Record<string, Record<string, unknown>>;
    expect(exported['fluvy']).toBe(1);
    expect(exported['house']).toMatchObject({
      palette: 'volt',
      shape: 'round',
      pills: 'soft',
      frame: false,
    });
    expect(exported['personal']).toMatchObject({ language: 'es', haptics: false });
    expect(exported['dashboards']).toEqual({
      'fluvy-auto': { thermostat_variant: 'ruler', hide: ['media'] },
    });
    // another house, reset; the file brings it all back
    await handle.store.saveHouse({ palette: 'linen', shape: 'soft', pills: 'round', frame: true });
    await handle.store.savePersonal({ language: 'auto', haptics: true });
    importSettings(
      panel as unknown as FluvyPanel,
      new File([JSON.stringify(exported)], 'fluvy-settings.json'),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handle.settings().look).toEqual({
      palette: 'volt',
      shape: 'round',
      pills: 'soft',
      tabs: TABS_DEFAULTS,
      chrome: CHROME_DEFAULTS,
    });
    expect(handle.settings().frame).toBe(false);
    expect(handle.settings().language).toBe('es');
    expect(saved.at(-1)?.config).toEqual({
      strategy: { type: 'custom:fluvy-home', thermostat_variant: 'ruler', hide: ['media'] },
    });
    // a 1.2 file names only the home dashboard's options: they land on it too
    importSettings(
      panel as unknown as FluvyPanel,
      new File(
        [JSON.stringify({ fluvy: 1, dashboard: { tile_size: 'compact', flow_style: 'legs' } })],
        'fluvy-settings.json',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saved.at(-1)?.config).toEqual({
      strategy: { type: 'custom:fluvy-home', tile_size: 'compact', flow_style: 'legs' },
    });
    panel.remove();
  });

  it('attaches to the look when it starts after the panel is made (Home Assistant makes it first)', async () => {
    await import('./define.js');
    const f = fixture();
    const panel = document.createElement('fluvy-panel') as HTMLElement & {
      hass: HomeAssistant;
      handle: LookHandle;
      updateComplete: Promise<boolean>;
    };
    document.body.append(panel);
    await panel.updateComplete;
    expect(panel.shadowRoot!.querySelector('.pn-card')).toBeNull();
    panel.handle = f.handle;
    panel.hass = f.hass;
    await panel.updateComplete;
    expect(panel.shadowRoot!.querySelector('.pn-card')).not.toBeNull();
    panel.remove();
  });

  it('ends a look tried on the whole app when the panel closes', async () => {
    const { panel, root, previews } = await mount();
    // the preview's switch: "Try it on the whole app"
    const toggle = root.querySelector<HTMLElement>(
      '.pn-card--preview :is(.fv-switch, [role="switch"])',
    );
    toggle?.click();
    await panel.updateComplete;
    expect(previews.at(-1)).toEqual({
      look: {
        palette: 'linen',
        shape: 'soft',
        pills: 'round',
        tabs: TABS_DEFAULTS,
        chrome: CHROME_DEFAULTS,
      },
    });
    panel.remove();
    expect(previews.at(-1)).toBeNull();
  });
});
