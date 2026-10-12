import { LitElement, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { PALETTE_TOKEN, THEME_SENTINEL } from '@fluvy/tokens/config';
import { motionPreference, type Tone } from '@fluvy/ui';
import { runAction, type ActionConfig } from './actions.js';
import { resolveEntity, type EntityView } from './entity.js';
import { ensureFonts } from './fonts.js';
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceGridOptions,
} from './ha/types.js';
import { languageOverride, localize, onWords, type MessageKey } from './i18n/index.js';
import { AccentSheet } from './look/accent.js';

/**
 * What every card's config may carry. `tone` is the role a card's parts are drawn in (a palette tone); `color` is
 * the card's own colour — a Home Assistant colour name or `#rrggbb` — standing in for the palette's accent inside
 * it. `tap_action` answers the icon circle, `hold_action` a still press on the head; both default to more-info.
 */
export interface FluvyCardConfig extends LovelaceCardConfig {
  entity?: string;
  entities?: readonly string[];
  name?: string;
  icon?: string;
  tone?: Tone;
  color?: string;
  /** The card's own surface: a quiet wash of this colour as its fill, its edge and dividers in the colour (1.7). */
  card_color?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

/** One `hass` per Home Assistant update, in the language fluvy's settings chose (shared by every card). */
const inLanguage = new WeakMap<HomeAssistant, HomeAssistant>();
/** Cards on the page, to hand the language change to at once. */
const live = new Set<FluvyCard>();

/**
 * `hass` as the person's language choice sees it: the same object with `language` (the words) and `locale.language`
 * (dates, months, numbers) replaced; Home Assistant's explicit choices (number and date formats, the first weekday,
 * the time zone) stay. Nested objects are shared.
 */
function withLanguage(hass: HomeAssistant | undefined): HomeAssistant | undefined {
  const language = languageOverride();
  if (!hass || !language || hass.language === language) return hass;
  let view = inLanguage.get(hass);
  if (view?.language !== language) {
    view = { ...hass, language, locale: { ...hass.locale, language } };
    inLanguage.set(hass, view);
  }
  return view;
}

/** Said on the window when a person's preferences change: what is not a card (a page of ours) follows too. */
export const PREFERENCES_EVENT = 'fluvy-preferences';

/** A mode forced on every card (a wall at night); undefined lets Home Assistant's own mode through. */
let darkOverride: boolean | undefined;
export function setDarkOverride(dark: boolean | undefined): void {
  darkOverride = dark;
}

/** Hands every card on the page the person's preferences now chosen (fluvy's settings changed): language, motion. */
export function refreshCards(): void {
  for (const card of live) {
    card.hass = card.rawHass;
    card.toggleAttribute('reduced-motion', motionPreference() === 'reduced');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PREFERENCES_EVENT));
}
// a language's words arriving are a preference change too: every card says them at once
onWords(refreshCards);

/** Every card on the page looks again for the theme: the look arrived, moved or left. */
export function resyncCardThemes(): void {
  for (const card of live) card.syncTheme();
}

/** Cards that connect within the same beat enter in sequence (30 ms apart, capped) instead of all at once. */
let enterBeat = 0;
let enterIndex = 0;
function nextEnterDelay(): number {
  const now = performance.now();
  if (now - enterBeat > 120) {
    enterBeat = now;
    enterIndex = 0;
  }
  return Math.min(enterIndex++ * 30, 240);
}

/**
 * Base class of every fluvy card.
 *
 * - `hass` arrives on every state change of the whole instance; a card re-renders only when one of
 *   the entities it watches (or the theme, the locale) actually changed.
 * - `dark` mirrors Home Assistant's dark mode on the host; `no-theme` switches the token fallback on
 *   when the fluvy theme is not active on this view, so a card never renders unstyled.
 * - `width` is the host's measured width (ResizeObserver): controls are drawn to it, not to a constant.
 */
export abstract class FluvyCard<C extends FluvyCardConfig = FluvyCardConfig>
  extends LitElement
  implements LovelaceCard
{
  /** Cards that are the dashboard's chrome (greeting, tabs, the readouts strip) draw at once, without the entrance, so they read as fixed while the views below them change. */
  static still = false;

  /** The card's height at a 360 column for this config, for whoever lays cards out before they are drawn. */
  static layoutHeight?(config: LovelaceCardConfig): number;

  static override properties = {
    hass: { attribute: false, noAccessor: true },
    config: { state: true },
    width: { state: true },
    dark: { type: Boolean, reflect: true },
    noTheme: { type: Boolean, reflect: true, attribute: 'no-theme' },
    preview: { type: Boolean },
    layout: { type: String, reflect: true },
  };

  /** The `hass` Home Assistant handed over; `hass` is it in the language fluvy's settings chose. */
  rawHass: HomeAssistant | undefined;
  private viewHass: HomeAssistant | undefined;

  get hass(): HomeAssistant | undefined {
    return this.viewHass;
  }

  set hass(value: HomeAssistant | undefined) {
    const previous = this.viewHass;
    this.rawHass = value;
    this.viewHass = withLanguage(value);
    this.requestUpdate('hass', previous);
  }
  declare config?: C;
  declare width: number;
  declare dark: boolean;
  declare noTheme: boolean;
  declare preview: boolean;
  declare layout?: string;

  private resizeObserver: ResizeObserver | undefined;
  /** The card's own colour and its items', derived on the palette the card wears. */
  protected readonly accents = new AccentSheet();

  constructor() {
    super();
    this.width = 360;
    this.dark = false;
    this.noTheme = false;
    this.preview = false;
  }

  /* ---------- Lovelace contract ---------- */

  setConfig(config: LovelaceCardConfig): void {
    this.config = this.prepare({ ...config } as C);
  }

  /** Validate and fill defaults. Throw an Error with a readable message on a bad config. */
  protected prepare(config: C): C {
    return config;
  }

  getCardSize(): number {
    return 3;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    live.add(this);
    this.toggleAttribute('reduced-motion', motionPreference() === 'reduced');
    ensureFonts();
    this.style.setProperty('--fv-enter-delay', `${nextEnterDelay()}ms`);
    if ((this.constructor as typeof FluvyCard).still) this.setAttribute('still', '');
    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const next = Math.round(box.width);
      if (next > 0 && next !== this.width) this.width = next;
    });
    this.resizeObserver.observe(this);
    if (this.renderRoot instanceof ShadowRoot) this.accents.adopt(this.renderRoot);
    this.syncTheme();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    live.delete(this);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    for (const entry of this.optimistic.values()) clearTimeout(entry.timer);
    this.optimistic.clear();
  }

  /** Entities whose changes re-render the card. Defaults to `entity` + `entities` of the config. */
  protected watched(): readonly string[] {
    const ids: string[] = [];
    if (this.config?.entity) ids.push(this.config.entity);
    if (this.config?.entities) ids.push(...this.config.entities);
    return ids;
  }

  /**
   * A `hass` that only changed elsewhere in the house is ignored. Anything that can change what this
   * card draws lets it through: a watched entity, the theme (dark mode), the locale or language, the
   * translations (`localize` is replaced when a resource pack loads), and the registries (names, areas).
   */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size > 1 || !changed.has('hass')) return true;
    const previous = changed.get('hass') as HomeAssistant | undefined;
    const next = this.hass;
    if (!previous || !next) return true;
    if (
      previous.themes !== next.themes ||
      previous.locale !== next.locale ||
      previous.language !== next.language
    )
      return true;
    if (
      previous.localize !== next.localize ||
      previous.formatEntityState !== next.formatEntityState
    )
      return true;
    if (
      previous.entities !== next.entities ||
      previous.devices !== next.devices ||
      previous.areas !== next.areas
    )
      return true;
    if (previous.config !== next.config) return true;
    for (const id of this.watched()) if (previous.states[id] !== next.states[id]) return true;
    return false;
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('hass')) {
      const previous = changed.get('hass') as HomeAssistant | undefined;
      if (previous?.themes !== this.hass?.themes) this.syncTheme();
    }
  }

  /**
   * Reads dark mode, whether a fluvy look reaches this card (its sentinel; the fallback tokens apply where none
   * does) and which palette it wears (its own colours are derived on it).
   */
  syncTheme(): void {
    this.dark = darkOverride ?? this.hass?.themes?.darkMode ?? false;
    const computed = getComputedStyle(this);
    // The theme carries a sentinel the fallback never defines, so this cannot feed back on itself.
    this.noTheme = computed.getPropertyValue(THEME_SENTINEL).trim() === '';
    if (
      this.accents.wears(
        computed.getPropertyValue(PALETTE_TOKEN).trim(),
        this.dark ? 'dark' : 'light',
      )
    )
      this.requestUpdate();
  }

  /** The card's colour and its items' are written once the render has asked for them. */
  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.accents.host(this.config?.color);
    this.accents.surface(this.config?.card_color);
    this.accents.commit();
  }

  /* ---------- optimistic state ---------- */

  private readonly optimistic = new Map<string, { state: string; timer: number }>();

  /**
   * Shows `state` for an entity right away (a switch flips under the finger) until Home Assistant
   * reports it — or for 3 s at most, after which the real state wins, whatever it is.
   */
  protected expect(entityId: string, state: string): void {
    const previous = this.optimistic.get(entityId);
    if (previous) clearTimeout(previous.timer);
    const timer = window.setTimeout(() => {
      // only the entry this timer belongs to: a newer expectation on the same entity keeps its own clock
      if (this.optimistic.get(entityId)?.timer === timer) {
        this.optimistic.delete(entityId);
        this.requestUpdate();
      }
    }, 3000);
    this.optimistic.set(entityId, { state, timer });
    this.requestUpdate();
  }

  /** The state to draw: the expected one while it is pending, otherwise the reported one. */
  protected stateOf(view: EntityView): string {
    const pending = this.optimistic.get(view.id);
    if (!pending) return view.state;
    if (pending.state === view.state) {
      clearTimeout(pending.timer);
      this.optimistic.delete(view.id);
    }
    return pending.state;
  }

  /* ---------- helpers ---------- */

  protected entity(id: string | undefined = this.config?.entity): EntityView {
    return resolveEntity(this.hass, id);
  }

  protected t(key: MessageKey, values?: Record<string, string | number>): string {
    return localize(this.hass, key, values);
  }

  /** Content width of a padded card (20 px sides): the measured width less the padding, whole pixels, so ticks land crisp. */
  protected get contentWidth(): number {
    return Math.max(0, this.width - 40);
  }

  protected call(
    domain: string,
    service: string,
    data: Record<string, unknown> = {},
    entityId: string | undefined = this.config?.entity,
  ): void {
    if (!this.hass) return;
    // a rejected call (offline, a bad entity) is Home Assistant's toast to show; the card must never throw
    this.hass
      .callService(domain, service, data, entityId ? { entity_id: entityId } : undefined)
      .catch(() => undefined);
  }

  protected tap(
    entityId: string | undefined = this.config?.entity,
    action: ActionConfig | undefined = this.config?.tap_action,
  ): void {
    if (this.hass) void runAction(this, this.hass, action, entityId);
  }

  /** A still press of 500 ms on the head: the `hold_action` (more-info by default), as a tap is the `tap_action`. */
  protected hold(
    entityId: string | undefined = this.config?.entity,
    action: ActionConfig | undefined = this.config?.hold_action,
  ): void {
    if (this.hass) void runAction(this, this.hass, action, entityId);
  }

  /** Rendered when the card has no config or no entity to show: one line and one glyph, never a blank box. */
  protected renderEmpty(message: string = this.t('common.no_entity')): TemplateResult {
    return html`<article class="fv-card fv-card--empty">
      <p class="fv-empty">${message}</p>
    </article>`;
  }

  protected abstract renderCard(): TemplateResult | typeof nothing;

  protected override render(): TemplateResult | typeof nothing {
    if (!this.config) return nothing;
    this.accents.begin();
    return this.renderCard();
  }
}
