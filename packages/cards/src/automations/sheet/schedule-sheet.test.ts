// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE_ID, type Schedule } from '../schedule.js';
import { heldValue, pairWidth } from './fit.js';
import {
  FluvyScheduleSheet,
  type DetailsRequest,
  type ScheduleRequest,
  type SheetRequest,
} from './schedule-sheet.js';

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

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  states: {
    'light.kitchen': entity('light.kitchen', 'on', { friendly_name: 'Kitchen lamp' }),
    'light.hall': entity('light.hall', 'off', { friendly_name: 'Hall light' }),
    'cover.living': entity('cover.living', 'open', { friendly_name: 'Blinds' }),
    'climate.living': entity('climate.living', 'heat', { friendly_name: 'Thermostat' }),
    'scene.movie': entity('scene.movie', '2026-09-16T20:30:00+00:00', { friendly_name: 'Movie' }),
    'switch.fountain': entity('switch.fountain', 'unavailable', { friendly_name: 'Fountain' }),
    ...Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => [
        `light.desk_${n}`,
        entity(`light.desk_${n}`, 'off', { friendly_name: `Desk ${n.toUpperCase()}` }),
      ]),
    ),
    'automation.good_morning': entity('automation.good_morning', 'on', {
      friendly_name: 'Good morning',
      last_triggered: '2026-09-17T06:45:00+02:00',
    }),
    'automation.leak': entity('automation.leak', 'on', {
      friendly_name: 'Leak alert',
      last_triggered: null,
    }),
  },
  entities: {
    'light.kitchen': { entity_id: 'light.kitchen', area_id: 'kitchen' },
    'light.hall': { entity_id: 'light.hall', area_id: 'hall' },
  },
  devices: {},
  areas: {
    kitchen: { area_id: 'kitchen', name: 'Kitchen' },
    hall: { area_id: 'hall', name: 'Hall' },
  },
  config: { unit_system: { temperature: '°C', length: 'km' } },
  user: { id: 'u1', name: 'Marta', is_admin: true },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
} as unknown as HomeAssistant;

const EXISTING: Schedule = {
  id: 'fluvy_a1b2c3d4e5f6',
  alias: 'Good morning',
  targets: ['light.kitchen'],
  days: { kind: 'workdays', sensor: 'binary_sensor.workday_sensor' },
  start: { kind: 'time', at: '06:45' },
  end: { kind: 'time', at: '08:00' },
  then: { verb: 'on', level: 70 },
};

type Sheet = FluvyScheduleSheet & { updateComplete: Promise<boolean> };

/** The sheet docked (no dialog), opened on a request; the opening guard already past. */
async function open(request: SheetRequest, docked = true): Promise<Sheet> {
  const sheet = document.createElement('fluvy-schedule-sheet') as Sheet;
  sheet.docked = docked;
  sheet.hass = hass;
  document.body.append(sheet);
  sheet.open(request);
  await sheet.updateComplete;
  (sheet as unknown as { openedAt: number }).openedAt = -1000; // a tap now is a decision, not the opening tap's tail
  return sheet;
}

const request = (extra: Partial<ScheduleRequest> = {}): ScheduleRequest => ({
  domains: ['light', 'cover', 'climate'],
  timeStep: 5,
  save: vi.fn(async () => undefined),
  ...extra,
});

const root = (sheet: Sheet): ShadowRoot => sheet.shadowRoot!;
const save = (sheet: Sheet): HTMLButtonElement =>
  root(sheet).querySelector<HTMLButtonElement>('.ss-footer .fv-btn--accent')!;
const candidate = (sheet: Sheet, name: string): HTMLElement | undefined =>
  [...root(sheet).querySelectorAll<HTMLElement>('.ss-candidates .fv-row')].find((row) =>
    row.textContent?.includes(name),
  );
const tile = (sheet: Sheet, section: string, label: string): HTMLElement | undefined =>
  [...root(sheet).querySelectorAll<HTMLElement>(`.${section} .fv-option`)].find((el) =>
    el.querySelector('.fv-option__label')?.textContent?.includes(label),
  );
const fieldRow = (sheet: Sheet, title: string): HTMLElement | undefined =>
  [...root(sheet).querySelectorAll<HTMLElement>('.in-field')].find((el) =>
    el.querySelector('.fv-row__title')?.textContent?.includes(title),
  );

describe('what the sheet fits by measure', () => {
  it('gives the pair the design’s 172 where the row holds two, the row’s equal share where it holds the label, else stacks', () => {
    expect(pairWidth(82, 360)).toEqual({ pair: 172, stacked: false }); // a 392 sheet: 360 of content
    expect(pairWidth(82, 272)).toEqual({ pair: 128, stacked: false }); // a 304 host: the equal share
    expect(pairWidth(100, 228)).toEqual({ pair: 104, stacked: false }); // "Abbrechen" on a phone at 150 %
    expect(pairWidth(106, 228)).toEqual({ pair: 108, stacked: true }); // a label past the share: stacked
    expect(pairWidth(106, 200)).toEqual({ pair: 108, stacked: true }); // too narrow for two of them
    expect(pairWidth(200, 360)).toEqual({ pair: 200, stacked: true }); // a label wider than the share
    expect(pairWidth(82, 0)).toEqual({ pair: 84, stacked: true }); // not laid out yet: fitted again
  });

  it('keeps a tile’s value where it holds, takes the shorter word where that holds, else drops it', () => {
    const under = (max: number) => (text: string) => text.length <= max;
    expect(heldValue('Workday sensor', 'Sensor', under(20))).toBe('Workday sensor');
    expect(heldValue('Workday sensor', 'Sensor', under(8))).toBe('Sensor');
    expect(heldValue('Workday sensor', 'Sensor', under(4))).toBe('');
    expect(heldValue('Mon–Fri', '', under(4))).toBe('');
  });
});

describe('the schedule sheet', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('keeps Save disabled until the schedule is whole: a target, then a verb', async () => {
    const sheet = await open(request());
    expect(save(sheet).disabled).toBe(true);
    // the candidates: the house's lights, cover and thermostat, grouped by area, Kitchen first
    const groups = [...root(sheet).querySelectorAll('.ss-group')].map((el) =>
      el.textContent?.trim(),
    );
    expect(groups).toEqual(['Hall', 'Kitchen', 'No area']);
    candidate(sheet, 'Kitchen lamp')?.click();
    await sheet.updateComplete;
    expect(save(sheet).disabled).toBe(true);
    expect(root(sheet).querySelector('.ss-chosen')?.textContent).toContain('Kitchen lamp');
    expect(candidate(sheet, 'Kitchen lamp')).toBeUndefined(); // chosen: no longer a candidate
    tile(sheet, 'ss-do', 'Turn on')?.click();
    await sheet.updateComplete;
    expect(save(sheet).disabled).toBe(false);
  });

  it('narrows the candidates as the words are typed, and says how many more there are', async () => {
    const sheet = await open(request());
    const input = root(sheet).querySelector<HTMLInputElement>('.ss-search input')!;
    input.value = 'hall';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sheet.updateComplete;
    const names = [...root(sheet).querySelectorAll('.ss-candidates .fv-row__title')].map((el) =>
      el.textContent?.trim(),
    );
    expect(names).toEqual(['Hall light']);
    expect(root(sheet).querySelector('.ss-more')).toBeNull();
  });

  it('offers a brightness row for a light turned on, stepping in fives from "As it is"', async () => {
    const sheet = await open(request());
    candidate(sheet, 'Kitchen lamp')?.click();
    await sheet.updateComplete;
    expect(fieldRow(sheet, 'Brightness')).toBeUndefined();
    tile(sheet, 'ss-do', 'Turn on')?.click();
    await sheet.updateComplete;
    const row = fieldRow(sheet, 'Brightness')!;
    expect(row.querySelector('.fv-row__sub')?.textContent).toBe('As it is');
    row
      .querySelectorAll<HTMLButtonElement>('.fv-stepper__half')[1]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await sheet.updateComplete;
    expect(fieldRow(sheet, 'Brightness')?.querySelector('.fv-row__sub')?.textContent).toBe('5 %');
    expect(tile(sheet, 'ss-do', 'Turn on')?.querySelector('.fv-option__value')?.textContent).toBe(
      '5 %',
    );
    // a cover shares no verb with a light: it is no longer offered, so the Do tiles are never none
    expect(candidate(sheet, 'Blinds')).toBeUndefined();
    expect(candidate(sheet, 'Hall light')).toBeDefined();
  });

  it('tells the Workdays tile by the house: the sensor, or Monday to Friday', async () => {
    const withSensor = await open(request({ workday: 'binary_sensor.workday_sensor' }));
    expect(
      tile(withSensor, 'ss-when', 'Workdays')?.querySelector('.fv-option__value')?.textContent,
    ).toBe('Workday sensor');
    const without = await open(request());
    expect(
      tile(without, 'ss-when', 'Workdays')?.querySelector('.fv-option__value')?.textContent,
    ).toBe('Mon–Fri');
  });

  it('shows the seven days as chips under Custom, toggling each', async () => {
    const sheet = await open(request());
    tile(sheet, 'ss-when', 'Custom')?.click();
    await sheet.updateComplete;
    const chips = root(sheet).querySelectorAll<HTMLButtonElement>('.ss-days .fv-chip');
    expect(chips.length).toBe(7);
    expect([...chips].filter((chip) => chip.getAttribute('aria-pressed') === 'true').length).toBe(
      5,
    );
    // an English week starts on Sunday: the chips follow the house, each named in full for a reader
    expect(chips[0]?.getAttribute('aria-label')).toBe('Sunday');
    [...chips].find((chip) => chip.getAttribute('aria-label') === 'Monday')?.click();
    await sheet.updateComplete;
    expect([...root(sheet).querySelectorAll('.ss-days .fv-chip[aria-pressed="true"]')].length).toBe(
      4,
    );
    expect(tile(sheet, 'ss-when', 'Custom')?.querySelector('.fv-option__value')?.textContent).toBe(
      'Tue–Fri',
    );
  });

  it('hands Save the schedule, with a fresh id, the name it suggests and the window asked for', async () => {
    const req = request();
    const sheet = await open(req);
    candidate(sheet, 'Kitchen lamp')?.click();
    await sheet.updateComplete;
    tile(sheet, 'ss-do', 'Turn on')?.click();
    await sheet.updateComplete;
    const until = fieldRow(sheet, 'Until')!;
    until.querySelector<HTMLElement>('.fv-hit')?.click();
    await sheet.updateComplete;
    expect(root(sheet).querySelector('.ss-end')).not.toBeNull();
    // the Until row is the end's label: no second "Until" over its quick ends
    expect(root(sheet).querySelector('.ss-end > .fv-label')).toBeNull();
    expect(root(sheet).querySelector('.ss-after')).not.toBeNull();
    save(sheet).click();
    await sheet.updateComplete;
    expect(req.save).toHaveBeenCalledTimes(1);
    const handed = (req.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Schedule;
    expect(handed.id).toMatch(SCHEDULE_ID);
    expect(handed.targets).toEqual(['light.kitchen']);
    expect(handed.then).toEqual({ verb: 'on' });
    expect(handed.days).toEqual({ kind: 'every' });
    expect(handed.start.kind).toBe('time');
    expect(handed.end?.kind).toBe('time');
    expect(handed.after).toBeUndefined();
    expect(handed.alias).toMatch(/^Kitchen lamp · Every day \d\d:\d\d–\d\d:\d\d$/);
    // a docked sheet stays (the playground's frame); the save done, it is no longer busy
    await new Promise((resolve) => setTimeout(resolve, 0));
    await sheet.updateComplete;
    expect((sheet as unknown as { busy_: boolean }).busy_).toBe(false);
  });

  it('opens an existing schedule as it is, and writes the name typed over the suggestion', async () => {
    const req = request({ schedule: EXISTING, remove: vi.fn(async () => undefined) });
    const sheet = await open(req);
    expect(root(sheet).querySelector('.fv-sheet__title')?.textContent?.trim()).toBe('Schedule');
    expect(tile(sheet, 'ss-do', 'Turn on')?.getAttribute('aria-pressed')).toBe('true');
    expect(tile(sheet, 'ss-when', 'Workdays')?.getAttribute('aria-pressed')).toBe('true');
    expect(fieldRow(sheet, 'Brightness')?.querySelector('.fv-row__sub')?.textContent).toBe('70 %');
    const name = root(sheet).querySelector<HTMLInputElement>('input[data-field="alias"]')!;
    expect(name.value).toBe('Good morning');
    name.value = 'Morning lamp';
    name.dispatchEvent(new FocusEvent('blur'));
    await sheet.updateComplete;
    save(sheet).click();
    await sheet.updateComplete;
    const handed = (req.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Schedule;
    expect(handed.id).toBe(EXISTING.id);
    expect(handed.alias).toBe('Morning lamp');
    expect(handed.then).toEqual({ verb: 'on', level: 70 });
    expect(handed.days).toEqual(EXISTING.days);
  });

  it('arms Delete on the first tap and deletes on the second', async () => {
    vi.useFakeTimers();
    const remove = vi.fn(async () => undefined);
    const sheet = await open(request({ schedule: EXISTING, remove }));
    const link = root(sheet).querySelector<HTMLButtonElement>('.ss-delete')!;
    expect(link.textContent?.trim()).toBe('Delete');
    link.click();
    await sheet.updateComplete;
    expect(remove).not.toHaveBeenCalled();
    expect(root(sheet).querySelector('.ss-delete')?.textContent?.trim()).toBe(
      'Tap again to delete',
    );
    // four seconds of nothing and it forgets the first tap
    vi.advanceTimersByTime(4100);
    await sheet.updateComplete;
    expect(root(sheet).querySelector('.ss-delete')?.textContent?.trim()).toBe('Delete');
    root(sheet).querySelector<HTMLButtonElement>('.ss-delete')?.click();
    await sheet.updateComplete;
    root(sheet).querySelector<HTMLButtonElement>('.ss-delete')?.click();
    await sheet.updateComplete;
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stays open and says why when Home Assistant refuses the save', async () => {
    const req = request({
      schedule: EXISTING,
      save: vi.fn(async () => {
        throw {
          error: 'Response error: 400',
          status_code: 400,
          body: { message: 'Message malformed: nonsense' },
        };
      }),
    });
    const sheet = await open(req);
    save(sheet).click();
    for (let i = 0; i < 4; i++) await sheet.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await sheet.updateComplete;
    expect(sheet.isOpen).toBe(true);
    expect(root(sheet).querySelector('.ss-error')?.textContent).toBe('Message malformed: nonsense');
    expect(save(sheet).disabled).toBe(false);
  });

  it('closes on Escape and hands the focus back to what opened it', async () => {
    vi.useFakeTimers();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const sheet = document.createElement('fluvy-schedule-sheet') as Sheet;
    sheet.hass = hass;
    document.body.append(sheet);
    sheet.open(request({ schedule: EXISTING }), opener);
    await sheet.updateComplete;
    const dialog = root(sheet).querySelector('dialog')!;
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await sheet.updateComplete;
    expect(sheet.isOpen).toBe(false);
    vi.advanceTimersByTime(250);
    await sheet.updateComplete;
    expect(root(sheet).querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('reads the card’s clock: a new schedule starts at its next whole hour, the details say its "ago"', async () => {
    const at = new Date(2026, 8, 17, 21, 47);
    const fresh = await open(request({ now: () => at }));
    expect(fresh.shadowRoot!.querySelector('input[data-field="alias"]')).not.toBeNull();
    expect((fresh as unknown as { draft_: { start: unknown } }).draft_.start).toEqual({
      kind: 'time',
      at: '22:00',
    });
    // nothing chosen yet: the name suggested is the days and the time, no separator before them
    expect(root(fresh).querySelector<HTMLInputElement>('input[data-field="alias"]')?.value).toBe(
      'Every day 22:00',
    );
    const details = await open({
      entity: 'automation.good_morning',
      alias: 'Good morning',
      now: () => at,
      run: vi.fn(),
      toggle: vi.fn(),
    });
    expect(root(details).querySelector('.fv-card__sub')?.textContent).toMatch(
      /^Ran \d\d:\d\d · On$/,
    );
  });

  it('lets the end follow the start until it is set by hand, and remembers the clock across the sun', async () => {
    const sheet = await open(request({ now: () => new Date(2026, 8, 17, 6, 10) }));
    const draft = (): { start: unknown; end: unknown } =>
      (sheet as unknown as { draft_: { start: unknown; end: unknown } }).draft_;
    const chip = (block: string, label: string): HTMLElement | undefined =>
      [...root(sheet).querySelectorAll<HTMLElement>(`.ss-${block} .fv-chip`)].find((el) =>
        el.textContent?.includes(label),
      );
    expect(draft().end).toEqual({ kind: 'time', at: '08:00' });
    // the start's time field moved: the end an hour after it
    root(sheet)
      .querySelector('.ss-start fluvy-time-field')
      ?.dispatchEvent(new CustomEvent('fluvy-time', { detail: { value: 9 * 60 + 30 } }));
    await sheet.updateComplete;
    expect(draft().end).toEqual({ kind: 'time', at: '10:30' });
    // the start by the sun: the end the sun's other event, never "Sunset–10:30"
    chip('start', 'Sunset')?.click();
    await sheet.updateComplete;
    expect(draft().start).toEqual({ kind: 'sun', event: 'sunset', offset: 0 });
    expect(draft().end).toEqual({ kind: 'sun', event: 'sunrise', offset: 0 });
    // back on the clock: the time it had, not 08:00
    chip('start', 'At a time')?.click();
    await sheet.updateComplete;
    expect(draft().start).toEqual({ kind: 'time', at: '09:30' });
    expect(draft().end).toEqual({ kind: 'time', at: '10:30' });
    // the end set by hand stays where it is put
    fieldRow(sheet, 'Until')?.querySelector<HTMLElement>('.fv-hit')?.click();
    await sheet.updateComplete;
    root(sheet)
      .querySelector('.ss-end fluvy-time-field')
      ?.dispatchEvent(new CustomEvent('fluvy-time', { detail: { value: 23 * 60 } }));
    await sheet.updateComplete;
    root(sheet)
      .querySelector('.ss-start fluvy-time-field')
      ?.dispatchEvent(new CustomEvent('fluvy-time', { detail: { value: 7 * 60 } }));
    await sheet.updateComplete;
    expect(draft().end).toEqual({ kind: 'time', at: '23:00' });
  });

  it('ends a window 15 min, 30 min, 1 h or 2 h after its start, and keeps the span while the start moves', async () => {
    const sheet = await open(request({ now: () => new Date(2026, 8, 17, 20, 10) }));
    fieldRow(sheet, 'Until')?.querySelector<HTMLElement>('.fv-hit')?.click();
    await sheet.updateComplete;
    const spans = (): HTMLButtonElement[] => [
      ...root(sheet).querySelectorAll<HTMLButtonElement>('.ss-spans .fv-chip'),
    ];
    expect(spans().map((chip) => chip.textContent?.trim())).toEqual([
      '15 min',
      '30 min',
      '1 h',
      '2 h',
    ]);
    expect(spans().map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
    spans()[3]?.click();
    await sheet.updateComplete;
    expect(fieldRow(sheet, 'Until')?.querySelector('.fv-row__sub')?.textContent).toBe(
      '21:00–23:00',
    );
    // the start moved to 23:00, two hours on: past midnight, the window runs into the next day
    root(sheet)
      .querySelector('.ss-start fluvy-time-field')
      ?.dispatchEvent(new CustomEvent('fluvy-time', { detail: { value: 23 * 60 } }));
    await sheet.updateComplete;
    expect(fieldRow(sheet, 'Until')?.querySelector('.fv-row__sub')?.textContent).toBe(
      '23:00–01:00',
    );
    // a sun start whose offset would pass three hours cannot take the span
    [...root(sheet).querySelectorAll<HTMLElement>('.ss-start .fv-chip')]
      .find((el) => el.textContent?.includes('Sunset'))
      ?.click();
    await sheet.updateComplete;
    for (let i = 0; i < 25; i++)
      root(sheet)
        .querySelectorAll<HTMLButtonElement>('.ss-start .fv-stepper__half')[1]
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await sheet.updateComplete;
    expect(spans().map((chip) => chip.disabled)).toEqual([false, false, true, true]);
  });

  it('sets the Workdays and Custom values in a word’s style, never a figure’s', async () => {
    const sheet = await open(request({ workday: 'binary_sensor.workday_sensor' }));
    expect(
      tile(sheet, 'ss-when', 'Workdays')
        ?.querySelector('.fv-option__value')
        ?.classList.contains('fv-option__value--word'),
    ).toBe(true);
  });

  it('keeps Escape and a touch to itself: a popup that listens on the window or on itself hears neither', async () => {
    // Bubble Card closes its popup on a window's Escape and slides it closed from a touch on itself
    const popup = document.createElement('div');
    const sheet = document.createElement('fluvy-schedule-sheet') as Sheet;
    sheet.hass = hass;
    popup.append(sheet);
    document.body.append(popup);
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    popup.addEventListener('touchstart', heard);
    sheet.open(request({ schedule: EXISTING }));
    await sheet.updateComplete;
    const inside = root(sheet).querySelector<HTMLElement>('.ss-do .fv-option')!;
    inside.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    inside.dispatchEvent(new Event('touchstart', { bubbles: true, composed: true }));
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener('keydown', heard);
  });

  describe('for a card about a few entities (`only`)', () => {
    it('fixes one target as a row, its first verb chosen, so Save works at once', async () => {
      const req = request({ only: [{ id: 'light.kitchen', name: 'Lamp', level: 40 }] });
      const sheet = await open(req);
      expect(root(sheet).querySelector('.ss-search')).toBeNull();
      const row = root(sheet).querySelector<HTMLElement>('.ss-fixed .fv-row')!;
      expect(row.querySelector('.fv-row__title')?.textContent).toBe('Lamp');
      expect(row.querySelector('.fv-row__sub')?.textContent).toBe('Kitchen · On');
      expect(row.getAttribute('role')).toBeNull();
      expect(row.getAttribute('tabindex')).toBeNull();
      expect(tile(sheet, 'ss-do', 'Turn on')?.getAttribute('aria-pressed')).toBe('true');
      expect(fieldRow(sheet, 'Brightness')?.querySelector('.fv-row__sub')?.textContent).toBe(
        '40 %',
      );
      expect(save(sheet).disabled).toBe(false);
      save(sheet).click();
      await sheet.updateComplete;
      const handed = (req.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Schedule;
      expect(handed.targets).toEqual(['light.kitchen']);
      expect(handed.then).toEqual({ verb: 'on', level: 40 });
      expect(handed.alias).toMatch(/^Lamp · Every day \d\d:00$/);
    });

    it('starts on the target’s own verb, else its domain’s first', async () => {
      const off = await open(request({ only: [{ id: 'light.kitchen', verb: 'off', level: 40 }] }));
      expect(tile(off, 'ss-do', 'Turn off')?.getAttribute('aria-pressed')).toBe('true');
      expect(fieldRow(off, 'Brightness')).toBeUndefined();
      const scene = await open(request({ only: [{ id: 'scene.movie' }] }));
      expect(tile(scene, 'ss-do', 'Run')?.getAttribute('aria-pressed')).toBe('true');
      expect(save(scene).disabled).toBe(false);
    });

    it('focuses the verb chosen when it opens as a dialog', async () => {
      const sheet = await open(request({ only: [{ id: 'light.kitchen' }] }), false);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      expect(root(sheet).activeElement?.textContent).toContain('Turn on');
    });

    it('shows two to six as chips that press where they stand, one sharing no verb disabled', async () => {
      const sheet = await open(
        request({
          only: [
            { id: 'light.kitchen' },
            { id: 'cover.living' },
            { id: 'light.hall', name: 'Hall' },
          ],
        }),
      );
      const chips = (): HTMLButtonElement[] => [
        ...root(sheet).querySelectorAll<HTMLButtonElement>('.ss-targets .fv-chip'),
      ];
      expect(root(sheet).querySelector('.ss-search')).toBeNull();
      expect(chips().map((chip) => chip.textContent?.trim())).toEqual([
        'Kitchen lamp',
        'Blinds',
        'Hall',
      ]);
      expect(save(sheet).disabled).toBe(true);
      chips()[2]?.click();
      await sheet.updateComplete;
      chips()[0]?.click();
      await sheet.updateComplete;
      expect(chips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
        'true',
        'false',
        'true',
      ]);
      expect(chips()[1]?.disabled).toBe(true); // the cover shares no verb with the lights
      expect(tile(sheet, 'ss-do', 'Turn on')).toBeDefined();
      tile(sheet, 'ss-do', 'Turn off')?.click();
      await sheet.updateComplete;
      expect(
        root(sheet).querySelector<HTMLInputElement>('input[data-field="alias"]')?.value,
      ).toMatch(/^Kitchen lamp \+1 · /);
      chips()[0]?.click();
      chips()[2]?.click();
      await sheet.updateComplete;
      expect(chips().every((chip) => !chip.disabled)).toBe(true);
    });

    it('searches more than six among themselves alone', async () => {
      const only = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ id: `light.desk_${n}` }));
      const sheet = await open(request({ only: [...only, { id: 'light.kitchen' }] }));
      const input = root(sheet).querySelector<HTMLInputElement>('.ss-search input')!;
      input.value = 'light';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sheet.updateComplete;
      const names = [...root(sheet).querySelectorAll('.ss-candidates .fv-row__title')].map((el) =>
        el.textContent?.trim(),
      );
      expect(names).not.toContain('Hall light');
      expect(root(sheet).querySelector('.ss-more')?.textContent).toBe('1 more · keep typing');
    });

    it('keeps a target from elsewhere as a chip that removes it, and saves it as it was', async () => {
      const req = request({
        schedule: { ...EXISTING, targets: ['light.kitchen', 'light.hall'] },
        only: [{ id: 'light.kitchen' }],
      });
      const sheet = await open(req);
      expect(root(sheet).querySelector('.ss-fixed')).toBeNull();
      expect(
        [...root(sheet).querySelectorAll('.ss-chosen .fv-chip__name')].map((el) => el.textContent),
      ).toEqual(['Hall light']);
      save(sheet).click();
      await sheet.updateComplete;
      const handed = (req.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Schedule;
      expect(handed.targets).toEqual(['light.kitchen', 'light.hall']);
    });
  });

  it('shows an automation’s details: its switch, its links, and Run that reads Done for a beat', async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const toggle = vi.fn();
    const details: DetailsRequest = {
      entity: 'automation.leak',
      alias: 'Leak alert',
      configId: '1690000000001',
      run,
      toggle,
    };
    const sheet = await open(details);
    expect(root(sheet).querySelector('.fv-sheet__title')?.textContent?.trim()).toBe('Leak alert');
    expect(root(sheet).querySelector('.fv-card__sub')?.textContent).toBe('Never run · On');
    expect(root(sheet).querySelectorAll('.ss-links .fv-row').length).toBe(2);
    const button = root(sheet).querySelector<HTMLButtonElement>('.dv-actions .fv-btn--accent')!;
    expect(button.textContent?.trim()).toBe('Run');
    button.click();
    await sheet.updateComplete;
    expect(run).toHaveBeenCalledTimes(1);
    expect(button.textContent?.trim()).toBe('Done');
    button.click(); // inside the beat: the same gesture
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1300);
    await sheet.updateComplete;
    expect(button.textContent?.trim()).toBe('Run');
    // the switch asks, and shows what it asked for
    root(sheet).querySelector<HTMLElement>('.fv-sheet__head .fv-hit')?.click();
    await sheet.updateComplete;
    expect(toggle).toHaveBeenCalledWith(false);
    expect(
      root(sheet).querySelector('.fv-sheet__head .fv-switch')?.getAttribute('aria-checked'),
    ).toBe('false');
  });
});
