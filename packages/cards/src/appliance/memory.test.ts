// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetUnloaded, rememberUnloaded, unloadedAt, UNLOADED_EVENT } from './memory.js';

describe('"Unloaded", remembered', () => {
  afterEach(() => {
    forgetUnloaded();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('per appliance and per finish, for the cards on the page and the next visit', () => {
    const heard = vi.fn();
    window.addEventListener(UNLOADED_EVENT, heard);
    rememberUnloaded('lg-washer', 1000);
    expect(unloadedAt('lg-washer')).toBe(1000);
    expect(unloadedAt('lg-dryer')).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
    forgetUnloaded();
    expect(unloadedAt('lg-washer')).toBe(1000);
    window.removeEventListener(UNLOADED_EVENT, heard);
  });

  it('kept for the page where the browser keeps nothing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    rememberUnloaded('lg-washer', 2000);
    expect(unloadedAt('lg-washer')).toBe(2000);
  });
});
