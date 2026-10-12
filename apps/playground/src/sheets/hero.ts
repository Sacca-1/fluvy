import type { SheetSpec } from '../scenes.js';
import { sheet as climate } from './climate.js';
import { sheet as energy } from './energy.js';
import { sheet as home } from './home.js';
import { sheet as media } from './media.js';

/** The cards of one of a sheet's frames, by its title: the hero shows the sheets' own cards, never copies. */
const cardsOf = (sheet: SheetSpec, title: string): SheetSpec['frames'][number]['cards'] => {
  const frame = sheet.frames.find((f) => f.title === title);
  if (!frame) throw new Error(`hero: no frame "${title}"`);
  return frame.cards;
};

/**
 * The README's hero: four cards side by side — the tiles, a compact thermostat, the energy chart, the player —
 * the same picture in any palette:
 *   node tools/render/shot.mjs --sheet hero --width 420 --viewport 1920 --scale 1 --fit 1 --palette blaze
 */
export const sheet: SheetSpec = {
  states: [...home.states, ...climate.states, ...energy.states, ...media.states],
  history: { ...home.history, ...energy.history },
  ws: { ...energy.ws, ...media.ws },
  api: (method, path, body) => energy.api?.(method, path, body) ?? media.api?.(method, path, body),
  frames: [
    { title: 'Tiles', width: 420, cards: cardsOf(home, 'Tiles').slice(0, 4) },
    {
      title: 'Thermostat',
      width: 420,
      cards: cardsOf(climate, 'Compact · off, heat, cool · fan full width').map((card) => ({
        ...card,
        modes: ['heat', 'cool'],
      })),
    },
    { title: 'Energy', width: 420, cards: cardsOf(energy, 'Energy') },
    { title: 'Player', width: 420, cards: cardsOf(media, 'Playing') },
  ],
};
