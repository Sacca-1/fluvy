// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELD_MS, Nudges, SETTLE_MS } from './nudge.js';

describe('a setpoint stepped from a card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ten quick taps are one call, with the value the last tap left, once they settle', () => {
    const changed = vi.fn();
    const send = vi.fn();
    const nudges = new Nudges(changed);
    for (let tap = 0; tap < 10; tap++) {
      nudges.step('number.fridge', Number(nudges.shown('number.fridge', 4)) + 1, send);
      vi.advanceTimersByTime(100);
    }
    expect(send).not.toHaveBeenCalled();
    expect(nudges.shown('number.fridge', 4)).toBe(14);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(14);
  });

  it('holds the value stepped to until the appliance reports it, or five seconds', () => {
    const nudges = new Nudges(() => undefined);
    nudges.step('number.fridge', 5, () => undefined);
    expect(nudges.shown('number.fridge', 4)).toBe(5);
    // reported: the held value lets go at once
    expect(nudges.shown('number.fridge', 5)).toBe(5);
    expect(nudges.shown('number.fridge', 4)).toBe(4);
    // never reported: what the appliance says wins again after five seconds
    nudges.step('number.fridge', 6, () => undefined);
    vi.advanceTimersByTime(HELD_MS);
    expect(nudges.shown('number.fridge', 4)).toBe(4);
  });

  it('a card that leaves the page sends nothing more', () => {
    const send = vi.fn();
    const nudges = new Nudges(() => undefined);
    nudges.step('number.fridge', 5, send);
    nudges.clear();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(send).not.toHaveBeenCalled();
  });
});
