import {
  fireEvent,
  localize,
  type HaFormSchemaItem,
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
  type MessageKey,
} from '@fluvy/core';
import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { normaliseConfig, type AliasSpec } from './config.js';
import { editorWord, type FormLabeler, formLabels } from './form.js';

/** One list of the config (`rows`, `tiles`, `entities`): ids or `{ entity, … }` items edited one form each. */
export interface RowsListSpec {
  readonly key: string;
  /** A second key the card reads the same list from (`entities` beside `rows`): read when `key` is empty, dropped once `key` is written. */
  readonly alias?: string;
  readonly title: MessageKey;
  /** The item's fields; the id field (`entity`, or `idKey`) is the first and required. */
  readonly schema: readonly HaFormSchemaItem[];
  /**
   * The fields one item shows, when they depend on the item (a grid source has no state of charge): a part of
   * `schema`, the same array for the same answer so its form is not rebuilt on every render.
   */
  readonly schemaOf?: (item: Readonly<Record<string, unknown>>) => readonly HaFormSchemaItem[];
  /** Domains the add-picker offers; default: those of the schema's entity field. */
  readonly domains?: readonly string[];
  /** The field that identifies an item: `entity` (an entity picker adds items) or a text field such as a chip's `name`. */
  readonly idKey?: string;
  /** Other fields that identify an item as well (a battery read by two sensors has no `power`): an entry that carries one is kept. */
  readonly also?: readonly string[];
  /** The add field when it is neither an entity nor text (a source's kind, from a list): its name is the `idKey`. */
  readonly picker?: HaFormSchemaItem;
  /** The keys an item may carry, as its interface declares them: what the editors' contract checks the schema against. */
  readonly keys?: readonly string[];
  /** Words for the item's own fields; the card's, then the shared item words, name the rest. */
  readonly computeLabel?: FormLabeler;
  /** What is said under an item's field; the card's, then the shared item helpers, say the rest. */
  readonly computeHelper?: FormLabeler;
  /**
   * A config entry as the editor's item, when the list's grammar is wider than ids and `{ id, … }` objects (a
   * light's quick colours: words, hexes, triplets, named objects); null drops the entry. Without it, a bare id
   * becomes `{ [idKey]: id }` and an object that carries an id is kept as it is.
   */
  readonly read?: (raw: unknown) => Item | null;
  /** An item back as its config entry, the reverse of `read`; null drops the item. Without it, `compact`. */
  readonly write?: (item: Item) => Entry | null;
}

type Labeler = FormLabeler;

/** What a card does for each key the config leaves out: the editor shows it, and never writes it unless the user changes it. */
export type EditorDefaults = (
  config: LovelaceCardConfig,
  hass: HomeAssistant | undefined,
) => Readonly<Record<string, unknown>>;

export interface RowsEditorSpec {
  /** The card's own fields (title, tone …) — everything but the lists. */
  readonly schema: readonly HaFormSchemaItem[];
  readonly lists: readonly RowsListSpec[];
  readonly computeLabel: Labeler;
  readonly computeHelper?: Labeler;
  readonly defaults?: EditorDefaults;
  /** The older names the card still reads: shown as the newer ones, and written as them on the first change. */
  readonly aliases?: readonly AliasSpec[];
}

type Item = Record<string, unknown>;
type Entry = string | Item;

/** Editor words for the fields an item may carry; a card adds its own through `computeLabel`. */
export const itemLabels: Labeler = formLabels({
  color: 'editor.color',
  sub: 'editor.sub',
  secondary: 'editor.secondary',
  low: 'editor.low',
  high: 'editor.high',
  plain: 'editor.plain',
  highlight: 'editor.highlight',
  label: 'editor.label',
  path: 'editor.path',
  meta: 'editor.meta',
  readouts: 'editor.readouts',
  presets: 'editor.presets',
}).computeLabel;

/**
 * What the editor says under an item's field: a row's second line takes a keyword or a template (its select), or
 * words of the person's own or a template (a text field).
 */
export const itemHelpers: Labeler = (schema) =>
  schema.name === 'secondary'
    ? editorWord(schema.selector?.['select'] ? 'editor.secondary_helper' : 'editor.template_helper')
    : undefined;

/**
 * `ha-form` and `ha-sortable` belong to Home Assistant's editors; when a card's editor opens before
 * they are defined, the entities card's editor (which uses both) pulls them in.
 */
async function ensureEditorElements(): Promise<void> {
  if (customElements.get('ha-form') && customElements.get('ha-sortable')) return;
  try {
    const helpers = (await window.loadCardHelpers?.()) as
      { createCardElement?: (config: LovelaceCardConfig) => HTMLElement } | undefined;
    const card = helpers?.createCardElement?.({ type: 'entities', entities: [] });
    await (
      card?.constructor as { getConfigElement?: () => Promise<unknown> } | undefined
    )?.getConfigElement?.();
  } catch {
    /* the wait below is the only requirement */
  }
  await customElements.whenDefined('ha-form');
}

/* ---------- pure list operations (tested) ---------- */

export const idKeyOf = (list: RowsListSpec): string => list.idKey ?? 'entity';

/** An item whose first field is an entity picker (its box under a label): the handle and the cross line up with the box. */
const pickedFirst = (list: RowsListSpec): boolean =>
  (list.schema[0]?.selector as { entity?: unknown } | undefined)?.entity !== undefined;

/** Whether a field holds an id: a non-empty text, or a list of them (a source's phases). */
const holdsId = (value: unknown): boolean =>
  (typeof value === 'string' && value !== '') ||
  (Array.isArray(value) && value.some((v) => typeof v === 'string' && v !== ''));

/**
 * A config entry as an item: a bare id becomes `{ [idKey]: id }`; anything without an id — its `idKey`, or one of
 * the fields that identify it as well (`also`) — is dropped.
 */
export const toItem = (raw: unknown, idKey: string, also: readonly string[] = []): Item | null => {
  if (typeof raw === 'string') return raw ? { [idKey]: raw } : null;
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Item;
  if (typeof item[idKey] === 'string' || also.some((key) => holdsId(item[key]))) return item;
  return null;
};

/** An item back to its config entry: empty fields dropped, an entity with nothing else goes back to its bare id — the config stays as small as the user wrote it. */
export const compact = (item: Item, idKey: string): Entry => {
  const keys = Object.keys(item).filter(
    (key) => item[key] !== undefined && item[key] !== '' && item[key] !== null,
  );
  return keys.length === 1 && keys[0] === idKey && idKey === 'entity'
    ? (item[idKey] as string)
    : Object.fromEntries(keys.map((key) => [key, item[key]]));
};

/** A config entry as the list's item: the list's own reading, else the id rule. */
export const itemOf = (raw: unknown, list: RowsListSpec): Item | null =>
  list.read ? list.read(raw) : toItem(raw, idKeyOf(list), list.also);

/** An item back as the list's config entry: the list's own writing, else `compact`. */
export const entryOf = (item: Item, list: RowsListSpec): Entry | null =>
  list.write ? list.write(item) : compact(item, idKeyOf(list));

/**
 * The items of a list as the editor shows them: under `key`, else under the alias; and, when the config names
 * neither, `fallback` — what the card does then, shown as rows and written only once the list is touched. A list
 * the config names empty is empty: `colors: []` shows no row.
 */
export const itemsOf = (
  config: LovelaceCardConfig | undefined,
  list: RowsListSpec,
  fallback?: readonly unknown[],
): Item[] => {
  const own = config?.[list.key];
  const raw = Array.isArray(own) && own.length ? own : list.alias ? config?.[list.alias] : own;
  const absent = own === undefined && (!list.alias || config?.[list.alias] === undefined);
  const entries = Array.isArray(raw) ? raw : absent ? (fallback ?? []) : [];
  return entries.map((entry) => itemOf(entry, list)).filter((item): item is Item => item !== null);
};

/** The config with one list replaced: written under the list's own key, the alias (if any) dropped so the card reads one list. */
export const withList = (
  config: LovelaceCardConfig,
  list: RowsListSpec,
  entries: readonly Entry[],
): LovelaceCardConfig => {
  const next: LovelaceCardConfig = { ...config, [list.key]: [...entries] } as LovelaceCardConfig;
  if (list.alias && list.alias !== list.key) delete next[list.alias];
  return next;
};

const sameValue = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** The form's value as config: a default the user left as it was stays out of the config (it was only shown). */
export const withoutUntouchedDefaults = (
  value: Readonly<Record<string, unknown>>,
  config: LovelaceCardConfig,
  defaults: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) => key in config || !(key in defaults) || !sameValue(entry, defaults[key]),
    ),
  );

/** `entries` with the one at `from` moved to `to`. */
export const moved = <T>(entries: readonly T[], from: number, to: number): T[] => {
  const next = [...entries];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
};

const DRAG_HANDLE =
  'M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z';

/**
 * The visual editor of the cards whose list items carry options (a bar's tone, a tile's name): one
 * `ha-form` for the card's own fields, one per item with a drag handle to reorder and a cross to
 * remove it, and a picker to add the next. Home Assistant's form editor can only hold ids in a list;
 * this one keeps every option editable.
 */
export class FluvyRowsEditor extends LitElement {
  static override properties = {
    hass: { attribute: false },
    config: { state: true },
    spec: { attribute: false },
    ready: { state: true },
  };

  static override styles = css`
    :host {
      display: block;
    }
    .list {
      margin-top: 24px;
    }
    .list__title {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    /* an item is a panel (the 16 of an inner tile) round its fields: the handle and the remove button on the first
       field's box — a plain field's 56, or an entity picker's box under its label (24) */
    .item {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      padding: 12px 12px 12px 0;
      margin-bottom: 8px;
      border-radius: var(--fluvy-radius-lg);
      background: var(--card-background-color);
      box-shadow: inset 0 0 0 1px var(--divider-color);
    }
    .item ha-form {
      flex: 1 1 auto;
      min-width: 0;
    }
    .item ha-icon-button {
      flex: 0 0 auto;
      margin-top: 4px;
      color: var(--secondary-text-color);
    }
    .handle {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 40px;
      height: 48px;
      margin-top: 4px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .handle:active {
      cursor: grabbing;
    }
    .item--entity .handle,
    .item--entity > ha-icon-button {
      margin-top: 28px;
    }
    .add {
      margin-top: 8px;
    }
    .wait {
      height: 44px;
      border-radius: var(--fluvy-radius-control);
      background: var(--divider-color);
      opacity: 0.4;
    }
  `;

  declare hass?: HomeAssistant;
  declare config: LovelaceCardConfig | undefined;
  declare spec: RowsEditorSpec | undefined;
  declare ready: boolean;

  /** The add-picker's schema per list: built once, so its `ha-form` is not handed a new schema on every render. */
  private readonly pickers = new WeakMap<RowsListSpec, HaFormSchemaItem[]>();
  /** The words of each list's item forms, and the helpers under them: built once per list, for the same reason. */
  private readonly labelers = new WeakMap<RowsListSpec, Labeler>();
  private readonly helpers = new WeakMap<RowsListSpec, Labeler>();

  constructor() {
    super();
    this.ready = false;
  }

  /** The config as the card reads it: an older name shows in its newer field, and leaves the config once anything is saved. */
  setConfig(config: LovelaceCardConfig): void {
    this.config = normaliseConfig(config, ...(this.spec?.aliases ?? []));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void ensureEditorElements().then(() => {
      this.ready = true;
    });
  }

  private t(key: MessageKey): string {
    return localize(this.hass, key);
  }

  /** What the card does when the config names no list: its default under the list's key, shown as rows until the list is touched. */
  private fallback(list: RowsListSpec): readonly unknown[] | undefined {
    const value = this.defaults()[list.key];
    return Array.isArray(value) ? value : undefined;
  }

  private items(list: RowsListSpec): Item[] {
    return itemsOf(this.config, list, this.fallback(list));
  }

  private written(list: RowsListSpec): Entry[] {
    return this.items(list)
      .map((item) => entryOf(item, list))
      .filter((entry): entry is Entry => entry !== null);
  }

  private commit(next: LovelaceCardConfig): void {
    this.config = next;
    fireEvent(this, 'config-changed', { config: next });
  }

  private defaults(): Readonly<Record<string, unknown>> {
    return this.config && this.spec?.defaults ? this.spec.defaults(this.config, this.hass) : {};
  }

  /** The card's form edits everything but the lists: its value is the whole of that part (a cleared field is absent from it). */
  private onCard(event: CustomEvent<{ value: Record<string, unknown> }>): void {
    event.stopPropagation();
    const config = this.config;
    if (!config) return;
    const lists = Object.fromEntries(
      (this.spec?.lists ?? [])
        .flatMap((list) => [list.key, list.alias])
        .filter((key): key is string => Boolean(key) && config[key as string] !== undefined)
        .map((key) => [key, config[key]]),
    );
    const own = withoutUntouchedDefaults(event.detail.value, config, this.defaults());
    this.commit({ ...own, ...lists, type: config.type } as LovelaceCardConfig);
  }

  private onItem(list: RowsListSpec, index: number, event: CustomEvent<{ value: Item }>): void {
    event.stopPropagation();
    if (!this.config) return;
    const entries = this.written(list);
    const entry = entryOf(event.detail.value, list);
    // an item that says nothing any more (its id cleared) leaves the list
    if (entry === null) entries.splice(index, 1);
    else entries[index] = entry;
    this.commit(withList(this.config, list, entries));
  }

  private onAdd(list: RowsListSpec, event: CustomEvent<{ value: Item }>): void {
    event.stopPropagation();
    const idKey = idKeyOf(list);
    const id = event.detail.value[idKey];
    if (!this.config || typeof id !== 'string' || !id) return;
    const entry = entryOf({ [idKey]: id }, list);
    if (entry === null) return;
    this.commit(withList(this.config, list, [...this.written(list), entry]));
    this.requestUpdate(); // the picker goes back to empty
  }

  private onMove(
    list: RowsListSpec,
    event: CustomEvent<{ oldIndex: number; newIndex: number }>,
  ): void {
    event.stopPropagation();
    if (!this.config) return;
    this.commit(
      withList(
        this.config,
        list,
        moved(this.written(list), event.detail.oldIndex, event.detail.newIndex),
      ),
    );
  }

  private removeItem(list: RowsListSpec, index: number): void {
    if (!this.config) return;
    this.commit(
      withList(
        this.config,
        list,
        this.written(list).filter((_, i) => i !== index),
      ),
    );
  }

  private picker(list: RowsListSpec): HaFormSchemaItem[] {
    let schema = this.pickers.get(list);
    if (!schema && list.picker) {
      schema = [list.picker];
      this.pickers.set(list, schema);
    }
    if (!schema) {
      const idKey = idKeyOf(list);
      const domains =
        list.domains ??
        (list.schema[0]?.selector as { entity?: { domain?: string[] } } | undefined)?.entity
          ?.domain;
      schema = [
        idKey === 'entity'
          ? { name: 'entity', selector: { entity: domains ? { domain: [...domains] } : {} } }
          : { name: idKey, selector: { text: {} } },
      ];
      this.pickers.set(list, schema);
    }
    return schema;
  }

  private readonly addLabel: Labeler = () => this.t('editor.add');

  /** An item's field is named by its list, else by the card, else by the shared item words. */
  private labeler(list: RowsListSpec): Labeler {
    let labeler = this.labelers.get(list);
    if (!labeler) {
      const own = this.spec?.computeLabel;
      labeler = (schema, localize) =>
        list.computeLabel?.(schema, localize) ??
        own?.(schema, localize) ??
        itemLabels(schema, localize);
      this.labelers.set(list, labeler);
    }
    return labeler;
  }

  /** What is said under an item's field: by its list, else by the card, else by the shared item helpers. */
  private helper(list: RowsListSpec): Labeler {
    let helper = this.helpers.get(list);
    if (!helper) {
      const own = this.spec?.computeHelper;
      helper = (schema, localize) =>
        list.computeHelper?.(schema, localize) ??
        own?.(schema, localize) ??
        itemHelpers(schema, localize);
      this.helpers.set(list, helper);
    }
    return helper;
  }

  private renderList(list: RowsListSpec): TemplateResult {
    const items = this.items(list);
    return html`<div class="list">
      <p class="list__title">${this.t(list.title)}</p>
      <ha-sortable
        handle-selector=".handle"
        @item-moved=${(event: CustomEvent<{ oldIndex: number; newIndex: number }>) => this.onMove(list, event)}
      >
        <div class="items">
          ${items.map(
            (item, index) =>
              html`<div class="item ${pickedFirst(list) ? 'item--entity' : ''}">
                <div class="handle" aria-hidden="true">
                  <ha-svg-icon .path=${DRAG_HANDLE}></ha-svg-icon>
                </div>
                <ha-form
                  .hass=${this.hass}
                  .data=${item}
                  .schema=${list.schemaOf?.(item) ?? list.schema}
                  .computeLabel=${this.labeler(list)}
                  .computeHelper=${this.helper(list)}
                  @value-changed=${(event: CustomEvent<{ value: Item }>) => this.onItem(list, index, event)}
                ></ha-form>
                <ha-icon-button
                  .label=${this.t('editor.remove')}
                  @click=${() => this.removeItem(list, index)}
                  ><ha-icon icon="mdi:close"></ha-icon
                ></ha-icon-button>
              </div>`,
          )}
        </div>
      </ha-sortable>
      <div class="add">
        <ha-form
          .hass=${this.hass}
          .data=${{}}
          .schema=${this.picker(list)}
          .computeLabel=${this.addLabel}
          @value-changed=${(event: CustomEvent<{ value: Item }>) => this.onAdd(list, event)}
        ></ha-form>
      </div>
    </div>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const spec = this.spec;
    if (!spec || !this.config) return nothing;
    if (!this.ready) return html`<div class="wait"></div>`;
    // the card's form holds everything but the lists: neither the config's nor a default under a list's key
    const withoutLists = (
      entries: Readonly<Record<string, unknown>>,
    ): Readonly<Record<string, unknown>> =>
      Object.fromEntries(
        Object.entries(entries).filter(
          ([key]) => !spec.lists.some((list) => list.key === key || list.alias === key),
        ),
      );
    const data = { ...withoutLists(this.defaults()), ...withoutLists(this.config) };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${spec.schema}
        .computeLabel=${spec.computeLabel}
        .computeHelper=${spec.computeHelper}
        @value-changed=${this.onCard}
      ></ha-form>
      ${spec.lists.map((list) => this.renderList(list))}
    `;
  }
}

/** `static getConfigElement()` of a card: the rows editor set up for that card. */
export function rowsEditor(spec: RowsEditorSpec): HTMLElement {
  const element = document.createElement('fluvy-rows-editor') as FluvyRowsEditor;
  element.spec = spec;
  return element;
}

/** The list fields taken out of a card's form: the editor draws those itself. */
function withoutLists(
  schema: readonly HaFormSchemaItem[],
  keys: ReadonlySet<string>,
): HaFormSchemaItem[] {
  return schema.flatMap((item) => {
    if (keys.has(item.name)) return [];
    if (item.schema) {
      const inner = withoutLists(item.schema, keys);
      return inner.length ? [{ ...item, schema: inner }] : [];
    }
    return [item];
  });
}

/**
 * `static getConfigElement()` for a card that already has a form: the same fields and labels, plus its lists edited
 * item by item, its defaults shown, and its older names read as the newer ones.
 */
export function listsEditor(
  form: LovelaceConfigForm,
  lists: readonly RowsListSpec[],
  defaults?: EditorDefaults,
  aliases?: readonly AliasSpec[],
): HTMLElement {
  const keys = new Set(lists.flatMap((list) => [list.key, ...(list.alias ? [list.alias] : [])]));
  return rowsEditor({
    schema: withoutLists(form.schema, keys),
    lists,
    computeLabel: (schema, localize) => form.computeLabel?.(schema, localize),
    ...(form.computeHelper ? { computeHelper: form.computeHelper } : {}),
    ...(defaults ? { defaults } : {}),
    ...(aliases?.length ? { aliases } : {}),
  });
}

/** `static getConfigElement()` for a card without lists: its form, with what the card does by default shown in it. */
export function formEditor(form: LovelaceConfigForm, defaults: EditorDefaults): HTMLElement {
  return listsEditor(form, [], defaults);
}

// defined here, with the module a card's `getConfigElement` fetches: the element exists exactly when an editor is asked for
if (!customElements.get('fluvy-rows-editor'))
  customElements.define('fluvy-rows-editor', FluvyRowsEditor);
