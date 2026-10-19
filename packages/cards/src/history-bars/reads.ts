/** How long a read that failed waits before it is asked again. */
export const RETRY = 60_000;

/**
 * A card's read of one thing by key (a sensor's window and hour): asked once per key, its late answers dropped (an
 * answer for a key no longer wanted never reaches the card), and a failure told — never kept as an answer — and asked
 * again once `retry` has passed. The card keeps what it shows meanwhile.
 */
export class Reads<T> {
  /** The key asked last: in flight, answered or failed. */
  private asked = '';
  private retryAt = 0;
  /** Whether the read of the key asked last failed (until an answer for it lands). */
  failed = false;

  constructor(private readonly retry = RETRY) {}

  /** Whether reading `key` now would ask: a key not asked yet, or a failed one whose wait is over. */
  due(key: string, now = Date.now()): boolean {
    return key !== this.asked || (this.failed && now >= this.retryAt);
  }

  /** Reads `key` with `load` when due, handing an answer for it to `onAnswer` and a failure to `onFail`. */
  ask(
    key: string,
    load: () => Promise<T>,
    onAnswer: (value: T) => void,
    onFail: () => void = () => undefined,
  ): boolean {
    if (!this.due(key)) return false;
    this.asked = key;
    load().then(
      (value) => {
        if (this.asked !== key) return;
        this.failed = false;
        onAnswer(value);
      },
      () => {
        if (this.asked !== key) return;
        this.failed = true;
        this.retryAt = Date.now() + this.retry;
        onFail();
      },
    );
    return true;
  }
}
