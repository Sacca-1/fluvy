import type { EntityView } from '@fluvy/core';
import { type ChipItem } from '@fluvy/ui';
import { nothing, type TemplateResult } from 'lit';
import {
  field,
  fieldContext,
  isUnusable,
  nameOf,
  type HelperHost,
  type HelperRowConfig,
} from './context.js';
import { valueRow } from './rows.js';
import { chipRow } from '../shared/chips.js';
import { type RowStyle } from '../shared/config.js';

/** Beyond six, chips stop being a glance: the row carries the value and Home Assistant's own list opens. */
export const MAX_CHIPS = 6;

/**
 * An option as Home Assistant words it. `select` entities carry translated options ("eco" → "Eco");
 * the formatter takes the state from the entity it is given, so it is handed the entity in that state.
 */
function optionLabel(host: HelperHost, view: EntityView, option: string): string {
  if (host.hass?.formatEntityState && view.stateObj) {
    try {
      return host.hass.formatEntityState({ ...view.stateObj, state: option });
    } catch {
      /* fall through to the raw option */
    }
  }
  return option;
}

/** The options a select offers, as Home Assistant lists them. */
function optionsOf(view: EntityView): string[] {
  const raw = view.attr<unknown>('options');
  return Array.isArray(raw)
    ? raw.filter((option): option is string => typeof option === 'string')
    : [];
}

/**
 * What a long select's row shows at its end (the option chosen, "—" while it cannot be read); none for its chips, which
 * keep their place while it cannot be read (Home Assistant writes the options whatever the state).
 */
export function selectValue(host: HelperHost, view: EntityView): string | undefined {
  const count = optionsOf(view).length;
  if (count > 0 && count <= MAX_CHIPS) return undefined;
  return view.status === 'ok' ? optionLabel(host, view, host.state(view)) : '—';
}

/** What a select hands back: the label and its chips (blocks of the card), or one list row when the list is long. */
export type SelectPiece =
  { readonly blocks: readonly TemplateResult[] } | { readonly row: TemplateResult };

/** `input_select` / `select`: the label and its options as chips; a long list becomes a row that opens Home Assistant's list. */
export function selectPiece(
  host: HelperHost,
  view: EntityView,
  row: HelperRowConfig,
  style: RowStyle = 'full',
): SelectPiece {
  const value = selectValue(host, view);
  if (value !== undefined) return { row: valueRow(host, view, row, value) };
  const options = optionsOf(view);
  const state = host.state(view);
  const unusable = isUnusable(view);

  const items: ChipItem[] = options.map((option) => ({
    key: option,
    label: optionLabel(host, view, option),
    active: option === state,
    unavailable: unusable,
  }));
  return {
    blocks: [
      field(nameOf(view, row), fieldContext(host, view, row), nothing, unusable),
      chipRow(
        items,
        (option) => {
          if (option === state) return;
          host.expect(view.id, option);
          host.call(view.domain, 'select_option', { option }, view.id);
        },
        style,
        { ruler: host.ruler, width: host.contentWidth },
      ),
    ],
  };
}
