// the family's words first: they are here before anything in its chunk says them
import './appliance/english.js';
import { registerCard } from '@fluvy/core';
import { FluvyApplianceCard } from './appliance/appliance-card.js';
import { FluvyAppliancesCard } from './appliance/appliances-card.js';
import { APPLIANCES_FAMILY } from './appliances-family.js';

/**
 * The appliances family's elements: this module is its own chunk, fetched at start (`index.ts`) and defined as it
 * lands. The names, descriptions and heights live in `appliances-family.ts`, which every page carries; the job's times
 * and their words come with the devices family, which the printer shares.
 */
const ELEMENTS: Readonly<Record<string, CustomElementConstructor>> = {
  'fluvy-appliance-card': FluvyApplianceCard,
  'fluvy-appliances-card': FluvyAppliancesCard,
};

export const CARDS = APPLIANCES_FAMILY.map(
  ([tag, name, description]) =>
    [tag, ELEMENTS[tag] as CustomElementConstructor, name, description] as const,
);

for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
