import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import type { StatusColours } from '@fluvy/tokens/runtime';
import type { MockOptions, StateSeed } from './hass.js';
import type { WsTable } from './ws.js';

/**
 * The playground's content. One module per design sheet in `./sheets/` — same house as the sheets
 * (Marta’s flat, Thursday 17 September 2026, 21:47), so a card can be held against its approved
 * design. Modules are picked up automatically; nothing else has to be edited to add one.
 */
export interface FrameSpec {
  readonly title: string;
  readonly width?: number;
  /** The gap between its cards: Fluvy's theme sets 16 (the default); Home Assistant's own is 8. */
  readonly gap?: number;
  /**
   * Its columns where they are not a section's 12: a page laid out as Home Assistant's grid card lays its cards out
   * (five small appliances a row). A card's `cols` are then of these, and only its own maximum holds it.
   */
  readonly columns?: number;
  /** false = a stress frame (deliberate overflow, scrolling rows): rendered for the eye, not audited by the measurer. */
  readonly measure?: boolean;
  /**
   * The cards, each with the columns it is given (`cols`, of 12: Home Assistant's `grid_options.columns`). As Home
   * Assistant does, a card is held to its own `getGridOptions()` minimum and maximum: a 4 asked of a card whose
   * minimum is 6 draws at 6.
   */
  readonly cards: ReadonlyArray<LovelaceCardConfig & { cols?: number }>;
  /**
   * The house as this frame's cards see it, when it is not the sheet's: another house's Energy dashboard, one with
   * none, statistics that cannot be read. Keep what the cards key their caches on (the connection) stable.
   */
  readonly hass?: (hass: HomeAssistant) => HomeAssistant;
  /**
   * The house's status colours on this frame alone (fluvy's settings → Appearance → Status colours): the page's look in
   * them, scoped to the frame, over the page's own (`&warning=` …).
   */
  readonly statuses?: StatusColours;
}

export interface SheetSpec {
  readonly states: readonly StateSeed[];
  readonly frames: readonly FrameSpec[];
  /** Registries the sheet's cards read (areas, floors, devices, entity entries); merged with every other sheet's. */
  readonly registry?: MockOptions['registry'];
  /** entity id → series returned for `history/history_during_period`. */
  readonly history?: Record<string, readonly number[]>;
  /** statistic id → what the recorder keeps for it (see `StatisticSeed`); merged with every other sheet's. */
  readonly statistics?: MockOptions['statistics'];
  /** The repairs Home Assistant lists. */
  readonly issues?: MockOptions['issues'];
  /** What is stored for the person and the house (`frontend/*_data`), by key. */
  readonly data?: MockOptions['data'];
  /**
   * WebSocket message type → the sheet's answer (also used for `subscribeMessage`), asked before the house's own:
   * `undefined` leaves the message to it (see `mergeWs`).
   */
  readonly ws?: WsTable;
  /** REST answers, e.g. calendar events or a config written: (method, path, body) → an answer, or undefined to pass. */
  readonly api?: (method: string, path: string, body?: unknown) => unknown;
  /** The house's units when this sheet stands alone (`?sheet=…`): imperial for a house in °F and miles. */
  readonly units?: 'imperial';
  /** The integrations' own words by key (a repair's title); merged with every other sheet's. */
  readonly translations?: MockOptions['translations'];
}

export { NOW } from './now.js';

export { mergeWs } from './ws.js';

const bySheet = (modules: Record<string, { sheet: SheetSpec }>): Record<string, SheetSpec> =>
  Object.fromEntries(
    Object.entries(modules).map(([path, module]) => [
      path.replace(/^.*\//, '').replace('.ts', ''),
      module.sheet,
    ]),
  );

export const SHEETS = bySheet(
  import.meta.glob<{ sheet: SheetSpec }>('./sheets/*.ts', { eager: true }),
);

const fixtures = import.meta.glob<{ sheet: SheetSpec }>('./fixtures/*.ts');

/**
 * A sheet that is not the playground's content: the measurer's own fixtures, wrong on purpose. Opened by name only
 * (`?sheet=measurer`) and loaded then; never in the page of every sheet, the sweeps or the demo.
 */
export const loadFixture = async (name: string): Promise<SheetSpec | undefined> =>
  (await fixtures[`./fixtures/${name}.ts`]?.())?.sheet;
