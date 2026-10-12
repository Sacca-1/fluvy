import {
  accentFamily,
  accentFamilyVars,
  declarationsCss,
  DEFAULT_PALETTE,
  parsePaletteKey,
  resolveAccent,
  seedOf,
  surfaceWash,
  type Hex,
  type PaletteMode,
} from '@fluvy/tokens/runtime';
import { paletteOf } from './css.js';

/**
 * A card's own colour: what it redefines inside the card, derived on the palette the card wears (`--fluvy-palette`)
 * in the mode it is in, and written into the card's shadow root — never on the host, whose computed values the
 * card reads (the sentinel, the palette), and without `!important`: a child's own declaration wins over what it
 * would inherit from the host, and no host rule reads the accent.
 */

/** The declarations a colour writes on a palette × mode, derived once and kept (the last 128). */
const kept = new Map<string, string>();
const KEPT = 128;

function remember(key: string, css: string): string {
  kept.delete(key);
  kept.set(key, css);
  if (kept.size > KEPT) kept.delete(kept.keys().next().value as string);
  return css;
}

/** The palette a key names, the default where the key is not one of ours (a page without a look). */
const choiceOf = (paletteKey: string) => parsePaletteKey(paletteKey) ?? DEFAULT_PALETTE;

/** What a card's `color` (a name, a hex, a triplet) is on this palette × mode; undefined: the accent itself. */
export function accentHex(paletteKey: string, mode: PaletteMode, choice: unknown): Hex | undefined {
  if (choice === undefined || choice === null || choice === '') return undefined;
  return resolveAccent(choice, paletteOf(choiceOf(paletteKey))[mode]);
}

/**
 * What a card's own surface colour (`card_color`) writes: the card's fill as a wash of the colour and the card's edge
 * and dividers in the colour's hairline, derived on the palette × mode and kept like the accent's family.
 */
export function surfaceCss(paletteKey: string, mode: PaletteMode, pick: Hex): string {
  const key = `surface|${paletteKey}|${mode}|${pick}`;
  const known = kept.get(key);
  if (known !== undefined) return known;
  const choice = choiceOf(paletteKey);
  const colors = paletteOf(choice)[mode];
  const family = accentFamily(seedOf(choice), colors, pick);
  return remember(
    key,
    declarationsCss([
      ['--fluvy-card', surfaceWash(family, colors)],
      ['--fluvy-border', family.fillBorder],
    ]),
  );
}

export function accentCss(paletteKey: string, mode: PaletteMode, pick: Hex): string {
  const key = `${paletteKey}|${mode}|${pick}`;
  const known = kept.get(key);
  if (known !== undefined) return known;
  const choice = choiceOf(paletteKey);
  const colors = paletteOf(choice)[mode];
  return remember(
    key,
    declarationsCss(accentFamilyVars(accentFamily(seedOf(choice), colors, pick), colors)),
  );
}

/**
 * The sheet a card adopts for its colours: the card's own (`:host > *`) and those of its items (`[data-accent]`,
 * one rule per colour used). `wears()` tells it which palette and mode the card is in; `host()` and `item()` are
 * asked while the card renders; `commit()` writes the sheet once, and only when something changed.
 */
export class AccentSheet {
  private readonly sheet = new CSSStyleSheet();
  /** Unset until the card says what it wears: the first `wears()` is always a change. */
  private paletteKey = '';
  private mode: PaletteMode = 'light';
  private hostPick: Hex | undefined;
  private surfacePick: Hex | undefined;
  private items = new Set<Hex>();
  private written = '';

  /** Adopted once into the card's shadow root, beside its stylesheets. */
  adopt(root: ShadowRoot): void {
    if (!root.adoptedStyleSheets.includes(this.sheet))
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.sheet];
  }

  /** The palette and mode the card wears; true when either changed (the colours must be derived again). */
  wears(paletteKey: string, mode: PaletteMode): boolean {
    const key = paletteKey || DEFAULT_PALETTE;
    if (key === this.paletteKey && mode === this.mode) return false;
    this.paletteKey = key;
    this.mode = mode;
    return true;
  }

  /** The card's own colour, as configured. */
  host(choice: unknown): void {
    this.hostPick = accentHex(this.paletteKey, this.mode, choice);
  }

  /** The card's own surface colour (`card_color`), as configured: a wash of it as the card's fill, its hairline as the edge. */
  surface(choice: unknown): void {
    this.surfacePick = accentHex(this.paletteKey, this.mode, choice);
  }

  /** Forgets the items' colours before a render asks for them again. */
  begin(): void {
    this.items = new Set();
  }

  /** An item's colour, as configured: the value for its `data-accent`, or nothing when it has none of its own. */
  item(choice: unknown): Hex | undefined {
    const hex = accentHex(this.paletteKey, this.mode, choice);
    if (hex) this.items.add(hex);
    return hex;
  }

  /** Writes the sheet: the host's colour and surface on the card's children, each item's on its `data-accent`. */
  commit(): void {
    const rules: string[] = [];
    const host =
      (this.hostPick ? accentCss(this.paletteKey, this.mode, this.hostPick) : '') +
      (this.surfacePick ? surfaceCss(this.paletteKey, this.mode, this.surfacePick) : '');
    if (host) rules.push(`:host > *{${host}}`);
    for (const hex of this.items)
      rules.push(`[data-accent="${hex}"]{${accentCss(this.paletteKey, this.mode, hex)}}`);
    const css = rules.join('');
    if (css === this.written) return;
    this.written = css;
    this.sheet.replaceSync(css);
  }
}
