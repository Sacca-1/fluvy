import { localize, type HomeAssistant } from '@fluvy/core';
import { listRow } from '@fluvy/ui';
import type { TemplateResult } from 'lit';
import { HeadFit } from '../energy/head.js';

/* the head's geometry (fluvy.css): a 44 circle and its 12 gap, a 44 round and its 12 gap */
const CIRCLE = 56;
const ROUND = 56;

/**
 * The head of a card whose round opens the map (the people card, the map card): the card's own title where it fits
 * beside the circle and the round, a shorter one where it does not — a typed title is the user's — and whether the
 * round holds beside that title at all. Where it does not (half a phone's column), the round gives way to a row under
 * the body (`mapRow`): a control never goes, as the automations card's `+` steps to a row.
 */
export function mapHead(
  fit: HeadFit,
  width: number,
  titles: readonly string[],
  own: string | undefined,
): { readonly title: string; readonly roundFits: boolean } {
  const measure = (text: string): number => fit.ruler.width('fv-card__title', text);
  const title =
    own ?? titles.find((text) => measure(text) <= width - CIRCLE - ROUND) ?? titles.at(-1) ?? '';
  return { title, roundFits: measure(title) <= width - ROUND };
}

/** The map's row where its round could not stand in the head: "Map" and a chevron, its circle by the rows' rule. */
export function mapRow(
  hass: HomeAssistant | undefined,
  fit: HeadFit,
  width: number,
  open: () => void,
): TemplateResult {
  const title = localize(hass, 'option.map');
  return listRow({
    icon: fit.rowsKeepIcon(width, [{ title, value: '', end: 44 }]) ? 'map' : null,
    tone: 'neutral',
    title,
    trailing: 'chevron',
    onTap: open,
  });
}
