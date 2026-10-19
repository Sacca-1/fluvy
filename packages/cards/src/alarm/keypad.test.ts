// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluvyKeypad } from './keypad.js';

describe('the keypad in a popup', () => {
  afterEach(() => document.body.replaceChildren());

  it('keeps Escape and a touch to itself: a popup that listens on the window or on itself hears neither', async () => {
    // Bubble Card closes its popup on a window's Escape and slides it closed from a touch on itself
    const popup = document.createElement('div');
    const keypad = document.createElement('fluvy-keypad') as FluvyKeypad & {
      updateComplete: Promise<boolean>;
    };
    popup.append(keypad);
    document.body.append(popup);
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    popup.addEventListener('touchstart', heard);
    keypad.open({
      title: 'Disarm',
      sub: 'House · Armed away',
      primary: { key: 'disarm', label: 'Disarm', code: false },
      run: async () => true,
    });
    await keypad.updateComplete;
    const inside = keypad.shadowRoot!.querySelector<HTMLElement>('.fv-sheet__head .fv-round')!;
    inside.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    inside.dispatchEvent(new Event('touchstart', { bubbles: true, composed: true }));
    expect(heard).not.toHaveBeenCalled();
    // any other key still goes its way
    inside.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }));
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', heard);
  });
});

/**
 * The head's line is fitted before it is drawn, and drawn by the template alone: shortened by hand, the text Lit owns
 * lost its part, and every tick of the countdown threw from then on — no digit lit a dot, Disarm stayed disabled.
 */
describe('the keypad’s line in a narrow column', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  /** A docked keypad asking for a code, its line fitted to `room` on a stub ruler (8 px a glyph). */
  async function asking(room: number) {
    vi.useFakeTimers();
    const keypad = document.createElement('fluvy-keypad') as FluvyKeypad & {
      updateComplete: Promise<boolean>;
    };
    Object.assign((keypad as unknown as { head: object }).head, {
      ruler: { width: (_cls: string, text: string) => text.length * 8, clear() {} },
    });
    keypad.docked = true;
    document.body.append(keypad);
    const run = vi.fn(async () => true);
    keypad.open({
      title: 'Disarm',
      sub: '',
      primary: { key: 'alarm_disarm', label: 'Disarm', code: true },
      run,
    });
    await keypad.updateComplete;
    // the head's room, as its watch reads it once the sheet is laid out
    keypad.room_ = room;
    await keypad.updateComplete;
    const root = keypad.shadowRoot!;
    const line = (): HTMLElement =>
      root.querySelector<HTMLElement>('.fv-sheet__head .fv-card__sub')!;
    return { keypad, root, line, run };
  }

  it('draws the line it fits, the countdown leaving first, and draws it again as the seconds run', async () => {
    // a 211 column: 123 beside the close round — "Enter your code" (120) holds, with its countdown it does not
    const { keypad, line } = await asking(123);
    expect(line().textContent?.trim()).toBe('Enter your code');
    expect(line().getAttribute('aria-label')).toBe('Enter your code · 30 s');
    vi.advanceTimersByTime(1000);
    await keypad.updateComplete;
    expect(line().textContent?.trim()).toBe('Enter your code');
    expect(line().getAttribute('aria-label')).toBe('Enter your code · 29 s');
    // a 360 column holds all of it, said once
    keypad.room_ = 272;
    await keypad.updateComplete;
    expect(line().textContent?.trim()).toBe('Enter your code · 29 s');
    expect(line().hasAttribute('aria-label')).toBe(false);
  });

  it('lights a dot a digit and disarms with the code typed, in the narrow column as in the wide one', async () => {
    for (const room of [123, 272]) {
      const { keypad, root, run } = await asking(room);
      vi.advanceTimersByTime(400); // past the guard against the tap that opened it
      const keys = [...root.querySelectorAll<HTMLButtonElement>('.dv-key')];
      for (const index of [1, 4, 7, 9]) keys[index]!.click(); // 2 5 8 0
      vi.advanceTimersByTime(1000);
      await keypad.updateComplete;
      expect(root.querySelectorAll('.dv-code__dot.is-on')).toHaveLength(4);
      const disarm = root.querySelector<HTMLButtonElement>('.dv-actions .fv-btn--accent')!;
      expect(disarm.disabled).toBe(false);
      disarm.click();
      expect(run).toHaveBeenCalledWith('alarm_disarm', '2580');
      document.body.replaceChildren();
      vi.useRealTimers();
    }
  });
});
