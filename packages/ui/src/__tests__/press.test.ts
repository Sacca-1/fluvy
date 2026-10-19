// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clickPress, startPress, type PressTarget } from '../controls/pointer.js';

/** A pressable surface as a template binds it: `startPress` on its press, `clickPress` on its click. */
function surface(hold?: () => void) {
  const el = document.createElement('div') as PressTarget;
  const tap = vi.fn();
  el.fvTap = tap;
  if (hold) el.fvHold = hold;
  el.addEventListener('pointerdown', startPress as EventListener);
  el.addEventListener('click', clickPress as EventListener);
  document.body.append(el);
  return { el, tap };
}

const pointer = (type: string, init: PointerEventInit = {}): PointerEvent =>
  new PointerEvent(type, { bubbles: true, button: 0, pointerType: 'mouse', ...init });

/** A press from (0, 0) that ends `travel` px to the right, then the click the browser sends. */
function pressAndClick(el: Element, travel: number, pointerType = 'mouse', detail = 1): MouseEvent {
  el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerType }));
  window.dispatchEvent(pointer('pointermove', { clientX: travel, clientY: 0, pointerType }));
  window.dispatchEvent(pointer('pointerup', { clientX: travel, clientY: 0, pointerType }));
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail });
  el.dispatchEvent(click);
  return click;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('a press on a surface that taps and holds', () => {
  it('taps after a still press', () => {
    const { el, tap } = surface();
    pressAndClick(el, 0);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('never taps after a mouse that travelled 9 px (a drag), and swallows its click', () => {
    const { el, tap } = surface();
    const click = pressAndClick(el, 9);
    expect(tap).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
  });

  it('taps within the 8 px a hand shakes', () => {
    const { el, tap } = surface();
    pressAndClick(el, 8);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('leaves a finger’s travel to the browser (it cancels a pan’s click itself)', () => {
    const { el, tap } = surface();
    pressAndClick(el, 9, 'touch');
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('swallows the click of a held press', () => {
    vi.useFakeTimers();
    const hold = vi.fn();
    const { el, tap } = surface(hold);
    el.dispatchEvent(pointer('pointerdown', { pointerType: 'touch' }));
    vi.advanceTimersByTime(500);
    window.dispatchEvent(pointer('pointerup', { pointerType: 'touch' }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(hold).toHaveBeenCalledTimes(1);
    expect(tap).not.toHaveBeenCalled();
  });

  it('taps on a keyboard’s click after a held touch press whose click never came', () => {
    vi.useFakeTimers();
    const hold = vi.fn();
    const { el, tap } = surface(hold);
    el.dispatchEvent(pointer('pointerdown', { pointerType: 'touch' }));
    vi.advanceTimersByTime(500);
    window.dispatchEvent(pointer('pointerup', { pointerType: 'touch' }));
    // no click: the long press opened nothing; then Enter
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(hold).toHaveBeenCalledTimes(1);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('starts every press clean: a drag never spends the next tap', () => {
    const { el, tap } = surface();
    pressAndClick(el, 20);
    pressAndClick(el, 0);
    expect(tap).toHaveBeenCalledTimes(1);
  });
});
