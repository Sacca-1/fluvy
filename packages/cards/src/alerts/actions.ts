import type { ActionConfig, HomeAssistant, ServiceTarget } from '@fluvy/core';
import type { AlertAction, AlertButton } from './model.js';

/*
 * What an alert's buttons do, made concrete for the moment they are pressed: `matched` in an action's target (or its
 * `entity`) becomes every entity the alert matches now, `row` the row's own — so "Lock all" is one call over every
 * unlocked lock, and a row's Close shuts that cover. Then Home Assistant's own action runs it (`runAction`), its
 * `confirmation` included.
 */

/** What `matched` and `row` stand for when a button is pressed. */
export interface Bound {
  readonly matched: readonly string[];
  readonly row?: string;
}

const SYMBOLS: ReadonlySet<unknown> = new Set(['matched', 'row']);

/** Whether an id, or ids, say `matched` or `row`. */
const symbolic = (value: unknown): boolean =>
  (Array.isArray(value) ? value : [value]).some((item) => SYMBOLS.has(item));

/** An id, or ids, with `matched` and `row` replaced; undefined when it says `row` and there is none. */
function ids(value: unknown, bound: Bound): string[] | undefined {
  const out: string[] = [];
  for (const item of Array.isArray(value) ? value : [value]) {
    if (item === 'matched') out.push(...bound.matched);
    else if (item === 'row') {
      if (bound.row === undefined) return undefined;
      out.push(bound.row);
    } else if (typeof item === 'string') out.push(item);
  }
  return [...new Set(out)];
}

/**
 * The action as Home Assistant runs it: `target: matched` / `target: row` (or `entity_id: matched` inside a target,
 * among other ids) become entity ids, and so does `entity`; an action that says neither runs as it is written.
 * Undefined when it names the row and there is none (a row's button pressed for the whole alert), or when `matched`
 * is all it names and nothing matches.
 */
export function bindAction(action: AlertAction, bound: Bound): ActionConfig | undefined {
  const { target, entity, ...rest } = action;
  const out: ActionConfig = { ...rest, action: action.action };
  if (typeof target === 'string') {
    const entityIds = ids(target, bound);
    if (!entityIds?.length) return undefined;
    out.target = { entity_id: entityIds };
  } else if (target) {
    if (!symbolic(target.entity_id)) out.target = target;
    else {
      const entityIds = ids(target.entity_id, bound);
      if (!entityIds?.length) return undefined;
      out.target = { ...target, entity_id: entityIds } satisfies ServiceTarget;
    }
  }
  if (entity !== undefined) {
    const [id] = ids(entity, bound) ?? [];
    if (id === undefined) return undefined;
    out.entity = id;
  }
  return out;
}

/** `UpdateEntityFeature.INSTALL` */
const INSTALL = 1;

/** Whether an update can be installed from here: waiting, supported by its integration, not already running. */
export function installable(hass: HomeAssistant, id: string): boolean {
  const state = hass.states[id];
  if (!state || state.state !== 'on') return false;
  if (((state.attributes.supported_features ?? 0) & INSTALL) === 0) return false;
  const percent = state.attributes['update_percentage'];
  return state.attributes['in_progress'] !== true && typeof percent !== 'number';
}

/** Whether a button is offered to this person (on that row, for a row's button). */
export function offered(button: AlertButton, hass: HomeAssistant, row?: string): boolean {
  if (button.admin_only && hass.user?.is_admin !== true) return false;
  if (row === undefined) return true;
  if (button.domains && !button.domains.includes(row.slice(0, row.indexOf('.')))) return false;
  if (button.when === 'installable' && !installable(hass, row)) return false;
  return true;
}
