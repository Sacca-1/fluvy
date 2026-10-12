/**
 * The palette engine as the browser runs it (`@fluvy/tokens/runtime`, no Node APIs): a look — a palette,
 * preset or custom, and a shape — becomes the declarations the theme file would carry, for one mode. The
 * theme file is written from the same function, so a look applied live and the installed theme agree to
 * the value.
 */
import { derivePalette } from './build/derive.js';
import { PALETTE_NAMES } from './config.js';
import {
  brandColorVars,
  identityVars,
  OPTIONAL_BRAND_VARS,
  scaleVars,
  type CssDeclaration,
} from './emit/vars.js';
import { haModeVars, haSharedVars } from './ha/groups.js';
import { customSeed } from './palettes/custom.js';
import { seeds } from './palettes/index.js';
import type { PaletteChoice } from './palettes/key.js';
import {
  DEFAULT_PILL,
  DEFAULT_SHAPE,
  PILL_NAMES,
  SHAPE_NAMES,
  type PillName,
  type ShapeName,
} from './scales/radius.js';
import type { Palette, PaletteMode, PaletteSeed } from './types.js';

export {
  DEFAULT_MODE,
  DEFAULT_PALETTE,
  PALETTE_NAMES,
  PALETTE_TOKEN,
  THEME_SENTINEL,
  type PaletteName,
} from './config.js';
export {
  DEFAULT_PILL,
  DEFAULT_SHAPE,
  PILL_NAMES,
  SHAPE_NAMES,
  type PillName,
  type ShapeName,
} from './scales/radius.js';
export type { CssDeclaration } from './emit/vars.js';
export type {
  FillStyle,
  Hex,
  Palette,
  PaletteCharacter,
  PaletteMode,
  PaletteModeColors,
  PaletteSeed,
} from './types.js';
export { derivePalette };
export {
  CUSTOM_BASES,
  customSeed,
  PAGES,
  type CustomBase,
  type CustomPalette,
} from './palettes/custom.js';

export { isPaletteName, paletteKey, parsePaletteKey, type PaletteChoice } from './palettes/key.js';
export { parseCustomPalette } from './palettes/custom.js';
export {
  PALETTE_FILE_VERSION,
  PALETTE_NAME,
  paletteFileName,
  parsePaletteFile,
  type PaletteFile,
} from './palettes/file.js';
export { meshOf, type Mesh } from './build/mesh.js';
export { HA_COLOR_NAMES, NAMED_COLORS, resolveAccent, type HaColorName } from './ha/named.js';
export { accentFamily, type AccentFamily } from './build/accent-family.js';
export { accentFamilyVars, identityVars, surfaceWash } from './emit/vars.js';

export function isShapeName(value: unknown): value is ShapeName {
  return typeof value === 'string' && (SHAPE_NAMES as readonly string[]).includes(value);
}

export function isPillName(value: unknown): value is PillName {
  return typeof value === 'string' && (PILL_NAMES as readonly string[]).includes(value);
}

export function seedOf(choice: PaletteChoice): PaletteSeed {
  return typeof choice === 'string' ? seeds[choice] : customSeed(choice);
}

/** The presets in presentation order, soft line first. */
export const presetSeeds: readonly PaletteSeed[] = PALETTE_NAMES.map((name) => seeds[name]);

/** "#716345" → "113,99,69". */
function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/**
 * Everything one mode of a look declares: our scale in its shape, Home Assistant's mode-independent names, which
 * palette this is, the palette's brand layer and Home Assistant's names for that mode — then, as Home Assistant
 * does for a theme it applies, an `--rgb-*` triplet for each of its own names that holds a plain hex (its CSS
 * feeds them to rgba()).
 */
export function lookDeclarations(
  palette: Palette,
  mode: PaletteMode,
  shape: ShapeName = DEFAULT_SHAPE,
  pill: PillName = DEFAULT_PILL,
): readonly CssDeclaration[] {
  const colors = palette[mode];
  const groups = [
    ...scaleVars(shape, pill),
    ...haSharedVars(),
    ...identityVars(palette),
    ...brandColorVars(colors),
    ...haModeVars(colors),
  ];
  const declarations = groups.flatMap((group) => group.declarations);
  const named = new Set(declarations.map(([name]) => name));
  const triplets: CssDeclaration[] = [];
  for (const [name, value] of declarations) {
    if (name.startsWith('--fluvy-') || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    const key = `--rgb-${name.slice(2)}`;
    if (!named.has(key)) triplets.push([key, rgb(value)]);
  }
  // what this palette has none of is declared empty (the readers' fallbacks apply), never inherited
  const empty = OPTIONAL_BRAND_VARS.filter((name) => !named.has(name)).map(
    (name): CssDeclaration => [name, 'initial'],
  );
  return [...declarations, ...triplets, ...empty];
}

/** Declarations as the body of a CSS rule; `important` for a look that must win over a theme set inline. */
export function declarationsCss(
  declarations: readonly CssDeclaration[],
  important = false,
): string {
  const bang = important ? ' !important' : '';
  return declarations.map(([name, value]) => `${name}:${value}${bang};`).join('');
}
