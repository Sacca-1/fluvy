/** Public API of `@fluvy/tokens`. */

export {
  BRAND,
  cssVar,
  DEFAULT_MODE,
  DEFAULT_PALETTE,
  PALETTE_MODES,
  PALETTE_NAMES,
  PALETTE_TOKEN,
  THEME_NAME,
  THEME_SENTINEL,
  type PaletteName,
} from './config.js';

export {
  GRAPH_SERIES_COUNT,
  RAMP_STEPS,
  SEMANTIC_ROLES,
  STATE_KEYS,
  type AccentColors,
  type Hex,
  type Palette,
  type PaletteMode,
  type PaletteModeColors,
  type PaletteSeed,
  type Ramp,
  type RampStep,
  type RoleColors,
  type SemanticRole,
  type StateKey,
  type SurfaceColors,
  type TextColors,
  type UnavailableColors,
} from './types.js';

export * from './color/index.js';
export * from './scales/index.js';

export { getSeed, seedList, seeds } from './palettes/index.js';
export { derivePalette, GATES, UNAVAILABLE_ALPHA } from './build/derive.js';
export { derivePalettes } from './build/palettes.js';

export { emitLabCss } from './emit/css.js';
export {
  buildPaletteSummary,
  emitPalettesJson,
  emitPalettesScript,
  emitTokensJson,
  PALETTE_GLOBAL,
} from './emit/json.js';
export {
  buildReports,
  checkContrast,
  checkStructure,
  collectHexValues,
  contrastGates,
  countFailures,
  renderContrastReport,
  type ContrastGate,
  type ContrastResult,
  type PaletteReport,
  type StructuralResult,
} from './emit/contrast.js';
export {
  accentFamilyVars,
  allPaletteVars,
  brandColorVars,
  identityVars,
  scaleVars,
  type CssDeclaration,
  type VarGroup,
} from './emit/vars.js';
export { HA_COLOR_NAMES, NAMED_COLORS, resolveAccent, THEME_COLOR_NAMES } from './ha/named.js';
export { paletteKey, parsePaletteKey, type PaletteChoice } from './palettes/key.js';
export { parseCustomPalette } from './palettes/custom.js';
export {
  PALETTE_FILE_VERSION,
  PALETTE_NAME,
  paletteFileName,
  parsePaletteFile,
  type PaletteFile,
} from './palettes/file.js';
export { meshOf, type Mesh } from './build/mesh.js';
export { accentFamily, paletteAccent, type AccentFamily } from './build/accent-family.js';
export {
  parseStatuses,
  splitStatuses,
  STATUS_NAMES,
  statusesKey,
  statusFamily,
  withStatuses,
  type StatusColours,
  type StatusName,
} from './build/statuses.js';
export { HA_GROUPS, haModeVars, haSharedVars, type HaGroup } from './ha/groups.js';
export { RELEASE_VERSION } from './release.js';
