// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { outOfReachStates, type OutOfReach } from '@fluvy/demo-home/out-of-reach';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';

// the lock and the alarm are a lazy family's: they are defined before a test draws them
beforeAll(() => familiesDefined);

/*
 * The controls out of reach (1.9, the owner's rule): a thermostat, a fan, a cover, a robot, a lock, an alarm, a list of
 * helpers, a timer, a scene and a room of lights keep their anatomy and their size while what they control is
 * unavailable, unknown or missing — every control where it stands, disabled; every value "—"; only the colours change.
 * The anatomy and the heights are held over the catalogue (`unavailable.test.ts`, `interactions-unavailable.mjs`); this
 * holds what those cannot see: where the slots come from (the config, and what the entity could do as Home Assistant
 * writes it whatever its state — as this page last read it once it has gone missing), and that nothing out of reach
 * takes a tap.
 */

const STAMP = '2026-10-17T19:00:00+00:00';
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state: value,
    attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
    last_changed: STAMP,
    last_updated: STAMP,
    context: { id: '', parent_id: null, user_id: null },
  }) as HassEntity;

const LIVE: Record<string, HassEntity> = Object.fromEntries(
  [
    state('climate.hall', 'heat', {
      supported_features: 401,
      hvac_modes: ['off', 'heat', 'cool'],
      preset_modes: ['eco', 'comfort'],
      fan_modes: ['auto', 'low'],
      min_temp: 7,
      max_temp: 30,
      target_temp_step: 0.5,
      temperature: 21,
      current_temperature: 20.5,
      hvac_action: 'heating',
      preset_mode: 'comfort',
      fan_mode: 'auto',
    }),
    state('humidifier.bedroom', 'on', {
      available_modes: ['normal', 'sleep'],
      min_humidity: 30,
      max_humidity: 70,
      mode: 'sleep',
      humidity: 45,
    }),
    state('fan.ceiling', 'on', {
      supported_features: 15,
      preset_modes: ['breeze'],
      percentage: 66,
      percentage_step: 33.333,
      preset_mode: null,
      oscillating: true,
      direction: 'forward',
    }),
    state('cover.blind', 'open', { supported_features: 15, current_position: 60 }),
    state('vacuum.robot', 'docked', {
      supported_features: 14204,
      fan_speed_list: ['quiet', 'max'],
      fan_speed: 'quiet',
      battery_level: 80,
    }),
    state('sensor.robot_area', '42', { unit_of_measurement: 'm²' }),
    state('lock.door', 'locked', { supported_features: 1 }),
    state('alarm_control_panel.house', 'disarmed', {
      supported_features: 7,
      code_format: null,
      code_arm_required: false,
    }),
    state('timer.oven', 'active', {
      duration: '0:10:00',
      remaining: '0:05:00',
      finishes_at: '2026-10-17T19:05:00+00:00',
    }),
    state('input_number.level', '40', { min: 0, max: 100, step: 1, mode: 'slider' }),
    state('input_select.mode', 'Home', { options: ['Home', 'Away'] }),
    state('input_text.note', 'Back at six', { min: 0, max: 100, mode: 'text' }),
    state('scene.evening', STAMP),
    state('light.a', 'on', { supported_color_modes: ['brightness'], brightness: 128 }),
    state('light.b', 'off', { supported_color_modes: ['brightness'] }),
  ].map((s) => [s.entity_id, s]),
);

const callService = vi.fn(() => Promise.resolve());
const house = (states: Record<string, HassEntity>): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states,
    entities: {},
    devices: {},
    areas: {},
    user: { id: 'u', name: 'Marta', is_admin: true },
    config: { unit_system: { temperature: '°C' }, time_zone: 'UTC' },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callService,
    callWS: () => new Promise(() => undefined),
    connection: { subscribeMessage: () => new Promise(() => undefined) },
  }) as unknown as HomeAssistant;

/** The house with these entities out of reach, as Home Assistant writes them. */
const away = (kind: OutOfReach, ...ids: string[]) => outOfReachStates(LIVE, ids, kind);

type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  getCardSize(): number;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

async function drawn(
  type: string,
  config: Record<string, unknown>,
  states: Record<string, HassEntity> = LIVE,
): Promise<{ card: CardElement; root: ShadowRoot }> {
  const card = document.createElement(`fluvy-${type}-card`) as CardElement;
  card.setConfig({ type: `custom:fluvy-${type}-card`, ...config });
  card.hass = house(states);
  (card as unknown as { width: number }).width = 360;
  document.body.append(card);
  await card.updateComplete;
  return { card, root: card.shadowRoot! };
}

const all = (root: ParentNode, selector: string): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(selector),
];
const texts = (root: ParentNode, selector: string): string[] =>
  all(root, selector).map((el) => el.textContent?.trim() ?? '');
/** Every control of a kind is drawn at rest and takes no tap: a press reaches no service. */
function inert(root: ParentNode, selector: string): void {
  const controls = all(root, selector);
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.classList.contains('is-unavailable'), control.outerHTML).toBe(true);
    control.click();
  }
  expect(callService).not.toHaveBeenCalled();
}

afterEach(() => {
  document.body.replaceChildren();
  callService.mockClear();
});

describe('a thermostat out of reach', () => {
  it('never read, keeps the dial at "—" and its modes from its config, at rest — never one quiet line', async () => {
    const { root } = await drawn('thermostat', {
      entity: 'climate.never_read',
      modes: ['off', 'heat'],
    });
    expect(root.querySelector('.fv-card--empty')).toBeNull();
    const dial = root.querySelector('fluvy-dial') as HTMLElement & {
      text?: string;
      disabled: boolean;
    };
    expect(dial.text).toBe('—');
    expect(dial.disabled).toBe(true);
    expect(texts(root, '.fv-option__label')).toEqual(['Off', 'Heat']);
    inert(root, '.fv-option');
    // with none configured, the climate's commonest three keep the row
    document.body.replaceChildren();
    const plain = await drawn('thermostat', { entity: 'climate.never_read_either' });
    expect(texts(plain.root, '.fv-option__label')).toEqual(['Off', 'Heat', 'Cool']);
  });

  it('gone missing, keeps its modes, presets and fan speeds as it last could, and the size it said', async () => {
    const config = { entity: 'climate.hall' };
    const live = await drawn('thermostat', config);
    const size = live.card.getCardSize();
    const labels = texts(live.root, '.fv-option__label, .fv-chip');
    document.body.replaceChildren();
    const { card, root } = await drawn('thermostat', config, away('missing', 'climate.hall'));
    expect(card.getCardSize()).toBe(size);
    expect(texts(root, '.fv-option__label, .fv-chip')).toEqual(labels);
    inert(root, '.fv-option');
    inert(root, '.fv-chip');
    expect(root.querySelector('article')!.classList.contains('is-off')).toBe(true);
  });

  it('unavailable, says no setpoint it once had and lights no mode; a humidifier is neither off nor running', async () => {
    await drawn('thermostat', { entity: 'climate.hall' });
    document.body.replaceChildren();
    const { root } = await drawn(
      'thermostat',
      { entity: 'climate.hall' },
      away('unavailable', 'climate.hall'),
    );
    expect(texts(root, '.fv-option__value').every((value) => value === '')).toBe(true);
    expect(root.querySelector('.fv-option.is-active')).toBeNull();
    document.body.replaceChildren();
    const humid = await drawn(
      'thermostat',
      { entity: 'humidifier.bedroom' },
      away('unavailable', 'humidifier.bedroom'),
    );
    expect(texts(humid.root, '.fv-option__label')).toEqual(['Off', 'Normal', 'Sleep']);
    expect(humid.root.querySelector('.fv-option.is-active')).toBeNull();
  });
});

describe('a fan, a cover and a robot out of reach', () => {
  it.each([
    ['fan', 'fan.ceiling'],
    ['cover', 'cover.blind'],
    ['vacuum', 'vacuum.robot'],
  ])('a %s gone missing keeps its parts and the size it said', async (type, entity) => {
    const live = await drawn(type, { entity });
    const parts = [...live.root.querySelector('article')!.children].map((el) => el.className);
    const size = live.card.getCardSize();
    document.body.replaceChildren();
    const { card, root } = await drawn(type, { entity }, away('missing', entity));
    expect(root.querySelector('.fv-card--empty')).toBeNull();
    expect(card.getCardSize()).toBe(size);
    expect(
      [...root.querySelector('article')!.children].map((el) =>
        el.className.replace(/ ?is-\S+/g, ''),
      ),
    ).toEqual(parts.map((name) => name.replace(/ ?is-\S+/g, '')));
  });

  it('a robot keeps the readouts it is given and its battery while it cannot be read', async () => {
    const config = { entity: 'vacuum.robot', area_entity: 'sensor.robot_area' };
    await drawn('vacuum', config);
    document.body.replaceChildren();
    for (const kind of ['unknown', 'missing'] as const) {
      const { root } = await drawn(
        'vacuum',
        config,
        away(kind, 'vacuum.robot', 'sensor.robot_area'),
      );
      expect(texts(root, '.dv-cols .fv-readout__value')).toEqual(['—']);
      expect(root.querySelector('.dv-gauge fluvy-ruler')).not.toBeNull();
      document.body.replaceChildren();
    }
  });
});

/*
 * Never read (missing since the page opened: an integration still starting, an id renamed), a card cannot know what
 * its entity could do: it draws its domain's usual parts — those its `layoutHeight` declares where the house is not
 * there to say — every control disabled and every value "—", as the thermostat draws Off · Heat · Cool. Never one
 * quiet line.
 */
describe('a fan, a cover and a robot never read', () => {
  const declared = (card: CardElement): number =>
    (
      card.constructor as unknown as { layoutHeight(config: unknown, hass: unknown): number }
    ).layoutHeight((card as unknown as { config: unknown }).config, card.hass);

  it('a fan keeps its speed with its stepper, its ruler, and its oscillation and direction rows', async () => {
    const { card, root } = await drawn('fan', { entity: 'fan.never_read' });
    expect(root.querySelector('.fv-card--empty')).toBeNull();
    expect(texts(root, '.dv-value .fv-readout__value')).toEqual(['—']);
    expect(
      all(root, '.dv-value .fv-stepper__half').every((half) => half.hasAttribute('disabled')),
    ).toBe(true);
    expect(
      (root.querySelector('fluvy-ruler') as HTMLElement & { disabled: boolean }).disabled,
    ).toBe(true);
    expect(texts(root, '.dv-rows .fv-row__title')).toEqual(['Oscillate', 'Direction']);
    // nothing in it takes a tap: not the rows, not the switch, not the stepper
    for (const control of all(root, '.dv-rows .fv-row, .dv-rows button, .fv-stepper__half'))
      control.click();
    expect(callService).not.toHaveBeenCalled();
    expect(declared(card)).toBe(364); // the speed (228), the rows (16 + 2 × 60)
    expect(card.getCardSize()).toBe(7);
  });

  it('a cover keeps its position ruler at "—" and its open, stop and close, disabled', async () => {
    const { card, root } = await drawn('cover', { entity: 'cover.never_read' });
    expect(root.querySelector('.fv-card--empty')).toBeNull();
    expect(texts(root, '.dv-cover__side .fv-readout__value')).toEqual(['—']);
    expect(
      (root.querySelector('fluvy-ruler') as HTMLElement & { disabled: boolean }).disabled,
    ).toBe(true);
    const commands = all(root, '.fv-actions .fv-action');
    expect(commands.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open',
      'Stop',
      'Close',
    ]);
    expect(commands.every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(declared(card)).toBe(328);
    // compact: the head and the commands
    document.body.replaceChildren();
    const compact = await drawn('cover', { entity: 'cover.never_read', variant: 'compact' });
    expect(all(compact.root, '.fv-actions .fv-action')).toHaveLength(3);
  });

  it('a robot keeps its battery at rest and its Start, Stop and Dock, disabled; its readouts as "—"', async () => {
    const { card, root } = await drawn('vacuum', {
      entity: 'vacuum.never_read',
      area_entity: 'sensor.robot_area_never_read',
    });
    expect(root.querySelector('.fv-card--empty')).toBeNull();
    expect(texts(root, '.dv-cols .fv-readout__value')).toEqual(['—']);
    expect(root.querySelector('.dv-gauge fluvy-ruler')).not.toBeNull();
    const commands = all(root, '.fv-actions .fv-action');
    expect(commands.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Start',
      'Stop',
      'Return to dock',
    ]);
    expect(commands.every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(declared(card)).toBe(64 + 60 + 112 + 60 + 20);
    // a mower: Start and Return to dock
    document.body.replaceChildren();
    const mower = await drawn('vacuum', { entity: 'lawn_mower.never_read' });
    expect(
      all(mower.root, '.fv-actions .fv-action').map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Start', 'Return to dock']);
  });

  it('one read before it went missing keeps what it could do then, not the usual parts', async () => {
    // the cover as Home Assistant last wrote it (a position, open and close; no stop): read, then gone
    const read = { 'cover.read_once': state('cover.read_once', 'open', { supported_features: 7 }) };
    await drawn('cover', { entity: 'cover.read_once' }, { ...LIVE, ...read });
    document.body.replaceChildren();
    const { root } = await drawn('cover', { entity: 'cover.read_once' });
    expect(all(root, '.fv-actions .fv-action').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Open',
      'Close',
    ]);
  });
});

describe('a lock and an alarm out of reach', () => {
  it('a lock keeps its latch, disabled, and wears the off skin', async () => {
    await drawn('lock', { entity: 'lock.door' });
    document.body.replaceChildren();
    for (const kind of ['unavailable', 'missing'] as const) {
      const { root } = await drawn('lock', { entity: 'lock.door' }, away(kind, 'lock.door'));
      const latch = root.querySelector<HTMLButtonElement>('.dv-open button');
      expect(latch?.disabled).toBe(true);
      expect(root.querySelector('article')!.classList.contains('is-off')).toBe(true);
      expect(root.querySelector('.fv-card__head .fv-ico--off')).not.toBeNull();
      document.body.replaceChildren();
    }
  });

  it('an alarm keeps the modes it could arm, as tiles that take no tap', async () => {
    const live = await drawn('alarm', { entity: 'alarm_control_panel.house' });
    const labels = texts(live.root, '.fv-option__label');
    expect(labels).toHaveLength(4);
    document.body.replaceChildren();
    const { root } = await drawn(
      'alarm',
      { entity: 'alarm_control_panel.house' },
      away('missing', 'alarm_control_panel.house'),
    );
    expect(texts(root, '.fv-option__label')).toEqual(labels);
    inert(root, '.fv-option');
  });
});

describe('helpers and a timer out of reach', () => {
  const ids = ['input_number.level', 'input_select.mode', 'input_text.note'];

  it('a number keeps its ruler, a select its chips, and a field no line more than it has live', async () => {
    const live = await drawn('helpers', { entities: ids });
    const lines = texts(live.root, '.in-field .fv-row__sub');
    document.body.replaceChildren();
    for (const kind of ['unavailable', 'unknown', 'missing'] as const) {
      const { root } = await drawn('helpers', { entities: ids }, away(kind, ...ids));
      expect(texts(root, '.in-field .fv-row__sub')).toEqual(lines);
      const ruler = root.querySelector('fluvy-ruler') as HTMLElement & { disabled: boolean };
      expect(ruler).not.toBeNull();
      expect(texts(root, '.fv-chip')).toEqual(['Home', 'Away']);
      if (kind !== 'unknown') {
        expect(ruler.disabled).toBe(true);
        inert(root, '.fv-chip');
        // the empty field says why
        expect(root.querySelector('input')!.placeholder).toBe(
          kind === 'missing' ? 'Entity not found' : 'Unavailable',
        );
      }
      document.body.replaceChildren();
    }
  });

  it('a timer gone missing is out of reach: "—", its command disabled', async () => {
    await drawn('timer', { entity: 'timer.oven' });
    document.body.replaceChildren();
    const { root } = await drawn('timer', { entity: 'timer.oven' }, away('missing', 'timer.oven'));
    expect(root.querySelector('article')!.classList.contains('is-unavailable')).toBe(true);
    expect(texts(root, '.fv-readout__value')).toEqual(['—']);
    expect(
      all(root, '.in-timer__cmds button').every((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});

describe('scenes and a room of lights out of reach', () => {
  it('a scene out of reach is its own tile in the off skin, alone and in a grid', async () => {
    for (const kind of ['unavailable', 'missing'] as const) {
      const one = await drawn('scene', { entity: 'scene.evening' }, away(kind, 'scene.evening'));
      const tile = one.root.querySelector('button')!;
      expect([...tile.classList]).toEqual(expect.arrayContaining(['fv-scene', 'fv-tile--off']));
      expect(tile.classList.contains('fv-tile')).toBe(false);
      document.body.replaceChildren();
      const grid = await drawn(
        'scenes',
        { scenes: ['scene.evening'] },
        away(kind, 'scene.evening'),
      );
      const cell = grid.root.querySelector('.fv-grid2 > button')!;
      expect([...cell.classList]).toEqual(expect.arrayContaining(['am-scene', 'fv-tile--off']));
      document.body.replaceChildren();
    }
  });

  it('a room keeps its switch and its button where they stand, disabled', async () => {
    const lights = ['light.a', 'light.b'];
    const chips = await drawn(
      'lights',
      { lights, variant: 'chips' },
      away('unavailable', ...lights),
    );
    expect(chips.root.querySelector('.fv-card__head .fv-hit')!.classList.contains('is-fixed')).toBe(
      true,
    );
    document.body.replaceChildren();
    const row = await drawn('lights', { lights, variant: 'row' }, away('missing', ...lights));
    expect(row.root.querySelector<HTMLButtonElement>('button.lt-room')?.disabled).toBe(true);
  });
});
