import { describe, expect, it } from 'vitest';
import {
  applianceStatus,
  busy,
  statusOfWord,
  stepOf,
  stepsOf,
  type ApplianceStatus,
} from './status.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const MINUTE = 60_000;
const status = (
  state: string | undefined,
  more: Partial<Parameters<typeof applianceStatus>[0]> = {},
) => applianceStatus({ state, now: NOW, doneFor: 120 * MINUTE, ...more });

describe('what an appliance is doing', () => {
  it('folds every integration’s state words into the card’s few', () => {
    const table: ReadonlyArray<readonly [string, string, ApplianceStatus]> = [
      // Home Connect (sensor.py:80-91)
      ['home_connect', 'inactive', 'off'],
      ['home_connect', 'ready', 'idle'],
      ['home_connect', 'delayedstart', 'scheduled'],
      ['home_connect', 'run', 'running'],
      ['home_connect', 'pause', 'paused'],
      ['home_connect', 'actionrequired', 'attention'],
      ['home_connect', 'finished', 'finished'],
      ['home_connect', 'error', 'error'],
      ['home_connect', 'aborting', 'running'],
      // Miele (strings.json status)
      ['miele', 'off', 'off'],
      ['miele', 'on', 'idle'],
      ['miele', 'programmed', 'idle'],
      ['miele', 'waiting_to_start', 'scheduled'],
      ['miele', 'in_use', 'running'],
      ['miele', 'pause', 'paused'],
      ['miele', 'program_ended', 'finished'],
      ['miele', 'failure', 'error'],
      ['miele', 'program_interrupted', 'error'],
      ['miele', 'rinse_hold', 'paused'],
      ['miele', 'service', 'attention'],
      ['miele', 'superheating', 'preheating'],
      ['miele', 'reserved', 'idle'],
      ['miele', 'not_connected', 'offline'],
      // LG ThinQ (strings.json current_state)
      ['lg_thinq', 'power_off', 'off'],
      ['lg_thinq', 'initial', 'idle'],
      ['lg_thinq', 'reservation', 'scheduled'],
      ['lg_thinq', 'reserved', 'scheduled'],
      ['lg_thinq', 'spinning', 'running'],
      ['lg_thinq', 'cooking_in_progress', 'running'],
      ['lg_thinq', 'preheating', 'preheating'],
      ['lg_thinq', 'pause', 'paused'],
      ['lg_thinq', 'end', 'finished'],
      ['lg_thinq', 'error', 'error'],
      ['lg_thinq', 'firmware', 'idle'],
      // SmartThings (machine states)
      ['smartthings', 'run', 'running'],
      ['smartthings', 'stop', 'idle'],
      ['smartthings', 'running', 'running'],
      ['smartthings', 'ready', 'idle'],
      // Matter
      ['matter', 'stopped', 'idle'],
      ['matter', 'running', 'running'],
      ['matter', 'paused', 'paused'],
      ['matter', 'error', 'error'],
      // Whirlpool
      ['whirlpool', 'cycle_rinsing', 'running'],
      ['whirlpool', 'delay_countdown', 'scheduled'],
      ['whirlpool', 'complete', 'finished'],
      ['whirlpool', 'hard_stop_or_error', 'error'],
      ['whirlpool', 'standby', 'idle'],
      ['whirlpool', 'preheating', 'preheating'],
      // Electrolux, title-cased
      ['electrolux_status', 'Running', 'running'],
      ['electrolux_status', 'End Of Cycle', 'finished'],
      ['electrolux_status', 'Ready To Start', 'idle'],
      ['electrolux_status', 'Delayed Start', 'scheduled'],
      ['electrolux_status', 'Alarm', 'error'],
      // LG's older integration, in English
      ['smartthinq_sensors', 'Power off', 'off'],
      ['smartthinq_sensors', 'Rinsing', 'running'],
      ['smartthinq_sensors', 'End', 'finished'],
      // Tuya's kettle
      ['tuya', 'heating', 'running'],
      ['tuya', 'standby', 'idle'],
    ];
    for (const [platform, word, expected] of table)
      expect(statusOfWord(word, platform), `${platform} ${word}`).toBe(expected);
    expect(statusOfWord('unknown')).toBeUndefined();
    expect(statusOfWord('')).toBeUndefined();
    expect(status('unavailable')).toBe('offline');
  });

  it('reads hOn’s numbers, a dishwasher’s apart: its 3 is a delayed start, a washer’s a pause', () => {
    expect(statusOfWord('2', 'hon', 'washer')).toBe('running');
    expect(statusOfWord('3', 'hon', 'washer')).toBe('paused');
    expect(statusOfWord('3', 'hon', 'dishwasher')).toBe('scheduled');
    expect(statusOfWord('5', 'hon', 'dishwasher')).toBe('idle');
    expect(statusOfWord('7', 'hon', 'dryer')).toBe('finished');
    expect(statusOfWord('0', 'hon')).toBe('offline');
  });

  it('calls an LG washer that powered off within the done time of completing finished, and off after', () => {
    const completedAt = NOW - 40 * MINUTE;
    expect(status('power_off', { platform: 'lg_thinq', completedAt })).toBe('finished');
    expect(status('power_off', { platform: 'lg_thinq', completedAt: NOW - 3 * 60 * MINUTE })).toBe(
      'off',
    );
    expect(status('power_off', { platform: 'lg_thinq', completedAt: null })).toBe('off');
    // one that completed and still runs a step is running
    expect(status('wrinkle_care', { platform: 'lg_thinq', completedAt })).toBe('running');
  });

  it('calls a stopped machine whose job says finished finished, and reads a phase where there is no state', () => {
    expect(status('stop', { phase: 'finish', platform: 'smartthings' })).toBe('finished');
    expect(status(undefined, { phase: 'rinsing' })).toBe('running');
    // a plug: its running flag, else its switch
    expect(status(undefined, { running: true })).toBe('running');
    expect(status(undefined, { running: false, power: true })).toBe('idle');
    expect(status(undefined, { power: true })).toBe('idle');
    expect(status(undefined, { power: false })).toBe('off');
    expect(status(undefined)).toBe('idle');
  });

  it('has a job while it runs, preheats, pauses or asks for attention', () => {
    expect(
      ['running', 'preheating', 'paused', 'attention'].every((s) => busy(s as ApplianceStatus)),
    ).toBe(true);
    expect(['idle', 'finished', 'scheduled', 'off'].some((s) => busy(s as ApplianceStatus))).toBe(
      false,
    );
  });
});

describe('the steps of a cycle', () => {
  it('folds each integration’s phase words into a kind’s steps', () => {
    expect(stepOf('washer', 'main_wash')).toBe('wash');
    expect(stepOf('washer', 'rinses')).toBe('rinse');
    expect(stepOf('washer', 'cycle_spinning')).toBe('spin');
    expect(stepOf('washer', 'Spinning')).toBe('spin');
    expect(stepOf('washer', 'pre_wash')).toBe('prewash');
    expect(stepOf('dishwasher', 'pre_dishwash')).toBe('prewash');
    expect(stepOf('dishwasher', 'main_dishwash')).toBe('wash');
    expect(stepOf('dishwasher', 'final_rinse')).toBe('rinse');
    // a dishwasher drains in its rinse; it has no spin
    expect(stepOf('dishwasher', 'drain')).toBe('rinse');
    expect(stepOf('dishwasher', 'drying')).toBe('dry');
    expect(stepOf('dryer', 'extra_dry')).toBe('dry');
    expect(stepOf('dryer', 'cooling')).toBe('cool');
    expect(stepOf('dryer', 'wrinkle_prevent')).toBe('anti_crease');
    expect(stepOf('washer_dryer', 'drying')).toBe('dry');
    // a washer does not dry, an oven has no steps
    expect(stepOf('washer', 'drying')).toBeUndefined();
    expect(stepOf('oven', 'heating')).toBeUndefined();
    expect(stepOf('washer', undefined)).toBeUndefined();
  });

  it('shows a kind’s steps in order, a washer’s prewash where it prewashes', () => {
    expect(stepsOf('washer')).toEqual(['wash', 'rinse', 'spin']);
    expect(stepsOf('washer', 'prewash')).toEqual(['prewash', 'wash', 'rinse', 'spin']);
    expect(stepsOf('washer_dryer')).toEqual(['wash', 'rinse', 'spin', 'dry']);
    expect(stepsOf('dishwasher')).toEqual(['prewash', 'wash', 'rinse', 'dry']);
    expect(stepsOf('dryer')).toEqual(['dry', 'cool', 'anti_crease']);
    expect(stepsOf('fridge')).toEqual([]);
  });
});
