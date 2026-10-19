import type { HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBOUNCE, repairsFor, severityOf, titleOf, type RepairIssue } from './repairs.js';

const issue = (id: string, extra: Partial<RepairIssue> = {}): RepairIssue => ({
  domain: 'zha',
  issue_id: id,
  severity: 'warning',
  created: '2026-10-17T10:00:00Z',
  ...extra,
});

/** A connection whose list Home Assistant answers from `issues`, its registry's word fired by `changed()`. */
function socket(issues: RepairIssue[]) {
  const listeners: Array<() => void> = [];
  const reads: number[] = [];
  let unsubscribed = 0;
  const hass = {
    language: 'en',
    localize: (key: string, values?: Record<string, unknown>) =>
      key === 'component.zha.issues.moved.title' ? `Moved to ${String(values?.['to'])}` : key,
    loadBackendTranslation: vi.fn(async () => hass.localize),
    callWS: vi.fn(async () => {
      reads.push(Date.now());
      return { issues: [...issues] };
    }),
    connection: {
      subscribeMessage: async (callback: () => void) => {
        listeners.push(callback);
        return () => {
          unsubscribed += 1;
        };
      },
    },
  } as unknown as HomeAssistant;
  return {
    hass,
    reads,
    changed: () => listeners.forEach((listener) => listener()),
    unsubscribed: () => unsubscribed,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the repairs an alert reads', () => {
  it('titles a repair in its integration’s words, else its id made readable', () => {
    const localize = (key: string, values?: Record<string, unknown>) =>
      key === 'component.zha.issues.moved.title' ? `Moved to ${String(values?.['to'])}` : key;
    expect(
      titleOf(
        localize,
        issue('x', { translation_key: 'moved', translation_placeholders: { to: 'B' } }),
      ),
    ).toBe('Moved to B');
    expect(titleOf(localize, issue('deprecated_yaml_import'))).toBe('Deprecated yaml import');
  });

  it('makes critical and error critical, a warning a warning', () => {
    expect(severityOf({ severity: 'critical' })).toBe('critical');
    expect(severityOf({ severity: 'error' })).toBe('critical');
    expect(severityOf({ severity: 'warning' })).toBe('warning');
  });

  it('reads the list once per connection, leaves the ignored ones out, and reads again half a second after the last word', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-17T12:00:00Z') });
    const house = socket([issue('a'), issue('b', { ignored: true })]);
    const store = repairsFor(house.hass);
    expect(repairsFor(house.hass)).toBe(store);
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    const other = store.subscribe(() => undefined);
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    expect(store.items.map((item) => item.id)).toEqual(['zha/a']);
    expect(store.rows()).toEqual([
      { id: 'zha/a', since: Date.parse('2026-10-17T10:00:00Z'), severity: 'warning' },
    ]);
    expect(house.reads).toHaveLength(1);
    // three words in a row: one read, half a second after the last
    house.changed();
    await vi.advanceTimersByTimeAsync(200);
    house.changed();
    await vi.advanceTimersByTimeAsync(200);
    house.changed();
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
    expect(house.reads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(house.reads).toHaveLength(2);
    // the last listener leaving lets go of the socket
    stop();
    expect(house.unsubscribed()).toBe(0);
    other();
    expect(house.unsubscribed()).toBe(1);
  });
});
