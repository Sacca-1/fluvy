import type { Tint } from '../shared/colour.js';
import {
  stateText,
  strings,
  toggleEntity,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { clickPress, ico, linesNeeded, preventMenu, sheetStyles, startPress } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { agoShort } from '../helpers/datetime.js';

import { Card, type BaseKey } from '../shared/base.js';

import { glyphFor } from '../shared/domain.js';

import { TextRuler } from '../shared/fit.js';

import { FontsSettled } from '../shared/fonts.js';

import {
  accentField,
  actionField,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  textField,
  tintField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import {
  columnsOf,
  configKeys,
  ITEM_ALIASES,
  type AliasSpec,
  type Columns,
} from '../shared/config.js';
import { listLength, rowsOf } from '../shared/heights.js';

const s = strings('scenes');

const DOMAINS: readonly string[] = ['scene', 'script', 'button', 'input_button', 'automation'];

export interface SceneItemConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** The second line ("All off", "Lock & arm"). Defaults to what the scene touches, else when it last ran. */
  subtitle?: string;
  /** What a tap does instead of running the scene. */
  tap_action?: ActionConfig;
  /** The scene's own colour (a Home Assistant colour name or `#rrggbb`): its tile's when it is the last run. */
  color?: string;
}

export interface ScenesCardConfig extends FluvyCardConfig {
  /** A section title above the tiles (the heading card's face). */
  title?: string;
  /** The object form, for a per-scene `name`, `icon`, `subtitle` and `tap_action`. Wins over `entities`. */
  scenes?: ReadonlyArray<string | SceneItemConfig>;
  /** `auto` (default): two a row while every name fits its two lines; `1` or `2` to say so (two at most). */
  columns?: Columns;
  /** `always`: every tile shows its colour at rest too — a wash and its hairline (`on`, the default: the last run). */
  tint?: Tint;
  /** Test hook: an ISO date that freezes "now" (the "applied … ago" lines). Undocumented. */
  _now?: string;
}

/**
 * When it last ran: scenes and buttons keep that in their state, scripts and automations in an
 * attribute. `state` is the one on screen — a press expects "now" there, whatever the domain — so the
 * later of the two is the answer for every kind.
 */
function firedAt(view: EntityView, state: string): number {
  const fromState = Date.parse(state);
  const fromAttr = Date.parse(view.attr<string | null>('last_triggered') ?? '');
  return Math.max(
    Number.isFinite(fromState) ? fromState : 0,
    Number.isFinite(fromAttr) ? fromAttr : 0,
  );
}

/**
 * Scenes as the sheet's 2-up tiles: a 76 tall button each — the glyph in its circle, the name and
 * what the scene touches. A scene has no "on", only a last time it was applied: the one applied
 * most recently carries the accent fill (the sheet's one active tile), and a press fills its tile at once (optimistic) while the
 * call is on its way.
 */
/** The tiles' grid gap, and a tile's padding (16 + 16), circle (44) and circle-to-text gap (12). */
const GRID_GAP = 16;
const TILE_CHROME = 88;

export class FluvyScenesCard extends Card<ScenesCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ScenesCardConfig): number {
    const n = listLength(config, ['scenes', 'entities']);
    const perRow = columnsOf(config.columns, 'auto') === 1 ? 1 : 2;
    return (config.title ? 40 : 0) + Math.max(1, rowsOf(n, perRow)) * 84 - 8; // no scenes yet: the empty state's row
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.ambient,
    sheetStyles.home,
    css`
      /* the lab fixes the sheet at 360; a dashboard column decides here */
      .am-scenes {
        width: 100%;
      }
      .am-scenes .hm-section {
        margin: 0 0 16px;
      }
      .hm-section__title {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* a scene's name takes two lines before it gives way ("Encender Luz Porche & Patio") */
      .am-scene .fv-row__title {
        white-space: normal;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow-wrap: anywhere;
      }
      .fv-grid2 {
        grid-template-columns: repeat(var(--am-cols, 2), minmax(0, 1fr));
      }
      .am-scene .fv-row__text {
        min-width: 0;
      }
      button.fv-tile--off {
        width: 100%;
        text-align: left;
      }
    `,
  ];

  /** A grid of scenes has no entity of its own: its colour is the lit tile's, a hold on a tile is the base's. */
  static override base: readonly BaseKey[] = ['entities', 'color', 'card_color', 'hold_action'];
  static override keys = configKeys<ScenesCardConfig>()(['title', 'scenes', 'columns', 'tint']);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'scenes',
      alias: 'entities',
      title: 'editor.scenes',
      domains: DOMAINS,
      keys: ['entity', 'name', 'icon', 'subtitle', 'color', 'tap_action'],
      schema: [
        entityField(DOMAINS),
        nameIconFields(),
        textField('subtitle'),
        accentField(),
        actionField(),
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { scenes: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({ columns: 'auto', tint: 'on' });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        fieldRow(textField('title'), selectField('columns', ['auto', '1', '2'])),
        entitiesField('entities', DOMAINS, true),
        fieldRow(
          accentField(),
          accentField('card_color', { none: true }),
          actionField('hold_action'),
        ),
        tintField(),
      ],
      ...formLabels({}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): ScenesCardConfig {
    return {
      type: 'custom:fluvy-scenes-card',
      entities: entities.filter((id) => id.startsWith('scene.')).slice(0, 4),
    };
  }

  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);

  constructor() {
    super();
    new FontsSettled(this, () => {
      this.ruler.clear();
      this.requestUpdate();
    });
  }

  /**
   * Two tiles a row (164 wide at the least) while every name reads in its two lines there; one a row
   * when a name would not ("Encender Luz Porche & Patio" in a 352 column), rather than cutting it.
   */
  private columns(names: readonly string[]): 1 | 2 {
    const asked = columnsOf(this.config?.columns, 'auto');
    if (asked === 1 || this.width < 344) return 1;
    if (asked !== 'auto') return 2;
    const room = (this.width - GRID_GAP) / 2 - TILE_CHROME; // a half tile, less its padding, circle and gap
    const fits = names.every(
      (name) => linesNeeded(name, room, (text) => this.ruler.width('fv-row__title', text)) <= 2,
    );
    return fits ? 2 : 1;
  }

  private items(): SceneItemConfig[] {
    const source = this.config?.scenes ?? this.config?.entities ?? [];
    return source
      .map((item) => (typeof item === 'string' ? { entity: item } : item))
      .filter((item) => Boolean(item.entity));
  }

  protected override prepare(config: ScenesCardConfig): ScenesCardConfig {
    if (!config.scenes?.length && !config.entities?.length)
      throw new Error('fluvy-scenes-card: add at least one scene');
    return config;
  }

  protected override watched(): readonly string[] {
    return this.items().map((item) => item.entity);
  }

  override getCardSize(): number {
    return Math.ceil(this.items().length / 2) * 2;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  private run(view: EntityView): void {
    if (!this.hass) return;
    this.expect(view.id, new Date().toISOString()); // the newest "applied" is this one, now
    if (view.domain === 'automation')
      this.call('automation', 'trigger', {}, view.id); // `toggleEntity` would switch the automation off
    else void toggleEntity(this.hass, view.id);
  }

  private meta(item: SceneItemConfig, view: EntityView, at: number, now: Date): string {
    if (item.subtitle !== undefined) return item.subtitle;
    const members = view.attr<readonly string[] | null>('entity_id');
    const count = Array.isArray(members) ? members.length : 0;
    if (count > 0)
      return count === 1 ? s(this.hass, 'device_one') : s(this.hass, 'devices', { count });
    return at > 0 ? agoShort(this.hass, new Date(at), now) : s(this.hass, 'never');
  }

  protected renderCard(): TemplateResult {
    const items = this.items();
    if (items.length === 0) return this.renderEmpty();
    const views = items.map((item) => this.entity(item.entity));
    const columns = this.columns(
      items.map((item, index) => item.name ?? (views[index] as EntityView).name),
    );
    const frozen = this.config?._now ? new Date(this.config._now) : null;
    const now = frozen && !Number.isNaN(frozen.getTime()) ? frozen : new Date();

    const fired = views.map((view) =>
      view.status === 'ok' || view.status === 'unknown' ? firedAt(view, this.stateOf(view)) : 0,
    );
    const newest = Math.max(0, ...fired);
    // the line under a name only while it fits the tile's words column: a state is dropped, never cut
    const room = (columns === 2 ? (this.width - GRID_GAP) / 2 : this.width) - TILE_CHROME;
    const fitted = (line: string): string =>
      line && this.ruler.width('fv-row__sub', line) <= room ? line : '';

    const title = this.config?.title;
    return html`<div class="am-scenes">
      ${
        title
          ? html`<div class="hm-section">
              <div class="hm-section__lead"><h2 class="hm-section__title">${title}</h2></div>
            </div>`
          : nothing
      }
      <div class="fv-grid2" style="--am-cols:${columns}">
        ${items.map((item, index) => {
          const view = views[index] as EntityView;
          const name = item.name ?? view.name;
          if (view.status === 'missing' || view.status === 'unavailable') {
            const state = fitted(stateText(this.hass, view));
            return html`<button
              class="fv-tile fv-tile--off fv-tile--tap"
              data-card
              data-target
              @click=${() => this.tap(view.id, { action: 'more-info' })}
            >
              ${ico('ban', 'off')}
              <span class="fv-row__text"
                ><span class="fv-row__title">${name}</span
                >${state ? html`<span class="fv-row__sub">${state}</span>` : nothing}</span
              >
            </button>`;
          }
          const at = fired[index] ?? 0;
          const active = at > 0 && at === newest;
          const meta = fitted(this.meta(item, view, at, now));
          // a coloured scene keeps its colour at rest when the card asks (the last run is on: its full fill)
          const tinted = this.config?.tint === 'always' && Boolean(item.color) && !active;
          return html`<button
            class="fv-tile am-scene fv-tile--tap ${active ? 'is-on fv-tile--accent' : ''} ${
              tinted ? 'is-tinted' : ''
            }"
            data-card
            data-target
            data-accent=${this.accents.item(item.color) ?? nothing}
            aria-pressed=${active ? 'true' : 'false'}
            .fvTap=${() => (item.tap_action ? this.tap(view.id, item.tap_action) : this.run(view))}
            .fvHold=${() => this.hold(view.id)}
            @pointerdown=${startPress}
            @contextmenu=${preventMenu}
            @click=${clickPress}
          >
            ${ico(item.icon ?? view.attr<string | null>('icon') ?? glyphFor(view), active || tinted ? 'accent' : 'neutral')}
            <span class="fv-row__text">
              <span class="fv-row__title">${name}</span>
              ${meta ? html`<span class="fv-row__sub">${meta}</span>` : nothing}
            </span>
          </button>`;
        })}
      </div>
    </div>`;
  }
}
