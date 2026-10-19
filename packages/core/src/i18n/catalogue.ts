import core from './locales/en/core.json';
import type activity from './locales/en/activity.json';
import type alerts from './locales/en/alerts.json';
import type appliances from './locales/en/appliances.json';
import type automations from './locales/en/automations.json';
import type devices from './locales/en/devices.json';
import type energy from './locales/en/energy.json';
import type history from './locales/en/history.json';
import type job from './locales/en/job.json';
import type media from './locales/en/media.json';
import type panel from './locales/en/panel.json';

/**
 * The shape of a catalogue, taken from English (the source every other language mirrors key for key): one table
 * per namespace — the shared words (`common`, `climate`, `editor`, …), one per card or page (`cover`, `panel`,
 * `history`, …). English comes in parts, and the shape is all of them at once: `core.json` ships inline, and each
 * lazy family's part (`panel.json`, `energy.json`, …) travels with that family's chunk, which registers it
 * (`addEnglish`) as it lands. Every other language is one catalogue with every namespace.
 */
export type Catalogue = typeof core &
  typeof activity &
  typeof alerts &
  typeof appliances &
  typeof automations &
  typeof devices &
  typeof energy &
  typeof history &
  typeof job &
  typeof media &
  typeof panel;

export type Namespace = keyof Catalogue;

/** The keys of one namespace (`'favourites' | 'class.awning' | …` for `cover`). */
export type KeyOf<N extends Namespace> = N extends unknown ? keyof Catalogue[N] & string : never;

/** A key with its namespace (`'climate.mode.heat'`, `'editor.title'`): what `localize()` and a card's `t()` take. */
export type MessageKey = { [N in Namespace]: `${N}.${KeyOf<N>}` }[Namespace];

export type Values = Readonly<Record<string, string | number>>;

/** English's inline part, the fallback of every lookup: the words any page may say before a family lands. */
export const english: typeof core = core;
