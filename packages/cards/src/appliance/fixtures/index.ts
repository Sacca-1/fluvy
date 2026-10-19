import {
  electroluxFridge,
  electroluxWasher,
  honDishwasher,
  honWasher,
  smartthinqWasher,
} from './community.js';
import {
  hcCoffee,
  hcDishwasher,
  hcDishwasherDone,
  hcFridge,
  hcOven,
  hcRobot,
} from './home-connect.js';
import type { ApplianceFixture } from './house.js';
import { reporterAtWork, reporterHouse } from './lg-reporter.js';
import {
  lgDishwasher,
  lgDryer,
  lgFridge,
  lgNotAppliances,
  lgWashCombo,
  lgWasher,
  lgWashTower,
} from './lg-thinq.js';
import { matterDishwasher, matterFridge, matterNotAppliances, matterWasher } from './matter.js';
import { mieleCoffee, mieleFridge, mieleHob, mieleNotAppliances, mieleWasher } from './miele.js';
import { plainPlugs, plugWasher } from './plug.js';
import { stDishwasher, stFridge, stOven, stWasher } from './smartthings.js';
import { tuyaCoffee, tuyaKettle } from './tuya.js';
import { whirlpoolDryer, whirlpoolFridge, whirlpoolOven, whirlpoolWasher } from './whirlpool.js';

export * from './house.js';
export * from './community.js';
export * from './home-connect.js';
export * from './lg-reporter.js';
export * from './lg-thinq.js';
export * from './matter.js';
export * from './miele.js';
export * from './plug.js';
export * from './smartthings.js';
export * from './tuya.js';
export * from './whirlpool.js';

/**
 * Every appliance fixture at a moment — one device each, of every integration, the reporter's LG house as he dumped it
 * (#47), and what is never an appliance — for the house-wide tests (a printer is never one of them, and none of them a
 * printer) and the playground's sheet. The dishwasher done is the running one an hour on, the reporter's at work are
 * his at rest with a cycle under way: those are never in one house with these.
 */
export function allFixtures(now: number): readonly ApplianceFixture[] {
  return [
    lgWasher(now),
    lgDryer(now),
    ...lgWashTower(now),
    ...lgWashCombo(now),
    lgFridge(now),
    lgDishwasher(now),
    ...lgNotAppliances(now),
    ...reporterHouse(now),
    hcDishwasher(now),
    hcOven(now),
    hcCoffee(now),
    hcFridge(now),
    hcRobot(now),
    mieleWasher(now),
    mieleCoffee(now),
    mieleFridge(now),
    mieleHob(now),
    ...mieleNotAppliances(now),
    stWasher(now),
    stFridge(now),
    stOven(now),
    stDishwasher(now),
    matterDishwasher(now),
    matterWasher(now),
    matterFridge(now),
    ...matterNotAppliances(now),
    whirlpoolWasher(now),
    whirlpoolDryer(now),
    whirlpoolOven(now),
    whirlpoolFridge(now),
    tuyaKettle(now),
    tuyaCoffee(now),
    honWasher(now),
    honDishwasher(now),
    electroluxWasher(now),
    electroluxFridge(now),
    smartthinqWasher(now),
    plugWasher(now),
    ...plainPlugs(now),
  ];
}

/** The fixtures of the moments `allFixtures` leaves out, each alone in its house. */
export const laterFixtures = (now: number): readonly ApplianceFixture[] => [
  hcDishwasherDone(now),
  ...reporterAtWork(now),
];
