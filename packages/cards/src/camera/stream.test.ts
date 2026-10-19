// @vitest-environment happy-dom
import type { ReactiveControllerHost } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DETACH_AFTER, RETRY_AFTER, STREAM_WAIT, StreamHolder, cameraStream } from './stream.js';

/** A card as the holder sees it: a connected element that takes controllers. */
function host(): ReactiveControllerHost & HTMLElement {
  const el = Object.assign(document.createElement('div'), {
    addController: () => undefined,
    removeController: () => undefined,
    requestUpdate: () => undefined,
    updateComplete: Promise.resolve(true),
  });
  document.body.append(el);
  return el;
}

describe("Home Assistant's stream element", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is asked for through the card helpers, and asked again when it did not come in time', async () => {
    const made: unknown[] = [];
    (window as unknown as { loadCardHelpers: () => Promise<unknown> }).loadCardHelpers =
      async () => ({
        createCardElement: (config: unknown) => made.push(config),
      });
    const first = cameraStream('camera.one');
    await vi.advanceTimersByTimeAsync(STREAM_WAIT + 1);
    expect(await first).toBe(false);
    expect(made).toHaveLength(1);
    // not for the page's life: the next ask tries again
    const second = cameraStream('camera.one');
    await vi.advanceTimersByTimeAsync(STREAM_WAIT + 1);
    expect(await second).toBe(false);
    expect(made).toHaveLength(2);
  });
});

describe('the holder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits a minute before asking again after a miss, then twice as long', async () => {
    (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers = undefined;
    const changes: number[] = [];
    const holder = new StreamHolder(host(), () => changes.push(Date.now()));
    holder.hostConnected();
    holder.ask('camera.one');
    expect(holder.state).toBe('asking');
    await vi.advanceTimersByTimeAsync(STREAM_WAIT + 1);
    expect(holder.state).toBe('none');
    holder.ask('camera.one');
    expect(holder.state).toBe('none'); // too soon
    await vi.advanceTimersByTimeAsync(RETRY_AFTER);
    holder.ask('camera.one');
    expect(holder.state).toBe('asking');
    await vi.advanceTimersByTimeAsync(STREAM_WAIT + 1);
    expect(holder.state).toBe('none');
    await vi.advanceTimersByTimeAsync(RETRY_AFTER); // the second wait is two minutes
    holder.ask('camera.one');
    expect(holder.state).toBe('none');
    await vi.advanceTimersByTimeAsync(RETRY_AFTER);
    holder.ask('camera.one');
    expect(holder.state).toBe('asking');
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the element off screen for a while, then takes it out; back on screen it stays', () => {
    const changes: boolean[] = [];
    const holder = new StreamHolder(host(), () => changes.push(holder.attached));
    holder.hostConnected();
    holder.state = 'ready';
    holder.report(true);
    expect(holder.playing).toBe(true);
    holder.report(false);
    expect(holder.playing).toBe(true); // off screen: still there
    vi.advanceTimersByTime(DETACH_AFTER - 1);
    expect(holder.playing).toBe(true);
    vi.advanceTimersByTime(2);
    expect(holder.playing).toBe(false);
    holder.report(true);
    expect(holder.playing).toBe(true);
    // off and back before the wait is over: nothing happens
    holder.report(false);
    vi.advanceTimersByTime(DETACH_AFTER / 2);
    holder.report(true);
    vi.advanceTimersByTime(DETACH_AFTER);
    expect(holder.playing).toBe(true);
  });

  it('makes one element, keeps it across draws, and takes it out for good on teardown', () => {
    const holder = new StreamHolder(host(), () => undefined);
    holder.hostConnected();
    const props = {
      hass: {},
      stateObj: {},
      fitMode: 'cover' as const,
      aspectRatio: 16 / 9,
      className: 'dv-cam__stream',
    };
    const a = holder.draw(props);
    const b = holder.draw({ ...props, fitMode: 'contain' });
    expect(a).toBe(b);
    expect(a.fitMode).toBe('contain');
    expect(a.classList.contains('dv-cam__stream')).toBe(true);
    document.body.append(a);
    holder.teardown();
    expect(a.isConnected).toBe(false);
    expect(holder.element).toBeUndefined();
    // the next draw is a new element
    expect(holder.draw(props)).not.toBe(a);
  });

  it('gives up on a stream whose players all show an alert, and waits before asking again', async () => {
    const changes: string[] = [];
    const holder = new StreamHolder(host(), () => changes.push(holder.state));
    holder.hostConnected();
    holder.state = 'ready';
    holder.report(true);
    const element = holder.draw({
      hass: {},
      stateObj: {},
      fitMode: 'cover',
      aspectRatio: 1,
      className: 'x',
    });
    document.body.append(element);
    const root = element.attachShadow({ mode: 'open' });
    root.innerHTML = '<ha-alert>Stream failed</ha-alert>';
    element.dispatchEvent(
      new CustomEvent('streams', { detail: { hasVideo: false }, bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(holder.state).toBe('none');
    expect(holder.element).toBeUndefined();
    expect(element.isConnected).toBe(false);
    holder.ask('camera.one');
    expect(holder.state).toBe('none'); // not before its wait
    expect(changes).toContain('none');
  });
});

describe('the holder across a reconnect and a recovered stream (1.9)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A viewport whose observer the test drives: its last callback, called with one entry. */
  function viewport(): { connect(): void; see(seen: boolean): void } {
    let callback: IntersectionObserverCallback | undefined;
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      FakeObserver;
    return {
      connect: () => undefined,
      see: (seen) =>
        callback?.(
          [{ isIntersecting: seen } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
    };
  }

  it('comes back from a disconnect with the element out until the viewport says it is seen', () => {
    const view = viewport();
    const holder = new StreamHolder(host(), () => undefined);
    holder.hostConnected();
    holder.state = 'ready';
    view.see(true);
    expect(holder.playing).toBe(true);
    // the card leaves the page while on screen (another view): teardown remembers it as seen
    holder.hostDisconnected();
    // and comes back off screen: nothing plays, and the first report that it is not seen is not dropped
    holder.hostConnected();
    expect(holder.attached).toBe(false);
    expect(holder.playing).toBe(false);
    view.see(false);
    expect(holder.playing).toBe(false);
    // seen again: it plays at once
    view.see(true);
    expect(holder.playing).toBe(true);
    delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  it('waits a minute again after a stream that played, not twice the last wait', async () => {
    const holder = new StreamHolder(host(), () => undefined);
    holder.hostConnected();
    holder.report(true);
    const props = {
      hass: {},
      stateObj: {},
      fitMode: 'cover' as const,
      aspectRatio: 1,
      className: 'x',
    };
    /** Home Assistant's element, drawn and in the page, saying whether it has video. */
    const streams = async (hasVideo: boolean): Promise<void> => {
      holder.state = 'ready';
      const element = holder.draw(props);
      if (!element.isConnected) document.body.append(element);
      if (!hasVideo && !element.shadowRoot)
        element.attachShadow({ mode: 'open' }).innerHTML = '<ha-alert>Stream failed</ha-alert>';
      element.dispatchEvent(new CustomEvent('streams', { detail: { hasVideo }, bubbles: true }));
      await vi.advanceTimersByTimeAsync(1);
    };
    // two failures: the waits grow to a minute, then two
    await streams(false);
    expect(holder.state).toBe('none');
    await streams(false);
    expect(holder.state).toBe('none');
    // then the stream plays: the players say they have video
    await streams(true);
    expect(holder.state).toBe('ready');
    // it fails later: the next ask waits one minute, not four
    await streams(false);
    expect(holder.state).toBe('none');
    await vi.advanceTimersByTimeAsync(RETRY_AFTER - 1000);
    holder.ask('camera.one');
    expect(holder.state).toBe('none'); // not before its minute
    await vi.advanceTimersByTimeAsync(1001);
    holder.ask('camera.one');
    expect(holder.state).toBe('asking');
  });
});
