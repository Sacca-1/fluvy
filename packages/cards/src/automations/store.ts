import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { release, type Subscription } from '../shared/subscription.js';
import { buildNotice, NOTICE_ID, parseNotice, type NoticeConfig } from './notice.js';
import {
  buildAutomation,
  parseAutomation,
  SCHEDULE_ID,
  VERBS,
  type AutomationConfig,
} from './schedule.js';

/**
 * The automation configs of the house as the cards read and write them, one store per connection: several cards on
 * a view ask for the same schedules and hear the same reload. A config is read once and kept; it is stale (kept,
 * shown, asked for again) once automations reload, and fresh once the answer lands. A read that failed is tried
 * again after a wait that grows (30 s, 2 min, 10 min); one Home Assistant has no config for (404) waits for the
 * next reload instead. Only an administrator may read or write configs — Home Assistant refuses anyone else — so
 * for anyone else the store never asks, and the rows stay plain.
 *
 * Writing is narrow on purpose: `save` takes a config, parses it as a schedule (or an appliance's "Tell me when it's
 * done", `notice.ts`) and builds it again, and posts the built one only when the two agree, so what reaches Home
 * Assistant is always the shape `buildAutomation` (or `buildNotice`) writes; `save` and `remove` take Fluvy's own ids
 * only.
 *
 * What Home Assistant relates to an entity (`related`: the automations whose triggers, conditions or actions name it,
 * asked with `search/related`, which anyone may) is kept here too, for a card about a few entities. It is asked again
 * once automations reload, once the house's list of automations changes, and once it is five minutes old when a card
 * asks — never the moment a write lands: Home Assistant reloads after answering it, so the answer could be the old one.
 */

/** Home Assistant's config API for one automation, by its id. */
export const CONFIG_PATH = 'config/automation/config/';
/** How long after a failed read the next one waits: once, twice, and from then on. */
export const RETRY_AFTER: readonly number[] = [30_000, 120_000, 600_000];
/** How old an answer about what is related may be when a card asks: past it, it is asked again (a guest hears no reload). */
export const RELATED_TTL = 300_000;

interface Entry {
  /** The config as Home Assistant returned it; the strict reading is `parseAutomation`'s. */
  config: AutomationConfig | undefined;
  /** What Home Assistant said when the last read failed; nothing once one succeeds. */
  error: string | undefined;
  /** Never read, or automations reloaded since: worth asking for again. */
  stale: boolean;
  inflight: Promise<void> | undefined;
  failures: number;
  retryAt: number;
  /** Home Assistant has no config under that id for now (404): asked again once automations reload. */
  missing: boolean;
}

/** What Home Assistant relates to one entity or device: the automations it named, as last answered. */
interface Related {
  automations: ReadonlySet<string> | undefined;
  /** When the last answer landed (0: never). */
  at: number;
  /** Automations reloaded, or the house's list of them changed, since: worth asking again. */
  stale: boolean;
  inflight: Promise<void> | undefined;
  failures: number;
  retryAt: number;
}

/** What `search/related` is asked about: an entity, and its device where the entity is the one thing it does. */
type RelatedItem = readonly ['entity' | 'device', string];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** JSON with every object's keys in order, so two configs compare by what they say, not how they were typed. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );

/** The status Home Assistant's frontend puts on a failed `callApi` (`{ error, status_code, body }`). */
const statusOf = (error: unknown): number | undefined =>
  isRecord(error) && typeof error['status_code'] === 'number' ? error['status_code'] : undefined;

/** What Home Assistant said about a failed call, in its words (`body.message`, or a text body); '' when it said nothing. */
export function apiMessage(error: unknown): string {
  if (!isRecord(error)) return '';
  const body = error['body'];
  if (isRecord(body) && typeof body['message'] === 'string') return body['message'].trim();
  if (typeof body === 'string') return body.trim();
  return '';
}

/* ---------- the automation entities ---------- */

/** Automation config id → the automation entity that carries it, built once per `hass.states` object. */
const indexes = new WeakMap<object, Map<string, HassEntity>>();

function index(hass: HomeAssistant): Map<string, HassEntity> {
  const states = hass.states;
  let map = indexes.get(states);
  if (!map) {
    map = new Map();
    for (const entity of Object.values(states)) {
      if (!entity.entity_id.startsWith('automation.')) continue;
      const id = entity.attributes['id'];
      if (typeof id === 'string' && id) map.set(id, entity);
    }
    indexes.set(states, map);
  }
  return map;
}

/** The automation entity whose config has that id (`attributes.id`), if the house has one. */
export const automationEntity = (hass: HomeAssistant, id: string): HassEntity | undefined =>
  index(hass).get(id);

/** The config ids of the house's automations that are Fluvy schedules by their id. */
export const scheduleIds = (hass: HomeAssistant): string[] =>
  [...index(hass).keys()].filter((id) => SCHEDULE_ID.test(id));

/** The house's workday sensor: the workday integration's binary sensor by the registry, else `binary_sensor.workday_sensor` when it exists. */
export function workdaySensor(hass: HomeAssistant): string | undefined {
  const registered = Object.values(hass.entities ?? {})
    .filter(
      (entry) =>
        entry.platform === 'workday' &&
        entry.entity_id.startsWith('binary_sensor.') &&
        hass.states[entry.entity_id] !== undefined,
    )
    .map((entry) => entry.entity_id)
    .sort();
  if (registered[0]) return registered[0];
  return hass.states['binary_sensor.workday_sensor'] ? 'binary_sensor.workday_sensor' : undefined;
}

/* ---------- the store ---------- */

const stores = new WeakMap<object, AutomationStore>();

/** Device id → how many of its entities a schedule can drive, counted once per entity registry object. */
const drivables = new WeakMap<object, Map<string, number>>();

function drivableCount(hass: HomeAssistant, device: string): number {
  const registry = hass.entities ?? {};
  let counts = drivables.get(registry);
  if (!counts) {
    counts = new Map();
    for (const entry of Object.values(registry))
      if (entry.device_id && VERBS[entry.entity_id.slice(0, entry.entity_id.indexOf('.'))])
        counts.set(entry.device_id, (counts.get(entry.device_id) ?? 0) + 1);
    drivables.set(registry, counts);
  }
  return counts.get(device) ?? 0;
}

/**
 * What is asked about an entity: the entity, and its device too where the entity is the only one of the device that a
 * schedule can drive (a plug: an automation that switches it by its device is related to it; a two-relay board's
 * device would relate one relay's automations to the other).
 */
function relatedItems(hass: HomeAssistant, entity: string): RelatedItem[] {
  const device = hass.entities?.[entity]?.device_id;
  return device && drivableCount(hass, device) === 1
    ? [
        ['entity', entity],
        ['device', device],
      ]
    : [['entity', entity]];
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export class AutomationStore {
  private hass: HomeAssistant;
  private readonly entries = new Map<string, Entry>();
  private readonly relations = new Map<string, Related>();
  /** The house's automations when a card last asked what is related: a change means an answer may be out of date. */
  private automations: readonly string[] | undefined;
  private readonly listeners = new Set<() => void>();
  private subscription: Subscription | undefined;
  private pending = false;

  private constructor(hass: HomeAssistant) {
    this.hass = hass;
  }

  /** The store of that connection (one per house), reading the `hass` handed in from now on. */
  static for(hass: HomeAssistant): AutomationStore {
    const key = (hass.connection as object | undefined) ?? hass;
    let store = stores.get(key);
    if (!store) {
      store = new AutomationStore(hass);
      stores.set(key, store);
    }
    store.hass = hass;
    return store;
  }

  /** Whether this person may read and write configs: Home Assistant's administrators, read live. */
  get admin(): boolean {
    return this.hass.user?.is_admin === true;
  }

  /** The config as last read, stale or fresh; nothing before the first answer. */
  config(id: string): AutomationConfig | undefined {
    return this.entries.get(id)?.config;
  }

  /** Home Assistant's words when the last read of that config failed. */
  error(id: string): string | undefined {
    return this.entries.get(id)?.error;
  }

  /**
   * Reads the configs worth reading among those ids: Fluvy's own ids that some automation entity carries, not
   * read yet or stale, not in flight, not waiting out a failure. Resolves once the reads in flight have landed;
   * nothing happens for anyone but an administrator.
   */
  async load(ids: readonly string[]): Promise<void> {
    if (!this.admin) return;
    const now = Date.now();
    const known = index(this.hass);
    const waits: Promise<void>[] = [];
    for (const id of new Set(ids)) {
      if (!SCHEDULE_ID.test(id) || !known.has(id)) continue;
      const entry = this.entry(id);
      if (entry.inflight) {
        waits.push(entry.inflight);
        continue;
      }
      if (!entry.stale || entry.missing || now < entry.retryAt) continue;
      entry.inflight = this.fetch(id, entry);
      waits.push(entry.inflight);
    }
    await Promise.all(waits);
  }

  /**
   * Writes a schedule's config (or a notice's): a Fluvy id, parsed and built again, posted only when the two agree.
   * The cache then holds the built config, stale until the next read; rejects with what Home Assistant said
   * (`apiMessage`) when it refused it.
   */
  async save(id: string, config: AutomationConfig | NoticeConfig): Promise<void> {
    const notice = NOTICE_ID.test(id);
    if (!notice && !SCHEDULE_ID.test(id)) throw new Error(`not a schedule id: ${id}`);
    if (!this.admin) throw new Error('only an administrator may write automations');
    if (notice) {
      // a notice is known by its entity (`automationEntity`): only a schedule's config is kept to read
      const read = parseNotice(config);
      if (!read || read.id !== id) throw new Error('not the shape Fluvy writes');
      await this.post(id, buildNotice(read), config);
      this.notify();
      return;
    }
    const schedule = parseAutomation(config);
    if (!schedule || schedule.id !== id) throw new Error('not the shape Fluvy writes');
    const built = buildAutomation(schedule);
    await this.post(id, built, config);
    const entry = this.entry(id);
    entry.config = built;
    entry.error = undefined;
    entry.stale = true;
    entry.failures = 0;
    entry.retryAt = 0;
    entry.missing = false;
    this.notify();
  }

  /** Posts what was built, only where it says what was asked. */
  private async post(
    id: string,
    built: AutomationConfig | NoticeConfig,
    asked: AutomationConfig | NoticeConfig,
  ): Promise<void> {
    if (canonical(built) !== canonical(asked)) throw new Error('not the shape Fluvy writes');
    await this.hass.callApi('POST', CONFIG_PATH + id, { ...built });
  }

  /** Deletes a schedule (or a notice): Fluvy's own ids only. */
  async remove(id: string): Promise<void> {
    if (!SCHEDULE_ID.test(id) && !NOTICE_ID.test(id)) throw new Error(`not a schedule id: ${id}`);
    if (!this.admin) throw new Error('only an administrator may write automations');
    await this.hass.callApi('DELETE', CONFIG_PATH + id);
    this.entries.delete(id);
    this.notify();
  }

  /**
   * The automation entities Home Assistant relates to that entity (and to its device, where it is the device's one
   * drivable entity), as last answered; nothing before the first answer.
   */
  related(entity: string): ReadonlySet<string> | undefined {
    const answers = relatedItems(this.hass, entity).map(
      ([type, id]) => this.relations.get(`${type}:${id}`)?.automations,
    );
    if (answers.some((answer) => !answer)) return undefined;
    const [first, second] = answers as ReadonlySet<string>[];
    return second ? new Set([...(first ?? []), ...second]) : first;
  }

  /** Whether every question about those entities has had its first answer, or its first failure (the rows then go by their configs). */
  relatedSettled(entities: readonly string[]): boolean {
    return entities.every((entity) =>
      relatedItems(this.hass, entity).every(([type, id]) => {
        const entry = this.relations.get(`${type}:${id}`);
        return entry !== undefined && (entry.at > 0 || entry.failures > 0);
      }),
    );
  }

  /**
   * Asks Home Assistant what it relates to those entities, where it is worth asking: never asked, stale (automations
   * reloaded, or the house's list of them — `automations` — changed since a card last asked), or older than
   * `RELATED_TTL`; not while an answer is on its way, nor while a failure is waited out. Anyone may ask.
   */
  async loadRelated(entities: readonly string[], automations: readonly string[]): Promise<void> {
    if (this.automations && !sameList(this.automations, automations))
      for (const entry of this.relations.values()) entry.stale = true;
    this.automations = automations;
    const now = Date.now();
    const waits: Promise<void>[] = [];
    for (const entity of new Set(entities))
      for (const [type, id] of relatedItems(this.hass, entity)) {
        const key = `${type}:${id}`;
        let entry = this.relations.get(key);
        if (!entry) {
          entry = {
            automations: undefined,
            at: 0,
            stale: true,
            inflight: undefined,
            failures: 0,
            retryAt: 0,
          };
          this.relations.set(key, entry);
        }
        if (entry.inflight) {
          waits.push(entry.inflight);
          continue;
        }
        if ((!entry.stale && now - entry.at < RELATED_TTL) || now < entry.retryAt) continue;
        entry.inflight = this.ask(type, id, entry);
        waits.push(entry.inflight);
      }
    await Promise.all(waits);
  }

  /**
   * Hears the store change (an answer, a reload, a write), coalesced to one call per turn. The first listener
   * opens the socket's `automation_reloaded` events, the last one leaving closes them.
   */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    if (this.listeners.size === 1) this.listen();
    let listening = true;
    return () => {
      if (!listening) return;
      listening = false;
      this.listeners.delete(callback);
      if (this.listeners.size === 0 && this.subscription) {
        release(this.subscription);
        this.subscription = undefined;
      }
    };
  }

  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = {
        config: undefined,
        error: undefined,
        stale: true,
        inflight: undefined,
        failures: 0,
        retryAt: 0,
        missing: false,
      };
      this.entries.set(id, entry);
    }
    return entry;
  }

  private async fetch(id: string, entry: Entry): Promise<void> {
    try {
      const config = await this.hass.callApi<unknown>('GET', CONFIG_PATH + id);
      entry.config = isRecord(config) ? (config as unknown as AutomationConfig) : undefined;
      entry.error = undefined;
      entry.stale = false;
      entry.failures = 0;
      entry.retryAt = 0;
      entry.missing = false;
    } catch (error) {
      entry.error =
        apiMessage(error) ||
        (isRecord(error) && typeof error['error'] === 'string' ? error['error'] : 'error');
      if (statusOf(error) === 404) {
        entry.missing = true;
      } else {
        entry.failures += 1;
        entry.retryAt =
          Date.now() + (RETRY_AFTER[Math.min(entry.failures, RETRY_AFTER.length) - 1] ?? 0);
      }
    } finally {
      entry.inflight = undefined;
      this.notify();
    }
  }

  private async ask(type: RelatedItem[0], id: string, entry: Related): Promise<void> {
    try {
      const answer = await this.hass.callWS<Record<string, unknown>>({
        type: 'search/related',
        item_type: type,
        item_id: id,
      });
      const automations = isRecord(answer) ? answer['automation'] : undefined;
      entry.automations = new Set(
        Array.isArray(automations)
          ? automations.filter((each): each is string => typeof each === 'string')
          : [],
      );
      entry.at = Date.now();
      entry.stale = false;
      entry.failures = 0;
      entry.retryAt = 0;
    } catch {
      entry.failures += 1;
      entry.retryAt =
        Date.now() + (RETRY_AFTER[Math.min(entry.failures, RETRY_AFTER.length) - 1] ?? 0);
    } finally {
      entry.inflight = undefined;
      this.notify();
    }
  }

  /** Automations reloaded: every config is worth reading again, the missing and the failed ones included, and every answer about what is related. */
  private reloaded(): void {
    for (const entry of this.entries.values()) {
      entry.stale = true;
      entry.missing = false;
      entry.failures = 0;
      entry.retryAt = 0;
    }
    for (const entry of this.relations.values()) {
      entry.stale = true;
      entry.failures = 0;
      entry.retryAt = 0;
    }
    this.notify();
  }

  /** Opens the socket's `automation_reloaded` events; Home Assistant lets only an administrator hear them. */
  private listen(): void {
    if (!this.admin || this.subscription) return;
    const subscription: Subscription = { cancelled: false };
    this.subscription = subscription;
    this.hass.connection
      .subscribeMessage(
        () => {
          if (!subscription.cancelled) this.reloaded();
        },
        { type: 'subscribe_events', event_type: 'automation_reloaded' },
      )
      .then((unsubscribe) => {
        subscription.unsubscribe = unsubscribe;
        if (subscription.cancelled) release(subscription); // the last listener left while the socket was answering
      })
      .catch(() => undefined); // refused or dropped: the reads still work, reloads go unheard until the next page
  }

  private notify(): void {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      for (const listener of this.listeners) listener();
    });
  }
}
