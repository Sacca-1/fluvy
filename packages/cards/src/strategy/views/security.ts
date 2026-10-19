import { balanced, flowed, full, when } from '../layout.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';

/*
 * The security dashboard (`custom:fluvy-security`): the overview (the alarm, what locks, what opens, the cameras),
 * every camera, and the openings room by room.
 */

const camera = (id: string, ctx: StrategyContext): Card =>
  full('camera', { entity: id, ...(ctx.style.refresh ? { refresh: ctx.style.refresh } : {}) });

/** The alarm first, then what opens (locks, garage doors and gates), what is open, and the first cameras. */
function overviewView(ctx: StrategyContext): Section[] {
  const { home, t } = ctx;
  return balanced(ctx, [
    ...home.alarms.slice(0, 2).map((id) => full('alarm', { entity: id, ...home.named(id) })),
    ...home.locks.slice(0, 4).map((id) => full('lock', { entity: id, ...home.named(id) })),
    ...home.gateways.slice(0, 2).map((id) => full('cover', { entity: id, ...home.named(id) })),
    ...when(home.openings.length, () => [
      full('openings', { title: t('strategy.sensors'), entities: home.openings.slice(0, 8) }),
    ]),
    ...home.cameras.slice(0, 2).map((id) => camera(id, ctx)),
  ]);
}

/** Every camera, at the dashboard's refresh. */
function camerasView(ctx: StrategyContext): Section[] {
  return balanced(
    ctx,
    ctx.home.cameras.slice(0, 9).map((id) => camera(id, ctx)),
  );
}

/** The openings by room (a card a room when the house has areas, else one), every one of them. */
function openingsView(ctx: StrategyContext): Section[] {
  const { home, t } = ctx;
  const groups = new Map<string, string[]>();
  for (const id of home.openings) {
    const key = home.areaName(home.areaOf(id)) ?? t('strategy.sensors');
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return flowed(
    ctx,
    [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([title, ids]) => [full('openings', { title, entities: ids.slice(0, 12) })]),
  );
}

export const SECURITY_VIEWS: readonly ViewSpec[] = [
  {
    key: 'overview',
    icon: 'fluvy:shield',
    title: 'strategy.security',
    build: overviewView,
    when: () => true,
  },
  {
    key: 'cameras',
    icon: 'fluvy:camera',
    title: 'strategy.cameras',
    build: camerasView,
    when: ({ home }) => home.cameras.length > 0,
  },
  {
    key: 'openings',
    icon: 'fluvy:door',
    title: 'strategy.openings',
    build: openingsView,
    when: ({ home }) => home.openings.length > 0,
  },
];
