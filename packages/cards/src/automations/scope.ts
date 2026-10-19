import { SCHEDULE_ID, VERBS, verbsFor, type Schedule, type Verb } from './schedule.js';

/**
 * What a card for a few entities is about (`targets`: a lamp in a popup): the entities a schedule may target, each
 * with what a new schedule for it does, and whether a row of the card concerns them. Pure: the card reads the config
 * and the house, the sheet reads the choices.
 */

/** One entity of `targets` as the config writes it: a bare id, or an object with what a new schedule does. */
export interface AutomationTarget {
  entity: string;
  /** Its name in the sheet, the suggested schedule name and the card's words; the entity's own when unsaid. */
  name?: string;
  icon?: string;
  /** The Do tile a new schedule for it starts on: one its domain has. */
  verb?: Verb;
  /** The brightness a new schedule turns a light on to, 1–100. */
  level?: number;
  /** The target a new schedule turns a thermostat on to, in the house's unit. */
  temperature?: number;
}

/** A target as the card and the sheet use it: valid, its options only where its domain has them. */
export interface TargetChoice {
  readonly id: string;
  readonly name?: string;
  readonly icon?: string;
  readonly verb?: Verb;
  readonly level?: number;
  readonly temperature?: number;
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * The targets a config names, in its order, each once: an id of a domain a schedule can drive (`VERBS`) — anything
 * else is dropped — with its name and icon, a verb its domain has, a level for a light (rounded, 1–100) and a
 * temperature for a thermostat (a finite number).
 */
export function targetChoices(raw: unknown): readonly TargetChoice[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TargetChoice[] = [];
  for (const entry of raw as readonly unknown[]) {
    const item: Partial<Record<keyof AutomationTarget, unknown>> =
      typeof entry === 'string'
        ? { entity: entry }
        : typeof entry === 'object' && entry
          ? entry
          : {};
    const id = typeof item.entity === 'string' ? item.entity.trim() : '';
    const domain = id.slice(0, id.indexOf('.'));
    if (!ENTITY_ID.test(id) || !VERBS[domain] || seen.has(id)) continue;
    seen.add(id);
    const name = text(item.name);
    const icon = text(item.icon);
    const verb = verbsFor([domain]).find((each) => each === item.verb);
    const level = Number(item.level);
    const temperature = Number(item.temperature);
    out.push({
      id,
      ...(name ? { name } : {}),
      ...(icon ? { icon } : {}),
      ...(verb ? { verb } : {}),
      ...(domain === 'light' && item.level !== undefined && Number.isFinite(level)
        ? { level: Math.min(100, Math.max(1, Math.round(level))) }
        : {}),
      ...(domain === 'climate' && item.temperature !== undefined && Number.isFinite(temperature)
        ? { temperature }
        : {}),
    });
  }
  return out;
}

/**
 * Whether a row is about the targets: its schedule drives one of them (read from its config, an administrator's at
 * once), or Home Assistant relates it to one (`search/related`: what its triggers, conditions and actions name).
 */
export function touches(
  schedule: Schedule | undefined,
  automation: string,
  targets: readonly string[],
  related: ReadonlySet<string>,
): boolean {
  return related.has(automation) || (schedule?.targets.some((id) => targets.includes(id)) ?? false);
}

/**
 * Whether a row is a Fluvy schedule: its config read as one; or, where it is not read — anyone but an administrator
 * may not, and an administrator's is on its way — its id is Fluvy's (`fluvy_` and twelve hex digits). So a guest's
 * schedules are schedules (the clock, `show: schedules`), and none flashes as plain before its config lands. A
 * `fluvy_` automation edited past the shape is plain once read, and a schedule to anyone who cannot read it.
 */
export const isSchedule = (
  schedule: Schedule | undefined,
  configId: string | undefined,
  read: boolean,
): boolean =>
  schedule !== undefined || (!read && configId !== undefined && SCHEDULE_ID.test(configId));
