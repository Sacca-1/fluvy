import {
  balanced,
  batteriesCard,
  deviceRow,
  energyBalance,
  energyFlow,
  full,
  gridCard,
  hasBattery,
  hasSources,
  when,
} from '../layout.js';
import { TODAY } from '../home-registry.js';
import type { Card, Section, StrategyContext, ViewSpec } from '../types.js';

/*
 * The energy dashboard (`custom:fluvy-energy`): now (the flow, the balance, the grid, the batteries, the charger and
 * the day by source), today (a day's flow, where it went, the score, the day's balance), what the sun makes, what
 * the devices draw, water and gas, and a curve a power meter.
 */

/** The live cards: where the energy comes from and goes, and each part of the house's system on its own. */
export function liveCards(ctx: StrategyContext): Card[] {
  const { energy, t } = ctx;
  return [
    ...when(hasSources(energy), () => [energyFlow(energy, ctx.style)]),
    ...when(hasSources(energy) && (energy.solarPower || energy.batteryPower), () => [
      energyBalance(energy),
    ]),
    ...when(energy.prefsMeters, () => [full('energy', { variant: 'sources' })]),
    ...when(
      energy.gridPower || energy.gridPhases.length || (energy.gridImport && energy.gridExport),
      () => [gridCard(energy)],
    ),
    // the meter's id last: `when` hands its value to the card
    ...when(!energy.gridExport && !energy.prefsPower && energy.gridPower, (id) => [
      full('gauge', {
        entity: id,
        variant: 'signed',
        name: t('energy.grid'),
      }),
    ]),
    ...when(hasBattery(energy), () => [batteriesCard(energy)]),
    ...when(energy.charger, (id) => [full('ev-charger', { entity: id })]),
  ];
}

/** A day's totals as the energy dashboard allocates them: the flow of the day, where it went, the score. */
export function todayCards(ctx: StrategyContext): Card[] {
  const { energy } = ctx;
  return when(energy.prefsMeters, () => [
    energyFlow(energy, ctx.style, { period: 'day', badge: 'self_powered' }),
    full('energy-sankey'),
    full('energy-score'),
    energyBalance(energy, { period: 'day' }),
  ]);
}

/** The flow and the day by source first, then each part of the system, and the day's curve. */
function nowView(ctx: StrategyContext): Section[] {
  const { home, t, energy } = ctx;
  const { solarPower, gridPower, homePower, consumptionPowers } = energy;
  return balanced(ctx.header, [
    ...liveCards(ctx),
    ...(energy.prefsMeters
      ? []
      : solarPower
        ? [full('energy', { entity: solarPower, name: t('energy.solar') })]
        : gridPower
          ? [full('energy', { entity: gridPower, name: t('energy.grid') })]
          : homePower
            ? [full('energy', { entity: homePower })]
            : []),
    ...when(consumptionPowers.length >= 2, () => [
      full('distribution', {
        title: t('strategy.consumption'),
        entities: consumptionPowers.slice(0, 8),
        ...(energy.homePower ? { total: energy.homePower } : {}),
      }),
    ]),
    ...when(
      home.energies.filter((id) => TODAY.test(home.label(id))),
      (todays) =>
        todays.length >= 2
          ? [full('stat-tiles', { title: t('strategy.today'), tiles: todays.slice(0, 4) })]
          : [],
    ),
  ]);
}

/** Today in energy: the day's flow, where it went, the score and the day's balance. */
function todayView(ctx: StrategyContext): Section[] {
  return balanced(ctx.header, todayCards(ctx));
}

/** What the sun makes: today's production, its last days as bars, the inverter's gauge and its day. */
function productionView(ctx: StrategyContext): Section[] {
  const { t, energy } = ctx;
  const { solarPower, solarToday } = energy;
  return balanced(ctx.header, [
    ...when(solarToday, (id) => [full('production', { entity: id })]),
    ...when(solarToday, (id) => [full('history-bars', { entity: id, color: 'amber' })]),
    ...when(solarPower, (id) => [full('gauge', { entity: id })]),
    ...when(solarPower, (id) => [full('energy', { entity: id, name: t('energy.solar') })]),
  ]);
}

/** The energy dashboard's devices, nested as it nests them, and how they share what the house draws. */
function devicesView(ctx: StrategyContext): Section[] {
  const { home, t, energy } = ctx;
  const { consumption, consumptionPowers } = energy;
  return balanced(ctx.header, [
    ...when(consumption.length, () => [
      full('energy-devices', {
        title: t('strategy.appliances'),
        rows: consumption.slice(0, 12).map((id) => deviceRow(home, id)),
      }),
    ]),
    ...when(consumptionPowers.length >= 2, () => [
      full('distribution', {
        title: t('strategy.consumption'),
        entities: consumptionPowers.slice(0, 8),
        ...(energy.homePower ? { total: energy.homePower } : {}),
      }),
    ]),
  ]);
}

/** The house's water and gas meters. */
function metersCards({ energy }: StrategyContext): Card[] {
  return when(energy.meters.length, () => [
    full('meters', { meters: energy.meters.map((entity) => ({ entity })) }),
  ]);
}

/** A day's curve for every power meter of the house. */
function metersView(ctx: StrategyContext): Section[] {
  const { home } = ctx;
  return balanced(
    ctx.header,
    home.powers.slice(0, 9).map((id) => full('energy', { entity: id, name: home.placeName(id) })),
  );
}

export const ENERGY_VIEWS: readonly ViewSpec[] = [
  { key: 'now', icon: 'fluvy:bolt', title: 'strategy.now', build: nowView, when: () => true },
  {
    key: 'today',
    icon: 'fluvy:calendar',
    title: 'strategy.today',
    build: todayView,
    when: ({ energy }) => energy.prefsMeters,
  },
  {
    key: 'production',
    icon: 'fluvy:sun',
    title: 'strategy.production',
    build: productionView,
    when: ({ energy }) => Boolean(energy.solarPower || energy.solarToday),
  },
  {
    key: 'devices',
    icon: 'fluvy:plug',
    title: 'strategy.devices',
    build: devicesView,
    when: ({ energy }) => energy.consumption.length > 0 || energy.consumptionPowers.length >= 2,
  },
  {
    key: 'water',
    icon: 'fluvy:drop',
    title: 'strategy.water_gas',
    build: (ctx) => balanced(ctx.header, metersCards(ctx)),
    when: ({ energy }) => energy.meters.length > 0,
  },
  {
    key: 'meters',
    icon: 'fluvy:chart',
    title: 'strategy.meters',
    build: metersView,
    when: ({ home }) => home.powers.length > 0,
  },
];

export { metersCards };
