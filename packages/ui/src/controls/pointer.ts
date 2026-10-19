import { zoomOf } from './zoom.js';

/**
 * Pointer tracking shared by the ruler and the dial. Pointer Events (not a gesture library): no
 * 10 px dead zone, pointer capture, coalesced moves. Scroll keeps working: the control declares
 * `touch-action: pan-y` (or pan-x) and the drag only claims the gesture once the finger has clearly
 * moved along the control's own axis.
 */
export interface DragSample {
  /** Where the pointer is, in viewport pixels (what a `getBoundingClientRect()` compares with). */
  readonly x: number;
  readonly y: number;
  /** How far it has travelled since the press, in the target's OWN pixels: a zoomed control moves by its own length. */
  readonly dx: number;
  readonly dy: number;
  readonly event: PointerEvent;
}

export interface DragCallbacks {
  /** Return false to ignore the gesture (disabled, wrong button…). */
  start(sample: DragSample): boolean;
  move(sample: DragSample): void;
  /** `moved` is false for a tap: the pointer never travelled past the intent threshold. */
  end(sample: DragSample, moved: boolean): void;
}

const INTENT = 4;

export function trackDrag(target: HTMLElement, callbacks: DragCallbacks): () => void {
  let id = -1;
  let ox = 0;
  let oy = 0;
  let zoom = 1;
  let moved = false;

  const sample = (event: PointerEvent): DragSample => ({
    x: event.clientX,
    y: event.clientY,
    dx: (event.clientX - ox) / zoom,
    dy: (event.clientY - oy) / zoom,
    event,
  });

  const down = (event: PointerEvent): void => {
    if (id !== -1 || (event.pointerType === 'mouse' && event.button !== 0)) return;
    ox = event.clientX;
    oy = event.clientY;
    zoom = zoomOf(target); // read once: the size cannot change under a finger
    moved = false;
    if (!callbacks.start(sample(event))) return;
    id = event.pointerId;
    try {
      target.setPointerCapture(id);
    } catch {
      /* the pointer is already gone */
    }
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerId !== id) return;
    const s = sample(event);
    if (!moved && Math.hypot(s.dx, s.dy) < INTENT) return;
    moved = true;
    callbacks.move(s);
  };
  const up = (event: PointerEvent): void => {
    if (event.pointerId !== id) return;
    id = -1;
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    callbacks.end(sample(event), moved);
  };
  // Capture can go away without a pointerup or pointercancel (the element is moved in the DOM, another
  // script releases it, the OS takes the pointer): the gesture ends where it was instead of sticking.
  const lost = (event: PointerEvent): void => {
    if (event.pointerId === id) up(event);
  };

  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('lostpointercapture', lost);
  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    target.removeEventListener('lostpointercapture', lost);
    if (id !== -1) {
      id = -1;
    }
  };
}

/** Precision gain: the further the finger drifts away from the control's axis, the finer the drag (down to 10×). */
export const precisionGain = (offAxis: number): number =>
  Math.min(1, Math.max(0.1, 1 / (1 + Math.max(0, Math.abs(offAxis) - 24) / 48)));

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Snaps to the step grid anchored at `min`, without accumulating float error. `max` is always reachable
 * even when it is off the grid (0–100 by 3, 5–35 by 50): the top of a scale must mean the top.
 * A non-finite value lands on `min`.
 */
export function snap(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  if (!(step > 0)) return clamp(value, min, max);
  const decimals = decimalsOf(step);
  const lower = Number((min + Math.floor((value - min) / step) * step).toFixed(decimals));
  const upper = Number((lower + step).toFixed(decimals));
  if (upper > max) return clamp(value - lower < max - value ? lower : max, min, max);
  return clamp(value - lower < upper - value ? lower : upper, min, max);
}

/** Decimal places a step needs (0.5 → 1, 0.25 → 2, 1e-7 → 6): keeps snapped values free of float noise. */
export function decimalsOf(step: number): number {
  if (!(step > 0)) return 0;
  for (let d = 0; d < 6; d++)
    if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-9) return d;
  return 6;
}

/**
 * A usable [min, max] out of whatever a card passed: NaN falls back, a reversed pair is swapped and an
 * empty range stays empty (the control draws inert instead of dividing by zero).
 */
export function saneRange(
  min: number,
  max: number,
  fallbackMin = 0,
  fallbackMax = 100,
): readonly [number, number] {
  const a = Number.isFinite(min) ? min : fallbackMin;
  const b = Number.isFinite(max) ? max : Number.isFinite(min) ? min : fallbackMax;
  return a <= b ? [a, b] : [b, a];
}

/** The step a control moves by: the card's, or a hundredth of the range when it passed none (0, NaN, negative). */
export function stepOf(step: number, min: number, max: number): number {
  if (step > 0) return step;
  const span = max - min;
  return span > 0 ? span / 100 : 1;
}

/**
 * The value a key asks of a slider-like control (the ARIA slider's keys) from `current`: the arrows a step (five with
 * Shift), Page Up / Down a tenth of the range (at least a step), Home / End its ends. `undefined`: a key the control
 * does not answer, or a chord with Alt, Ctrl or Meta (the page's).
 */
export function keyValue(
  event: KeyboardEvent,
  current: number,
  min: number,
  max: number,
  inc: number,
): number | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
  const steps = event.shiftKey ? 5 : 1;
  const big = Math.max(inc, (max - min) / 10);
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return current + inc * steps;
    case 'ArrowLeft':
    case 'ArrowDown':
      return current - inc * steps;
    case 'PageUp':
      return current + big;
    case 'PageDown':
      return current - big;
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return undefined;
  }
}

/* ---------- stepper buttons rendered by templates ---------- */

/** A stepper half as the template renders it: Lit refreshes `fvStep` on every render. */
export interface StepButton extends HTMLElement {
  fvStep?: (direction: 1 | -1) => void;
}

let stepDelay = 0;
let stepInterval = 0;

export function stopStepRepeat(): void {
  clearTimeout(stepDelay);
  clearInterval(stepInterval);
  stepDelay = 0;
  stepInterval = 0;
}

/**
 * Press-and-hold repeat for stepper halves rendered by a template. Two things make it safe:
 * the repeat always calls the button's CURRENT handler (the element's `fvStep` property, which the
 * template refreshes on every render — a closure captured at press time would count from a stale
 * value), and there is ONE repeat for the whole page, stopped by any pointer end, by the button
 * leaving the document, or by the next press. A repeat can never outlive its press.
 */
export function startStepRepeat(event: PointerEvent, direction: 1 | -1): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const button = event.currentTarget as StepButton;
  stopStepRepeat();
  const fire = (): void => {
    if (!button.isConnected || (button as unknown as HTMLButtonElement).disabled) {
      stopStepRepeat();
      return;
    }
    button.fvStep?.(direction);
  };
  fire();
  stepDelay = window.setTimeout(() => {
    stepInterval = window.setInterval(fire, 110);
  }, 420);
  window.addEventListener('pointerup', stopStepRepeat, { once: true });
  window.addEventListener('pointercancel', stopStepRepeat, { once: true });
  window.addEventListener('blur', stopStepRepeat, { once: true });
}

/** A tappable surface as the template renders it: Lit refreshes `fvTap` / `fvHold` on every render. */
export interface PressTarget extends HTMLElement {
  fvTap?: () => void;
  fvHold?: () => void;
}

const HOLD_MS = 500;
const HOLD_SLOP = 8; // px of travel that turns a press into a scroll

let pressTarget: PressTarget | null = null;
let pressTimer = 0;
let pressHeld = false;
/** A mouse or pen press that travelled: a drag (a selection, a scroll by hand), whose click is no tap. */
let pressMoved = false;
let pressX = 0;
let pressY = 0;

function cancelHold(): void {
  clearTimeout(pressTimer);
  pressTimer = 0;
}

function movePress(event: PointerEvent): void {
  if (Math.hypot(event.clientX - pressX, event.clientY - pressY) <= HOLD_SLOP) return;
  cancelHold();
  // a finger's pan is the browser's to tell from a tap, and it cancels the click itself; a mouse's drag it does not
  if (event.pointerType !== 'touch') pressMoved = true;
}

function endPress(): void {
  cancelHold();
  window.removeEventListener('pointermove', movePress);
}

/**
 * Tap-or-hold for a whole tile. The hold fires after 500 ms without travel and calls the element's
 * CURRENT `fvHold`; the click that follows is then swallowed, so a hold never also taps — nor does a
 * mouse or pen press that travelled more than 8 px (a drag). One press for the whole page, like the
 * stepper repeat; a new press always starts clean, so a hold whose click never came (touch long-press)
 * cannot swallow the next tap.
 */
export function startPress(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const target = event.currentTarget as PressTarget;
  endPress();
  pressTarget = target;
  pressHeld = false;
  pressMoved = false;
  pressX = event.clientX;
  pressY = event.clientY;
  if (target.fvHold) {
    pressTimer = window.setTimeout(() => {
      pressTimer = 0;
      if (!target.isConnected) return;
      pressHeld = true;
      target.fvHold?.();
    }, HOLD_MS);
  }
  window.addEventListener('pointermove', movePress);
  window.addEventListener('pointerup', endPress, { once: true });
  window.addEventListener('pointercancel', endPress, { once: true });
  window.addEventListener('blur', endPress, { once: true });
}

/**
 * The click of a pressable surface: the tap, unless this press was held (its hold already ran) or dragged. A
 * keyboard's click (Enter, Space: `detail` 0) always taps — a held touch press whose click never came cannot
 * swallow it.
 */
export function clickPress(event: MouseEvent): void {
  const target = event.currentTarget as PressTarget;
  const spent = event.detail !== 0 && pressTarget === target && (pressHeld || pressMoved);
  pressHeld = false;
  pressMoved = false;
  pressTarget = null;
  if (spent) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  target.fvTap?.();
}

/** A long press must not open the browser's menu on the tile. */
export function preventMenu(event: Event): void {
  event.preventDefault();
}

/**
 * The keyboard's hold on a surface that holds: the menu key, or Shift+F10 (a still press of 500 ms is a pointer's).
 * The browser's own menu does not open over it.
 */
export const holdKey =
  (hold: (() => void) | undefined) =>
  (event: KeyboardEvent): void => {
    if (hold && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
      event.preventDefault();
      hold();
    }
  };

/**
 * Where the pointer is along the element that received the event, 0..1 — a mouse scrubs by hovering,
 * a finger only while pressing (a resting finger is about to scroll). `null` = not scrubbing.
 */
export function scrubFraction(event: PointerEvent): number | null {
  if (event.pointerType !== 'mouse' && event.buttons === 0 && event.type !== 'pointerdown')
    return null;
  const target = event.currentTarget as HTMLElement;
  if (event.type === 'pointerdown' && event.pointerType !== 'mouse')
    target.setPointerCapture?.(event.pointerId);
  const rect = target.getBoundingClientRect();
  if (!(rect.width > 0)) return null;
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
}
