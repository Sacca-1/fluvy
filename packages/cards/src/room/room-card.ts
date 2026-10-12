import {
  areaClimate,
  areaEntities,
  areaSummary,
  formatNumber,
  isUsable,
  navigate,
  stateText,
  strings,
  valueParts,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { emptyState, head, icon, listRow, readout, sheetStyles } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { Crossfade } from '../shared/crossfade.js';
import { counted } from '../shared/counted.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import {
  actionField,
  areaField,
  boolField,
  colourFields,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  textField,
  tintField,
} from '../shared/form.js';
import { ROW, rowsOf } from '../shared/heights.js';
import { fitLine, TextRuler, type Segment } from '../shared/fit.js';
import { FontsSettled } from '../shared/fonts.js';
import { statsColumns, statsSize } from '../shared/readouts.js';
import type { BaseKey } from '../shared/base.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { FluvyTileCard, type TileCardConfig, type TileItem } from '../tile/tile-card.js';
import { FluvyTilesCard } from '../tiles/tiles-card.js';

const s = strings('room');

export type RoomVariant = 'photo' | 'tile' | 'row';
export type RoomControls = 'rows' | 'tiles' | 'none';

export interface RoomCardConfig extends TileCardConfig {
  /** The area (its id). */
  area: string;
  /** `photo` (default where the area has a picture, else `tile`): the picture, the readouts and the controls. `tile`: the head and the controls. `row`: a compact tile. */
  variant?: RoomVariant;
  /** A picture of the room instead of the area's own. */
  picture?: string;
  /** The temperature and humidity readouts (default). */
  show_climate?: boolean;
  /** The "devices on" readout and the count in the state line (default). */
  show_count?: boolean;
  /** Under the readouts: category rows (`rows`, default), the room's controls as compact tiles (`tiles`), or nothing. */
  controls?: RoomControls;
  /** The tiles to draw (default: the room's lights, then its switches, covers and fans, four at most). */
  tiles?: readonly TileItem[];
  /** Where the room opens (an admin without one goes to the area's settings). */
  path?: string;
  temperature_entity?: string;
  humidity_entity?: string;
}

const HERO = 160;
const STATS = 80; // 20 above three readouts of 60
const TILES = 4;
/** An inner tile (a compact tile inside a card) is 84 tall. */
const INNER = 84;

/**
 * A room of the house, from its area: what the registry knows of it (its picture, its climate) and what it holds
 * (its lights and controls, how many are on), in the ambient family's area anatomy.
 */
export class FluvyRoomCard extends FluvyTileCard {
  static override layoutHeight(config: RoomCardConfig): number {
    if (config.variant === 'row') return 76;
    const tiles = Math.max(1, Math.min(TILES, config.tiles?.length ?? TILES));
    const controls =
      config.controls === 'none'
        ? 0
        : config.controls === 'tiles'
          ? 16 + rowsOf(tiles, 2) * (INNER + 8) - 8
          : 16 + ROW * 4;
    if (config.variant === 'tile') return 20 + 44 + controls + 20;
    const stats = config.show_climate === false && config.show_count === false ? 0 : STATS;
    return 20 + HERO + stats + controls + 20;
  }

  static override styles: CSSResultGroup = [
    ...(FluvyTileCard.styles as CSSResultGroup[]),
    sheetStyles.ambient,
    sheetStyles.rooms,
    css`
      .am-card {
        width: auto;
      }
      /* the sheet's three 96 columns; a card takes the column it is given, and fewer columns where a label would not
         hold in a third */
      .am-area__stats {
        grid-template-columns: repeat(var(--am-stats, 3), minmax(0, 1fr));
      }
      .am-area__stats--odd > :last-child {
        grid-column: 1 / -1;
      }
      /* a row's title is a word, not a name ("Todos los dispositivos"): it takes a second line rather than lose its end */
      .am-rows .fv-row__title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
      }
    `,
  ];

  /** Widths laid out by the browser in the card's own classes: the readouts and the row's line are fitted with it. */
  private readonly roomRuler = new TextRuler(() => this.renderRoot as ParentNode | undefined);

  constructor() {
    super();
    // the state line and the stats are measured: a web font arriving changes every width
    new FontsSettled(this, () => {
      this.roomRuler.clear();
      this.requestUpdate();
    });
  }

  static override base: readonly BaseKey[] = [
    'name',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<RoomCardConfig>()([
    'area',
    'variant',
    'picture',
    'show_climate',
    'show_count',
    'controls',
    'tiles',
    'path',
    'temperature_entity',
    'humidity_entity',
    'size',
    'readouts',
    'tint',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'tiles',
      title: 'editor.tiles',
      keys: FluvyTilesCard.lists[0]?.keys ?? [],
      schema: FluvyTilesCard.lists[0]?.schema ?? [],
    },
  ];
  static override aliases: AliasSpec = { items: { tiles: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'photo',
    controls: 'rows',
    size: 'large',
    show_count: true,
    show_climate: true,
    tint: 'on',
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        areaField(),
        nameIconFields(),
        fieldRow(
          selectField('variant', ['photo', 'tile', 'row']),
          selectField('controls', ['rows', 'tiles', 'none']),
        ),
        fieldRow(boolField('show_climate'), boolField('show_count')),
        fieldRow(textField('picture'), textField('path')),
        fieldRow(
          {
            name: 'temperature_entity',
            selector: { entity: { domain: ['sensor'], device_class: 'temperature' } },
          },
          {
            name: 'humidity_entity',
            selector: { entity: { domain: ['sensor'], device_class: 'humidity' } },
          },
        ),
        fieldRow(selectField('size', ['large', 'compact', 'mini']), {
          name: 'readouts',
          selector: { entity: { multiple: true } },
        }),
        ...colourFields(),
        tintField(),
        fieldRow(actionField('tap_action'), actionField('hold_action')),
      ],
      ...formLabels({
        temperature_entity: 'editor.temperature_entity',
        humidity_entity: 'editor.humidity_entity',
      }),
    };
  }

  static override getStubConfig(hass: unknown, entities: readonly string[]): RoomCardConfig {
    const registry = hass as { areas?: Record<string, { area_id: string }> } | undefined;
    const area = registry?.areas ? Object.keys(registry.areas)[0] : undefined;
    const light = entities.find((id) => id.startsWith('light.'));
    return {
      type: 'custom:fluvy-room-card',
      area: area ?? '',
      ...(light ? { entity: light } : {}),
    };
  }

  protected override prepare(config: RoomCardConfig): RoomCardConfig {
    if (!config.area) throw new Error('fluvy-room-card: "area" is required');
    return config;
  }

  private readonly photo = new Crossfade(this);
  private shownPicture = '';

  private get room(): RoomCardConfig | undefined {
    return this.config as RoomCardConfig | undefined;
  }

  private area() {
    return this.hass?.areas?.[this.room?.area ?? ''];
  }

  private get variant(): RoomVariant {
    const asked = this.room?.variant;
    if (asked === 'photo' || asked === 'tile' || asked === 'row') return asked;
    return this.pictureUrl() ? 'photo' : 'tile';
  }

  private pictureUrl(): string {
    const own = this.room?.picture ?? this.area()?.picture ?? '';
    return own && this.hass ? this.hass.hassUrl(own) : '';
  }

  /** The tiles the room offers: those asked for, else its lights then its other controls, four at most. */
  private tiles(): TileItem[] {
    const asked = this.room?.tiles;
    if (asked?.length) return asked.slice(0, TILES);
    if (!this.hass) return [];
    return areaSummary(this.hass, this.room?.area ?? '')
      .controls.slice(0, TILES)
      .map((entity) => ({ entity }));
  }

  private climate(): { temperature?: string; humidity?: string } {
    if (!this.hass) return {};
    const found = areaClimate(this.hass, this.room?.area ?? '');
    return {
      ...((this.room?.temperature_entity ?? found.temperature)
        ? { temperature: this.room?.temperature_entity ?? found.temperature }
        : {}),
      ...((this.room?.humidity_entity ?? found.humidity)
        ? { humidity: this.room?.humidity_entity ?? found.humidity }
        : {}),
    };
  }

  protected override watched(): readonly string[] {
    const climate = this.climate();
    return [
      ...this.tiles().map((tile) => tile.entity),
      ...(climate.temperature ? [climate.temperature] : []),
      ...(climate.humidity ? [climate.humidity] : []),
    ];
  }

  override getCardSize(): number {
    return this.variant === 'row' ? 1 : this.variant === 'tile' ? 4 : 7;
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'row'
      ? { columns: 6, rows: 'auto', min_columns: 4 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** Where the room opens: its path, or the area's settings for an admin; nothing for anyone else. */
  private destination(): string | undefined {
    if (this.room?.path) return this.room.path;
    return this.hass?.user?.is_admin ? `/config/areas/area/${this.room?.area}` : undefined;
  }

  private open(): void {
    const to = this.destination();
    if (to) navigate(to);
  }

  /** The state line: "3 of 5 on · 21.4 °C". */
  private roomLine(
    ids: readonly string[],
    on: number,
    // the compact tile's words by default; the tile variant's head measures its sub in its own class and room
    room = this.width - 32 - (this.width >= 128 ? 44 + 12 : 0),
    cls = 'fv-tile fv-tile--compact > fv-tile__state',
  ): string {
    const count =
      this.room?.show_count !== false && ids.length
        ? on > 0
          ? this.t('common.on_of', { on, count: ids.length })
          : counted(this.hass, ids, (id) => this.entity(id))
        : '';
    const climate: Segment[] = [];
    const { temperature } = this.climate();
    if (this.room?.show_climate !== false && temperature) {
      const view = this.entity(temperature);
      if (isUsable(view)) {
        // a compact surface writes degrees without the unit: "21.4°" (the readouts keep "°C")
        const value = valueParts(this.hass, view);
        climate.push({
          text: value.unit.startsWith('°')
            ? `${value.value}°`
            : `${value.value} ${value.unit}`.trim(),
          optional: true,
        });
      }
    }
    // the compact tile's words have its width less its 16 px sides, and less its circle and gap where it keeps one
    // (128 and wider: tiles.css)
    const width = (text: string): number => this.roomRuler.width(cls, text);
    // the count stays, the climate leaves first; then the count in figures ("3/5") where its words would be cut, the
    // tile's fill already saying that something is on
    const worded = fitLine([...(count ? [{ text: count }] : []), ...climate], room, width);
    return on > 0 && count && width(worded) > room
      ? fitLine([{ text: `${on}/${ids.length}` }, ...climate], room, width)
      : worded;
  }

  private renderStats(ids: readonly string[], on: number): TemplateResult | typeof nothing {
    const { temperature, humidity } = this.climate();
    const climate = this.room?.show_climate !== false;
    const count = this.room?.show_count !== false;
    const stats: { label: string; value: string; unit: string }[] = [];
    const push = (id: string | undefined, label: string): void => {
      if (!id) return;
      const view = this.entity(id);
      const parts = isUsable(view) ? valueParts(this.hass, view) : { value: '—', unit: '' };
      stats.push({ label, value: parts.value, unit: parts.unit });
    };
    if (climate) push(temperature, s(this.hass, 'temperature'));
    if (climate) push(humidity, s(this.hass, 'humidity'));
    if (count && ids.length)
      stats.push({
        label: s(this.hass, 'devices_on'),
        value: formatNumber(this.hass, on, { digits: 0 }),
        unit: s(this.hass, 'of', { count: ids.length }),
      });
    if (!stats.length) return nothing;
    // three readouts in the column while every label and figure holds in its third, else fewer columns (a shorter last
    // row takes the whole row); the size the widest figure still fits (s → xs)
    const columns = statsColumns(this.roomRuler, this.contentWidth, stats);
    const size = statsSize(this.roomRuler, this.contentWidth, stats, columns);
    return html`<div
      class="am-area__stats ${stats.length % columns ? 'am-area__stats--odd' : ''}"
      data-align="center"
      style="--am-stats:${columns}"
    >
      ${stats.map((stat) => readout({ ...stat, size }))}
    </div>`;
  }

  /** The category rows: the lights, the climate, the media, then every device. */
  private renderRows(ids: readonly string[]): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const to = this.destination();
    const row = (
      glyph: string,
      title: string,
      sub: string,
      tone: 'light' | 'heat' | 'neutral',
    ): TemplateResult =>
      listRow({
        icon: glyph,
        tone,
        title,
        sub,
        trailing: to ? 'chevron' : 'none',
        ...(to ? { onTap: () => this.open() } : {}),
      });
    const lights = ids.filter((id) => id.startsWith('light.'));
    const climate = ids.find((id) => id.startsWith('climate.'));
    const player = ids.find((id) => id.startsWith('media_player.'));
    const unavailable = ids.filter((id) => !isUsable(this.entity(id))).length;
    const rows = [
      ...(lights.length
        ? [
            row(
              'bulb',
              this.t('strategy.lights'),
              counted(this.hass, lights, (id) => this.entity(id)),
              'light',
            ),
          ]
        : []),
      ...(climate
        ? [
            row(
              'thermo',
              this.t('strategy.climate'),
              stateText(this.hass, this.entity(climate)),
              'heat',
            ),
          ]
        : []),
      ...(player
        ? [
            row(
              'speaker',
              this.t('strategy.media'),
              stateText(this.hass, this.entity(player)),
              'neutral',
            ),
          ]
        : []),
      row(
        'grid',
        s(this.hass, 'all_devices'),
        unavailable
          ? s(this.hass, 'unavailable', { count: unavailable })
          : counted(this.hass, ids, (id) => this.entity(id)),
        'neutral',
      ),
    ];
    return html`<div class="am-rows">${rows}</div>`;
  }

  private renderControls(ids: readonly string[]): TemplateResult | typeof nothing {
    const controls = this.room?.controls ?? 'rows';
    if (controls === 'none' || !ids.length) return nothing;
    if (controls === 'rows') return this.renderRows(ids);
    const tiles = this.tiles();
    if (!tiles.length) return nothing;
    const column = this.tileWidth();
    return html`<div
      class="rm-controls"
      style="--rm-col:${column}px;--rm-gap:${this.contentWidth - 2 * column}px"
    >
      ${tiles.map((tile) => this.renderTile(tile, 'compact', true))}
    </div>`;
  }

  /** An inner tile's column: two on the 4 grid, whole pixels, the remainder between them (320: 156 + 8 + 156; 276: 132 + 12 + 132). */
  protected override tileWidth(): number {
    return Math.floor((this.contentWidth - 8) / 2 / 4) * 4;
  }

  /** The room's picture on the hero, cross-faded in once decoded; without one, the accent's gradient. */
  private renderHero(name: string, glyph: string): TemplateResult {
    const picture = this.pictureUrl();
    if (picture !== this.shownPicture) {
      this.shownPicture = picture;
      if (picture) this.photo.show(picture);
    }
    const to = this.destination();
    return html`<div
      class="rm-hero ${to ? 'rm-hero--tap' : ''}"
      role=${to ? 'button' : nothing}
      tabindex=${to ? 0 : nothing}
      aria-label=${to ? name : nothing}
      @click=${to ? () => this.open() : nothing}
    >
      ${picture ? this.photo.render() : nothing}
      ${picture ? html`<span class="rm-hero__scrim" data-measure="skip"></span>` : nothing}
      <span class="am-area__badge" data-fit="28">${icon(glyph)}${name}</span>
    </div>`;
  }

  protected override renderCard(): TemplateResult {
    const area = this.area();
    if (!area || !this.hass) return this.renderEmpty(s(this.hass, 'no_area'));
    const name = this.config?.name ?? area.name;
    const glyph = this.config?.icon ?? area.icon ?? 'home';
    const ids = areaEntities(this.hass, area.area_id);
    const summary = areaSummary(this.hass, area.area_id);
    const variant = this.variant;
    const to = this.destination();

    if (variant === 'row') {
      const line = this.roomLine(ids, summary.on);
      return html`<article
        class="fv-tile fv-tile--compact fv-tile--accent fv-tile--tap rm-tile ${summary.on ? 'is-on' : ''}"
        data-card
        role="button"
        tabindex="0"
        aria-label=${name}
        @click=${() => (to ? this.open() : this.tap())}
      >
        ${this.renderIco(glyph, summary.on > 0)}
        <div class="fv-tile__text">
          <h3 class="fv-tile__name">${name}</h3>
          <p class="fv-tile__state">${line || s(this.hass, 'nothing')}</p>
        </div>
      </article>`;
    }

    if (!ids.length)
      return html`<article class="fv-card am-card" data-card>
        ${head({ icon: glyph, tone: 'neutral', title: name, name: true, sub: '' })}
        ${emptyState('home', s(this.hass, 'nothing'))}
      </article>`;

    if (variant === 'tile')
      return html`<article class="fv-card am-card" data-card>
        ${head({
          icon: glyph,
          tone: summary.on ? 'accent' : 'neutral',
          title: name,
          name: true,
          // the head's line: its room is the column less the circle and its gap and the chevron's 44
          sub: this.roomLine(
            ids,
            summary.on,
            this.contentWidth - 56 - (to ? 44 : 0),
            'fv-card__sub',
          ),
          // "opens" is the bare chevron the rows use, its ink on the column edge
          trailing: to
            ? html`<button
                class="fv-hit fv-head__open"
                aria-label=${name}
                @click=${() => this.open()}
              >
                ${icon('chevron')}
              </button>`
            : nothing,
          onIconTap: () => this.tap(),
          onHold: () => this.hold(),
        })}
        ${this.renderControls(ids)}
      </article>`;

    return html`<article class="fv-card am-card am-card--area" data-card>
      ${this.renderHero(name, glyph)} ${this.renderStats(ids, summary.on)}
      ${this.renderControls(ids)}
    </article>`;
  }

  private renderIco(glyph: string, on: boolean): TemplateResult {
    return html`<span class="fv-ico fv-ico--${on ? 'accent' : 'neutral'}" data-icon
      >${icon(glyph)}</span
    >`;
  }
}
