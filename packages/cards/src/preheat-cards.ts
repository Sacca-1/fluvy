import { registerCard } from '@fluvy/core';
import { PREHEAT_FAMILY } from './preheat-family.js';
import { FluvyPreheatCard } from './preheat/preheat-card.js';
export const CARDS = PREHEAT_FAMILY.map(
  ([tag, name, description]) => [tag, FluvyPreheatCard, name, description] as const,
);
for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
