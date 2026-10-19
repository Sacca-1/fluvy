import { describe, expect, it } from 'vitest';
import { alertKey, definitionOf, definitionsOf, type AlertConfig } from './model.js';
import { PRESET_NAMES, PRESETS } from './presets.js';
import { lookOf, SEVERITY_TONE } from './severity.js';
import { clockSeconds, durationMs, instantAt, wallNow } from './time.js';

const CARD = 'fluvy-alerts-card';
const read = (config: AlertConfig, index = 0) => definitionOf(config, index, CARD);

describe('an alert definition', () => {
  it('reads a preset in one line: its words, glyph, severity and defaults', () => {
    const battery = read({ preset: 'low_battery' });
    expect(battery).toMatchObject({
      preset: 'low_battery',
      source: 'states',
      name: undefined,
      title: 'alerts.preset.low_battery',
      icon: 'battery',
      severity: 'warning',
      countBy: 'device',
      nameBy: 'device',
      sortRows: 'value',
      minCount: 1,
      split: false,
      snooze: true,
    });
    expect(battery.clauses).toHaveLength(3);
    expect(read({ preset: 'hazards' }).severity).toBe('critical');
    expect(read({ preset: 'updates' }).rowButton).toMatchObject({
      when: 'installable',
      admin_only: true,
    });
    expect(read({ preset: 'ha_alerts' }).split).toBe(true);
    expect(read({ preset: 'repairs' })).toMatchObject({
      source: 'repairs',
      adminOnly: true,
      clauses: [],
    });
  });

  it('lets the person say anything over a preset', () => {
    const own = read({
      preset: 'open',
      name: 'Front door',
      icon: 'mdi:door',
      severity: 'critical',
      tone: 'heat',
      color: '#ff8800',
      count_by: 'device',
      row_button: false,
      admin_only: true,
    });
    expect(own).toMatchObject({
      name: 'Front door',
      icon: 'mdi:door',
      severity: 'critical',
      tone: 'heat',
      color: '#ff8800',
      countBy: 'device',
      rowButton: undefined,
      adminOnly: true,
    });
  });

  it('narrows a preset by the alert’s own keys, but not by the ones the preset reads', () => {
    const battery = read({ preset: 'low_battery', below: 15, area: 'kitchen' });
    for (const clause of battery.clauses) expect(clause.parts[0]).toEqual({ area: 'kitchen' });
    expect(battery.clauses[0]?.parts[1]).toMatchObject({ below: 15 });
    // without own keys, the preset's clauses alone
    expect(read({ preset: 'hazards' }).clauses[0]?.parts).toHaveLength(1);
  });

  it('is one clause of its own keys without a preset or `match`, and `match`’s clauses with it', () => {
    const door = read({
      entity: 'binary_sensor.door',
      state: 'on',
      for: { minutes: 5 },
      name: 'Door',
    });
    expect(door.clauses).toEqual([
      {
        parts: [{ entity: 'binary_sensor.door', state: 'on' }],
        forMs: 300_000,
        unchangedMs: undefined,
        includeUnavailable: false,
        hidden: false,
        diagnostic: true,
      },
    ]);
    const either = read({
      area: 'garage',
      for: 60,
      match: [
        { domain: 'cover', state: 'open', for: 600 },
        { domain: 'binary_sensor', state: 'on' },
      ],
    });
    expect(either.clauses.map((clause) => clause.parts)).toEqual([
      [{ area: 'garage' }, { domain: 'cover', state: 'open', for: 600 }],
      [{ area: 'garage' }, { domain: 'binary_sensor', state: 'on' }],
    ]);
    // a clause's own modifier, else the alert's
    expect(either.clauses.map((clause) => clause.forMs)).toEqual([600_000, 60_000]);
  });

  it('takes a modifier from the clause, else the alert, else the preset', () => {
    expect(read({ preset: 'unavailable' }).clauses[0]).toMatchObject({
      forMs: 300_000,
      diagnostic: false,
    });
    expect(read({ preset: 'unavailable', for: 0, diagnostic: true }).clauses[0]).toMatchObject({
      forMs: 0,
      diagnostic: true,
    });
    expect(read({ preset: 'unlocked' }).clauses[0]?.forMs).toBe(600_000);
  });

  it('puts the preset’s exclusions beside the alert’s', () => {
    expect(read({ preset: 'low_battery' }).exclude).toEqual([{ integration: 'mobile_app' }]);
    expect(read({ preset: 'low_battery', phones: true }).exclude).toEqual([]);
    expect(read({ preset: 'unavailable', exclude: 'media_player.*' }).exclude).toEqual([
      'media_player.*',
      { domain: ['button', 'event', 'scene'] },
    ]);
  });

  it('reads an escalation', () => {
    expect(read({ preset: 'open', escalate: { for: { minutes: 30 } } }).escalate).toEqual({
      forMs: 1_800_000,
      count: undefined,
      severity: 'critical',
    });
    expect(read({ preset: 'open', escalate: { count: 3, severity: 'warning' } }).escalate).toEqual({
      forMs: undefined,
      count: 3,
      severity: 'warning',
    });
  });

  it('says what is wrong in one readable error naming the alert', () => {
    const wrong = (config: unknown, text: string, index = 0): void =>
      expect(() => definitionOf(config, index, CARD)).toThrow(`${CARD}: alerts[${index}]: ${text}`);
    wrong('low_battery', 'an alert is a set of keys');
    wrong({ preset: 'batery' }, 'unknown preset "batery" (low_battery, unavailable,');
    wrong({ name: 'Nothing' }, 'give it a preset, or what it matches');
    wrong({ preset: 'open', severity: 'high' }, '"severity" must be info, warning or critical');
    wrong({ preset: 'open', tone: 'pink' }, 'unknown tone "pink"');
    wrong({ preset: 'open', for: 'soon' }, '"for" is not a duration');
    wrong({ domain: 'sensor', below: 'low' }, '"below" must be a number');
    wrong({ entity_id: '/[a-/' }, '"/[a-/" is not a regular expression');
    wrong({ preset: 'open', count_by: 'room' }, '"count_by" must be entity or device');
    wrong({ preset: 'open', min_count: 0 }, '"min_count" must be a whole number, 1 or more');
    wrong({ preset: 'open', escalate: {} }, '"escalate" needs a "for", a "count" or both');
    wrong(
      { preset: 'open', actions: [{ name: 'x' }] },
      'a button (row_button, actions) needs a tap_action',
    );
    wrong({ match: 'sensor.a' }, '"match" takes a clause or a list of clauses', 3);
  });
});

describe('an alert’s key', () => {
  it('is its id when it has one', () => {
    expect(alertKey({ id: 'front', preset: 'open' })).toBe('front');
  });

  it('is its preset and a hash of what it matches: renaming or recolouring keeps it, matching else changes it', () => {
    const base = alertKey({ preset: 'open', area: 'hall' });
    expect(base).toMatch(/^open:[0-9a-z]+$/);
    expect(
      alertKey({ area: 'hall', preset: 'open', name: 'Hall', color: 'red', severity: 'critical' }),
    ).toBe(base);
    expect(alertKey({ preset: 'open', area: 'kitchen' })).not.toBe(base);
    expect(alertKey({ preset: 'low_battery', below: 10 })).not.toBe(
      alertKey({ preset: 'low_battery' }),
    );
    expect(alertKey({ domain: 'light', state: 'on' })).toMatch(/^custom:/);
  });

  it('is made unique in a card: a twin takes the next number', () => {
    const keys = definitionsOf({
      type: `custom:${CARD}`,
      alerts: [{ preset: 'open' }, { preset: 'open' }, { preset: 'hazards' }],
    }).map((definition) => definition.key);
    expect(keys[1]).toBe(`${keys[0]}#2`);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('a card’s alerts', () => {
  it('are none for an empty or absent list, and one error for a list that is not one', () => {
    expect(definitionsOf({ type: CARD })).toEqual([]);
    expect(definitionsOf({ type: CARD, alerts: [] })).toEqual([]);
    expect(() => definitionsOf({ type: CARD, alerts: 'low_battery' })).toThrow(
      `${CARD}: "alerts" must be a list`,
    );
  });

  it('keep their config order as their index', () => {
    const alerts = definitionsOf({
      type: CARD,
      alerts: PRESET_NAMES.map((preset) => ({ preset })),
    });
    expect(alerts.map((alert) => alert.index)).toEqual(PRESET_NAMES.map((_, i) => i));
    expect(alerts.map((alert) => alert.title)).toEqual(
      PRESET_NAMES.map((name) => PRESETS[name].title),
    );
  });
});

describe('severity', () => {
  it('maps to its tone; a tone by name outranks it; a colour never covers it', () => {
    expect(SEVERITY_TONE).toEqual({ critical: 'danger', warning: 'warning', info: 'notice' });
    expect(lookOf('critical', {})).toEqual({ tone: 'danger', color: undefined });
    expect(lookOf('critical', { tone: 'heat' }).tone).toBe('heat');
    expect(lookOf('warning', { color: 'orange' })).toEqual({ tone: 'warning', color: 'orange' });
  });
});

describe('time', () => {
  it('reads a span as Home Assistant writes one', () => {
    expect(durationMs(90)).toBe(90_000);
    expect(durationMs('300')).toBe(300_000);
    expect(durationMs('00:05')).toBe(300_000);
    expect(durationMs('01:30:15')).toBe(5_415_000);
    expect(durationMs('36:00:00')).toBe(129_600_000);
    expect(durationMs({ minutes: 5, seconds: 30 })).toBe(330_000);
    expect(durationMs({ days: 1, milliseconds: 5 })).toBe(86_400_005);
    for (const wrong of [
      -1,
      'soon',
      '5m',
      {},
      { minutes: -1 },
      { weeks: 1 },
      null,
      [5],
      Number.NaN,
    ])
      expect(durationMs(wrong), String(wrong)).toBeUndefined();
  });

  it('reads a time of day', () => {
    expect(clockSeconds('22:00')).toBe(79_200);
    expect(clockSeconds('06:30:15')).toBe(23_415);
    for (const wrong of ['24:00', '8:00 AM', '7', '', 7])
      expect(clockSeconds(wrong)).toBeUndefined();
  });

  it('finds the instant a wall clock in a zone shows', () => {
    const date = { year: 2026, month: 10, day: 18 };
    // Madrid is two hours ahead of UTC in October, New York four behind
    expect(instantAt(date, 8 * 3600, 'Europe/Madrid')).toBe(Date.UTC(2026, 9, 18, 6));
    expect(instantAt(date, 8 * 3600, 'America/New_York')).toBe(Date.UTC(2026, 9, 18, 12));
    expect(wallNow(Date.UTC(2026, 9, 17, 23, 30), 'Europe/Madrid')).toMatchObject({
      day: 18,
      weekday: 'sun',
      second: 5400,
    });
  });
});
