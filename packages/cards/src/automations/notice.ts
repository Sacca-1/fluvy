/*
 * "Tell me when it's done" (#47): the automation an appliance's card writes for an administrator — once the appliance
 * finishes, a notification on their phone (its Home Assistant app), else among Home Assistant's own notifications. A
 * native automation the person sees, edits and deletes in Home Assistant as any other. Its shape is narrow on purpose,
 * as a schedule's is: `buildNotice` writes it, `parseNotice` reads back only what it writes, and the store posts a
 * config only when the two agree.
 */

/** A notice's id: `fluvy_done_` and its appliance (a device's id, or a plug's entity as a slug). */
export const NOTICE_ID = /^fluvy_done_[a-z0-9_]{1,80}$/;

/** What ends a cycle, as its triggers hear it. */
export type NoticeTrigger =
  /** The appliance's state (or its phase; an attribute of it, where the integration says it there) turns to a word that says it finished. */
  | {
      readonly kind: 'state';
      readonly entity: string;
      readonly to: readonly string[];
      readonly attribute?: string;
    }
  /** Its integration says so as an event (LG's "Washing is completed"): one of `types`. */
  | { readonly kind: 'event'; readonly entity: string; readonly types: readonly string[] }
  /** A plug's power stays under `below` watts for `minutes`. */
  | {
      readonly kind: 'below';
      readonly entity: string;
      readonly below: number;
      readonly minutes: number;
    }
  /** A running sensor (a threshold helper's) turns off. */
  | { readonly kind: 'off'; readonly entity: string };

export interface Notice {
  readonly id: string;
  /** The automation's name, in the administrator's words ("Washing machine: tell me when it's done"). */
  readonly alias: string;
  /** Every trigger of one kind: an event's type is checked as a condition, which would hold the others back. */
  readonly triggers: readonly NoticeTrigger[];
  /** The phone's notify service (`mobile_app_…`), or none: Home Assistant's own notifications. */
  readonly phone?: string;
  readonly title: string;
  readonly message: string;
}

/** A notice as Home Assistant keeps it: an automation of its own shape (`AutomationConfig` is a schedule's). */
export interface NoticeConfig {
  readonly id: string;
  readonly alias: string;
  readonly triggers: readonly Record<string, unknown>[];
  readonly conditions: readonly Record<string, unknown>[];
  readonly actions: readonly Record<string, unknown>[];
  readonly mode: 'single';
}

/** A state an appliance comes back from without finishing anything: a restart, a lost connection. */
const AWAY = ['unavailable', 'unknown'];

/** The notice id of an appliance: its device's id, or its entity's ("switch.kettle" → `fluvy_done_switch_kettle`). */
export const noticeId = (key: string): string =>
  `fluvy_done_${key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)}`;

function triggerOf(trigger: NoticeTrigger): Record<string, unknown> {
  switch (trigger.kind) {
    case 'state':
      return {
        trigger: 'state',
        entity_id: trigger.entity,
        ...(trigger.attribute ? { attribute: trigger.attribute } : {}),
        to: [...trigger.to],
        not_from: AWAY,
      };
    case 'event':
      // every new event, never a change of its attributes alone (`to: null`); its type is the condition's
      return { trigger: 'state', entity_id: trigger.entity, to: null, not_from: AWAY };
    case 'below':
      return {
        trigger: 'numeric_state',
        entity_id: trigger.entity,
        below: trigger.below,
        for: { minutes: trigger.minutes },
      };
    case 'off':
      return { trigger: 'state', entity_id: trigger.entity, from: 'on', to: 'off' };
  }
}

/** The automation a notice is. */
export function buildNotice(notice: Notice): NoticeConfig {
  const events = notice.triggers.filter((trigger) => trigger.kind === 'event');
  return {
    id: notice.id,
    alias: notice.alias.trim(),
    triggers: notice.triggers.map(triggerOf),
    conditions: events.map((event) => ({
      condition: 'state',
      entity_id: event.entity,
      attribute: 'event_type',
      state: [...event.types],
    })),
    actions: [
      notice.phone
        ? {
            action: `notify.${notice.phone}`,
            data: { title: notice.title, message: notice.message },
          }
        : {
            action: 'persistent_notification.create',
            data: { title: notice.title, message: notice.message, notification_id: notice.id },
          },
    ],
    mode: 'single',
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const texts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isText);
const exactly = (record: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(record).length === keys.length && keys.every((key) => key in record);
const away = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === AWAY.length &&
  AWAY.every((word, i) => value[i] === word);

/** A trigger the notice wrote (an event's types come from its condition). */
function readTrigger(raw: unknown, conditions: readonly unknown[]): NoticeTrigger | undefined {
  if (!isRecord(raw) || !isText(raw['entity_id'])) return undefined;
  const entity = raw['entity_id'];
  if (raw['trigger'] === 'numeric_state') {
    const below = raw['below'];
    const span = raw['for'];
    if (!exactly(raw, ['trigger', 'entity_id', 'below', 'for']) || typeof below !== 'number')
      return undefined;
    if (!isRecord(span) || !exactly(span, ['minutes']) || typeof span['minutes'] !== 'number')
      return undefined;
    return { kind: 'below', entity, below, minutes: span['minutes'] };
  }
  if (raw['trigger'] !== 'state') return undefined;
  if (exactly(raw, ['trigger', 'entity_id', 'from', 'to']))
    return raw['from'] === 'on' && raw['to'] === 'off' ? { kind: 'off', entity } : undefined;
  const attribute = isText(raw['attribute']) ? raw['attribute'] : undefined;
  const keys = ['trigger', 'entity_id', 'to', 'not_from', ...(attribute ? ['attribute'] : [])];
  if (!exactly(raw, keys) || !away(raw['not_from'])) return undefined;
  if (texts(raw['to']))
    return { kind: 'state', entity, to: raw['to'], ...(attribute ? { attribute } : {}) };
  if (raw['to'] !== null) return undefined;
  const condition = conditions.find((item) => isRecord(item) && item['entity_id'] === entity);
  if (
    !isRecord(condition) ||
    !exactly(condition, ['condition', 'entity_id', 'attribute', 'state']) ||
    condition['condition'] !== 'state' ||
    condition['attribute'] !== 'event_type' ||
    !texts(condition['state'])
  )
    return undefined;
  return { kind: 'event', entity, types: condition['state'] };
}

/** The notice an automation is, where it is one exactly as `buildNotice` writes it; nothing otherwise. */
export function parseNotice(config: unknown): Notice | undefined {
  if (!isRecord(config) || !NOTICE_ID.test(String(config['id']))) return undefined;
  if (!exactly(config, ['id', 'alias', 'triggers', 'conditions', 'actions', 'mode']))
    return undefined;
  const { alias, triggers, conditions, actions } = config;
  if (typeof alias !== 'string' || config['mode'] !== 'single') return undefined;
  if (!Array.isArray(triggers) || !Array.isArray(conditions) || !Array.isArray(actions))
    return undefined;
  const read = triggers.map((raw) => readTrigger(raw, conditions));
  if (!read.length || read.some((trigger) => !trigger)) return undefined;
  const [action] = actions;
  if (actions.length !== 1 || !isRecord(action) || !exactly(action, ['action', 'data']))
    return undefined;
  const data = action['data'];
  if (!isRecord(data) || typeof data['title'] !== 'string' || typeof data['message'] !== 'string')
    return undefined;
  const service = String(action['action']);
  const phone = /^notify\.(mobile_app_[a-z0-9_]+)$/.exec(service)?.[1];
  if (!phone && service !== 'persistent_notification.create') return undefined;
  return {
    id: String(config['id']),
    alias,
    triggers: read as NoticeTrigger[],
    ...(phone ? { phone } : {}),
    title: data['title'],
    message: data['message'],
  };
}
