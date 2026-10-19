import {
  actionRuns,
  areaClimate,
  areaContents,
  areaIndex,
  areasInOrder,
  climateAttribute,
  formatNumber,
  holdsSomething,
  idsOf,
  isActive,
  isUsable,
  lightDefaults,
  navigate,
  numberAttr,
  plural,
  stateText,
  strings,
  valueParts,
  type AreaContents,
  type ClimateKind,
  type HaFormSchemaItem,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
  type Registries,
  type ValueParts,
} from '@fluvy/core';
import {
  emptyState,
  head,
  icon,
  listRow,
  pressCover,
  readout,
  sheetStyles,
  type Tone,
} from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { HeadFit } from '../energy/head.js';
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
  showIconField,
  textField,
  tintField,
} from '../shared/form.js';
import { meanHex } from '../shared/light.js';
import { EMPTY, ROW, rowsOf } from '../shared/heights.js';
import { fitLine, type Segment } from '../shared/fit.js';
import { statsRow } from '../shared/readouts.js';
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
  /** The room's temperature, a sensor or a thermostat (its own reading); default: the area's (`areaClimate`). */
  temperature_entity?: string;
  /** The room's humidity, a sensor, a thermostat or a humidifier; default: the area's. */
  humidity_entity?: string;
}

const HERO = 160;
const STATS = 64; // 20 above a row of three small readouts (44)
const TILES = 4;
/** An inner tile (a compact tile inside a card) is 84 tall. */
const INNER = 84;
/** The empty panel's hint: its measure (`.fv-empty-state__hint`), the panel's sides, three lines less what wrapping by words loses. */
const HINT = 380;
const HINT_SIDES = 32;
const HINT_LINES = 2.8;

/**
 * The room as the card draws it: the area's contents, its readings the config's where it names them, and what is on
 * among what it shows — the readout, the line and the rows count the same devices alike (a heating thermostat is on).
 */
interface RoomContents extends AreaContents {
  /** Every entity the area holds, shown or not. */
  readonly members: readonly string[];
}
const NOTHING: RoomContents = {
  entities: [],
  controls: [],
  on: 0,
  climate: {},
  keptOut: 0,
  members: [],
};

/** A reading's field: a sensor of its class, or the thermostat (the humidifier) that carries it (`climateAttribute`). */
const readingField = (kind: ClimateKind, ...domain: string[]): HaFormSchemaItem => ({
  name: `${kind}_entity`,
  selector: { entity: { filter: [{ domain: 'sensor', device_class: kind }, { domain }] } },
});

/**
 * A room of the house, from its area: what the registry knows of it (its picture, its climate) and what it holds
 * (its lights and controls, how many are on), in the ambient family's area anatomy.
 */
export class FluvyRoomCard extends FluvyTileCard {
  static override layoutHeight(config: RoomCardConfig, hass?: HomeAssistant): number {
    if (config.variant === 'row') return 76;
    // the house says what the room holds: its rows (the lights, the climate, the media, then every device: four
    // where the house is not there to say), its tiles (its controls, four at most), its readouts (the climate it
    // reads and its count), its picture (the photo card where the area has one, else the tile); a room with nothing
    // to show is the panel (an administrator reads why under it) where the rest would be
    const areaId = typeof config.area === 'string' ? config.area : '';
    const area = areaId && hass?.states ? hass.areas?.[areaId] : undefined;
    const found = area && hass ? areaContents(hass, areaId) : undefined;
    const climate = config.show_climate === false ? {} : (found?.climate ?? {});
    const empty =
      found !== undefined &&
      !holdsSomething({ entities: found.entities, climate }) &&
      !(config.controls === 'tiles' && (config.tiles?.length ?? found.controls.length) > 0);
    const hint = hass?.user?.is_admin && (found?.keptOut ?? 0) > 0 ? 32 : 0;
    const has = (domain: string): number =>
      found?.entities.some((id) => id.startsWith(`${domain}.`)) ? 1 : 0;
    const rows = found ? has('light') + has('climate') + has('media_player') + 1 : 4;
    const tiles = Math.max(
      1,
      Math.min(TILES, config.tiles?.length ?? found?.controls.length ?? TILES),
    );
    const controls = empty
      ? 16 + EMPTY + hint
      : config.controls === 'none'
        ? 0
        : config.controls === 'tiles'
          ? 16 + rowsOf(tiles, 2) * (INNER + 8) - 8
          : 16 + ROW * rows;
    const variant =
      config.variant ?? (config.picture || !found || area?.picture ? 'photo' : 'tile');
    if (variant === 'tile') return 20 + 44 + controls + 20;
    // the readouts 20 under the hero: the climate the room reads, its count of devices on
    const readings =
      (config.show_climate !== false && (climate.temperature || climate.humidity) ? 1 : 0) +
      (config.show_count !== false && (found?.entities.length ?? 1) ? 1 : 0);
    const stats = !empty && readings ? STATS : 0;
    return HERO + stats + (empty ? 20 + EMPTY + hint : controls) + 20;
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
      /* a row's title is a word, not a name ("Todos los dispositivos"): it takes a second line rather than lose its end */
      .am-rows .fv-row__title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        white-space: normal;
      }
    `,
  ];

  /** The line, the readouts, the rows and the hint are fitted in the card's own classes (its ruler, again when a font lands). */
  private readonly headFit = new HeadFit(this);

  static override base: readonly BaseKey[] = [
    'name',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
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
    'light_colors',
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
  /** What the editor shows where the config says nothing: what the card does then — its variant, the readings it found. */
  static override defaults: EditorDefaults = (config, hass) => {
    const area = hass?.areas?.[String(config['area'] ?? '')];
    const found = hass && area ? areaClimate(hass, area.area_id) : {};
    return {
      variant: config['picture'] || area?.picture ? 'photo' : 'tile',
      controls: 'rows',
      size: 'large',
      show_count: true,
      show_climate: true,
      tint: 'on',
      light_colors: lightDefaults().colors,
      temperature_entity: found.temperature,
      humidity_entity: found.humidity,
    };
  };
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        areaField(),
        nameIconFields(),
        showIconField(),
        fieldRow(
          selectField('variant', ['photo', 'tile', 'row']),
          selectField('controls', ['rows', 'tiles', 'none']),
        ),
        fieldRow(boolField('show_climate'), boolField('show_count')),
        fieldRow(textField('picture'), textField('path')),
        fieldRow(
          readingField('temperature', 'climate'),
          readingField('humidity', 'climate', 'humidifier'),
        ),
        fieldRow(selectField('size', ['large', 'compact', 'mini']), {
          name: 'readouts',
          selector: { entity: { multiple: true } },
        }),
        ...colourFields(),
        fieldRow(tintField(), boolField('light_colors')),
        fieldRow(actionField('tap_action'), actionField('hold_action')),
      ],
      ...formLabels({
        temperature_entity: 'editor.temperature_entity',
        humidity_entity: 'editor.humidity_entity',
      }),
    };
  }

  static override getStubConfig(hass: unknown, entities: readonly string[]): RoomCardConfig {
    const house = hass as Registries | undefined;
    // the first room, in the house's order, with something to show
    const areas = house?.states ? areasInOrder(house) : [];
    const area =
      areas.find((room) => house && holdsSomething(areaContents(house, room.area_id))) ?? areas[0];
    const light = entities.find((id) => id.startsWith('light.'));
    return {
      type: 'custom:fluvy-room-card',
      area: area?.area_id ?? '',
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

  private held?: {
    readonly hass: HomeAssistant;
    readonly config: RoomCardConfig;
    readonly contents: RoomContents;
  };

  /** The room as drawn, worked out once a house and config (the watch, the line, the readouts and the tiles read it). */
  private contents(): RoomContents {
    const { hass, room } = this;
    if (!hass || !room) return NOTHING;
    if (this.held?.hass === hass && this.held.config === room) return this.held.contents;
    const found = areaContents(hass, room.area);
    const contents: RoomContents = {
      ...found,
      on: found.entities.filter((id) => isActive(this.entity(id))).length,
      climate: {
        temperature: room.temperature_entity ?? found.climate.temperature,
        humidity: room.humidity_entity ?? found.climate.humidity,
      },
      members: areaIndex(hass).get(room.area) ?? [],
    };
    this.held = { hass, config: room, contents };
    return contents;
  }

  /** The tiles the room offers: those asked for, else its lights then its other controls, four at most. */
  private tiles(): TileItem[] {
    const asked = this.room?.tiles;
    if (asked?.length) return asked.slice(0, TILES);
    return this.contents()
      .controls.slice(0, TILES)
      .map((entity) => ({ entity }));
  }

  /** Whether the card would draw nothing of the room: nothing it shows, no reading it gives, no tile asked for. */
  private empty(): boolean {
    const { entities, climate } = this.contents();
    return (
      !holdsSomething({ entities, climate: this.room?.show_climate === false ? {} : climate }) &&
      !(this.room?.controls === 'tiles' && this.tiles().length > 0)
    );
  }

  protected override watched(): readonly string[] {
    const { members, climate } = this.contents();
    // every entity the area holds, shown or not: one whose state comes late fills the room, a hidden one moves the hint
    return idsOf([...members, ...this.tiles(), climate.temperature, climate.humidity]);
  }

  /** A reading as the readouts write it — a sensor's state, a thermostat's own — or undefined where it cannot be read. */
  private reading(id: string, kind: ClimateKind): ValueParts | undefined {
    const view = this.entity(id);
    if (!isUsable(view)) return undefined;
    const attribute = climateAttribute(id, kind);
    if (!attribute) return valueParts(this.hass, view);
    const value = numberAttr(view, attribute);
    const degrees = kind === 'temperature';
    // as the thermostat writes its own: a tenth of a degree in the house's unit, a whole percent
    return value === null
      ? undefined
      : {
          value: formatNumber(this.hass, value, { digits: degrees ? 1 : 0 }),
          unit: degrees ? (this.hass?.config.unit_system.temperature ?? '°C') : '%',
        };
  }

  override getCardSize(): number {
    return this.variant === 'row' ? 1 : this.variant === 'tile' ? 4 : 7;
  }
  override getGridOptions(): LovelaceGridOptions {
    // a row in a third of a section left its state line no room (1.9: six, as Home Assistant's own compact cards)
    return this.variant === 'row'
      ? { columns: 6, rows: 'auto', min_columns: 6 }
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

  /**
   * The room's tap and hold, on its photo, its row and its head: its `tap_action`, else where it opens (its path, the
   * area's settings for an admin); its `hold_action`. Each where it can run — a surface that does nothing is no button.
   */
  private roomActions(): { readonly onTap?: () => void; readonly onHold?: () => void } {
    const { tap_action: tap, hold_action: hold, entity } = this.config ?? {};
    const taps = tap ? actionRuns(tap, entity) : this.destination() !== undefined;
    return {
      ...(taps ? { onTap: () => (tap ? this.tap() : this.open()) } : {}),
      ...(actionRuns(hold, entity) ? { onHold: () => this.hold() } : {}),
    };
  }

  /** The state line: "3 of 5 on · 21.4 °C". */
  private roomLine(
    // the compact tile's words by default; the tile variant's head measures its sub in its own class and room
    room = this.width - 32 - (this.width >= 128 ? 44 + 12 : 0),
    cls = 'fv-tile fv-tile--compact > fv-tile__state',
  ): string {
    const { entities: ids, on, climate: readings } = this.contents();
    const count =
      this.room?.show_count !== false && ids.length
        ? counted(this.hass, ids, (id) => this.entity(id))
        : '';
    const climate: Segment[] = [];
    const value =
      this.room?.show_climate !== false && readings.temperature
        ? this.reading(readings.temperature, 'temperature')
        : undefined;
    // a compact surface writes degrees without the unit: "21.4°" (the readouts keep "°C")
    if (value)
      climate.push({
        text: value.unit.startsWith('°')
          ? `${value.value}°`
          : `${value.value} ${value.unit}`.trim(),
        optional: true,
      });
    // the compact tile's words have its width less its 16 px sides, and less its circle and gap where it keeps one
    // (128 and wider: tiles.css)
    const width = (text: string): number => this.headFit.ruler.width(cls, text);
    // the count stays, the climate leaves first; then the count in figures ("3/5") where its words would be cut, the
    // tile's fill already saying that something is on — or, with nothing on, the word for it ("3 appareils" in half a
    // section is "Éteint")
    const worded = fitLine([...(count ? [{ text: count }] : []), ...climate], room, width);
    return count && width(worded) > room
      ? fitLine(
          [{ text: on > 0 ? `${on}/${ids.length}` : this.t('common.off') }, ...climate],
          room,
          width,
        )
      : worded;
  }

  private renderStats(): TemplateResult | typeof nothing {
    const { entities: ids, on, climate: readings } = this.contents();
    const climate = this.room?.show_climate !== false;
    const count = this.room?.show_count !== false;
    const stats: { label: string; value: string; unit: string }[] = [];
    for (const kind of ['temperature', 'humidity'] as const) {
      const id = readings[kind];
      if (!climate || !id) continue;
      const parts = this.reading(id, kind) ?? { value: '—', unit: '' };
      stats.push({ label: s(this.hass, kind), value: parts.value, unit: parts.unit });
    }
    if (count && ids.length)
      stats.push({
        label: s(this.hass, 'devices_on'),
        value: formatNumber(this.hass, on, { digits: 0 }),
        unit: s(this.hass, 'of', { count: ids.length }),
      });
    if (!stats.length) return nothing;
    // three readouts in the column while every label and figure holds in its third, else fewer columns (a shorter last
    // row takes the whole row); the size the widest figure still fits (s → xs)
    const { columns, size, odd } = statsRow(this.headFit.ruler, this.contentWidth, stats);
    return html`<div
      class="am-area__stats ${odd ? 'fv-cols--odd' : ''}"
      data-align="center"
      style="--am-stats:${columns}"
    >
      ${stats.map((stat) => readout({ ...stat, size }))}
    </div>`;
  }

  /** The category rows: the lights, the climate, the media, then every device. */
  private renderRows(): TemplateResult | typeof nothing {
    const { entities: ids } = this.contents();
    if (!this.hass || !ids.length) return nothing;
    const to = this.destination();
    const lights = ids.filter((id) => id.startsWith('light.'));
    const climate = ids.find((id) => id.startsWith('climate.'));
    const player = ids.find((id) => id.startsWith('media_player.'));
    const unavailable = ids.filter((id) => !isUsable(this.entity(id))).length;
    const rows: (readonly [glyph: string, title: string, sub: string, tone: Tone])[] = [
      ...(lights.length
        ? [
            [
              'bulb',
              this.t('strategy.lights'),
              counted(this.hass, lights, (id) => this.entity(id)),
              'light',
            ] as const,
          ]
        : []),
      ...(climate
        ? [
            [
              'thermo',
              this.t('strategy.climate'),
              stateText(this.hass, this.entity(climate)),
              'heat',
            ] as const,
          ]
        : []),
      ...(player
        ? [
            [
              'speaker',
              this.t('strategy.media'),
              stateText(this.hass, this.entity(player)),
              'neutral',
            ] as const,
          ]
        : []),
      [
        'grid',
        s(this.hass, 'all_devices'),
        unavailable
          ? plural(this.hass, 'room.unavailable', unavailable, { count: unavailable })
          : counted(this.hass, ids, (id) => this.entity(id)),
        'neutral',
      ],
    ];
    // a column too narrow for a word beside its chevron (its 44) gives every row's circle to the words, as every list does
    const keep = this.headFit.rowsKeepIcon(
      this.contentWidth,
      rows.map(([, title]) => ({ title, value: '', end: to ? 44 : 0 })),
    );
    // the lights' row wears the colour of what is lit (by brightness; `light_colors`, the house's where the card says
    // none), unless the card has a colour or a tone of its own
    const glow =
      !this.room?.color && !this.room?.tone && (this.room?.light_colors ?? lightDefaults().colors)
        ? meanHex(lights.map((id) => this.entity(id)))
        : undefined;
    return html`<div class="am-rows">
      ${rows.map(([glyph, title, sub, tone]) =>
        listRow({
          icon: keep ? glyph : null,
          tone,
          ...(tone === 'light' && glow ? { accent: this.accents.item(glow) } : {}),
          title,
          sub,
          trailing: to ? 'chevron' : 'none',
          ...(to ? { onTap: () => this.open() } : {}),
        }),
      )}
    </div>`;
  }

  /** Under the readouts: the rows, where the room shows something; the tiles, which may be asked for in any room. */
  private renderControls(): TemplateResult | typeof nothing {
    const controls = this.room?.controls ?? 'rows';
    if (controls === 'none') return nothing;
    if (controls === 'rows') return this.renderRows();
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
    return html`<div class="rm-hero">
      ${picture ? this.photo.render() : nothing}
      ${picture ? html`<span class="rm-hero__scrim" data-measure="skip"></span>` : nothing}
      ${this.renderBadge(name, glyph)} ${this.roomCover(name)}
    </div>`;
  }

  /**
   * The name pill, 20 in from the hero's sides: the glyph and the name where both hold, else the name alone (the
   * head's order: the glyph gives way first), else a pill as wide as the hero allows with the name to its ellipsis.
   */
  private renderBadge(name: string, glyph: string): TemplateResult {
    const room = this.contentWidth;
    const holds = (pad: number): boolean =>
      this.headFit.ruler.pill('am-area__badge', name, pad) <= room;
    // the pill's own 28 (`data-fit`), and with the glyph its 20 and the 8 after it
    if (holds(28))
      return html`<span class="am-area__badge" data-fit="28"
        >${holds(28 + 28) ? icon(glyph) : nothing}${name}</span
      >`;
    return html`<span class="am-area__badge is-cut" style="width:${Math.floor(room / 4) * 4}px"
      ><span class="fv-chip__name">${name}</span></span
    >`;
  }

  /** The room's button, laid over its photo or its row (nothing where neither its tap nor its hold can run). */
  private roomCover(name: string): TemplateResult | typeof nothing {
    const { onTap, onHold } = this.roomActions();
    return onTap || onHold ? pressCover(name, onTap, onHold) : nothing;
  }

  /**
   * An empty room's panel, where its readouts and controls would be; an administrator also reads why, when the area
   * keeps entities out ("2 hidden or diagnostic entities · choose its sensors in the area's settings") — the way out
   * leaving first where the hint would run past three lines, the whole hint where even the why would (the panel
   * stays a panel, not a page of words).
   */
  private renderNothing(): TemplateResult {
    const { keptOut } = this.contents();
    const room = Math.min(HINT, this.contentWidth - HINT_SIDES) * HINT_LINES;
    // the hint's whole line, in the panel line's class — the hint's own type (14/500) without its 380 measure, which
    // a ruler's probe would keep: every long hint then measured 381 and "fitted" three lines it ran past
    const width = (text: string): number => this.headFit.ruler.width('fv-empty-state__text', text);
    const hint =
      keptOut > 0 && this.hass?.user?.is_admin
        ? fitLine(
            s(this.hass, keptOut === 1 ? 'kept_out_one' : 'kept_out', { n: keptOut })
              .split(' · ')
              .map((text, index) => ({ text, optional: index > 0 })),
            room,
            width,
          )
        : '';
    return emptyState('home', s(this.hass, 'nothing'), width(hint) <= room ? hint : '');
  }

  protected override renderCard(): TemplateResult {
    const area = this.area();
    if (!area || !this.hass) return this.renderEmpty(s(this.hass, 'no_area'));
    const name = this.config?.name ?? area.name;
    const glyph = this.config?.icon ?? area.icon ?? 'home';
    const { on } = this.contents();
    const variant = this.variant;
    const to = this.destination();
    const { onTap, onHold } = this.roomActions();

    if (variant === 'row') {
      const line = this.roomLine();
      return html`<article
        class="fv-tile fv-tile--compact fv-tile--accent fv-tile--tap rm-tile ${on ? 'is-on' : ''}"
        data-card
      >
        ${this.renderIco(glyph, on > 0)}
        <div class="fv-tile__text">
          <h3 class="fv-tile__name">${name}</h3>
          <p class="fv-tile__state">${line || s(this.hass, 'nothing')}</p>
        </div>
        ${this.roomCover(name)}
      </article>`;
    }

    // an empty room keeps its anatomy, its way in and its actions: the panel stands where the rest would be
    const empty = this.empty();
    if (variant === 'tile') {
      // the head's rule (`show_icon`): the circle gives way where that makes the name whole beside the chevron, which
      // takes 48 of the line — its 44 and the 12 before it, less the 8 its ink stands past the column edge
      const fitted = this.headFit.fit({
        width: this.contentWidth,
        title: name,
        trailing: to ? 36 : 0,
      });
      return html`<article class="fv-card am-card" data-card>
        ${head({
          icon: fitted.icon ? glyph : null,
          tone: on ? 'accent' : 'neutral',
          title: name,
          name: true,
          cut: fitted.cut,
          // the head's line: its room is the column less the circle and its gap and the chevron's 48
          sub: this.roomLine(
            this.contentWidth - (fitted.icon ? 56 : 0) - (to ? 48 : 0),
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
          onTap,
          onHold,
        })}
        ${empty ? this.renderNothing() : this.renderControls()}
      </article>`;
    }

    return html`<article class="fv-card am-card am-card--area" data-card>
      ${this.renderHero(name, glyph)}
      ${empty ? this.renderNothing() : html`${this.renderStats()} ${this.renderControls()}`}
    </article>`;
  }

  private renderIco(glyph: string, on: boolean): TemplateResult {
    return html`<span class="fv-ico fv-ico--${on ? 'accent' : 'neutral'}" data-icon
      >${icon(glyph)}</span
    >`;
  }
}
