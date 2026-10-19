import {
  actionRuns,
  FluvyCard,
  type FluvyCardConfig,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
} from '@fluvy/core';
import { baseStyles, fitPills, pressCover } from '@fluvy/ui';
import { nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit';
import type { ShowIcon } from '../energy/head.js';
import { COMMON_ALIASES, normaliseConfig, type AliasSpec, type KnownKeys } from './config.js';
import { FontsSettled } from './fonts.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from './rows-editor.js';

/** What a card with a head honours of its circle (`HeadFit` reads it through `Card.showIcon`). */
export interface HeadConfig {
  show_icon?: ShowIcon;
}

/** The base card's fields every editor may show; a card names the ones it honours. */
export type BaseKey = KnownKeys<FluvyCardConfig & HeadConfig>;

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

/** The same for a card of one entity with a head: whether its circle shows too. */
export const HEAD_BASE: readonly BaseKey[] = [...ENTITY_BASE, 'show_icon'];

/** A head's actions (`head()`'s `onTap`, `onHold` and `label`): the card's tap and hold, each where it can run. */
export interface HeadActions {
  readonly onTap?: () => void;
  readonly onHold?: () => void;
  readonly label?: string;
}

/**
 * What every card in this package shares on top of the core base class: the fluvy stylesheets, the pill-fitting pass
 * (badges and chips sized from their laid-out text, on the 4 px grid), and the editors' contract.
 *
 * The contract: a card declares what its editor shows — `base` (the base fields it honours), `keys` (its own, checked
 * against its config's interface by `configKeys`), `lists` (the lists edited item by item), `defaults` (what it does
 * for a key left out), `choices` (a select's options as its entity has them) and `aliases` (the older names it still
 * reads) — and the base builds the editor from its `getConfigForm()`. `editors.test.ts` holds every card to it: what the form and the lists show is exactly
 * `base ∪ keys`, and no older name is ever shown. A card's aliases are read on `setConfig` — its own first, then
 * the names every card shares (`COMMON_ALIASES`) — so the card itself only ever sees the newer names.
 */
export abstract class Card<C extends FluvyCardConfig = FluvyCardConfig> extends FluvyCard<C> {
  static override styles: CSSResultGroup = [...baseStyles];

  static base: readonly BaseKey[] = ENTITY_BASE;
  static keys: readonly string[] = [];
  static lists: readonly RowsListSpec[] = [];
  static defaults: EditorDefaults | undefined = undefined;
  static choices: EditorChoices | undefined = undefined;
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
    return listsEditor(
      this.getConfigForm(),
      this.lists,
      this.defaults,
      [...(this.aliases ? [this.aliases] : []), COMMON_ALIASES],
      this.choices,
    );
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

  /** Whether the head's circle shows (`show_icon`); a value it does not know is `auto`, as none is. */
  get showIcon(): ShowIcon {
    return (this.config as HeadConfig | undefined)?.show_icon ?? 'auto';
  }

  /**
   * The head's tap and hold (the head is the card's button) from the card's `tap_action` and `hold_action`, run for
   * `entityId` — the card's entity by default. One that cannot run is left out (`none`; more-info or a toggle with no
   * entity to act on, as a card of many has none), so a head is never a button that does nothing. `label`: what a
   * reader hears for the head's button where its title says less.
   */
  protected headActions(
    entityId: string | undefined = this.config?.entity,
    label?: string,
  ): HeadActions {
    const config = this.config;
    return {
      ...(actionRuns(config?.tap_action, entityId) ? { onTap: () => this.tap(entityId) } : {}),
      ...(actionRuns(config?.hold_action, entityId) ? { onHold: () => this.hold(entityId) } : {}),
      ...(label ? { label } : {}),
    };
  }

  /**
   * A readout alone where its control would be (none asked for, or a column too narrow for even its halves) is the
   * card's tap and hold: a button laid over its row (`pressCover`), named by what it says. None where neither runs.
   */
  protected readoutTap(
    entityId: string | undefined,
    label: string,
  ): TemplateResult | typeof nothing {
    const { onTap, onHold } = this.headActions(entityId);
    return onTap || onHold ? pressCover(label.trim(), onTap, onHold) : nothing;
  }
}
