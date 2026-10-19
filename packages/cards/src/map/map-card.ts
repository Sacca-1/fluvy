import {
  formatNumber,
  navigate,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { chips, head, icon, round, sheetStyles, type ChipItem } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { renderAvatar, type Presence } from '../shared/avatar.js';
import { HeadFit } from '../energy/head.js';
import { mapHead, mapRow } from '../shared/map-head.js';
import { Card, type BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  numberField,
  selectField,
  showIconField,
  textField,
} from '../shared/form.js';
import { EMPTY, entryCount, HEAD, ROW } from '../shared/heights.js';
import {
  EMPTY_KEYS,
  emptyPanel,
  idsOf,
  listOf,
  type EmptyList,
  type EntityEntry,
} from '../shared/lists.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import {
  distanceFromHome,
  groupByZone,
  whereIs,
  type Placed,
  type ZoneSpec,
} from '../shared/zones.js';

const s = strings('map');

export type MapVariant = 'map' | 'zones' | 'rows';

export interface MapCardConfig extends FluvyCardConfig, EmptyList {
  title?: string;
  /** `person.*` and `device_tracker.*`: ids, or objects naming one. */
  entities?: readonly EntityEntry[];
  /** The zones to show, in this order; default: the house's, by name. */
  zones?: ReadonlyArray<string | ZoneSpec>;
  /** `map`: Home Assistant's map on a plate (tiles from the internet, as its own map card). `zones`: columns, no request. `rows`: a row a person. */
  variant?: MapVariant;
  map_shape?: 'wide' | 'square';
  hours_to_show?: number;
  default_zoom?: number;
  fit_zones?: boolean;
  /** A zone with nobody in it still shows. */
  show_empty?: boolean;
  /** How far from home someone away is (from `zone.home`, never their position). */
  show_distance?: boolean;
  /** Where the map button goes (default `/map`). */
  map_path?: string;
  _now?: string;
}

/** Zone columns: 20 + a 44 head + 16 + a column of 128 (a 44 icon, 12, a label, 12, a stack of 44) + 20. */
const ZONES_HEIGHT = 228;
/** A stack shows two faces; three or more fold to one face and a "+N" disc, so a column stays 80 wide. */
const FACES = 2;
/** A zone column: two faces overlapping by 8. */
const COLUMN = 80;

type MapElement = HTMLElement & {
  hass?: HomeAssistant;
  setConfig?: (config: LovelaceCardConfig) => void;
};

/**
 * Where everyone is: Home Assistant's own map on a plate (`map`), the house's zones as columns with the faces in
 * each (`zones`, nothing fetched), or a row a person (`rows`). Who is away stands in the head; the map button
 * goes to Home Assistant's map page.
 */
export class FluvyMapCard extends Card<MapCardConfig> {
  static override layoutHeight(config: MapCardConfig): number {
    const people = entryCount(config, ['entities']);
    if (!people) return HEAD + EMPTY;
    if (config.variant === 'rows') return HEAD + ROW * people;
    if (config.variant === 'map') return HEAD + (config.map_shape === 'square' ? 360 : 224) + 60;
    return ZONES_HEIGHT;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.ambient,
    sheetStyles.rooms,
    css`
      .mp-plate {
        margin-top: 16px;
      }
      .mp-plate > * {
        position: absolute;
        inset: 0;
      }
    `,
  ];

  static override properties = { ...Card.properties, mapFailed_: { state: true } };
  /** Home Assistant's map card could not be made here: the zones stand in, silently. */
  declare mapFailed_: boolean;
  private readonly head = new HeadFit(this);
  private mapElement: MapElement | undefined;
  private mapDark: boolean | undefined;

  constructor() {
    super();
    this.mapFailed_ = false;
  }

  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<MapCardConfig>()([
    'title',
    'zones',
    'variant',
    'map_shape',
    'hours_to_show',
    'default_zoom',
    'fit_zones',
    'show_empty',
    'show_distance',
    'map_path',
    ...EMPTY_KEYS,
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'zones',
      title: 'editor.zones',
      domains: ['zone'],
      keys: ['entity', 'name', 'icon'],
      schema: [entityField(['zone']), nameIconFields()],
    },
  ];
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'zones',
    map_shape: 'wide',
    fit_zones: false,
    show_empty: false,
    show_distance: false,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entitiesField('entities', ['person', 'device_tracker'], true),
        entitiesField('zones', ['zone']),
        fieldRow(textField('title'), iconField()),
        showIconField(),
        fieldRow(
          selectField('variant', ['zones', 'map', 'rows']),
          selectField('map_shape', ['wide', 'square']),
        ),
        fieldRow(numberField('hours_to_show', 0, 168), numberField('default_zoom', 1, 20)),
        fieldRow(boolField('fit_zones'), boolField('show_empty')),
        fieldRow(boolField('show_distance'), textField('map_path')),
        ...colourFields(),
        emptyFields(),
        actionFields(),
      ],
      ...formLabels({ hours_to_show: 'editor.hours', map_path: 'editor.map_path' }),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): MapCardConfig {
    return {
      type: 'custom:fluvy-map-card',
      entities: entities.filter((id) => id.startsWith('person.')).slice(0, 4),
    };
  }

  protected override prepare(config: MapCardConfig): MapCardConfig {
    listOf(config, 'entities');
    return config;
  }

  private get variant(): MapVariant {
    const asked = this.config?.variant;
    return asked === 'map' || asked === 'rows' ? asked : 'zones';
  }

  private zoneSpecs(): ZoneSpec[] {
    return (this.config?.zones ?? []).map((zone) =>
      typeof zone === 'string' ? { entity: zone } : zone,
    );
  }

  protected override watched(): readonly string[] {
    return [
      ...idsOf(this.config?.entities),
      ...this.zoneSpecs().map((zone) => zone.entity),
      'zone.home',
    ];
  }

  override getCardSize(): number {
    return this.variant === 'rows' ? 1 + idsOf(this.config?.entities).length : 4;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** The house's zones: those asked for, else every `zone.*` the house has. */
  private zones(): EntityView[] {
    const asked = this.zoneSpecs();
    if (asked.length)
      return asked
        .map((zone) => this.entity(zone.entity))
        .filter((zone) => zone.status !== 'missing');
    const ids = Object.keys(this.hass?.states ?? {}).filter((id) => id.startsWith('zone.'));
    return ids.map((id) => this.entity(id));
  }

  private people(): Placed[] {
    const zones = this.zones();
    return idsOf(this.config?.entities).map((id) => whereIs(this.entity(id), zones));
  }

  private presence(person: Placed): Presence {
    return person.where === 'home' ? 'home' : person.where === 'unknown' ? 'off' : 'away';
  }

  private picture(person: Placed): string {
    const picture =
      person.view.status === 'ok' ? (person.view.attr<string | null>('entity_picture') ?? '') : '';
    return picture && this.hass ? this.hass.hassUrl(picture) : '';
  }

  private broken_ = new Set<string>();
  private avatar(person: Placed): TemplateResult {
    return renderAvatar({
      name: person.view.name,
      picture: this.picture(person),
      presence: this.presence(person),
      broken: this.broken_,
      onBroken: (failed) => {
        this.broken_ = new Set([...this.broken_, failed]);
        this.requestUpdate();
      },
    });
  }

  /** Where someone is, in words: the zone's name, "Away", "Unknown"; with the distance when asked. */
  private wordFor(person: Placed, withDistance = this.config?.show_distance ?? false): string {
    const word =
      person.where === 'home'
        ? this.t('person.home')
        : person.where === 'unknown'
          ? s(this.hass, 'unknown')
          : person.where === 'zone'
            ? this.zoneName(person.zone ?? '')
            : this.t('person.away');
    if (!withDistance) return word;
    const distance = distanceFromHome(
      this.hass,
      person,
      this.hass?.states['zone.home'] ? this.entity('zone.home') : undefined,
    );
    return distance
      ? `${word} · ${s(this.hass, distance.unit, { distance: formatNumber(this.hass, distance.value, { digits: distance.value < 5 ? 1 : 0 }) })}`
      : word;
  }

  private zoneName(zoneId: string): string {
    const spec = this.zoneSpecs().find((zone) => zone.entity === zoneId);
    return spec?.name ?? this.entity(zoneId).name;
  }

  private goToMap(): void {
    navigate(this.config?.map_path ?? '/map');
  }

  /* ---------- Home Assistant's map ---------- */

  private plateHeight(): number {
    const w = this.contentWidth;
    return this.config?.map_shape === 'square'
      ? Math.round(w / 4) * 4
      : Math.round(w / 1.6 / 4) * 4;
  }

  private mapConfig(): LovelaceCardConfig {
    const c = this.config;
    return {
      type: 'map',
      entities: idsOf(c?.entities),
      ...(c?.hours_to_show !== undefined ? { hours_to_show: c.hours_to_show } : {}),
      ...(c?.default_zoom !== undefined ? { default_zoom: c.default_zoom } : {}),
      ...(c?.fit_zones !== undefined ? { fit_zones: c.fit_zones } : {}),
      auto_fit: true,
      theme_mode: this.dark ? 'dark' : 'light',
    };
  }

  /** Home Assistant's map card, made once through its card helpers; when they are not there, the zones stand in. */
  private async makeMap(): Promise<void> {
    if (this.mapElement || this.mapFailed_) return;
    try {
      const helpers = (await window.loadCardHelpers?.()) as
        { createCardElement?: (config: LovelaceCardConfig) => MapElement } | undefined;
      const element = helpers?.createCardElement?.(this.mapConfig());
      if (!element) throw new Error('no card helpers');
      if (this.rawHass) element.hass = this.rawHass;
      this.mapElement = element;
      this.mapDark = this.dark;
      this.requestUpdate();
    } catch {
      this.mapFailed_ = true;
    }
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    // Home Assistant's map is made for someone to show on it
    if (this.variant !== 'map' || !idsOf(this.config?.entities).length) return;
    if (!this.mapElement) {
      void this.makeMap();
      return;
    }
    if (changed.has('hass') && this.rawHass) this.mapElement.hass = this.rawHass;
    if (changed.has('dark') && this.mapDark !== this.dark) {
      this.mapDark = this.dark;
      this.mapElement.setConfig?.(this.mapConfig());
    }
  }

  /* ---------- render ---------- */

  /** A zone's word: home, away, unknown, or the zone's own name. */
  private zoneLabel(group: { where: string; key: string }): string {
    return group.where === 'home'
      ? this.t('person.home')
      : group.where === 'away'
        ? this.t('person.away')
        : group.where === 'unknown'
          ? s(this.hass, 'unknown')
          : this.zoneName(group.key);
  }

  private renderZones(people: readonly Placed[]): TemplateResult {
    // where nobody can be placed (every tracker out of reach), the places they could be keep their columns, empty,
    // beside the faces that cannot be placed: the card stands as it does with its people spread (1.9)
    const nobody = people.length > 0 && people.every((person) => person.where === 'unknown');
    const groups = groupByZone(
      people,
      this.zones(),
      this.zoneSpecs(),
      (this.config?.show_empty ?? false) || nobody,
    );
    const labels = groups.map((group) => this.zoneLabel(group));
    // as many columns as the width holds (80 each, four at most), one fewer while a zone's word would leave its
    // column (es "Desconocido" at 1400): whole-pixel columns on the 4 grid, the remainder as the gaps between them
    // (320: 4 × 80, 3 × 104 + 2 × 4)
    let columns = Math.max(1, Math.min(4, Math.floor(this.contentWidth / COLUMN), groups.length));
    const columnWidth = (n: number): number => Math.floor(this.contentWidth / n / 4) * 4;
    while (
      columns > 1 &&
      labels.some(
        (label) => this.head.ruler.width('mp-zone__label', label) > columnWidth(columns) - 8,
      )
    )
      columns -= 1;
    const width = columnWidth(columns);
    const gap = columns > 1 ? (this.contentWidth - columns * width) / (columns - 1) : 0;
    return html`<div
      class="mp-zones"
      data-align="center"
      style="--mp-zones:${columns};--mp-col:${width}px;--mp-gap:${gap}px"
    >
      ${groups.map((group, index) => {
        const glyph =
          group.where === 'home'
            ? 'home'
            : group.where === 'away'
              ? 'away'
              : group.where === 'unknown'
                ? 'person'
                : (this.zoneSpecs().find((zone) => zone.entity === group.key)?.icon ??
                  group.zone?.attr<string | null>('icon') ??
                  'pin');
        const label = labels[index] ?? '';
        const shown = group.people.slice(0, group.people.length > FACES ? 1 : FACES);
        const rest = group.people.length - shown.length;
        return html`<div class="mp-zone" data-target>
          <span
            class="fv-ico fv-ico--${group.where === 'home' ? 'presence' : group.where === 'unknown' ? 'off' : 'neutral'}"
            data-icon
            >${icon(glyph)}</span
          >
          <span class="mp-zone__label">${label}</span>
          <div class="mp-stack ${group.people.length ? '' : 'is-empty'}">
            ${shown.map((person) => html`<button class="mp-face" aria-label=${`${person.view.name} · ${this.wordFor(person)}`} @click=${() => this.tap(person.view.id, { action: 'more-info' })}>${this.avatar(person)}</button>`)}
            ${rest > 0 ? html`<span class="mp-face mp-more">${s(this.hass, 'more', { count: rest })}</span>` : nothing}
          </div>
        </div>`;
      })}
    </div>`;
  }

  /** A row's word with its distance while both hold their 55 % of the row ("Abwesend · 26 km" in a 211 column does not). */
  private rowWord(person: Placed): string {
    const full = this.wordFor(person);
    return this.head.ruler.width('fv-row__value', full) <= this.contentWidth * 0.55
      ? full
      : this.wordFor(person, false);
  }

  private renderRows(people: readonly Placed[]): TemplateResult {
    const w = this.contentWidth;
    const words = people.map((person) => this.rowWord(person));
    // a column too narrow for a name beside its word gives every row's avatar to the names, as every list does
    const keep = this.head.rowsKeepIcon(
      w,
      people.map((person, index) => ({ title: person.view.name, value: words[index] ?? '' })),
    );
    return html`<div class="am-rows">
      ${people.map((person, index) => {
        const open = (): void => this.tap(person.view.id, { action: 'more-info' });
        // a word that would leave the name under 40 even so (pt-BR's "Fora de casa" in a 211 column) is a dash, the
        // word the row's label (the people card's rule)
        const full = words[index] ?? '';
        const word =
          this.head.rowRoom(w, full, { icon: keep }) >=
          Math.min(40, this.head.ruler.width('fv-row__title', person.view.name))
            ? full
            : '—';
        return html`<div
          class="fv-row fv-row--tap ${keep ? '' : 'fv-row--bare'}"
          role="button"
          tabindex="0"
          aria-label=${word === full ? nothing : `${person.view.name} · ${full}`}
          @click=${open}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open();
            }
          }}
        >
          ${keep ? this.avatar(person) : nothing}
          <span class="fv-row__text"
            ><span class="fv-row__title" data-name>${person.view.name}</span></span
          >
          <span class="fv-row__value ${person.where === 'home' ? '' : 'fv-row__value--quiet'}"
            >${word}</span
          >
        </div>`;
      })}
    </div>`;
  }

  /** Under the map: who is where, as chips. */
  private renderWhoWhere(people: readonly Placed[]): TemplateResult {
    const items: ChipItem[] = people.map((person) => ({
      key: person.view.id,
      label: `${person.view.name} · ${this.wordFor(person)}`,
      active: person.where === 'home',
    }));
    return chips(items, (key) => this.tap(key, { action: 'more-info' }), 'mp-who');
  }

  protected renderCard(): TemplateResult {
    const people = this.people();
    const panel = emptyPanel(this, !people.length, 'person', 'common.no_people');
    const away = people.filter((person) => person.where !== 'home');
    const home = people.length - away.length;
    const variant = this.variant === 'map' && this.mapFailed_ ? 'zones' : this.variant;
    // the card's own title where it fits beside the map's round, a shorter one where it does not (as the people
    // card's); a typed one is the user's. Where not even the short one holds beside the round, the round gives way
    // to a row under the body: a control never goes
    const { title, roundFits } = mapHead(
      this.head,
      this.contentWidth,
      [s(this.hass, 'title'), s(this.hass, 'title_short')],
      this.config?.title,
    );
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub: panel ? '' : this.t('people.count', { home, total: people.length }),
      trailing: roundFits ? 44 : 0,
    });
    const open = (): void => this.goToMap();
    return html`<article class="fv-card" data-card>
      ${head({
        // the people are what the card is about; the map is what the round does
        icon: fitted.icon ? (this.config?.icon ?? 'person') : null,
        small: fitted.small,
        tone: home > 0 ? 'accent' : 'neutral',
        title,
        sub: fitted.sub,
        trailing: roundFits ? round('map', 'quiet', this.t('people.map'), open) : nothing,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        panel
          ? html`<div class="am-rows">${panel}</div>`
          : variant === 'map'
            ? html`<div class="fv-plate mp-plate" style="height:${this.plateHeight()}px">
                  ${this.mapElement ?? nothing}
                </div>
                ${this.renderWhoWhere(people)}`
            : variant === 'rows'
              ? this.renderRows(people)
              : this.renderZones(people)
      }
      ${roundFits ? nothing : mapRow(this.hass, this.head, this.contentWidth, open)}
    </article>`;
  }
}
