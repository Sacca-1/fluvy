import {
  FluvyCard,
  type FluvyCardConfig,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
} from '@fluvy/core';
import { baseStyles, fitPills } from '@fluvy/ui';
import type { CSSResultGroup, PropertyValues } from 'lit';
import { COMMON_ALIASES, normaliseConfig, type AliasSpec, type KnownKeys } from './config.js';
import { FontsSettled } from './fonts.js';
import type { EditorDefaults, RowsListSpec } from './rows-editor.js';

/** The base card's fields every editor may show; a card names the ones it honours. */
export type BaseKey = KnownKeys<FluvyCardConfig>;

/** What a card of one entity honours of the base: the entity, its name and icon, both actions, its tone and colour. */
export const ENTITY_BASE: readonly BaseKey[] = [
  'entity',
  'name',
  'icon',
  'tap_action',
  'hold_action',
  'tone',
  'color',
  'card_color',
];

/**
 * What every card in this package shares on top of the core base class: the fluvy stylesheets, the pill-fitting pass
 * (badges and chips sized from their laid-out text, on the 4 px grid), and the editors' contract.
 *
 * The contract: a card declares what its editor shows — `base` (the base fields it honours), `keys` (its own, checked
 * against its config's interface by `configKeys`), `lists` (the lists edited item by item), `defaults` (what it does
 * for a key left out) and `aliases` (the older names it still reads) — and the base builds the editor from its
 * `getConfigForm()`. `editors.test.ts` holds every card to it: what the form and the lists show is exactly
 * `base ∪ keys`, and no older name is ever shown. A card's aliases are read on `setConfig` — its own first, then
 * the names every card shares (`COMMON_ALIASES`) — so the card itself only ever sees the newer names.
 */
export abstract class Card<C extends FluvyCardConfig = FluvyCardConfig> extends FluvyCard<C> {
  static override styles: CSSResultGroup = [...baseStyles];

  static base: readonly BaseKey[] = ENTITY_BASE;
  static keys: readonly string[] = [];
  static lists: readonly RowsListSpec[] = [];
  static defaults: EditorDefaults | undefined = undefined;
  static aliases: AliasSpec | undefined = undefined;

  /** The fields of the card's visual editor; every card has one. */
  static getConfigForm(): LovelaceConfigForm {
    return { schema: [] };
  }

  /**
   * The visual editor: the card's form, its lists item by item, its defaults shown, its older names read. The
   * editor is fetched the first time a card is edited (Home Assistant awaits this): a dashboard never loads it.
   */
  static async getConfigElement(): Promise<HTMLElement> {
    const { listsEditor } = await import('./rows-editor.js');
    return listsEditor(this.getConfigForm(), this.lists, this.defaults, [
      ...(this.aliases ? [this.aliases] : []),
      COMMON_ALIASES,
    ]);
  }

  override setConfig(config: LovelaceCardConfig): void {
    const { aliases } = this.constructor as typeof Card;
    super.setConfig(
      aliases
        ? normaliseConfig(config, aliases, COMMON_ALIASES)
        : normaliseConfig(config, COMMON_ALIASES),
    );
  }

  constructor() {
    super();
    // A pill fitted before the web font lands is fitted again once it has: a frame after the font set says so
    // (the face is usable for layout only then), and once more at 1.2 s as a safety net. Fitting in the
    // `loadingdone` handler itself measured the fallback face still, which left a tab row 8 px too wide
    // until the safety net ran.
    new FontsSettled(this, () => {
      if (this.isConnected) fitPills(this.renderRoot, true);
    });
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    fitPills(this.renderRoot);
  }
}
