import { haptic, strings, type HomeAssistant } from '@fluvy/core';
import { glyph } from '@fluvy/ui';
import { css, html, LitElement } from 'lit';

const s = strings('wall');

/*
 * The way back from a subview on a wall, at the top left: a pill on the card's fill — the corner's disc, grown to hold
 * a chevron and the view's title — on the corner's line (centred 22 down, in a 44 target). It is there for as long as
 * the subview is (navigation is never hidden); a tap goes back as Home Assistant's own arrow does.
 */
export class FluvyWallBack extends LitElement {
  static override properties = { hass: { attribute: false }, title: {} };

  static override styles = css`
    :host {
      position: fixed;
      top: env(safe-area-inset-top, 0px);
      inset-inline-start: env(safe-area-inset-left, 0px);
      z-index: 7;
      -webkit-tap-highlight-color: transparent;
      animation: arrive 200ms ease both;
    }
    @keyframes arrive {
      from {
        opacity: 0;
      }
    }
    button {
      display: flex;
      align-items: center;
      height: 44px;
      max-width: calc(50vw - 24px);
      /* the pill sits 6 from the edge, as the corner's 32 disc does in its 44 square */
      padding: 0 6px;
      border: 0;
      background: none;
      font: inherit;
      cursor: pointer;
    }
    .pill {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      height: 32px;
      padding-inline: 6px 12px;
      border-radius: 16px;
      background: color-mix(in srgb, var(--fluvy-card) 88%, transparent);
      /* it floats over whatever the dashboard has under it: the knob's drop says so, as the corner's disc */
      box-shadow:
        inset 0 0 0 1px var(--fluvy-border),
        var(--fluvy-shadow-knob);
      color: var(--fluvy-text);
      transition: transform 120ms ease;
    }
    .pill svg {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      color: var(--fluvy-text-secondary);
    }
    :host(:dir(rtl)) .pill svg {
      transform: scaleX(-1);
    }
    .title {
      overflow: hidden;
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    button:active .pill {
      transform: scale(0.94);
    }
    button:focus-visible {
      outline: none;
    }
    button:focus-visible .pill {
      box-shadow:
        inset 0 0 0 1px var(--fluvy-border),
        0 0 0 2px var(--fluvy-accent),
        var(--fluvy-shadow-knob);
    }
    @media (prefers-reduced-motion: reduce) {
      :host,
      .pill {
        animation: none;
        transition: none;
      }
    }
  `;

  declare hass: HomeAssistant | undefined;
  declare title: string;
  /** Called on the tap: Home Assistant's own way back. */
  onBack: () => void = () => undefined;

  constructor() {
    super();
    this.title = '';
  }

  private readonly back = (): void => {
    haptic(this, 'light');
    this.onBack();
  };

  protected override render() {
    const words = this.title || s(this.hass, 'back');
    return html`<button
      aria-label=${this.title ? s(this.hass, 'back_to', { view: this.title }) : words}
      @click=${this.back}
    >
      <span class="pill">${glyph('chevronLeft')}<span class="title">${words}</span></span>
    </button>`;
  }
}
