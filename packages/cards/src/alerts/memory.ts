import {
  houseZone,
  readStored,
  writeStored,
  type HassEntities,
  type HomeAssistant,
  type MessageKey,
  type Values,
} from '@fluvy/core';
import { release, type Subscription } from '../shared/subscription.js';
import type { AlertResult, MemoryView } from './engine.js';
import { instantAt, plusDays, wallNow } from './time.js';

/*
 * What a person snoozed and acknowledged, so an alert they have seen to stays quiet. Where it is kept is the card's
 * `snooze` key:
 * - `user` (the default): Home Assistant's frontend user data — it follows the person to every device they sign in on;
 * - `device`: this browser only (a wall tablet's own);
 * - `house`: Home Assistant's frontend system data — the whole house sees it, and only an administrator may write it
 *   (Home Assistant refuses anyone else), so for anyone else the alerts offer no snooze;
 * - `off`: nothing is kept, and nothing is offered.
 *
 * Home Assistant keeps one value per key and a write replaces it whole, so several cards and several devices writing
 * one after the other would undo each other: one store per connection and scope holds the value as Home Assistant
 * last said it (subscribed while any card listens; read once before a first write otherwise), and every write is that
 * value with one change made — pruned of what is over — and written once.
 *
 * A snooze ends at an instant. An acknowledgement ("until it changes") keeps, for each entity of the alert, the
 * `last_changed` it had: the entity is back the moment it changes again.
 */

export const MEMORY_SCOPES = ['user', 'device', 'house', 'off'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** The key of the stored value in Home Assistant's frontend data, and in this browser's storage. */
export const MEMORY_KEY = 'fluvy-alerts';
export const DEVICE_KEY = 'fluvy:alerts';

/** What is kept: snoozes (alert key → until, ms) and acknowledgements (alert key → entity → its `last_changed`). */
export interface Remembered {
  readonly v: 1;
  readonly snoozed: Readonly<Record<string, number>>;
  readonly acked: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const NOTHING: Remembered = { v: 1, snoozed: {}, acked: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stored value read leniently: what is not one of ours is nothing, an entry that is not well formed is skipped. */
export function parseRemembered(raw: unknown): Remembered {
  if (!isRecord(raw) || raw['v'] !== 1) return NOTHING;
  const snoozed: Record<string, number> = {};
  if (isRecord(raw['snoozed']))
    for (const [key, until] of Object.entries(raw['snoozed']))
      if (typeof until === 'number' && Number.isFinite(until)) snoozed[key] = until;
  const acked: Record<string, Record<string, string>> = {};
  if (isRecord(raw['acked']))
    for (const [key, stamps] of Object.entries(raw['acked'])) {
      if (!isRecord(stamps)) continue;
      const kept = Object.entries(stamps).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      );
      if (kept.length) acked[key] = Object.fromEntries(kept);
    }
  return { v: 1, snoozed, acked };
}

/** What is over left out: snoozes that ended, acknowledgements of entities that changed since or are gone. */
export function prune(
  value: Remembered,
  now: number,
  states: HassEntities | undefined,
): Remembered {
  const snoozed = Object.fromEntries(
    Object.entries(value.snoozed).filter(([, until]) => until > now),
  );
  const acked: Record<string, Record<string, string>> = {};
  for (const [key, stamps] of Object.entries(value.acked)) {
    const kept = Object.entries(stamps).filter(
      ([id, stamp]) => !states || states[id]?.last_changed === stamp,
    );
    if (kept.length) acked[key] = Object.fromEntries(kept);
  }
  return { v: 1, snoozed, acked };
}

const same = (a: Remembered, b: Remembered): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The snoozes and acknowledgements the alerts read and write. */
export interface AlertMemory extends MemoryView {
  readonly scope: MemoryScope;
  /** Whether this person may snooze here: not with `off`, and with `house` only an administrator. */
  readonly writable: boolean;
  /** Hears every change, from here or from elsewhere. */
  subscribe(listener: () => void): () => void;
  /** Snoozes the alert of that key until then (ms). */
  snooze(key: string, until: number): Promise<void>;
  /** Acknowledges these entities of the alert (each with its `last_changed` now), beside any acknowledged before. */
  acknowledge(key: string, stamps: Readonly<Record<string, string>>): Promise<void>;
  /** Ends the alert's snooze and its acknowledgements. */
  wake(key: string): Promise<void>;
}

/** Keeps a value and tells who listens. */
abstract class Kept implements AlertMemory {
  abstract readonly scope: MemoryScope;
  version = 0;
  protected value: Remembered = NOTHING;
  protected readonly listeners = new Set<() => void>();

  constructor(protected hass: HomeAssistant) {}

  abstract get writable(): boolean;

  /** Reads the `hass` handed in from now on (the person, the states a write is pruned against). */
  use(hass: HomeAssistant): this {
    this.hass = hass;
    return this;
  }

  snoozedUntil(key: string): number | undefined {
    return this.value.snoozed[key];
  }

  acknowledged(key: string): Readonly<Record<string, string>> | undefined {
    return this.value.acked[key];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.open();
    let listening = true;
    return () => {
      if (!listening) return;
      listening = false;
      this.listeners.delete(listener);
      if (!this.listeners.size) this.close();
    };
  }

  snooze(key: string, until: number): Promise<void> {
    return this.change((value) => ({ ...value, snoozed: { ...value.snoozed, [key]: until } }));
  }

  acknowledge(key: string, stamps: Readonly<Record<string, string>>): Promise<void> {
    return this.change((value) => ({
      ...value,
      acked: { ...value.acked, [key]: { ...value.acked[key], ...stamps } },
    }));
  }

  wake(key: string): Promise<void> {
    const without = <T>(table: Readonly<Record<string, T>>): Record<string, T> =>
      Object.fromEntries(Object.entries(table).filter(([own]) => own !== key));
    return this.change((value) => ({
      v: 1,
      snoozed: without(value.snoozed),
      acked: without(value.acked),
    }));
  }

  /** Takes a value heard from where it is kept: listeners hear it when it says something new. */
  protected take(raw: unknown): void {
    const next = parseRemembered(raw);
    if (same(next, this.value)) return;
    this.value = next;
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** The value with one change made, pruned, kept here at once and then where it is kept. */
  private async change(make: (value: Remembered) => Remembered): Promise<void> {
    if (!this.writable) return;
    await this.ready();
    this.take(prune(make(this.value), Date.now(), this.hass.states));
    await this.store(this.value);
  }

  /** The value as stored, before a first write: a write never undoes what it did not read. */
  protected abstract ready(): Promise<void>;
  protected abstract store(value: Remembered): Promise<void>;
  protected abstract open(): void;
  protected abstract close(): void;
}

/** Home Assistant's frontend data: the person's (`user`) or the house's (`house`), one per connection. */
class SocketMemory extends Kept {
  private subscription: Subscription | undefined;
  /** Home Assistant has said the value (by the subscription or a read). */
  private heard = false;
  private reading: Promise<void> | undefined;

  constructor(
    hass: HomeAssistant,
    readonly scope: 'user' | 'house',
  ) {
    super(hass);
  }

  get writable(): boolean {
    return this.scope === 'user' || this.hass.user?.is_admin === true;
  }

  private get layer(): 'user' | 'system' {
    return this.scope === 'user' ? 'user' : 'system';
  }

  protected ready(): Promise<void> {
    if (this.heard) return Promise.resolve();
    this.reading ??= this.hass
      .callWS<{ value: unknown }>({ type: `frontend/get_${this.layer}_data`, key: MEMORY_KEY })
      .then(({ value }) => {
        if (!this.heard) this.take(value);
        this.heard = true;
      })
      .catch(() => {
        // unread: the write goes ahead on what this page knows
      })
      .finally(() => {
        this.reading = undefined;
      });
    return this.reading;
  }

  protected async store(value: Remembered): Promise<void> {
    try {
      await this.hass.callWS({ type: `frontend/set_${this.layer}_data`, key: MEMORY_KEY, value });
    } catch (error) {
      // refused or dropped: what Home Assistant keeps is what this page says again
      this.heard = false;
      await this.ready();
      throw error;
    }
  }

  protected open(): void {
    const subscription: Subscription = { cancelled: false };
    this.subscription = subscription;
    this.hass.connection
      .subscribeMessage<{ value: unknown }>(
        ({ value }) => {
          if (subscription.cancelled) return;
          this.heard = true;
          this.take(value);
        },
        { type: `frontend/subscribe_${this.layer}_data`, key: MEMORY_KEY },
      )
      .then((unsubscribe) => {
        subscription.unsubscribe = unsubscribe;
        if (subscription.cancelled) release(subscription);
      })
      .catch(() => undefined); // refused or dropped: what this page writes still holds here
  }

  protected close(): void {
    if (this.subscription) release(this.subscription);
    this.subscription = undefined;
    this.heard = false;
  }
}

/** This browser's storage, shared by its tabs. */
class DeviceMemory extends Kept {
  readonly scope = 'device';
  readonly writable = true;

  constructor(hass: HomeAssistant) {
    super(hass);
    this.value = parseRemembered(readStored(DEVICE_KEY));
  }

  private readonly heard = (event: StorageEvent): void => {
    if (event.key === DEVICE_KEY) this.take(readStored(DEVICE_KEY));
  };

  protected ready(): Promise<void> {
    this.take(readStored(DEVICE_KEY));
    return Promise.resolve();
  }

  protected async store(value: Remembered): Promise<void> {
    writeStored(DEVICE_KEY, value);
  }

  protected open(): void {
    if (typeof window !== 'undefined') window.addEventListener('storage', this.heard);
  }

  protected close(): void {
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.heard);
  }
}

/** Nothing kept, nothing offered. */
export const OFF: AlertMemory = {
  scope: 'off',
  version: 0,
  writable: false,
  snoozedUntil: () => undefined,
  acknowledged: () => undefined,
  subscribe: () => () => undefined,
  snooze: () => Promise.resolve(),
  acknowledge: () => Promise.resolve(),
  wake: () => Promise.resolve(),
};

const sockets = new WeakMap<object, Map<'user' | 'house', SocketMemory>>();
let device: DeviceMemory | undefined;

/** The memory of that scope for this `hass`: one per connection (or this browser's), reading the `hass` handed in. */
export function memoryFor(hass: HomeAssistant, scope: MemoryScope = 'user'): AlertMemory {
  if (scope === 'off') return OFF;
  if (scope === 'device') return (device ??= new DeviceMemory(hass)).use(hass);
  const connection = (hass.connection as object | undefined) ?? hass;
  let stores = sockets.get(connection);
  if (!stores) sockets.set(connection, (stores = new Map()));
  let store = stores.get(scope);
  if (!store) stores.set(scope, (store = new SocketMemory(hass, scope)));
  return store.use(hass);
}

/* ---------- snoozing ---------- */

/** How long a snooze lasts: an hour, eight, until tomorrow morning, or until it changes (an acknowledgement). */
export const SNOOZE_CHOICES = ['hour', 'hours', 'tomorrow', 'changes'] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

/** Each choice's words. */
export const SNOOZE_WORDS: Readonly<
  Record<SnoozeChoice, readonly [key: MessageKey, values?: Values]>
> = {
  hour: ['alerts.snooze.for', { n: 1 }],
  hours: ['alerts.snooze.for', { n: 8 }],
  tomorrow: ['common.tomorrow'],
  changes: ['alerts.snooze.changes'],
};

/** The time of day a snooze "until tomorrow" ends at, in the house's zone: eight in the morning. */
export const MORNING = 8 * 3600;

/** When a snooze ends, from `now`, in the zone the person's profile says (a "tomorrow" is the house's tomorrow). */
export function snoozeEnd(
  choice: Exclude<SnoozeChoice, 'changes'>,
  now: number,
  zone: string | undefined,
): number {
  if (choice === 'hour') return now + 3_600_000;
  if (choice === 'hours') return now + 8 * 3_600_000;
  return instantAt(plusDays(wallNow(now, zone), 1), MORNING, zone);
}

/**
 * Snoozes an alert as the person chose: until an instant, or until each of its entities changes (its rows'
 * `last_changed` kept).
 */
export function snoozeAlert(
  memory: AlertMemory,
  hass: HomeAssistant,
  result: Pick<AlertResult, 'key' | 'rows'>,
  choice: SnoozeChoice,
  now = Date.now(),
): Promise<void> {
  if (choice !== 'changes')
    return memory.snooze(result.key, snoozeEnd(choice, now, houseZone(hass)));
  const stamps: Record<string, string> = {};
  for (const row of result.rows) if (row.state) stamps[row.id] = row.state.last_changed;
  return memory.acknowledge(result.key, stamps);
}
