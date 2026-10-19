import { isUsable, type EntityView, type HomeAssistant } from '@fluvy/core';
import { label, options, type GlyphName, type OptionItem, type Tone } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { MODE_GLYPH, modeKind, selectOptions, type ModeKind } from '../energy-model/modes.js';
import { chipRow } from '../shared/chips.js';
import type { TextRuler } from '../shared/fit.js';
import { optionCell, optionColumnsFor, optionsHold, valuesHeld } from '../shared/options.js';

/** Under this column option tiles would be too narrow for their words: the modes are a chip row. */
const TILES_FROM = 240;
/** A filled chip's words, measured in its own classes, and the pill's sides (8 each). */
const CHIP_LABEL = 'fv-chips fv-chips--fill > fv-chip > fv-chip__pill';
const CHIP_SIDES = 16;

/** An option as Home Assistant words it (a `select` carries translated options: "pv" → "Solar"). */
export function optionWords(
  hass: HomeAssistant | undefined,
  view: EntityView,
  option: string,
): string {
  if (hass?.formatEntityState && view.stateObj) {
    try {
      // an option with no translation comes back as it is: the id, worded below
      const text = hass.formatEntityState({ ...view.stateObj, state: option });
      if (
        typeof text === 'string' &&
        text !== '' &&
        text.toLocaleLowerCase() !== option.toLocaleLowerCase()
      )
        return text;
    } catch {
      /* the raw option below */
    }
  }
  // an id, not a word: its parts apart, two consonants as the acronym they are ("minpv" → "Min PV", "pv" → "PV";
  // "on" stays a word)
  const raw = option
    .replace(/^minpv$/i, 'min pv')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => (/^[^\WaeiouyÀ-ÿ\d_]{2}$/i.test(part) ? part.toUpperCase() : part))
    .join(' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface ModeRowOptions {
  readonly hass: HomeAssistant | undefined;
  /** The `select` / `input_select`. */
  readonly view: EntityView;
  /** Its state as the card draws it (the option chosen a moment ago, until Home Assistant says so). */
  readonly state: string;
  readonly heading: string;
  readonly width: number;
  readonly ruler: TextRuler;
  /** The glyph of a mode that is neither off, the sun nor full power: the device's own. */
  readonly glyph: GlyphName;
  /** The fill of a chosen mode that is not off or the sun. */
  readonly tone: Tone;
  /** What a mode means, under its name (the car's "Paused", "Surplus"); none by default. */
  readonly meaning?: (kind: ModeKind) => string;
  /** Up to this many options are tiles; more are a chip row. */
  readonly tilesUpTo: number;
  readonly onSelect: (option: string) => void;
}

/**
 * An energy device's mode, the language's idiom for modes: its options as option tiles (a glyph, the option's
 * name, what it means), or a chip row when they are many or the column is narrow. Nothing is drawn for a select
 * that offers nothing; one that cannot be used shows its choice and takes no tap.
 */
export function modeRow(o: ModeRowOptions): TemplateResult | typeof nothing {
  const choices = selectOptions(o.view.attr<unknown>('options'));
  if (!choices.length) return nothing;
  const usable = isUsable(o.view);
  const select = (option: string): void => {
    if (usable && option !== o.state) o.onSelect(option);
  };
  const items = choices.map((option): OptionItem & { kind: ModeKind; words: string } => {
    const kind = modeKind(option);
    const words = optionWords(o.hass, o.view, option);
    const meaning = o.meaning?.(kind) ?? '';
    return {
      key: option,
      kind,
      words,
      // a mode with no meaning to say under it (neither off, the sun nor full power) puts its name on the value's
      // line, so every tile's value shares one baseline
      label: o.meaning && !meaning ? '' : words,
      value: o.meaning && !meaning ? words : meaning,
      glyph: kind === 'other' ? o.glyph : MODE_GLYPH[kind],
      tone: kind === 'off' ? 'neutral' : kind === 'sun' ? 'solar' : o.tone,
      active: option === o.state,
    };
  });
  const height = o.meaning ? 84 : 64;
  // a tile's name is measured in the line it sits on: the label's, or the value's where it stands in for a meaning
  const names = items.map((i) => i.label || i.value || '');
  const measureName = (text: string): number =>
    items.some((i) => !i.label && i.value === text)
      ? o.ruler.width('fv-option__value', text)
      : o.ruler.width('fv-option__label', text);
  // tiles only while every mode's name holds its cell (`optionsHold`: a charger's "Surplus solaire" in a 211 column
  // does not): else the chips, which give way in their own order and never cut a word
  if (
    items.length <= o.tilesUpTo &&
    o.width >= TILES_FROM &&
    optionsHold(names, o.width, 4, measureName)
  ) {
    const columns = optionColumnsFor(names, o.width, 4, measureName);
    // a meaning's word the cell cannot hold (de's "Überschuss" under the sun's mode) is dropped, never cut; a name
    // on the value's line stays
    const held = valuesHeld(items, optionCell(o.width, 4, columns), (text) =>
      o.ruler.width('fv-option__value', text),
    );
    return html`${label(o.heading)}${options(held, usable ? select : null, 4, height, columns)}`;
  }
  // a chip's words are never cut: a column that cannot hold the longest even alone lists the modes as tiles, one a
  // row, whose names (an entity's options) may end in an ellipsis as names do
  const widest = Math.max(...items.map((i) => o.ruler.width(CHIP_LABEL, i.words))) + CHIP_SIDES;
  if (widest > o.width)
    return html`${label(o.heading)}${options(
      valuesHeld(
        items.map((i) => ({ ...i, name: true })),
        optionCell(o.width, 4, 1),
        (text) => o.ruler.width('fv-option__value', text),
      ),
      usable ? select : null,
      4,
      height,
      1,
    )}`;
  // a chip is the mode's name, chosen in the mode's own tone (the sun's for a solar mode), as its tile is
  return html`${label(o.heading)}${chipRow(
    items.map((i) => ({
      key: i.key,
      label: i.words,
      active: i.active ?? false,
      ...(i.tone ? { tone: i.tone } : {}),
    })),
    select,
    'full',
    { ruler: o.ruler, width: o.width },
  )}`;
}
