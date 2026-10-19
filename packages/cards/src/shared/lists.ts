import {
  localize,
  selfHide,
  type FluvyCard,
  type FluvyCardConfig,
  type MessageKey,
} from '@fluvy/core';
import { emptyState } from '@fluvy/ui';
import type { TemplateResult } from 'lit';

/** A config's lists, read alike by every card (core's, where the base card's `watched()` reads them too). */
export { entriesOf, idsOf, itemsOf, listOf, type EntityEntry } from '@fluvy/core';

/**
 * What a card of a list does while the list has nothing to show (#48) — a filter that matches nothing yet
 * (auto-entities), the last entry taken out in the editor: its head and the empty panel in its own words where the
 * list would be, never a configuration error.
 */
export interface EmptyList {
  /** The panel's words in place of the card's own ("No sensors"): what an empty list means here ("All closed"). */
  empty_text?: string;
  /** Hidden while it has nothing to show, back as soon as it has; never in the editor. */
  hide_empty?: boolean;
}

/** The keys every card of a list adds to its own. */
export const EMPTY_KEYS = ['empty_text', 'hide_empty'] as const;

type ListCard = FluvyCard<FluvyCardConfig & EmptyList>;

/**
 * A card of a list says once a render whether it has anything to show: asked to (`hide_empty`), it hides itself while
 * it has not and shows itself again as soon as it has (`selfHide`).
 */
export const hideEmpty = (card: ListCard, empty: boolean): void =>
  selfHide(card, empty && card.config?.hide_empty === true);

/**
 * The same, and with nothing to show the panel it draws where its list would be: its own words (`text`) or the
 * config's, in the page's other fill where no card is around it (`page`).
 */
export function emptyPanel(
  card: ListCard,
  empty: boolean,
  glyph: string,
  text: MessageKey,
  page?: boolean,
): TemplateResult | undefined {
  hideEmpty(card, empty);
  return empty
    ? emptyState(glyph, card.config?.empty_text ?? localize(card.hass, text), '', page)
    : undefined;
}
