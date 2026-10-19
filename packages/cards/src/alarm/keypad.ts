import { haptic, localize, strings, type HomeAssistant } from '@fluvy/core';
import { baseStyles, glyph, round, sheetStyles } from '@fluvy/ui';
import {
  LitElement,
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { HeadFit } from '../energy/head.js';

const k = strings('keypad');

export interface KeypadAction {
  readonly key: string;
  readonly label: string;
  /** Whether this action has to carry the typed code. */
  readonly code: boolean;
}

export interface KeypadRequest {
  /** What the sheet is about to do: "Disarm", "Unlock". */
  readonly title: string;
  /** Second line when no code is asked for ("Front door · Locked"). With a code it is the prompt and the countdown. */
  readonly sub: string;
  /** The filled button of the pair. */
  readonly primary: KeypadAction;
  /** The quiet button of the pair. Left out, it is Cancel. */
  readonly secondary?: KeypadAction | undefined;
  /** Number of digits, when the entity states it (a lock's `^\d{4}$`). */
  readonly length?: number | undefined;
  /** Whether a typed code is complete. Default: at least one digit. */
  readonly accepts?: ((code: string) => boolean) | undefined;
  /** Performs the action. Resolves false when Home Assistant refused it (a wrong code): the sheet stays open. */
  run(key: string, code: string | undefined): Promise<boolean>;
}

/** Seconds without a key press after which the sheet closes and the digits are forgotten. */
const IDLE_S = 30;
const MAX_DIGITS = 10;
/** A press this soon after opening is the tail of the tap that opened the sheet, not a decision. */
const GUARD_MS = 350;
const LEAVE_MS = 200;
const KEYS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

/**
 * What the dialog keeps to itself, sitting in a popup (Bubble Card's) that closes on a window's Escape and slides
 * closed from a touch on itself: Escape closes the keypad alone (the dialog's own cancel still runs), and a touch that
 * starts in it is the keypad's.
 */
const keepEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') event.stopPropagation();
};
const keepTouch = { handleEvent: (event: Event): void => event.stopPropagation(), passive: true };

/**
 * The keypad sheet of the devices sheet: title, prompt and countdown, code dots, 72 × 56 keys and the
 * paired buttons — in a modal bottom sheet. Without a code to ask for it is the same sheet minus the
 * keys: a confirmation, so that a disarm or an unlatch is never one tap.
 *
 * The digits live in a private field of this element and nowhere else: never in the DOM, an
 * attribute, a reactive property or a label. They are dropped when they are handed over, when the
 * sheet closes, after 30 s without a key, when the tab is hidden and when the element is removed.
 */
export class FluvyKeypad extends LitElement {
  static override styles: CSSResultGroup = [
    ...baseStyles,
    sheetStyles.devices,
    css`
      :host(:not([docked])) {
        display: contents;
      }
      /* a title of words takes a second line at its words in a narrow sheet (tr "Devre dışı bırak"), and the head
         grows with it */
      .fv-sheet__head {
        height: auto;
        min-height: 44px;
      }
      dialog {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        overflow: hidden;
        background: color-mix(in srgb, var(--fluvy-neutral-05) 48%, transparent);
        color: inherit;
        touch-action: none;
        overscroll-behavior: contain;
        animation: fv-fade 240ms var(--fv-ease) both;
      }
      dialog[open] {
        display: flex;
      }
      dialog::backdrop {
        background: none;
      }
      @keyframes kp-up {
        from {
          transform: translateY(100%);
        }
        to {
          transform: none;
        }
      }
      @keyframes kp-down {
        to {
          transform: translateY(100%);
        }
      }
      @keyframes kp-out {
        to {
          opacity: 0;
        }
      }
      dialog .fv-sheet {
        max-width: 392px;
        max-height: 100%;
        overflow-y: auto;
        touch-action: pan-y;
        overscroll-behavior: contain;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
        animation: kp-up 320ms var(--fv-ease-out) both;
      }
      dialog.is-leaving {
        animation: kp-out 200ms var(--fv-ease) both;
      }
      dialog.is-leaving .fv-sheet {
        animation: kp-down 200ms var(--fv-ease) both;
      }
      .fv-sheet {
        position: relative;
        width: 100%;
      }
      .dv-code__dot {
        transition:
          background-color var(--fv-fast) var(--fv-ease),
          box-shadow var(--fv-fast) var(--fv-ease);
      }
      @keyframes kp-refuse {
        0%,
        100% {
          transform: none;
        }
        20%,
        60% {
          transform: translateX(-8px);
        }
        40%,
        80% {
          transform: translateX(8px);
        }
      }
      .dv-code.is-refused {
        animation: kp-refuse 360ms var(--fv-ease);
      }
      .dv-code,
      .dv-keys {
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .dv-key {
        transition:
          transform var(--fv-fast) var(--fv-ease),
          background-color var(--fv-base) var(--fv-ease);
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
      }
      .dv-key:active {
        transform: scale(0.94);
        background: var(--fluvy-page-alt);
      }
      @media (hover: hover) {
        .dv-key:hover {
          background: var(--fluvy-page-alt);
        }
      }
      .dv-actions {
        grid-template-columns: repeat(2, minmax(0, var(--kp-pair, 124px)));
      }
      /* a pair whose words would not stand side by side in the sheet ("Abwesend aktivieren") stands one above the
         other, still one width */
      .dv-actions--stacked {
        grid-template-columns: minmax(0, var(--kp-pair, 124px));
      }
      .dv-actions .fv-btn {
        width: 100%;
        min-width: 0;
        padding: 0 8px;
        white-space: nowrap;
      }
      .is-busy .dv-keys,
      .is-busy .dv-code {
        opacity: 0.4;
        pointer-events: none;
      }
    `,
  ];

  static override properties = {
    hass: { attribute: false },
    docked: { type: Boolean, reflect: true },
    request_: { state: true },
    count_: { state: true },
    left_: { state: true },
    busy_: { state: true },
    refused_: { state: true },
    leaving_: { state: true },
    room_: { state: true },
  };

  declare hass?: HomeAssistant;
  /** Draws the sheet in the flow instead of in a modal dialog (a wall panel's fixed keypad, the playground). */
  declare docked: boolean;
  declare request_: KeypadRequest | null;
  /** How many digits have been typed — the only thing about the code that is ever rendered. */
  declare count_: number;
  declare left_: number;
  declare busy_: boolean;
  declare refused_: boolean;
  declare leaving_: boolean;
  /** The room the head gives its line (its titles' box, as the sheet is laid out): the line is fitted to it. */
  declare room_: number;

  #code = '';
  private ticker = 0;
  private leaveTimer = 0;
  private openedAt = 0;
  /** Fits the head's line in the sheet's own class (measured again when a font lands). */
  private readonly head = new HeadFit(this);
  private readonly sizer = new ResizeObserver(([entry]) => {
    if (entry) this.room_ = entry.contentRect.width;
  });
  private titles: Element | null = null;

  constructor() {
    super();
    this.docked = false;
    this.request_ = null;
    this.count_ = 0;
    this.left_ = IDLE_S;
    this.busy_ = false;
    this.refused_ = false;
    this.leaving_ = false;
    this.room_ = 0;
  }

  get isOpen(): boolean {
    return this.request_ !== null && !this.leaving_;
  }

  open(request: KeypadRequest): void {
    this.forget();
    clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    this.request_ = request;
    this.busy_ = false;
    this.refused_ = false;
    this.leaving_ = false;
    this.openedAt = performance.now();
    this.restartIdle();
  }

  /** Forgets the digits and leaves. Safe to call at any time. */
  close(): void {
    this.forget();
    this.stopIdle();
    if (!this.request_ || this.leaving_) return;
    if (this.docked) {
      this.left_ = IDLE_S;
      this.busy_ = false;
      this.refused_ = false;
      return;
    }
    this.leaving_ = true;
    this.leaveTimer = window.setTimeout(() => this.finishClose(), LEAVE_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.finishClose();
    this.sizer.disconnect();
    this.titles = null;
  }

  /** The end of every way out: nothing typed, nothing ticking, nothing listening, no dialog. */
  private finishClose(): void {
    this.forget();
    this.stopIdle();
    clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    this.leaving_ = false;
    this.busy_ = false;
    this.request_ = null;
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog?.open) dialog.close();
  }

  private readonly onHidden = (): void => {
    if (document.visibilityState === 'hidden') this.close();
  };

  private forget(): void {
    this.#code = '';
    if (this.count_ !== 0) this.count_ = 0;
  }

  private stopIdle(): void {
    clearInterval(this.ticker);
    this.ticker = 0;
    document.removeEventListener('visibilitychange', this.onHidden);
  }

  /** The countdown and the tab watch run exactly while there may be something to forget. */
  private restartIdle(): void {
    this.stopIdle();
    this.left_ = IDLE_S;
    document.addEventListener('visibilitychange', this.onHidden);
    this.ticker = window.setInterval(() => {
      if (this.busy_) return; // the wait for Home Assistant is not the user's silence
      if (this.left_ <= 1) this.close();
      else this.left_ -= 1;
    }, 1000);
  }

  protected override updated(changed: PropertyValues): void {
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog && !dialog.open && this.request_ && !this.leaving_) dialog.showModal();
    if (changed.has('request_') || changed.has('hass')) this.fitPair();
    // the head's room is watched while the sheet is drawn (a new sheet each time it opens): its size, measured as it is
    // laid out and again when it changes, draws the line again before anything is painted
    const titles = this.renderRoot.querySelector('.fv-sheet__head .fv-card__titles');
    if (titles !== this.titles) {
      this.sizer.disconnect();
      if (titles) this.sizer.observe(titles);
      this.titles = titles;
    }
  }

  /**
   * The pair shares one width: the sheet's 124 beside the keys (172 without them), or what the
   * longer label needs (a Spanish "Armar ausente" does not fit 124), kept on the 4 px grid — side by
   * side while two of them and the 16 between fit the sheet, else one above the other.
   */
  private fitPair(): void {
    const row = this.renderRoot.querySelector<HTMLElement>('.dv-actions');
    if (!row) return;
    let natural = 0;
    for (const button of row.querySelectorAll<HTMLElement>('.fv-btn')) {
      const previous = button.style.width;
      button.style.width = 'max-content';
      natural = Math.max(natural, button.offsetWidth + 16); // 16 px sides, where the fluid button keeps 8
      button.style.width = previous;
    }
    const base = this.request_ && this.showsKeys(this.request_) ? 124 : 172;
    const pair = Math.max(base, Math.ceil(natural / 4) * 4);
    row.style.setProperty('--kp-pair', `${pair}px`);
    row.classList.toggle('dv-actions--stacked', 2 * pair + 16 > row.clientWidth);
  }

  /* ---------- typing ---------- */

  private showsKeys(request: KeypadRequest): boolean {
    return request.primary.code || Boolean(request.secondary?.code);
  }

  private press(digit: string): void {
    const request = this.request_;
    if (!request || this.busy_ || this.#code.length >= (request.length ?? MAX_DIGITS)) return;
    haptic(this, 'selection');
    this.#code += digit;
    this.count_ = this.#code.length;
    this.refused_ = false;
    this.restartIdle();
  }

  private back(): void {
    if (!this.#code || this.busy_) return;
    haptic(this, 'light');
    this.#code = this.#code.slice(0, -1);
    this.count_ = this.#code.length;
    this.restartIdle();
  }

  private canRun(request: KeypadRequest, action: KeypadAction): boolean {
    if (this.busy_) return false;
    if (!action.code) return true;
    return request.accepts ? request.accepts(this.#code) : this.#code.length > 0;
  }

  private async run(action: KeypadAction): Promise<void> {
    const request = this.request_;
    if (!request || this.leaving_ || !this.canRun(request, action)) return;
    if (performance.now() - this.openedAt < GUARD_MS) return;
    const code = action.code ? this.#code : undefined;
    this.forget(); // handed over once, kept nowhere
    this.busy_ = true;
    let done: boolean;
    try {
      done = await request.run(action.key, code);
    } catch {
      done = false;
    }
    if (this.request_ !== request) return; // closed while Home Assistant was answering
    this.busy_ = false;
    if (done) {
      haptic(this, 'success');
      this.close();
      return;
    }
    haptic(this, 'failure');
    this.refused_ = true;
    this.restartIdle();
  }

  private onKeydown(event: KeyboardEvent): void {
    const request = this.request_;
    if (!request) return;
    const activates = event.key === 'Enter' || event.key === ' ';
    if (event.repeat && (activates || /^\d$/.test(event.key))) {
      event.preventDefault();
      return;
    } // a held key is one press
    if (!this.showsKeys(request)) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      this.press(event.key);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.back();
      return;
    }
    const onAction =
      event.target instanceof HTMLElement && event.target.closest('.dv-actions') !== null;
    if (event.key === 'Enter' && !onAction && this.canRun(request, request.primary)) {
      event.preventDefault();
      void this.run(request.primary);
    }
  }

  private onDialogClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return; // only the scrim closes
    if (performance.now() - this.openedAt >= GUARD_MS) this.close(); // the second tap of a double tap is not a dismissal either
  }

  /* ---------- render ---------- */

  private renderSheet(request: KeypadRequest): TemplateResult {
    const keys = this.showsKeys(request);
    const dots = request.length ?? Math.max(4, this.count_);
    const empty = this.count_ === 0;
    const prompt = (key: 'alarm.enter_code' | 'alarm.enter_code_short'): string =>
      k(this.hass, 'countdown', { label: localize(this.hass, key), seconds: this.left_ });
    const asks = keys && !this.refused_;
    const sub = this.refused_
      ? k(this.hass, 'refused')
      : asks
        ? prompt('alarm.enter_code')
        : request.sub;
    // the line gives way from its end ("Enter your code · 29 s" keeps "Enter your code" at 211), then the prompt takes
    // its short form ("Code eingeben"); fitted before it is drawn and drawn by this template alone — never a word cut
    const fit = (text: string): string => (this.room_ ? this.head.fitSub(text, this.room_) : text);
    let line = fit(sub);
    if (asks && this.room_ && this.head.ruler.width('fv-card__sub', line) > this.room_)
      line = fit(prompt('alarm.enter_code_short'));
    const secondary = request.secondary;
    return html`<div
      class="fv-sheet dv-sheet ${this.busy_ ? 'is-busy' : ''}"
      data-card
      @keydown=${(event: KeyboardEvent) => this.onKeydown(event)}
    >
      <span class="fv-sr" role="alert" data-measure="skip"
        >${this.refused_ ? k(this.hass, 'refused') : ''}</span
      >
      <div class="fv-sheet__grabber"><span></span></div>
      <div class="fv-sheet__head">
        <div class="fv-card__titles">
          <h2 class="fv-sheet__title" id="kp-title">${request.title}</h2>
          <p class="fv-card__sub" aria-label=${line === sub ? nothing : sub}>${line}</p>
        </div>
        ${round('close', 'quiet', k(this.hass, 'close'), () => this.close())}
      </div>
      ${
        keys
          ? html` <div
                class="dv-code ${this.refused_ ? 'is-refused' : ''}"
                role="status"
                aria-label=${k(this.hass, 'entered', { count: this.count_ })}
                style=${dots > 8 ? 'gap:8px' : nothing}
              >
                ${Array.from({ length: dots }, (_, i) => html`<span class="dv-code__dot ${i < this.count_ ? 'is-on' : ''}"></span>`)}
              </div>
              <div class="dv-keys">
                ${KEYS.map((key) =>
                  key === ''
                    ? html`<span></span>`
                    : key === 'backspace'
                      ? html`<button
                          class="dv-key dv-key--quiet"
                          data-control
                          data-target
                          aria-label=${k(this.hass, 'delete')}
                          ?disabled=${empty || this.busy_}
                          @click=${() => this.back()}
                        >
                          ${glyph('backspace')}
                        </button>`
                      : html`<button
                          class="dv-key"
                          data-control
                          data-target
                          aria-label=${k(this.hass, 'digit', { digit: key })}
                          @click=${() => this.press(key)}
                        >
                          ${key}
                        </button>`,
                )}
              </div>`
          : nothing
      }
      <div class="dv-actions">
        ${
          secondary
            ? html`<button
                class="fv-btn fv-btn--quiet"
                data-control
                data-target
                ?disabled=${!this.canRun(request, secondary)}
                @click=${() => void this.run(secondary)}
              >
                ${secondary.label}
              </button>`
            : html`<button
                class="fv-btn fv-btn--quiet"
                data-control
                data-target
                @click=${() => this.close()}
              >
                ${k(this.hass, 'cancel')}
              </button>`
        }
        <button
          class="fv-btn fv-btn--accent"
          data-control
          data-target
          ?disabled=${!this.canRun(request, request.primary)}
          @click=${() => void this.run(request.primary)}
        >
          ${request.primary.label}
        </button>
      </div>
    </div>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const request = this.request_;
    if (!request) return nothing;
    if (this.docked) return this.renderSheet(request);
    return html`<dialog
      class=${this.leaving_ ? 'is-leaving' : ''}
      aria-labelledby="kp-title"
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.close();
      }}
      @close=${() => this.finishClose()}
      @click=${(event: MouseEvent) => this.onDialogClick(event)}
      @keydown=${keepEscape}
      @touchstart=${keepTouch}
    >
      ${this.renderSheet(request)}
    </dialog>`;
  }
}

if (!customElements.get('fluvy-keypad')) customElements.define('fluvy-keypad', FluvyKeypad);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-keypad': FluvyKeypad;
  }
}
