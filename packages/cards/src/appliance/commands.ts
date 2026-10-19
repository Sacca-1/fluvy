import type { HassEntity, HomeAssistant, MessageKey } from '@fluvy/core';
import type { ApplianceKind } from './kinds.js';
import { stateOf } from './refs.js';
import { COMMUNITY_PLATFORMS, knownPlatform, type ApplianceRoles } from './roles.js';
import { busy, type ApplianceStatus } from './status.js';
import { setterFor, type Setter } from './zones.js';

/*
 * What a card can make an appliance do: start it, pause and resume it, stop it, switch it on and off, light it. Each
 * is a button's press, a select's option or a switch, as the integration's source says — and only for an integration
 * whose exact service and data are pinned by a contract test from that source (`commands.test.ts`, file and line
 * cited): LG ThinQ's operation select and power switch, Home Connect's active programme and its buttons, Miele's
 * buttons and power, SmartThings' operating state and buttons, Matter's buttons, Whirlpool's oven stop and light,
 * Tuya's kettle. Anything else — hOn, Electrolux, LG's older integration — is read and never written to (1.9.1). A
 * select's option is offered only when it is in the select's own options. Starting needs the appliance at rest and,
 * where it has one, its remote start on; stopping asks first, and so does switching off one that is not at rest (at
 * work, waiting to start, failed) and switching off what keeps food cold, whatever its compressor is doing.
 */

/** A control's cell, as a card names its controls (`controls`): resume shares start's, power is one toggle. */
export type CommandName = 'start' | 'pause' | 'stop' | 'power' | 'light';
export const COMMAND_NAMES: readonly CommandName[] = ['start', 'pause', 'stop', 'power', 'light'];

/** What a command does. */
export type Action = 'start' | 'pause' | 'resume' | 'stop' | 'power_on' | 'power_off' | 'light';

/** A service call, as `hass.callService` takes it (the entity in its data). */
export interface ServiceCall {
  readonly domain: string;
  readonly service: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface Command {
  /** The cell it fills. */
  readonly control: CommandName;
  readonly action: Action;
  readonly call: ServiceCall;
  /** Its words: the button's label (and its title). */
  readonly label: MessageKey;
  /**
   * Asked first, in Home Assistant's confirmation: stopping; switching off while it runs, while it waits to start or
   * has failed (`power_off_now`), and a fridge, a freezer or a wine cooler at any time (`power_off_cold`).
   */
  readonly confirm?: 'stop' | 'power_off' | 'power_off_now' | 'power_off_cold';
  /**
   * Why it cannot be done now (the cell drawn disabled, titled so): the appliance's remote start is off, or the
   * integration does not allow it at this moment (Miele's buttons are unavailable when their action is).
   */
  readonly blocked?: 'remote_off' | 'unavailable';
}

/**
 * The integrations whose commands are pinned, each by the source its contract test cites. Community integrations and
 * any not listed are read only.
 */
export const COMMANDS_PINNED: Readonly<Record<string, readonly Action[]>> = {
  lg_thinq: ['start', 'stop', 'power_on', 'power_off', 'light'],
  home_connect: ['start', 'pause', 'resume', 'stop', 'power_on', 'power_off', 'light'],
  miele: ['start', 'pause', 'resume', 'stop', 'power_on', 'power_off', 'light'],
  smartthings: ['start', 'pause', 'resume', 'stop', 'light'],
  // and a Matter outlet's on and off (matter/switch.py, the OnOff cluster): a plug's switch
  matter: ['start', 'pause', 'resume', 'stop', 'power_on', 'power_off'],
  whirlpool: ['stop', 'light'],
  tuya: ['start', 'stop', 'power_on', 'power_off', 'light'],
};

/** Whether an integration's appliance may be written to at all (a plug of any other integration may: it is a switch). */
export function writable(platform: string | undefined, action: Action): boolean {
  if (!knownPlatform(platform))
    return action === 'power_on' || action === 'power_off' || action === 'light';
  if ((COMMUNITY_PLATFORMS as readonly string[]).includes(platform)) return false;
  return COMMANDS_PINNED[platform]?.includes(action) ?? false;
}

/** What the commands are resolved from. */
export interface CommandInput {
  readonly hass: Pick<HomeAssistant, 'states'> | undefined;
  readonly platform: string | undefined;
  readonly roles: ApplianceRoles;
  readonly status: ApplianceStatus;
  /** What it is: switching off what keeps food cold always asks first. */
  readonly kind?: ApplianceKind | undefined;
}

/** What keeps food cold: off, it stops cooling, so a card asks first whatever its compressor is doing. */
const COLD: ReadonlySet<ApplianceKind> = new Set(['fridge', 'freezer', 'wine']);

/** A status at rest: switching it off loses nothing. */
const RESTING: ReadonlySet<ApplianceStatus> = new Set(['off', 'idle', 'finished', 'offline']);

/** What a card asks before switching an appliance off: nothing at rest, else why it asks. */
const offConfirm = (
  status: ApplianceStatus,
  kind: ApplianceKind | undefined,
): Command['confirm'] =>
  kind && COLD.has(kind)
    ? 'power_off_cold'
    : busy(status)
      ? 'power_off'
      : RESTING.has(status)
        ? undefined
        : 'power_off_now';

const domainOf = (id: string): string => id.slice(0, id.indexOf('.'));

const options = (state: HassEntity | undefined): readonly string[] => {
  const list = state?.attributes['options'];
  return Array.isArray(list)
    ? list.filter((option): option is string => typeof option === 'string')
    : [];
};

const press = (entity: string): ServiceCall => ({
  domain: 'button',
  service: 'press',
  data: { entity_id: entity },
});
const choose = (entity: string, option: string): ServiceCall => ({
  domain: 'select',
  service: 'select_option',
  data: { entity_id: entity, option },
});
const turn = (entity: string, on: boolean): ServiceCall => ({
  domain: domainOf(entity),
  service: on ? 'turn_on' : 'turn_off',
  data: { entity_id: entity },
});

/**
 * The call that does an action on an appliance of an integration, from the entities it found, as the integration's
 * source pins it; none where it has no way (LG cannot pause from Home Assistant) or the action is not pinned.
 */
export function callFor(
  hass: Pick<HomeAssistant, 'states'> | undefined,
  platform: string | undefined,
  roles: ApplianceRoles,
  action: Action,
): ServiceCall | undefined {
  if (!writable(platform, action)) return undefined;
  // what a select lists is its capability: a card can say what it could do while it is out of reach
  const state = (id: string | undefined): HassEntity | undefined => stateOf(hass, id);
  // a select's option, where the select lists it
  const option = (id: string | undefined, wanted: string): ServiceCall | undefined =>
    id && options(state(id)).includes(wanted) ? choose(id, wanted) : undefined;
  const button = (id: string | undefined): ServiceCall | undefined =>
    id && domainOf(id) === 'button' ? press(id) : undefined;
  const { operation, launch, program, start, pause, resume, stop, cancel, power, light } = roles;
  switch (action) {
    case 'start':
      switch (platform) {
        // lg_thinq/select.py: operation_mode's option "start", posted as it is
        case 'lg_thinq':
          return option(operation, 'start');
        // home_connect/select.py:99-106: choosing the active programme starts it; the one chosen on the appliance
        case 'home_connect': {
          const chosen = state(program)?.state;
          return chosen ? option(launch, chosen) : undefined;
        }
        // smartthings/select.py:170-197: the operating state's "run"; the dishwasher's start button otherwise
        case 'smartthings':
          return option(operation, 'run') ?? button(start);
        // tuya/switch.py:36-40: the kettle's "start" switch
        case 'tuya':
          return start && domainOf(start) === 'switch' ? turn(start, true) : undefined;
        // miele/button.py:59, matter/button.py:97-102: a start button
        default:
          return button(start);
      }
    case 'pause':
      return platform === 'smartthings'
        ? (option(operation, 'pause') ?? button(pause))
        : button(pause);
    case 'resume':
      if (platform === 'smartthings') return option(operation, 'run') ?? button(resume);
      // a paused Miele resumes by its start action (miele/const.py MieleActions.START)
      if (platform === 'miele') return button(start);
      return button(resume);
    case 'stop':
      switch (platform) {
        case 'lg_thinq':
          return option(operation, 'stop');
        case 'smartthings':
          return option(operation, 'stop') ?? button(stop) ?? button(cancel);
        case 'tuya':
          return start && domainOf(start) === 'switch' ? turn(start, false) : undefined;
        default:
          return button(stop);
      }
    case 'power_on':
    case 'power_off': {
      const on = action === 'power_on';
      if (power && domainOf(power) === 'switch') return turn(power, on);
      // lg_thinq/select.py: operation_mode's "power_on" and "power_off", where there is no power switch
      return platform === 'lg_thinq' ? option(operation, on ? 'power_on' : 'power_off') : undefined;
    }
    case 'light':
      return light
        ? { domain: domainOf(light), service: 'toggle', data: { entity_id: light } }
        : undefined;
  }
}

/** The entity a call acts on. */
const target = (call: ServiceCall): string => String(call.data['entity_id']);

/**
 * The commands an appliance can take now, a cell each, in the order a card lays them out (start or resume, pause,
 * stop, power, light): start at rest or done, resume while paused, pause while it runs, stop while it has a job (or
 * waits to start), switch off unless off, on when off, the light always. Each with what it asks first (stopping;
 * switching off one not at rest, or what keeps food cold) and why it cannot be done now.
 */
export function commandsOf(input: CommandInput): Command[] {
  const { hass, platform, roles, status, kind } = input;
  const running = status === 'running' || status === 'preheating';
  const remote = roles.remote ? hass?.states?.[roles.remote]?.state : undefined;
  const wanted: Array<readonly [CommandName, Action]> = [];
  if (status === 'paused') wanted.push(['start', 'resume']);
  else if (status === 'idle' || status === 'finished') wanted.push(['start', 'start']);
  if (running) wanted.push(['pause', 'pause']);
  if (busy(status) || status === 'scheduled') wanted.push(['stop', 'stop']);
  if (status !== 'offline') wanted.push(['power', status === 'off' ? 'power_on' : 'power_off']);
  wanted.push(['light', 'light']);
  const commands: Command[] = [];
  for (const [control, action] of wanted) {
    const call = callFor(hass, platform, roles, action);
    if (!call) continue;
    const state = hass?.states?.[target(call)];
    // SmartThings asks its remote control for everything; the others for a start (smartthings/button.py:110-140)
    const remoteOff =
      remote === 'off' &&
      (action === 'start' || (platform === 'smartthings' && action !== 'light'));
    const blocked =
      !state || state.state === 'unavailable'
        ? 'unavailable'
        : remoteOff
          ? 'remote_off'
          : undefined;
    const confirm =
      action === 'stop' ? 'stop' : action === 'power_off' ? offConfirm(status, kind) : undefined;
    commands.push({
      control,
      action,
      call,
      label: `appliance.${action}`,
      ...(confirm ? { confirm } : {}),
      ...(blocked ? { blocked } : {}),
    });
  }
  return commands;
}

/** The words of a command's confirmation and of a blocked cell's title. */
export const CONFIRM: Readonly<Record<NonNullable<Command['confirm']>, MessageKey>> = {
  stop: 'appliance.confirm_stop',
  power_off: 'appliance.confirm_power_off',
  power_off_now: 'appliance.confirm_power_off_now',
  power_off_cold: 'appliance.confirm_power_off_cold',
};
export const BLOCKED: Readonly<Record<NonNullable<Command['blocked']>, MessageKey>> = {
  remote_off: 'appliance.remote_off',
  unavailable: 'appliance.not_now',
};

/* ---------- choosing a programme, setting a temperature ---------- */

/**
 * The integrations whose programme select may be chosen from, each pinned by its source: Home Connect's selected
 * programme (select.py:108-114), SmartThings' dishwasher course (select.py:200-215, at rest), Matter's washer and
 * dishwasher modes (select.py:345-394), Whirlpool's and LG's oven cook modes, Tuya's kettle work mode.
 */
export const PROGRAMS_PINNED: readonly string[] = [
  'home_connect',
  'smartthings',
  'matter',
  'whirlpool',
  'lg_thinq',
  'tuya',
];

/** A programme to choose from: the select, its options in its order, the one chosen. */
export interface ProgramChoice {
  readonly entity: string;
  readonly options: readonly string[];
  readonly current: string | null;
}

/**
 * The programme select an appliance's programme chips choose from, at rest (a programme is chosen before it starts),
 * for an integration whose select is pinned; none otherwise.
 */
export function programChoice(input: CommandInput): ProgramChoice | undefined {
  const { hass, platform, roles, status } = input;
  const id = roles.program;
  if (!id || domainOf(id) !== 'select' || !PROGRAMS_PINNED.includes(platform ?? ''))
    return undefined;
  if (status !== 'idle' && status !== 'finished' && status !== 'off') return undefined;
  const state = hass?.states?.[id];
  const list = options(state);
  if (!state || state.state === 'unavailable' || !list.length) return undefined;
  return { entity: id, options: list, current: list.includes(state.state) ? state.state : null };
}

/** The call that chooses a programme. */
export const programCall = (choice: ProgramChoice, option: string): ServiceCall =>
  choose(choice.entity, option);

/**
 * The integrations whose target temperature (an oven's, a kettle's) may be set, each pinned by its source: Home
 * Connect's oven setpoint (number.py:124-128), LG's oven target (number.py), Whirlpool's oven targets (number.py),
 * Matter's cavity setpoint (number.py:616-636), Tuya's kettle (number.py:49-55).
 */
export const TARGETS_PINNED: readonly string[] = [
  'home_connect',
  'lg_thinq',
  'whirlpool',
  'matter',
  'tuya',
];

/** How an appliance's target temperature is set (a number's `set_value`), for an integration whose target is pinned. */
export function targetSetter(
  hass: Pick<HomeAssistant, 'states' | 'config'> | undefined,
  platform: string | undefined,
  roles: ApplianceRoles,
): Setter | undefined {
  const id = roles.target;
  if (!id || domainOf(id) !== 'number' || !TARGETS_PINNED.includes(platform ?? ''))
    return undefined;
  return setterFor(hass, stateOf(hass, id));
}

/* ---------- a fridge's quick modes, a filter's reset ---------- */

/**
 * The integrations whose fridge quick modes (`zones.ts` BOOSTS) may be switched from a card, each a switch whose
 * turning on and off its source pins: LG's express and rapid-freeze modes (lg_thinq/switch.py:142-163, :265-297), Home
 * Connect's super, eco, holiday, sabbath and child-lock settings (home_connect/switch.py:28-75, :218-266), Miele's
 * supercooling and superfreezing (miele/switch.py:52-80, :234-249), SmartThings' power cool, power freeze, ice maker
 * and sabbath mode (smartthings/switch.py:140-170, :457-473). Electrolux's is read only.
 */
export const BOOSTS_PINNED: readonly string[] = [
  'lg_thinq',
  'home_connect',
  'miele',
  'smartthings',
];

/** The call that switches a quick mode on or off, for an integration whose switches are pinned. */
export function boostCall(
  platform: string | undefined,
  entity: string,
  on: boolean,
): ServiceCall | undefined {
  return BOOSTS_PINNED.includes(platform ?? '') && domainOf(entity) === 'switch'
    ? turn(entity, on)
    : undefined;
}

/**
 * The integrations whose maintenance resets a card may press (it asks first): SmartThings' water, hood and HEPA
 * filter resets (smartthings/button.py:36-55, pressed as the capability's command, :179-186), Matter's filter
 * conditions (matter/button.py:117-143, ResetCondition). The others' are left to their own pages.
 */
export const RESETS_PINNED: readonly string[] = ['smartthings', 'matter'];

/** The call that resets a maintenance item, for an integration whose reset button is pinned. */
export const resetCall = (platform: string | undefined, entity: string): ServiceCall | undefined =>
  RESETS_PINNED.includes(platform ?? '') && domainOf(entity) === 'button'
    ? press(entity)
    : undefined;
