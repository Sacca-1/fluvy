import type { ReactiveController, ReactiveControllerHost } from 'lit';

/**
 * Home Assistant's camera stream inside a card: one element for the card's life, kept while the card is on screen or
 * only just off it, taken down for good when the card goes or changes its camera, tried again a while after it
 * failed. The camera and the printer cards share it.
 *
 * Why the care: Home Assistant's players (`ha-hls-player`, `ha-web-rtc-player`) start a session when they are
 * connected and end it when they are not, and they manage a hidden tab themselves. A card that took the element out
 * on every scroll and put it back on the way up would open a session each time, which some cameras answer by going
 * away (issue #28). So the element stays put for `DETACH_AFTER` off screen, the tab is left to the players, and the
 * card itself never makes a second one.
 */

/** How long Home Assistant has to define its stream element before the card keeps to stills. */
export const STREAM_WAIT = 5000;
/** Off screen this long, the stream is taken out (and its session with it); back on screen sooner, it plays on. */
export const DETACH_AFTER = 45_000;
/** A stream that could not play is asked for again after this long, then after twice as long, up to ten minutes. */
export const RETRY_AFTER = 60_000;
export const RETRY_MOST = 600_000;

/** Home Assistant's camera stream element, as far as the cards set it. */
export type StreamElement = HTMLElement & {
  hass?: unknown;
  stateObj?: unknown;
  muted?: boolean;
  controls?: boolean;
  fitMode?: string;
  aspectRatio?: number;
};

/**
 * Home Assistant's `ha-camera-stream`, which it defines with its picture cards: asked for once a page through the
 * card helpers (making a picture-entity card loads it), resolved true once it is defined. False when it is not within
 * `STREAM_WAIT`, and then the next ask tries again: a slow first load is not a missing element.
 */
let streamDefined: Promise<boolean> | undefined;
export function cameraStream(entity: string): Promise<boolean> {
  if (customElements.get('ha-camera-stream')) return Promise.resolve(true);
  streamDefined ??= (async () => {
    const helpers = (await window.loadCardHelpers?.().catch(() => undefined)) as
      { createCardElement?: (config: Record<string, unknown>) => unknown } | undefined;
    helpers?.createCardElement?.({ type: 'picture-entity', entity, camera_view: 'live' });
    const defined = await Promise.race([
      customElements.whenDefined('ha-camera-stream').then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), STREAM_WAIT)),
    ]);
    if (!defined) streamDefined = undefined;
    return defined;
  })();
  return streamDefined;
}

/** Whether every player Home Assistant shows in the element has given up (its alert where its video would be). */
function playersFailed(element: StreamElement): boolean {
  const root = element.shadowRoot;
  if (!root) return false;
  const players = [...root.querySelectorAll('ha-hls-player, ha-web-rtc-player')].filter(
    (player) => !player.classList.contains('hidden'),
  );
  if (!players.length) return root.querySelector('ha-alert') !== null;
  return players.every((player) => player.shadowRoot?.querySelector('ha-alert'));
}

export type StreamState = '' | 'asking' | 'ready' | 'none';

export class StreamHolder implements ReactiveController {
  /** Whether Home Assistant's element is known: not asked, being asked, defined, or not to be had for now. */
  state: StreamState = '';
  /** The host's last report from the viewport: on screen, or not. False until the first one. */
  onScreen = false;
  /** On screen, or off it for under `DETACH_AFTER`: the element may be in the page. */
  attached = false;
  /** The element, once the host has drawn it. */
  element: StreamElement | undefined;

  private observer: IntersectionObserver | undefined;
  private detachTimer = 0;
  private retryAt = 0;
  private backoff = RETRY_AFTER;
  private failing = 0;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    /** Called when what the host should draw may have changed. */
    private readonly onChange: () => void,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    if (typeof IntersectionObserver === 'function') {
      this.onScreen = false; // the observer's first report, a frame from now, says otherwise
      this.observer = new IntersectionObserver((entries) => {
        const seen = entries[entries.length - 1]?.isIntersecting ?? true;
        if (seen === this.onScreen) return;
        this.onScreen = seen;
        this.report(seen);
      });
      this.observer.observe(this.host);
    } else {
      this.onScreen = true;
      this.attached = true;
    }
  }

  hostDisconnected(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.teardown();
  }

  /**
   * The viewport's word (the observer's, or a test's): on screen, the element may play at once; off it, it plays on
   * for `DETACH_AFTER`, then it is taken out.
   */
  report(onScreen: boolean): void {
    this.onScreen = onScreen;
    window.clearTimeout(this.detachTimer);
    this.detachTimer = 0;
    if (onScreen) {
      this.attached = true;
      this.onChange();
      return;
    }
    this.detachTimer = window.setTimeout(() => {
      this.detachTimer = 0;
      this.attached = false;
      this.onChange();
    }, DETACH_AFTER);
    this.onChange();
  }

  /** Whether the host should draw the stream now: known, allowed to be in the page, and not just failed. */
  get playing(): boolean {
    return this.state === 'ready' && this.attached;
  }

  /** Asks Home Assistant for its element where the card wants it live: once, and again after a failure's wait. */
  ask(entity: string): void {
    if (this.state === 'asking' || this.state === 'ready') return;
    if (this.state === 'none' && Date.now() < this.retryAt) return;
    this.state = 'asking';
    void cameraStream(entity).then((ok) => {
      this.state = ok ? 'ready' : 'none';
      if (!ok) this.later();
      this.onChange();
    });
  }

  /** The element with its camera and fit as the host wants them now: made once, kept across renders. */
  draw(props: {
    hass: unknown;
    stateObj: unknown;
    fitMode: 'cover' | 'contain';
    aspectRatio: number;
    className: string;
  }): StreamElement {
    if (!this.element) {
      const element = document.createElement('ha-camera-stream') as StreamElement;
      element.classList.add(props.className);
      element.muted = true;
      element.controls = false;
      // the players say what they got; nothing to show in any of them and the stills come back
      element.addEventListener('streams', () => {
        window.clearTimeout(this.failing);
        this.failing = window.setTimeout(() => {
          this.failing = 0;
          if (this.element && playersFailed(this.element)) this.failed();
        }, 0);
      });
      this.element = element;
    }
    this.element.hass = props.hass;
    this.element.stateObj = props.stateObj;
    this.element.fitMode = props.fitMode;
    this.element.aspectRatio = props.aspectRatio;
    return this.element;
  }

  /** The stream could not play: out with it, stills meanwhile, and another try after a wait. */
  private failed(): void {
    this.state = 'none';
    this.later();
    this.teardown();
    this.onChange();
  }

  private later(): void {
    this.retryAt = Date.now() + this.backoff;
    this.backoff = Math.min(this.backoff * 2, RETRY_MOST);
  }

  /** Takes the element out for good (its session ends with it): the card is gone or its camera changed. */
  teardown(): void {
    window.clearTimeout(this.detachTimer);
    this.detachTimer = 0;
    window.clearTimeout(this.failing);
    this.failing = 0;
    this.element?.remove();
    this.element = undefined;
    this.attached = this.onScreen;
  }
}
