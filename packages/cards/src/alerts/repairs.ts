import type { HomeAssistant } from '@fluvy/core';
import { release, type Subscription } from '../shared/subscription.js';
import type { SourceRow } from './engine.js';
import type { Severity } from './severity.js';

/*
 * Home Assistant's repairs, as an alert reads them: the list its repairs page shows (`repairs/list_issues`, the ones a
 * person chose to ignore left out), read again half a second after the registry last said it changed
 * (`repairs_issue_registry_updated`, which anyone may hear), each titled as that page titles it — the integration's
 * own words (`component.<domain>.issues.<key>.title`, loaded with `loadBackendTranslation`), its placeholders filled.
 * One store per connection, open while a card listens: several alerts cards read the list once.
 */

/** A repair as Home Assistant lists it. */
export interface RepairIssue {
  readonly domain: string;
  readonly issue_id: string;
  /** The integration the issue is about, when it is not the one that raised it. */
  readonly issue_domain?: string | null;
  readonly severity: 'critical' | 'error' | 'warning';
  readonly translation_key?: string | null;
  readonly translation_placeholders?: Readonly<Record<string, string>> | null;
  readonly ignored?: boolean;
  readonly created?: string;
}

/** A repair as an alert's row says it. */
export interface RepairItem {
  /** Its row's id: the integration and the issue (never an entity's). */
  readonly id: string;
  readonly title: string;
  readonly domain: string;
  readonly severity: Severity;
  readonly since: number;
}

/** How long after the registry last spoke the list is read again (Home Assistant's own repairs page waits as long). */
export const DEBOUNCE = 500;
const CHANGED = 'repairs_issue_registry_updated';

/** A repair's severity as an alert's: critical and error are critical, a warning a warning. */
export const severityOf = (issue: Pick<RepairIssue, 'severity'>): Severity =>
  issue.severity === 'warning' ? 'warning' : 'critical';

/** "deprecated_yaml_import" → "Deprecated yaml import": what a repair is called when its integration says nothing. */
const humanised = (id: string): string => {
  const text = id.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type Localize = (key: string, values?: Record<string, unknown>) => string;

/** A repair's title in its integration's words, else its id made readable. */
export function titleOf(localize: Localize | undefined, issue: RepairIssue): string {
  const key = `component.${issue.domain}.issues.${issue.translation_key || issue.issue_id}.title`;
  const said = localize?.(key, { ...issue.translation_placeholders });
  return said && said !== key ? said : humanised(issue.issue_id);
}

/** The repairs of one connection: read while anyone listens, read again when they change. */
export class RepairsStore {
  items: readonly RepairItem[] = [];
  private readonly listeners = new Set<() => void>();
  private subscription: Subscription | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Reads under way are counted: only the latest one's answer is taken. */
  private reads = 0;

  constructor(private hass: HomeAssistant) {}

  /** Reads the `hass` handed in from now on (its language titles the next read). */
  use(hass: HomeAssistant): this {
    const language = this.hass.language;
    this.hass = hass;
    if (language !== hass.language && this.listeners.size) void this.read();
    return this;
  }

  /** What the engine is fed: each repair's id, since when, and how grave. */
  rows(): SourceRow[] {
    return this.items.map(({ id, since, severity }) => ({ id, since, severity }));
  }

  item(id: string): RepairItem | undefined {
    return this.items.find((item) => item.id === id);
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

  private open(): void {
    void this.read();
    const subscription: Subscription = { cancelled: false };
    this.subscription = subscription;
    this.hass.connection
      .subscribeMessage(
        () => {
          if (subscription.cancelled) return;
          clearTimeout(this.timer);
          this.timer = setTimeout(() => void this.read(), DEBOUNCE);
        },
        { type: 'subscribe_events', event_type: CHANGED },
      )
      .then((unsubscribe) => {
        subscription.unsubscribe = unsubscribe;
        if (subscription.cancelled) release(subscription);
      })
      .catch(() => undefined); // refused or dropped: the list read at first still holds
  }

  private close(): void {
    if (this.subscription) release(this.subscription);
    this.subscription = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.reads += 1; // an answer still on its way is no one's
  }

  /** The list as Home Assistant has it now, titled; listeners hear it. */
  private async read(): Promise<void> {
    const read = ++this.reads;
    const hass = this.hass;
    let issues: readonly RepairIssue[];
    try {
      const answer = await hass.callWS<{ issues?: readonly RepairIssue[] }>({
        type: 'repairs/list_issues',
      });
      issues = (answer?.issues ?? []).filter((issue) => !issue.ignored);
    } catch {
      return; // refused or dropped: what was read last stays
    }
    const domains = [...new Set(issues.map((issue) => issue.domain))];
    let localize: Localize | undefined = hass.localize?.bind(hass);
    if (domains.length && hass.loadBackendTranslation)
      try {
        localize = await hass.loadBackendTranslation('issues', domains);
      } catch {
        // the titles stay the ids, made readable
      }
    if (read !== this.reads) return;
    const now = Date.now();
    this.items = issues.map((issue) => {
      const created = issue.created ? Date.parse(issue.created) : Number.NaN;
      return {
        id: `${issue.domain}/${issue.issue_id}`,
        title: titleOf(localize, issue),
        domain: issue.issue_domain || issue.domain,
        severity: severityOf(issue),
        since: Number.isFinite(created) ? created : now,
      };
    });
    for (const listener of this.listeners) listener();
  }
}

const stores = new WeakMap<object, RepairsStore>();

/** The repairs of this `hass`'s connection: one store per connection. */
export function repairsFor(hass: HomeAssistant): RepairsStore {
  const connection = (hass.connection as object | undefined) ?? hass;
  let store = stores.get(connection);
  if (!store) stores.set(connection, (store = new RepairsStore(hass)));
  return store.use(hass);
}
