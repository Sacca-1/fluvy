import { strings, type HomeAssistant } from '@fluvy/core';
import { baseStyles } from '@fluvy/ui';
import { css, html, LitElement } from 'lit';

const s = strings('wall');

/*
 * The wall's notice, a small bar at the foot of the page with the way back: "Wall paused · Resume" while the wall
 * is paused (it stays as long as the pause does, which ends by itself when the screensaver would have come), or
 * "Wall mode off · Back to the wall" for a moment after the device left it.
 */
const WORDS = {
  paused: ['paused', 'resume'],
  left: ['left', 'return'],
} as const;

export class FluvyWallToast extends LitElement {
  static override properties = { hass: { attribute: false }, kind: {} };

  static override styles = [
    ...baseStyles,
    css`
      :host {
        position: fixed;
        left: 50%;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
        z-index: 7;
        transform: translateX(-50%);
        animation: rise 240ms ease;
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translate(-50%, 8px);
        }
      }
      .toast {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 44px;
        padding: 0 8px 0 16px;
        border-radius: var(--fluvy-radius-control, 12px);
        background: var(--fluvy-card);
        color: var(--fluvy-text);
        box-shadow:
          0 0 0 1px var(--fluvy-border),
          0 16px 32px -16px rgb(0 0 0 / 0.35);
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }
      button {
        height: 32px;
        padding: 0 12px;
        border: 0;
        border-radius: var(--fluvy-radius-control, 12px);
        background: var(--fluvy-accent-fill);
        color: var(--fluvy-accent-on-fill);
        font: inherit;
        cursor: pointer;
      }
    `,
  ];

  declare hass: HomeAssistant | undefined;
  declare kind: keyof typeof WORDS;
  onAction: () => void = () => undefined;

  constructor() {
    super();
    this.kind = 'paused';
  }

  protected override render() {
    const [text, action] = WORDS[this.kind];
    return html`<div class="toast" role="status">
      <span>${s(this.hass, text)}</span>
      <button @click=${() => this.onAction()}>${s(this.hass, action)}</button>
    </div>`;
  }
}
