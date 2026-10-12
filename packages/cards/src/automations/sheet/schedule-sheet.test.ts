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
    // a cover has no brightness, and no "on": the verbs are its own
    candidate(sheet, 'Blinds')?.click();
    await sheet.updateComplete;
    expect(fieldRow(sheet, 'Brightness')).toBeUndefined();
    expect(save(sheet).disabled).toBe(true); // the verb no longer fits both targets
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
