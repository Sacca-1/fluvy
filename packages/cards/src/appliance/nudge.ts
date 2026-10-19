/*
 * A setpoint stepped from a card (a fridge's compartment, an oven's target): each step is shown at once and held while
 * the change is on its way (5 s at most, or until the appliance reports it), and the setpoint is sent once, 650 ms after
 * the last tap — the thermostat's rule. An appliance's cloud counts its calls (Home Connect's and LG's throttle them):
 * ten quick taps are one call, never ten.
 */

/** How long a stepped value is shown before what the appliance reports wins again, and how long taps settle. */
export const HELD_MS = 5000;
export const SETTLE_MS = 650;

type Value = number | string;

/** The setpoints a card is stepping, by entity. */
export class Nudges {
  private readonly held = new Map<string, { readonly value: Value; readonly timer: number }>();
  private readonly sends = new Map<string, number>();

  /** `changed`: a held value went back to the reported one — the card draws again. */
  constructor(private readonly changed: () => void) {}

  /** What a setpoint shows: the value stepped to while its change is on its way, else the one reported. */
  shown<T extends Value | null>(entity: string, reported: T): T | Value {
    const held = this.held.get(entity);
    if (!held) return reported;
    if (held.value === reported) {
      window.clearTimeout(held.timer);
      this.held.delete(entity);
      return reported;
    }
    return held.value;
  }

  /** One step to `value`: shown now, `send` called once the taps settle. */
  step(entity: string, value: Value, send: (value: Value) => void): void {
    const previous = this.held.get(entity);
    if (previous) window.clearTimeout(previous.timer);
    const timer = window.setTimeout(() => {
      if (this.held.get(entity)?.timer !== timer) return;
      this.held.delete(entity);
      this.changed();
    }, HELD_MS);
    this.held.set(entity, { value, timer });
    window.clearTimeout(this.sends.get(entity));
    this.sends.set(
      entity,
      window.setTimeout(() => {
        this.sends.delete(entity);
        send(value);
      }, SETTLE_MS),
    );
    this.changed();
  }

  /** Every pending step dropped (the card left the page). */
  clear(): void {
    for (const { timer } of this.held.values()) window.clearTimeout(timer);
    for (const timer of this.sends.values()) window.clearTimeout(timer);
    this.held.clear();
    this.sends.clear();
  }
}
