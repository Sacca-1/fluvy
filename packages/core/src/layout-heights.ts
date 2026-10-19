import type { HomeAssistant, LovelaceCardConfig } from './ha/types.js';

/*
 * How tall a card will be, before it is drawn: each card declares its height at a 360 column from its config
 * (`static layoutHeight`, registered with the card), and whoever lays cards out (the automatic dashboard) reads
 * it here — one number per card, kept by the card that knows it. Given the house too, a card counts what its
 * entity's capabilities draw (a thermostat's presets, a fan's oscillation row, a cover's tilt); without it, what
 * the config says and its documented default.
 */

export type LayoutHeight = (config: LovelaceCardConfig, hass?: HomeAssistant) => number;

const heights = new Map<string, LayoutHeight>();

/** A card's height at a 360 column, by its tag. */
export function declareHeight(tag: string, height: LayoutHeight): void {
  heights.set(tag, height);
}

/** The declared height of a card's config, else `fallback` (a card of another maker, or one that declared none). */
export function layoutHeightOf(
  config: LovelaceCardConfig,
  fallback: number,
  hass?: HomeAssistant,
): number {
  const tag = config.type.startsWith('custom:') ? config.type.slice('custom:'.length) : '';
  const height = heights.get(tag);
  return height ? height(config, hass) : fallback;
}

/** The tags that declared a height. */
export const declaredHeights = (): ReadonlySet<string> => new Set(heights.keys());
