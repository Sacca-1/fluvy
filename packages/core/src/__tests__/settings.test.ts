import { describe, expect, it } from 'vitest';
import {
  HOUSE_DEFAULTS,
  MAX_SAVED_PALETTES,
  parseHouse,
  parsePalette,
  parsePersonal,
  parseSavedPalettes,
  parseWall,
  PERSONAL_DEFAULTS,
  resolveSettings,
  SettingsStore,
  pageScope,
  WALL_DEFAULTS,
  wearsLook,
  type SettingsHass,
} from '../settings/index.js';
import { CHROME_DEFAULTS, TABS_DEFAULTS } from '../look/tabs.js';

describe('parsing stored settings', () => {
  it('falls back to the defaults for anything missing, broken or unknown', () => {
    expect(parseHouse(undefined)).toEqual(HOUSE_DEFAULTS);
    expect(parseHouse('nonsense')).toEqual(HOUSE_DEFAULTS);
    expect(
      parseHouse({
        palette: 'tartan',
        shape: 'blob',
        scope: 'moon',
        dashboards: 'x',
        frame: 1,
        icons: 'yes',
        activity: 'no',
        tabs: 'pills',
      }),
    ).toEqual(HOUSE_DEFAULTS);
    // tabs read field by field: an unknown style or content takes the default, the rest is kept
    expect(parseHouse({ tabs: { style: 'tartan', content: 'both', title: 'no' } }).tabs).toEqual({
      style: 'fluvy',
      content: 'both',
      title: true,
    });
    expect(parsePersonal({ language: 'sv', motion: 'fast', haptics: 'yes' })).toEqual(
      PERSONAL_DEFAULTS,
    );
  });

  it('keeps what is well formed', () => {
    expect(
      parseHouse({
        palette: 'volt',
        shape: 'round',
        pills: 'crisp',
        scope: 'everywhere',
        dashboards: ['fluvy-home', 3],
        frame: false,
        icons: false,
        activity: false,
        history: false,
        tabs: { style: 'pills', content: 'icons', title: false },
        chrome: { logo: true, dividers: false, header: 'page', actions: 'menu' },
        lightTint: 'always',
        lightColors: true,
        statuses: { warning: '#DC630B', danger: 'red' },
        extra: true,
      }),
    ).toEqual({
      version: 2,
      palette: 'volt',
      shape: 'round',
      pills: 'crisp',
      tabs: { style: 'pills', content: 'icons', title: false },
      chrome: { logo: true, dividers: false, header: 'page', actions: 'menu' },
      scope: 'everywhere',
      dashboards: ['fluvy-home'],
      frame: false,
      icons: false,
      activity: false,
      history: false,
      palettes: [],
      wall: WALL_DEFAULTS,
      lightTint: 'always',
      lightColors: true,
      statuses: { warning: '#dc630b' },
    });
  });

  it('reads the house’s status colours, each broken one as the palette’s (1.9: nothing changes on upgrade)', () => {
    expect(parseHouse({}).statuses).toEqual({});
    expect(HOUSE_DEFAULTS.statuses).toEqual({});
    expect(
      parseHouse({
        statuses: { notice: '#1C7ED6', success: 'green', warning: '#dc630b', info: '#000000' },
      }).statuses,
    ).toEqual({ warning: '#dc630b', notice: '#1c7ed6' });
    for (const broken of ['orange', 7, null, ['#dc630b']])
      expect(parseHouse({ statuses: broken }).statuses).toEqual({});
    // the house's, over a person's own palette too
    const own = parsePersonal({ palette: 'volt' });
    expect(resolveSettings(parseHouse({ statuses: { warning: '#dc630b' } }), own).statuses).toEqual(
      {
        warning: '#dc630b',
      },
    );
  });

  it('reads the lights’ defaults, each broken one as off (1.9: nothing changes on upgrade)', () => {
    expect(parseHouse({}).lightTint).toBe('off');
    expect(parseHouse({}).lightColors).toBe(false);
    const broken = parseHouse({ lightTint: 'bright', lightColors: 'yes' });
    expect([broken.lightTint, broken.lightColors]).toEqual(['off', false]);
    expect(resolveSettings(parseHouse({ lightTint: 'on' }), PERSONAL_DEFAULTS).lightTint).toBe(
      'on',
    );
  });

  it('reads the wall settings field by field, each broken one as its default', () => {
    expect(parseWall(undefined)).toEqual(WALL_DEFAULTS);
    expect(
      parseWall({
        dashboards: ['fluvy-wall', 7],
        after: 5,
        clock: false,
        dim: true,
        wakeEntity: 'binary_sensor.hall_motion',
        theme: 'hours',
        from: '23:30',
        to: '06:15',
        nightDim: 40,
        background: 'wall',
        exit: 'hold',
        subview: 'header',
      }),
    ).toEqual({
      dashboards: ['fluvy-wall'],
      after: 5,
      clock: false,
      dim: true,
      wakeEntity: 'binary_sensor.hall_motion',
      theme: 'hours',
      from: '23:30',
      to: '06:15',
      nightDim: 40,
      background: 'wall',
      exit: 'hold',
      subview: 'header',
    });
    expect(
      parseWall({
        after: 7,
        wakeEntity: 'light.hall',
        theme: 'night',
        from: '25:00',
        to: '7:00',
        nightDim: 50,
        background: 'photo',
        exit: 'door',
        subview: 'tabs',
      }),
    ).toEqual(WALL_DEFAULTS);
    // a wall saved before the way out could be chosen has the button
    expect(parseWall({ after: 5 }).exit).toBe('button');
  });

  it('keeps the well-formed saved palettes, the first of each name, twelve at most', () => {
    const file = (name: string) => ({
      fluvy_palette: 1,
      name,
      title: name,
      palette: { character: 'soft', base: 'warm', accent: '#4f7a4a' },
    });
    expect(parseSavedPalettes(undefined)).toEqual([]);
    const kept = parseSavedPalettes([file('moss'), { name: 'broken' }, file('moss'), file('plum')]);
    expect(kept.map((entry) => entry.name)).toEqual(['moss', 'plum']);
    const many = parseSavedPalettes(Array.from({ length: 14 }, (_, i) => file(`p${i}`)));
    expect(many).toHaveLength(MAX_SAVED_PALETTES);
  });

  it('accepts a custom palette only whole, and drops what its character does not use', () => {
    expect(
      parsePalette({ character: 'vivid', base: 'cool', accent: '#FF4A1A', fill: 'solid' }),
    ).toEqual({
      character: 'vivid',
      base: 'cool',
      accent: '#ff4a1a',
      fill: 'solid',
    });
    expect(
      parsePalette({
        character: 'soft',
        base: 'warm',
        accent: '#123456',
        fill: 'solid',
        highlight: '#e2ff3d',
      }),
    ).toEqual({ character: 'soft', base: 'warm', accent: '#123456' });
    expect(parsePalette({ character: 'vivid', base: 'cool', accent: 'red' })).toBeUndefined();
    expect(parsePalette({ character: 'loud', base: 'cool', accent: '#ff0000' })).toBeUndefined();
  });
});

describe('resolving the two layers', () => {
  it("takes the house's look unless the person chose their own, as a whole", () => {
    const house = parseHouse({
      palette: 'volt',
      shape: 'round',
      pills: 'soft',
      scope: 'everywhere',
    });
    expect(resolveSettings(house, PERSONAL_DEFAULTS).look).toEqual({
      palette: 'volt',
      shape: 'round',
      pills: 'soft',
      tabs: TABS_DEFAULTS,
      chrome: CHROME_DEFAULTS,
    });
    const own = resolveSettings(house, parsePersonal({ palette: 'blaze' }));
    expect(own.look).toEqual({
      palette: 'blaze',
      shape: 'round',
      pills: 'soft',
      tabs: TABS_DEFAULTS,
      chrome: CHROME_DEFAULTS,
    });
    // a person's tabs count only with their own look, as their shape and pills do
    const tabs = { style: 'hidden', content: 'names', title: true } as const;
    expect(resolveSettings(house, parsePersonal({ tabs })).look.tabs).toEqual(TABS_DEFAULTS);
    expect(resolveSettings(house, parsePersonal({ palette: 'blaze', tabs })).look.tabs).toEqual(
      tabs,
    );
    expect(
      resolveSettings(house, parsePersonal({ palette: 'blaze', pills: 'crisp' })).look.pills,
    ).toBe('crisp');
    expect(own.personalLook).toBe(true);
    expect(
      resolveSettings(house, parsePersonal({ palette: 'blaze', shape: 'crisp' })).look.shape,
    ).toBe('crisp');
  });

  it('keeps everywhere only while Home Assistant wears the Fluvy theme', () => {
    expect(pageScope('everywhere', 'Fluvy')).toBe('everywhere');
    // another theme in the profile (Home Assistant's own, or any other): its pages are its, Fluvy's dashboards stay
    expect(pageScope('everywhere', 'default')).toBe('dashboards');
    expect(pageScope('everywhere', 'Minimalist')).toBe('dashboards');
    // before Home Assistant says (the first paint) the setting holds
    expect(pageScope('everywhere', undefined)).toBe('everywhere');
    expect(pageScope('dashboards', 'Fluvy')).toBe('dashboards');
  });

  it('puts the look on the chosen dashboards, or every fluvy one when none is chosen', () => {
    expect(wearsLook({ dashboards: [] }, 'fluvy-home')).toBe(true);
    expect(wearsLook({ dashboards: [] }, 'dashboard-garden')).toBe(false);
    expect(wearsLook({ dashboards: ['dashboard-garden'] }, 'dashboard-garden')).toBe(true);
    expect(wearsLook({ dashboards: ['dashboard-garden'] }, 'fluvy-home')).toBe(false);
    expect(wearsLook({ dashboards: [] }, undefined)).toBe(false);
  });
});

describe('the settings store', () => {
  function fakeHass() {
    const listeners = new Map<string, (message: { value: unknown }) => void>();
    const sent: { type: string; key?: unknown; value?: unknown }[] = [];
    const hass = {
      connection: {
        subscribeMessage: <T>(callback: (message: T) => void, message: { type: string }) => {
          listeners.set(message.type, callback as (message: { value: unknown }) => void);
          return Promise.resolve(() => listeners.delete(message.type));
        },
      },
      callWS: <T>(message: { type: string; key?: unknown; value?: unknown }) => {
        sent.push(message);
        return Promise.resolve(undefined as T);
      },
    } as unknown as SettingsHass;
    return { hass, listeners, sent };
  }

  it('hands over the resolved settings on each answer and change, and caches them', () => {
    const { hass, listeners } = fakeHass();
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    } as Storage;
    const store = new SettingsStore(() => hass, storage);
    const seen: string[] = [];
    store.start((settings) => seen.push(`${String(settings.look.palette)}/${settings.scope}`));
    listeners.get('frontend/subscribe_system_data')?.({
      value: { palette: 'volt', scope: 'everywhere' },
    });
    listeners.get('frontend/subscribe_user_data')?.({ value: null });
    listeners.get('frontend/subscribe_user_data')?.({ value: { palette: 'noir' } });
    expect(seen).toEqual(['volt/everywhere', 'volt/everywhere', 'noir/everywhere']);
    expect(JSON.parse(stored.get('fluvy:settings') ?? '{}').house.palette).toBe('volt');
  });

  it("writes the house's settings whole and parsed, and a person's without the fields they cleared", async () => {
    const { hass, listeners, sent } = fakeHass();
    const store = new SettingsStore(() => hass, undefined);
    store.start(() => undefined);
    await store.saveHouse({ palette: 'blaze', shape: 'round' });
    expect(sent[0]).toEqual({
      type: 'frontend/set_system_data',
      key: 'fluvy',
      value: { ...HOUSE_DEFAULTS, palette: 'blaze', shape: 'round' },
    });
    listeners.get('frontend/subscribe_user_data')?.({ value: { palette: 'volt', language: 'es' } });
    await store.savePersonal({ palette: undefined });
    expect(sent[1]).toEqual({
      type: 'frontend/set_user_data',
      key: 'fluvy',
      value: { ...PERSONAL_DEFAULTS, language: 'es' },
    });
  });

  it('keeps a field of a newer version through a save, and parses what it knows', async () => {
    const { hass, listeners, sent } = fakeHass();
    const store = new SettingsStore(() => hass, undefined);
    store.start(() => undefined);
    listeners.get('frontend/subscribe_system_data')?.({
      value: { version: 3, palette: 'volt', rooms: { order: ['kitchen'] }, wall: { after: 5 } },
    });
    await store.saveHouse({ shape: 'round' });
    expect(sent[0]?.value).toEqual({
      ...HOUSE_DEFAULTS,
      palette: 'volt',
      shape: 'round',
      wall: { ...WALL_DEFAULTS, after: 5 },
      rooms: { order: ['kitchen'] },
    });
  });
});
