// @vitest-environment happy-dom
import type { LovelaceCardConfig } from '@fluvy/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MINUTE, Ticker, type TickerHost } from './ticker.js';

/** A card as the ticker sees it: an element that takes controllers, with its config and the updates asked of it. */
type Host = TickerHost & { config: LovelaceCardConfig; updates: number; hasUpdated: boolean };

function host(config: Partial<LovelaceCardConfig> = {}): Host {
  const el = Object.assign(document.createElement('div'), {
    config: { type: 'custom:fluvy-test-card', ...config },
    updates: 0,
    hasUpdated: false,
    addController: () => undefined,
    removeController: () => undefined,
    requestUpdate(this: Host) {
      this.updates += 1;
    },
    updateComplete: Promise.resolve(true),
  });
  document.body.append(el);
  return el as unknown as Host;
}

/** The card connects, and draws as connecting makes it. */
function connect(ticker: Ticker, card: Host): void {
  ticker.hostConnected();
  card.hasUpdated = true;
}

let visibility: DocumentVisibilityState = 'visible';
const showTab = (state: DocumentVisibilityState): void => {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('the ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('asks every minute whether the card must be drawn again, and draws it only then', () => {
    const card = host();
    let due = false;
    const ticker = new Ticker(card, () => due);
    connect(ticker, card);
    vi.advanceTimersByTime(MINUTE * 3);
    expect(card.updates).toBe(0);
    due = true;
    vi.advanceTimersByTime(MINUTE);
    expect(card.updates).toBe(1);
    vi.advanceTimersByTime(MINUTE - 1);
    expect(card.updates).toBe(1);
  });

  it('keeps the pace it is given (a live card’s five seconds)', () => {
    const card = host();
    const ticker = new Ticker(card, () => true, 5000);
    connect(ticker, card);
    vi.advanceTimersByTime(MINUTE);
    expect(card.updates).toBe(12);
  });

  it('stops when the card leaves the page', () => {
    const card = host();
    const ticker = new Ticker(card, () => true);
    connect(ticker, card);
    ticker.hostDisconnected();
    expect(ticker.running).toBe(false);
    vi.advanceTimersByTime(MINUTE * 5);
    expect(card.updates).toBe(0);
  });

  it('pauses off screen, and asks at once when the card is back', () => {
    const card = host();
    const ticker = new Ticker(card, () => true);
    connect(ticker, card);
    ticker.report(false);
    vi.advanceTimersByTime(MINUTE * 5);
    expect(card.updates).toBe(0);
    ticker.report(true);
    expect(card.updates).toBe(1);
    vi.advanceTimersByTime(MINUTE);
    expect(card.updates).toBe(2);
  });

  it('hears the viewport through an observer of its own, let go with the card', () => {
    const seen: { report?: IntersectionObserverCallback; observing: boolean } = {
      observing: false,
    };
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(report: IntersectionObserverCallback) {
          seen.report = report;
        }
        observe(): void {
          seen.observing = true;
        }
        disconnect(): void {
          seen.observing = false;
        }
      },
    );
    const card = host();
    const ticker = new Ticker(card, () => true);
    connect(ticker, card);
    expect(seen.observing).toBe(true);
    const entry = (isIntersecting: boolean): IntersectionObserverEntry[] =>
      [{ isIntersecting }] as unknown as IntersectionObserverEntry[];
    seen.report?.(entry(false), {} as IntersectionObserver);
    expect(ticker.running).toBe(false);
    seen.report?.(entry(true), {} as IntersectionObserver);
    expect(ticker.running).toBe(true);
    ticker.hostDisconnected();
    expect(seen.observing).toBe(false);
  });

  it('pauses in a hidden tab, and asks at once when it is shown again', () => {
    const card = host();
    const ticker = new Ticker(card, () => true);
    connect(ticker, card);
    showTab('hidden');
    expect(ticker.running).toBe(false);
    vi.advanceTimersByTime(MINUTE * 5);
    expect(card.updates).toBe(0);
    showTab('visible');
    expect(card.updates).toBe(1);
    expect(ticker.running).toBe(true);
    ticker.hostDisconnected();
    // gone from the page, a tab shown again does not start it
    showTab('hidden');
    showTab('visible');
    expect(ticker.running).toBe(false);
  });

  it('never ticks under a test’s clock, and starts when the card is freed of it', () => {
    const card = host({ _now: '2026-10-17T12:00:00Z' });
    const ticker = new Ticker(card, () => true);
    connect(ticker, card);
    vi.advanceTimersByTime(MINUTE * 5);
    expect(card.updates).toBe(0);
    expect(ticker.running).toBe(false);
    card.config = { type: 'custom:fluvy-test-card' };
    ticker.hostUpdated();
    expect(ticker.running).toBe(true);
  });

  it('does not ask on connecting, which draws the card anyway, but does on coming back to the page', () => {
    const card = host();
    const ticker = new Ticker(card, () => true);
    connect(ticker, card);
    expect(card.updates).toBe(0);
    expect(ticker.running).toBe(true);
    ticker.hostDisconnected();
    ticker.hostConnected();
    expect(card.updates).toBe(1);
  });
});
