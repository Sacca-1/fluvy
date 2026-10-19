import type { CustomCardEntry } from './ha/types.js';
import { declareHeight, type LayoutHeight } from './layout-heights.js';

export interface CardMeta extends Omit<CustomCardEntry, 'type'> {
  /** Custom element tag, which is also the card type after the `custom:` prefix. */
  readonly tag: string;
}

/**
 * Every tag is defined synchronously while the module evaluates: Home Assistant gives a custom card
 * two seconds to exist before it paints an error card, and an `await` before `define` loses that race.
 */
export function registerCard(meta: CardMeta, element: CustomElementConstructor): void {
  if (!customElements.get(meta.tag)) customElements.define(meta.tag, element);
  // a card that knows its height at a 360 column says so here, for whoever lays cards out
  const { layoutHeight } = element as { layoutHeight?: unknown };
  announceCard(
    meta,
    typeof layoutHeight === 'function' ? (layoutHeight as LayoutHeight) : undefined,
  );
}

/**
 * A card whose element arrives with a chunk fetched at start (the energy family): its place in the card picker and
 * its height now, its element when the chunk lands. Home Assistant keeps a card of a tag not yet defined hidden and
 * builds it again the moment the tag is defined (`customElements.whenDefined`), so nothing is lost on the way.
 */
export function announceCard(meta: CardMeta, layoutHeight?: LayoutHeight): void {
  if (layoutHeight) declareHeight(meta.tag, layoutHeight);
  const cards = (window.customCards ??= []);
  if (!cards.some((card) => card.type === meta.tag)) {
    const { tag, ...rest } = meta;
    cards.push({ type: tag, preview: true, ...rest });
  }
}
