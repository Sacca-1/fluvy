import type { LovelaceCardConfig } from '@fluvy/core';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

/** A minute: what a card that says "in 9 h" or "1 h 12 min left" needs. */
export const MINUTE = 60_000;

/** The card a ticker keeps time for: its element, whether it has drawn yet, its config (a test's clock, `_now`, freezes it). */
export type TickerHost = ReactiveControllerHost &
  HTMLElement & { readonly hasUpdated: boolean; readonly config?: LovelaceCardConfig | undefined };

/**
 * A card's clock, for what it says about time ("Live · 5 s ago", "Ready in 12 min", a period's totals asked for again
 * when their cache runs out): every `period` (a minute unless asked otherwise) it asks `due()` whether the card must
 * be drawn again. Nothing runs while nobody can see the card — off the page, scrolled off screen, a view or a tab not
 * shown — and coming back it asks at once, so what changed while it was away is drawn with it. A card under a test's
 * clock (`_now`) never ticks: its time does not pass.
 */
export class Ticker implements ReactiveController {
  private timer: number | undefined;
  private observer: IntersectionObserver | undefined;
  private connected = false;
  /** On screen, by the viewport's last word (true until it says, and where there is no observer). */
  private onScreen = true;

  constructor(
    private readonly host: TickerHost,
    private readonly due: () => boolean,
    private readonly period = MINUTE,
  ) {
    host.addController(this);
  }

  /** Whether the clock runs now. */
  get running(): boolean {
    return this.timer !== undefined;
  }

  hostConnected(): void {
    this.connected = true;
    this.onScreen = true; // until the observer's first word, a frame from now
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver((entries) =>
        this.report(entries[entries.length - 1]?.isIntersecting ?? true),
      );
      this.observer.observe(this.host);
    }
    document.addEventListener('visibilitychange', this.sync);
    this.sync();
  }

  hostDisconnected(): void {
    this.connected = false;
    this.observer?.disconnect();
    this.observer = undefined;
    document.removeEventListener('visibilitychange', this.sync);
    this.sync();
  }

  /** A config given a test's clock, or freed of one, stops or starts it. */
  hostUpdated(): void {
    this.sync();
  }

  /** The viewport's word (the observer's, or a test's): the card is on screen, or not. */
  report(onScreen: boolean): void {
    this.onScreen = onScreen;
    this.sync();
  }

  private readonly tick = (): void => {
    if (this.due()) this.host.requestUpdate();
  };

  private readonly sync = (): void => {
    const run =
      this.connected &&
      this.onScreen &&
      document.visibilityState !== 'hidden' &&
      !this.host.config?._now;
    if (run === this.running) return;
    if (!run) {
      window.clearInterval(this.timer);
      this.timer = undefined;
      return;
    }
    // back on screen or in a tab shown again: what changed meanwhile is drawn at once (connecting draws anyway)
    if (this.host.hasUpdated) this.tick();
    this.timer = window.setInterval(this.tick, this.period);
  };
}
