// @vitest-environment happy-dom
import { nothing, render } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { head, toggle, type HeadOptions } from '../parts.js';

/** A head drawn into the document, with its parts. */
function drawn(options: Partial<HeadOptions> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  render(head({ icon: 'bulb', title: 'Living room ceiling', ...options }), host);
  const row = host.querySelector<HTMLElement>('.fv-card__head')!;
  return {
    row,
    button: row.querySelector<HTMLButtonElement>('.fv-card__tap'),
    title: row.querySelector<HTMLElement>('.fv-card__title')!,
  };
}

/** A pointer's click: `detail` 1, as a mouse or a finger gives it (a keyboard's is 0). */
const click = (target: Element, detail = 1): MouseEvent => {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail,
  });
  target.dispatchEvent(event);
  return event;
};

const press = (target: Element, init: PointerEventInit = {}): void => {
  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      button: 0,
      pointerType: 'mouse',
      ...init,
    }),
  );
};

const key = (target: Element, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  window.dispatchEvent(new PointerEvent('pointerup'));
});

describe('the head is the card’s button', () => {
  it('makes the title a button, its name the title’s own words, and the circle a passive span', () => {
    const { row, button, title } = drawn({ onTap: () => undefined, name: true });
    expect(row.classList.contains('fv-card__head--tap')).toBe(true);
    expect(button).not.toBeNull();
    expect(button!.parentElement).toBe(title);
    expect(button!.textContent?.trim()).toBe('Living room ceiling');
    expect(button!.hasAttribute('aria-label')).toBe(false);
    // a name keeps its ellipsis on the button that now carries it
    expect(button!.hasAttribute('data-name')).toBe(true);
    expect(row.querySelector('button.fv-ico, .fv-ico--tap')).toBeNull();
    expect(row.querySelector('span.fv-ico')).not.toBeNull();
    expect(row.querySelectorAll('button')).toHaveLength(1);
  });

  it('keeps its button when the circle gave way to the name (#42)', () => {
    const tap = vi.fn();
    const { row, button } = drawn({ icon: null, onTap: tap });
    expect(row.querySelector('.fv-ico')).toBeNull();
    click(button!);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('draws no button and no tap class where the card has no tap', () => {
    const { row, button } = drawn({ onHold: () => undefined });
    expect(button).toBeNull();
    expect(row.classList.contains('fv-card__head--tap')).toBe(false);
    expect(row.classList.contains('fv-card__head--hold')).toBe(true);
  });

  it('reads a label where the title alone says less, and the whole title where it is cut', () => {
    const { button } = drawn({ onTap: () => undefined, label: 'Home · Sunny', cut: true });
    expect(button!.getAttribute('aria-label')).toBe('Home · Sunny');
    expect(button!.getAttribute('title')).toBe('Living room ceiling');
    expect(drawn({ onTap: () => undefined }).button!.hasAttribute('title')).toBe(false);
  });

  it('runs the tap once, and a control in the row runs its own alone', () => {
    const tap = vi.fn();
    const flip = vi.fn();
    const { row, button } = drawn({ onTap: tap, trailing: toggle(false, 'light', flip, 'Lamp') });
    click(button!);
    expect(tap).toHaveBeenCalledTimes(1);
    click(row.querySelector('.fv-hit')!);
    expect(flip).toHaveBeenCalledWith(true);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('holds on a still press and swallows the click that follows', () => {
    vi.useFakeTimers();
    const tap = vi.fn();
    const hold = vi.fn();
    const { button } = drawn({ onTap: tap, onHold: hold });
    press(button!);
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new PointerEvent('pointerup'));
    const event = click(button!);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(tap).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('holds from the keyboard (the menu key, Shift+F10), and Enter’s click taps', () => {
    const tap = vi.fn();
    const hold = vi.fn();
    const { button } = drawn({ onTap: tap, onHold: hold });
    expect(key(button!, { key: 'ContextMenu' }).defaultPrevented).toBe(true);
    key(button!, { key: 'F10', shiftKey: true });
    expect(hold).toHaveBeenCalledTimes(2);
    key(button!, { key: 'F10' });
    expect(hold).toHaveBeenCalledTimes(2);
    click(button!, 0);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('leaves the keyboard’s menu key alone on a head that does not hold', () => {
    const { button } = drawn({ onTap: () => undefined });
    expect(key(button!, { key: 'ContextMenu' }).defaultPrevented).toBe(false);
  });

  it('draws the same markup as before for a head with neither action', () => {
    const { row } = drawn({ trailing: nothing });
    expect(row.className.trim()).toBe('fv-card__head');
    expect(row.querySelector('button')).toBeNull();
  });
});
