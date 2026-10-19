// @vitest-environment happy-dom
import type { EntityView } from '@fluvy/core';
import { html, render } from 'lit';
import { describe, expect, it } from 'vitest';
import type { TextRuler } from '../shared/fit.js';
import { modeRow } from './mode-row.js';

/*
 * An energy device's modes are option tiles only while every name holds its cell (`optionsHold`): where one would be
 * cut (a charger's "Surplus solaire" in a 211 column) they are chips, which give way in their own order and never cut
 * a word. The ruler is a stub: 8 px a glyph on a tile, 7 on a chip.
 */

const ruler = {
  width: (cls: string, text: string) => text.length * (cls.includes('fv-chip') ? 7 : 8),
  pill: (_cls: string, text: string, sides: number) => text.length * 7 + sides,
  clear() {},
} as unknown as TextRuler;

/** A select with these options, as the card sees it. */
const select = (options: readonly string[]): EntityView =>
  ({
    id: 'select.charger_mode',
    domain: 'select',
    status: 'ok',
    state: options[0],
    attr: (name: string) => (name === 'options' ? options : null),
    stateObj: null,
  }) as unknown as EntityView;

function drawn(options: readonly string[], width: number): HTMLElement {
  const host = document.createElement('div');
  render(
    html`${modeRow({
      hass: undefined,
      view: select(options),
      state: options[0] ?? '',
      heading: 'Mode',
      width,
      ruler,
      glyph: 'bolt',
      tone: 'accent',
      tilesUpTo: 4,
      onSelect: () => undefined,
    })}`,
    host,
  );
  return host;
}

describe('an energy device’s mode row', () => {
  it('draws tiles while every name holds its cell, chips where one would be cut', () => {
    // 320: three cells of (320 − 8) / 3 − 24 = 80 hold "Surplus" (56) and "Fast charge" (88)? not the latter: two
    // columns of 132 do, and the row still holds: tiles
    const wide = drawn(['off', 'surplus', 'fast charge'], 320);
    expect(wide.querySelector('.fv-option')).not.toBeNull();
    expect(wide.querySelector('.fv-chip')).toBeNull();
    // 171: "Solar surplus only" (144) holds no cell of two (61) nor the row's one: chips, every word whole
    const narrow = drawn(['off', 'solar surplus only'], 240);
    expect(narrow.querySelector('.fv-option')).toBeNull();
    expect(narrow.querySelectorAll('.fv-chip').length).toBe(2);
  });
});
