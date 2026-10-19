import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  boostCall,
  callFor,
  commandsOf,
  programCall,
  programChoice,
  resetCall,
  targetSetter,
  writable,
  type Action,
  type CommandInput,
} from './commands.js';
import { allFixtures, hcDishwasherDone, houseOf } from './fixtures/index.js';
import { applianceEntities } from './roles.js';
import type { ApplianceStatus } from './status.js';

/*
 * The writes, pinned. Each brand's contract cites the source that says exactly which service a command calls and with
 * what data — Home Assistant's own integrations at home-assistant/core@54c620cef968dd042184735d9a58070aaee901fb
 * (2026-10-17), under homeassistant/components/ — so a change upstream that breaks one is a change these tests make
 * someone read. hOn, Electrolux and LG's older integration are read only (1.9.1).
 */

const NOW = Date.parse('2026-10-17T12:00:00Z');
const HOUSE = houseOf(allFixtures(NOW), NOW);

const input = (
  device: string,
  status: ApplianceStatus,
  hass: HomeAssistant = HOUSE,
): CommandInput => ({
  hass,
  platform: Object.values(hass.entities).find((entry) => entry.device_id === device)?.platform,
  roles: applianceEntities(hass, device).roles,
  status,
});
const call = (device: string, action: Action, hass: HomeAssistant = HOUSE) => {
  const { platform, roles } = input(device, 'idle', hass);
  return callFor(hass, platform, roles, action);
};
/** A house with some states changed. */
const withStates = (changes: Record<string, string>): HomeAssistant => ({
  ...HOUSE,
  states: Object.fromEntries(
    Object.entries(HOUSE.states).map(([id, state]) => [
      id,
      id in changes ? { ...state, state: changes[id] ?? '' } : state,
    ]),
  ),
});

describe('the writes each brand pins', () => {
  it('LG ThinQ: its operation select’s "start" and "stop", its power switch', () => {
    // lg_thinq/select.py:79-82 (washer operation_mode), :212-220 (posts the option as it is)
    expect(call('lg-washer', 'start')).toEqual({
      domain: 'select',
      service: 'select_option',
      data: { entity_id: 'select.waschmaschine_betrieb', option: 'start' },
    });
    expect(call('lg-washer', 'stop')?.data).toEqual({
      entity_id: 'select.waschmaschine_betrieb',
      option: 'stop',
    });
    // lg_thinq/switch.py:36-37 (operation_power), :265-297 (turn on and off)
    expect(call('lg-washer', 'power_off')).toEqual({
      domain: 'switch',
      service: 'turn_off',
      data: { entity_id: 'switch.waschmaschine_strom' },
    });
    // no pause from Home Assistant: its select has none (strings.json select.operation_mode)
    expect(call('lg-washer', 'pause')).toBeUndefined();
    // where there is no power switch, the select's "power_off", only where it lists it
    expect(call('lg-dryer', 'power_off')?.data).toEqual({
      entity_id: 'select.trockner_betrieb',
      option: 'power_off',
    });
    expect(call('lg-dryer', 'power_on')).toBeUndefined();
  });

  it('Home Connect: start by choosing the active programme (the one chosen), its buttons, its power', () => {
    // home_connect/select.py:99-106 (active_program starts the programme it is set to), :458-466
    expect(call('hc-dish', 'start')).toEqual({
      domain: 'select',
      service: 'select_option',
      data: {
        entity_id: 'select.geschirrspuler_aktives_programm',
        option: 'dishcare_dishwasher_program_eco_50',
      },
    });
    // home_connect/button.py:36-45 (pause_program, resume_program), :103-110 (put_command); :128-139 (stop_program)
    expect(call('hc-dish', 'pause')).toEqual({
      domain: 'button',
      service: 'press',
      data: { entity_id: 'button.geschirrspuler_programm_pausieren' },
    });
    expect(call('hc-dish', 'resume')?.data).toEqual({
      entity_id: 'button.geschirrspuler_programm_fortsetzen',
    });
    expect(call('hc-dish', 'stop')?.data).toEqual({
      entity_id: 'button.geschirrspuler_programm_stoppen',
    });
    // home_connect/switch.py:79-81 (power), :275-330 (on, and off to its own off state)
    expect(call('hc-dish', 'power_on')).toEqual({
      domain: 'switch',
      service: 'turn_on',
      data: { entity_id: 'switch.geschirrspuler_strom' },
    });
    // a chosen programme the active select does not list starts nothing
    expect(
      call(
        'hc-dish',
        'start',
        withStates({ 'select.geschirrspuler_ausgewahltes_programm': 'none' }),
      ),
    ).toBeUndefined();
  });

  it('Miele: its start, pause and stop buttons (resume is its start), its power switch', () => {
    // miele/button.py:58-100 (start, stop, pause), :148-154 (send_action with the button's action)
    expect(call('miele-washer', 'start')).toEqual({
      domain: 'button',
      service: 'press',
      data: { entity_id: 'button.miele_waschmaschine_start' },
    });
    expect(call('miele-washer', 'resume')?.data).toEqual({
      entity_id: 'button.miele_waschmaschine_start',
    });
    expect(call('miele-washer', 'pause')?.data).toEqual({
      entity_id: 'button.miele_waschmaschine_pause',
    });
    expect(call('miele-washer', 'stop')?.data).toEqual({
      entity_id: 'button.miele_waschmaschine_stopp',
    });
    // miele/switch.py:106, :235-243
    expect(call('miele-washer', 'power_off')?.data).toEqual({
      entity_id: 'switch.miele_waschmaschine_strom',
    });
  });

  it('SmartThings: its operating state’s run, pause and stop; a dishwasher’s buttons; an oven’s stop', () => {
    // smartthings/select.py:189-197 (washer operating_state, options its supported machine states), :494-510
    expect(call('st-washer', 'start')).toEqual({
      domain: 'select',
      service: 'select_option',
      data: { entity_id: 'select.samsung_waschmaschine', option: 'run' },
    });
    expect(call('st-washer', 'pause')?.data).toEqual({
      entity_id: 'select.samsung_waschmaschine',
      option: 'pause',
    });
    expect(call('st-washer', 'resume')?.data).toEqual({
      entity_id: 'select.samsung_waschmaschine',
      option: 'run',
    });
    expect(call('st-washer', 'stop')?.data).toEqual({
      entity_id: 'select.samsung_waschmaschine',
      option: 'stop',
    });
    // smartthings/button.py:61-91 (the dishwasher's start, pause, resume, cancel), :179-186 (press)
    expect(call('st-dish', 'start')?.data).toEqual({
      entity_id: 'button.samsung_geschirrspuler_start',
    });
    expect(call('st-dish', 'stop')?.data).toEqual({
      entity_id: 'button.samsung_geschirrspuler_abbrechen',
    });
    // smartthings/button.py:33-37 (the oven's stop)
    expect(call('st-oven', 'stop')?.data).toEqual({ entity_id: 'button.samsung_backofen_stopp' });
    // its appliances' own switch is deprecated (switch.py:365-400): no power
    expect(call('st-washer', 'power_off')).toBeUndefined();
  });

  it('Matter: its operational state’s buttons, its power switch', () => {
    // matter/button.py:70-115 (pause, resume, start, stop), :47-51 (press sends the command)
    for (const [action, id] of [
      ['start', 'button.spulmaschine_kuche_start'],
      ['pause', 'button.spulmaschine_kuche_pause'],
      ['resume', 'button.spulmaschine_kuche_fortsetzen'],
      ['stop', 'button.spulmaschine_kuche_stopp'],
    ] as const)
      expect(call('matter-dish', action)).toEqual({
        domain: 'button',
        service: 'press',
        data: { entity_id: id },
      });
    // matter/switch.py:301-330 (power), :94-103
    expect(call('matter-dish', 'power_off')?.data).toEqual({
      entity_id: 'switch.spulmaschine_kuche_strom',
    });
  });

  it('Whirlpool: an oven cavity’s stop and light; nothing for its washers and dryers', () => {
    // whirlpool/button.py:32-45 (oven_stop per cavity), entity.py:80-86 (the cavity's suffix)
    expect(call('wp-oven', 'stop')).toEqual({
      domain: 'button',
      service: 'press',
      data: { entity_id: 'button.herd_stopp_oben' },
    });
    // whirlpool/light.py:42-58
    expect(call('wp-oven', 'light')).toEqual({
      domain: 'light',
      service: 'toggle',
      data: { entity_id: 'light.herd_licht_oben' },
    });
    expect(call('wp-washer', 'start')).toBeUndefined();
    expect(call('wp-washer', 'stop')).toBeUndefined();
  });

  it('Tuya: a kettle’s start switch, on to start and off to stop', () => {
    // tuya/switch.py:36-40 (the kettle's "start"), :1035-1044
    expect(call('tuya-kettle', 'start')).toEqual({
      domain: 'switch',
      service: 'turn_on',
      data: { entity_id: 'switch.wasserkocher_start' },
    });
    expect(call('tuya-kettle', 'stop')).toEqual({
      domain: 'switch',
      service: 'turn_off',
      data: { entity_id: 'switch.wasserkocher_start' },
    });
  });

  it('the community’s integrations are read only; a plug of any other is a switch', () => {
    for (const action of [
      'start',
      'pause',
      'resume',
      'stop',
      'power_on',
      'power_off',
      'light',
    ] as const) {
      expect(writable('hon', action), action).toBe(false);
      expect(writable('electrolux_status', action), action).toBe(false);
      expect(writable('smartthinq_sensors', action), action).toBe(false);
    }
    expect(call('aeg-washer', 'start')).toBeUndefined();
    expect(call('stq-washer', 'stop')).toBeUndefined();
    expect(call('plug-washer', 'power_off')).toEqual({
      domain: 'switch',
      service: 'turn_off',
      data: { entity_id: 'switch.waschmaschine_keller' },
    });
    expect(writable('shelly', 'start')).toBe(false);
  });
});

describe('the commands an appliance takes now', () => {
  const cells = (device: string, status: ApplianceStatus, hass: HomeAssistant = HOUSE) =>
    commandsOf(input(device, status, hass)).map((command) =>
      [command.control, command.action, command.confirm ?? '', command.blocked ?? '']
        .join(' ')
        .trim(),
    );

  it('starts at rest, pauses while running, resumes while paused, stops while busy, asks before stopping', () => {
    expect(cells('hc-dish', 'running')).toEqual([
      'pause pause',
      'stop stop stop',
      'power power_off power_off',
    ]);
    expect(cells('hc-dish', 'paused')).toEqual([
      'start resume',
      'stop stop stop',
      'power power_off power_off',
    ]);
    expect(cells('hc-dish', 'idle')).toEqual(['start start', 'power power_off']);
    expect(cells('hc-dish', 'off')).toEqual(['power power_on']);
    expect(cells('hc-dish', 'offline')).toEqual([]);
    expect(cells('hc-oven', 'running')).toEqual([
      'stop stop stop',
      'power power_off power_off',
      'light light',
    ]);
  });

  it('asks before switching off one that is not at rest, and what keeps food cold whatever its compressor does (#47)', () => {
    // at rest or done, a tap switches it off; at work, waiting to start or failed, Home Assistant's dialog asks first
    const off = (device: string, status: ApplianceStatus, kind?: 'fridge' | 'freezer' | 'wine') =>
      commandsOf({ ...input(device, status), ...(kind ? { kind } : {}) }).find(
        (command) => command.action === 'power_off',
      )?.confirm;
    expect(off('plug-washer', 'idle')).toBeUndefined();
    expect(off('plug-washer', 'finished')).toBeUndefined();
    expect(off('plug-washer', 'running')).toBe('power_off');
    expect(off('lg-washer', 'error')).toBe('power_off_now');
    expect(off('hc-dish', 'scheduled')).toBe('power_off_now');
    expect(off('hc-dish', 'attention')).toBe('power_off');
    // a fridge, a freezer or a wine cooler on a plug: its compressor idle or running, the same question
    for (const kind of ['fridge', 'freezer', 'wine'] as const)
      for (const status of ['idle', 'running', 'error'] as const)
        expect(off('plug-washer', status, kind), `${kind} ${status}`).toBe('power_off_cold');
  });

  it('greys a start the appliance’s remote start forbids, and a button the integration says is not allowed now', () => {
    expect(cells('lg-dryer', 'idle')).toEqual(['start start  remote_off', 'power power_off']);
    expect(
      cells('hc-dish', 'idle', withStates({ 'binary_sensor.geschirrspuler_fernstart': 'off' })),
    ).toEqual(['start start  remote_off', 'power power_off']);
    // Miele's start button is unavailable while its action is not allowed
    expect(cells('miele-washer', 'idle')[0]).toBe('start start  unavailable');
    // SmartThings asks its remote control for everything
    expect(cells('st-dish', 'running')).toEqual([
      'pause pause  remote_off',
      'stop stop stop remote_off',
    ]);
  });

  it('offers only an option the select lists', () => {
    const select = HOUSE.states['select.waschmaschine_betrieb'];
    const noStart = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        ...(select ? { [select.entity_id]: { ...select, attributes: { options: ['stop'] } } } : {}),
      },
    } as HomeAssistant;
    expect(cells('lg-washer', 'idle', noStart)).toEqual(['power power_off']);
    expect(cells('lg-washer', 'running', noStart)).toEqual([
      'stop stop stop',
      'power power_off power_off',
    ]);
  });
});

describe('choosing a programme, setting a temperature', () => {
  it('chooses from a pinned programme select, at rest', () => {
    const choice = programChoice(input('hc-dish', 'idle'));
    expect(choice).toEqual({
      entity: 'select.geschirrspuler_ausgewahltes_programm',
      options: [
        'dishcare_dishwasher_program_auto_2',
        'dishcare_dishwasher_program_eco_50',
        'dishcare_dishwasher_program_quick_45',
        'dishcare_dishwasher_program_intensiv_70',
      ],
      current: 'dishcare_dishwasher_program_eco_50',
    });
    // home_connect/select.py:108-114 (selected_program sets the programme chosen)
    expect(choice && programCall(choice, 'dishcare_dishwasher_program_quick_45')).toEqual({
      domain: 'select',
      service: 'select_option',
      data: {
        entity_id: 'select.geschirrspuler_ausgewahltes_programm',
        option: 'dishcare_dishwasher_program_quick_45',
      },
    });
    // not while it runs; never a sensor's programme; never a community select's
    expect(programChoice(input('hc-dish', 'running'))).toBeUndefined();
    expect(programChoice(input('miele-washer', 'idle'))).toBeUndefined();
    expect(programChoice(input('aeg-washer', 'idle'))).toBeUndefined();
    expect(programChoice(input('wp-oven', 'idle'))?.entity).toBe('select.herd_garmodus_oben');
    const done = houseOf([hcDishwasherDone(NOW)], NOW);
    expect(programChoice(input('hc-dish', 'finished', done))?.current).toBe(
      'dishcare_dishwasher_program_eco_50',
    );
  });

  it('sets a pinned oven’s or kettle’s target by its number', () => {
    const at = (device: string) => {
      const { platform, roles } = input(device, 'running');
      return targetSetter(HOUSE, platform, roles);
    };
    // home_connect/number.py:124-128 (the oven's setpoint), :256-258
    expect(at('hc-oven')).toEqual({
      domain: 'number',
      service: 'set_value',
      field: 'value',
      min: 30,
      max: 300,
      step: 5,
      unit: '°C',
    });
    // whirlpool/number.py:54, :64; tuya/number.py:49-55, :638
    expect(at('wp-oven')).toMatchObject({ domain: 'number', min: 77, max: 288 });
    expect(at('tuya-kettle')).toMatchObject({ domain: 'number', min: 40, max: 100, step: 5 });
    // a sensor's target is read, not set
    expect(at('st-oven')).toBeUndefined();
  });
});

describe('a fridge’s quick modes and a filter’s reset, pinned', () => {
  it('switches the quick modes of the integrations whose switches are pinned, never the community’s', () => {
    // lg_thinq/switch.py:142-163 (express_fridge, rapid_freeze), :265-297 (turn on and off)
    expect(boostCall('lg_thinq', 'switch.kuhlschrank_express_kuhlen', true)).toEqual({
      domain: 'switch',
      service: 'turn_on',
      data: { entity_id: 'switch.kuhlschrank_express_kuhlen' },
    });
    // home_connect/switch.py:28-75, :218-266 (set_setting); miele/switch.py:52-80, :234-249; smartthings/switch.py:140-170
    for (const platform of ['home_connect', 'miele', 'smartthings'])
      expect(boostCall(platform, 'switch.x_super', false)?.service).toBe('turn_off');
    // Electrolux (the community's) is read only; a boost is a switch, never a select
    expect(boostCall('electrolux_status', 'switch.x_fastmode', true)).toBeUndefined();
    expect(boostCall('lg_thinq', 'select.x_mode', true)).toBeUndefined();
  });

  it('presses the resets SmartThings’ and Matter’s filters have, never another integration’s', () => {
    // smartthings/button.py:36-55 (reset_water_filter, reset_hood_filter, reset_hepa_filter), :179-186
    expect(resetCall('smartthings', 'button.kuhlschrank_wasserfilter_zurucksetzen')).toEqual({
      domain: 'button',
      service: 'press',
      data: { entity_id: 'button.kuhlschrank_wasserfilter_zurucksetzen' },
    });
    // matter/button.py:117-143 (ResetCondition)
    expect(resetCall('matter', 'button.filter_reset')?.service).toBe('press');
    expect(resetCall('home_connect', 'button.x')).toBeUndefined();
    expect(resetCall('smartthings', 'switch.x')).toBeUndefined();
  });
});
