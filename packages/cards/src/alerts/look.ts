import {
  areaOf,
  localize,
  plural,
  resolveEntity,
  stateText,
  type HomeAssistant,
} from '@fluvy/core';
import { durationShort } from '../helpers/datetime.js';
import { glyphFor } from '../shared/domain.js';
import { nameOf, type AlertResult, type AlertRow } from './engine.js';
import type { RepairsStore } from './repairs.js';

/*
 * What an alert says, the same on the card and in its sheet: its name and glyph, who is at fault (its culprits, by
 * device when it counts devices), how long or how much (a battery's 12 %, a door's 6 min), and its rows grouped as it
 * counts them.
 */

/** What a card and its sheet read an alert's words from besides `hass`: the repairs' titles, the clock. */
export interface LookContext {
  readonly hass: HomeAssistant | undefined;
  readonly repairs?: RepairsStore | undefined;
  readonly now: number;
}

/** An alert's name: the person's, a split alert's entity's own, else its preset's title. */
export function alertName({ hass }: LookContext, result: AlertResult): string {
  const { definition } = result;
  if (definition.name) return definition.name;
  if (result.entity) return nameOf(hass as HomeAssistant, result.entity);
  return definition.title ? localize(hass, definition.title) : definition.key;
}

/** An alert's glyph: the person's, a split alert's entity's own icon, else its preset's. */
export function alertIcon({ hass }: LookContext, result: AlertResult): string {
  const own = result.definition.config.icon;
  const entity = result.entity ? hass?.states[result.entity]?.attributes['icon'] : undefined;
  return own ?? (typeof entity === 'string' ? entity : result.definition.icon);
}

/** One of an alert's rows as a sheet lists it: an entity, a device and its entities, or a source's item. */
export interface RowGroup {
  /** The row's own id (an entity's, a repair's) or its device's. */
  readonly id: string;
  readonly device: string | undefined;
  readonly rows: readonly AlertRow[];
  /** The row standing for the group: its first in the alert's order (the lowest battery, the longest open). */
  readonly lead: AlertRow;
}

/** The rows as the alert counts them: a row each, or one per device (its entities under it), in the alert's order. */
export function groupsOf(result: AlertResult): RowGroup[] {
  if (result.definition.countBy !== 'device')
    return result.rows.map((row) => ({ id: row.id, device: row.device, rows: [row], lead: row }));
  const groups = new Map<string, AlertRow[]>();
  for (const row of result.rows) {
    const key = row.device ?? row.id;
    const rows = groups.get(key);
    if (rows) rows.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([id, rows]) => ({
    id,
    device: rows[0]?.device,
    rows,
    lead: rows[0] as AlertRow,
  }));
}

/** A row's name: a repair's title, a device's when the alert counts devices, else by the alert's `name_by`. */
export function rowName(
  { hass, repairs }: LookContext,
  result: AlertResult,
  group: RowGroup,
): string {
  const { definition } = result;
  if (definition.source === 'repairs') return repairs?.item(group.id)?.title ?? group.id;
  const by = definition.countBy === 'device' && group.device ? 'device' : definition.nameBy;
  return nameOf(hass as HomeAssistant, group.lead.id, by);
}

/** Who is at fault, in the alert's order: each row's (or device's) name once. */
export const culprits = (context: LookContext, result: AlertResult): string[] => [
  ...new Set(groupsOf(result).map((group) => rowName(context, result, group))),
];

/**
 * How long a row has matched, or an alert since its oldest match ("6 min"); nothing in its first minute — a leak a
 * moment old is not "1 min", and the name says it alone until it is.
 */
export const lasted = ({ hass, now }: LookContext, since: number): string =>
  now - since < 60_000 ? '' : durationShort(hass, new Date(since), new Date(now));

/** What a row is now: its state in Home Assistant's words ("12 %", "Open", "Unavailable"); a repair's severity. */
export function rowState({ hass }: LookContext, row: AlertRow): string {
  if (row.state) return stateText(hass, resolveEntity(hass, row.id));
  return row.severity ? localize(hass, `alerts.severity.${row.severity}`) : '';
}

/** A row's detail on a card: a number's state (a battery's 12 %), else how long it has matched. */
export const rowDetail = (context: LookContext, row: AlertRow): string =>
  row.value !== undefined && row.state ? rowState(context, row) : lasted(context, row.since);

/** A row's glyph: its entity's own (a door, a battery), else the alert's. */
export function rowGlyph(context: LookContext, result: AlertResult, row: AlertRow): string {
  if (!row.state) return alertIcon(context, result);
  const icon = row.state.attributes['icon'];
  return typeof icon === 'string' ? icon : glyphFor(resolveEntity(context.hass, row.id));
}

/** Where a row is: its area's name. */
export function rowArea({ hass }: LookContext, row: AlertRow): string {
  const area = row.state ? areaOf(hass, row.id) : undefined;
  return (area && hass?.areas?.[area]?.name) || '';
}

/** "3 devices" / "1 entity" / "2 repairs": what an alert counts. */
export const countWords = ({ hass }: LookContext, result: AlertResult): string =>
  plural(
    hass,
    result.definition.source === 'repairs'
      ? 'alerts.repairs'
      : result.definition.countBy === 'device'
        ? 'alerts.devices'
        : 'alerts.entities',
    result.count,
  );
