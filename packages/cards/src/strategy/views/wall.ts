import type { AreaRegistryEntry } from '@fluvy/core';
import { entityRow, full, helloCard, section, thermostat } from '../layout.js';
import { roomCard, roomsOf } from '../rooms.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';

/*
 * The wall dashboard (`custom:fluvy-wall`): the approved tablet composition, two columns read from a metre away —
 * the greeting, the clock, the readings, the scenes and the rooms on the left; the thermostat, the security rows
 * and who is home on the right. No tabs: a room opens as a subview and comes back here.
 */

/**
 * The rooms a wall shows: the ones asked for that exist, in that order — one chosen and empty is kept, its card saying
 * so — else every room with something in it.
 */
export function wallRooms(ctx: StrategyContext): AreaRegistryEntry[] {
  if (!ctx.areas) return roomsOf(ctx.home);
  return ctx.areas
    .map((id) => ctx.home.areas.find((area) => area.area_id === id))
    .filter((area): area is AreaRegistryEntry => area !== undefined);
}

function wallView(ctx: StrategyContext): Section[] {
  const { home, t, weather, style } = ctx;
  const scenes = home.scenes.slice(0, style.scenes ?? 6);
  const readings = home.temperatures.slice(0, 3);
  const secured = [...home.alarms, ...home.locks, ...home.gateways, ...home.openings].slice(0, 6);
  const left: Card[] = [
    helloCard(weather),
    full('clock', { variant: 'side', ...(weather ? { weather } : {}) }),
    ...(readings.length
      ? [
          {
            type: 'custom:fluvy-readouts-card',
            variant: 'row',
            rows: readings.map((id) => ({ entity: id, name: home.placeName(id) })),
          } as Card,
        ]
      : []),
    ...(scenes.length
      ? [
          {
            type: 'custom:fluvy-chips-card',
            chips: scenes.map((id) => ({
              name: home.displayName(id),
              icon: 'fluvy:sparkle',
              action: {
                action: 'perform-action',
                perform_action: 'scene.turn_on',
                target: { entity_id: id },
              },
            })),
          } as Card,
        ]
      : []),
    ...wallRooms(ctx).map((area) => ({ ...roomCard(ctx, area), variant: 'tile' })),
  ];
  const right: Card[] = [
    ...(home.climate[0] ? [thermostat(home.climate[0], style)] : []),
    ...(secured.length
      ? [
          full('entities', {
            title: t('strategy.security'),
            rows: secured.map((id) => entityRow(home, id)),
          }),
        ]
      : []),
    ...(home.people.length
      ? [full('people', { title: t('strategy.people'), entities: [...home.people] })]
      : []),
  ];
  return [section(...left), section(...right)];
}

export const WALL_VIEWS: readonly ViewSpec[] = [
  { key: 'wall', icon: 'fluvy:frame', title: 'strategy.home', build: wallView, when: () => true },
];
