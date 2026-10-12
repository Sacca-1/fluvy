import type { Tint } from '../shared/colour.js';
import {
  areaEntities,
  formatNumber,
  isActive,
  isUsable,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import {
  chips,
  clickPress,
  head,
  icon,
  preventMenu,
  rulerLabels,
  sheetStyles,
  startPress,
  toggle,
  type ChipItem,
  type RulerChangeDetail,
  type Tone,
} from '@fluvy/ui';
import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import type { BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { glyphFor } from '../shared/domain.js';
import {
  accentField,
  actionFields,
  areaField,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  selectField,
  textField,
  tintField,
} from '../shared/form.js';
import { rowsOf } from '../shared/heights.js';
import { bulbHex, DIMMABLE } from '../shared/light.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { FluvyTileCard } from '../tile/tile-card.js';
import { fittedColumns } from '../shared/chips.js';

const s = strings('lights');

export type LightsVariant = 'row' | 'chips' | 'tiles';
export const LIGHTS_VARIANTS: readonly LightsVariant[] = ['row', 'chips', 'tiles'];

/** One light of the room: its own name, icon and colour beside the entity's. */
export interface LightItem {
  entity: string;
  name?: string;
  icon?: string;
  /** The light's own colour when it is on (a Home Assistant colour name or `#rrggbb`), over its bulb's. */
  color?: string;
}

export interface LightsCardConfig extends FluvyCardConfig {
  /** The room: its lights, in name order, when `lights` lists none. */
  area?: string;
  /** `tiles`: each lamp shows its colour at rest too (`always`), or only when on (`on`, the default). */
  tint?: Tint;
  /** The lights, in the order they are drawn (default: the area's). */
  lights?: readonly (string | LightItem)[];
  /**
   * `row` (default): the room on one line, each light a round beside its name — the card's tap is the whole room.
   * `chips`: the room's switch in the head, each light a chip with its name. `tiles`: each light a compact tile.
   */
  variant?: LightsVariant;
  /** "2 of 3 on" in the second line (default). */
  show_count?: boolean;
  /** The lights' level: the average in the second line, each round's ring (default). */
  show_level?: boolean;
  /** One brightness ruler for the room, under the head (chips and tiles). */
  show_brightness?: boolean;
  /** A light that is on wears its bulb's own colour when it has one (default); off: the palette's light. */
  light_colors?: boolean;
}

/** A round and the gap between rounds. */
const ROUND = 44;
const ROUND_GAP = 8;
/** What the room's name keeps beside its rounds before they take their own line. */
const MIN_TITLE = 96;
/** An inner tile (a compact tile inside a card) is 84 tall. */
const INNER = 84;
/** A filled chip row's line: the 36 pill in its 44 target, the lines touching. */
const CHIP_LINE = 44;
/** The room's ruler: 16 above it, the ruler (44) and its labels (20). */
const RULER = 80;
/** An inner tile narrower than this has no room for its circle and a name: the tiles take one a row. */
const TILE_MIN = 120;

/** The columns a row of light chips may take, most first: every line as full as the count allows. */
const chipCandidates = (count: number): number[] =>
  count <= 2 ? [count, 1] : count === 3 ? [3, 2, 1] : count === 4 ? [4, 2, 1] : [3, 2, 1];

/** One light as the card reads it. */
interface Lamp {
  readonly item: LightItem;
  readonly view: EntityView;
  readonly name: string;
  readonly glyph: string;
  readonly usable: boolean;
  readonly on: boolean;
  /** Its level in %, when it is on and dims. */
  readonly level: number | null;
  /** The colour it wears when on (`data-accent`), or none: the tone's own. */
  readonly accent: string | undefined;
}

const itemOf = (raw: string | LightItem): LightItem =>
  typeof raw === 'string' ? { entity: raw } : raw;

/**
 * A room's lights on one card: the whole room is one tap (on when every light is off, off when any is on), and each
 * light is its own control — a round on the room's line, a chip with its name, or a compact tile — that a tap turns
 * on and off and a hold opens. A light that is on wears its bulb's own colour, and its round a ring of its level.
 */
export class FluvyLightsCard extends FluvyTileCard {
  static override layoutHeight(config: LightsCardConfig): number {
    const n = Math.max(1, config.lights?.length ?? 3);
    const ruler = config.show_brightness ? RULER : 0;
    if (config.variant === 'tiles')
      return 20 + 44 + ruler + 16 + rowsOf(n, 2) * (INNER + 8) - 8 + 20;
    if (config.variant === 'chips') return 20 + 44 + ruler + 16 + rowsOf(n, 2) * CHIP_LINE + 20;
    // a 320 column holds four rounds beside the name (the icon gives way); more take their own line, six a line
    return (n <= 4 ? 84 : 20 + 44 + 16 + rowsOf(n, 6) * (ROUND + 8) - 8 + 20) + ruler;
  }

  static override styles: CSSResultGroup = [
    ...(FluvyTileCard.styles as CSSResultGroup[]),
    sheetStyles.rooms,
    css`
      .lt-card {
        width: auto;
      }
    `,
  ];

  private readonly head = new HeadFit(this);

  static override base: readonly BaseKey[] = [
    'name',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<LightsCardConfig>()([
    'area',
    'lights',
    'variant',
    'show_count',
    'show_level',
    'show_brightness',
    'light_colors',
    'tint',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'lights',
      title: 'lights.editor_lights',
      domains: ['light'],
      keys: ['entity', 'name', 'icon', 'color'],
      schema: [entityField(['light']), fieldRow(textField('name'), iconField()), accentField()],
    },
  ];
  static override aliases: AliasSpec = {
    keys: [{ from: 'entities', to: 'lights' }],
    items: { lights: ITEM_ALIASES },
  };
  static override defaults: EditorDefaults = () => ({
    variant: 'row',
    show_count: true,
    show_level: true,
    show_brightness: false,
    light_colors: true,
    tint: 'on',
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        areaField(),
        nameIconFields(),
        fieldRow(selectField('variant', LIGHTS_VARIANTS), boolField('show_brightness')),
        fieldRow(boolField('show_count'), boolField('show_level')),
        boolField('light_colors'),
        ...colourFields(),
        tintField(),
        actionFields(),
      ],
      ...formLabels({
        show_level: 'lights.editor_show_level',
        show_brightness: 'lights.editor_show_brightness',
        light_colors: 'lights.editor_light_colors',
        // the tiles' colour at rest: the row and the chips have no surface to wash
        tint: 'lights.editor_tint',
      }),
    };
  }

  static override getStubConfig(hass: unknown, entities: readonly string[]): LightsCardConfig {
    const lights = entities.filter((id) => id.startsWith('light.')).slice(0, 3);
    const registry = hass as { areas?: Record<string, { area_id: string }> } | undefined;
    const area = registry?.areas ? Object.keys(registry.areas)[0] : undefined;
    return lights.length
      ? { type: 'custom:fluvy-lights-card', lights }
      : { type: 'custom:fluvy-lights-card', ...(area ? { area } : {}) };
  }

  protected override prepare(config: LightsCardConfig): LightsCardConfig {
    if (!config.area && !config.lights?.length)
      throw new Error('fluvy-lights-card: give it an "area" or a list of "lights"');
    return config;
  }

  private get room(): LightsCardConfig | undefined {
    return this.config as LightsCardConfig | undefined;
  }

  private get variant(): LightsVariant {
    const asked = this.room?.variant;
    return asked && LIGHTS_VARIANTS.includes(asked) ? asked : 'row';
  }

  /** The lights asked for, else the area's in name order. */
  private items(): LightItem[] {
    const asked = this.room?.lights;
    if (asked?.length) return asked.map(itemOf).filter((item) => Boolean(item.entity));
    const area = this.room?.area;
    if (!area || !this.hass) return [];
    return areaEntities(this.hass, area, { domains: ['light'] })
      .map((entity) => ({ entity, name: this.entity(entity).name }))
      .sort((a, b) => a.name.localeCompare(b.name, this.hass?.language))
      .map(({ entity }) => ({ entity }));
  }

  protected override watched(): readonly string[] {
    return this.items().map((item) => item.entity);
  }

  override getCardSize(): number {
    return this.variant === 'row' ? 1 : 3;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: this.variant === 'row' ? 4 : 6 };
  }

  /** Each light as drawn: on as the finger left it until Home Assistant agrees, its level, its colour. */
  private lamps(): Lamp[] {
    const colours = this.room?.light_colors !== false;
    return this.items().map((item) => {
      const view = this.entity(item.entity);
      const usable = isUsable(view);
      const state = this.stateOf(view);
      const on = usable && (state === view.state ? isActive(view) : state === 'on');
      const raw = view.attr<number | null>('brightness');
      const modes = view.attr<string[]>('supported_color_modes') ?? [];
      const dims = modes.some((m) => DIMMABLE.has(m));
      const level =
        on && dims && typeof raw === 'number' ? Math.max(1, Math.round((raw / 255) * 100)) : null;
      // its own colour, else its bulb's (a coloured bulb, not a white one), else the palette's light
      const bulb = colours ? bulbHex(view, on) : undefined;
      const accent = this.accents.item(item.color || bulb);
      return {
        item,
        view,
        name: item.name ?? view.name,
        // its own icon, else the one Home Assistant gives it (a floor lamp, a ceiling light), else the bulb
        glyph: item.icon ?? view.attr<string>('icon') ?? glyphFor(view),
        usable,
        on,
        level,
        accent,
      };
    });
  }

  /** The tone a light is drawn in when on: its colour (as the accent), else the card's (the light's by default). */
  private toneFor(lamp: Lamp): Tone {
    return lamp.accent ? 'accent' : toneOf(this.config, 'light');
  }

  /** The whole room: every light off when one is on, else every light on. */
  private flipRoom(lamps: readonly Lamp[]): void {
    const usable = lamps.filter((lamp) => lamp.usable);
    if (!usable.length || !this.hass) return;
    const next = !usable.some((lamp) => lamp.on);
    for (const lamp of usable) this.expect(lamp.view.id, next ? 'on' : 'off');
    this.call(
      'light',
      next ? 'turn_on' : 'turn_off',
      { entity_id: usable.map((lamp) => lamp.view.id) },
      '',
    );
  }

  private flipLamp(lamp: Lamp): void {
    if (!lamp.usable) return;
    this.expect(lamp.view.id, lamp.on ? 'off' : 'on');
    this.call('light', lamp.on ? 'turn_off' : 'turn_on', {}, lamp.view.id);
  }

  private openLamp(lamp: Lamp): void {
    this.tap(lamp.view.id, { action: 'more-info' });
  }

  /** The room's level for its ruler: what is on (all of it when nothing is), to the level asked. */
  private setRoom(lamps: readonly Lamp[], value: number): void {
    const usable = lamps.filter((lamp) => lamp.usable);
    const lit = usable.filter((lamp) => lamp.on);
    const targets = (lit.length ? lit : usable).map((lamp) => lamp.view.id);
    if (!targets.length) return;
    for (const id of targets) this.expect(id, value > 0 ? 'on' : 'off');
    if (value <= 0) this.call('light', 'turn_off', { entity_id: targets }, '');
    else this.call('light', 'turn_on', { entity_id: targets, brightness_pct: value }, '');
  }

  /** The average level of what is on and dims, or `null`. */
  private levelOf(lamps: readonly Lamp[]): number | null {
    const levels = lamps.map((lamp) => lamp.level).filter((v): v is number => v !== null);
    return levels.length ? Math.round(levels.reduce((sum, v) => sum + v, 0) / levels.length) : null;
  }

  /** "2 of 3 on · 70 %", "Off", "Unavailable". */
  private line(lamps: readonly Lamp[]): string {
    if (!lamps.some((lamp) => lamp.usable)) return this.t('state.unavailable');
    const on = lamps.filter((lamp) => lamp.on).length;
    if (!on) return this.t('common.off');
    const level = this.room?.show_level !== false ? this.levelOf(lamps) : null;
    return [
      this.room?.show_count !== false
        ? this.t('common.on_of', { on, count: lamps.length })
        : this.t('common.on'),
      level !== null ? `${formatNumber(this.hass, level, { digits: 0 })} %` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected override renderCard(): TemplateResult {
    const lamps = this.lamps();
    const w = this.contentWidth;
    const area = this.room?.area ? this.hass?.areas?.[this.room.area] : undefined;
    const name = this.config?.name ?? area?.name ?? s(this.hass, 'title');
    // the room's own glyph — never a light's, so the room's circle is never taken for one of its lights
    const glyph = this.config?.icon ?? area?.icon ?? 'home';
    if (!lamps.length)
      return html`<article class="fv-card lt-card" data-card>
        ${head({ icon: glyph, tone: 'neutral', title: name, name: true })}
        ${this.head.empty('bulb', s(this.hass, 'no_lights'), s(this.hass, 'no_lights_hint'), w)}
      </article>`;
    const any = lamps.some((lamp) => lamp.on);
    const dead = !lamps.some((lamp) => lamp.usable);
    const tone: Tone = dead ? 'off' : any ? toneOf(this.config, 'light') : 'neutral';
    const sub = this.line(lamps);
    if (this.variant === 'row') return this.renderRow(lamps, name, glyph, tone, sub, w);

    const fitted = this.head.fit({
      width: w,
      title: name,
      sub,
      ...(dead ? {} : { trailing: SWITCH_SLOT }),
    });
    return html`<article class="fv-card lt-card ${dead ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? glyph : null,
        tone,
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: dead
          ? nothing
          : toggle(any, toneOf(this.config, 'light'), () => this.flipRoom(lamps), name),
        onIconTap: () => this.roomTap(lamps),
        ...(this.config?.hold_action ? { onHold: () => this.hold(undefined) } : {}),
      })}
      ${this.room?.show_brightness ? this.renderRuler(lamps, name, w) : nothing}
      ${this.variant === 'tiles' ? this.renderTiles(lamps) : this.renderChips(lamps, w)}
    </article>`;
  }

  /** The card's tap: its own action when it has one, else the whole room on or off. */
  private roomTap(lamps: readonly Lamp[]): void {
    if (this.config?.tap_action) this.tap(undefined);
    else this.flipRoom(lamps);
  }

  /**
   * The room on one line: its icon, its name and how much is on, and a round a light. The room's switch is a button
   * under the whole card (a tap anywhere but on a round or between them); a round is its light's own switch, beside
   * it for a screen reader, never inside it. Rounds that would leave the name less than it needs take their own
   * line, on whole pixels: the first under the room's icon, the last on the card's edge.
   */
  private renderRow(
    lamps: readonly Lamp[],
    name: string,
    glyph: string,
    tone: Tone,
    sub: string,
    w: number,
  ): TemplateResult {
    const rounds = lamps.length * ROUND + (lamps.length - 1) * ROUND_GAP;
    // beside the name while it keeps what it needs — the icon circle gives way first (the head's own rule)
    const title = Math.min(MIN_TITLE, this.head.ruler.width('fv-card__title', name));
    const inline = w - rounds - 12 >= title;
    const fitted = this.head.fit({
      width: w,
      title: name,
      sub,
      ...(inline ? { trailing: rounds } : {}),
    });
    const dead = tone === 'off';
    const acts = !dead || Boolean(this.config?.tap_action);
    const bulbs = inline
      ? html`<div class="lt-bulbs">${lamps.map((lamp) => this.renderBulb(lamp))}</div>`
      : this.renderLine(lamps, w);
    return html`<article
      class="fv-card lt-card lt-card--row ${dead ? 'is-unavailable is-off' : ''}"
      data-card
      role="group"
      aria-label=${name}
    >
      ${
        acts
          ? html`<button
              class="lt-room"
              aria-label=${`${name} · ${sub}`}
              .fvTap=${() => this.roomTap(lamps)}
              .fvHold=${this.config?.hold_action ? () => this.hold(undefined) : undefined}
              @pointerdown=${startPress}
              @click=${clickPress}
              @contextmenu=${preventMenu}
            ></button>`
          : nothing
      }
      ${head({
        icon: fitted.icon ? glyph : null,
        tone,
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: inline ? bulbs : nothing,
      })}
      ${inline ? nothing : bulbs}
      ${this.room?.show_brightness ? this.renderRuler(lamps, name, w) : nothing}
    </article>`;
  }

  /**
   * The rounds on a line of their own: as many a line as the column holds (six at most), the lines balanced, each
   * round on a whole pixel of one set of columns — the first under the head's icon, the last on the content's edge.
   */
  private renderLine(lamps: readonly Lamp[], w: number): TemplateResult {
    const fits = Math.max(1, Math.min(6, Math.floor((w + ROUND_GAP) / (ROUND + ROUND_GAP))));
    const lines = Math.ceil(lamps.length / fits);
    const columns = Math.ceil(lamps.length / lines);
    const x = (i: number): number =>
      columns === 1 ? 0 : Math.round((i * (w - ROUND)) / (columns - 1));
    return html`<div
      class="lt-bulbs lt-bulbs--line"
      style="height:${lines * (ROUND + ROUND_GAP) - ROUND_GAP}px"
    >
      ${lamps.map((lamp, i) =>
        this.renderBulb(
          lamp,
          `left:${x(i % columns)}px;top:${Math.floor(i / columns) * (ROUND + ROUND_GAP)}px`,
        ),
      )}
    </div>`;
  }

  /**
   * A light's round: its glyph; lit, its colour's fill and a ring of its level (all the way round for a light that
   * does not dim, or when the level is not shown); a tap is its switch, a hold its details. One that cannot be read
   * is the dashed ring: it takes no tap, and a hold still opens it.
   */
  private renderBulb(lamp: Lamp, place?: string): TemplateResult {
    const tone: Tone = !lamp.usable ? 'off' : lamp.on ? this.toneFor(lamp) : 'neutral';
    const level = this.room?.show_level !== false && lamp.level !== null ? lamp.level : 100;
    // a press on a round is the round's: it never reaches the room's
    const down = (event: PointerEvent): void => {
      event.stopPropagation();
      startPress(event);
    };
    const click = (event: MouseEvent): void => {
      event.stopPropagation();
      clickPress(event);
    };
    // 4 inside the edge: on the round's fill, where its ink reads in every palette
    const r = ROUND / 2 - 4;
    const length = 2 * Math.PI * r;
    return html`<button
      class="lt-bulb fv-ico fv-ico--${tone} ${lamp.on ? 'is-on' : ''}"
      style=${place ?? nothing}
      data-target
      data-accent=${lamp.on ? (lamp.accent ?? nothing) : nothing}
      role="switch"
      aria-checked=${lamp.on ? 'true' : 'false'}
      aria-disabled=${lamp.usable ? nothing : 'true'}
      aria-label=${lamp.name}
      title=${lamp.name}
      .fvTap=${lamp.usable ? () => this.flipLamp(lamp) : undefined}
      .fvHold=${() => this.openLamp(lamp)}
      @pointerdown=${down}
      @click=${click}
      @contextmenu=${preventMenu}
    >
      ${icon(lamp.glyph)}
      ${
        lamp.on
          ? svg`<svg class="lt-ring" viewBox="0 0 ${ROUND} ${ROUND}" aria-hidden="true"><circle cx=${ROUND / 2} cy=${ROUND / 2} r=${r} stroke-dasharray="${((length * level) / 100).toFixed(2)} ${length.toFixed(2)}"></circle></svg>`
          : nothing
      }
    </button>`;
  }

  /** Each light a chip with its name: a tap turns it on and off, a hold opens it. */
  private renderChips(lamps: readonly Lamp[], w: number): TemplateResult {
    const items: ChipItem[] = lamps.map((lamp) => ({
      key: lamp.view.id,
      label: lamp.name,
      name: true,
      glyph: lamp.glyph,
      active: lamp.on,
      tone: lamp.usable ? this.toneFor(lamp) : 'off',
      ...(lamp.on && lamp.accent ? { accent: lamp.accent } : {}),
      onHold: () => this.openLamp(lamp),
      ...(lamp.usable ? {} : { unavailable: true }),
    }));
    const byKey = new Map(lamps.map((lamp) => [lamp.view.id, lamp]));
    return html`<div class="lt-chips">
      ${chips(
        items,
        (key) => {
          const lamp = byKey.get(key);
          if (lamp) this.flipLamp(lamp);
        },
        '',
        true,
        // as many a line as the names hold whole, every line as full as the count allows (three: two and one)
        fittedColumns(items, { ruler: this.head.ruler, width: w }, chipCandidates(items.length)),
      )}
    </div>`;
  }

  /** Each light a compact tile, two a row (one where two would leave a tile no room for its name): in its colour. */
  private renderTiles(lamps: readonly Lamp[]): TemplateResult {
    const column = this.tileWidth();
    const two = column < this.contentWidth;
    return html`<div
      class="rm-controls"
      style=${
        two
          ? `--rm-col:${column}px;--rm-gap:${this.contentWidth - 2 * column}px`
          : 'grid-template-columns:minmax(0, 1fr)'
      }
    >
      ${lamps.map((lamp, index) => {
        const colour = lamp.on && lamp.accent ? lamp.accent : lamp.item.color;
        const tile = this.renderTile(
          {
            entity: lamp.view.id,
            ...(lamp.item.name ? { name: lamp.item.name } : {}),
            icon: lamp.glyph,
            ...(colour ? { color: colour } : {}),
          },
          'compact',
          true,
        );
        // an odd last tile takes the whole row: no row is left half empty
        return two && lamps.length % 2 === 1 && index === lamps.length - 1
          ? html`<div class="lt-span">${tile}</div>`
          : tile;
      })}
    </div>`;
  }

  /** An inner tile's column: two on the 4 grid, whole pixels, the remainder between them; one under 120 each. */
  protected override tileWidth(): number {
    const two = Math.floor((this.contentWidth - 8) / 2 / 4) * 4;
    return two >= TILE_MIN ? two : this.contentWidth;
  }

  /** The room's brightness: the average of what is on; a change sets every light that is on (all, when none is). */
  private renderRuler(lamps: readonly Lamp[], name: string, w: number): TemplateResult {
    const level = this.levelOf(lamps);
    const any = level !== null;
    const dead = !lamps.some((lamp) => lamp.usable);
    return html`<div class="lt-ruler">
      <fluvy-ruler
        .value=${level ?? 0}
        .min=${0}
        .max=${100}
        .step=${1}
        .length=${w}
        .tone=${any ? toneOf(this.config, 'light') : 'neutral'}
        ?disabled=${dead}
        ?inactive=${!any}
        ?wake=${!dead}
        unit="%"
        .label=${`${name} · ${this.t('light.brightness')}`}
        .format=${(v: number) => formatNumber(this.hass, v, { digits: 0 })}
        @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => this.setRoom(lamps, e.detail.value)}
      ></fluvy-ruler>
      ${rulerLabels([
        [0, '0'],
        [0.5, '50'],
        [1, '100'],
      ])}
    </div>`;
  }
}
