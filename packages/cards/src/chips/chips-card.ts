import type { Tint } from '../shared/colour.js';
import {
  strings,
  type ActionConfig,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { icon, reducedMotion, sheetStyles, sideScroll, zoomOf, type IconRef } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { Card, type BaseKey } from '../shared/base.js';
import {
  actionField,
  emptyFields,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  textField,
  tintField,
  accentField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { EMPTY } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, listOf, type EmptyList } from '../shared/lists.js';

const s = strings('chips');

export interface ChipConfig {
  name: string;
  icon?: IconRef | string;
  /** Dashboard path this tab navigates to, e.g. "/fluvy-home/living". The tab whose path is open is the active one. */
  path?: string;
  /** Entity whose more-info opens on tap when there is no path. */
  entity?: string;
  /** A full action; wins over `path` and `entity`. */
  action?: ActionConfig;
  /** The tab's own colour (a Home Assistant colour name or `#rrggbb`): its fill when it is the open one. */
  color?: string;
}

export interface ChipsCardConfig extends FluvyCardConfig, EmptyList {
  chips?: readonly ChipConfig[];
  /** `always`: a tab with a colour shows it at rest too — a wash and its hairline (`on`, the default: when open). */
  tint?: Tint;
}

/** "/fluvy-home/living/", "/fluvy-home/living?edit=1" and "/fluvy-home/living" are the same view. */
function viewOf(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

/** The tabs of a list: a section's title or a divider among them (as a filter may hand them over) is none. */
const tabsOf = (list: unknown): ChipConfig[] =>
  Array.isArray(list) ? list.filter((chip: { type?: unknown } | null) => !chip?.type) : [];

const FADE = 24;
/** The row's gap between tabs and its inset (4 px each side, room for the focus ring). */
const ROW_GAP = 8;
const ROW_INSET = 4;

/**
 * The room tabs: content-sized 14 px pills (text + 32) in a 44 hit, the open view ink-filled. They
 * navigate — Home Assistant owns the views, the row only points at them. It is not a card surface.
 * A row that fits fills its line; a row wider than its column scrolls sideways with momentum (a tab row
 * never wraps) — by finger, trackpad, mouse wheel or mouse drag — fades at the side that has more, and
 * keeps the active tab in view.
 */
export class FluvyChipsCard extends Card<ChipsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ChipsCardConfig): number {
    return tabsOf(config.chips).length ? 44 : EMPTY;
  }

  static override still = true;

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.home,
    css`
      .hm-rooms.is-beside-mark .fv-chip--ink.is-active .fv-chip__pill {
        background: var(--fluvy-text);
        color: var(--fluvy-page);
      }
      .hm-rooms {
        margin-top: 0;
        animation: fv-enter 420ms var(--fv-ease-out) both;
        animation-delay: var(--fv-enter-delay, 0ms);
      }
      /* one line that scrolls (interaction.css lets plain chip sets wrap). The scroller is 4 px wider
         than the column on each side so the 2 + 2 focus ring of the first and last tab is not clipped. */
      .hm-rooms .fv-chips {
        flex-wrap: nowrap;
        height: 44px;
        margin: 0 -4px;
        padding: 0 4px;
        overflow: auto hidden;
        overscroll-behavior-x: contain;
        scroll-padding: 0 28px; /* a tab brought into view (focus, reveal) clears the fade */
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        -webkit-mask-image: linear-gradient(
          to right,
          transparent,
          var(--fluvy-text) var(--fade-start, 0px),
          var(--fluvy-text) calc(100% - var(--fade-end, 0px)),
          transparent
        );
        mask-image: linear-gradient(
          to right,
          transparent,
          var(--fluvy-text) var(--fade-start, 0px),
          var(--fluvy-text) calc(100% - var(--fade-end, 0px)),
          transparent
        );
      }
      .hm-rooms .fv-chips::-webkit-scrollbar {
        display: none;
      }
      /* a row that fits fills its line: each tab grows from its own width, its label re-centred */
      .hm-rooms .fv-chips.fills .fv-chip {
        flex-grow: 1;
      }
      .hm-rooms .fv-chips.fills .fv-chip__pill {
        justify-content: center !important;
        padding-left: 0 !important;
      }
      /* a mouse drags the row (sideScroll): the pills stop reacting while it moves */
      .hm-rooms .fv-chips.is-dragging {
        cursor: grabbing;
        user-select: none;
      }
      .hm-rooms .fv-chips.is-dragging .fv-chip {
        pointer-events: none;
      }
      .fv-chip__pill {
        white-space: nowrap;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    path_: { state: true },
    besideMark_: { state: true },
  };

  /** The view that is open, kept in step with Home Assistant's router. */
  declare path_: string;
  /**
   * The look marks "you" with its second brand colour (the greeting's avatar, just above): the room being shown
   * is then the ink pill, so the region holds one highlight, not two.
   */
  declare besideMark_: boolean;

  override syncTheme(): void {
    super.syncTheme();
    // read after the base has put the fallback's attributes on the host: right on the first frame too
    this.besideMark_ = getComputedStyle(this).getPropertyValue('--fluvy-mark').trim() !== '';
  }

  /** Pills are sized after render and again when a web font arrives: the row follows their real width. */
  private sizes: ResizeObserver | undefined;

  constructor() {
    super();
    this.path_ = '';
    this.besideMark_ = false;
  }

  /** The row's accessible name is the base's `name`; the tabs are its own. */
  static override base: readonly BaseKey[] = ['name'];
  static override keys = configKeys<ChipsCardConfig>()(['chips', 'tint', ...EMPTY_KEYS]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'chips',
      idKey: 'name',
      title: 'editor.tabs',
      keys: ['name', 'icon', 'path', 'entity', 'action', 'color'],
      schema: [
        textField('name'),
        fieldRow(iconField(), textField('path')),
        entityField(undefined, 'entity', false),
        accentField(),
        actionField('action'),
      ],
    },
  ];
  static override aliases: AliasSpec = {
    keys: [{ from: 'label', to: 'name' }],
    items: { chips: ITEM_ALIASES },
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ tint: 'on' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        textField('name'),
        { name: 'chips', required: true, selector: { object: {} } },
        tintField(),
        emptyFields(),
      ],
      ...formLabels({ chips: 'editor.tabs' }),
    };
  }

  static getStubConfig(): ChipsCardConfig {
    return {
      type: 'custom:fluvy-chips-card',
      chips: [
        { name: 'Home', path: viewOf(location.pathname) },
        { name: 'Energy', path: '/energy' },
      ],
    };
  }

  protected override prepare(config: ChipsCardConfig): ChipsCardConfig {
    listOf(config, 'chips');
    if (tabsOf(config.chips).some((chip) => typeof chip?.name !== 'string' || !chip.name.trim()))
      throw new Error('fluvy-chips-card: every chip needs a "name"');
    return config;
  }

  override getCardSize(): number {
    return 1;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** Nothing drawn here depends on an entity's state. */
  protected override watched(): readonly string[] {
    return [];
  }

  /* ---------- the open view ---------- */

  private readonly onLocation = (): void => {
    this.path_ = viewOf(location.pathname);
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.onLocation();
    window.addEventListener('location-changed', this.onLocation);
    window.addEventListener('popstate', this.onLocation);
    this.sizes = new ResizeObserver(() => this.settle());
    this.watchChips();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('location-changed', this.onLocation);
    window.removeEventListener('popstate', this.onLocation);
    this.sizes?.disconnect();
    this.sizes = undefined;
    this.mouse?.stop();
    this.mouse = undefined;
  }

  private activeIndex(): number {
    return tabsOf(this.config?.chips).findIndex(
      (chip) => chip.path !== undefined && viewOf(chip.path) === this.path_,
    );
  }

  /* ---------- the scroller ---------- */

  /** True once the user has taken the row (touch, wheel, focus): from then on it is theirs until the view changes elsewhere. */
  private hands = false;
  /** Set by a tap on a tab of this row: the view change that follows glides instead of jumping. */
  private tapped = false;

  private get scroller(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('.fv-chips');
  }

  /** The mouse's reach on the row (wheel and drag), bound to the scroller that is in the DOM now. */
  private mouse: { el: HTMLElement; stop: () => void } | undefined;
  private bindMouse(): void {
    const scroller = this.scroller;
    if (this.mouse?.el === scroller) return;
    this.mouse?.stop();
    this.mouse = scroller
      ? {
          el: scroller,
          stop: sideScroll(scroller, () => {
            this.hands = true;
          }),
        }
      : undefined;
  }

  private watchChips(): void {
    this.sizes?.disconnect();
    this.scroller?.querySelectorAll('.fv-chip').forEach((chip) => this.sizes?.observe(chip));
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('config')) this.watchChips(); // the observer's first report places the active tab
    this.bindMouse();
    if (changed.has('path_') && !this.tapped) this.hands = false;
    this.settle(changed.has('path_') && this.tapped);
    this.tapped = false;
  }

  /**
   * Keeps the active tab inside the row and the fades honest. While the row has not been touched it
   * is held there against everything that moves it — pills re-measured when a font arrives clamp
   * the scroll position for a moment — and once the user scrolls, the row is left alone.
   */
  private settle(glide = false): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>('.is-active');
    // the rects are read in the row's own pixels: what it scrolls by, and what the fade is measured in
    const zoom = zoomOf(scroller);
    if (active && (glide || !this.hands)) {
      const room = scroller.getBoundingClientRect();
      const chip = active.getBoundingClientRect();
      const width = room.width / zoom;
      const start = (chip.left - room.left) / zoom;
      const span = chip.width / zoom;
      // in full view, clear of the fade at a side that has more behind it
      const more = scroller.scrollWidth - scroller.clientWidth;
      const clearLeft = scroller.scrollLeft > 1 ? FADE : 0;
      const clearRight = width - (more - scroller.scrollLeft > 1 ? FADE : 0);
      if (start < clearLeft || start + span > clearRight) {
        const left = scroller.scrollLeft + start - (width - span) / 2;
        scroller.scrollTo({
          left: Math.max(0, left),
          behavior: glide && !reducedMotion() ? 'smooth' : 'auto',
        });
      }
    }
    // a row whose tabs fit (their fitted widths and gaps within the row) fills its line; one that does not scrolls
    const tabs = [...scroller.querySelectorAll<HTMLElement>('.fv-chip')];
    const natural =
      tabs.reduce(
        (sum, tab) =>
          sum + (Number.parseFloat(tab.style.width) || tab.getBoundingClientRect().width / zoom),
        0,
      ) +
      ROW_GAP * Math.max(0, tabs.length - 1);
    scroller.classList.toggle('fills', natural <= scroller.clientWidth - 2 * ROW_INSET);
    // a side fades only while there is more behind it; written to the element, so scrolling never renders
    const hidden = scroller.scrollWidth - scroller.clientWidth;
    const fade = `${scroller.scrollLeft > 1 ? FADE : 0}px ${hidden - scroller.scrollLeft > 1 ? FADE : 0}px`;
    if (fade === scroller.dataset['fade']) return;
    scroller.dataset['fade'] = fade;
    const [start = '0px', end = '0px'] = fade.split(' ');
    scroller.style.setProperty('--fade-start', start);
    scroller.style.setProperty('--fade-end', end);
  }

  private readonly onScroll = (): void => this.settle();
  /** Passive on purpose: a wheel listener that could cancel would make the browser wait for it before scrolling. */
  private readonly onHands = {
    handleEvent: (): void => {
      this.hands = true;
    },
    passive: true,
  };

  /* ---------- rendering ---------- */

  private actionFor(chip: ChipConfig): ActionConfig {
    if (chip.action) return chip.action;
    if (chip.path) return { action: 'navigate', navigation_path: chip.path };
    if (chip.entity) return { action: 'more-info', entity: chip.entity };
    return { action: 'none' };
  }

  protected renderCard(): TemplateResult {
    const chips = tabsOf(this.config?.chips);
    // no tabs: the panel where the row would be, on the page as the row is
    const panel = emptyPanel(this, !chips.length, 'rooms', 'common.no_tabs', true);
    if (panel) return panel;
    const active = this.activeIndex();

    return html`<nav
      class="hm-rooms ${this.besideMark_ ? 'is-beside-mark' : ''}"
      aria-label=${this.config?.name ?? s(this.hass, 'rooms')}
    >
      <div
        class="fv-chips"
        data-scroll-row
        @scroll=${this.onScroll}
        @pointerdown=${this.onHands}
        @wheel=${this.onHands}
        @focusin=${this.onHands}
      >
        ${chips.map(
          (chip, index) =>
            html`<button
              class="fv-chip ${index === active ? (chip.color ? 'is-active' : 'fv-chip--ink is-active') : ''}"
              data-target
              data-fit="32"
              data-accent=${this.accents.item(chip.color) ?? nothing}
              aria-current=${index === active ? 'page' : nothing}
              @click=${() => {
                const action = this.actionFor(chip);
                this.tapped = action.action === 'navigate';
                this.tap(chip.entity, action);
              }}
            >
              <span
                class="fv-chip__pill ${
                  this.config?.tint === 'always' && chip.color && index !== active
                    ? 'is-tinted'
                    : ''
                }"
                data-control
                >${chip.icon ? icon(chip.icon) : nothing}${chip.name}</span
              >
            </button>`,
        )}
      </div>
    </nav>`;
  }
}
