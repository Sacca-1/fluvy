import { haptic, strings, type HomeAssistant, type WallExit } from '@fluvy/core';
import { glyph } from '@fluvy/ui';
import { css, html, LitElement, svg } from 'lit';

const s = strings('wall');

/*
 * The way out of a wall, in the top right corner, as the house chose it.
 *
 * A button (the default): a small × on a disc of the card's fill. It shows when the wall comes and whenever
 * someone is there — a touch, a pointer that moves, a key — and fades at rest, so a wall nobody is looking at has
 * nothing on it; while it is away it takes no touch (the tap that brings it back belongs to the dashboard, the
 * next one leaves). A tap leaves the wall.
 *
 * A hold: invisible until pressed. A hold of a second and a half fills a ring, the tablet taps back, and the wall
 * pauses; letting go before cancels.
 *
 * Nothing else on the page is a gesture of Fluvy's.
 */

const HOLD = 1500;
const RING = 2 * Math.PI * 18;
/** How long the button stays once nobody touches or moves anything; longer when the wall has just come. */
const REST_MS = 4000;
const FIRST_MS = 6000;
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;

export class FluvyWallCorner extends LitElement {
  static override properties = {
    mode: { reflect: true },
    hass: { attribute: false },
    pressing: { state: true },
    shown: { state: true },
  };

  static override styles = css`
    :host {
      position: fixed;
      /* under Home Assistant's header when a subview shows it (the controller sets the variable on <html>) */
      top: calc(env(safe-area-inset-top, 0px) + var(--fluvy-wall-top, 0px));
      right: env(safe-area-inset-right, 0px);
      z-index: 7;
      width: 44px;
      height: 44px;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }
    button {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
      color: var(--fluvy-accent, #8a6b2a);
    }

    /* the button: a 32 disc with the ×, there while someone is */
    .leave {
      color: var(--fluvy-text-secondary);
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms ease;
    }
    .leave.is-shown {
      opacity: 1;
      pointer-events: auto;
    }
    .disc {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--fluvy-card) 88%, transparent);
      /* it floats over whatever the dashboard has in its corner: the knob's drop says so */
      box-shadow:
        inset 0 0 0 1px var(--fluvy-border),
        var(--fluvy-shadow-knob);
      transition:
        transform 120ms ease,
        color 180ms ease;
    }
    .disc svg {
      width: 16px;
      height: 16px;
    }
    .leave:active .disc {
      transform: scale(0.94);
    }
    .leave:focus-visible {
      outline: none;
    }
    .leave:focus-visible .disc {
      box-shadow:
        inset 0 0 0 1px var(--fluvy-border),
        0 0 0 2px var(--fluvy-accent),
        var(--fluvy-shadow-knob);
    }
    @media (hover: hover) {
      .leave:hover .disc {
        color: var(--fluvy-text);
      }
    }

    /* the hold: a ring that fills */
    .ring {
      display: block;
      width: 44px;
      height: 44px;
      opacity: 0;
      transition: opacity 120ms ease;
    }
    .is-pressing .ring {
      opacity: 1;
    }
    .track {
      fill: none;
      stroke: currentColor;
      stroke-opacity: 0.2;
      stroke-width: 2;
    }
    .fill {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-dasharray: ${RING};
      stroke-dashoffset: ${RING};
      transform: rotate(-90deg);
      transform-origin: 22px 22px;
    }
    .is-pressing .fill {
      stroke-dashoffset: 0;
      transition: stroke-dashoffset ${HOLD}ms linear;
    }
    @media (prefers-reduced-motion: reduce) {
      .leave,
      .disc {
        transition: none;
      }
    }
  `;

  declare mode: WallExit;
  declare hass: HomeAssistant | undefined;
  declare pressing: boolean;
  declare shown: boolean;
  /** Called when the person leaves: the tap on the button, or the hold that completes. */
  onLeave: () => void = () => undefined;
  private timer = 0;
  private rest = 0;

  constructor() {
    super();
    this.mode = 'button';
    this.pressing = false;
    this.shown = true;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    for (const type of ACTIVITY)
      window.addEventListener(type, this.stir, { capture: true, passive: true });
    this.restIn(FIRST_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const type of ACTIVITY) window.removeEventListener(type, this.stir, { capture: true });
    clearTimeout(this.timer);
    clearTimeout(this.rest);
  }

  /** Someone is there: the button comes (at the next frame, so the touch that brought it is not its tap). */
  private readonly stir = (): void => {
    if (this.mode !== 'button') return;
    if (!this.shown) requestAnimationFrame(() => (this.shown = true));
    this.restIn(REST_MS);
  };

  private restIn(ms: number): void {
    clearTimeout(this.rest);
    this.rest = window.setTimeout(() => (this.shown = false), ms);
  }

  private readonly leave = (): void => {
    haptic(this, 'medium');
    this.onLeave();
  };

  private readonly start = (event: PointerEvent): void => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pressing = true;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.pressing = false;
      this.leave();
    }, HOLD);
  };

  private readonly cancel = (): void => {
    clearTimeout(this.timer);
    this.pressing = false;
  };

  protected override render() {
    if (this.mode === 'button') {
      const label = s(this.hass, 'leave_tap');
      return html`<button
        class="leave ${this.shown ? 'is-shown' : ''}"
        aria-label=${label}
        title=${label}
        tabindex=${this.shown ? 0 : -1}
        @click=${this.leave}
      >
        <span class="disc">${glyph('close')}</span>
      </button>`;
    }
    return html`<button
      class=${this.pressing ? 'is-pressing' : ''}
      aria-label=${s(this.hass, 'leave')}
      @pointerdown=${this.start}
      @pointerup=${this.cancel}
      @pointercancel=${this.cancel}
      @pointerleave=${this.cancel}
      @contextmenu=${(event: Event) => event.preventDefault()}
    >
      ${svg`<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="track" cx="22" cy="22" r="18"/><circle class="fill" cx="22" cy="22" r="18"/></svg>`}
    </button>`;
  }
}
