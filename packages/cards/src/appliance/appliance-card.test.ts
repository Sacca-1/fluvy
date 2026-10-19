// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { OUT_OF_REACH, outOfReachStates } from '@fluvy/demo-home/out-of-reach';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applianceHeight, APPLIANCE_VARIANTS } from '../appliances-family.js';
import { FluvyApplianceCard } from './appliance-card.js';
import { FluvyAppliancesCard } from './appliances-card.js';
import { allFixtures, houseOf, laterFixtures, minutesFrom, plugFridge } from './fixtures/index.js';
import { applianceDevices } from './kinds.js';
import { forgetUnloaded } from './memory.js';
import { SETTLE_MS } from './nudge.js';

if (!customElements.get('fluvy-appliance-card'))
  customElements.define('fluvy-appliance-card', FluvyApplianceCard);

const NOW = Date.parse('2026-10-17T12:00:00Z');
const AT = new Date(NOW).toISOString();
const FIXTURES = allFixtures(NOW);
const APPLIANCES = FIXTURES.filter((fixture) => fixture.expected.kind);

type Mounted = FluvyApplianceCard & { updateComplete: Promise<boolean> };

/** A house of every fixture, Home Assistant's calls recorded, its recorder answering nothing. */
function house(changes: Record<string, Partial<HassEntity>> = {}): HomeAssistant & {
  calls: Array<{ domain: string; service: string; data: Record<string, unknown> }>;
} {
  const calls: Array<{ domain: string; service: string; data: Record<string, unknown> }> = [];
  const base = houseOf(FIXTURES, NOW);
  const states = { ...base.states };
  for (const [id, change] of Object.entries(changes))
    states[id] = { ...(states[id] as HassEntity), ...change } as HassEntity;
  return {
    ...base,
    states,
    calls,
    themes: { darkMode: false },
    user: { id: 'u', name: 'U', is_admin: true },
    callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
      calls.push({ domain, service, data });
    },
    callWS: async () => ({}),
  } as unknown as HomeAssistant & { calls: typeof calls };
}

/** Every entity of a device out of reach. */
const unavailable = (device: string): Record<string, Partial<HassEntity>> =>
  Object.fromEntries(
    FIXTURES.filter((fixture) => fixture.device.id === device).flatMap((fixture) =>
      fixture.entities.map((entry) => [entry.entity_id, { state: 'unavailable' }]),
    ),
  );

async function mount(
  config: Record<string, unknown>,
  hass: HomeAssistant = house(),
  width = 360,
): Promise<Mounted> {
  const card = document.createElement('fluvy-appliance-card') as Mounted;
  card.setConfig({
    type: 'custom:fluvy-appliance-card',
    _now: AT,
    ...config,
  } as LovelaceCardConfig);
  card.hass = hass;
  (card as unknown as { width: number }).width = width;
  document.body.append(card);
  await card.updateComplete;
  await card.updateComplete;
  return card;
}

const root = (card: Mounted): ShadowRoot => card.shadowRoot as ShadowRoot;
const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** The card's sections, in order: what its anatomy is, whatever it says. */
const sections = (card: Mounted): string[] =>
  [...(root(card).querySelector('article')?.children ?? [])].map(
    (el) =>
      `${el.tagName.toLowerCase()}.${[...el.classList]
        .filter((c) => !/^is-|^fv-tone--/.test(c))
        .sort()
        .join('.')}`,
  );

afterEach(() => {
  document.body.replaceChildren();
  forgetUnloaded();
  window.localStorage.clear();
});

describe('the appliance card', () => {
  it.each(
    APPLIANCES.flatMap((fixture) =>
      APPLIANCE_VARIANTS.map((variant) => [fixture.title, variant, fixture.device.id] as const),
    ),
  )('draws %s as %s', async (_, variant, device) => {
    const card = await mount({ device, variant });
    expect(root(card).querySelector('.fv-card--empty')).toBeNull();
    expect(root(card).querySelector('article')).not.toBeNull();
  });

  it('knows its height at a 360 column for every variant and kind (the family’s, which every page carries)', () => {
    for (const variant of APPLIANCE_VARIANTS)
      for (const kind of ['washer', 'oven', 'fridge', 'hob', 'coffee', 'appliance'] as const)
        expect(FluvyApplianceCard.layoutHeight({ type: 'x', variant, kind })).toBe(
          applianceHeight({ type: 'x', variant, kind }),
        );
    // the row with its picture is 88, with its circle 76
    expect(applianceHeight({ type: 'x', variant: 'row' })).toBe(88);
    expect(applianceHeight({ type: 'x', variant: 'row', picture: 'icon' })).toBe(76);
  });

  it('as a whole card, every big kind is as tall as the next, so a dashboard’s row of them ends level (#47)', () => {
    const kinds = [
      'washer',
      'washer_dryer',
      'dryer',
      'dishwasher',
      'oven',
      'hob',
      'fridge',
      'freezer',
      'wine',
      'coffee',
      'air_fryer',
    ] as const;
    for (const kind of kinds) expect(applianceHeight({ type: 'x', kind }), kind).toBe(376);
    // what lives on a plug is a row where the card names no layout
    expect(applianceHeight({ type: 'x', kind: 'toaster' })).toBe(88);
    // a part left out takes its room with it
    expect(applianceHeight({ type: 'x', kind: 'washer', show_rows: false })).toBe(376 - 20 - 132);
    // the head keeps its 64 without a picture: the name over what it does, level with its row
    expect(applianceHeight({ type: 'x', kind: 'washer', picture: 'none' })).toBe(376);
  });

  it('draws the reporter’s design: the picture, the name over what it does, the power round, the hero, three rows', async () => {
    const card = await mount({ device: 'hc-dish' });
    const head = root(card).querySelector('.fv-card__head');
    expect(head?.querySelector('.ap-pic')).not.toBeNull();
    expect(head?.querySelector('.ap-power')?.getAttribute('aria-label')).toBe('Switch off');
    expect(root(card).querySelectorAll('.ap-items .ap-item')).toHaveLength(3);
    // the pictures are their own chunk: drawn once it has landed (however long a busy run takes to bring it), the box
    // keeping its size meanwhile
    await import('./art/art.js');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await card.updateComplete;
    expect(root(card).querySelector('.ap-pic svg')).not.toBeNull();
    const icon = await mount({ device: 'hc-dish', picture: 'icon' });
    expect(root(icon).querySelector('.fv-card__head .fv-ico--hero')).not.toBeNull();
    const none = await mount({ device: 'hc-dish', picture: 'none', show_power: false });
    expect(root(none).querySelector('.ap-pic, .ap-power')).toBeNull();
  });

  it('a new card takes the house’s first appliance', () => {
    const hass = house();
    expect(FluvyApplianceCard.getStubConfig(hass)).toEqual({
      type: 'custom:fluvy-appliance-card',
      device: applianceDevices(hass)[0],
    });
    expect(FluvyApplianceCard.getStubConfig(undefined)).toEqual({
      type: 'custom:fluvy-appliance-card',
    });
  });

  // the row is 76 whatever it says: its anatomy is held by the suites (its round disabled, never gone)
  it.each(
    [
      'hc-dish',
      'lg-fridge',
      'hc-oven',
      'miele-hob',
      'hc-coffee',
      'st-washer',
      'plug-washer',
    ].flatMap((device) =>
      APPLIANCE_VARIANTS.filter((variant) => variant !== 'row').map(
        (variant) => [device, variant] as const,
      ),
    ),
  )(
    '%s as %s keeps its anatomy out of reach: the same sections, its values a dash',
    async (device, variant) => {
      const live = await mount({ device, variant });
      const gone = await mount({ device, variant }, house(unavailable(device)));
      expect(sections(gone)).toEqual(sections(live));
      expect(root(gone).querySelector('article')?.classList.contains('is-unavailable')).toBe(true);
    },
  );

  // a layout comes from the width, the config and what the appliance can do, never from its state: a setpoint's
  // stepper keeps its room out of reach (disabled), so a narrow column stacks the row live and out of reach alike;
  // the compartments' tiles are measured by their range's ends, so they keep their columns
  it.each([
    ['miele-fridge', 'ring', 'stepper'],
    ['miele-fridge', 'full', 'stepper'],
    ['miele-fridge', 'full', undefined],
    ['lg-fridge', 'full', 'stepper'],
    ['lg-fridge', 'full', undefined],
    ['hc-oven', 'full', 'stepper'],
    ['hc-oven', 'ring', 'stepper'],
  ] as const)(
    '%s as %s (%s) keeps its anatomy out of reach in a narrow column too: the same rows, stacked alike',
    async (device, variant, setpoint_style) => {
      for (const width of [211, 232, 266]) {
        const config = { device, variant, ...(setpoint_style ? { setpoint_style } : {}) };
        const live = await mount(config, house(), width);
        const gone = await mount(config, house(unavailable(device)), width);
        expect(sections(gone), `${width}`).toEqual(sections(live));
        const rows = (card: Mounted): string[] =>
          [...root(card).querySelectorAll('.fv-value-row')].map((row) =>
            [...row.classList].sort().join('.'),
          );
        expect(rows(gone), `${width}`).toEqual(rows(live));
        // its steppers stay, disabled
        expect(root(gone).querySelectorAll('.fv-stepper').length).toBe(
          root(live).querySelectorAll('.fv-stepper').length,
        );
        for (const half of root(gone).querySelectorAll('.fv-stepper__half'))
          expect((half as HTMLButtonElement).disabled).toBe(true);
      }
    },
  );

  // the owner's rule (1.9): unavailable, unknown or gone from the house, as Home Assistant writes each, an appliance
  // draws its live card's parts at every column — the head's words under it or beside the name by the column, never
  // by what they say; its rows the registry's (LG's older integration's attributes remembered while they could be
  // read); a missing entity's capabilities as they were (`@fluvy/core`'s `resolveEntity`)
  it.each(
    (
      [
        'lg-dryer',
        'st-dish',
        'rep-oven',
        'rep-fridge',
        'matter-fridge',
        'plug-washer',
        'hc-oven',
        'miele-hob',
        'hc-coffee',
      ] as const
    ).flatMap((device) =>
      APPLIANCE_VARIANTS.flatMap((variant) =>
        OUT_OF_REACH.map((kind) => [device, variant, kind] as const),
      ),
    ),
  )(
    '%s as %s keeps its parts and its rows %s, at 211, 266 and 360 alike',
    async (device, variant, kind) => {
      const ids = FIXTURES.filter((fixture) => fixture.device.id === device).flatMap((fixture) =>
        fixture.entities.map((entry) => entry.entity_id),
      );
      const count = (card: Mounted, selector: string): number =>
        root(card).querySelectorAll(selector).length;
      // a modifier (`…--…`) is a part's colour: the row's round is quiet or the accent's by what it may do
      const parts = (card: Mounted): string[] =>
        sections(card).map((section) =>
          section
            .split('.')
            .filter((c) => !c.includes('--'))
            .join('.'),
        );
      for (const width of [211, 266, 360]) {
        const live = await mount({ device, variant }, house(), width);
        const base = house();
        const gone = await mount(
          { device, variant },
          { ...base, states: outOfReachStates(base.states, ids, kind) },
          width,
        );
        const at = `${kind} at ${width}`;
        expect(parts(gone), at).toEqual(parts(live));
        if (kind !== 'unknown')
          expect(
            root(gone).querySelector('article')?.classList.contains('is-unavailable'),
            at,
          ).toBe(true);
        for (const part of [
          '.ap-head__under',
          '.ap-figures',
          '.ap-item',
          '.ap-zone',
          '.ap-tile',
          '.ap-plate',
          '.fv-action',
          '.fv-stepper',
          '.ap-line',
          '.ap-twin-line',
        ])
          expect(count(gone, part), `${at}: ${part}`).toBe(count(live, part));
      }
    },
  );

  it('says the cycle: the time left of its whole, its progress as a bar, its steps where asked', async () => {
    const card = await mount({ device: 'lg-washer' });
    expect(text(root(card).querySelector('.ap-figures'))).toMatch(
      /^Remaining 0:42 h of \d:\d\d h$/,
    );
    const bar = root(card).querySelector('.ap-progress [role="progressbar"]');
    expect(Number(bar?.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(text(root(card).querySelector('.ap-progress__share'))).toMatch(/^\d+ %$/);
    const stepped = await mount({ device: 'lg-washer', progress_style: 'steps' });
    expect(root(stepped).querySelector('.ap-steps [aria-current="step"]')).not.toBeNull();
    // when it ends instead of the time left
    const end = await mount({ device: 'lg-washer', time: 'end' });
    expect(text(root(end).querySelector('.ap-figures__label'))).toBe('Ends');
  });

  it('says its rows as the kind does: a washer’s values beside their words, a dryer’s at the end, a fridge’s as phrases', async () => {
    const washer = await mount({ device: 'miele-washer' });
    expect(root(washer).querySelector('.ap-items--inline')).not.toBeNull();
    const fridge = await mount({ device: 'lg-fridge' });
    expect(root(fridge).querySelector('.ap-items--plain')).not.toBeNull();
    // a reminder due says what to do, in the warning's ink, in the last row's place
    const due = [...root(fridge).querySelectorAll('.ap-item.is-warning')].map(text);
    expect(due).toContain('Replace the water filter');
    // at the row's end, as a dryer's lint filter says "Clean" (#47): what to do, its value in the warning's ink
    const ended = await mount({ device: 'lg-fridge', row_values: 'end' });
    const values = [...root(ended).querySelectorAll('.ap-item.is-warning .ap-item__value')];
    expect(values.map(text)).toContain('Replace');
    const own = await mount({
      device: 'hc-dish',
      rows: [
        { key: 'water', name: 'Litres' },
        'end',
        { entity: 'switch.geschirrspuler_strom', name: '' },
      ],
      row_values: 'end',
    });
    // its name and its value, as a reader hears them; a name left empty says the value alone
    expect(
      [...root(own).querySelectorAll('.ap-item')].map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Litres · —', expect.stringMatching(/^Ends · \d{1,2}:\d{2}$/), 'On']);
  });

  it('a fridge that only says its setpoints says them alone, and in the house’s unit', async () => {
    const card = await mount({ device: 'lg-fridge' });
    const labels = [...root(card).querySelectorAll('.ap-tile__label')].map(text);
    expect(labels).toEqual(['Fridge', 'Freezer']);
    const steppers = await mount({ device: 'lg-fridge', setpoint_style: 'stepper' });
    expect([...root(steppers).querySelectorAll('.ap-zone .fv-readout__label')].map(text)).toEqual([
      'Fridge',
      'Freezer',
    ]);
    const imperial = await mount({ device: 'lg-fridge' }, {
      ...house({
        'number.kuhlschrank_fridge_temperatur': {
          state: '37',
          attributes: { min: 33, max: 45, step: 1, unit_of_measurement: '°F' },
        },
      }),
      config: { unit_system: { temperature: '°F', length: 'mi' } },
    } as unknown as HomeAssistant);
    expect(text(root(imperial).querySelector('.ap-tile__value'))).toBe('37 °F');
  });

  it('ten taps on a compartment’s stepper are one call, the value the last tap left, once they settle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const hass = house();
      const card = await mount({ device: 'lg-fridge', setpoint_style: 'stepper' }, hass);
      const plus = root(card).querySelectorAll<HTMLButtonElement>('.ap-zone .fv-stepper__half')[1];
      for (let tap = 0; tap < 10; tap++) {
        plus?.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true, composed: true }));
        await card.updateComplete;
      }
      expect(hass.calls).toEqual([]);
      vi.advanceTimersByTime(SETTLE_MS);
      expect(hass.calls).toEqual([
        {
          domain: 'number',
          service: 'set_value',
          data: { entity_id: 'number.kuhlschrank_fridge_temperatur', value: 7 },
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('“Unloaded” is remembered for that finish: the reminder goes, the round with it', async () => {
    const card = await mount({
      device: 'lg-dryer',
      _now: new Date(NOW + 10 * 60_000).toISOString(),
    });
    const round = root(card).querySelector<HTMLButtonElement>('.fv-card__head .fv-round');
    expect(round?.getAttribute('aria-label')).toBe('Unloaded');
    // the load waiting is said in the warning's ink: by its alarm row where the card has one, else by its head
    const warned = (): string =>
      text(root(card).querySelector('.ap-head__sub.is-warning, .ap-item.is-warning'));
    expect(warned()).toMatch(/unloaded/i);
    round?.click();
    await card.updateComplete;
    // the power round is back in its place, the head says what it does
    expect(
      root(card).querySelector('.fv-card__head .fv-round')?.getAttribute('aria-label'),
    ).not.toBe('Unloaded');
    expect(warned()).toBe('');
    expect(text(root(card).querySelector('.ap-head__sub'))).not.toMatch(/unloaded/i);
  });

  it('stops only after Home Assistant’s dialog has asked; the start of one whose remote is off is disabled, saying why', async () => {
    const handed: unknown[] = [];
    document.body.addEventListener('hass-action', (event) =>
      handed.push((event as CustomEvent).detail),
    );
    const hass = house();
    const card = await mount({ device: 'hc-dish', show_controls: true }, hass);
    root(card).querySelector<HTMLButtonElement>('[data-action="stop"]')?.click();
    expect(hass.calls).toEqual([]);
    expect(JSON.stringify(handed)).toContain('"perform_action":"button.press"');
    expect(JSON.stringify(handed)).toContain('Stop the programme?');
    const remote = await mount({ device: 'st-dish', show_controls: true });
    const start = root(remote).querySelector<HTMLButtonElement>('[data-action="start"]');
    expect(start?.disabled).toBe(true);
    expect(start?.title).toMatch(/Remote start is off/);
  });

  it('a washer on a plug says what it draws and what this cycle used, from its power’s history; its rows never again', async () => {
    const hass = {
      ...house({
        'sensor.waschmaschine_keller_leistung': {
          state: '410',
          last_changed: minutesFrom(NOW, -10),
          attributes: { unit_of_measurement: 'W', device_class: 'power' },
        },
        'sensor.waschmaschine_keller_energie': {
          state: '182.4',
          last_changed: minutesFrom(NOW, -5),
          attributes: { unit_of_measurement: 'kWh', device_class: 'energy' },
        },
      }),
      callWS: async () => ({
        'sensor.waschmaschine_keller_leistung': [
          { s: '0.4', lu: (NOW - 600 * 60_000) / 1000 },
          { s: '2050', lu: (NOW - 42 * 60_000) / 1000 },
        ],
        'sensor.waschmaschine_keller_energie': [{ s: '181.5', lu: (NOW - 600 * 60_000) / 1000 }],
      }),
    } as unknown as HomeAssistant;
    const card = await mount({ device: 'plug-washer' }, hass);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await card.updateComplete;
    expect(text(root(card).querySelector('.ap-figures'))).toBe('Power 410 W This cycle 0.90 kWh');
    expect(text(root(card).querySelector('.fv-card__head'))).toMatch(/Running/);
    const rows = [...root(card).querySelectorAll('.ap-item')].map(text);
    // what it draws and what this cycle used are the hero's (#47): the rows say when it ends, how long it has run, its
    // alarm
    expect(rows).toEqual(['Ends —', 'Elapsed 42 min', 'No alarm']);
  });

  it('a fridge on a plug is in operation, its compressor resting or running: never done, no bell, and switching it off asks first (#47)', async () => {
    const handed: Array<{ config?: { tap_action?: Record<string, unknown> } }> = [];
    const listen = (event: Event): void => void handed.push((event as CustomEvent).detail);
    document.body.addEventListener('hass-action', listen);
    try {
      for (const watts of ['0.9', '85']) {
        const base = house();
        const hass = houseOf([plugFridge(NOW)], NOW, base);
        hass.states['sensor.kuhlschrank_keller_leistung'] = {
          ...(hass.states['sensor.kuhlschrank_keller_leistung'] as HassEntity),
          state: watts,
        };
        Object.assign(hass, { callService: base.callService, calls: base.calls });
        for (const variant of ['full', 'row'] as const) {
          handed.length = 0;
          base.calls.length = 0;
          const card = await mount({ device: 'plug-fridge', variant }, hass);
          const head = text(root(card).querySelector('.fv-card__head, .fv-row__text'));
          expect(head, `${watts} W ${variant}`).toMatch(/In operation/);
          expect(head, `${watts} W ${variant}`).not.toMatch(/Running|Done|Ready/);
          expect(root(card).querySelector('.ap-notice'), `${watts} W ${variant}`).toBeNull();
          // no cycle to have used anything in
          expect(text(root(card).querySelector('.ap-figures'))).not.toMatch(/This cycle/);
          const power = root(card).querySelector<HTMLButtonElement>('.ap-power');
          expect(power?.className, `${watts} W ${variant}`).toMatch(/ap-power--ok/);
          power?.click();
          expect(base.calls, `${watts} W ${variant}`).toEqual([]);
          expect(handed.at(-1)?.config?.tap_action, `${watts} W ${variant}`).toMatchObject({
            perform_action: 'switch.turn_off',
            confirmation: { text: 'Switch it off? It stops cooling.' },
          });
          card.remove();
        }
      }
    } finally {
      document.body.removeEventListener('hass-action', listen);
    }
  });

  it('asks before switching off one that failed, even out of its cycle (#47)', async () => {
    const handed: Array<{ config?: { tap_action?: Record<string, unknown> } }> = [];
    const listen = (event: Event): void => void handed.push((event as CustomEvent).detail);
    document.body.addEventListener('hass-action', listen);
    try {
      const hass = house({
        'event.waschmaschine_fehler': {
          state: new Date(NOW - 4 * 60_000).toISOString(),
          attributes: { event_type: 'unbalanced_load_error' },
        },
      });
      const card = await mount({ device: 'lg-washer' }, hass);
      root(card).querySelector<HTMLButtonElement>('.fv-card__head .ap-power')?.click();
      expect(hass.calls).toEqual([]);
      expect(handed.at(-1)?.config?.tap_action).toMatchObject({
        perform_action: 'switch.turn_off',
        confirmation: { text: expect.any(String) },
      });
    } finally {
      document.body.removeEventListener('hass-action', listen);
    }
  });

  // the contract `shared/heads.test.ts` holds every card to, which its house of loose entities cannot draw this one in
  it.each(APPLIANCE_VARIANTS)(
    'as %s, its head (the row: its cover) is the card’s button: a tap and a hold reach their actions, a named one; nothing to run, no button',
    async (variant) => {
      const went: string[] = [];
      const heard = (): void => void went.push(window.location.pathname);
      window.addEventListener('location-changed', heard);
      try {
        const card = await mount({
          device: 'lg-washer',
          variant,
          tap_action: { action: 'navigate', navigation_path: '/t' },
          hold_action: { action: 'navigate', navigation_path: '/h' },
        });
        type Pressable = HTMLElement & { fvHold?: () => void };
        // the head's words are its button, the head itself holds; the row's cover does both
        const row = variant === 'row';
        const button = root(card).querySelector<Pressable>(row ? '.fv-tile__tap' : '.fv-card__tap');
        expect(button?.getAttribute('aria-label') || text(button)).not.toBe('');
        button?.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 0 }),
        );
        window.dispatchEvent(new PointerEvent('pointerup'));
        button?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1 }),
        );
        root(card)
          .querySelector<Pressable>(row ? '.fv-tile__tap' : '.fv-card__head')
          ?.fvHold?.();
        expect(went).toEqual(['/t', '/h']);
        expect(
          root(card).querySelector('.fv-card__head > :is(button.fv-ico, .fv-ico--tap)'),
        ).toBeNull();
        const none = { action: 'none' };
        const still = await mount({
          device: 'lg-washer',
          variant,
          tap_action: none,
          hold_action: none,
        });
        expect(root(still).querySelector('.fv-card__tap, .fv-tile__tap')).toBeNull();
      } finally {
        window.removeEventListener('location-changed', heard);
      }
    },
  );

  it('says a second drum as a row over the others (a line under the hero, compact), alone where asked, or not', async () => {
    const both = await mount({ device: 'st-washer' });
    expect(text(root(both).querySelector('.ap-item'))).toMatch(/^Upper /);
    const compact = await mount({ device: 'st-washer', variant: 'compact' });
    expect(text(root(compact).querySelector('.ap-twin-line'))).toMatch(/^Upper · /);
    const main = await mount({ device: 'st-washer', unit: 'main' });
    expect(text(root(main).querySelector('.ap-item'))).not.toMatch(/^Upper /);
  });
});

/** The kinds the whole card draws in the standard slot (#47): 376 at a 360 column, so a row of them lines up. */
const BIG = new Set([
  'washer',
  'washer_dryer',
  'dryer',
  'dishwasher',
  'oven',
  'hob',
  'fridge',
  'freezer',
  'wine',
  'coffee',
  'air_fryer',
  'microwave',
  'kettle',
]);

describe('the whole card’s standard slot (#47)', () => {
  /** The house at the reporter's appliances' work (his four LG appliances under way). */
  const atWork = (): HomeAssistant => houseOf(laterFixtures(NOW), NOW, house());
  /** A house without one of its entities: what an appliance that lacks it has. */
  const without = (hass: HomeAssistant, id: string): HomeAssistant => {
    const states = { ...hass.states };
    const entities = { ...hass.entities };
    delete states[id];
    delete entities[id];
    return { ...hass, states, entities } as HomeAssistant;
  };
  /** The whole card's anatomy: its head, its hero's region (108 or more), its rows. */
  const anatomy = (card: Mounted): readonly [number, number, number] => [
    root(card).querySelectorAll('.ap-head').length,
    root(card).querySelectorAll('.ap-region.is-fixed').length,
    root(card).querySelectorAll('.ap-items > .ap-item').length,
  ];
  const height = (config: Record<string, unknown>, hass: HomeAssistant): number =>
    FluvyApplianceCard.layoutHeight({ type: 'x', ...config }, hass);
  /** The house as Home Assistant words it: a Miele plate's level ("Off", "Level 7"), the rest as raw. */
  const spoken = (hass: HomeAssistant): HomeAssistant =>
    ({
      ...hass,
      formatEntityState: (stateObj: HassEntity, state?: string) => {
        const raw = state ?? stateObj.state;
        const step = /^plate_step_(\d+)$/.exec(raw)?.[1];
        return step === undefined ? raw.replace(/_/g, ' ') : step === '0' ? 'Off' : `Level ${step}`;
      },
    }) as HomeAssistant;
  /** The coffee machine with its select of drinks (Home Connect's programme), in English. */
  const drinks = (): HomeAssistant => {
    const base = house();
    const id = 'select.kaffeevollautomat_ausgewahltes_programm';
    const options = ['espresso', 'coffee', 'cappuccino', 'latte_macchiato'];
    return {
      ...spoken(base),
      entities: {
        ...base.entities,
        [id]: {
          entity_id: id,
          device_id: 'hc-coffee',
          platform: 'home_connect',
          translation_key: 'selected_program',
        },
      },
      states: {
        ...base.states,
        [id]: {
          entity_id: id,
          state: 'espresso',
          attributes: { options },
          last_changed: AT,
          last_updated: AT,
        },
      },
    } as HomeAssistant;
  };

  // every big kind on a device of its own, and a few on one that stands in for it (an oven read as an air fryer)
  const cases = [
    ...APPLIANCES.filter((fixture) => BIG.has(fixture.expected.kind ?? '')).map(
      (fixture) => [fixture.title, fixture.device.id, fixture.expected.kind ?? ''] as const,
    ),
    ['an oven as an air fryer', 'hc-oven', 'air_fryer'],
    ['an oven as a microwave', 'hc-oven', 'microwave'],
    ['a fridge as a freezer', 'miele-fridge', 'freezer'],
    ['a fridge as a wine cooler', 'wp-fridge', 'wine'],
    ['a washer as a washer-dryer', 'lg-washer', 'washer_dryer'],
  ] as const;

  it.each(cases)(
    '%s (%s, %s) draws its hero and three rows and says so, live, at work, out of reach and without any one entity',
    async (_, device, kind) => {
      const config = { device, kind, variant: 'full' };
      const ids = FIXTURES.filter((fixture) => fixture.device.id === device).flatMap((fixture) =>
        fixture.entities.map((entry) => entry.entity_id),
      );
      const houses: ReadonlyArray<readonly [string, HomeAssistant]> = [
        ['live', house()] as const,
        ['at work', atWork()] as const,
        ['out of reach', house(unavailable(device))] as const,
        ...ids.map((id) => [`without ${id}`, without(house(), id)] as const),
      ].map(([said, hass]) => [said, spoken(hass)] as const);
      // the reporter's cooktop is read as its range's burners: five, three a row (it says so: 472)
      const slot = device === 'rep-oven' && kind === 'hob' ? 472 : 376;
      for (const [said, hass] of houses) {
        const card = await mount(config, hass);
        expect(anatomy(card), said).toEqual([1, 1, 3]);
        expect(height(config, hass), said).toBe(slot);
        card.remove();
      }
    },
  );

  it('fills a row the appliance lacks with its next one, else a dash in its place, the same anatomy', async () => {
    const said = (card: Mounted): Array<string | null> =>
      [...root(card).querySelectorAll('.ap-item')].map((row) => row.getAttribute('aria-label'));
    // a coffee machine that offers no drinks: their tiles, a dash each and disabled; its last brew, "Water —" in its
    // tank's place, then its alarm, its next row
    const coffee = await mount({ device: 'miele-coffee' });
    const tiles = [...root(coffee).querySelectorAll('.ap-drink')] as HTMLButtonElement[];
    expect(tiles.map(text)).toEqual(['—', '—', '—', '']);
    expect(tiles.every((tile) => tile.disabled)).toBe(true);
    expect(said(coffee)).toEqual([expect.stringMatching(/^Last brew · /), 'Water · —', 'No alarm']);
    // a fridge without a filter: its mode, "Filter —", its alarm, as the reporter's
    expect(said(await mount({ device: 'hc-fridge' }))).toEqual([
      'Super cool',
      'Filter · —',
      expect.stringMatching(/^Door open/),
    ]);
    // a hob without a meter: "Power —", how long it has been on, its alarm — its plates on are its panel's and its
    // head's; a washer on a plug: when it ends, how long, its alarm — what it draws and uses are its hero's (#47)
    expect(said(await mount({ device: 'miele-hob' }))).toEqual([
      'Power · —',
      expect.stringMatching(/^Elapsed · /),
      'No alarm',
    ]);
    expect(said(await mount({ device: 'plug-washer' }))).toEqual([
      'Ends · —',
      expect.stringMatching(/^Elapsed · /),
      'No alarm',
    ]);
  });

  it('holds a second drum or cavity in the slot: its row over two of the kind’s', async () => {
    for (const device of ['st-oven', 'st-washer', 'wp-oven', 'rep-oven']) {
      const card = await mount({ device });
      const rows = [...root(card).querySelectorAll('.ap-item')];
      expect(rows, device).toHaveLength(3);
      expect(text(rows[0]), device).toMatch(/^(Upper|Lower|Second cavity)/);
      expect(height({ device }, house()), device).toBe(376);
    }
    // beside the card's own rows it is one more, and says so
    expect(height({ device: 'st-oven', rows: ['program'] }, house())).toBe(376 - 44);
    expect(height({ device: 'st-oven', rows: ['program'], unit: 'main' }, house())).toBe(376 - 88);
  });

  it('declares what it draws beyond the slot, from the house: steppers, quick modes, buttons, programmes, plates', () => {
    const hass = house();
    // two compartments' steppers (64 each, 12 apart) and one row of quick modes; four quick modes two a row
    expect(height({ device: 'lg-fridge', setpoint_style: 'stepper', show_modes: true }, hass)).toBe(
      376 + 32 + 60,
    );
    expect(height({ device: 'hc-fridge', show_modes: true }, hass)).toBe(376 + 16 + 88);
    // the buttons where it can be pressed, none where it cannot
    expect(height({ device: 'hc-dish', show_controls: true }, hass)).toBe(376 + 60);
    expect(height({ device: 'miele-fridge', show_controls: true }, hass)).toBe(376);
    // the programmes where a card can choose one (a select of drinks: "Latte macchiato" holds one a row), none where
    // it cannot
    expect(height({ device: 'hc-coffee', show_programs: true }, hass)).toBe(376);
    expect(height({ device: 'hc-coffee', show_programs: true }, drinks())).toBe(376 + 16 + 4 * 44);
    expect(height({ device: 'miele-coffee', show_programs: true }, hass)).toBe(376);
    // a range's five burners as a hob, three a row: two rows of plates; compact, two rows of cells and its oven's line
    expect(height({ device: 'rep-oven', kind: 'hob' }, hass)).toBe(472);
    expect(height({ device: 'rep-oven', kind: 'hob', variant: 'compact' }, hass)).toBe(264);
    // the kind the house says, not a washer's: a fridge's two dials, no buttons
    expect(height({ device: 'miele-fridge', variant: 'ring' }, hass)).toBe(288);
    // without the house, the family's from the config alone
    expect(FluvyApplianceCard.layoutHeight({ type: 'x', device: 'rep-oven', kind: 'hob' })).toBe(
      376,
    );
  });

  it('the list’s whole cards follow them: each what its appliance draws, one a row 16 apart', () => {
    const hass = house();
    const list = (config: Record<string, unknown>, at?: HomeAssistant): number =>
      FluvyAppliancesCard.layoutHeight({ type: 'x', variant: 'cards', ...config }, at);
    expect(list({ appliances: ['st-oven', 'miele-coffee', 'hc-fridge'] }, hass)).toBe(
      3 * 376 + 2 * 16,
    );
    expect(list({ appliances: ['miele-coffee', { device: 'rep-oven', kind: 'hob' }] }, hass)).toBe(
      376 + 16 + 472,
    );
    // without the house, the family's
    expect(list({ appliances: ['st-oven'] })).toBe(376);
  });
});

describe('the appliance card’s editor', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
  });

  it('shows what the card does for the appliance it is about where the config says nothing', () => {
    const hass = house();
    const defaults = FluvyApplianceCard.defaults?.(
      { type: 'custom:fluvy-appliance-card', device: 'lg-fridge' },
      hass,
    );
    expect(defaults).toMatchObject({ door_alert: 60, unload_reminder: false, controls: [] });
    const washer = FluvyApplianceCard.defaults?.(
      { type: 'custom:fluvy-appliance-card', device: 'lg-washer' },
      hass,
    );
    // the programme is the head's to say: no readout of it unless asked for
    expect(washer).toMatchObject({
      unload_reminder: true,
      readouts: ['temperature', 'spin', 'energy'],
    });
  });
});

describe('“Tell me when it’s done” (#47)', () => {
  const ID = 'fluvy_done_hc_dish';
  /** The house with Home Assistant's config API, recording what it is sent; the notice's automation where it is. */
  function houseWith(automation?: 'on' | 'off', admin = true) {
    const hass = house();
    const api: Array<[string, string, unknown?]> = [];
    const states = { ...hass.states };
    if (automation)
      states['automation.geschirrspuler_tell_me'] = {
        entity_id: 'automation.geschirrspuler_tell_me',
        state: automation,
        attributes: { id: ID, friendly_name: 'Geschirrspüler: tell me when it’s done' },
        last_changed: AT,
        last_updated: AT,
      } as HassEntity;
    return Object.assign(hass, {
      states,
      api,
      user: { id: 'u', name: 'U', is_admin: admin },
      callApi: async (method: string, path: string, body?: unknown) => {
        api.push(body === undefined ? [method, path] : [method, path, body]);
        return { result: 'ok' };
      },
    });
  }
  const bell = (card: Mounted) => root(card).querySelector<HTMLButtonElement>('.ap-notice');

  it('is an administrator’s round beside the figures, for what can say it finished', async () => {
    const card = await mount({ device: 'hc-dish' }, houseWith());
    expect(bell(card)?.getAttribute('aria-label')).toBe('Tell me when it’s done');
    expect(bell(card)?.getAttribute('aria-pressed')).toBe('false');
    expect(bell(card)?.closest('.ap-figures')).not.toBeNull();
    // never for a guest, never where asked not to, never for what has no finish (a fridge)
    expect(bell(await mount({ device: 'hc-dish' }, houseWith(undefined, false)))).toBeNull();
    expect(bell(await mount({ device: 'hc-dish', show_notify: false }, houseWith()))).toBeNull();
    expect(bell(await mount({ device: 'lg-fridge' }, houseWith()))).toBeNull();
    // out of reach it keeps its place, disabled
    const away = Object.assign(houseWith(), { states: { ...houseWith().states } });
    for (const [id, change] of Object.entries(unavailable('hc-dish')))
      away.states[id] = { ...(away.states[id] as HassEntity), ...change } as HassEntity;
    expect(bell(await mount({ device: 'hc-dish' }, away))?.disabled).toBe(true);
  });

  it('writes the automation in the administrator’s words, on at once', async () => {
    const hass = houseWith();
    const card = await mount({ device: 'hc-dish' }, hass);
    bell(card)?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await card.updateComplete;
    const [method, path, body] = hass.api[0] ?? [];
    expect([method, path]).toEqual(['POST', `config/automation/config/${ID}`]);
    expect(body).toMatchObject({
      id: ID,
      alias: 'Geschirrspüler: tell me when it’s done',
      triggers: [{ trigger: 'state', entity_id: 'sensor.geschirrspuler_betriebszustand' }],
      // no app on a phone in this house: Home Assistant's own notifications
      actions: [
        {
          action: 'persistent_notification.create',
          data: { title: 'Geschirrspüler', message: 'Geschirrspüler is done.' },
        },
      ],
    });
    // on until Home Assistant lists it
    expect(bell(card)?.getAttribute('aria-pressed')).toBe('true');
    expect(bell(card)?.classList.contains('ap-power--accent')).toBe(true);
  });

  it('once written, turns it off and on; a hold readies its removal, which a tap does', async () => {
    const hass = houseWith('on');
    const card = await mount({ device: 'hc-dish' }, hass);
    expect(bell(card)?.getAttribute('aria-pressed')).toBe('true');
    bell(card)?.click();
    expect(hass.calls.at(-1)).toMatchObject({ domain: 'automation', service: 'turn_off' });
    await card.updateComplete;
    // shown off at once, until Home Assistant says so
    expect(bell(card)?.getAttribute('aria-pressed')).toBe('false');
    vi.useFakeTimers();
    try {
      const button = bell(card)!;
      button.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0 }),
      );
      vi.advanceTimersByTime(600);
      await card.updateComplete;
      expect(bell(card)?.getAttribute('aria-label')).toBe('Tap again to delete');
      window.dispatchEvent(new PointerEvent('pointerup'));
      bell(card)?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      expect(hass.api.at(-1)).toEqual(['DELETE', `config/automation/config/${ID}`]);
    } finally {
      vi.useRealTimers();
    }
  });
});
