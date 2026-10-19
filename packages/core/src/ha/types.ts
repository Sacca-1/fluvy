/**
 * The slice of Home Assistant's frontend types fluvy relies on.
 * Vendored by hand from home-assistant/frontend @ 20260826.7 (src/types.ts, src/data/lovelace/config/*,
 * src/panels/lovelace/types.ts, home-assistant-js-websocket) — there is no official npm package.
 * Diff against a newer tag when the floor version moves.
 */

export interface HassEntityAttributes {
  friendly_name?: string;
  unit_of_measurement?: string;
  icon?: string;
  entity_picture?: string;
  supported_features?: number;
  device_class?: string;
  state_class?: string;
  restored?: boolean;
  [key: string]: unknown;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  last_changed: string;
  last_updated: string;
  attributes: HassEntityAttributes;
  context?: { id: string; user_id: string | null; parent_id: string | null };
}

export type HassEntities = Record<string, HassEntity>;

export interface EntityRegistryDisplayEntry {
  entity_id: string;
  name?: string;
  icon?: string;
  device_id?: string;
  area_id?: string;
  labels?: string[];
  hidden?: boolean;
  entity_category?: 'config' | 'diagnostic';
  translation_key?: string;
  platform?: string;
  display_precision?: number;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  area_id: string | null;
  labels?: string[];
  manufacturer?: string | null;
  model?: string | null;
  /** The device this one is reached through (a printer's filament unit hangs on the printer). */
  via_device_id?: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
  labels?: string[];
  icon?: string | null;
  picture?: string | null;
  temperature_entity_id?: string | null;
  humidity_entity_id?: string | null;
}

export interface FloorRegistryEntry {
  floor_id: string;
  name: string;
  /** Storeys count up from the ground; absent: unordered, after the numbered ones. */
  level?: number | null;
  icon?: string | null;
}

export interface FrontendLocaleData {
  language: string;
  number_format: 'language' | 'system' | 'comma_decimal' | 'decimal_comma' | 'space_comma' | 'none';
  time_format: 'language' | 'system' | '12' | '24';
  date_format?: string;
  first_weekday?: string;
  time_zone?: string;
}

export interface HassThemes {
  default_theme: string;
  default_dark_theme?: string | null;
  themes: Record<string, unknown>;
  darkMode: boolean;
  theme: string;
}

export interface ServiceTarget {
  entity_id?: string | string[];
  device_id?: string | string[];
  area_id?: string | string[];
}

export type UnsubscribeFunc = () => void;

export interface HassConnection {
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: { type: string; [key: string]: unknown },
    options?: { resubscribe?: boolean },
  ): Promise<UnsubscribeFunc>;
  /** The connection came back (`ready`) or dropped (`disconnected`). */
  addEventListener?(event: 'ready' | 'disconnected', listener: () => void): void;
  removeEventListener?(event: 'ready' | 'disconnected', listener: () => void): void;
  subscribeEvents?<T>(callback: (event: T) => void, eventType?: string): Promise<UnsubscribeFunc>;
}

export interface HassPanel {
  component_name: string;
  url_path: string;
  title: string | null;
  icon: string | null;
}

export interface HomeAssistant {
  states: HassEntities;
  entities: Record<string, EntityRegistryDisplayEntry>;
  devices: Record<string, DeviceRegistryEntry>;
  areas: Record<string, AreaRegistryEntry>;
  /** Absent before Home Assistant 2024.4, which had no floors. */
  floors?: Record<string, FloorRegistryEntry>;
  themes: HassThemes;
  /** The theme this person chose in their profile (`theme: ''` or none: the house's default theme). */
  selectedTheme?: { theme?: string; dark?: boolean } | null;
  locale: FrontendLocaleData;
  language: string;
  config: {
    unit_system: { temperature: string; length: string; [k: string]: string };
    currency?: string;
    time_zone?: string;
    [k: string]: unknown;
  };
  user?: { id: string; name: string; is_admin: boolean };
  /** The panels this person's frontend has: a dashboard is one with `component_name: 'lovelace'`. */
  panels?: Record<string, HassPanel>;
  /** The actions Home Assistant offers, by domain then name (`notify.mobile_app_pixel_9`). */
  services?: Record<string, Record<string, unknown>>;
  connection: HassConnection;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: ServiceTarget,
  ): Promise<unknown>;
  callWS<T>(message: { type: string; [key: string]: unknown }): Promise<T>;
  callApi<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    parameters?: Record<string, unknown>,
  ): Promise<T>;
  hassUrl(path?: string): string;
  localize(key: string, values?: Record<string, unknown>): string;
  /**
   * Loads the integrations' own words of one category (`issues`: a repair's title) and answers a `localize` that has
   * them (Home Assistant's repairs page reads its titles so).
   */
  loadBackendTranslation?(
    category: string,
    integrations?: string | readonly string[],
  ): Promise<(key: string, values?: Record<string, unknown>) => string>;
  formatEntityState?(stateObj: HassEntity, state?: string): string;
  formatEntityAttributeValue?(stateObj: HassEntity, attribute: string, value?: unknown): string;
  formatEntityName?(stateObj: HassEntity, type: unknown): string;
}

/* ---------- Lovelace ---------- */

export interface LovelaceCardConfig {
  type: string;
  grid_options?: LovelaceGridOptions;
  visibility?: unknown[];
  [key: string]: unknown;
}

export interface LovelaceGridOptions {
  columns?: number | 'full';
  rows?: number | 'auto';
  max_columns?: number;
  min_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant | undefined;
  preview?: boolean;
  layout?: string;
  connectedWhileHidden?: boolean;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize(): number | Promise<number>;
  getGridOptions?(): LovelaceGridOptions;
}

/** ha-form schema subset used by `getConfigForm()` — Home Assistant renders the editor for us. */
export type HaFormSelector = Record<string, unknown>;

export interface HaFormSchemaItem {
  name: string;
  selector?: HaFormSelector;
  required?: boolean;
  default?: unknown;
  type?: 'grid' | 'expandable';
  title?: string;
  flatten?: boolean;
  schema?: readonly HaFormSchemaItem[];
}

export interface LovelaceConfigForm {
  schema: readonly HaFormSchemaItem[];
  assertConfig?: (config: LovelaceCardConfig) => void;
  computeLabel?: (
    schema: HaFormSchemaItem,
    localize: (key: string) => string,
  ) => string | undefined;
  computeHelper?: (
    schema: HaFormSchemaItem,
    localize: (key: string) => string,
  ) => string | undefined;
}

export interface CustomCardEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
  getEntitySuggestion?: (
    hass: HomeAssistant,
    entityId: string,
  ) => LovelaceCardConfig | null | undefined;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
    loadCardHelpers?: () => Promise<unknown>;
  }
}
